"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Footer, Stepper, TopBar } from "@/components/Chrome";
import { OrderSummary } from "@/components/Summary";
import { CouponBox, type CouponMsg } from "@/components/CouponBox";
import { AlertIcon, CashIcon, InfoIcon, QrIcon, TruckIcon } from "@/components/Icons";
import { fmt, useLang } from "@/lib/i18n/client";
import { useCart } from "@/lib/cart";
import { PROVINCES, findProvince, findWard } from "@/lib/data/locations";
import { NOTE_MAX, validateContact, type ContactInput, type FieldError } from "@/lib/validation";
import type { CouponError, Quote } from "@/lib/pricing";
import type { Change } from "@/lib/orders";
import type { Member, PaymentMethod } from "@/lib/types";

const FORM_KEY = "nf_checkout_form";
const EMPTY: ContactInput = { name: "", phone: "", email: "", provinceId: "", wardId: "", line: "", note: "" };
type Saved = { form: ContactInput; method: PaymentMethod; coupon?: string; addressId?: string };

function loadSaved(): Saved | null {
  try { const s = sessionStorage.getItem(FORM_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export default function CheckoutPage() {
  const { L, lang, money } = useLang();
  const router = useRouter();
  const { items, ready } = useCart();

  const [form, setForm] = useState<ContactInput>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<keyof ContactInput, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("cod"); // COD chọn sẵn (đề xuất)
  const [agreed, setAgreed] = useState(false);
  const [member, setMember] = useState<Member | null>(null);
  const [addressId, setAddressId] = useState<string | undefined>();
  const [legacy, setLegacy] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState(false);

  const [appliedCoupon, setAppliedCoupon] = useState<string | undefined>();
  const [couponMsg, setCouponMsg] = useState<CouponMsg>(null);

  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<{ kind: "sepay" | "generic" | "pending" | "fields" | "cod"; } | null>(null);
  const [changes, setChanges] = useState<Change[] | null>(null);
  const keyRef = useRef<string>(newKey());
  const placeRef = useRef<HTMLDivElement>(null);

  // ---- Khôi phục dữ liệu khi tải lại trang (UC-02 E7) và thông tin thành viên ----
  useEffect(() => {
    const s = loadSaved();
    if (s) { setForm({ ...EMPTY, ...s.form }); setMethod(s.method ?? "cod"); setAppliedCoupon(s.coupon); setAddressId(s.addressId); }
    fetch("/api/auth/me").then((r) => r.json()).then(({ member }: { member: Member | null }) => {
      setMember(member);
      if (member && !s?.form?.name) {
        const def = member.addresses.find((a) => a.isDefault);
        if (def) applyAddress(member, def.id, true);
        else setForm((f) => ({ ...f, name: member.name, phone: member.phone, email: member.email }));
      }
    }).catch(() => {}).finally(() => setHydrated(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { sessionStorage.setItem(FORM_KEY, JSON.stringify({ form, method, coupon: appliedCoupon, addressId } satisfies Saved)); } catch { /* bỏ qua */ }
  }, [form, method, appliedCoupon, addressId, hydrated]);

  function applyAddress(m: Member, id: string, initial = false) {
    const a = m.addresses.find((x) => x.id === id);
    if (!a) return;
    setAddressId(id);
    if (a.legacyDistrict) {
      setLegacy(a.legacyText ?? a.line);
      setForm((f) => ({ ...f, name: a.name, phone: a.phone, email: initial ? m.email : f.email || m.email, provinceId: "", wardId: "", line: a.line }));
      setTouched((t) => ({ ...t, provinceId: true, wardId: true }));
    } else {
      setLegacy(null);
      setForm((f) => ({ ...f, name: a.name, phone: a.phone, email: f.email || m.email, provinceId: a.provinceId, wardId: a.wardId, line: a.line }));
    }
  }

  // ---- Tính lại tóm tắt đơn mỗi khi giỏ, địa chỉ, mã hoặc SĐT thay đổi ----
  const [nonce, setNonce] = useState(0);
  const quoteReq = useMemo(() => JSON.stringify({ items, provinceId: form.provinceId, wardId: form.wardId, couponCode: appliedCoupon, phone: form.phone, email: form.email, n: nonce }), [items, form.provinceId, form.wardId, form.phone, form.email, appliedCoupon, nonce]);
  useEffect(() => {
    if (!ready || !hydrated) return;
    if (!items.length) { setQuote(null); return; }
    keyRef.current = newKey(); // nội dung đơn đổi thì lần đặt sau là một yêu cầu mới
    let alive = true;
    setQuoting(true);
    const t = setTimeout(() => {
      fetch("/api/quote", { method: "POST", headers: { "content-type": "application/json" }, body: quoteReq })
        .then((r) => r.json())
        .then((q: Quote) => {
          if (!alive) return;
          setQuote(q); setQuoteError(false);
          // Giỏ, địa chỉ hoặc SĐT đổi khiến mã không còn đủ điều kiện: tự gỡ và báo lý do (REQ-A7.3.3)
          if (q.coupon?.status === "invalid" && appliedCoupon) {
            setAppliedCoupon(undefined);
            setCouponMsg({ kind: "error", text: fmt(L.coupon.autoRemoved, { code: q.coupon.code, reason: couponErr(q.coupon.error, q.coupon.shortfall) }) });
          }
        })
        .catch(() => alive && setQuoteError(true))
        .finally(() => alive && setQuoting(false));
    }, 250);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteReq, ready, hydrated]);

  // Đơn trên 5.000.000đ: khóa COD, chuyển sang SePay
  useEffect(() => { if (quote && !quote.codAllowed && method === "cod") setMethod("sepay"); }, [quote, method]);
  // Có giỏ hàng bị chặn (hết hàng) thì quay về giỏ
  useEffect(() => {
    if (quote?.hasBlockingLines) router.replace("/cart?soldout=" + quote.lines.filter((l) => l.state !== "ok" && l.state !== "reduced").map((l) => l.variantId).join(","));
  }, [quote, router]);

  const couponErr = useCallback((e: CouponError, shortfall?: number) => fmt(L.coupon.errors[e], { amount: money(shortfall ?? 0) }), [L, money]);

  // ---- Kiểm tra dữ liệu ----
  const errors = useMemo(() => validateContact(form), [form]);
  const showErr = (k: keyof ContactInput): FieldError | undefined => ((touched[k] || submitted) ? errors[k] : undefined);
  const set = (k: keyof ContactInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    let v = e.target.value;
    if (k === "note") v = v.slice(0, NOTE_MAX); // vượt 250 ký tự: không cho nhập thêm
    setForm((f) => (k === "provinceId" ? { ...f, provinceId: v, wardId: "" } : { ...f, [k]: v })); // đổi Tỉnh: đặt lại Phường/Xã
    if (k === "provinceId" || k === "wardId") setLegacy(null);
    setPlaceError(null);
  };
  const blur = (k: keyof ContactInput) => () => setTouched((t) => ({ ...t, [k]: true }));

  // ---- Đặt hàng ----
  const shipStatus = quote?.shipping.status;
  const canPlace = Boolean(quote && !quoting && shipStatus === "ok" && agreed && !placing && !(method === "cod" && !quote.codAllowed));

  async function place() {
    setSubmitted(true);
    setPlaceError(null);
    if (Object.keys(errors).length) {
      setPlaceError({ kind: "fields" });
      const first = (["name", "phone", "email", "provinceId", "wardId", "line", "note"] as const).find((k) => errors[k]);
      document.getElementById(`f-${first}`)?.focus();
      return;
    }
    if (!quote || !canPlace) return;
    setPlacing(true); // khóa nút sau lần bấm đầu
    try {
      const res = await fetch("/api/orders", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: keyRef.current, items, contact: form, couponCode: appliedCoupon, method, agreedTerms: agreed, lang,
          expected: { total: quote.total, shippingFee: quote.shipping.fee, discount: quote.discount, lines: quote.lines.map((l) => ({ variantId: l.variantId, price: l.price, qty: l.qty })) },
        }),
      });
      const r = await res.json();
      if (r.ok) {
        try { sessionStorage.setItem(`nf_order_${r.code}`, r.token); localStorage.setItem("nf_last_order", JSON.stringify({ code: r.code, token: r.token })); } catch { /* bỏ qua */ }
        // Giữ lại thông tin nhận hàng cho lần đặt lại, xóa giỏ và mã
        try { localStorage.removeItem("nf_cart"); sessionStorage.setItem(FORM_KEY, JSON.stringify({ form, method, addressId })); } catch { /* bỏ qua */ }
        router.push(`/order/${r.code}?t=${r.token}`);
        return;
      }
      setPlacing(false);
      keyRef.current = newKey();
      switch (r.error) {
        case "changed": setChanges(r.changes); break;
        case "out_of_stock": router.push("/cart?soldout=" + r.variants.map((v: { variantId: string }) => v.variantId).join(",")); break;
        case "sepay_error": setPlaceError({ kind: "sepay" }); break;
        case "pending_limit": setPlaceError({ kind: "pending" }); break;
        case "cod_not_allowed": setMethod("sepay"); setPlaceError({ kind: "cod" }); break;
        case "validation": setTouched(Object.fromEntries(Object.keys(r.fields).map((k) => [k, true]))); setPlaceError({ kind: "fields" }); break;
        default: setPlaceError({ kind: "generic" });
      }
    } catch {
      setPlacing(false);
      setPlaceError({ kind: "generic" });
    }
  }

  function acceptChanges() {
    if (changes?.some((c) => c.type === "coupon_invalid")) setAppliedCoupon(undefined);
    setChanges(null);
    setQuote(null);
    keyRef.current = newKey();
    setNonce((n) => n + 1); // tính lại tóm tắt với giá, mã và phí mới
  }

  // ---- Hiển thị ----
  if (ready && hydrated && !items.length) {
    return (
      <>
        <TopBar mode="checkout" />
        <main className="container"><div className="empty"><p>{L.checkout.emptyCart}</p><Link className="btn" href="/">{L.cart.continue}</Link></div></main>
        <Footer slim />
      </>
    );
  }

  const province = findProvince(form.provinceId);
  const wardName = findWard(form.provinceId, form.wardId)?.name;
  const contactDone = !errors.name && !errors.phone && !errors.email;
  const addressDone = contactDone && !errors.provinceId && !errors.wardId && !errors.line;
  const step = (!contactDone ? 1 : !addressDone || shipStatus !== "ok" ? 2 : !agreed ? 3 : 4) as 1 | 2 | 3 | 4;
  const codDisabled = Boolean(quote && !quote.codAllowed);
  const err = (k: keyof ContactInput) => { const e = showErr(k); return e ? L.errors[e] : null; };

  const fieldProps = (k: keyof ContactInput) => ({
    id: `f-${k}`, name: k, value: form[k], onChange: set(k), onBlur: blur(k),
    "aria-invalid": Boolean(showErr(k)), "aria-describedby": `h-${k}`,
  });

  const couponBox = (
    <CouponBox
      items={items}
      ctx={{ provinceId: form.provinceId, wardId: form.wardId, phone: form.phone, email: form.email }}
      applied={appliedCoupon}
      quote={quote}
      externalMsg={couponMsg}
      onApplied={(code, q) => { setAppliedCoupon(code); setQuote(q); setCouponMsg(null); }}
      onRemoved={() => { setAppliedCoupon(undefined); setCouponMsg(null); }} // gỡ mã không tính lượt
    />
  );

  return (
    <>
      <TopBar mode="checkout" />
      <main className="container">
        <div className="checkout-title"><h1>{L.checkout.title}</h1></div>
        <Stepper current={step} />
        <div className="checkout">
          <div>
            {/* 1. Thông tin nhận hàng */}
            <section className="section" aria-labelledby="s1">
              <div className="section-head"><h2 id="s1"><span className="n">1</span>{L.checkout.contact}</h2></div>
              {member ? (
                <div className="member-row">
                  <span>{fmt(L.checkout.loggedInAs, { name: member.name })}</span>
                  <button type="button" className="link-btn" onClick={async () => { await fetch("/api/auth/demo", { method: "POST", body: JSON.stringify({ action: "logout" }) }); setMember(null); setAddressId(undefined); }}>{L.checkout.logout}</button>
                </div>
              ) : (
                <div className="member-row">
                  <span>{L.checkout.loginHint}</span>
                  <button type="button" className="link-btn" onClick={async () => {
                    const r = await fetch("/api/auth/demo", { method: "POST", body: JSON.stringify({ action: "login" }) }).then((x) => x.json());
                    setMember(r.member);
                    const def = r.member.addresses.find((a: Member["addresses"][number]) => a.isDefault);
                    if (def) applyAddress(r.member, def.id); setForm((f) => ({ ...f, email: f.email || r.member.email }));
                  }}>{L.checkout.loginLink}</button>
                </div>
              )}

              {member && member.addresses.length > 0 && (
                <fieldset className="stack" style={{ border: 0, padding: 0, margin: "0 0 24px" }}>
                  <legend className="field label" style={{ marginBottom: 8, fontSize: "var(--text-sm)", color: "var(--color-ink)" }}>{L.checkout.chooseAddress}</legend>
                  <div className="choices">
                    {member.addresses.map((a) => {
                      const p = findProvince(a.provinceId);
                      const w = findWard(a.provinceId, a.wardId);
                      return (
                        <label key={a.id} className="choice">
                          <input type="radio" name="addr" checked={addressId === a.id} onChange={() => applyAddress(member, a.id)} />
                          <span>
                            <span className="choice-title">{a.label}{a.isDefault && <span className="tag tag-accent">{L.checkout.defaultTag}</span>}{a.legacyDistrict && <span className="tag tag-error">{a.legacyDistrict}</span>}</span>
                            <span className="choice-desc" style={{ display: "block" }}>{a.name}, {a.phone}</span>
                            <span className="choice-desc" style={{ display: "block" }}>{a.legacyText ?? [a.line, w?.name, p?.name].filter(Boolean).join(", ")}</span>
                          </span>
                          <span />
                        </label>
                      );
                    })}
                  </div>
                  {addressId && <p className="help">{L.checkout.editOnlyThisOrder}</p>}
                </fieldset>
              )}

              {legacy && <p className="notice notice-warn" role="alert" style={{ marginBottom: 16 }}><AlertIcon />{L.checkout.legacyAddress}</p>}

              <div className="stack">
                <div className="field" data-invalid={Boolean(showErr("name"))}>
                  <label htmlFor="f-name">{L.checkout.name}</label>
                  <input className="input" type="text" autoComplete="name" maxLength={60} {...fieldProps("name")} />
                  <span id="h-name" className={err("name") ? "error-text" : "help"}>{err("name")}</span>
                </div>
                <div className="grid-2">
                  <div className="field" data-invalid={Boolean(showErr("phone"))}>
                    <label htmlFor="f-phone">{L.checkout.phone}</label>
                    <input className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="09xx xxx xxx" {...fieldProps("phone")} />
                    <span id="h-phone" className={err("phone") ? "error-text" : "help"}>{err("phone")}</span>
                  </div>
                  <div className="field" data-invalid={Boolean(showErr("email"))}>
                    <label htmlFor="f-email">{L.checkout.email}</label>
                    <input className="input" type="email" inputMode="email" autoComplete="email" {...fieldProps("email")} />
                    <span id="h-email" className={err("email") ? "error-text" : "help"}>{err("email") ?? L.checkout.emailHelp}</span>
                  </div>
                </div>
                <div className="grid-2">
                  <div className="field" data-invalid={Boolean(showErr("provinceId"))}>
                    <label htmlFor="f-provinceId">{L.checkout.province}</label>
                    <select className="select" autoComplete="address-level1" {...fieldProps("provinceId")}>
                      <option value="">{L.checkout.provincePh}</option>
                      {PROVINCES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <span id="h-provinceId" className={err("provinceId") ? "error-text" : "help"}>{err("provinceId")}</span>
                  </div>
                  <div className="field" data-invalid={Boolean(showErr("wardId"))}>
                    <label htmlFor="f-wardId">{L.checkout.ward}</label>
                    <select className="select" autoComplete="address-level2" disabled={!province} {...fieldProps("wardId")}>
                      <option value="">{province ? L.checkout.wardPh : L.checkout.wardLocked}</option>
                      {province?.wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                    <span id="h-wardId" className={err("wardId") ? "error-text" : "help"}>{err("wardId")}</span>
                  </div>
                </div>
                <div className="field" data-invalid={Boolean(showErr("line"))}>
                  <label htmlFor="f-line">{L.checkout.line}</label>
                  <input className="input" type="text" autoComplete="street-address" placeholder={L.checkout.linePh} maxLength={200} {...fieldProps("line")} />
                  <span id="h-line" className={err("line") ? "error-text" : "help"}>{err("line")}</span>
                </div>
                <div className="field">
                  <label htmlFor="f-note">{L.checkout.note} <span className="opt">({L.checkout.optional})</span></label>
                  <textarea className="textarea" placeholder={L.checkout.notePh} maxLength={NOTE_MAX} {...fieldProps("note")} />
                  <span id="h-note" className="help" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span>{L.checkout.noteHelp}</span><span className="counter">{form.note.length}/{NOTE_MAX}</span>
                  </span>
                </div>
              </div>
            </section>

            {/* 2. Vận chuyển */}
            <section className="section" aria-labelledby="s2">
              <div className="section-head"><h2 id="s2"><span className="n">2</span>{L.checkout.shipping}</h2></div>
              {quoteError ? (
                <p className="notice notice-error" role="alert"><AlertIcon />{L.checkout.genericError}</p>
              ) : !quote || shipStatus === "need_address" ? (
                <p className="notice notice-info"><InfoIcon />{quoting && form.wardId ? L.checkout.shippingCalculating : L.checkout.shippingNeedAddress}</p>
              ) : shipStatus === "unsupported" ? (
                <p className="notice notice-error" role="alert"><AlertIcon />{L.checkout.shippingUnsupported}</p>
              ) : (
                <div className="choices">
                  <label className="choice">
                    <input type="radio" name="ship" defaultChecked />
                    <span>
                      <span className="choice-title">{L.checkout.shippingStandard}</span>
                      <span className="choice-desc" style={{ display: "block" }}>{fmt(L.checkout.shippingEta, { eta: quote.shipping.eta?.[lang] ?? "" })}</span>
                      <span className="choice-desc" style={{ display: "block" }}>
                        {quote.shipping.freeByThreshold ? fmt(L.checkout.freeByThreshold, { amount: money(quote.shipping.freeThreshold) })
                          : fmt(L.checkout.freeHint, { amount: money(quote.shipping.freeThreshold - quote.subtotal) })}
                      </span>
                    </span>
                    <span className="choice-aside">{quoting ? "…" : quote.shippingPayable === 0 ? L.totals.free : money(quote.shippingPayable)}</span>
                  </label>
                </div>
              )}
            </section>

            {/* 3. Phương thức thanh toán */}
            <section className="section" aria-labelledby="s3">
              <div className="section-head"><h2 id="s3"><span className="n">3</span>{L.checkout.payment}</h2></div>
              <div className="choices" role="radiogroup" aria-labelledby="s3">
                <label className="choice">
                  <input type="radio" name="pay" value="cod" checked={method === "cod"} disabled={codDisabled} onChange={() => { setMethod("cod"); setPlaceError(null); }} />
                  <span>
                    <span className="choice-title">{L.checkout.cod}</span>
                    <span className="choice-desc" style={{ display: "block" }}>{L.checkout.codDesc}</span>
                    {codDisabled && <span className="choice-desc" style={{ display: "block", color: "var(--color-warn)" }}>{fmt(L.checkout.codLocked, { amount: money(quote!.codLimit) })}</span>}
                  </span>
                  <span className="choice-icon"><CashIcon /></span>
                  {method === "cod" && quote && (
                    <span className="choice-extra notice notice-info"><TruckIcon />{L.checkout.codAmount}: <strong className="num">{money(quote.total)}</strong></span>
                  )}
                </label>
                <label className="choice">
                  <input type="radio" name="pay" value="sepay" checked={method === "sepay"} onChange={() => { setMethod("sepay"); setPlaceError(null); }} />
                  <span>
                    <span className="choice-title">{L.checkout.sepay}</span>
                    <span className="choice-desc" style={{ display: "block" }}>{L.checkout.sepayDesc}</span>
                  </span>
                  <span className="choice-icon"><QrIcon /></span>
                  {method === "sepay" && <span className="choice-extra notice notice-info"><InfoIcon />{L.checkout.sepayInfo}</span>}
                </label>
              </div>
            </section>

            {/* 4. Xem lại và đặt hàng */}
            <section className="section" aria-labelledby="s4">
              <div className="section-head"><h2 id="s4"><span className="n">4</span>{L.checkout.review}</h2></div>
              <dl className="review-list">
                <dt>{L.checkout.recipient}</dt>
                <dd>{form.name || "—"}{form.phone && `, ${form.phone}`}{form.email && <><br />{form.email}</>}</dd>
                <button type="button" className="link-btn" onClick={() => document.getElementById("f-name")?.focus()}>{L.checkout.edit}</button>
                <dt>{L.checkout.deliverTo}</dt>
                <dd>{[form.line, wardName, province?.name].filter(Boolean).join(", ") || "—"}{form.note && <><br /><span className="line-meta">{form.note}</span></>}</dd>
                <button type="button" className="link-btn" onClick={() => document.getElementById("f-line")?.focus()}>{L.checkout.edit}</button>
                <dt>{L.checkout.payWith}</dt>
                <dd>{method === "cod" ? L.checkout.cod : L.checkout.sepay}</dd>
                <button type="button" className="link-btn" onClick={() => document.getElementById("s3")?.scrollIntoView({ behavior: "smooth" })}>{L.checkout.edit}</button>
                <dt>{L.cart.title}</dt>
                <dd>{fmt(L.checkout.itemsCount, { n: quote?.lines.reduce((s, l) => s + l.qty, 0) ?? 0 })}</dd>
                <Link className="link-btn" href="/cart" style={{ justifySelf: "end" }}>{L.checkout.editCart}</Link>
              </dl>

              <div className="place" ref={placeRef}>
                <label className="check">
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} aria-describedby="agree-help" />
                  <span>{fmtNodes(L.checkout.agree, {
                    terms: <a href="/policies/terms" target="_blank" rel="noopener">{L.checkout.terms}</a>,
                    returns: <a href="/policies/returns" target="_blank" rel="noopener">{L.checkout.returns}</a>,
                  })}</span>
                </label>
                {!agreed && <p id="agree-help" className="help">{L.checkout.agreeRequired}</p>}

                {placeError && <PlaceErrorNotice kind={placeError.kind} onRetry={place} onCod={() => { setMethod("cod"); setPlaceError(null); }} codAllowed={Boolean(quote?.codAllowed)} />}

                <button type="button" className="btn btn-primary btn-block desktop-only" onClick={place} disabled={!canPlace} aria-describedby={!agreed ? "agree-help" : undefined}>
                  {placing ? <><span className="spinner" aria-hidden="true" />{L.checkout.placing}</> : L.checkout.placeOrder}
                </button>
              </div>
            </section>
          </div>

          <OrderSummary q={quote} coupon={couponBox} shippingLoading={quoting && Boolean(form.wardId) && !quote} />
        </div>
      </main>

      <div className="mobile-bar">
        <span><span className="line-meta" style={{ display: "block" }}>{L.totals.total}</span><span className="total">{quote ? money(quote.total) : "—"}</span></span>
        <button type="button" className="btn btn-primary" onClick={place} disabled={!canPlace}>{placing ? L.checkout.placing : L.checkout.placeOrder}</button>
      </div>
      <Footer slim />

      {changes && <ChangesDialog changes={changes} onOk={acceptChanges} couponErr={couponErr} />}
    </>
  );
}

function fmtNodes(s: string, nodes: Record<string, React.ReactNode>) {
  const parts = s.split(/(\{\w+\})/);
  return parts.map((p, i) => { const m = p.match(/^\{(\w+)\}$/); return m && nodes[m[1]] ? <span key={i}>{nodes[m[1]]}</span> : <span key={i}>{p}</span>; });
}

function PlaceErrorNotice({ kind, onRetry, onCod, codAllowed }: { kind: "sepay" | "generic" | "pending" | "fields" | "cod"; onRetry: () => void; onCod: () => void; codAllowed: boolean }) {
  const { L, money } = useLang();
  const text = kind === "sepay" ? L.checkout.sepayError : kind === "pending" ? L.checkout.pendingLimit : kind === "fields" ? L.checkout.fixErrors
    : kind === "cod" ? fmt(L.checkout.codLocked, { amount: money(5000000) }) : L.checkout.genericError;
  return (
    <div className="notice notice-error" role="alert">
      <AlertIcon />
      <div>
        <p>{text}</p>
        {kind === "sepay" && (
          <div className="actions">
            <button type="button" className="btn btn-sm" onClick={onRetry}>{L.checkout.tryAgain}</button>
            {codAllowed && <button type="button" className="btn btn-sm btn-quiet" onClick={onCod}>{L.checkout.switchCod}</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function ChangesDialog({ changes, onOk, couponErr }: { changes: Change[]; onOk: () => void; couponErr: (e: CouponError, s?: number) => string }) {
  const { L, money } = useLang();
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { ref.current?.focus(); const k = (e: KeyboardEvent) => e.key === "Escape" && onOk(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onOk]);
  return (
    <div className="dialog-scrim" role="presentation">
      <div className="dialog stock" role="alertdialog" aria-modal="true" aria-labelledby="chg-t" aria-describedby="chg-d">
        <h2 id="chg-t">{L.checkout.changedTitle}</h2>
        <p id="chg-d">{L.checkout.changedLead}</p>
        <ul>
          {changes.map((c, i) => (
            <li key={i}>
              {c.type === "price" && fmt(L.checkout.changedPrice, { name: c.name, old: money(c.oldPrice), new: money(c.newPrice) })}
              {c.type === "qty_reduced" && fmt(L.checkout.changedQty, { name: c.name, old: c.oldQty, new: c.newQty })}
              {c.type === "coupon_invalid" && fmt(L.checkout.changedCoupon, { code: c.code, reason: couponErr(c.error, c.shortfall) })}
              {c.type === "shipping" && fmt(L.checkout.changedShipping, { old: money(c.oldFee), new: money(c.newFee) })}
              {c.type === "total" && fmt(L.checkout.changedTotal, { old: money(c.oldTotal), new: money(c.newTotal) })}
            </li>
          ))}
        </ul>
        <button ref={ref} type="button" className="btn btn-primary" onClick={onOk}>{L.checkout.changedOk}</button>
      </div>
    </div>
  );
}
