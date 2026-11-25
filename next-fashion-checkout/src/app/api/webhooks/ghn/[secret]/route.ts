import { NextResponse } from "next/server";
import { handleCarrierEvent } from "@/lib/orders";

export const dynamic = "force-dynamic";

// Webhook GHN: bảo vệ bằng đoạn bí mật trong URL. Payload: OrderCode, Status, Time, TotalFee
export async function POST(req: Request, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  if (secret !== (process.env.GHN_WEBHOOK_SECRET ?? "dev-ghn-secret")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = await req.json().catch(() => null);
  if (!p?.OrderCode || !p?.Status) return NextResponse.json({ error: "bad_payload" }, { status: 400 });
  const r = handleCarrierEvent("GHN", String(p.OrderCode), String(p.Status), `${p.OrderCode}:${p.Status}:${p.Time ?? ""}`, new Date(), Number(p.TotalFee) || undefined);
  return NextResponse.json(r, { status: r.ok ? 200 : 404 });
}
