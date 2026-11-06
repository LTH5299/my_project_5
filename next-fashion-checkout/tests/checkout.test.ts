import { beforeEach, describe, expect, it } from "vitest";

process.env.NF_DB_MEMORY = "1";

import { resetDb, db, findVariant } from "@/lib/store";
import { placeOrder, quote, getOrder, sweep, type PlaceOrderInput } from "@/lib/orders";
import { handleSepayWebhook, verifyWebhookAuth } from "@/lib/webhook";
import { applyCouponAttempt } from "@/lib/couponGuard";
import { buildVietQrPayload, crc16ccitt, PAYMENT_WINDOW_MS } from "@/lib/sepay";
import { validateAddressLine, validateEmail, validateName, validatePhone, normalizePhone } from "@/lib/validation";
import type { CartItem, PaymentMethod } from "@/lib/types";

const contact = {
  name: "Trần Thu Hà", phone: "0938123456", email: "thuha@example.com",
  provinceId: "hcm", wardId: "hcm-ben-thanh", line: "12 Lê Thánh Tôn", note: "",
};

let keySeq = 0;
function input(items: CartItem[], method: PaymentMethod = "cod", extra: Partial<PlaceOrderInput> = {}): PlaceOrderInput {
  const c = { ...contact, ...(extra.contact ?? {}) };
  const q = quote({ items, provinceId: c.provinceId, wardId: c.wardId, couponCode: extra.couponCode, phone: normalizePhone(c.phone), email: c.email });
  return {
    idempotencyKey: `k${++keySeq}`, items, contact: c, method, agreedTerms: true, lang: "vi",
    expected: { total: q.total, shippingFee: q.shipping.fee, discount: q.discount, lines: q.lines.map((l) => ({ variantId: l.variantId, price: l.price, qty: l.qty })) },
    ...extra,
  };
}

beforeEach(() => resetDb());

describe("Thông tin nhận hàng (A7.1)", () => {
  it("kiểm tra họ tên, SĐT, email, địa chỉ", () => {
    expect(validateName("A")).toBe("name_length");
    expect(validateName("Hà 2")).toBe("name_digits");
    expect(validateName("Trần Thu Hà")).toBeNull();
    expect(validatePhone("0123456789")).toBe("phone_format");
    expect(validatePhone("+84 938 123 456")).toBeNull();
    expect(normalizePhone("84938123456")).toBe("0938123456");
    expect(validateEmail("abc@")).toBe("email_format");
    expect(validateAddressLine("12")).toBe("address_short");
    expect(validateAddressLine("12345 /// ")).toBe("address_meaningless");
    expect(validateAddressLine("12 Lê Lợi")).toBeNull();
  });
});

describe("Phí vận chuyển (A7.2)", () => {
  it("tính theo vùng, miễn phí khi vượt ngưỡng, chặn khu vực chưa hỗ trợ", () => {
    const items = [{ variantId: "v-oxford-trang-m", qty: 1 }];
    expect(quote({ items, provinceId: "hcm", wardId: "hcm-ben-thanh" }).shipping.fee).toBe(25000);
    expect(quote({ items, provinceId: "dn", wardId: "dn-hai-chau" }).shipping.fee).toBe(35000);
    expect(quote({ items, provinceId: "lc", wardId: "lc-tan-phong" }).shipping.status).toBe("unsupported");
    const big = quote({ items: [{ variantId: "v-blazer-den-m", qty: 1 }], provinceId: "hn", wardId: "hn-lang" });
    expect(big.shipping.fee).toBe(0);
    expect(big.shipping.freeByThreshold).toBe(true);
  });
  it("Tổng = Tạm tính − Giảm giá + Phí vận chuyển", () => {
    const q = quote({ items: [{ variantId: "v-oxford-trang-m", qty: 2 }], provinceId: "hcm", wardId: "hcm-ben-thanh", couponCode: "GIAM10" });
    expect(q.subtotal).toBe(900000);
    expect(q.discount).toBe(80000); // 10% = 90.000 nhưng chặn ở mức tối đa 80.000
    expect(q.total).toBe(900000 - 80000 + 25000);
  });
});

