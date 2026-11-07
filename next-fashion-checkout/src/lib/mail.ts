import type { Mail, MailEvent, Order } from "./types";
import { db, save } from "./store";
import { formatDateTime, formatTime, formatVnd } from "./money";

const RETRY_MS = 60 * 1000;
export const shopContact = () => ({
  hotline: process.env.NEXT_PUBLIC_HOTLINE ?? "1900 0000",
  zalo: process.env.NEXT_PUBLIC_ZALO_URL ?? "https://zalo.me/",
  from: "Next Fashion <donhang@nextfashion.vn>",
});

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function copy(order: Order, event: MailEvent) {
  const vi = order.lang === "vi";
  const c = order.code;
  if (event === "order_confirmed") {
    return order.method === "sepay"
      ? {
          subject: vi ? `Đơn ${c} đã được tạo, vui lòng thanh toán trước ${formatTime(order.sepay!.expiresAt, "vi")}` : `Order ${c} created, please pay before ${formatTime(order.sepay!.expiresAt, "en")}`,
          lead: vi
            ? `Next Fashion đã nhận đơn ${c}. Bạn vui lòng quét mã VietQR trên trang đơn hàng để thanh toán trước ${formatDateTime(order.sepay!.expiresAt, "vi")}. Sau thời điểm này, đơn sẽ tự hủy.`
            : `We have received order ${c}. Please scan the VietQR code on the order page before ${formatDateTime(order.sepay!.expiresAt, "en")}. After that the order is cancelled automatically.`,
        }
      : {
          subject: vi ? `Xác nhận đơn hàng ${c}` : `Order confirmation ${c}`,
          lead: vi
            ? `Cảm ơn bạn đã đặt hàng tại Next Fashion. Đơn ${c} đang chờ xác nhận. Bạn thanh toán ${formatVnd(order.total, "vi")} bằng tiền mặt khi nhận hàng.`
            : `Thank you for shopping with Next Fashion. Order ${c} is awaiting confirmation. You will pay ${formatVnd(order.total, "en")} in cash on delivery.`,
        };
  }
  if (event === "sepay_paid") {
    return {
      subject: vi ? `Đã nhận thanh toán đơn ${c}` : `Payment received for order ${c}`,
      lead: vi
        ? `Next Fashion đã nhận ${formatVnd(order.total, "vi")} cho đơn ${c}. Đơn đã được chuyển sang kho để đóng gói.`
        : `We have received ${formatVnd(order.total, "en")} for order ${c}. It is now with our warehouse for packing.`,
    };
  }
  return {
    subject: vi ? `Đơn ${c} đã bị hủy do quá hạn thanh toán` : `Order ${c} cancelled: payment window expired`,
    lead: vi
      ? `Đơn ${c} đã bị hủy vì chưa nhận được thanh toán trong 15 phút. Nếu bạn đã chuyển tiền, vui lòng gọi hotline ${shopContact().hotline} để được hỗ trợ.`
      : `Order ${c} was cancelled because no payment arrived within 15 minutes. If you have already transferred money, please call ${shopContact().hotline}.`,
  };
}

