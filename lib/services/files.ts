import { getConfig } from "@/lib/config/env";
import { getDatabase } from "@/lib/db";
import type { FileRecord, FileSortField, Paginated, SortDirection } from "@/lib/db/types";
import { describeR2Error } from "@/lib/r2/client";
import { buildClient, getPoolEntry, planParts } from "@/lib/r2/storage-manager";
import type { ListQueryInput } from "@/lib/api/schemas";
import { buildObjectKey, sanitizeFilename, sanitizeSearchTerm } from "@/lib/security/sanitize";
import { AppError, badRequest, notFound } from "@/lib/utils/assert";
import { formatBytes } from "@/lib/utils/format";
import { createId } from "@/lib/utils/id";
import { createLogger } from "@/lib/utils/logger";

const logger = createLogger("files");

export interface AdminFileView extends FileRecord {
  storageName: string;
  storageStatus: string;
}

export async function listAdminFiles(query: ListQueryInput): Promise<Paginated<AdminFileView>> {
  const db = await getDatabase();
  const limit = Math.min(200, Math.max(1, query.limit ?? 25));
  const page = Math.max(1, query.page ?? 1);
  const offset = query.offset ?? (page - 1) * limit;

  const [result, storages] = await Promise.all([
    db.listFiles({
      search: sanitizeSearchTerm(query.q ?? ""),
      storageId: query.storageId || undefined,
      category: query.category || undefined,
      visibility: query.visibility,
      sort: (query.sort ?? "createdAt") as FileSortField,
      direction: (query.direction ?? "desc") as SortDirection,
      limit,
      offset,
    }),
    db.listStorages(),
  ]);

  const nameById = new Map(storages.map((storage) => [storage.id, storage.name]));
  const statusById = new Map(storages.map((storage) => [storage.id, storage.status]));

  return {
    ...result,
    limit,
    offset,
    items: result.items.map((file) => ({
      ...file,
      storageName: nameById.get(file.storageId) ?? "Storage dihapus",
      storageStatus: statusById.get(file.storageId) ?? "unknown",
    })),
  };
}

export async function getAdminFile(id: string): Promise<AdminFileView> {
  const db = await getDatabase();
  const file = await db.getFile(id);
  if (!file) throw notFound("file_not_found", "File tidak ditemukan");
  const storage = await db.getStorage(file.storageId);
  return {
    ...file,
    storageName: storage?.name ?? "Storage dihapus",
    storageStatus: storage?.status ?? "unknown",
  };
}

export async function renameFile(id: string, rawFilename: string): Promise<AdminFileView> {
  const filename = sanitizeFilename(rawFilename);
  if (!filename) throw badRequest("invalid_filename", "Nama file tidak valid");
  const db = await getDatabase();
  const updated = await db.updateFile(id, { filename });
  if (!updated) throw notFound("file_not_found", "File tidak ditemukan");
  return getAdminFile(updated.id);
}

export async function setFileVisibility(
  id: string,
  visibility: FileRecord["visibility"],
): Promise<AdminFileView> {
  const db = await getDatabase();
  const updated = await db.updateFile(id, { visibility });
  if (!updated) throw notFound("file_not_found", "File tidak ditemukan");
  return getAdminFile(updated.id);
}

/**
 * Deletes a file. The object in R2 is removed as well (unless `keepObject`),
 * and the storage usage counter is corrected.
 */
export async function deleteFile(
  id: string,
  options: { keepObject?: boolean } = {},
): Promise<{ deleted: boolean; objectDeleted: boolean; freedBytes: number }> {
  const db = await getDatabase();
  const file = await db.getFile(id);
  if (!file) throw notFound("file_not_found", "File tidak ditemukan");

  let objectDeleted = false;
  if (!options.keepObject && !getConfig().app.demoMode) {
    try {
      const storage = await db.getStorage(file.storageId);
      if (storage) {
        const client = await buildClient(storage);
        await client.deleteObject(file.objectKey);
        objectDeleted = true;
      }
    } catch (error) {
      const described = describeR2Error(error);
      logger.warn("Failed to delete object from R2", { fileId: id, ...described });
      if (described.code !== "NoSuchKey" && described.status !== 404) {
        throw new AppError(
          "delete_failed",
          `Metadata dapat dihapus tetapi objek di R2 gagal dihapus: ${described.message}`,
          { status: 502, details: described },
        );
      }
      objectDeleted = true; // nothing left to delete
    }
  } else {
    objectDeleted = Boolean(options.keepObject);
  }

  await db.deleteFile(id);

  const storage = await db.getStorage(file.storageId);
  if (storage) {
    await db.updateStorage(storage.id, {
      usedBytes: Math.max(0, storage.usedBytes - file.size),
    });
  }

  return { deleted: true, objectDeleted, freedBytes: file.size };
}

// ------------------------------------------------------------------- move jobs

export type MoveJobStatus = "running" | "completed" | "failed" | "canceled";

