import { getConfig } from "@/lib/config/env";
import { getDatabase } from "@/lib/db";
import type { FileRecord, UploadSessionRecord } from "@/lib/db/types";
import { describeR2Error, type R2Client } from "@/lib/r2/client";
import {
  getPoolEntry,
  planParts,
  selectStorageForUpload,
  type StorageSelection,
} from "@/lib/r2/storage-manager";
import { buildObjectKey, sanitizeFilename } from "@/lib/security/sanitize";
import { AppError, badRequest, notFound } from "@/lib/utils/assert";
import { categorizeFile } from "@/lib/utils/format";
import { createDownloadId, createId } from "@/lib/utils/id";
import { createLogger } from "@/lib/utils/logger";
import type { UploadInitInput } from "@/lib/api/schemas";

const logger = createLogger("uploads");

export const PRESIGN_TTL_SECONDS = 6 * 60 * 60;

export interface PresignedPart {
  partNumber: number;
  url: string;
  start: number;
  end: number;
  size: number;
  expiresAt: string;
}

export interface UploadInitResult {
  session: UploadSessionRecord;
  partSize: number;
  parts: number;
  presignedParts: PresignedPart[];
  selection: StorageSelection;
  /** Storage name is shown to the admin only (never to public visitors). */
  storage: { id: string; name: string };
  resumed: boolean;
}

function partRanges(size: number, partSize: number, parts: number) {
  return Array.from({ length: parts }, (_, index) => {
    const start = index * partSize;
    const end = Math.min(size, start + partSize) - 1;
    return { partNumber: index + 1, start, end, size: Math.max(0, end - start + 1) };
  });
}

/**
 * Starts (or resumes) an upload.
 *
 * Flow:
 *  1. validate + sanitize the file name
 *  2. let the storage manager pick the best R2 account (auto storage selection)
 *  3. open a multipart upload on that bucket
 *  4. hand the browser pre-signed URLs so bytes travel browser -> R2 directly
 *
 * Because the payload never touches the application runtime, uploads of 5 GB+
 * work without buffering anything in RAM and stay within worker CPU limits.
 */
export async function initUpload(input: UploadInitInput): Promise<UploadInitResult> {
  const db = await getDatabase();
  const config = getConfig();

  if (config.app.demoMode) {
    throw new AppError(
      "demo_mode",
      "DEMO_MODE aktif: upload dinonaktifkan karena tidak ada bucket R2 nyata. Matikan DEMO_MODE untuk menguji upload.",
      { status: 501 },
    );
  }

  const filename = sanitizeFilename(input.filename);
  if (!filename) throw badRequest("invalid_filename", "Nama file tidak valid");

  const size = Number(input.size);
  if (!Number.isFinite(size) || size <= 0) throw badRequest("invalid_size", "Ukuran file tidak valid");

  // ---------------------------------------------------------------- resume path
  if (input.sessionId) {
    const existing = await db.getUploadSession(input.sessionId);
    if (!existing) throw notFound("session_not_found", "Sesi upload tidak ditemukan (mungkin sudah dibersihkan)");
    if (existing.status === "completed") {
      throw badRequest("session_completed", "Sesi upload ini sudah selesai");
    }
    const entry = await getPoolEntry(existing.storageId);
    const plan = planParts(existing.size, existing.partSize);
    const ranges = partRanges(existing.size, plan.partSize, plan.parts);
    const presignedParts = await presignRanges(entry.client, existing.objectKey, existing.uploadId!, ranges);

    await db.updateUploadSession(existing.id, { status: "uploading", error: null, partsTotal: plan.parts });

    return {
      session: { ...existing, status: "uploading", partsTotal: plan.parts },
      partSize: plan.partSize,
      parts: plan.parts,
      presignedParts,
      selection: {
        storageId: existing.storageId,
        storageName: entry.record.name,
        bucket: existing.bucket,
        freeBytes: entry.freeBytes,
        reason: "Melanjutkan sesi upload yang sudah ada",
        forced: true,
        candidates: [],
      },
      storage: { id: entry.record.id, name: entry.record.name },
      resumed: true,
    };
  }

  // ------------------------------------------------------------------ new upload
  const selection = await selectStorageForUpload(size, {
    preferredStorageId: input.preferredStorageId,
  });

  const entry = await getPoolEntry(selection.storageId);
  const plan = planParts(size, input.partSize);
  const sessionId = createId("upl");
  const objectKey = buildObjectKey({
    prefix: config.storage.objectKeyPrefix,
    filename,
    identifier: sessionId.replace("upl_", ""),
  });

  const contentType = (input.contentType || "application/octet-stream").slice(0, 200);
  const uploadId = await entry.client.createMultipartUpload(objectKey, contentType);

  const now = new Date().toISOString();
  const session: UploadSessionRecord = {
    id: sessionId,
    filename,
    size,
    contentType,
    storageId: entry.record.id,
    bucket: entry.record.bucket,
    objectKey,
    uploadId,
    partSize: plan.partSize,
    partsTotal: plan.parts,
    partsUploaded: 0,
    status: "uploading",
    visibility: input.visibility ?? "public",
    fileId: null,
    clientFingerprint: input.fingerprint ?? null,
    error: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };

  await db.createUploadSession(session);

  const ranges = partRanges(size, plan.partSize, plan.parts);
  // Presign the first batch only; the browser asks for more as it progresses so
  // we never generate thousands of signatures up front.
  const initialBatch = ranges.slice(0, Math.max(config.storage.maxConcurrentParts * 2, 6));
  const presignedParts = await presignRanges(entry.client, objectKey, uploadId, initialBatch);

  logger.info("Upload session created", {
    sessionId,
    storage: entry.record.name,
    size,
    parts: plan.parts,
  });

  return {
    session,
    partSize: plan.partSize,
    parts: plan.parts,
    presignedParts,
    selection,
    storage: { id: entry.record.id, name: entry.record.name },
    resumed: false,
  };
}

