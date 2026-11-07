import type { Product } from "../types";

// Dữ liệu mẫu để chạy thử luồng thanh toán. Ảnh là ảnh minh họa có giấy phép mở (xem data/photoCredits.ts),
// shop thay bằng ảnh sản phẩm thật. Khi ghép với nền tảng thật, danh mục, giá và tồn kho lấy từ hệ thống quản trị.
export const SEED_PRODUCTS: Product[] = [
  {
    id: "p-oxford",
    image: "/products/oxford-shirt.jpg",
    name: { vi: "Áo sơ mi Oxford dài tay", en: "Long-sleeve Oxford shirt" },
    category: "nam",
    onSale: false,
    variants: [
      { id: "v-oxford-trang-m", sku: "NF-SM01-TR-M", color: { vi: "Trắng", en: "White" }, swatch: "#eef1f4", size: "M", price: 450000, stock: 12, active: true },
      { id: "v-oxford-trang-l", sku: "NF-SM01-TR-L", color: { vi: "Trắng", en: "White" }, swatch: "#eef1f4", size: "L", price: 450000, stock: 1, active: true },
      { id: "v-oxford-xanh-m", sku: "NF-SM01-XN-M", color: { vi: "Xanh nhạt", en: "Light blue" }, swatch: "#bcd0e6", size: "M", price: 450000, stock: 8, active: true },
    ],
  },
  {
    id: "p-linen",
    image: "/products/linen-dress.jpg",
    name: { vi: "Đầm linen cổ vuông", en: "Square-neck linen dress" },
    category: "nu",
    onSale: true,
    variants: [
      { id: "v-linen-be-s", sku: "NF-DL02-XK-S", color: { vi: "Xám khói", en: "Smoke grey" }, swatch: "#9aa5ad", size: "S", price: 595000, compareAt: 850000, stock: 6, active: true },
      { id: "v-linen-be-m", sku: "NF-DL02-XK-M", color: { vi: "Xám khói", en: "Smoke grey" }, swatch: "#9aa5ad", size: "M", price: 595000, compareAt: 850000, stock: 0, active: true },
      { id: "v-linen-navy-s", sku: "NF-DL02-NV-S", color: { vi: "Xanh navy", en: "Navy" }, swatch: "#2b3a55", size: "S", price: 595000, compareAt: 850000, stock: 4, active: true },
    ],
  },
  {
    id: "p-blazer",
    image: "/products/blazer.jpg",
    name: { vi: "Áo blazer dáng suông", en: "Relaxed-fit blazer" },
    category: "nu",
    onSale: false,
    variants: [
      { id: "v-blazer-den-m", sku: "NF-BZ03-DE-M", color: { vi: "Đen", en: "Black" }, swatch: "#23262b", size: "M", price: 1890000, stock: 9, active: true },
      { id: "v-blazer-kem-m", sku: "NF-BZ03-KE-M", color: { vi: "Kem", en: "Cream" }, swatch: "#efe7da", size: "M", price: 1890000, stock: 5, active: true },
    ],
  },
  {
    id: "p-chino",
    image: "/products/chinos.jpg",
    name: { vi: "Quần chino ống đứng", en: "Straight-leg chinos" },
    category: "nam",
    onSale: false,
    variants: [
      { id: "v-chino-reu-30", sku: "NF-QC04-RU-30", color: { vi: "Xanh rêu", en: "Olive" }, swatch: "#6b7257", size: "30", price: 520000, stock: 10, active: true },
      { id: "v-chino-reu-32", sku: "NF-QC04-RU-32", color: { vi: "Xanh rêu", en: "Olive" }, swatch: "#6b7257", size: "32", price: 520000, stock: 7, active: true },
    ],
  },
  {
    id: "p-tote",
    image: "/products/canvas-tote.jpg",
    name: { vi: "Túi tote canvas", en: "Canvas tote bag" },
    category: "phu-kien",
    onSale: false,
    variants: [
      { id: "v-tote-moc", sku: "NF-TT05-MO-F", color: { vi: "Sọc navy", en: "Navy stripe" }, swatch: "#1f2a44", size: "Free size", price: 49000, stock: 30, active: true },
    ],
  },
  {
    id: "p-coat",
    image: "/products/wool-coat.jpg",
    name: { vi: "Áo khoác dạ dáng dài", en: "Long wool coat" },
    category: "nu",
    onSale: false,
    variants: [
      { id: "v-coat-xam-m", sku: "NF-AK06-XA-M", color: { vi: "Xám tro", en: "Ash grey" }, swatch: "#8e9196", size: "M", price: 3200000, stock: 4, active: true },
    ],
  },
];

export const MAX_QTY_PER_VARIANT = 5; // REQ-A5.2.3: tối đa 5 sản phẩm/biến thể/đơn (đề xuất)
