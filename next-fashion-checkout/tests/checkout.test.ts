import { beforeEach, describe, expect, it } from "vitest";

process.env.NF_DB_MEMORY = "1";

import { resetDb, db, findVariant } from "@/lib/store";
import { quoteCheckout, type SeenMoney } from "@/lib/quote";
import { submitCheckout, closeSession, expireSessions, findSession, findOrder, cancelOrder, confirmCod, recordCall, cancelUnreachable, packOrder, retryWaybill, handleCarrierEvent, accessOrder, type CheckoutInput } from "@/lib/orders";
import { handleSepayWebhook, reconCreateOrder, reconRefund } from "@/lib/webhook";
import { applyCouponAttempt } from "@/lib/couponGuard";
import { buildVietQrPayload, crc16ccitt } from "@/lib/sepay";
import { computeMoney, evaluateCoupon, type Lookup, type QuoteLine } from "@/lib/pricing";
import { quoteShipping } from "@/lib/shipping";
import { validateContact, validateName, validatePhone, validateEmail, normalizePhone } from "@/lib/validation";
import type { CartItem, Settings } from "@/lib/types";

const contact = { name: "Trần Thu Hà", phone: "0938123456", email: "thuha@example.com" };
const addr = { provinceId: "hcm", wardId: "hcm-ben-thanh", line: "12 Lê Thánh Tôn" };
let seq = 0;

function input(items: CartItem[], method: "cod" | "sepay" = "cod", extra: Partial<CheckoutInput> = {}): CheckoutInput {
  const customer = { ...contact, ...(extra.customer ?? {}) };
  const address = { ...addr, ...(extra.address ?? {}) };
  const q = quoteCheckout({ items, provinceId: address.provinceId, wardId: address.wardId, pkgId: extra.pkgId, couponCode: extra.couponCode, phone: customer.phone, email: customer.email });
  const seen: SeenMoney = {
    subtotal: q.money.subtotal, discount: q.money.discount, shippingPayable: q.money.shippingPayable, total: q.money.total, vatRate: q.money.vatRate,
    pkgFee: q.pkg?.fee ?? 0, lines: q.lines.map((l) => ({ variantId: l.variantId, qty: l.qty, price: l.price })),
  };
  return { items, note: "", pkgId: q.pkg?.id ?? "", method, lang: "vi", idempotencyKey: `k${++seq}`, agreed: true, seen, ...extra, customer, address } as CheckoutInput;
}
const stock = (id: string) => findVariant(id)!.variant.stock;
const OX = "v-oxford-trang-m"; // 450.000đ, Nam
const COAT = "v-coat-xam-m"; // 3.200.000đ
const BLAZER = "v-blazer-den-m"; // 1.890.000đ

beforeEach(() => resetDb());

// ---------- Bước 1 ----------
describe("Bước 1 – Thông tin nhận hàng (AC-02)", () => {
  it("kiểm tra họ tên, SĐT, email, địa chỉ, ghi chú", () => {
    expect(validateName("A")).toBe("name_invalid");
    expect(validateName("Hà 2")).toBe("name_invalid");
    expect(validateName("Trần Thu Hà")).toBeNull();
    expect(validatePhone("0123456789")).toBeNull();
    expect(validatePhone("123456789")).toBe("phone_format");
    expect(normalizePhone("+84 938 123 456")).toBe("0938123456");
    expect(validateEmail("abc@")).toBe("email_format");
    const e = validateContact({ name: "", phone: "1", email: "x", provinceId: "hcm", wardId: "", line: "12", note: "x".repeat(201) });
    expect(e).toMatchObject({ name: "name_invalid", phone: "phone_format", email: "email_format", wardId: "ward_required", line: "address_short", note: "note_long" });
  });
});