// Mẫu email theo nhận diện xanh – trắng (REQ-A7.6.2)
export function renderMail(order: Order, event: MailEvent) {
  const vi = order.lang === "vi";
  const { subject, lead } = copy(order, event);
  const row = (k: string, v: string) =>
    `<tr><td style="padding:6px 0;color:#5a6472">${esc(k)}</td><td style="padding:6px 0;text-align:right;color:#16202e">${esc(v)}</td></tr>`;
  const items = order.items
    .map((i) => `<tr><td style="padding:8px 0;border-top:1px solid #e3e8ef;color:#16202e">${esc(i.name[order.lang])}<br><span style="color:#5a6472;font-size:13px">${esc(i.color[order.lang])}, ${vi ? "size" : "size"} ${esc(i.size)}, ${vi ? "số lượng" : "qty"} ${i.qty}</span></td><td style="padding:8px 0;border-top:1px solid #e3e8ef;text-align:right;color:#16202e">${formatVnd(i.price * i.qty, order.lang)}</td></tr>`)
    .join("");
  const ship = order.shippingFee - order.shippingDiscount === 0 ? (vi ? "Miễn phí" : "Free") : formatVnd(order.shippingFee - order.shippingDiscount, order.lang);
  const method = order.method === "cod" ? (vi ? "Thanh toán khi nhận hàng (COD)" : "Cash on delivery (COD)") : vi ? "Chuyển khoản SePay (VietQR)" : "Bank transfer via SePay (VietQR)";
  const html = `<!doctype html><html lang="${order.lang}"><body style="margin:0;background:#f2f5f9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" style="background:#f2f5f9;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" style="max-width:560px;background:#ffffff;border-radius:4px;overflow:hidden">
<tr><td style="background:#1d3b78;padding:20px 28px;color:#ffffff;font-size:18px;letter-spacing:0.02em">Next Fashion</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 12px;font-size:20px;font-weight:normal;color:#16202e">${esc(subject)}</h1>
<p style="margin:0 0 20px;color:#3a4553;line-height:1.6">${esc(lead)}</p>
<table role="presentation" width="100%" style="font-size:14px">${row(vi ? "Mã đơn" : "Order", order.code)}${row(vi ? "Ngày đặt" : "Placed", formatDateTime(order.createdAt, order.lang))}</table>
<table role="presentation" width="100%" style="font-size:14px;margin-top:12px">${items}</table>
<table role="presentation" width="100%" style="font-size:14px;margin-top:8px;border-top:1px solid #e3e8ef">
${row(vi ? "Tạm tính" : "Subtotal", formatVnd(order.subtotal, order.lang))}${row(vi ? "Giảm giá" : "Discount", order.discount ? "−" + formatVnd(order.discount, order.lang) : formatVnd(0, order.lang))}${row(vi ? "Phí vận chuyển" : "Shipping", ship)}
<tr><td style="padding:10px 0;border-top:1px solid #16202e;color:#16202e"><strong>${vi ? "Tổng thanh toán" : "Total"}</strong></td><td style="padding:10px 0;border-top:1px solid #16202e;text-align:right;color:#1d3b78"><strong>${formatVnd(order.total, order.lang)}</strong></td></tr></table>
<table role="presentation" width="100%" style="font-size:14px;margin-top:16px">${row(vi ? "Phương thức thanh toán" : "Payment", method)}${row(vi ? "Người nhận" : "Recipient", `${order.customer.name}, ${order.customer.phone}`)}${row(vi ? "Địa chỉ" : "Address", `${order.address.line}, ${order.address.wardName}, ${order.address.provinceName}`)}</table>
<p style="margin:24px 0 0;color:#5a6472;font-size:13px;line-height:1.6">${vi ? "Cần hỗ trợ? Gọi hotline" : "Need help? Call"} ${esc(shopContact().hotline)} ${vi ? "hoặc nhắn Zalo Next Fashion." : "or message Next Fashion on Zalo."}</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, html };
}

// Đưa email vào hàng đợi. Mỗi sự kiện của một đơn chỉ có một email (khóa chống trùng).
export function enqueueMail(order: Order, event: MailEvent, now = new Date()) {
  const store = db();
  const dedupeKey = `${order.code}:${event}`;
  if (store.outbox.some((m) => m.dedupeKey === dedupeKey)) return;
  const { subject, html } = renderMail(order, event);
  const mail: Mail = {
    id: `${dedupeKey}:${now.getTime()}`, dedupeKey, to: order.customer.email, subject, html, orderCode: order.code, event,
    status: "queued", attempts: 0, createdAt: now.toISOString(),
  };
  store.outbox.unshift(mail);
  deliver(mail, now);
}

// Gửi thử; lỗi thì hẹn gửi lại, đơn vẫn xử lý bình thường.
function deliver(mail: Mail, now: Date) {
  const store = db();
  mail.attempts += 1;
  if (store.settings.mailFailNext) {
    store.settings.mailFailNext = false;
    mail.status = "failed";
    mail.lastError = "SMTP timeout (giả lập)";
    mail.nextAttemptAt = new Date(now.getTime() + RETRY_MS).toISOString();
    return;
  }
  mail.status = "sent";
  mail.sentAt = now.toISOString();
  mail.nextAttemptAt = undefined;
}

export function retryFailedMails(now = new Date(), force = false) {
  let changed = false;
  for (const m of db().outbox) {
    if (m.status === "failed" && (force || (m.nextAttemptAt && Date.parse(m.nextAttemptAt) <= now.getTime()))) {
      deliver(m, now);
      changed = true;
    }
  }
  if (changed) save();
}