async function presignRanges(
  client: R2Client,
  objectKey: string,
  uploadId: string,
  ranges: Array<{ partNumber: number; start: number; end: number; size: number }>,
): Promise<PresignedPart[]> {
  const expiresAt = new Date(Date.now() + PRESIGN_TTL_SECONDS * 1000).toISOString();
  const presigned = await Promise.all(
    ranges.map(async (range) => ({
      partNumber: range.partNumber,
      url: await client.presignUploadPart(objectKey, uploadId, range.partNumber, PRESIGN_TTL_SECONDS),
      start: range.start,
      end: range.end,
      size: range.size,
      expiresAt,
    })),
  );
  return presigned;
}

/** Issues (or re-issues) pre-signed URLs for the requested part numbers. */
export async function presignParts(
  sessionId: string,
  partNumbers: number[],
): Promise<{ presignedParts: PresignedPart[]; uploadedParts: Array<{ partNumber: number; etag: string }> }> {
  const db = await getDatabase();
  const session = await db.getUploadSession(sessionId);
  if (!session) throw notFound("session_not_found", "Sesi upload tidak ditemukan");
  if (!session.uploadId) throw badRequest("invalid_session", "Sesi upload tidak memiliki multipart upload id");
  if (session.status === "completed") throw badRequest("session_completed", "Sesi upload sudah selesai");

  const entry = await getPoolEntry(session.storageId);
  const ranges = partRanges(session.size, session.partSize, session.partsTotal).filter((range) =>
    partNumbers.includes(range.partNumber),
  );

  if (ranges.length === 0) {
    throw badRequest("invalid_part_numbers", "Part number di luar rentang file");
  }

  const [presignedParts, listed] = await Promise.all([
    presignRanges(entry.client, session.objectKey, session.uploadId, ranges),
    entry.client.listParts(session.objectKey, session.uploadId).catch(() => ({ parts: [] })),
  ]);

  const uploadedParts = listed.parts.map((part) => ({ partNumber: part.partNumber, etag: part.etag }));
  if (uploadedParts.length !== session.partsUploaded) {
    await db.updateUploadSession(session.id, { partsUploaded: uploadedParts.length });
  }

  return { presignedParts, uploadedParts };
}

/** Returns the parts R2 already received - the backbone of resume support. */
export async function reconcileSession(sessionId: string) {
  const db = await getDatabase();
  const session = await db.getUploadSession(sessionId);
  if (!session) throw notFound("session_not_found", "Sesi upload tidak ditemukan");
  if (!session.uploadId) return { session, uploadedParts: [] as Array<{ partNumber: number; etag: string; size: number }> };

  const entry = await getPoolEntry(session.storageId);
  try {
    const listed = await entry.client.listParts(session.objectKey, session.uploadId);
    await db.updateUploadSession(session.id, { partsUploaded: listed.parts.length });
    return {
      session: { ...session, partsUploaded: listed.parts.length },
      uploadedParts: listed.parts,
    };
  } catch (error) {
    const described = describeR2Error(error);
    logger.warn("ListParts failed", { sessionId, ...described });
    return { session, uploadedParts: [] as Array<{ partNumber: number; etag: string; size: number }> };
  }
}