// ---------- Bước 2: báo phí ----------
describe("Bước 2 – Phí giao hàng (AC-03)", () => {
  it("AC-03.1 báo phí song song, chọn sẵn gói rẻ nhất", () => {
    const r = quoteShipping("hcm", "hcm-ben-thanh", 800, db().settings);
    expect(r.status).toBe("ok");
    expect(r.packages.map((p) => p.fee)).toEqual([30000, 32000, 36000]);
    expect(r.packages[0]).toMatchObject({ carrier: "GHN", cheapest: true });
  });
  it("AC-03.2 một hãng lỗi chỉ hiện hãng còn lại", () => {
    db().settings.ghn = "timeout";
    const r = quoteShipping("hcm", "hcm-ben-thanh", 800, db().settings);
    expect(r.packages.every((p) => p.carrier === "VTP")).toBe(true);
    expect(r.packages[0].cheapest).toBe(true);
  });
  it("AC-03.3 cả hai lỗi → error (MSG-03); cả hai không phục vụ → unserved (MSG-02)", () => {
    db().settings.ghn = "error"; db().settings.vtp = "timeout";
    expect(quoteShipping("hcm", "hcm-ben-thanh", 800, db().settings).status).toBe("error");
    resetDb();
    expect(quoteShipping("lc", "lc-tan-phong", 800, db().settings).status).toBe("unserved");
  });
  it("AC-03.4 freeship khi tạm tính sau giảm ≥ 1.500.000đ", () => {
    const q = quoteCheckout({ items: [{ variantId: BLAZER, qty: 1 }], ...addr });
    expect(q.money.shippingPayable).toBe(0);
    const q2 = quoteCheckout({ items: [{ variantId: OX, qty: 1 }], ...addr });
    expect(q2.money.shippingPayable).toBe(30000);
    expect(q2.freeshipRemaining).toBe(1050000);
  });
  it("phụ phí khối lượng trên 1kg", () => {
    expect(quoteShipping("hcm", "hcm-ben-thanh", 1600, db().settings).packages[0].fee).toBe(40000);
  });
});

// ---------- Mã giảm giá ----------
function fakeLookup(): Lookup { return { findVariant: () => undefined, coupons: db().coupons, couponUsage: db().couponUsage }; }
function line(price: number, extra: Partial<QuoteLine> = {}): QuoteLine {
  return { variantId: "x" + price, productId: "p", sku: "s", name: { vi: "", en: "" }, color: { vi: "", en: "" }, size: "M", swatch: "#000", category: "nam", onSale: false, weightGrams: 300, price, qty: 1, requestedQty: 1, available: 10, lineTotal: price, state: "ok", ...extra };
}
const now = () => new Date();

