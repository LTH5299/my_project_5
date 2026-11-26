import type { Mail, MailEvent, Order } from "./types";
import { db, save } from "./store";
import { formatDateTime, formatVnd } from "./money";
import { logCall } from "./log";
import { trackingUrl } from "./shipping";

export const shopContact = () => ({ hotline: process.env.NEXT_PUBLIC_HOTLINE ?? "1900 0000", from: "Next Fashion <donhang@nextfashion.vn>" });
const RETRY_MS = [60_000, 5 * 60_000, 15 * 60_000]; // gửi lại tối đa 3 lần (NFR-12)
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function subjectAndLead(o: Order, ev: MailEvent, extra?: string) {
  const vi = o.lang === "vi";
  const c = o.code;
  const carrier = o.shipment.carrier === "GHN" ? "Giao Hàng Nhanh" : "Viettel Post";
  switch (ev) {
    case "EM-01": return { subject: vi ? `[Next Fashion] Đã nhận đơn ${c}` : `[Next Fashion] Order ${c} received`,
      lead: vi ? `Cảm ơn bạn đã đặt hàng. Bạn thanh toán ${formatVnd(o.money.total, "vi")} bằng tiền mặt khi nhận hàng.${o.status === "pending_confirmation" ? " CSKH sẽ gọi xác nhận đơn trong giờ làm việc." : ""}`
        : `Thank you for your order. You will pay ${formatVnd(o.money.total, "en")} in cash on delivery.${o.status === "pending_confirmation" ? " Our team will call to confirm during office hours." : ""}` };
    case "EM-02": return { subject: vi ? `[Next Fashion] Thanh toán thành công – đơn ${c}` : `[Next Fashion] Payment received – order ${c}`,
      lead: vi ? `Next Fashion đã nhận ${formatVnd(o.money.total, "vi")} qua chuyển khoản (mã giao dịch ${o.transactionId ?? "—"}).` : `We received ${formatVnd(o.money.total, "en")} by bank transfer (transaction ${o.transactionId ?? "—"}).` };
    case "EM-03": return { subject: vi ? `[Next Fashion] Đơn ${c} đã được giao cho ${carrier}` : `[Next Fashion] Order ${c} handed to ${carrier}`,
      lead: vi ? `Mã vận đơn ${o.shipment.trackingCode}. Dự kiến giao ${new Date(o.shipment.etaDate).toLocaleDateString("vi-VN")}. Tra cứu: ${trackingUrl(o.shipment.carrier, o.shipment.trackingCode!)}`
        : `Tracking number ${o.shipment.trackingCode}. Estimated delivery ${new Date(o.shipment.etaDate).toLocaleDateString("en-GB")}. Track: ${trackingUrl(o.shipment.carrier, o.shipment.trackingCode!)}` };
    case "EM-04": {
      const st = { shipping: vi ? "đang được giao" : "is out for delivery", delivered: vi ? "đã giao thành công" : "has been delivered", delivery_failed: vi ? "giao chưa thành công" : "could not be delivered" }[o.status as "shipping"] ?? "";
      return { subject: `[Next Fashion] ${vi ? "Đơn" : "Order"} ${c} ${st}`, lead: vi ? `Đơn ${c} ${st}.` : `Order ${c} ${st}.` };
    }
    case "EM-05": return { subject: vi ? `[Next Fashion] Đơn ${c} đã được hủy` : `[Next Fashion] Order ${c} cancelled`,
      lead: (vi ? `Lý do: ${extra ?? o.cancelReason ?? ""}.` : `Reason: ${extra ?? o.cancelReason ?? ""}.`) + (o.paymentStatus === "refund_pending" ? (vi ? " Tiền sẽ được hoàn trong 7 ngày làm việc." : " Your money will be refunded within 7 working days.") : "") };
  }
}