export interface MoveJob {
  id: string;
  fileId: string;
  filename: string;
  size: number;
  sourceStorageId: string;
  sourceStorageName: string;
  targetStorageId: string;
  targetStorageName: string;
  targetObjectKey: string;
  targetUploadId: string;
  partSize: number;
  partsTotal: number;
  partsDone: number;
  bytesCopied: number;
  parts: Array<{ partNumber: number; etag: string }>;
  deleteSource: boolean;
  status: MoveJobStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

const MOVE_TTL_SECONDS = 24 * 60 * 60;

function moveKey(jobId: string): string {
  return `move:${jobId}`;
}

async function readJob(jobId: string): Promise<MoveJob | null> {
  const db = await getDatabase();
  const raw = await db.getState(moveKey(jobId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MoveJob;
  } catch {
    return null;
  }
}

async function writeJob(job: MoveJob): Promise<void> {
  const db = await getDatabase();
  await db.setState(moveKey(job.id), JSON.stringify(job), MOVE_TTL_SECONDS);
}

export interface MoveJobProgress {
  jobId: string;
  status: MoveJobStatus;
  bytesCopied: number;
  size: number;
  partsDone: number;
  partsTotal: number;
  percent: number;
  completed: boolean;
  error: string | null;
  file?: AdminFileView;
}

function toProgress(job: MoveJob, file?: AdminFileView): MoveJobProgress {
  return {
    jobId: job.id,
    status: job.status,
    bytesCopied: job.bytesCopied,
    size: job.size,
    partsDone: job.partsDone,
    partsTotal: job.partsTotal,
    percent: job.size > 0 ? Math.round((job.bytesCopied / job.size) * 1000) / 10 : 0,
    completed: job.status === "completed",
    error: job.error,
    ...(file ? { file } : {}),
  };
}

/**
 * Starts a cross-account move (server side copy).
 *
 * S3 copy does not work between different Cloudflare accounts, so the object is
 * streamed chunk by chunk: read a byte range from the source bucket, write it as
 * a multipart part into the target bucket. Only one part is held in memory at a
 * time and the client drives the job in small steps, which keeps every request
 * short enough for serverless/worker CPU limits.
 */
export async function startMoveJob(
  fileId: string,
  targetStorageId: string,
  options: { deleteSource?: boolean } = {},
): Promise<MoveJobProgress> {
  const db = await getDatabase();
  const file = await db.getFile(fileId);
  if (!file) throw notFound("file_not_found", "File tidak ditemukan");
  if (file.storageId === targetStorageId) {
    throw badRequest("same_storage", "File sudah berada di storage tujuan");
  }

  const [source, target] = await Promise.all([
    db.getStorage(file.storageId),
    db.getStorage(targetStorageId),
  ]);
  if (!source) throw notFound("storage_not_found", "Storage asal tidak ditemukan");
  if (!target) throw notFound("storage_not_found", "Storage tujuan tidak ditemukan");
  if (target.status !== "active") {
    throw badRequest("target_inactive", `Storage tujuan berstatus ${target.status}`);
  }

  const targetFree = Math.max(0, target.limitBytes - target.usedBytes);
  if (target.limitBytes > 0 && targetFree < file.size) {
    throw new AppError(
      "insufficient_space",
      `Storage ${target.name} hanya memiliki sisa ${formatBytes(targetFree)}, sedangkan file berukuran ${formatBytes(file.size)}.`,
      { status: 507 },
    );
  }

  const targetClient = await buildClient(target);
  const plan = planParts(file.size);
  const targetObjectKey = buildObjectKey({
    prefix: getConfig().storage.objectKeyPrefix,
    filename: file.filename,
    identifier: createId("mv").replace("mv_", ""),
  });
  const targetUploadId = await targetClient.createMultipartUpload(targetObjectKey, file.contentType);

  const now = new Date().toISOString();
  const job: MoveJob = {
    id: createId("job"),
    fileId: file.id,
    filename: file.filename,
    size: file.size,
    sourceStorageId: source.id,
    sourceStorageName: source.name,
    targetStorageId: target.id,
    targetStorageName: target.name,
    targetObjectKey,
    targetUploadId,
    partSize: plan.partSize,
    partsTotal: plan.parts,
    partsDone: 0,
    bytesCopied: 0,
    parts: [],
    deleteSource: options.deleteSource ?? true,
    status: "running",
    error: null,
    createdAt: now,
    updatedAt: now,
  };

  await writeJob(job);
  return toProgress(job);
}

/** Copies up to `byteBudget` bytes of a move job and returns the new progress. */
export async function advanceMoveJob(jobId: string, byteBudget = 48 * 1024 * 1024): Promise<MoveJobProgress> {
  const db = await getDatabase();
  const job = await readJob(jobId);
  if (!job) throw notFound("job_not_found", "Job pemindahan tidak ditemukan atau sudah kedaluwarsa");
  if (job.status === "completed") return toProgress(job);
  if (job.status === "canceled") throw badRequest("job_canceled", "Job sudah dibatalkan");

  const [sourceStorage, targetStorage] = await Promise.all([
    db.getStorage(job.sourceStorageId),
    db.getStorage(job.targetStorageId),
  ]);
  if (!sourceStorage || !targetStorage) {
    throw notFound("storage_not_found", "Storage asal/tujuan tidak ditemukan");
  }

  const file = await db.getFile(job.fileId);
  if (!file) throw notFound("file_not_found", "File sudah dihapus sebelum pemindahan selesai");

  const sourceClient = await buildClient(sourceStorage);
  const targetClient = await buildClient(targetStorage);

  job.status = "running";
  let copiedThisCall = 0;

  try {
    while (job.bytesCopied < job.size && copiedThisCall < byteBudget) {
      const partNumber = job.partsDone + 1;
      const start = job.partsDone * job.partSize;
      const end = Math.min(job.size, start + job.partSize) - 1;

      const chunk = await sourceClient.getObject(file.objectKey, {
        rangeStart: start,
        rangeEnd: end,
      });
      const buffer = new Uint8Array(await chunk.arrayBuffer());
      const uploaded = await targetClient.uploadPart(
        job.targetObjectKey,
        job.targetUploadId,
        partNumber,
        buffer,
      );

      job.parts.push({ partNumber: uploaded.partNumber, etag: uploaded.etag });
      job.partsDone += 1;
      job.bytesCopied += buffer.byteLength;
      copiedThisCall += buffer.byteLength;
      job.updatedAt = new Date().toISOString();
      await writeJob(job);
    }

    if (job.bytesCopied >= job.size) {
      await targetClient.completeMultipartUpload(job.targetObjectKey, job.targetUploadId, job.parts);

      await db.updateFile(file.id, {
        storageId: job.targetStorageId,
        bucket: targetStorage.bucket,
        objectKey: job.targetObjectKey,
      });

      await Promise.all([
        db.updateStorage(job.targetStorageId, {
          usedBytes: targetStorage.usedBytes + file.size,
          lastCheckedAt: new Date().toISOString(),
        }),
        db.updateStorage(job.sourceStorageId, {
          usedBytes: Math.max(0, sourceStorage.usedBytes - file.size),
        }),
      ]);

      if (job.deleteSource) {
        await sourceClient.deleteObject(file.objectKey).catch((error) => {
          logger.warn("Failed to delete source object after move", {
            jobId: job.id,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }

      job.status = "completed";
      job.updatedAt = new Date().toISOString();
      await writeJob(job);

      const view = await getAdminFile(file.id);
      return toProgress(job, view);
    }

    return toProgress(job);
  } catch (error) {
    const described = describeR2Error(error);
    job.status = "failed";
    job.error = described.message;
    job.updatedAt = new Date().toISOString();
    await writeJob(job).catch(() => undefined);
    logger.error("Move job failed", { jobId, ...described });
    throw new AppError("move_failed", described.message, { status: 502, details: described });
  }
}

export async function cancelMoveJob(jobId: string): Promise<MoveJobProgress> {
  const db = await getDatabase();
  const job = await readJob(jobId);
  if (!job) throw notFound("job_not_found", "Job tidak ditemukan");

  const target = await db.getStorage(job.targetStorageId);
  if (target) {
    const client = await buildClient(target);
    await client.abortMultipartUpload(job.targetObjectKey, job.targetUploadId).catch(() => undefined);
  }

  job.status = "canceled";
  job.updatedAt = new Date().toISOString();
  await writeJob(job);
  await db.deleteState(moveKey(jobId));
  return toProgress(job);
}

export async function getMoveJob(jobId: string): Promise<MoveJobProgress> {
  const job = await readJob(jobId);
  if (!job) throw notFound("job_not_found", "Job tidak ditemukan");
  return toProgress(job);
}

/** Refreshes the cached `usedBytes` of a storage by scanning the real bucket. */
export async function syncStorageUsage(storageId: string): Promise<{
  usedBytes: number;
  objects: number;
  truncated: boolean;
  source: "r2" | "database";
}> {
  const db = await getDatabase();
  const storage = await db.getStorage(storageId);
  if (!storage) throw notFound("storage_not_found", "Storage tidak ditemukan");

  if (getConfig().app.demoMode) {
    return { usedBytes: storage.usedBytes, objects: 0, truncated: false, source: "database" };
  }

  const entry = await getPoolEntry(storageId);
  const measurement = await entry.client.measureUsage({ maxPages: 100 });

  await db.updateStorage(storageId, {
    usedBytes: measurement.bytes,
    lastCheckedAt: new Date().toISOString(),
    lastError: null,
  });

  return {
    usedBytes: measurement.bytes,
    objects: measurement.objects,
    truncated: measurement.truncated,
    source: "r2",
  };
}
