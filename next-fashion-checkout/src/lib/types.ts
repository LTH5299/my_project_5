export type Lang = "vi" | "en";
export type Localized = { vi: string; en: string };

export type Category = "nam" | "nu" | "phu-kien";

export interface Variant {
  id: string;
  sku: string;
  color: Localized;
  swatch: string; // màu vải dùng cho ô ảnh thay thế
  size: string;
  price: number; // giá bán hiện hành (VNĐ)
  compareAt?: number; // giá gốc khi đang Sale
  stock: number;
  active: boolean; // false = ngừng bán / ẩn
}

export interface Product {
  id: string;
  name: Localized;
  image?: string; // ảnh minh họa trong /public/products hoặc ảnh shop tải lên (/api/images/…)
  ownPhoto?: boolean; // true khi shop đã thay bằng ảnh của mình (không cần ghi nguồn)
  category: Category;
  onSale: boolean;
  variants: Variant[];
}

export interface CartItem {
  variantId: string;
  qty: number;
}

export type CouponType = "percent" | "fixed" | "freeship";

export interface Coupon {
  code: string;
  type: CouponType;
  value: number; // % hoặc số tiền
  maxDiscount?: number;
  minSubtotal: number;
  startsAt: string; // ISO
  endsAt: string; // ISO, hết hiệu lực khi now >= endsAt
  totalLimit: number;
  perCustomerLimit: number;
  categories?: Category[];
  excludeSale?: boolean;
  description: Localized;
}

export interface CouponUsage {
  code: string;
  phone: string;
  email: string;
  orderCode: string;
  active: boolean; // false khi đơn bị hủy và lượt được trả lại
}

export interface Province {
  id: string;
  name: string;
  wards: { id: string; name: string }[];
}

export interface ShippingZone {
  id: string;
  provinceIds: string[];
  fee: number;
  eta: Localized;
}

export type PaymentMethod = "cod" | "sepay";

export type OrderStatus =
  | "pending_confirmation" // Chờ xác nhận (COD)
  | "awaiting_payment" // Chờ thanh toán (SePay)
  | "packing" // Đang đóng gói (đã chuyển cho Kho)
  | "canceled_timeout" // Đã hủy do quá hạn thanh toán
  | "canceled_qr_error"; // Hủy nội bộ vì SePay không tạo được QR (khách không thấy đơn này)

export type PaymentStatus = "unpaid" | "awaiting" | "paid" | "none";

export interface OrderLine {
  variantId: string;
  productId: string;
  sku: string;
  name: Localized;
  color: Localized;
  size: string;
  swatch: string;
  image?: string;
  price: number;
  qty: number;
}

export interface Address {
  provinceId: string;
  wardId: string;
  provinceName: string;
  wardName: string;
  line: string;
}

export interface Customer {
  name: string;
  phone: string;
  email: string;
}

export interface SepayInfo {
  bankName: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  content: string;
  qrPayload?: string; // chuỗi VietQR (chế độ mock)
  qrImageUrl?: string; // ảnh QR do SePay tạo (chế độ live)
  createdAt: string;
  expiresAt: string;
  paidAt?: string;
  transactionId?: string;
}

export interface Order {
  code: string;
  token: string;
  lang: Lang;
  createdAt: string;
  memberId?: string;
  customer: Customer;
  address: Address;
  note: string;
  items: OrderLine[];
  subtotal: number;
  discount: number;
  shippingFee: number;
  shippingDiscount: number;
  total: number;
  couponCode?: string;
  method: PaymentMethod;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  eta: Localized;
  sepay?: SepayInfo;
  timeline: { status: OrderStatus | "paid"; at: string }[];
  purchaseTracked: boolean;
  idempotencyKey: string;
}

export interface SepayWebhookPayload {
  id: number | string;
  gateway?: string;
  transactionDate?: string;
  accountNumber?: string;
  code?: string | null;
  content?: string;
  transferType?: "in" | "out";
  transferAmount: number;
  accumulated?: number;
  subAccount?: string | null;
  referenceCode?: string;
  description?: string;
}

export type UnmatchedReason =
  | "order_not_found"
  | "order_canceled"
  | "amount_mismatch"
  | "already_paid"
  | "not_sepay_order";

export interface UnmatchedTransaction {
  transactionId: string;
  receivedAt: string;
  amount: number;
  content: string;
  orderCode?: string;
  reason: UnmatchedReason;
  expectedAmount?: number;
}

export type MailEvent = "order_confirmed" | "sepay_paid" | "canceled_timeout";

export interface Mail {
  id: string;
  dedupeKey: string;
  to: string;
  subject: string;
  html: string;
  orderCode: string;
  event: MailEvent;
  status: "queued" | "sent" | "failed";
  attempts: number;
  createdAt: string;
  sentAt?: string;
  nextAttemptAt?: string;
  lastError?: string;
}

export interface Member {
  id: string;
  name: string;
  phone: string;
  email: string;
  addresses: {
    id: string;
    label: string;
    name: string;
    phone: string;
    provinceId: string;
    wardId: string;
    line: string;
    isDefault: boolean;
    legacyDistrict?: string; // địa chỉ lưu theo cấp cũ (còn Quận/Huyện)
    legacyText?: string;
  }[];
}