export function renderMail(o: Order, ev: MailEvent, extra?: string) {
  const vi = o.lang === "vi";
  const { subject, lead } = subjectAndLead(o, ev, extra);
  const m = o.money; const L = o.lang;
  const row = (k: string, v: string, strong = false) => `<tr><td style="padding:6px 0;color:#5a6472">${esc(k)}</td><td style="padding:6px 0;text-align:right;color:${strong ? "#1d3b78" : "#16202e"}">${strong ? "<strong>" : ""}${esc(v)}${strong ? "</strong>" : ""}</td></tr>`;
  const items = o.items.map((i) => `<tr><td style="padding:8px 0;border-top:1px solid #e3e8ef">${esc(i.name[L])}<br><span style="color:#5a6472;font-size:13px">${esc(i.color[L])}, ${esc(i.size)}, ${vi ? "số lượng" : "qty"} ${i.qty}</span></td><td style="padding:8px 0;border-top:1px solid #e3e8ef;text-align:right">${formatVnd(i.price * i.qty, L)}</td></tr>`).join("");
  const showMoney = ev === "EM-01" || ev === "EM-02";
  const html = `<!doctype html><html lang="${L}"><body style="margin:0;background:#f2f5f9;font-family:Arial,Helvetica,sans-serif;color:#16202e">
<table role="presentation" width="100%" style="padding:24px 0"><tr><td align="center"><table role="presentation" width="560" style="max-width:560px;background:#fff">
<tr><td style="background:#1d3b78;padding:20px 28px;color:#fff;font-size:20px;font-family:Georgia,serif">Next Fashion</td></tr>
<tr><td style="padding:28px"><h1 style="margin:0 0 12px;font-size:20px;font-weight:normal">${esc(subject.replace("[Next Fashion] ", ""))}</h1>
<p style="margin:0 0 20px;color:#3a4553;line-height:1.6">${esc(lead)}</p>
<table role="presentation" width="100%" style="font-size:14px">${row(vi ? "Mã đơn" : "Order", o.code)}${row(vi ? "Ngày đặt" : "Placed", formatDateTime(o.createdAt, L))}${o.shipment.trackingCode ? row(vi ? "Mã vận đơn" : "Tracking", `${o.shipment.carrier} ${o.shipment.trackingCode}`) : ""}</table>
${showMoney ? `<table role="presentation" width="100%" style="font-size:14px;margin-top:12px">${items}</table>
<table role="presentation" width="100%" style="font-size:14px;margin-top:8px;border-top:1px solid #e3e8ef">${row(vi ? "Tạm tính" : "Subtotal", formatVnd(m.subtotal, L))}${row(vi ? "Giảm giá" : "Discount", m.discount ? "−" + formatVnd(m.discount, L) : formatVnd(0, L))}${row(vi ? "Phí vận chuyển" : "Shipping", m.shippingPayable ? formatVnd(m.shippingPayable, L) : vi ? "Miễn phí" : "Free")}${row(vi ? "Tổng thanh toán (đã gồm VAT)" : "Total (VAT included)", formatVnd(m.total, L), true)}${row(vi ? "Tiền hàng chưa thuế" : "Net amount", formatVnd(m.netAmount, L))}${row(vi ? `Thuế GTGT ${Math.round(m.vatRate * 100)}%` : `VAT ${Math.round(m.vatRate * 100)}%`, formatVnd(m.vatAmount, L))}</table>
<table role="presentation" width="100%" style="font-size:14px;margin-top:16px">${row(vi ? "Phương thức" : "Payment", o.method === "cod" ? (vi ? "Thanh toán khi nhận hàng (COD)" : "Cash on delivery") : vi ? "Chuyển khoản VietQR (SePay)" : "VietQR bank transfer")}${row(vi ? "Giao đến" : "Ship to", `${o.customer.name}, ${o.address.line}, ${o.address.wardName}, ${o.address.provinceName}`)}</table>` : ""}
<p style="margin:24px 0 0;color:#5a6472;font-size:13px">${vi ? "Cần hỗ trợ? Gọi hotline" : "Need help? Call"} ${esc(shopContact().hotline)}.</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, html };
}

// Mỗi mốc của một đơn chỉ một email (khóa chống trùng)
export function sendMail(o: Order, ev: MailEvent, key: string, now = new Date(), extra?: string) {
  const store = db();
  const dedupeKey = `${o.code}:${key}`;
  if (store.outbox.some((m) => m.dedupeKey === dedupeKey)) return;
  const { subject, html } = renderMail(o, ev, extra);
  const mail: Mail = { id: `${dedupeKey}:${now.getTime()}`, dedupeKey, to: o.customer.email, subject, html, orderCode: o.code, event: ev, status: "sent", attempts: 0, createdAt: now.toISOString() };
  store.outbox.unshift(mail);
  deliver(mail, now);
}

function deliver(mail: Mail, now: Date) {
  const s = db().settings;
  mail.attempts += 1;
  if (s.mailFailNext) {
    s.mailFailNext = false;
    mail.status = "failed"; mail.lastError = "SMTP timeout (giả lập)";
    mail.nextAttemptAt = new Date(now.getTime() + RETRY_MS[Math.min(mail.attempts - 1, 2)]).toISOString();
    logCall({ partner: "Email", action: mail.event, http: 504, ms: 3000, ref: mail.orderCode, note: "Gửi lỗi, sẽ gửi lại" });
    return;
  }
  mail.status = "sent"; mail.sentAt = now.toISOString(); mail.nextAttemptAt = undefined;
  logCall({ partner: "Email", action: mail.event, http: 250, ms: 80, ref: mail.orderCode });
}

export function retryFailedMails(now = new Date(), force = false) {
  let changed = false;
  for (const m of db().outbox) {
    if (m.status !== "failed") continue;
    if (!force && !(m.nextAttemptAt && Date.parse(m.nextAttemptAt) <= now.getTime())) continue;
    if (m.attempts >= 4) { m.status = "gave_up"; changed = true; continue; } // 1 lần đầu + 3 lần thử lại, sau đó CSKH gọi SĐT
    deliver(m, now); changed = true;
  }
  if (changed) save();
}