/** Finalizes a multipart upload and records the file in the database. */
export async function completeUpload(
  sessionId: string,
  parts: Array<{ partNumber: number; etag: string }>,
): Promise<FileRecord> {
  const db = await getDatabase();
  const session = await db.getUploadSession(sessionId);
  if (!session) throw notFound("session_not_found", "Sesi upload tidak ditemukan");
  if (session.status === "completed" && session.fileId) {
    const existing = await db.getFile(session.fileId);
    if (existing) return existing;
  }
  if (!session.uploadId) throw badRequest("invalid_session", "Sesi tidak memiliki multipart upload id");

  const entry = await getPoolEntry(session.storageId);
  const client = entry.client;

  // Trust R2 as the source of truth for what actually arrived.
  let finalParts = parts;
  const listed = await client.listParts(session.objectKey, session.uploadId).catch(() => null);
  if (listed && listed.parts.length > 0) {
    const fromR2 = listed.parts.map((part) => ({ partNumber: part.partNumber, etag: part.etag }));
    finalParts = fromR2.length >= finalParts.length ? fromR2 : finalParts;
  }

  if (finalParts.length === 0) {
    throw badRequest("no_parts_uploaded", "Belum ada bagian file yang terupload");
  }

  const completed = await client.completeMultipartUpload(session.objectKey, session.uploadId, finalParts);

  const metadata = await client.headObject(session.objectKey).catch(() => null);
  const actualSize = metadata?.size ?? session.size;

  if (metadata && actualSize !== session.size) {
    logger.warn("Uploaded size differs from declared size", {
      sessionId,
      declared: session.size,
      actual: actualSize,
    });
  }

  const file = await registerFile({
    session,
    size: actualSize,
    etag: completed.etag || metadata?.etag || null,
    visibility: session.visibility ?? "public",
  });

  await db.updateUploadSession(session.id, {
    status: "completed",
    completedAt: new Date().toISOString(),
    partsUploaded: finalParts.length,
    fileId: file.id,
  });

  await db.updateStorage(entry.record.id, {
    usedBytes: Math.max(0, entry.record.usedBytes + actualSize),
    lastCheckedAt: new Date().toISOString(),
  });

  // Housekeeping keeps the sessions table small.
  db.pruneUploadSessions(7 * 24 * 60 * 60 * 1000).catch(() => undefined);

  return file;
}

export interface RegisterFileInput {
  session: UploadSessionRecord;
  size: number;
  etag: string | null;
  visibility: FileRecord["visibility"];
}

async function registerFile(input: RegisterFileInput): Promise<FileRecord> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const { session } = input;

  // Retry a few times in the (very unlikely) event of a download id collision.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const downloadId = createDownloadId(10);
    const existing = await db.getFileByDownloadId(downloadId);
    if (existing) continue;

    const file: FileRecord = {
      id: createId("file"),
      downloadId,
      filename: session.filename,
      originalName: session.filename,
      size: input.size,
      contentType: session.contentType || "application/octet-stream",
      category: categorizeFile(session.filename, session.contentType),
      storageId: session.storageId,
      bucket: session.bucket,
      objectKey: session.objectKey,
      etag: input.etag,
      downloadCount: 0,
      visibility: input.visibility,
      createdAt: now,
      updatedAt: now,
    };

    try {
      return await db.createFile(file);
    } catch (error) {
      logger.warn("Failed to persist file record, retrying with a new download id", {
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new AppError("file_persist_failed", "Gagal menyimpan metadata file ke database", { status: 500 });
}

/** Aborts the multipart upload on R2 and drops the session. */
export async function abortUpload(sessionId: string): Promise<{ aborted: boolean }> {
  const db = await getDatabase();
  const session = await db.getUploadSession(sessionId);
  if (!session) return { aborted: false };

  if (session.uploadId) {
    try {
      const entry = await getPoolEntry(session.storageId);
      await entry.client.abortMultipartUpload(session.objectKey, session.uploadId);
    } catch (error) {
      logger.warn("AbortMultipartUpload failed", {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await db.updateUploadSession(session.id, { status: "aborted" });
  await db.deleteUploadSession(session.id);
  return { aborted: true };
}

export interface ResumableSession extends UploadSessionRecord {
  storageName: string;
  uploadedParts: number;
}

/** Lists in-progress sessions so the dashboard can offer "continue upload". */
export async function listResumableSessions(): Promise<ResumableSession[]> {
  const db = await getDatabase();
  const sessions = await db.listUploadSessions({
    status: ["pending", "uploading", "paused", "failed"],
    limit: 25,
  });
  const storages = await db.listStorages();
  const nameById = new Map(storages.map((storage) => [storage.id, storage.name]));

  return sessions.map((session) => ({
    ...session,
    storageName: nameById.get(session.storageId) ?? "Storage tidak dikenal",
    uploadedParts: session.partsUploaded,
  }));
}
