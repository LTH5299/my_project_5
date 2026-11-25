import { NextResponse } from "next/server";
import { db, findVariant, resetDb, save } from "@/lib/store";
import { expireSessions, findOrder, findSession, handleCarrierEvent } from "@/lib/orders";
import { handleSepayWebhook } from "@/lib/webhook";
import { retryFailedMails } from "@/lib/mail";
import { devToolsEnabled } from "@/lib/devtools";
import { body } from "@/lib/api";
import type { CarrierMode } from "@/lib/types";

export const dynamic = "force-dynamic";

// Mã trạng thái thật của từng hãng cho mỗi mốc giả lập
const CARRIER_RAW: Record<string, { GHN: string; VTP: number }> = {
  picked: { GHN: "picked", VTP: 105 },
  delivering: { GHN: "delivering", VTP: 500 },
  delivered: { GHN: "delivered", VTP: 501 },
  failed: { GHN: "delivery_fail", VTP: 506 },
  returned: { GHN: "returned", VTP: 504 },
  cancel: { GHN: "cancel", VTP: 107 },
};

// Bảng giả lập: chuyển khoản SePay các kiểu, hết phiên, trạng thái ĐVVC, công tắc lỗi đối tác
export async function POST(req: Request) {
  if (!devToolsEnabled()) return NextResponse.json({ error: "disabled" }, { status: 404 });
  const b = await body<Record<string, unknown>>(req);
  const s = db();
  const now = new Date();
  switch (b.action) {
    case "transfer": {
      const x = findSession(String(b.sessionCode ?? ""));
      const kind = String(b.kind ?? "exact");
      const expected = x?.money.total ?? 0;
      const amount = kind === "short" ? expected - 10000 : kind === "over" ? expected + 10000 : typeof b.amount === "number" ? b.amount : expected;
      const txId = `SIM${now.getTime()}${Math.floor(Math.random() * 1000)}`;
      const content = kind === "nocode" ? "chuyen tien mua hang" : `${x?.code ?? ""} chuyen tien`;
      if (kind === "missed") {
        // Tiền về nhưng webhook bị lỡ: chỉ có trong sổ giao dịch, đợi đối soát cuối phiên
        s.sepayLedger.unshift({ id: txId, amount, content, code: x?.code, at: now.toISOString() });
        save();
        return NextResponse.json({ txId, outcome: { result: "missed" } });
      }
      if (kind === "late" && x?.status === "pending") { x.expiresAt = new Date(now.getTime() - 3 * 60_000).toISOString(); expireSessions(now); }
      const outcome = handleSepayWebhook({
        id: txId, gateway: "MBBank", transactionDate: now.toISOString(), accountNumber: process.env.SEPAY_ACCOUNT_NUMBER ?? "0000000000",
        content, code: kind === "nocode" ? null : x?.code, transferType: "in", transferAmount: amount, referenceCode: txId,
      }, now);
      return NextResponse.json({ txId, outcome });
    }
    case "expire": {
      const x = findSession(String(b.sessionCode ?? ""));
      if (x?.status === "pending") { x.expiresAt = new Date(now.getTime() - 1).toISOString(); expireSessions(now); }
      return NextResponse.json({ ok: true, status: x?.status });
    }
    case "shorten": {
      const x = findSession(String(b.sessionCode ?? ""));
      if (x?.status === "pending") { x.expiresAt = new Date(now.getTime() + 20_000).toISOString(); save(); }
      return NextResponse.json({ ok: true });
    }
    case "carrier": {
      const o = findOrder(String(b.code ?? ""));
      const raw = CARRIER_RAW[String(b.step)];
      if (!o?.shipment.trackingCode || !raw) return NextResponse.json({ ok: false, error: "no_waybill" });
      return NextResponse.json(handleCarrierEvent(o.shipment.carrier, o.shipment.trackingCode, raw[o.shipment.carrier], `SIM${now.getTime()}`, now));
    }
    case "toggle": {
      const key = String(b.key);
      if (key === "ghn" || key === "vtp") s.settings[key] = String(b.value) as CarrierMode;
      else if (["sepayDisabled", "waybillFail", "carrierPickedUp", "mailFailNext"].includes(key)) (s.settings as unknown as Record<string, boolean>)[key] = Boolean(b.value);
      save();
      return NextResponse.json(s.settings);
    }
    case "retryMail": retryFailedMails(now, true); return NextResponse.json({ ok: true });
    case "setStock": { const f = findVariant(String(b.variantId)); if (f) { f.variant.stock = Math.max(0, Math.floor(Number(b.stock))); save(); } return NextResponse.json({ ok: Boolean(f) }); }
    case "setPrice": { const f = findVariant(String(b.variantId)); if (f) { f.variant.price = Math.max(0, Math.floor(Number(b.price))); save(); } return NextResponse.json({ ok: Boolean(f) }); }
    case "reset": resetDb(); return NextResponse.json({ ok: true });
    default: return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }
}
