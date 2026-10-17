import { describe, expect, it } from "vitest";
import { ATTACHMENT_INVALID_TYPE_MESSAGE, ATTACHMENT_TOO_BIG_MESSAGE, MAX_ATTACHMENT_BYTES, checkAttachment, detectImageMimeType } from "@/lib/support-attachment";

const PNG_HEADER = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG_HEADER = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const WEBP_HEADER = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const GIF_HEADER = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const SVG_TEXT = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
const HTML_TEXT = new TextEncoder().encode("<html><body>hi</body></html>");

describe("detectImageMimeType", () => {
  it("recognizes PNG by its magic bytes", () => {
    expect(detectImageMimeType(PNG_HEADER)).toBe("image/png");
  });

  it("recognizes JPEG by its magic bytes", () => {
    expect(detectImageMimeType(JPEG_HEADER)).toBe("image/jpeg");
  });

  it("recognizes WebP (RIFF....WEBP) by its magic bytes", () => {
    expect(detectImageMimeType(WEBP_HEADER)).toBe("image/webp");
  });

  it("rejects GIF, SVG, HTML and plain text", () => {
    expect(detectImageMimeType(GIF_HEADER)).toBeNull();
    expect(detectImageMimeType(SVG_TEXT)).toBeNull();
    expect(detectImageMimeType(HTML_TEXT)).toBeNull();
    expect(detectImageMimeType(new TextEncoder().encode("just some text"))).toBeNull();
  });

  it("rejects a RIFF file that is not WEBP (e.g. a WAV)", () => {
    const wav = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
    expect(detectImageMimeType(wav)).toBeNull();
  });

  it("handles buffers shorter than the signature without throwing", () => {
    expect(detectImageMimeType(Uint8Array.from([0x89, 0x50]))).toBeNull();
    expect(detectImageMimeType(new Uint8Array())).toBeNull();
  });

  it("is not fooled by a declared type - it only looks at bytes, so a .png that is really text is rejected", () => {
    // Simulates "a fake .png that is really text": whatever the filename or
    // declared content-type claims, only the bytes decide.
    expect(detectImageMimeType(new TextEncoder().encode("not actually a png"))).toBeNull();
  });
});

describe("checkAttachment", () => {
  it("accepts a PNG under the size limit", () => {
    expect(checkAttachment(1024, PNG_HEADER)).toEqual({ ok: true, mimeType: "image/png" });
  });

  it("accepts a JPEG under the size limit", () => {
    expect(checkAttachment(1024, JPEG_HEADER)).toEqual({ ok: true, mimeType: "image/jpeg" });
  });

  it("accepts a WebP under the size limit", () => {
    expect(checkAttachment(1024, WEBP_HEADER)).toEqual({ ok: true, mimeType: "image/webp" });
  });

  it("rejects over 5 MB with 413, checked before the type", () => {
    expect(checkAttachment(MAX_ATTACHMENT_BYTES + 1, SVG_TEXT)).toEqual({ ok: false, status: 413, error: ATTACHMENT_TOO_BIG_MESSAGE });
  });

  it("accepts exactly 5 MB", () => {
    expect(checkAttachment(MAX_ATTACHMENT_BYTES, PNG_HEADER)).toEqual({ ok: true, mimeType: "image/png" });
  });

  it("rejects a non-image type with 400, even when small", () => {
    expect(checkAttachment(10, HTML_TEXT)).toEqual({ ok: false, status: 400, error: ATTACHMENT_INVALID_TYPE_MESSAGE });
  });

  it("rejects zero, negative or non-finite sizes", () => {
    expect(checkAttachment(0, PNG_HEADER)).toEqual({ ok: false, status: 413, error: ATTACHMENT_TOO_BIG_MESSAGE });
    expect(checkAttachment(-5, PNG_HEADER)).toEqual({ ok: false, status: 413, error: ATTACHMENT_TOO_BIG_MESSAGE });
    expect(checkAttachment(NaN, PNG_HEADER)).toEqual({ ok: false, status: 413, error: ATTACHMENT_TOO_BIG_MESSAGE });
  });
});
