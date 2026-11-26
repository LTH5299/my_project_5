import { NextResponse } from "next/server";
import { handleCarrierEvent } from "@/lib/orders";

export const dynamic = "force-dynamic";

// Webhook Viettel Post: { DATA: { ORDER_NUMBER, ORDER_STATUS, ORDER_STATUSDATE, MONEY_TOTAL }, TOKEN }
export async function POST(req: Request) {
  const p = await req.json().catch(() => null);
  if (!p || p.TOKEN !== (process.env.VTP_WEBHOOK_TOKEN ?? "dev-vtp-token")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const d = p.DATA ?? {};
  if (!d.ORDER_NUMBER || d.ORDER_STATUS == null) return NextResponse.json({ error: "bad_payload" }, { status: 400 });
  const r = handleCarrierEvent("VTP", String(d.ORDER_NUMBER), Number(d.ORDER_STATUS), `${d.ORDER_NUMBER}:${d.ORDER_STATUS}:${d.ORDER_STATUSDATE ?? ""}`, new Date(), Number(d.MONEY_TOTAL) || undefined);
  return NextResponse.json(r, { status: r.ok ? 200 : 404 });
}
