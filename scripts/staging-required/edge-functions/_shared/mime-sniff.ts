// Magic-byte MIME sniffing for the four allowed evidence formats.
// Zero external deps. Never trust client-declared MIME.
//
// Signatures:
//   JPEG : FF D8 FF
//   PNG  : 89 50 4E 47 0D 0A 1A 0A
//   WebP : "RIFF" .... "WEBP"
//   PDF  : 25 50 44 46 2D           ("%PDF-")

export type AllowedMime =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "application/pdf";

export interface SniffResult {
  mime: AllowedMime | null;
  extension: "jpg" | "png" | "webp" | "pdf" | null;
  reason?: string;
}

function eq(bytes: Uint8Array, offset: number, sig: number[]): boolean {
  if (bytes.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (bytes[offset + i] !== sig[i]) return false;
  return true;
}

function ascii(bytes: Uint8Array, offset: number, s: string): boolean {
  if (bytes.length < offset + s.length) return false;
  for (let i = 0; i < s.length; i++) if (bytes[offset + i] !== s.charCodeAt(i)) return false;
  return true;
}

export function sniffMime(bytes: Uint8Array): SniffResult {
  if (bytes.length < 12) return { mime: null, extension: null, reason: "too_short" };

  if (eq(bytes, 0, [0xff, 0xd8, 0xff])) {
    return { mime: "image/jpeg", extension: "jpg" };
  }
  if (eq(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mime: "image/png", extension: "png" };
  }
  if (ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) {
    return { mime: "image/webp", extension: "webp" };
  }
  if (ascii(bytes, 0, "%PDF-")) {
    return { mime: "application/pdf", extension: "pdf" };
  }

  // Explicit rejects for common spoof paths — reported so the caller can log.
  if (ascii(bytes, 0, "<?xml") || ascii(bytes, 0, "<svg")) {
    return { mime: null, extension: null, reason: "svg_or_xml_rejected" };
  }
  if (ascii(bytes, 0, "<!DOC") || ascii(bytes, 0, "<html") || ascii(bytes, 0, "<HTML")) {
    return { mime: null, extension: null, reason: "html_rejected" };
  }
  if (eq(bytes, 0, [0x50, 0x4b, 0x03, 0x04])) {
    return { mime: null, extension: null, reason: "zip_rejected" };
  }
  if (eq(bytes, 0, [0x4d, 0x5a])) {
    return { mime: null, extension: null, reason: "executable_rejected" };
  }
  return { mime: null, extension: null, reason: "unknown_format" };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(h))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