describe("Mã giảm giá (AC-04, SRS III.4)", () => {
  it("GIAM10: 10%, tối đa 80.000đ, cần ≥ 500.000đ", () => {
    expect(evaluateCoupon("giam10", [line(600000)], 0, fakeLookup(), { now: now() })).toMatchObject({ status: "applied", discount: 60000 });
    expect(evaluateCoupon("GIAM10", [line(1000000)], 0, fakeLookup(), { now: now() })).toMatchObject({ discount: 80000 });
    expect(evaluateCoupon("GIAM10", [line(450000)], 0, fakeLookup(), { now: now() })).toMatchObject({ status: "invalid", error: "min_not_met", shortfall: 50000 });
  });
  it("GIAM100K, FREESHIP (phí 35k → trả 5k)", () => {
    expect(evaluateCoupon("GIAM100K", [line(800000)], 0, fakeLookup(), { now: now() })).toMatchObject({ discount: 100000 });
    expect(evaluateCoupon("FREESHIP", [line(300000)], 35000, fakeLookup(), { now: now() })).toMatchObject({ shippingDiscount: 30000 });
  });
  it("NAM15 chỉ tính dòng Nam: 333.333 → 49.999", () => {
    const r = evaluateCoupon("NAM15", [line(333333), line(500000, { category: "nu" })], 0, fakeLookup(), { now: now() });
    expect(r).toMatchObject({ status: "applied", discount: 49999 });
    expect(evaluateCoupon("NAM15", [line(500000, { category: "nu" })], 0, fakeLookup(), { now: now() })).toMatchObject({ error: "not_applicable" });
  });
  it("KHONGSALE, HETHAN, SAPMO, HETLUOT, MOTLAN, mã không tồn tại", () => {
    expect(evaluateCoupon("KHONGSALE", [line(500000, { onSale: true })], 0, fakeLookup(), { now: now() })).toMatchObject({ error: "sale_excluded" });
    expect(evaluateCoupon("KHONGSALE", [line(500000, { onSale: true }), line(400000)], 0, fakeLookup(), { now: now() })).toMatchObject({ discount: 80000 });
    expect(evaluateCoupon("HETHAN", [line(500000)], 0, fakeLookup(), { now: now() })).toMatchObject({ error: "expired" });
    expect(evaluateCoupon("SAPMO", [line(500000)], 0, fakeLookup(), { now: now() })).toMatchObject({ error: "not_started" });
    expect(evaluateCoupon("HETLUOT", [line(500000)], 0, fakeLookup(), { now: now() })).toMatchObject({ error: "out_of_uses" });
    expect(evaluateCoupon("MOTLAN", [line(500000)], 0, fakeLookup(), { phone: "0912345678", now: now() })).toMatchObject({ error: "used_by_customer" });
    expect(evaluateCoupon("MOTLAN", [line(500000)], 0, fakeLookup(), { phone: "0938123456", now: now() })).toMatchObject({ status: "applied", discount: 50000 });
    expect(evaluateCoupon("KHONGCO", [line(500000)], 0, fakeLookup(), { now: now() })).toMatchObject({ error: "not_found" });
  });
  it("mã còn hiệu lực tới hết giây cuối", () => {
    const c = db().coupons.find((x) => x.code === "GIAM10")!;
    const end = new Date(c.endsAt);
    expect(evaluateCoupon("GIAM10", [line(600000)], 0, fakeLookup(), { now: end }).status).toBe("applied");
    expect(evaluateCoupon("GIAM10", [line(600000)], 0, fakeLookup(), { now: new Date(end.getTime() + 1000) }).status).toBe("invalid");
  });
  it("gõ sai 5 lần liên tiếp → khóa 10 phút", () => {
    const base = { items: [{ variantId: OX, qty: 2 }], ...addr, typed: true };
    for (let i = 0; i < 4; i++) expect(applyCouponAttempt("c1", { ...base, couponCode: "SAI" + i }).status).toBe("invalid");
    const r5 = applyCouponAttempt("c1", { ...base, couponCode: "SAI5" });
    expect(r5).toMatchObject({ status: "invalid", attemptsLeft: 0 });
    expect(applyCouponAttempt("c1", { ...base, couponCode: "GIAM10" }).status).toBe("locked");
    expect(applyCouponAttempt("c1", { ...base, couponCode: "GIAM10" }, new Date(Date.now() + 11 * 60_000)).status).toBe("applied");
  });
});

// ---------- VAT ----------
describe("VAT đã gồm trong giá (AC-06)", () => {
  it("AC-06.1: 950.000 → chưa thuế 879.630, thuế 70.370", () => {
    const s = db().settings as Settings;
    const m = computeMoney([line(920000)], { id: "x", carrier: "GHN", serviceName: { vi: "", en: "" }, fee: 30000, etaDate: "2026-12-01" }, undefined, s);
    expect(m.total).toBe(950000);
    expect(m.netAmount).toBe(879630);
    expect(m.vatAmount).toBe(70370);
  });
});

