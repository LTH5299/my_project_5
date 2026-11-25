import { NextResponse } from "next/server";
import { db, save } from "@/lib/store";
import { cancelOrder, cancelUnreachable, completeRefund, confirmCod, expectedWeight, findOrder, packOrder, recordCall, retryWaybill, tick } from "@/lib/orders";
import { reconCreateOrder, reconRefund } from "@/lib/webhook";
import { maskPhone } from "@/lib/log";
import { devToolsEnabled } from "@/lib/devtools";
import { body } from "@/lib/api";
import type { Carrier } from "@/lib/types";

export const dynamic = "force-dynamic";

// Màn hình nội bộ (bản giả lập): CSKH, Kho, Kế toán, nhật ký tích hợp, cấu hình.
// Bản thật đặt sau đăng nhập nhân viên và phân quyền theo vai trò.
export function GET() {
  if (!devToolsEnabled()) return NextResponse.json({ error: "disabled" }, { status: 404 });
  tick();
  const s = db();
  return NextResponse.json({
    orders: s.orders.slice(0, 80).map(({ idempotencyKey: _k, token: _t, ...o }) => ({ ...o, expectedWeight: expectedWeight(o as never) })),
    sessions: s.sessions.slice(0, 40).map(({ idempotencyKey: _k, ...x }) => x),
    recon: s.recon,
    refunds: s.refunds,
    logs: s.logs.slice(0, 200),
    outbox: s.outbox.slice(0, 60).map(({ html: _h, ...m }) => ({ ...m, to: m.to.replace(/^(.).*(@.*)$/, "$1***$2") })),
    settings: s.settings,
    variants: s.products.flatMap((p) => p.variants.map((v) => ({ id: v.id, sku: v.sku, name: `${p.name.vi} (${v.color.vi}, ${v.size})`, stock: v.stock, price: v.price }))),
    phones: Object.fromEntries(s.orders.map((o) => [o.code, maskPhone(o.customer.phone)])),
  });
}

const NUM_KEYS = ["codCap", "autoConfirmCap", "freeshipThreshold", "vatRate", "sessionMinutes", "lateWindowHours", "quoteMaxAgeMinutes"] as const;

export async function POST(req: Request) {
  if (!devToolsEnabled()) return NextResponse.json({ error: "disabled" }, { status: 404 });
  const b = await body<Record<string, unknown>>(req);
  const code = String(b.code ?? "");
  switch (b.action) {
    case "confirm": return NextResponse.json({ ok: confirmCod(code) });
    case "call": return NextResponse.json({ ok: true, attempts: recordCall(code) });
    case "cancelUnreachable": return NextResponse.json({ ok: cancelUnreachable(code) });
    case "cancel": { const o = findOrder(code); return NextResponse.json(o ? cancelOrder(o, String(b.reason ?? ""), "cskh") : { ok: false, error: "not_found" }); }
    case "pack": return NextResponse.json(packOrder(code, Number(b.grams)));
    case "retryWaybill": return NextResponse.json(retryWaybill(code, (b.carrier as Carrier) || undefined));
    case "reconCreate": return NextResponse.json(reconCreateOrder(String(b.txId)));
    case "reconRefund": return NextResponse.json({ ok: reconRefund(String(b.txId)) });
    case "refundDone": return NextResponse.json({ ok: completeRefund(code) });
    case "settings": {
      const st = db().settings;
      const patch = (b.settings ?? {}) as Record<string, unknown>;
      for (const k of NUM_KEYS) {
        const v = Number(patch[k]);
        if (patch[k] !== undefined && Number.isFinite(v) && v >= 0) (st as unknown as Record<string, number>)[k] = v;
      }
      if (Array.isArray(patch.blockedPhones)) st.blockedPhones = patch.blockedPhones.map(String).filter((p) => /^0\d{9}$/.test(p));
      save();
      return NextResponse.json({ ok: true, settings: st });
    }
    default: return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }
}
