import crypto from "node:crypto";
import type { Carrier, CarrierMode, Localized, OrderStatus, Settings, ShippingPackage } from "./types";
import { findProvince, findWard } from "./data/locations";
import { logCall } from "./log";

// Giả lập Open API GHN và Viettel Post cho bản demo. Bản thật thay bằng lời gọi:
// GHN /v2/shipping-order/available-services, /fee, /leadtime, /create, /switch-status/cancel
// VTP /v2/order/getPriceAll, /createOrder, /UpdateOrder (SRS v1.2 II.2.3.2–II.2.3.3)

const ZONE: Record<string, "inner" | "zone2"> = { hn: "inner", hcm: "inner", dn: "zone2", hp: "zone2", ct: "zone2", hue: "zone2", kh: "zone2" };

type Service = { carrier: Carrier; id: string; name: Localized; base: Record<"inner" | "zone2", number>; days: Record<"inner" | "zone2", number> };
const SERVICES: Service[] = [
  { carrier: "GHN", id: "GHN-53320", name: { vi: "Giao Hàng Nhanh – Giao chuẩn", en: "Giao Hang Nhanh – Standard" }, base: { inner: 30000, zone2: 35000 }, days: { inner: 2, zone2: 3 } },
  { carrier: "VTP", id: "VTP-VCN", name: { vi: "Viettel Post – Chuyển phát nhanh", en: "Viettel Post – Express" }, base: { inner: 36000, zone2: 41000 }, days: { inner: 1, zone2: 2 } },
  { carrier: "VTP", id: "VTP-LCOD", name: { vi: "Viettel Post – Tiết kiệm", en: "Viettel Post – Economy" }, base: { inner: 32000, zone2: 37000 }, days: { inner: 4, zone2: 5 } },
];

export interface QuoteResult {
  status: "ok" | "error" | "unserved";
  packages: ShippingPackage[];
  quotedAt: string;
}

const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

// Phụ phí theo khối lượng: +5.000đ mỗi 500g vượt 1kg
const weightFee = (g: number) => Math.max(0, Math.ceil((g - 1000) / 500)) * 5000;

function carrierCall(carrier: Carrier, mode: CarrierMode, zone: "inner" | "zone2" | undefined, grams: number, now: Date) {
  const t0 = Date.now();
  if (mode === "error") { logCall({ partner: carrier, action: carrier === "GHN" ? "fee" : "getPriceAll", http: 500, ms: 120, note: "Lỗi máy chủ đối tác" }); return { kind: "error" as const }; }
  if (mode === "timeout") { logCall({ partner: carrier, action: carrier === "GHN" ? "fee" : "getPriceAll", http: 0, ms: 5000, note: "Quá 5 giây" }); return { kind: "error" as const }; }
  if (mode === "unserved" || !zone) { logCall({ partner: carrier, action: carrier === "GHN" ? "available-services" : "getPriceAll", http: 200, ms: 90, note: "Không phục vụ địa chỉ" }); return { kind: "unserved" as const }; }
  const pkgs = SERVICES.filter((s) => s.carrier === carrier).map<ShippingPackage>((s) => ({
    id: s.id, carrier, serviceName: s.name, fee: s.base[zone] + weightFee(grams), etaDate: addDays(now, s.days[zone]),
  }));
  logCall({ partner: carrier, action: carrier === "GHN" ? "fee+leadtime" : "getPriceAll", http: 200, ms: Date.now() - t0 + 80, note: `${pkgs.length} gói` });
  return { kind: "ok" as const, pkgs };
}

