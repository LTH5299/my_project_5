export type Lang = "vi" | "en";
export type Localized = { vi: string; en: string };

export type Category = "nam" | "nu" | "phu-kien";

export interface Variant {
  id: string;
  sku: string;
  color: Localized;
  swatch: string;
  size: string;
  price: number; // giá niêm yết, đã gồm VAT
  compareAt?: number;
  stock: number; // tồn khả dụng (đã trừ hàng đang giữ trong phiên thanh toán)
  active: boolean;
}

export interface Product {
  id: string;
  name: Localized;
  image?: string;
  ownPhoto?: boolean;
  category: Category;
  onSale: boolean;
  weightGrams: number; // khối lượng đóng gói chuẩn để báo phí
  variants: Variant[];
}

export interface CartItem { variantId: string; qty: number }

// ---------- Tham số cấu hình (ADM-04) ----------
export interface Settings {
  codCap: number; // trần COD
  autoConfirmCap: number; // trần tự xác nhận COD
  freeshipThreshold: number; // freeship khi tạm tính sau giảm ≥ ngưỡng
  vatRate: number; // 0.08
  sessionMinutes: number; // giữ hàng của phiên thanh toán
  lateWindowHours: number; // cửa sổ nhận tiền đến muộn
  quoteMaxAgeMinutes: number; // báo phí lại nếu nháp quá hạn
  blockedPhones: string[]; // SĐT từng bom hàng
  // Công tắc giả lập (bảng /dev)
  sepayDisabled: boolean;
  ghn: CarrierMode;
  vtp: CarrierMode;
  waybillFail: boolean;
  carrierPickedUp: boolean; // ĐVVC báo đã lấy hàng khi hủy
  mailFailNext: boolean;
}
export type CarrierMode = "ok" | "error" | "timeout" | "unserved";

// ---------- Mã giảm giá ----------
export type CouponType = "percent" | "fixed" | "freeship";
export interface Coupon {
  code: string;
  type: CouponType;
  value: number; // % hoặc số tiền
  maxDiscount?: number; // trần mã %
  shipCap?: number; // trần mã freeship
  minSubtotal: number;
  startsAt: string;
  endsAt: string; // còn hiệu lực tới hết giây này
  totalLimit: number;
  perCustomerLimit: number;
  categories?: Category[];
  excludeSale?: boolean;
  isPublic: boolean; // hiện trong danh sách chọn
  title: Localized;
}
export interface CouponUsage { code: string; phone: string; email: string; orderCode: string; active: boolean }

// ---------- Địa giới, vận chuyển ----------
export interface Province { id: string; name: string; wards: { id: string; name: string }[] }
export type Carrier = "GHN" | "VTP";
export interface ShippingPackage {
  id: string; // GHN-53320
  carrier: Carrier;
  serviceName: Localized;
  fee: number; // đã gồm VAT
  etaDate: string; // ISO ngày giao dự kiến
  cheapest?: boolean;
}

// ---------- Thông tin nhận hàng ----------
export interface Customer { name: string; phone: string; email: string }
export interface Address { provinceId: string; wardId: string; provinceName: string; wardName: string; line: string }

export interface OrderLine {
  variantId: string; productId: string; sku: string; name: Localized; color: Localized; size: string;
  swatch: string; image?: string; price: number; qty: number; weightGrams: number;
}

export interface Money {
  subtotal: number; discount: number; shippingFee: number; shippingDiscount: number; shippingPayable: number;
  total: number; vatRate: number; netAmount: number; vatAmount: number;
}

// ---------- Phiên thanh toán (SM-02) ----------
export type SessionStatus = "pending" | "paid" | "expired" | "closed";
export interface PaymentSession {
  code: string; // NFP + 8 ký tự
  token: string;
  idempotencyKey: string;
  lang: Lang;
  status: SessionStatus;
  createdAt: string;
  expiresAt: string;
  closedAt?: string;
  customer: Customer;
  address: Address;
  note: string;
  items: OrderLine[];
  money: Money;
  couponCode?: string;
  pkg: ShippingPackage;
  memberId?: string;
  orderCode?: string;
  orderToken?: string;
  transactionId?: string;
}

