"use client";

import { apiFetch, ApiClientError, errorMessage } from "@/lib/client/api";
import type { PresignedPart, UploadInitResponse } from "@/lib/client/types";
import {
  fileFingerprint,
  idbDelete,
  idbGetAll,
  idbPut,
  type StoredUploadItem,
} from "@/lib/upload/idb";

/**
 * Browser side multipart upload engine.
 *
 * Bytes travel straight from the browser to Cloudflare R2 through pre-signed
 * URLs. The engine only talks to the application to (1) open a multipart upload
 * and pick a storage, (2) request fresh part URLs, and (3) finalize the upload.
 *
 * Guarantees:
 *  - constant memory usage (one part per in-flight request, sliced from the File)
 *  - automatic retry with exponential backoff + jitter
 *  - pause / resume / cancel per file and for the whole queue
 *  - resume across page reloads (IndexedDB + server side ListParts)
 */

export type UploadItemStatus =
  | "queued"
  | "starting"
  | "uploading"
  | "paused"
  | "completing"
  | "completed"
  | "error"
  | "canceled";

export interface UploadItem {
  id: string;
  filename: string;
  size: number;
  contentType: string;
  visibility: "public" | "private";
  preferredStorageId?: string | null;
  sessionId: string | null;
  partSize: number;
  partsTotal: number;
  uploadedParts: Array<{ partNumber: number; etag: string }>;
  bytesUploaded: number;
  bytesPerSecond: number;
  status: UploadItemStatus;
  error: string | null;
  attempts: number;
  storageName: string | null;
  selectionReason: string | null;
  downloadUrl: string | null;
  addedAt: number;
  updatedAt: number;
  file?: File;
  lastModified?: number;
}

export interface UploadManagerSettings {
  fileConcurrency: number;
  partConcurrency: number;
  partSizeMb: number;
  autoStart: boolean;
}

export const DEFAULT_SETTINGS: UploadManagerSettings = {
  fileConcurrency: 2,
  partConcurrency: 3,
  partSizeMb: 8,
  autoStart: true,
};

const MAX_PART_RETRIES = 6;

interface PartSlot extends PresignedPart {
  attempts: number;
  inFlight: boolean;
  etag?: string;
}

type Listener = () => void;

export class UploadManager {
  private items = new Map<string, UploadItem>();
  private order: string[] = [];
  private slots = new Map<string, Map<number, PartSlot>>();
  private xhrs = new Map<string, Set<XMLHttpRequest>>();
  private listeners = new Set<Listener>();
  private settings: UploadManagerSettings;
  private speeds = new Map<string, Array<{ at: number; bytes: number }>>();
  /** Per item, per part bytes currently in flight (so parallel parts add up). */
  private inFlightBytes = new Map<string, Map<number, number>>();
  private running = false;

