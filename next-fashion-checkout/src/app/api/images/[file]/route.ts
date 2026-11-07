import fs from "node:fs";
import path from "node:path";
import { FILE_RE, TYPES, UPLOAD_DIR } from "@/lib/uploads";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!FILE_RE.test(file)) return new Response("Not found", { status: 404 });
  const p = path.join(UPLOAD_DIR, file);
  if (!fs.existsSync(p)) return new Response("Not found", { status: 404 });
  return new Response(fs.readFileSync(p), {
    headers: { "content-type": TYPES[file.split(".").pop()!], "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
  });
}