// ---------- COD ----------
describe("Đặt COD (UC-05, AC-08)", () => {
  it("đơn ≤ 2 triệu tự xác nhận, trừ tồn, tạo vận đơn ngay, gửi EM-01 + EM-03", () => {
    const before = stock(OX);
    const r = submitCheckout(input([{ variantId: OX, qty: 2 }]));
    expect(r.status).toBe("order");
    const o = findOrder((r as { code: string }).code)!;
    expect(o.code).toMatch(/^NF[A-Z0-9]{8}$/);
    expect(o.status).toBe("awaiting_pickup");
    expect(o.shipment.trackingCode).toBeTruthy();
    expect(stock(OX)).toBe(before - 2);
    expect(db().outbox.map((m) => m.event).sort()).toEqual(["EM-01", "EM-03"]);
  });
  it("đơn > 2 triệu chờ CSKH xác nhận, chưa có vận đơn; CSKH xác nhận → tạo vận đơn", () => {
    const r = submitCheckout(input([{ variantId: COAT, qty: 1 }])) as { code: string };
    const o = findOrder(r.code)!;
    expect(o).toMatchObject({ status: "pending_confirmation", confirmReason: "cod_over_cap" });
    expect(o.shipment.trackingCode).toBeUndefined();
    expect(confirmCod(o.code)).toBe(true);
    expect(o.status).toBe("awaiting_pickup");
  });
  it("SĐT từng bom hàng phải chờ xác nhận", () => {
    const r = submitCheckout(input([{ variantId: OX, qty: 1 }], "cod", { customer: { ...contact, phone: "0909000000" } })) as { code: string };
    expect(findOrder(r.code)!.confirmReason).toBe("blocked_phone");
  });
  it("Tổng > 5 triệu không cho COD", () => {
    expect(submitCheckout(input([{ variantId: BLAZER, qty: 3 }]))).toMatchObject({ status: "error", error: "cod_over_cap" });
  });
  it("SĐT đã có 3 đơn COD chờ xác nhận thì từ chối", () => {
    for (let i = 0; i < 3; i++) expect(submitCheckout(input([{ variantId: COAT, qty: 1 }])).status).toBe("order");
    expect(submitCheckout(input([{ variantId: OX, qty: 1 }]))).toMatchObject({ error: "cod_pending_limit" });
  });
  it("bấm hai lần cùng khóa chỉ tạo một đơn", () => {
    const i = input([{ variantId: OX, qty: 1 }]);
    const a = submitCheckout(i) as { code: string };
    const b = submitCheckout(i) as { code: string };
    expect(a.code).toBe(b.code);
    expect(db().orders.length).toBe(1);
  });
  it("trừ lượt mã khi tạo đơn", () => {
    const r = submitCheckout(input([{ variantId: OX, qty: 2 }], "cod", { couponCode: "GIAM10" })) as { code: string };
    expect(findOrder(r.code)!.money.discount).toBe(80000);
    expect(db().couponUsage.some((u) => u.orderCode === r.code && u.active)).toBe(true);
  });
});

// ---------- Kiểm tra lại lúc bấm đặt ----------
describe("Kiểm tra lại khi bấm đặt (MSG-04)", () => {
  it("giá, tồn, phí, VAT đổi → báo danh sách thay đổi, không tạo đơn", () => {
    const i = input([{ variantId: OX, qty: 2 }]);
    findVariant(OX)!.variant.price = 470000;
    db().settings.vatRate = 0.1;
    const r = submitCheckout(i);
    expect(r.status).toBe("changed");
    const kinds = (r as { changes: { kind: string }[] }).changes.map((c) => c.kind);
    expect(kinds).toEqual(expect.arrayContaining(["price", "vat"]));
    expect(db().orders.length).toBe(0);
  });
  it("hết hàng → mở lại giỏ", () => {
    const i = input([{ variantId: OX, qty: 2 }]);
    findVariant(OX)!.variant.stock = 1;
    expect(submitCheckout(i)).toMatchObject({ status: "changed", changes: [{ kind: "stock" }] });
  });
  it("chưa đồng ý điều khoản", () => {
    expect(submitCheckout({ ...input([{ variantId: OX, qty: 1 }]), agreed: false })).toMatchObject({ error: "terms" });
  });
});

// ---------- SePay ----------
const pay = (code: string, amount: number, id: string | number = Math.random()) => handleSepayWebhook({ id, transferType: "in", transferAmount: amount, content: `CK ${code}`, code });