  constructor(settings: Partial<UploadManagerSettings> = {}) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }

  getSettings(): UploadManagerSettings {
    return { ...this.settings };
  }

  updateSettings(patch: Partial<UploadManagerSettings>): void {
    this.settings = { ...this.settings, ...patch };
    this.emit();
    void this.pump();
  }

  list(): UploadItem[] {
    return this.order.map((id) => this.items.get(id)!).filter(Boolean);
  }

  stats(): {
    total: number;
    active: number;
    queued: number;
    completed: number;
    failed: number;
    bytesUploaded: number;
    bytesTotal: number;
    bytesPerSecond: number;
  } {
    const items = this.list();
    const active = items.filter((item) => ["starting", "uploading", "completing"].includes(item.status));
    return {
      total: items.length,
      active: active.length,
      queued: items.filter((item) => item.status === "queued").length,
      completed: items.filter((item) => item.status === "completed").length,
      failed: items.filter((item) => ["error", "canceled"].includes(item.status)).length,
      bytesUploaded: items.reduce((sum, item) => sum + item.bytesUploaded, 0),
      bytesTotal: items.reduce((sum, item) => sum + item.size, 0),
      bytesPerSecond: active.reduce((sum, item) => sum + item.bytesPerSecond, 0),
    };
  }

  // -------------------------------------------------------------------- queue

  async addFiles(
    files: File[],
    options: { visibility?: "public" | "private"; preferredStorageId?: string | null } = {},
  ): Promise<number> {
    let added = 0;
    for (const file of files) {
      if (file.size === 0) continue;
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
      const now = Date.now();
      const item: UploadItem = {
        id,
        filename: file.name,
        size: file.size,
        contentType: file.type || "application/octet-stream",
        visibility: options.visibility ?? "public",
        preferredStorageId: options.preferredStorageId ?? null,
        sessionId: null,
        partSize: this.settings.partSizeMb * 1024 * 1024,
        partsTotal: 0,
        uploadedParts: [],
        bytesUploaded: 0,
        bytesPerSecond: 0,
        status: "queued",
        error: null,
        attempts: 0,
        storageName: null,
        selectionReason: null,
        downloadUrl: null,
        addedAt: now,
        updatedAt: now,
        file,
        lastModified: file.lastModified,
      };
      this.items.set(id, item);
      this.order.unshift(id);
      added += 1;
      await this.persist(item);
    }
    this.emit();
    if (this.settings.autoStart) void this.pump();
    return added;
  }

  /** Restores the local queue from IndexedDB (after a reload). */
  async restore(): Promise<number> {
    const stored = await idbGetAll();
    if (stored.length === 0) return 0;

    for (const entry of stored.sort((a, b) => b.addedAt - a.addedAt)) {
      if (this.items.has(entry.id)) continue;
      const item: UploadItem = {
        id: entry.id,
        filename: entry.filename,
        size: entry.size,
        contentType: entry.contentType,
        visibility: entry.visibility,
        preferredStorageId: entry.preferredStorageId ?? null,
        sessionId: entry.sessionId ?? null,
        partSize: entry.partSize ?? this.settings.partSizeMb * 1024 * 1024,
        partsTotal: entry.partsTotal ?? 0,
        uploadedParts: entry.uploadedParts ?? [],
        bytesUploaded: entry.bytesUploaded ?? 0,
        bytesPerSecond: 0,
        status:
          entry.status === "completed"
            ? "completed"
            : entry.status === "canceled"
              ? "canceled"
              : entry.status === "error"
                ? "error"
                : "paused",
        error: entry.error ?? null,
        attempts: 0,
        storageName: entry.storageName ?? null,
        selectionReason: null,
        downloadUrl: entry.downloadUrl ?? null,
        addedAt: entry.addedAt,
        updatedAt: entry.updatedAt,
        ...(entry.file ? { file: entry.file } : {}),
        ...(entry.lastModified ? { lastModified: entry.lastModified } : {}),
      };
      this.items.set(item.id, item);
      this.order.push(item.id);
    }
    this.emit();
    return stored.length;
  }

  /** Pulls in-progress sessions from the server and merges them into the queue. */
  async reconcileWithServer(): Promise<number> {
    interface ResumableResponse {
      sessions: Array<{
        id: string;
        filename: string;
        size: number;
        partSize: number;
        partsTotal: number;
        partsUploaded: number;
        status: string;
        storageName: string;
        fingerprint: string | null;
        updatedAt: string;
      }>;
    }

    let payload: ResumableResponse;
    try {
      payload = await apiFetch<ResumableResponse>("/api/admin/uploads/resumable", { skipCsrf: true });
    } catch {
      return 0;
    }

    let merged = 0;
    for (const session of payload.sessions) {
      const fingerprint = session.fingerprint;
      const localMatch = this.list().find((item) => {
        if (item.sessionId === session.id) return true;
        if (!fingerprint || !item.file) return false;
        return (
          fileFingerprint(item.filename, item.size, item.file.lastModified ?? item.lastModified ?? 0) ===
          fingerprint
        );
      });

      if (localMatch) {
        localMatch.sessionId = session.id;
        localMatch.partSize = session.partSize || localMatch.partSize;
        localMatch.partsTotal = session.partsTotal || localMatch.partsTotal;
        localMatch.storageName = session.storageName;
        if (localMatch.status === "error") localMatch.status = "paused";
        merged += 1;
        await this.persist(localMatch);
        continue;
      }

      // Session known to the server but the local file reference is gone: show it
      // so the operator can re-attach the same file and continue.
      const id = `srv-${session.id}`;
      if (this.items.has(id)) continue;
      const item: UploadItem = {
        id,
        filename: session.filename,
        size: session.size,
        contentType: "application/octet-stream",
        visibility: "public",
        sessionId: session.id,
        partSize: session.partSize,
        partsTotal: session.partsTotal,
        uploadedParts: [],
        bytesUploaded: Math.min(session.size, session.partsUploaded * session.partSize),
        bytesPerSecond: 0,
        status: "paused",
        error: "Pilih ulang file yang sama untuk melanjutkan sesi ini",
        attempts: 0,
        storageName: session.storageName,
        selectionReason: null,
        downloadUrl: null,
        addedAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.items.set(id, item);
      this.order.unshift(id);
      merged += 1;
    }

    this.emit();
    return merged;
  }

  /** Attaches a freshly selected File to a server-known session. */
  async attachFile(itemId: string, file: File): Promise<boolean> {
    const item = this.items.get(itemId);
    if (!item) return false;
    item.file = file;
    item.lastModified = file.lastModified;
    item.size = file.size;
    item.filename = file.name;
    item.contentType = file.type || item.contentType;
    item.error = null;
    item.status = "queued";
    await this.persist(item);
    this.emit();
    void this.pump();
    return true;
  }

  // ---------------------------------------------------------------- controls

  pause(id: string): void {
    const item = this.items.get(id);
    if (!item || !["queued", "starting", "uploading", "completing"].includes(item.status)) return;
    item.status = "paused";
    item.bytesPerSecond = 0;
    this.abortInflight(id);
    void this.persist(item);
    this.emit();
    void this.pump();
  }

  resume(id: string): void {
    const item = this.items.get(id);
    if (!item || !["paused", "error"].includes(item.status)) return;
    item.status = "queued";
    item.error = null;
    void this.persist(item);
    this.emit();
    void this.pump();
  }

  async cancel(id: string): Promise<void> {
    const item = this.items.get(id);
    if (!item) return;
    this.abortInflight(id);
    if (item.sessionId && item.status !== "completed") {
      await apiFetch(`/api/admin/uploads/${item.sessionId}`, { method: "DELETE" }).catch(() => undefined);
    }
    item.status = "canceled";
    item.bytesPerSecond = 0;
    this.slots.delete(id);
    await this.persist(item);
    await idbDelete(id);
    this.emit();
    void this.pump();
  }

  pauseAll(): void {
    for (const item of this.list()) {
      if (["queued", "starting", "uploading", "completing"].includes(item.status)) this.pause(item.id);
    }
  }

  resumeAll(): void {
    for (const item of this.list()) {
      if (["paused", "error"].includes(item.status)) this.resume(item.id);
    }
  }

  async clearFinished(): Promise<void> {
    for (const item of this.list()) {
      if (["completed", "canceled"].includes(item.status)) {
        this.items.delete(item.id);
        this.order = this.order.filter((entry) => entry !== item.id);
        this.slots.delete(item.id);
        await idbDelete(item.id);
      }
    }
    this.emit();
  }

  async remove(id: string): Promise<void> {
    this.abortInflight(id);
    this.items.delete(id);
    this.order = this.order.filter((entry) => entry !== id);
    this.slots.delete(id);
    await idbDelete(id);
    this.emit();
    void this.pump();
  }

  // ------------------------------------------------------------------- engine

  private abortInflight(id: string): void {
    const set = this.xhrs.get(id);
    if (!set) return;
    set.forEach((xhr) => {
      try {
        xhr.abort();
      } catch {
        /* already finished */
      }
    });
    set.clear();
  }

  private activeCount(): number {
    return this.list().filter((item) => ["starting", "uploading", "completing"].includes(item.status)).length;
  }

  /** Starts queued items while respecting the file level concurrency limit. */
  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const item of this.list()) {
        if (this.activeCount() >= this.settings.fileConcurrency) break;
        if (item.status !== "queued") continue;
        item.status = "starting";
        this.emit();
        void this.process(item).catch(async (error) => {
          item.status = "error";
          item.error = errorMessage(error);
          item.bytesPerSecond = 0;
          await this.persist(item);
          this.emit();
          this.running = false;
          void this.pump();
        });
      }
    } finally {
      this.running = false;
    }
  }

  private async process(item: UploadItem): Promise<void> {
    if (!item.file) {
      item.status = "error";
      item.error = "File tidak tersedia di antrean lokal. Pilih ulang file untuk melanjutkan.";
      await this.persist(item);
      this.emit();
      return;
    }

    if (!item.sessionId) {
      const init = await this.openSession(item);
      item.sessionId = init.sessionId;
      item.partSize = init.partSize;
      item.partsTotal = init.parts;
      item.storageName = init.storage.name;
      item.selectionReason = init.selection.reason;
      this.setSlots(item.id, init.presignedParts);
      const uploaded = new Set(item.uploadedParts.map((part) => part.partNumber));
      for (const part of init.presignedParts) {
        if (uploaded.has(part.partNumber)) {
          const slot = this.slots.get(item.id)?.get(part.partNumber);
          if (slot) slot.etag = item.uploadedParts.find((entry) => entry.partNumber === part.partNumber)?.etag;
        }
      }
    } else if (!this.slots.has(item.id) || this.slots.get(item.id)!.size === 0) {
      const numbers = this.pendingPartNumbers(item).slice(0, this.settings.partConcurrency * 2);
      if (numbers.length > 0) {
        const fresh = await this.fetchUrls(item.sessionId, numbers);
        this.setSlots(item.id, fresh.presignedParts);
        this.mergeUploadedParts(item, fresh.uploadedParts);
      }
    }

    item.status = "uploading";
    this.emit();
    await this.persist(item);

    await this.uploadParts(item);

    // The status can change while parts are in flight (pause/cancel), and
    // TypeScript cannot know that, so read it through a widened local.
    const statusAfterParts: UploadItemStatus = item.status;
    if (statusAfterParts !== "uploading") return;

    item.status = "completing";
    item.bytesPerSecond = 0;
    this.emit();

    const result = await apiFetch<{ downloadPath: string; file: { downloadId: string } }>(
      "/api/admin/uploads/complete",
      {
        method: "POST",
        body: {
          sessionId: item.sessionId,
          parts: item.uploadedParts.map((part) => ({ partNumber: part.partNumber, etag: part.etag })),
        },
      },
    );

    item.status = "completed";
    item.bytesUploaded = item.size;
    item.downloadUrl = result.downloadPath;
    item.error = null;
    this.slots.delete(item.id);
    this.inFlightBytes.delete(item.id);
    await this.persist(item);
    this.emit();
    void this.pump();
  }

  private async openSession(item: UploadItem): Promise<UploadInitResponse> {
    return apiFetch<UploadInitResponse>("/api/admin/uploads/init", {
      method: "POST",
      body: {
        filename: item.filename,
        size: item.size,
        contentType: item.contentType,
        partSize: this.settings.partSizeMb * 1024 * 1024,
        visibility: item.visibility,
        ...(item.preferredStorageId ? { preferredStorageId: item.preferredStorageId } : {}),
        ...(item.sessionId ? { sessionId: item.sessionId } : {}),
        fingerprint: item.file
          ? fileFingerprint(item.filename, item.size, item.file.lastModified ?? item.lastModified ?? 0)
          : undefined,
      },
    });
  }

  private setSlots(itemId: string, parts: PresignedPart[]): void {
    const existing = this.slots.get(itemId) ?? new Map<number, PartSlot>();
    for (const part of parts) {
      const current = existing.get(part.partNumber);
      existing.set(part.partNumber, {
        ...part,
        attempts: current?.attempts ?? 0,
        inFlight: false,
        ...(current?.etag ? { etag: current.etag } : {}),
      });
    }
    this.slots.set(itemId, existing);
  }

  private mergeUploadedParts(
    item: UploadItem,
    uploaded: Array<{ partNumber: number; etag: string }>,
  ): void {
    if (!uploaded || uploaded.length === 0) return;
    const map = new Map(item.uploadedParts.map((part) => [part.partNumber, part.etag]));
    for (const part of uploaded) map.set(part.partNumber, part.etag);
    item.uploadedParts = [...map.entries()]
      .map(([partNumber, etag]) => ({ partNumber, etag }))
      .sort((a, b) => a.partNumber - b.partNumber);
    item.bytesUploaded = this.recomputeBytes(item);
  }

  private recomputeBytes(item: UploadItem): number {
    const uploaded = new Set(item.uploadedParts.map((part) => part.partNumber));
    if (uploaded.size === 0) return 0;
    if (item.partsTotal > 0 && uploaded.size >= item.partsTotal) return item.size;
    const full = Math.max(0, uploaded.size - 1) * item.partSize;
    const lastPartIsUploaded = uploaded.has(item.partsTotal);
    if (lastPartIsUploaded) {
      const remainder = item.size % item.partSize;
      return full + (remainder === 0 ? item.partSize : remainder);
    }
    return Math.min(item.size, full);
  }

  private pendingPartNumbers(item: UploadItem): number[] {
    const uploaded = new Set(item.uploadedParts.map((part) => part.partNumber));
    const slots = this.slots.get(item.id);
    const numbers: number[] = [];
    for (let partNumber = 1; partNumber <= item.partsTotal; partNumber += 1) {
      if (uploaded.has(partNumber)) continue;
      const slot = slots?.get(partNumber);
      if (slot && slot.etag) continue;
      numbers.push(partNumber);
    }
    return numbers;
  }

  private async fetchUrls(sessionId: string, partNumbers: number[]) {
    return apiFetch<{ presignedParts: PresignedPart[]; uploadedParts: Array<{ partNumber: number; etag: string }> }>(
      "/api/admin/uploads/parts",
      { method: "POST", body: { sessionId, partNumbers } },
    );
  }

  private async uploadParts(item: UploadItem): Promise<void> {
    this.speeds.set(item.id, [{ at: Date.now(), bytes: item.bytesUploaded }]);

    while (item.status === "uploading") {
      if (item.uploadedParts.length >= item.partsTotal && item.partsTotal > 0) return;

      const pending = this.pendingPartNumbers(item);
      if (pending.length === 0) {
        // Every part has a URL slot; wait for the in-flight requests to settle.
        const inFlight = this.countInFlight(item.id);
        if (inFlight === 0) return;
        await sleep(120);
        continue;
      }

      const slots = this.slots.get(item.id)!;
      const ready = pending.filter((partNumber) => slots.has(partNumber) && !slots.get(partNumber)!.inFlight);

      if (ready.length === 0) {
        const missing = pending.slice(0, this.settings.partConcurrency * 2);
        try {
          const fresh = await this.fetchUrls(item.sessionId!, missing);
          this.setSlots(item.id, fresh.presignedParts);
          this.mergeUploadedParts(item, fresh.uploadedParts);
        } catch (error) {
          item.status = "error";
          item.error = errorMessage(error);
          await this.persist(item);
          this.emit();
          return;
        }
        continue;
      }

      const inFlight = this.countInFlight(item.id);
      const capacity = Math.max(0, this.settings.partConcurrency - inFlight);
      if (capacity === 0) {
        await sleep(120);
        continue;
      }

      for (const partNumber of ready.slice(0, capacity)) {
        const slot = slots.get(partNumber)!;
        slot.inFlight = true;
        void this.uploadOnePart(item, slot);
      }

      await sleep(80);
    }
  }

  private countInFlight(itemId: string): number {
    const slots = this.slots.get(itemId);
    if (!slots) return 0;
    let count = 0;
    slots.forEach((slot) => {
      if (slot.inFlight) count += 1;
    });
    return count;
  }

  private async uploadOnePart(item: UploadItem, slot: PartSlot): Promise<void> {
    const file = item.file!;
    const blob = file.slice(slot.start, slot.end + 1);
    const buffer = await blob.arrayBuffer();

    try {
      const etag = await this.putPart(item, slot, buffer);
      slot.etag = etag;
      slot.inFlight = false;
      this.setInFlight(item, slot.partNumber, 0);
      item.uploadedParts = [...item.uploadedParts, { partNumber: slot.partNumber, etag }]
        .filter((entry, index, all) => all.findIndex((other) => other.partNumber === entry.partNumber) === index)
        .sort((a, b) => a.partNumber - b.partNumber);
      item.attempts = 0;
      this.recordSpeed(item);
      await this.persist(item);
      this.emit();
    } catch (error) {
      slot.inFlight = false;
      slot.attempts += 1;
      item.attempts += 1;
      this.setInFlight(item, slot.partNumber, 0);

      if (item.status !== "uploading") {
        this.emit();
        return;
      }

      if (slot.attempts <= MAX_PART_RETRIES && !isFatal(error)) {
        const delay = Math.min(20_000, 700 * 2 ** slot.attempts) + Math.random() * 400;
        item.error = `Part ${slot.partNumber} gagal, mencoba lagi dalam ${Math.round(delay / 1000)} detik…`;
        this.emit();
        await sleep(delay);
        // Refresh the URL in case the previous one expired.
        try {
          const fresh = await this.fetchUrls(item.sessionId!, [slot.partNumber]);
          this.setSlots(item.id, fresh.presignedParts);
          const refreshed = this.slots.get(item.id)?.get(slot.partNumber);
          if (refreshed) {
            refreshed.attempts = slot.attempts;
            void this.uploadOnePart(item, refreshed);
            return;
          }
        } catch {
          /* fall through to error state */
        }
        void this.uploadOnePart(item, slot);
        return;
      }

      item.status = "error";
      item.error = errorMessage(error, "Upload part gagal");
      item.bytesPerSecond = 0;
      await this.persist(item);
      this.emit();
      void this.pump();
    }
  }

  private putPart(item: UploadItem, slot: PartSlot, buffer: ArrayBuffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const set = this.xhrs.get(item.id) ?? new Set<XMLHttpRequest>();
      set.add(xhr);
      this.xhrs.set(item.id, set);

      xhr.open("PUT", slot.url, true);
      // No custom headers on purpose: a plain PUT keeps the CORS preflight away and
      // the object's Content-Type is set server side during CreateMultipartUpload.
      xhr.timeout = 0;

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        this.setInFlight(item, slot.partNumber, Math.min(slot.size, event.loaded));
        this.recordSpeed(item);
        this.emit();
      };

      xhr.onload = () => {
        set.delete(xhr);
        if (xhr.status >= 200 && xhr.status < 300) {
          const etag = (xhr.getResponseHeader("ETag") ?? "").replace(/"/g, "");
          if (!etag) {
            reject(
              new ApiClientError(
                xhr.status,
                "missing_etag",
                "R2 tidak mengembalikan header ETag. Pastikan CORS bucket menyertakan ExposeHeaders: [\"ETag\"].",
              ),
            );
            return;
          }
          resolve(etag);
          return;
        }
        reject(
          new ApiClientError(xhr.status, `r2_${xhr.status}`, uploadHttpStatusMessage(xhr.status)),
        );
      };

      xhr.onerror = () => {
        set.delete(xhr);
        reject(
          new ApiClientError(
            0,
            "network_or_cors",
            "Gagal mengirim data ke R2. Penyebab paling umum: CORS bucket belum dikonfigurasi atau jaringan terputus.",
          ),
        );
      };
      xhr.ontimeout = () => {
        set.delete(xhr);
        reject(new ApiClientError(0, "timeout", "Waktu unggah part habis"));
      };
      xhr.onabort = () => {
        set.delete(xhr);
        reject(new ApiClientError(0, "aborted", "Upload part dibatalkan"));
      };

      xhr.send(buffer);
    });
  }

  private setInFlight(item: UploadItem, partNumber: number, bytes: number): void {
    const map = this.inFlightBytes.get(item.id) ?? new Map<number, number>();
    if (bytes <= 0) map.delete(partNumber);
    else map.set(partNumber, bytes);
    this.inFlightBytes.set(item.id, map);

    let partial = 0;
    map.forEach((value) => {
      partial += value;
    });
    item.bytesUploaded = Math.min(item.size, this.recomputeBytes(item) + partial);
  }

  private recordSpeed(item: UploadItem): void {
    const samples = this.speeds.get(item.id) ?? [];
    samples.push({ at: Date.now(), bytes: item.bytesUploaded });
    const cutoff = Date.now() - 4000;
    const fresh = samples.filter((sample) => sample.at >= cutoff);
    this.speeds.set(item.id, fresh.length > 0 ? fresh : samples.slice(-2));
    const window = this.speeds.get(item.id)!;
    if (window.length >= 2) {
      const first = window[0]!;
      const last = window[window.length - 1]!;
      const seconds = (last.at - first.at) / 1000;
      item.bytesPerSecond = seconds > 0.2 ? Math.max(0, (last.bytes - first.bytes) / seconds) : 0;
    }
  }

  private async persist(item: UploadItem): Promise<void> {
    item.updatedAt = Date.now();
    const stored: StoredUploadItem = {
      id: item.id,
      filename: item.filename,
      size: item.size,
      lastModified: item.lastModified ?? item.file?.lastModified ?? 0,
      contentType: item.contentType,
      visibility: item.visibility,
      preferredStorageId: item.preferredStorageId ?? null,
      sessionId: item.sessionId,
      partSize: item.partSize,
      partsTotal: item.partsTotal,
      uploadedParts: item.uploadedParts,
      bytesUploaded: item.bytesUploaded,
      status: item.status,
      error: item.error,
      storageName: item.storageName,
      downloadUrl: item.downloadUrl,
      addedAt: item.addedAt,
      updatedAt: item.updatedAt,
      ...(item.file ? { file: item.file } : {}),
    };
    await idbPut(stored);
  }
}

function isFatal(error: unknown): boolean {
  if (error instanceof ApiClientError) {
    return [403, 404, 413, 507].includes(error.status) || error.code === "missing_etag";
  }
  return false;
}

function uploadHttpStatusMessage(status: number): string {
  switch (status) {
    case 403:
      return "R2 menolak request (403). Pre-signed URL mungkin kedaluwarsa atau jam perangkat tidak sinkron.";
    case 404:
      return "Sesi multipart tidak ditemukan di R2 (404). Mulai ulang upload.";
    case 413:
      return "Part terlalu besar untuk R2 (413).";
    case 501:
    case 503:
      return "R2 sedang tidak dapat melayani request (503). Coba lagi beberapa saat.";
    default:
      return `R2 mengembalikan status ${status}`;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const GLOBAL_KEY = Symbol.for("katsu.upload-manager");
type GlobalWithManager = typeof globalThis & { [GLOBAL_KEY]?: UploadManager };

/** One shared manager per tab so navigation inside /admin keeps the queue alive. */
export function getUploadManager(): UploadManager {
  const scope = globalThis as GlobalWithManager;
  if (!scope[GLOBAL_KEY]) scope[GLOBAL_KEY] = new UploadManager();
  return scope[GLOBAL_KEY]!;
}
