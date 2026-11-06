import type { Province, ShippingZone } from "../types";

// Danh mục địa giới mẫu theo mô hình chính quyền 2 cấp (Tỉnh/Thành – Phường/Xã),
// áp dụng từ 01/07/2025. Bản chạy thật lấy danh mục đầy đủ từ hãng vận chuyển
// (GHN/GHTK) để thống nhất mã địa giới (REQ-A7.1.2).
export const PROVINCES: Province[] = [
  {
    id: "hn",
    name: "Thành phố Hà Nội",
    wards: [
      { id: "hn-hoan-kiem", name: "Phường Hoàn Kiếm" },
      { id: "hn-cua-nam", name: "Phường Cửa Nam" },
      { id: "hn-ba-dinh", name: "Phường Ba Đình" },
      { id: "hn-ngoc-ha", name: "Phường Ngọc Hà" },
      { id: "hn-giang-vo", name: "Phường Giảng Võ" },
      { id: "hn-dong-da", name: "Phường Đống Đa" },
      { id: "hn-lang", name: "Phường Láng" },
      { id: "hn-cau-giay", name: "Phường Cầu Giấy" },
      { id: "hn-tay-ho", name: "Phường Tây Hồ" },
      { id: "hn-hai-ba-trung", name: "Phường Hai Bà Trưng" },
    ],
  },
  {
    id: "hcm",
    name: "Thành phố Hồ Chí Minh",
    wards: [
      { id: "hcm-sai-gon", name: "Phường Sài Gòn" },
      { id: "hcm-ben-thanh", name: "Phường Bến Thành" },
      { id: "hcm-tan-dinh", name: "Phường Tân Định" },
      { id: "hcm-cau-ong-lanh", name: "Phường Cầu Ông Lãnh" },
      { id: "hcm-ban-co", name: "Phường Bàn Cờ" },
      { id: "hcm-xuan-hoa", name: "Phường Xuân Hòa" },
      { id: "hcm-nhieu-loc", name: "Phường Nhiêu Lộc" },
      { id: "hcm-thu-duc", name: "Phường Thủ Đức" },
      { id: "hcm-binh-thanh", name: "Phường Bình Thạnh" },
      { id: "hcm-go-vap", name: "Phường Gò Vấp" },
    ],
  },
  {
    id: "dn",
    name: "Thành phố Đà Nẵng",
    wards: [
      { id: "dn-hai-chau", name: "Phường Hải Châu" },
      { id: "dn-hoa-cuong", name: "Phường Hòa Cường" },
      { id: "dn-thanh-khe", name: "Phường Thanh Khê" },
      { id: "dn-an-hai", name: "Phường An Hải" },
      { id: "dn-son-tra", name: "Phường Sơn Trà" },
      { id: "dn-ngu-hanh-son", name: "Phường Ngũ Hành Sơn" },
      { id: "dn-cam-le", name: "Phường Cẩm Lệ" },
      { id: "dn-lien-chieu", name: "Phường Liên Chiểu" },
    ],
  },
  {
    id: "hp",
    name: "Thành phố Hải Phòng",
    wards: [
      { id: "hp-hong-bang", name: "Phường Hồng Bàng" },
      { id: "hp-ngo-quyen", name: "Phường Ngô Quyền" },
      { id: "hp-le-chan", name: "Phường Lê Chân" },
      { id: "hp-hai-an", name: "Phường Hải An" },
      { id: "hp-kien-an", name: "Phường Kiến An" },
    ],
  },
  {
    id: "ct",
    name: "Thành phố Cần Thơ",
    wards: [
      { id: "ct-ninh-kieu", name: "Phường Ninh Kiều" },
      { id: "ct-cai-khe", name: "Phường Cái Khế" },
      { id: "ct-tan-an", name: "Phường Tân An" },
      { id: "ct-binh-thuy", name: "Phường Bình Thủy" },
      { id: "ct-cai-rang", name: "Phường Cái Răng" },
    ],
  },
  {
    id: "hue",
    name: "Thành phố Huế",
    wards: [
      { id: "hue-thuan-hoa", name: "Phường Thuận Hóa" },
      { id: "hue-phu-xuan", name: "Phường Phú Xuân" },
      { id: "hue-vy-da", name: "Phường Vỹ Dạ" },
      { id: "hue-an-cuu", name: "Phường An Cựu" },
    ],
  },
  {
    id: "kh",
    name: "Tỉnh Khánh Hòa",
    wards: [
      { id: "kh-nha-trang", name: "Phường Nha Trang" },
      { id: "kh-bac-nha-trang", name: "Phường Bắc Nha Trang" },
      { id: "kh-tay-nha-trang", name: "Phường Tây Nha Trang" },
      { id: "kh-nam-nha-trang", name: "Phường Nam Nha Trang" },
    ],
  },
  {
    // Chưa có trong bảng phí: dùng để kiểm thử "Chưa hỗ trợ giao đến khu vực này"
    id: "lc",
    name: "Tỉnh Lai Châu",
    wards: [
      { id: "lc-tan-phong", name: "Phường Tân Phong" },
      { id: "lc-doan-ket", name: "Phường Đoàn Kết" },
    ],
  },
];

// Bảng phí mẫu do admin cấu hình (REQ-A7.2.1): theo vùng, kèm ngưỡng miễn phí ship.
export const SHIPPING_ZONES: ShippingZone[] = [
  { id: "noi-thanh", provinceIds: ["hn", "hcm"], fee: 25000, eta: { vi: "1–2 ngày", en: "1–2 days" } },
  { id: "vung-2", provinceIds: ["dn", "hp", "ct", "hue", "kh"], fee: 35000, eta: { vi: "2–4 ngày", en: "2–4 days" } },
];
export const FREE_SHIPPING_THRESHOLD = 1500000;

export function findProvince(id: string) {
  return PROVINCES.find((p) => p.id === id);
}
export function findWard(provinceId: string, wardId: string) {
  return findProvince(provinceId)?.wards.find((w) => w.id === wardId);
}
export function findZone(provinceId: string) {
  return SHIPPING_ZONES.find((z) => z.provinceIds.includes(provinceId));
}