describe("Phiên SePay NFP (UC-06/07, AC-07)", () => {
  it("tạo phiên giữ hàng 15 phút, chưa phải đơn", () => {
    const before = stock(OX);
    const r = submitCheckout(input([{ variantId: OX, qty: 1 }], "sepay"));
    expect(r.status).toBe("session");
    const x = findSession((r as { code: string }).code)!;
    expect(x.code).toMatch(/^NFP[A-Z0-9]{8}$/);
    expect(Date.parse(x.expiresAt) - Date.parse(x.createdAt)).toBe(15 * 60_000);
    expect(stock(OX)).toBe(before - 1);
    expect(db().orders.length).toBe(0);
    expect(db().outbox.length).toBe(0);
  });
  it("AC-07.1 đúng mã + đúng tiền → đơn Đã thanh toán, có vận đơn, gửi EM-02", () => {
    const r = submitCheckout(input([{ variantId: OX, qty: 1 }], "sepay")) as { code: string };
    const x = findSession(r.code)!;
    const before = stock(OX);
    const w = pay(x.code, x.money.total, 1001);
    expect(w.result).toBe("paid");
    const o = findOrder((w as { orderCode: string }).orderCode)!;
    expect(o).toMatchObject({ method: "sepay", paymentStatus: "paid", status: "awaiting_pickup" });
    expect(stock(OX)).toBe(before); // không trừ tồn lần hai
    expect(db().outbox.map((m) => m.event)).toEqual(expect.arrayContaining(["EM-02", "EM-03"]));
    expect(x.status).toBe("paid");
  });
  it("AC-07.2 webhook trùng không xử lý lại", () => {
    const r = submitCheckout(input([{ variantId: OX, qty: 1 }], "sepay")) as { code: string };
    const x = findSession(r.code)!;
    pay(x.code, x.money.total, 77);
    expect(pay(x.code, x.money.total, 77).result).toBe("duplicate");
    expect(db().orders.length).toBe(1);
  });
  it("AC-07.3 thiếu tiền / thừa tiền / thiếu mã → đối soát, phiên vẫn chờ", () => {
    const r = submitCheckout(input([{ variantId: OX, qty: 1 }], "sepay")) as { code: string };
    const x = findSession(r.code)!;
    expect(pay(x.code, x.money.total - 1000)).toMatchObject({ result: "recon", reason: "short" });
    expect(pay(x.code, x.money.total + 1000)).toMatchObject({ result: "recon", reason: "over" });
    expect(handleSepayWebhook({ id: "m1", transferType: "in", transferAmount: x.money.total, content: "chuyen tien" })).toMatchObject({ reason: "missing_code" });
    expect(x.status).toBe("pending");
  });
  it("AC-07.4 hết 15 phút, không có giao dịch → hết hạn, nhả hàng, không đơn, không email", () => {
    const before = stock(OX);
    const r = submitCheckout(input([{ variantId: OX, qty: 1 }], "sepay")) as { code: string };
    expireSessions(new Date(Date.now() + 16 * 60_000));
    expect(findSession(r.code)!.status).toBe("expired");
    expect(stock(OX)).toBe(before);
    expect(db().orders.length).toBe(0);
    expect(db().outbox.length).toBe(0);
  });
  it("AC-07.5 tiền về muộn → đối soát 'Đến muộn', kế toán tạo đơn hoặc hoàn tiền", () => {
    const r = submitCheckout(input([{ variantId: OX, qty: 1 }], "sepay")) as { code: string };
    const x = findSession(r.code)!;
    expireSessions(new Date(Date.now() + 16 * 60_000));
    const w = handleSepayWebhook({ id: "late1", transferType: "in", transferAmount: x.money.total, code: x.code }, new Date(Date.now() + 30 * 60_000));
    expect(w).toMatchObject({ result: "recon", reason: "late" });
    expect(db().recon[0].lateMinutes).toBeGreaterThan(0);
    const c = reconCreateOrder("late1");
    expect(c.ok).toBe(true);
    expect(findOrder((c as { orderCode: string }).orderCode)!.paymentStatus).toBe("paid");
    // giao dịch khác: hoàn tiền
    handleSepayWebhook({ id: "x2", transferType: "in", transferAmount: 5000, content: "abc" });
    expect(reconRefund("x2")).toBe(true);
  });
  it("AC-07.6 đối soát cuối phiên bắt được giao dịch webhook bị lỡ", () => {
    const r = submitCheckout(input([{ variantId: OX, qty: 1 }], "sepay")) as { code: string };
    const x = findSession(r.code)!;
    db().sepayLedger.push({ id: "missed", amount: x.money.total, content: x.code, code: x.code, at: new Date().toISOString() });
    expireSessions(new Date(Date.now() + 16 * 60_000));
    expect(x.status).toBe("paid");
    expect(db().orders.length).toBe(1);
  });
  it("Đổi sang COD đóng phiên và nhả hàng", () => {
    const before = stock(OX);
    const r = submitCheckout(input([{ variantId: OX, qty: 1 }], "sepay")) as { code: string; token: string };
    expect(closeSession(r.code, r.token).ok).toBe(true);
    expect(findSession(r.code)!.status).toBe("closed");
    expect(stock(OX)).toBe(before);
  });
  it("SePay tắt → MSG-06", () => {
    db().settings.sepayDisabled = true;
    expect(submitCheckout(input([{ variantId: OX, qty: 1 }], "sepay"))).toMatchObject({ error: "sepay_unavailable" });
  });
  it("chuỗi VietQR có CRC đúng", () => {
    const p = buildVietQrPayload({ bin: "970422", account: "0000000000", amount: 480000, content: "NFPABCDEFGH" });
    expect(p.slice(-4)).toBe(crc16ccitt(p.slice(0, -4)));
    expect(p).toContain("NFPABCDEFGH");
  });
});

