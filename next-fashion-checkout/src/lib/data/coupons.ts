import type { Coupon, CouponUsage, Member, Settings } from "../types";

const DAY = 24 * 3600 * 1000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

// Bộ mã kiểm thử theo SRS v1.2 mục III.4
export function seedCoupons(): Coupon[] {
  return [
    { code: "GIAM10", type: "percent", value: 10, maxDiscount: 80000, minSubtotal: 500000, startsAt: iso(-10), endsAt: iso(30), totalLimit: 500, perCustomerLimit: 1, isPublic: true,
      title: { vi: "Giảm 10%, tối đa 80.000đ", en: "10% off, up to 80,000đ" } },
    { code: "GIAM100K", type: "fixed", value: 100000, minSubtotal: 800000, startsAt: iso(-10), endsAt: iso(30), totalLimit: 500, perCustomerLimit: 2, isPublic: true,
      title: { vi: "Giảm 100.000đ", en: "100,000đ off" } },
    { code: "FREESHIP", type: "freeship", value: 0, shipCap: 30000, minSubtotal: 0, startsAt: iso(-10), endsAt: iso(30), totalLimit: 1000, perCustomerLimit: 3, isPublic: true,
      title: { vi: "Miễn phí vận chuyển, tối đa 30.000đ", en: "Free shipping, up to 30,000đ" } },
    { code: "NAM15", type: "percent", value: 15, maxDiscount: 150000, minSubtotal: 0, startsAt: iso(-10), endsAt: iso(30), totalLimit: 200, perCustomerLimit: 1, categories: ["nam"], isPublic: true,
      title: { vi: "Giảm 15% hàng Nam, tối đa 150.000đ", en: "15% off menswear, up to 150,000đ" } },
    { code: "KHONGSALE", type: "percent", value: 20, minSubtotal: 0, startsAt: iso(-10), endsAt: iso(30), totalLimit: 200, perCustomerLimit: 1, excludeSale: true, isPublic: true,
      title: { vi: "Giảm 20%, không áp dụng hàng Sale", en: "20% off, excludes sale items" } },
    { code: "HETHAN", type: "percent", value: 10, minSubtotal: 0, startsAt: iso(-40), endsAt: iso(-1), totalLimit: 100, perCustomerLimit: 1, isPublic: true,
      title: { vi: "Giảm 10% (đã hết hạn)", en: "10% off (expired)" } },
    { code: "SAPMO", type: "percent", value: 10, minSubtotal: 0, startsAt: iso(5), endsAt: iso(30), totalLimit: 100, perCustomerLimit: 1, isPublic: true,
      title: { vi: "Giảm 10% (sắp mở)", en: "10% off (coming soon)" } },
    { code: "HETLUOT", type: "percent", value: 10, minSubtotal: 0, startsAt: iso(-10), endsAt: iso(30), totalLimit: 0, perCustomerLimit: 1, isPublic: false,
      title: { vi: "Giảm 10%", en: "10% off" } },
    { code: "MOTLAN", type: "fixed", value: 50000, minSubtotal: 0, startsAt: iso(-10), endsAt: iso(30), totalLimit: 100, perCustomerLimit: 1, isPublic: false,
      title: { vi: "Giảm 50.000đ, mỗi SĐT 1 lần", en: "50,000đ off, once per phone" } },
  ];
}

export const SEED_COUPON_USAGE: CouponUsage[] = [
  { code: "MOTLAN", phone: "0912345678", email: "da.dung@example.com", orderCode: "NFSEED001", active: true },
];

// Tham số đề xuất (BRD VII.2), chỉnh được ở màn hình Cấu hình
export function defaultSettings(): Settings {
  return {
    codCap: 5000000, autoConfirmCap: 2000000, freeshipThreshold: 1500000, vatRate: 0.08,
    sessionMinutes: 15, lateWindowHours: 24, quoteMaxAgeMinutes: 30, blockedPhones: ["0909000000"],
    sepayDisabled: false, ghn: "ok", vtp: "ok", waybillFail: false, carrierPickedUp: false, mailFailNext: false,
  };
}

// Thành viên mẫu: điền sẵn Bước 1, "Lưu thông tin cho lần sau"
export const DEMO_MEMBER: Member = {
  id: "m-demo",
  name: "Nguyễn Minh Anh",
  phone: "0901234567",
  email: "minhanh@example.com",
  addresses: [
    { id: "a1", label: "Nhà riêng", name: "Nguyễn Minh Anh", phone: "0901234567", provinceId: "hcm", wardId: "hcm-ben-thanh", line: "65 Lê Lợi", isDefault: true },
    { id: "a2", label: "Công ty", name: "Nguyễn Minh Anh", phone: "0901234567", provinceId: "hn", wardId: "hn-cua-nam", line: "12 Tràng Thi, tầng 5", isDefault: false },
  ],
};