describe("Mã giảm giá (A7.3, US-07)", () => {
  const items = [{ variantId: "v-oxford-trang-m", qty: 2 }];
  const at = { provinceId: "hcm", wardId: "hcm-ben-thanh" };
  it("AC-1 mã % bị chặn ở mức giảm tối đa", () => {
    expect(quote({ items, ...at, couponCode: "giam10" }).discount).toBe(80000);
  });
  it("AC-2 freeship chỉ trừ phí ship, tiền hàng không đổi", () => {
    const q = quote({ items, ...at, couponCode: "FREESHIP" });
    expect(q.discount).toBe(0);
    expect(q.shippingPayable).toBe(0);
    expect(q.total).toBe(900000);
  });
  it("AC-3 giảm không vượt tạm tính", () => {
    const q = quote({ items: [{ variantId: "v-tote-moc", qty: 1 }], ...at, couponCode: "GIAM100K" });
    expect(q.discount).toBe(49000);
    expect(q.total).toBe(25000);
  });
  it("biên giá trị tối thiểu: đúng bằng thì áp, thấp hơn thì báo số tiền còn thiếu", () => {
    db().coupons.find((c) => c.code === "GIAM10")!.minSubtotal = 900000;
    expect(quote({ items, ...at, couponCode: "GIAM10" }).coupon?.status).toBe("applied");
    db().coupons.find((c) => c.code === "GIAM10")!.minSubtotal = 900001;
    const r = quote({ items, ...at, couponCode: "GIAM10" }).coupon;
    expect(r).toMatchObject({ status: "invalid", error: "min_not_met", shortfall: 1 });
  });
  it("báo đúng lý do: không tồn tại, hết hạn, chưa đến hạn, hết lượt, không áp dụng, khách đã dùng", () => {
    const err = (code: string, extra = {}) => { const c = quote({ items, ...at, couponCode: code, ...extra }).coupon; return c?.status === "invalid" ? c.error : c?.status; };
    expect(err("KHONGCO")).toBe("not_found");
    expect(err("HETHAN")).toBe("expired");
    expect(err("SAPMO")).toBe("not_started");
    expect(err("HETLUOT")).toBe("out_of_uses");
    expect(quote({ items: [{ variantId: "v-linen-be-s", qty: 1 }], ...at, couponCode: "NAM15" }).coupon).toMatchObject({ error: "not_applicable" });
    expect(quote({ items: [{ variantId: "v-linen-be-s", qty: 1 }], ...at, couponCode: "KHONGSALE" }).coupon).toMatchObject({ error: "not_applicable" });
    expect(err("MOTLAN")).toBe("applied"); // khách vãng lai chưa nhập SĐT: áp thử
    expect(err("MOTLAN", { phone: "0912345678" })).toBe("used_by_customer"); // kiểm tra lại khi có SĐT
  });
  it("mã hết hạn đúng thời điểm kết thúc được coi là hết hiệu lực", () => {
    const c = db().coupons.find((x) => x.code === "GIAM10")!;
    const end = new Date(c.endsAt);
    expect(quote({ items, ...at, couponCode: "GIAM10", now: new Date(end.getTime() - 1) }).coupon?.status).toBe("applied");
    expect(quote({ items, ...at, couponCode: "GIAM10", now: end }).coupon).toMatchObject({ error: "expired" });
  });
  it("AC-4 đã có mã thì không áp thêm mã thứ hai", () => {
    expect(applyCouponAttempt("c1", { items, ...at, couponCode: "FREESHIP", appliedCode: "GIAM10" }).status).toBe("already_applied");
  });
  it("nhập sai 5 lần liên tiếp thì khóa 10 phút", () => {
    const now = new Date();
    for (let i = 0; i < 4; i++) expect(applyCouponAttempt("c2", { items, ...at, couponCode: "SAI" + i }, now).status).toBe("invalid");
    const fifth = applyCouponAttempt("c2", { items, ...at, couponCode: "SAI5" }, now);
    expect(fifth).toMatchObject({ status: "invalid", attemptsLeft: 0 });
    expect(applyCouponAttempt("c2", { items, ...at, couponCode: "GIAM10" }, now).status).toBe("locked");
    const later = new Date(now.getTime() + 10 * 60 * 1000 + 1);
    expect(applyCouponAttempt("c2", { items, ...at, couponCode: "GIAM10" }, later).status).toBe("applied");
  });
  it("lượt dùng chỉ bị tính khi đơn tạo thành công", async () => {
    const before = db().couponUsage.length;
    quote({ items, ...at, couponCode: "GIAM10" });
    expect(db().couponUsage.length).toBe(before);
    const r = await placeOrder(input(items, "cod", { couponCode: "GIAM10" }));
    expect(r.ok).toBe(true);
    expect(db().couponUsage.filter((u) => u.code === "GIAM10").length).toBe(1);
  });
});

