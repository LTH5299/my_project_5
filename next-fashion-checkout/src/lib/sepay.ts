import type { SepayInfo } from "./types";
import { db } from "./store";

export const PAYMENT_WINDOW_MS = 15 * 60 * 1000; // REQ-A7.4.2: hạn thanh toán 15 phút tính từ lúc tạo QR

export function sepayConfig() {
  return {
    mode: (process.env.SEPAY_MODE ?? "mock") as "mock" | "live",
    webhookKey: process.env.SEPAY_WEBHOOK_KEY ?? "dev-sepay-key",
    bankCode: process.env.SEPAY_BANK_CODE ?? "MBBank",
    bankBin: process.env.SEPAY_BANK_BIN ?? "970422",
    bankName: process.env.SEPAY_BANK_NAME ?? "Ngân hàng TMCP Quân đội (MB)",
    accountNumber: process.env.SEPAY_ACCOUNT_NUMBER ?? "0000000000",
    accountName: process.env.SEPAY_ACCOUNT_NAME ?? "CONG TY NEXT FASHION",
  };
}

// ---- Chuỗi VietQR theo chuẩn EMVCo (NAPAS) ----
function tlv(id: string, value: string) {
  return id + String(value.length).padStart(2, "0") + value;
}

export function crc16ccitt(s: string) {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function buildVietQrPayload(o: { bin: string; account: string; amount: number; content: string }) {
  const merchant = tlv("00", "A000000727") + tlv("01", tlv("00", o.bin) + tlv("01", o.account)) + tlv("02", "QRIBFTTA");
  const body =
    tlv("00", "01") + tlv("01", "12") + tlv("38", merchant) + tlv("53", "704") + tlv("54", String(o.amount)) +
    tlv("58", "VN") + tlv("62", tlv("08", o.content)) + "6304";
  return body + crc16ccitt(body);
}

export class SepayError extends Error {}

// Yêu cầu SePay tạo mã QR động: số tiền = Tổng thanh toán, nội dung = mã đơn.
export async function createDynamicQr(orderCode: string, amount: number, now = new Date()): Promise<SepayInfo> {
  const cfg = sepayConfig();
  const store = db();
  if (store.settings.sepayFailNext) {
    store.settings.sepayFailNext = false; // công cụ giả lập: lỗi một lần
    throw new SepayError("SePay không phản hồi");
  }
  const base = {
    bankName: cfg.bankName, bankCode: cfg.bankCode, accountNumber: cfg.accountNumber, accountName: cfg.accountName,
    amount, content: orderCode, createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PAYMENT_WINDOW_MS).toISOString(),
  };
  if (cfg.mode === "live") {
    const url = new URL("https://qr.sepay.vn/img");
    url.searchParams.set("acc", cfg.accountNumber);
    url.searchParams.set("bank", cfg.bankCode);
    url.searchParams.set("amount", String(amount));
    url.searchParams.set("des", orderCode);
    url.searchParams.set("template", "compact");
    return { ...base, qrImageUrl: url.toString() };
  }
  return { ...base, qrPayload: buildVietQrPayload({ bin: cfg.bankBin, account: cfg.accountNumber, amount, content: orderCode }) };
}
