import type { Coupon, Member } from "../types";

const DAY = 24 * 3600 * 1000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

// Bộ mã mẫu do Marketing tạo trên Site quản trị. Mỗi mã tương ứng một trường hợp kiểm thử.
export function seedCoupons(): Coupon[] {
  return [
    { code: "GIAM10", type: "percent", value: 10, maxDiscount: 80000, minSubtotal: 500000, startsAt: iso(-10), endsAt: iso(30), totalLimit: 500, perCustomerLimit: 1,
      description: { vi: "Giảm 10%, tối đa 80.000đ cho đơn từ 500.000đ", en: "10% off, up to 80,000đ on orders from 500,000đ" } },
    { code: "GIAM100K", type: "fixed", value: 100000, minSubtotal: 0, startsAt: iso(-10), endsAt: iso(30), totalLimit: 500, perCustomerLimit: 2,
      description: { vi: "Giảm 100.000đ", en: "100,000đ off" } },
    { code: "FREESHIP", type: "freeship", value: 0, minSubtotal: 300000, startsAt: iso(-10), endsAt: iso(30), totalLimit: 1000, perCustomerLimit: 3,
      description: { vi: "Miễn phí vận chuyển cho đơn từ 300.000đ", en: "Free shipping on orders from 300,000đ" } },
    { code: "NAM15", type: "percent", value: 15, maxDiscount: 150000, minSubtotal: 0, startsAt: iso(-10), endsAt: iso(30), totalLimit: 200, perCustomerLimit: 1, categories: ["nam"],
      description: { vi: "Giảm 15% cho sản phẩm thời trang Nam", en: "15% off menswear" } },
    { code: "KHONGSALE", type: "percent", value: 20, maxDiscount: 200000, minSubtotal: 0, startsAt: iso(-10), endsAt: iso(30), totalLimit: 200, perCustomerLimit: 1, excludeSale: true,
      description: { vi: "Giảm 20%, không áp dụng cho hàng Sale", en: "20% off, excludes sale items" } },
    { code: "HETHAN", type: "fixed", value: 50000, minSubtotal: 0, startsAt: iso(-40), endsAt: iso(-1), totalLimit: 100, perCustomerLimit: 1,
      description: { vi: "Mã đã hết hạn", en: "Expired code" } },
    { code: "SAPMO", type: "fixed", value: 50000, minSubtotal: 0, startsAt: iso(5), endsAt: iso(30), totalLimit: 100, perCustomerLimit: 1,
      description: { vi: "Mã chưa đến ngày áp dụng", en: "Code not yet active" } },
    { code: "HETLUOT", type: "fixed", value: 50000, minSubtotal: 0, startsAt: iso(-10), endsAt: iso(30), totalLimit: 0, perCustomerLimit: 1,
      description: { vi: "Mã đã hết lượt dùng", en: "Code fully redeemed" } },
    { code: "MOTLAN", type: "fixed", value: 30000, minSubtotal: 0, startsAt: iso(-10), endsAt: iso(30), totalLimit: 100, perCustomerLimit: 1,
      description: { vi: "Mỗi khách dùng 1 lần (SĐT 0912345678 đã dùng)", en: "Once per customer (0912345678 has used it)" } },
  ];
}

export const SEED_COUPON_USAGE = [
  { code: "MOTLAN", phone: "0912345678", email: "da.dung@example.com", orderCode: "NF2610010001", active: true },
];

// Tài khoản thành viên mẫu để kiểm thử sổ địa chỉ (UC-03).
export const DEMO_MEMBER: Member = {
  id: "m-demo",
  name: "Nguyễn Minh Anh",
  phone: "0901234567",
  email: "minhanh@example.com",
  addresses: [
    { id: "a1", label: "Nhà riêng", name: "Nguyễn Minh Anh", phone: "0901234567", provinceId: "hcm", wardId: "hcm-ben-thanh", line: "65 Lê Lợi", isDefault: true },
    { id: "a2", label: "Công ty", name: "Nguyễn Minh Anh", phone: "0901234567", provinceId: "hn", wardId: "hn-cua-nam", line: "12 Tràng Thi, tầng 5", isDefault: false },
    { id: "a3", label: "Nhà bố mẹ (địa chỉ cũ)", name: "Nguyễn Văn Hùng", phone: "0987654321", provinceId: "", wardId: "", line: "27 Nguyễn Huệ", isDefault: false,
      legacyDistrict: "Quận 1", legacyText: "27 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh" },
    { id: "a4", label: "Nhà bạn", name: "Lò Thị Mai", phone: "0912000111", provinceId: "lc", wardId: "lc-tan-phong", line: "8 Trần Hưng Đạo", isDefault: false },
  ],
};