// ---------- Vận đơn, kho, ĐVVC ----------
describe("Vận đơn và trạng thái giao (UC-11–UC-13)", () => {
  it("lỗi tạo vận đơn → Chờ đóng gói + lỗi; tạo lại / đổi hãng thành công", () => {
    db().settings.waybillFail = true;
    const r = submitCheckout(input([{ variantId: OX, qty: 1 }])) as { code: string };
    const o = findOrder(r.code)!;
    expect(o.status).toBe("packing");
    expect(o.shipment.error).toContain("400");
    db().settings.waybillFail = false;
    expect(retryWaybill(o.code, "VTP").ok).toBe(true);
    expect(o).toMatchObject({ status: "awaiting_pickup", shipment: { carrier: "VTP" } });
  });
  it("kho nhập khối lượng, lệch > 30% thì cảnh báo", () => {
    const r = submitCheckout(input([{ variantId: OX, qty: 1 }])) as { code: string };
    expect(packOrder(r.code, 0)).toMatchObject({ ok: false, error: "weight_required" });
    expect(packOrder(r.code, 310)).toMatchObject({ ok: true, warn: false });
    expect(packOrder(r.code, 600)).toMatchObject({ ok: true, warn: true });
  });
  it("AC-13 webhook ĐVVC chỉ cập nhật theo chiều tiến, gửi EM-04", () => {
    const r = submitCheckout(input([{ variantId: OX, qty: 1 }])) as { code: string };
    const o = findOrder(r.code)!;
    const t = o.shipment.trackingCode!;
    handleCarrierEvent("GHN", t, "picked", "e1");
    expect(o.status).toBe("shipping");
    handleCarrierEvent("GHN", t, "ready_to_pick", "e2");
    expect(o.status).toBe("shipping");
    expect(handleCarrierEvent("GHN", t, "picked", "e1")).toMatchObject({ duplicate: true });
    handleCarrierEvent("GHN", t, "delivered", "e3");
    expect(o).toMatchObject({ status: "delivered", paymentStatus: "cod_reconcile" });
    expect(db().outbox.filter((m) => m.event === "EM-04").length).toBe(2);
  });
  it("mã trạng thái VTP", () => {
    db().settings.ghn = "error";
    const r = submitCheckout(input([{ variantId: OX, qty: 1 }])) as { code: string };
    const o = findOrder(r.code)!;
    expect(o.shipment.carrier).toBe("VTP");
    handleCarrierEvent("VTP", o.shipment.trackingCode!, 506, "v1");
    expect(o.status).toBe("delivery_failed");
    handleCarrierEvent("VTP", o.shipment.trackingCode!, 500, "v2");
    expect(o.status).toBe("shipping");
  });
});

