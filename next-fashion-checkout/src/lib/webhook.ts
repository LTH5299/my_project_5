import type { SepayWebhookPayload, UnmatchedReason } from "./types";
import { db, save } from "./store";
import { cancelForTimeout } from "./orders";
import { enqueueMail } from "./mail";

export type WebhookOutcome =
  | { result: "paid"; orderCode: string }
  | { result: "duplicate" }
  | { result: "ignored" }
  | { result: "unmatched"; reason: UnmatchedReason; orderCode?: string };

// Xử lý webhook biến động số dư từ SePay (REQ-A7.4.2, US-11 AC-2 đến AC-6)
export function handleSepayWebhook(p: SepayWebhookPayload, now = new Date()): WebhookOutcome {
  const store = db();
  const txId = String(p.id);

  // Webhook trùng: chỉ xử lý một lần
  if (store.processedTransactionIds.includes(txId)) return { result: "duplicate" };
  store.processedTransactionIds.push(txId);

  if (p.transferType && p.transferType !== "in") { save(); return { result: "ignored" }; }

  const text = `${p.code ?? ""} ${p.content ?? ""} ${p.description ?? ""}`;
  const orderCode = text.toUpperCase().match(/NF\d{10}/)?.[0];
  const amount = Math.round(Number(p.transferAmount));
  const order = orderCode ? store.orders.find((o) => o.code === orderCode) : undefined;

  const unmatched = (reason: UnmatchedReason): WebhookOutcome => {
    store.unmatched.unshift({
      transactionId: txId, receivedAt: now.toISOString(), amount, content: p.content ?? "", orderCode, reason,
      expectedAmount: order?.total,
    });
    save();
    return { result: "unmatched", reason, orderCode };
  };

  if (!order || order.status === "canceled_qr_error") return unmatched("order_not_found");
  if (order.method !== "sepay") return unmatched("not_sepay_order");

  // Webhook đến đúng lúc hoặc sau thời điểm hết hạn: đơn bị hủy, không khôi phục
  if (order.status === "awaiting_payment" && order.sepay && now.getTime() >= Date.parse(order.sepay.expiresAt)) {
    cancelForTimeout(order, now);
  }
  if (order.status === "canceled_timeout") return unmatched("order_canceled");
  if (order.paymentStatus === "paid") return unmatched("already_paid");
  // Chỉ ghi nhận khi số tiền khớp tuyệt đối với Tổng thanh toán; lệch 1đ cũng không nhận
  if (amount !== order.total) return unmatched("amount_mismatch");

  order.paymentStatus = "paid";
  order.status = "packing"; // chuyển đơn cho Kho đóng gói (tiếp tục ACT-02)
  order.sepay!.paidAt = now.toISOString();
  order.sepay!.transactionId = txId;
  order.timeline.push({ status: "paid", at: now.toISOString() }, { status: "packing", at: now.toISOString() });
  enqueueMail(order, "sepay_paid", now);
  save();
  return { result: "paid", orderCode: order.code };
}

export function verifyWebhookAuth(header: string | null, key: string) {
  if (!header) return false;
  const m = header.match(/^Apikey\s+(.+)$/i);
  return Boolean(m && m[1].trim() === key);
}
