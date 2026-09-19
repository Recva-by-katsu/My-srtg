import { z } from "zod";
import { MIN_PART_SIZE, MAX_PART_SIZE } from "@/lib/r2/storage-manager";

/**
 * Request validation schemas (Zod).
 *
 * Every API route parses its input through these schemas, which keeps untrusted
 * data away from the storage and database layers.
 */

export const loginSchema = z.object({
  username: z.string().min(1).max(120),
  password: z.string().min(1).max(512),
  remember: z.boolean().optional(),
});

const storageNameSchema = z
  .string()
  .min(2, "Nama storage minimal 2 karakter")
  .max(60, "Nama storage maksimal 60 karakter")
  .regex(/^[A-Za-z0-9 _.\-()]+$/, "Nama storage hanya boleh huruf, angka, spasi, strip, titik, kurung");

export const createStorageSchema = z.object({
  name: storageNameSchema,
  accountId: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{32}$/i, "Account ID Cloudflare harus 32 karakter heksadesimal"),
  bucket: z
    .string()
    .trim()
    .min(3, "Nama bucket minimal 3 karakter")
    .max(63, "Nama bucket maksimal 63 karakter")
    .regex(/^[a-z0-9][a-z0-9.\-]*[a-z0-9]$/, "Nama bucket tidak valid (huruf kecil, angka, strip, titik)"),
  accessKeyId: z.string().trim().min(8, "Access Key ID terlalu pendek").max(200),
  secretAccessKey: z.string().trim().min(8, "Secret Access Key terlalu pendek").max(400),
  limitValue: z.coerce.number().positive("Storage limit harus lebih dari 0").max(1024 * 1024),
  limitUnit: z.enum(["MB", "GB", "TB"]).default("GB"),
  endpoint: z.string().trim().url().max(300).optional().or(z.literal("")),
  region: z.string().trim().max(40).optional().default("auto"),
  priority: z.coerce.number().int().min(0).max(9999).optional().default(100),
  notes: z.string().max(500).optional().nullable(),
  verifyConnection: z.boolean().optional().default(true),
});

export const updateStorageSchema = z
  .object({
    name: storageNameSchema.optional(),
    accountId: z
      .string()
      .trim()
      .regex(/^[a-f0-9]{32}$/i, "Account ID Cloudflare harus 32 karakter heksadesimal")
      .optional(),
    bucket: z
      .string()
      .trim()
      .min(3)
      .max(63)
      .regex(/^[a-z0-9][a-z0-9.\-]*[a-z0-9]$/)
      .optional(),
    accessKeyId: z.string().trim().min(8).max(200).optional(),
    /** Leave empty/undefined to keep the stored secret unchanged. */
    secretAccessKey: z.string().trim().min(8).max(400).optional().nullable(),
    limitValue: z.coerce.number().positive().max(1024 * 1024).optional(),
    limitUnit: z.enum(["MB", "GB", "TB"]).optional(),
    endpoint: z.string().trim().url().max(300).optional().nullable(),
    region: z.string().trim().max(40).optional(),
    priority: z.coerce.number().int().min(0).max(9999).optional(),
    status: z.enum(["active", "disabled", "error"]).optional(),
    notes: z.string().max(500).optional().nullable(),
    usedBytes: z.coerce.number().int().min(0).optional(),
    lastCheckedAt: z.string().max(40).optional().nullable(),
    lastError: z.string().max(500).optional().nullable(),
    /** Transport level flag: re-run the connection test after saving. */
    verifyConnection: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Tidak ada field yang diperbarui" });

export const uploadInitSchema = z.object({
  filename: z.string().min(1).max(400),
  size: z.coerce.number().int().min(1, "Ukuran file harus lebih dari 0").max(5 * 1024 ** 4),
  contentType: z.string().max(200).optional().default("application/octet-stream"),
  partSize: z.coerce.number().int().min(MIN_PART_SIZE).max(MAX_PART_SIZE).optional(),
  preferredStorageId: z.string().max(64).optional(),
  visibility: z.enum(["public", "private"]).optional().default("public"),
  fingerprint: z.string().max(160).optional(),
  /** Existing session id when the browser is resuming an interrupted upload. */
  sessionId: z.string().max(64).optional(),
});

export const uploadPartSchema = z.object({
  sessionId: z.string().min(1).max(64),
  partNumbers: z.array(z.number().int().min(1).max(10_000)).min(1).max(500),
});

export const uploadCompleteSchema = z.object({
  sessionId: z.string().min(1).max(64),
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().min(1).max(10_000),
        etag: z.string().min(1).max(200),
      }),
    )
    .max(10_000)
    .optional(),
});

export const uploadAbortSchema = z.object({
  sessionId: z.string().min(1).max(64),
});

export const renameFileSchema = z.object({
  filename: z.string().min(1).max(400),
});

export const updateFileSchema = z.object({
  filename: z.string().min(1).max(400).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  storageId: z.string().max(64).optional(),
});

export const moveFileSchema = z.object({
  targetStorageId: z.string().min(1).max(64),
  /** Bytes to copy in this request (the client loops until the job finishes). */
  byteBudget: z.coerce.number().int().min(1024 * 1024).max(256 * 1024 * 1024).optional(),
  deleteSource: z.boolean().optional().default(true),
});

export const passwordHashSchema = z.object({
  password: z.string().min(8, "Password minimal 8 karakter").max(512),
  iterations: z.coerce.number().int().min(10_000).max(600_000).optional(),
});

export const listQuerySchema = z.object({
  q: z.string().max(120).optional(),
  storageId: z.string().max(64).optional(),
  category: z.string().max(30).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  sort: z.enum(["createdAt", "filename", "size", "downloadCount"]).optional(),
  direction: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  page: z.coerce.number().int().min(1).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateStorageInput = z.infer<typeof createStorageSchema>;
export type UpdateStorageInput = z.infer<typeof updateStorageSchema>;
export type UploadInitInput = z.infer<typeof uploadInitSchema>;
export type UploadCompleteInput = z.infer<typeof uploadCompleteSchema>;
export type MoveFileInput = z.infer<typeof moveFileSchema>;
export type ListQueryInput = z.infer<typeof listQuerySchema>;

export interface ValidationIssue {
  path: string;
  message: string;
}

export function parseWith<TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown,
): { data: z.output<TSchema>; issues: ValidationIssue[] } {
  const result = schema.safeParse(input);
  if (result.success) return { data: result.data, issues: [] };

  const issues: ValidationIssue[] = result.error.issues.map((issue) => ({
    path: issue.path.join(".") || "body",
    message: issue.message,
  }));
  return { data: undefined as unknown as z.output<TSchema>, issues };
}