// ---------- Hủy đơn ----------
describe("Hủy đơn (UC-10, AC-10)", () => {
  it("hủy trước khi lấy hàng: hủy vận đơn, nhả tồn, trả lượt mã, gửi EM-05", () => {
    const before = stock(OX);
    const r = submitCheckout(input([{ variantId: OX, qty: 2 }], "cod", { couponCode: "GIAM10" })) as { code: string };
    const o = findOrder(r.code)!;
    expect(cancelOrder(o, "", "customer")).toMatchObject({ ok: false, error: "reason_required" });
    expect(cancelOrder(o, "Đặt nhầm size", "customer").ok).toBe(true);
    expect(o.status).toBe("canceled");
    expect(stock(OX)).toBe(before);
    expect(db().couponUsage.some((u) => u.orderCode === o.code && u.active)).toBe(false);
    expect(db().outbox.some((m) => m.event === "EM-05")).toBe(true);
  });
  it("ĐVVC đã lấy hàng thì không hủy được", () => {
    const r = submitCheckout(input([{ variantId: OX, qty: 1 }])) as { code: string };
    db().settings.carrierPickedUp = true;
    expect(cancelOrder(findOrder(r.code)!, "Đổi ý", "customer")).toMatchObject({ error: "picked_up" });
  });
  it("đơn đang giao không hủy được", () => {
    const r = submitCheckout(input([{ variantId: OX, qty: 1 }])) as { code: string };
    const o = findOrder(r.code)!;
    handleCarrierEvent("GHN", o.shipment.trackingCode!, "picked", "p1");
    expect(cancelOrder(o, "Đổi ý", "customer")).toMatchObject({ error: "not_cancelable" });
  });
  it("đơn đã chuyển khoản bị hủy → yêu cầu hoàn tiền", () => {
    const r = submitCheckout(input([{ variantId: OX, qty: 1 }], "sepay")) as { code: string };
    const x = findSession(r.code)!;
    const w = pay(x.code, x.money.total) as { orderCode: string };
    const o = findOrder(w.orderCode)!;
    cancelOrder(o, "Đổi ý", "customer");
    expect(o.paymentStatus).toBe("refund_pending");
    expect(db().refunds[0]).toMatchObject({ orderCode: o.code, amount: o.money.total });
  });
  it("CSKH gọi 2 lần không được → hủy", () => {
    const r = submitCheckout(input([{ variantId: COAT, qty: 1 }])) as { code: string };
    expect(cancelUnreachable(r.code)).toBe(false);
    recordCall(r.code); recordCall(r.code);
    expect(cancelUnreachable(r.code)).toBe(true);
    expect(findOrder(r.code)!.cancelReason).toBe("Không liên lạc được");
  });
});

describe("Tra cứu đơn (UC-09)", () => {
  it("bằng token, bằng SĐT; sai thì không thấy", () => {
    const r = submitCheckout(input([{ variantId: OX, qty: 1 }])) as { code: string; token: string };
    expect(accessOrder(r.code, { token: r.token })).toBeTruthy();
    expect(accessOrder(r.code.toLowerCase(), { phone: "+84938123456" })).toBeTruthy();
    expect(accessOrder(r.code, { phone: "0900000000" })).toBeUndefined();
  });
});