describe("Đặt hàng (A7.5)", () => {
  it("COD: tạo đơn Chờ xác nhận, trừ tồn, gửi email xác nhận", async () => {
    const r = await placeOrder(input([{ variantId: "v-oxford-trang-m", qty: 2 }]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.order.code).toMatch(/^NF\d{10}$/);
    expect(r.order).toMatchObject({ status: "pending_confirmation", paymentStatus: "unpaid", total: 925000 });
    expect(findVariant("v-oxford-trang-m")!.variant.stock).toBe(10);
    expect(db().outbox.filter((m) => m.orderCode === r.order.code && m.event === "order_confirmed")).toHaveLength(1);
  });
  it("bấm nhiều lần với cùng khóa chỉ tạo 1 đơn", async () => {
    const inp = input([{ variantId: "v-oxford-trang-m", qty: 1 }]);
    const [a, b] = await Promise.all([placeOrder(inp), placeOrder(inp)]);
    expect(a.ok && b.ok && a.order.code === b.order.code).toBe(true);
    expect(db().orders).toHaveLength(1);
    expect(findVariant("v-oxford-trang-m")!.variant.stock).toBe(11);
  });
  it("hai khách cùng đặt sản phẩm cuối: chỉ đơn đầu được tạo, tồn không âm", async () => {
    const items = [{ variantId: "v-oxford-trang-l", qty: 1 }];
    const a = input(items);
    const b = input(items, "cod", { contact: { ...contact, phone: "0909000111", email: "b@example.com" } });
    const [ra, rb] = await Promise.all([placeOrder(a), placeOrder(b)]);
    expect(ra.ok).toBe(true);
    expect(rb).toMatchObject({ ok: false, error: "out_of_stock" });
    expect(findVariant("v-oxford-trang-l")!.variant.stock).toBe(0);
  });
  it("giá thay đổi lúc bấm Đặt hàng: không tạo đơn, báo rõ thay đổi", async () => {
    const inp = input([{ variantId: "v-chino-reu-30", qty: 1 }]);
    findVariant("v-chino-reu-30")!.variant.price = 560000;
    const r = await placeOrder(inp);
    expect(r).toMatchObject({ ok: false, error: "changed" });
    if (!r.ok && r.error === "changed") expect(r.changes.map((c) => c.type)).toEqual(expect.arrayContaining(["price", "total"]));
    expect(db().orders).toHaveLength(0);
  });
  it("mã hết hạn lúc bấm Đặt hàng: không tạo đơn", async () => {
    const items = [{ variantId: "v-oxford-trang-m", qty: 2 }];
    const inp = input(items, "cod", { couponCode: "GIAM10" });
    db().coupons.find((c) => c.code === "GIAM10")!.endsAt = new Date(Date.now() - 1000).toISOString();
    const r = await placeOrder(inp);
    expect(r).toMatchObject({ ok: false, error: "changed" });
  });
  it("chưa đồng ý điều khoản thì không đặt được", async () => {
    expect(await placeOrder({ ...input([{ variantId: "v-tote-moc", qty: 1 }]), agreedTerms: false })).toMatchObject({ error: "terms_required" });
  });
  it("đơn trên 5.000.000đ không được chọn COD", async () => {
    const r = await placeOrder(input([{ variantId: "v-coat-xam-m", qty: 2 }]));
    expect(r).toMatchObject({ ok: false, error: "cod_not_allowed" });
  });
  it("mỗi SĐT tối đa 3 đơn đang chờ", async () => {
    for (let i = 0; i < 3; i++) expect((await placeOrder(input([{ variantId: "v-tote-moc", qty: 1 }]))).ok).toBe(true);
    expect(await placeOrder(input([{ variantId: "v-tote-moc", qty: 1 }]))).toMatchObject({ error: "pending_limit" });
  });
  it("khu vực chưa có phí ship: chặn đặt hàng", async () => {
    const r = await placeOrder(input([{ variantId: "v-tote-moc", qty: 1 }], "cod", { contact: { ...contact, provinceId: "lc", wardId: "lc-tan-phong" } }));
    expect(r).toMatchObject({ error: "shipping_unsupported" });
  });
  it("không xem được đơn khi sai mã truy cập", async () => {
    const r = await placeOrder(input([{ variantId: "v-tote-moc", qty: 1 }]));
    if (!r.ok) throw new Error();
    expect(getOrder(r.order.code, "sai")).toBeUndefined();
    expect(getOrder(r.order.code, r.order.token)?.code).toBe(r.order.code);
  });
});

describe("SePay VietQR (A7.4.2, US-11)", () => {
  async function sepayOrder() {
    const r = await placeOrder(input([{ variantId: "v-linen-navy-s", qty: 1 }], "sepay"));
    if (!r.ok) throw new Error(JSON.stringify(r));
    return r.order;
  }
  const hook = (id: string, content: string, amount: number, now?: Date) =>
    handleSepayWebhook({ id, gateway: "MBBank", content, transferAmount: amount, transferType: "in" }, now);

  it("AC-1 tạo QR: số tiền = tổng, nội dung = mã đơn, hạn 15 phút", async () => {
    const o = await sepayOrder();
    expect(o).toMatchObject({ status: "awaiting_payment", paymentStatus: "awaiting", total: 620000 });
    expect(o.sepay!.content).toBe(o.code);
    expect(Date.parse(o.sepay!.expiresAt) - Date.parse(o.sepay!.createdAt)).toBe(PAYMENT_WINDOW_MS);
    expect(o.sepay!.qrPayload).toContain(`5406620000`);
    expect(o.sepay!.qrPayload).toContain(o.code);
    expect(findVariant("v-linen-navy-s")!.variant.stock).toBe(3);
  });
  it("chuỗi VietQR có CRC hợp lệ", () => {
    const p = buildVietQrPayload({ bin: "970422", account: "0000000000", amount: 1000, content: "NF2611060001" });
    expect(crc16ccitt(p.slice(0, -4))).toBe(p.slice(-4));
    expect(crc16ccitt("123456789")).toBe("29B1");
  });
  it("AC-2 webhook khớp: Đã thanh toán, chuyển Kho, gửi email", async () => {
    const o = await sepayOrder();
    expect(hook("t1", `MBVCB.123 ${o.code} chuyen tien`, o.total)).toEqual({ result: "paid", orderCode: o.code });
    expect(o).toMatchObject({ paymentStatus: "paid", status: "packing" });
    expect(db().outbox.filter((m) => m.orderCode === o.code && m.event === "sepay_paid")).toHaveLength(1);
  });
  it("AC-3 webhook trùng chỉ xử lý 1 lần, không gửi email trùng", async () => {
    const o = await sepayOrder();
    hook("t1", o.code, o.total);
    expect(hook("t1", o.code, o.total)).toEqual({ result: "duplicate" });
    expect(db().outbox.filter((m) => m.event === "sepay_paid")).toHaveLength(1);
  });
  it("AC-4 hết 15 phút: hủy đơn, hoàn tồn", async () => {
    const o = await sepayOrder();
    sweep(new Date(Date.parse(o.sepay!.expiresAt)));
    expect(o.status).toBe("canceled_timeout");
    expect(findVariant("v-linen-navy-s")!.variant.stock).toBe(4);
    expect(db().outbox.filter((m) => m.event === "canceled_timeout")).toHaveLength(1);
  });
  it("AC-5 chuyển tiền sau khi đơn đã hủy: không khôi phục, ghi Không khớp đơn", async () => {
    const o = await sepayOrder();
    sweep(new Date(Date.parse(o.sepay!.expiresAt) + 1000));
    expect(hook("t2", o.code, o.total)).toMatchObject({ result: "unmatched", reason: "order_canceled" });
    expect(o.status).toBe("canceled_timeout");
    expect(db().unmatched[0]).toMatchObject({ orderCode: o.code, reason: "order_canceled" });
  });
  it("AC-6 lệch 1đ: không ghi nhận, đơn giữ nguyên", async () => {
    const o = await sepayOrder();
    expect(hook("t3", o.code, o.total - 1)).toMatchObject({ result: "unmatched", reason: "amount_mismatch" });
    expect(o.status).toBe("awaiting_payment");
    expect(hook("t4", "chuyen tien khong ghi ma", o.total)).toMatchObject({ result: "unmatched", reason: "order_not_found" });
  });
  it("biên thời gian: còn 1 giây thì ghi nhận, đúng 00:00 thì không", async () => {
    const o1 = await sepayOrder();
    expect(hook("t5", o1.code, o1.total, new Date(Date.parse(o1.sepay!.expiresAt) - 1000)).result).toBe("paid");
    const o2 = await placeOrder(input([{ variantId: "v-linen-be-s", qty: 1 }], "sepay"));
    if (!o2.ok) throw new Error();
    expect(hook("t6", o2.order.code, o2.order.total, new Date(Date.parse(o2.order.sepay!.expiresAt)))).toMatchObject({ reason: "order_canceled" });
  });
  it("AC-7 SePay lỗi tạo QR: hủy đơn vừa tạo, hoàn tồn và lượt mã, không để đơn treo", async () => {
    db().settings.sepayFailNext = true;
    const r = await placeOrder(input([{ variantId: "v-oxford-trang-m", qty: 2 }], "sepay", { couponCode: "GIAM10" }));
    expect(r).toMatchObject({ ok: false, error: "sepay_error" });
    expect(findVariant("v-oxford-trang-m")!.variant.stock).toBe(12);
    expect(db().couponUsage.filter((u) => u.code === "GIAM10" && u.active)).toHaveLength(0);
    expect(db().orders.filter((o) => o.status === "awaiting_payment")).toHaveLength(0);
  });
  it("xác thực header webhook", () => {
    expect(verifyWebhookAuth("Apikey dev-sepay-key", "dev-sepay-key")).toBe(true);
    expect(verifyWebhookAuth("Bearer x", "dev-sepay-key")).toBe(false);
    expect(verifyWebhookAuth(null, "dev-sepay-key")).toBe(false);
  });
});

describe("Email (A7.6.2)", () => {
  it("gửi lỗi thì đơn vẫn tạo được và hệ thống gửi lại", async () => {
    db().settings.mailFailNext = true;
    const r = await placeOrder(input([{ variantId: "v-tote-moc", qty: 1 }]));
    expect(r.ok).toBe(true);
    const m = db().outbox[0];
    expect(m.status).toBe("failed");
    sweep(new Date(Date.now() + 61_000));
    expect(m.status).toBe("sent");
    expect(m.attempts).toBe(2);
  });
});
