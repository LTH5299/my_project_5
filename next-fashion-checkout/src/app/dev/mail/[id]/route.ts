import { db } from "@/lib/store";
import { devToolsEnabled } from "@/lib/devtools";

export const dynamic = "force-dynamic";

// Xem nội dung email trong hộp thư giả lập
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!devToolsEnabled()) return new Response("Not found", { status: 404 });
  const { id } = await params;
  const m = db().outbox.find((x) => x.id === decodeURIComponent(id));
  if (!m) return new Response("Not found", { status: 404 });
  return new Response(m.html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