// ---------- Đơn hàng (SM-01) ----------
export type OrderStatus =
  | "pending_confirmation" // Chờ xác nhận (COD lớn / SĐT bị chặn)
  | "paid" // Đã thanh toán (vừa tạo từ phiên SePay)
  | "packing" // Chờ đóng gói
  | "awaiting_pickup" // Chờ lấy hàng (đã có mã vận đơn)
  | "shipping" // Đang giao
  | "delivery_failed" // Giao thất bại
  | "delivered" // Đã giao
  | "returned" // Đã hoàn hàng
  | "canceled"; // Đã hủy
export type PaymentStatus = "cod_unpaid" | "paid" | "cod_reconcile" | "refund_pending" | "refunded";

export interface Shipment {
  carrier: Carrier;
  serviceName: Localized;
  quotedFee: number;
  etaDate: string;
  trackingCode?: string;
  actualFee?: number;
  labelUrl?: string;
  error?: string; // "Lỗi tạo vận đơn: …"
  failCount: number;
}

export interface TimelineEvent { status: OrderStatus | "created" | "waybill" | "waybill_error" | "cancel_requested"; at: string; note?: string }

export interface Order {
  code: string; // NF + 8 ký tự
  token: string;
  lang: Lang;
  createdAt: string;
  method: "cod" | "sepay";
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  autoConfirmed: boolean;
  confirmReason?: "cod_over_cap" | "blocked_phone";
  callAttempts: number;
  memberId?: string;
  customer: Customer;
  address: Address;
  note: string;
  items: OrderLine[];
  money: Money;
  couponCode?: string;
  sessionCode?: string;
  transactionId?: string;
  shipment: Shipment;
  packedWeightGrams?: number;
  cancelReason?: string;
  timeline: TimelineEvent[];
  purchaseTracked: boolean;
  idempotencyKey: string;
}

// ---------- SePay ----------
export interface SepayWebhookPayload {
  id: number | string;
  gateway?: string;
  transactionDate?: string;
  accountNumber?: string;
  code?: string | null;
  content?: string;
  transferType?: "in" | "out";
  transferAmount: number;
  referenceCode?: string;
  description?: string;
}

// Giao dịch cần đối soát (ADM-02)
export type ReconReason = "short" | "over" | "missing_code" | "late" | "unknown_session";
export interface ReconItem {
  transactionId: string;
  receivedAt: string;
  amount: number;
  content: string;
  sessionCode?: string;
  expectedAmount?: number;
  reason: ReconReason;
  lateMinutes?: number;
  status: "open" | "order_created" | "refunded";
  orderCode?: string;
  refundRef?: string;
}

// Yêu cầu hoàn tiền (đơn đã trả bị hủy/hoàn hàng)
export interface RefundRequest { orderCode: string; amount: number; reason: string; createdAt: string; status: "open" | "done"; refundRef?: string }

// Nhật ký tích hợp (NFR-10, ADM-03)
export interface IntegrationLog { at: string; partner: "SePay" | "GHN" | "VTP" | "Email"; action: string; http: number; ms: number; ref?: string; note?: string }

export type MailEvent = "EM-01" | "EM-02" | "EM-03" | "EM-04" | "EM-05";
export interface Mail {
  id: string; dedupeKey: string; to: string; subject: string; html: string; orderCode: string; event: MailEvent;
  status: "sent" | "failed" | "gave_up"; attempts: number; createdAt: string; sentAt?: string; nextAttemptAt?: string; lastError?: string;
}

export interface Member {
  id: string; name: string; phone: string; email: string;
  addresses: { id: string; label: string; name: string; phone: string; provinceId: string; wardId: string; line: string; isDefault: boolean; legacyDistrict?: string; legacyText?: string }[];
}
