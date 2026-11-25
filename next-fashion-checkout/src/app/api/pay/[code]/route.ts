import { NextResponse } from "next/server";
import { closeSession, findSession, publicSession, tick } from "@/lib/orders";
import { transferInfo } from "@/lib/sepay";
import { body } from "@/lib/api";

export const dynamic = "force-dynamic";

// Trang thanh toán SCR-07 hỏi trạng thái mỗi 3 giây
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  tick();
  const x = findSession(code);
  const t = new URL(req.url).searchParams.get("t");
  if (!x || x.token !== t) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ session: publicSession(x), transfer: transferInfo(x.code, x.money.total), now: new Date().toISOString() });
}

// "Đổi sang COD": đóng phiên, nhả hàng
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const b = await body<{ token?: string; action?: string }>(req);
  if (b.action !== "close") return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  const r = closeSession(code, String(b.token ?? ""));
  return NextResponse.json(r, { status: r.ok || r.error === "paid" ? 200 : 404 });
}
