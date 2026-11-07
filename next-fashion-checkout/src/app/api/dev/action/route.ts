import { NextResponse } from "next/server";
import { db, findVariant, resetDb, save } from "@/lib/store";
import { sweep } from "@/lib/orders";
import { handleSepayWebhook } from "@/lib/webhook";
import { retryFailedMails } from "@/lib/mail";
import { devToolsEnabled } from "@/lib/devtools";

export const dynamic = "force-dynamic";

// Công cụ giả lập cho kiểm thử: chuyển khoản, webhook trùng, lệch tiền, hết hạn, lỗi SePay, lỗi email.
export async function POST(req: Request) {
  if (!devToolsEnabled()) return NextResponse.json({ error: "disabled" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const s = db();
  switch (b.action) {
    case "transfer": {
      const order = s.orders.find((o) => o.code === b.orderCode);
      const txId = b.txId ?? `SIM${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const outcome = handleSepayWebhook({
        id: txId, gateway: "MBBank", transactionDate: new Date().toISOString(), accountNumber: process.env.SEPAY_ACCOUNT_NUMBER ?? "0000000000",
        content: b.content ?? `${b.orderCode ?? ""} chuyen tien`, transferType: "in",
        transferAmount: typeof b.amount === "number" ? b.amount : order?.total ?? 0, referenceCode: txId,
      });
      return NextResponse.json({ txId, outcome });
    }
    case "expire": {
      const o = s.orders.find((x) => x.code === b.orderCode);
      if (o?.sepay && o.status === "awaiting_payment") { o.sepay.expiresAt = new Date(Date.now() - 1).toISOString(); sweep(); }
      return NextResponse.json({ ok: true });
    }
    case "shorten": {
      const o = s.orders.find((x) => x.code === b.orderCode);
      if (o?.sepay && o.status === "awaiting_payment") { o.sepay.expiresAt = new Date(Date.now() + 20_000).toISOString(); save(); }
      return NextResponse.json({ ok: true });
    }
    case "toggleSepayFail": s.settings.sepayFailNext = !s.settings.sepayFailNext; save(); return NextResponse.json(s.settings);
    case "toggleMailFail": s.settings.mailFailNext = !s.settings.mailFailNext; save(); return NextResponse.json(s.settings);
    case "retryMail": retryFailedMails(new Date(), true); return NextResponse.json({ ok: true });
    case "setStock": { const f = findVariant(b.variantId); if (f) { f.variant.stock = Math.max(0, Math.floor(b.stock)); save(); } return NextResponse.json({ ok: Boolean(f) }); }
    case "setPrice": { const f = findVariant(b.variantId); if (f) { f.variant.price = Math.max(0, Math.floor(b.price)); save(); } return NextResponse.json({ ok: Boolean(f) }); }
    case "reset": resetDb(); return NextResponse.json({ ok: true });
    default: return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }
}
