import type { ReconReason, SepayWebhookPayload } from "./types";
import { db, findVariant, save } from "./store";
import { findSession, orderFromSession } from "./orders";
import { logCall } from "./log";

export type WebhookOutcome =
  | { result: "paid"; orderCode: string }
  | { result: "duplicate" }
  | { result: "ignored" }
  | { result: "recon"; reason: ReconReason; sessionCode?: string };

const CODE_RE = /NFP[A-Z0-9]{8}/;

// Webhook biến động số dư SePay (UC-07): khớp mã phiên NFP + đúng số tiền → tạo đơn "Đã thanh toán"
export function handleSepayWebhook(p: SepayWebhookPayload, now = new Date()): WebhookOutcome {
  const store = db();
  const txId = String(p.id);
  if (store.processedTransactionIds.includes(txId)) return { result: "duplicate" };
  if (p.transferType && p.transferType !== "in") { logCall({ partner: "SePay", action: "webhook", http: 200, ms: 10, ref: txId, note: "Tiền ra, bỏ qua" }); return { result: "ignored" }; }
  store.processedTransactionIds.push(txId);

  const amount = Math.round(Number(p.transferAmount));
  const content = p.content ?? p.description ?? "";
  const code = (p.code ?? "").toUpperCase().match(CODE_RE)?.[0] ?? content.toUpperCase().match(CODE_RE)?.[0];
  store.sepayLedger.unshift({ id: txId, amount, content, code, at: now.toISOString() });
  const session = code ? findSession(code) : undefined;

  const recon = (reason: ReconReason, extra: { expectedAmount?: number; lateMinutes?: number } = {}): WebhookOutcome => {
    store.recon.unshift({ transactionId: txId, receivedAt: now.toISOString(), amount, content, sessionCode: session?.code ?? code, reason, status: "open", ...extra });
    logCall({ partner: "SePay", action: "webhook", http: 200, ms: 20, ref: txId, note: `Đối soát: ${reason}` });
    save();
    return { result: "recon", reason, sessionCode: session?.code ?? code };
  };

  if (!code) return recon("missing_code");
  if (!session) return recon("unknown_session");
  const expected = session.money.total;
  if (session.status === "pending") {
    if (amount < expected) return recon("short", { expectedAmount: expected });
    if (amount > expected) return recon("over", { expectedAmount: expected });
    const o = orderFromSession(session, txId, now, true);
    logCall({ partner: "SePay", action: "webhook", http: 200, ms: 35, ref: txId, note: `Khớp ${session.code} → ${o.code}` });
    save();
    return { result: "paid", orderCode: o.code };
  }
  // Phiên đã hết hạn / đã đóng / đã trả bằng giao dịch khác → tiền đến muộn hoặc thừa
  if (session.status === "paid") return recon("over", { expectedAmount: expected });
  const lateMinutes = Math.max(1, Math.round((now.getTime() - Date.parse(session.closedAt ?? session.expiresAt)) / 60_000));
  return recon("late", { expectedAmount: expected, lateMinutes });
}

// ---------- Kế toán đối soát (ADM-02) ----------
export function reconCreateOrder(txId: string, now = new Date()) {
  const store = db();
  const r = store.recon.find((x) => x.transactionId === txId && x.status === "open");
  if (!r) return { ok: false as const, error: "not_found" };
  const x = r.sessionCode ? findSession(r.sessionCode) : undefined;
  if (!x || x.status === "paid") return { ok: false as const, error: "no_session" };
  if (r.amount < x.money.total) return { ok: false as const, error: "amount_short" };
  const held = x.status === "pending";
  if (!held) {
    const ageH = (Date.parse(r.receivedAt) - Date.parse(x.closedAt ?? x.expiresAt)) / 3_600_000;
    if (ageH > store.settings.lateWindowHours) return { ok: false as const, error: "too_late" };
    const short = x.items.some((i) => (findVariant(i.variantId)?.variant.stock ?? 0) < i.qty);
    if (short) return { ok: false as const, error: "out_of_stock" };
  }
  const o = orderFromSession(x, txId, now, held);
  r.status = "order_created"; r.orderCode = o.code;
  save();
  return { ok: true as const, orderCode: o.code };
}

export function reconRefund(txId: string) {
  const r = db().recon.find((x) => x.transactionId === txId && x.status === "open");
  if (!r) return false;
  r.status = "refunded"; r.refundRef = "HT" + Date.now().toString(36).toUpperCase();
  save();
  return true;
}

// SePay gửi header "Authorization: Apikey <khóa>"; sai khóa → 401
export function verifyWebhookAuth(header: string | null, key: string) {
  if (!header) return false;
  const m = header.match(/^Apikey\s+(.+)$/i);
  return Boolean(m && m[1].trim() === key);
}
