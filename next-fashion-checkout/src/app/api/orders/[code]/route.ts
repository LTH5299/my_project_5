import { NextResponse } from "next/server";
import { accessOrder, cancelOrder, publicOrder, tick } from "@/lib/orders";
import { trackingUrl } from "@/lib/shipping";
import { body, currentMemberId } from "@/lib/api";

export const dynamic = "force-dynamic";

async function load(req: Request, code: string, token?: string) {
  const t = token ?? new URL(req.url).searchParams.get("t") ?? undefined;
  return accessOrder(code, { token: t, memberId: await currentMemberId() });
}

// Chi tiết đơn (UC-09): qua link email (token) hoặc thành viên đăng nhập
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  tick();
  const o = await load(req, code);
  if (!o) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ order: publicOrder(o), trackingUrl: o.shipment.trackingCode ? trackingUrl(o.shipment.carrier, o.shipment.trackingCode) : null });
}

// Khách hủy đơn (UC-10)
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const b = await body<{ token?: string; action?: string; reason?: string }>(req);
  const o = await load(req, code, b.token);
  if (!o) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (b.action !== "cancel") return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  const r = cancelOrder(o, String(b.reason ?? ""), "customer");
  return NextResponse.json({ ...r, order: publicOrder(o) }, { status: r.ok ? 200 : 409 });
}
