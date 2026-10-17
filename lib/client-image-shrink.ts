// Client-only screenshot shrink shared by the customer support widget
// (app/components/ChatWidget.tsx) and the admin reply box
// (app/admin/crm/SupportWorkspace.tsx) before uploading to
// app/api/support/attachment/route.ts or app/api/admin/support/route.ts.
// Keeps uploads well under the server's 5MB limit (see MAX_ATTACHMENT_BYTES,
// re-exported below) and live nginx's ~5MB body cap, by capping the longest
// side at 2000px and re-encoding as WebP. Falls back to the original file if
// shrinking fails, is unsupported, or does not actually help and the
// original is already small enough.
import { MAX_ATTACHMENT_BYTES } from "./support-attachment";

export { MAX_ATTACHMENT_BYTES };

const MAX_DIMENSION = 2000;
const QUALITY = 0.85;

export async function shrinkImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const toBlob = (type: string) => new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, QUALITY));
    const resized = (await toBlob("image/webp")) || (await toBlob("image/jpeg"));
    if (!resized) return file;
    if (resized.size > file.size && file.size <= MAX_ATTACHMENT_BYTES) return file;
    return resized;
  } catch {
    return file;
  }
}
