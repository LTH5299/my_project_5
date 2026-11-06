import fs from "node:fs";
import path from "node:path";

// Ảnh do shop tải lên được lưu ngoài thư mục public (public chỉ được phục vụ theo bản build),
// đọc lại qua /api/images/<tên file>.
export const UPLOAD_DIR = path.join(process.cwd(), ".data", "uploads");
export const FILE_RE = /^[a-z0-9-]+\.(jpg|png|webp)$/;
export const MAX_BYTES = 4 * 1024 * 1024;
export const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export function parseDataUrl(dataUrl: string): { ext: string; bytes: Buffer } | null {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const bytes = Buffer.from(m[2], "base64");
  // Kiểm tra chữ ký tệp, không tin vào phần khai báo
  const sig = bytes.subarray(0, 12);
  const isJpg = sig[0] === 0xff && sig[1] === 0xd8;
  const isPng = sig[0] === 0x89 && sig.toString("ascii", 1, 4) === "PNG";
  const isWebp = sig.toString("ascii", 0, 4) === "RIFF" && sig.toString("ascii", 8, 12) === "WEBP";
  const ext = isJpg ? "jpg" : isPng ? "png" : isWebp ? "webp" : null;
  if (!ext || bytes.length > MAX_BYTES) return null;
  return { ext, bytes };
}

export function saveUpload(productId: string, ext: string, bytes: Buffer) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const name = `${productId.replace(/[^a-z0-9-]/g, "")}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), bytes);
  return name;
}
