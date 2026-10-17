// Pure rules for support-chat screenshot attachments: size limit and the
// magic-byte check that decides the real image type regardless of what the
// browser/client claimed. No DB/IO here on purpose - see app/api/support/
// attachment/route.ts for the part that touches Prisma, and
// lib/__tests__/support-attachment.test.ts for coverage.

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB

export const ATTACHMENT_TOO_BIG_MESSAGE = "Screenshot is too big. Max 5 MB.";
export const ATTACHMENT_INVALID_TYPE_MESSAGE = "Only PNG, JPG or WebP images.";

export type AttachmentMimeType = "image/png" | "image/jpeg" | "image/webp";

/** Sniffs the real image type from its magic bytes. Returns null for anything else (SVG, GIF, HTML, text, ...), regardless of a declared/claimed content type. */
export function detectImageMimeType(bytes: Uint8Array): AttachmentMimeType | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp";
  }
  return null;
}

export type AttachmentCheck =
  | { ok: true; mimeType: AttachmentMimeType }
  | { ok: false; status: 413; error: string }
  | { ok: false; status: 400; error: string };

/** Validates an uploaded screenshot: size first (cheap, and the friendlier error), then its real type by magic bytes. */
export function checkAttachment(size: number, bytes: Uint8Array): AttachmentCheck {
  if (!Number.isFinite(size) || size <= 0 || size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, status: 413, error: ATTACHMENT_TOO_BIG_MESSAGE };
  }
  const mimeType = detectImageMimeType(bytes);
  if (!mimeType) return { ok: false, status: 400, error: ATTACHMENT_INVALID_TYPE_MESSAGE };
  return { ok: true, mimeType };
}