// Báo phí song song hai ĐVVC (UC-03). Một bên lỗi → chỉ hiện bên còn lại.
export function quoteShipping(provinceId: string, wardId: string, grams: number, s: Settings, now = new Date()): QuoteResult {
  const quotedAt = now.toISOString();
  if (!findProvince(provinceId) || !findWard(provinceId, wardId)) return { status: "unserved", packages: [], quotedAt };
  const zone = ZONE[provinceId];
  const results = [carrierCall("GHN", s.ghn, zone, grams, now), carrierCall("VTP", s.vtp, zone, grams, now)];
  const packages = results.flatMap((r) => (r.kind === "ok" ? r.pkgs : [])).sort((a, b) => a.fee - b.fee);
  if (packages.length) { packages[0].cheapest = true; return { status: "ok", packages, quotedAt }; }
  return { status: results.every((r) => r.kind === "unserved") ? "unserved" : "error", packages: [], quotedAt };
}

export function findPackage(provinceId: string, wardId: string, grams: number, pkgId: string, s: Settings, now = new Date()) {
  return quoteShipping(provinceId, wardId, grams, s, now).packages.find((p) => p.id === pkgId);
}

// ---------- Vận đơn ----------
export function createWaybill(carrier: Carrier, orderCode: string, codAmount: number, fail: boolean) {
  const t0 = Date.now();
  if (fail) {
    logCall({ partner: carrier, action: carrier === "GHN" ? "shipping-order/create" : "createOrder", http: 400, ms: 140, ref: orderCode, note: "Địa chỉ người nhận không hợp lệ" });
    return { ok: false as const, error: carrier === "GHN" ? "GHN 400: Địa chỉ người nhận không hợp lệ" : "VTP 400: Không xác định được phường/xã nhận" };
  }
  const trackingCode = carrier === "GHN"
    ? "G" + crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 7)
    : String(1_000_000_000_000 + crypto.randomInt(0, 899_999_999_999));
  logCall({ partner: carrier, action: carrier === "GHN" ? "shipping-order/create" : "createOrder", http: 200, ms: Date.now() - t0 + 160, ref: orderCode, note: `COD ${codAmount}` });
  return { ok: true as const, trackingCode, labelUrl: `/dev/label/${orderCode}` };
}

export function cancelWaybill(carrier: Carrier, trackingCode: string, pickedUp: boolean) {
  const ok = !pickedUp;
  logCall({ partner: carrier, action: carrier === "GHN" ? "switch-status/cancel" : "UpdateOrder(cancel)", http: 200, ms: 110, ref: trackingCode, note: ok ? "Đã hủy" : "Đơn đã lấy hàng, không hủy được" });
  return ok;
}

export const trackingUrl = (carrier: Carrier, code: string) =>
  carrier === "GHN" ? `https://donhang.ghn.vn/?order_code=${code}` : `https://viettelpost.com.vn/tra-cuu-hanh-trinh-don/?code=${code}`;

// ---------- Ánh xạ trạng thái ĐVVC → SM-01 (SRS II.2.2) ----------
export function mapGhnStatus(s: string): OrderStatus | null {
  if (["ready_to_pick", "picking"].includes(s)) return "awaiting_pickup";
  if (["picked", "storing", "transporting", "sorting", "delivering"].includes(s)) return "shipping";
  if (s === "delivery_fail") return "delivery_failed";
  if (s === "delivered") return "delivered";
  if (["waiting_to_return", "return", "returning", "returned"].includes(s)) return "returned";
  if (s === "cancel") return "canceled";
  return null;
}
export function mapVtpStatus(code: number): OrderStatus | null {
  if (code >= 100 && code <= 104) return "awaiting_pickup";
  if ([105, 200, 300, 400, 500].includes(code)) return "shipping";
  if (code >= 505 && code <= 508) return "delivery_failed";
  if (code === 501) return "delivered";
  if ([502, 504].includes(code)) return "returned";
  if ([107, 503].includes(code)) return "canceled";
  return null;
}

// Thứ tự để chỉ cập nhật theo chiều tiến (AC-13.2)
export const STATUS_RANK: Record<OrderStatus, number> = {
  pending_confirmation: 0, paid: 1, packing: 2, awaiting_pickup: 3, shipping: 4, delivery_failed: 4, delivered: 6, returned: 6, canceled: 6,
};
