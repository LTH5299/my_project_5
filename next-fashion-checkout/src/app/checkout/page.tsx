"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Footer, TopBar, useCatalogMeta } from "@/components/Chrome";
import { OrderSummary } from "@/components/Summary";
import { CouponDialog } from "@/components/CouponDialog";
import { AlertIcon, CashIcon, InfoIcon, QrIcon, TagIcon } from "@/components/Icons";
import { fmt, useLang } from "@/lib/i18n/client";
import { rememberOrder, useCart } from "@/lib/cart";
import { PROVINCES, findProvince, findWard } from "@/lib/data/locations";
import { NOTE_MAX, validateContact, type ContactInput, type FieldError } from "@/lib/validation";
import type { CheckoutQuote, Change } from "@/lib/quote";
import type { CouponError } from "@/lib/pricing";
import type { Member } from "@/lib/types";

// Nháp thanh toán lưu trên máy 7 ngày (SRS v1.2 SCR-02: mỗi bước có nút Tiếp tục, tải lại mở bước chưa xong đầu tiên)
const DRAFT_KEY = "nf_checkout_draft";
const DRAFT_TTL = 7 * 24 * 3600 * 1000;
const EMPTY: ContactInput = { name: "", phone: "", email: "", provinceId: "", wardId: "", line: "", note: "" };
type Step = 1 | 2 | 3 | 4;
type Draft = { form: ContactInput; done: Step[]; pkgId?: string; quotedAt?: string; coupon?: string; method: "cod" | "sepay"; addressId?: string; saveProfile?: boolean; savedAt: number };

function loadDraft(): Draft | null {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as Draft | null;
    if (!d || Date.now() - d.savedAt > DRAFT_TTL) return null;
    return d;
  } catch { return null; }
}
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const FIELD_ORDER = ["name", "phone", "email", "provinceId", "wardId", "line", "note"] as const;

function CheckoutInner() {
  const { L, lang, money } = useLang();
  const router = useRouter();
  const params = useSearchParams();
  const { items, ready } = useCart();
  const meta = useCatalogMeta()?.settings;

  const [form, setForm] = useState<ContactInput>(EMPTY);
  const [done, setDone] = useState<Step[]>([]);
  const [open, setOpen] = useState<Step>(1);
  const [touched, setTouched] = useState<Partial<Record<keyof ContactInput, boolean>>>({});
  const [tried1, setTried1] = useState(false);
  const [pkgId, setPkgId] = useState<string | undefined>();
  const [quotedAt, setQuotedAt] = useState<string | undefined>();
  const [coupon, setCoupon] = useState<string | undefined>();
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  const [couponOpen, setCouponOpen] = useState(false);
  const [method, setMethod] = useState<"cod" | "sepay">("cod");
  const [agreed, setAgreed] = useState(false);
  const [member, setMember] = useState<Member | null>(null);
  const [addressId, setAddressId] = useState<string | undefined>();
  const [saveProfile, setSaveProfile] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [requoted, setRequoted] = useState(false);

  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [nonce, setNonce] = useState(0);

  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [changes, setChanges] = useState<Change[] | null>(null);
  const keyRef = useRef<string>(newKey());

  // ---- Khôi phục nháp + thành viên ----
  useEffect(() => {
    const d = loadDraft();
    const fromPay = params.get("from"); // quay về từ trang QR: "cod" (đổi sang COD) hoặc "repay" (thanh toán lại)
    if (d) {
      setForm({ ...EMPTY, ...d.form }); setDone(d.done); setPkgId(d.pkgId); setCoupon(d.coupon); setMethod(d.method); setAddressId(d.addressId); setSaveProfile(Boolean(d.saveProfile));
      // Nháp quá 30 phút: báo phí lại (không giữ gói cũ nếu phí đổi)
      if (d.quotedAt && Date.now() - Date.parse(d.quotedAt) > 30 * 60_000) { setQuotedAt(undefined); setRequoted(true); } else setQuotedAt(d.quotedAt);
      const firstOpen = ([1, 2, 3, 4] as Step[]).find((s) => !d.done.includes(s)) ?? 4;
      setOpen(fromPay === "cod" ? 4 : fromPay === "repay" ? 3 : firstOpen);
      if (fromPay === "cod") setMethod("cod");
    }
    fetch("/api/auth/me").then((r) => r.json()).then(({ member, saved }: { member: Member | null; saved: (ContactInput & { line: string }) | null }) => {
      setMember(member);
      if (member && !d?.form?.name) {
        if (saved) setForm((f) => ({ ...f, ...saved, note: f.note }));
        else { const def = member.addresses.find((a) => a.isDefault); if (def) pickAddress(member, def.id); }
      }
    }).catch(() => {}).finally(() => setHydrated(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, done, pkgId, quotedAt, coupon, method, addressId, saveProfile, savedAt: Date.now() } satisfies Draft)); } catch { /* bỏ qua */ }
  }, [form, done, pkgId, quotedAt, coupon, method, addressId, saveProfile, hydrated]);

  function pickAddress(m: Member, id: string) {
    const a = m.addresses.find((x) => x.id === id);
    if (!a) return;
    setAddressId(id);
    setForm((f) => ({ ...f, name: a.name, phone: a.phone, email: f.email || m.email, provinceId: a.provinceId, wardId: a.wardId, line: a.line }));
  }

  // ---- Báo giá: giỏ + địa chỉ + gói + mã ----
  const quoteBody = useMemo(() => JSON.stringify({ items, provinceId: form.provinceId, wardId: form.wardId, pkgId, couponCode: coupon, phone: form.phone, email: form.email, n: nonce }),
    [items, form.provinceId, form.wardId, form.phone, form.email, pkgId, coupon, nonce]);
  useEffect(() => {
    if (!ready || !hydrated || !items.length) return;
    keyRef.current = newKey();
    let alive = true;
    setQuoting(true);
    const t = setTimeout(() => {
      fetch("/api/quote", { method: "POST", headers: { "content-type": "application/json" }, body: quoteBody })
        .then((r) => r.json())
        .then((q: CheckoutQuote) => {
          if (!alive) return;
          setQuote(q);
          if (q.shipping?.status === "ok") { setQuotedAt(q.shipping.quotedAt); if (q.pkg && q.pkg.id !== pkgId) setPkgId(q.pkg.id); }
          // Giỏ/SĐT đổi làm mã hết điều kiện: tự bỏ mã, báo lý do
          if (coupon && q.coupon?.status === "invalid") {
            setCouponMsg(fmt(L.coupon.autoRemoved, { code: q.coupon.code, reason: couponErr(q.coupon.error, q.coupon.shortfall) }));
            setCoupon(undefined);
          }
          if (q.blocking) router.replace("/cart");
        })
        .catch(() => alive && setQuote(null))
        .finally(() => alive && setQuoting(false));
    }, 200);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteBody, ready, hydrated]);

  // Tổng > trần COD: khóa COD, chọn sẵn chuyển khoản
  useEffect(() => { if (quote && !quote.codAllowed && method === "cod") setMethod("sepay"); }, [quote, method]);

  const couponErr = useCallback((e: CouponError, shortfall?: number) => fmt(L.coupon.errors[e], { amount: money(shortfall ?? 0) }), [L, money]);

  // ---- Bước 1: kiểm tra dữ liệu ----
  const errors = useMemo(() => validateContact(form), [form]);
  const showErr = (k: keyof ContactInput): FieldError | undefined => ((touched[k] || tried1) ? errors[k] : undefined);
  const set = (k: keyof ContactInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    let v = e.target.value;
    if (k === "note") v = v.slice(0, NOTE_MAX);
    setForm((f) => (k === "provinceId" ? { ...f, provinceId: v, wardId: "" } : { ...f, [k]: v }));
    setPlaceError(null);
  };
  const blur = (k: keyof ContactInput) => () => setTouched((t) => ({ ...t, [k]: true }));

  function complete(step: Step) {
    if (step === 1) {
      setTried1(true);
      const first = FIELD_ORDER.find((k) => errors[k]);
      if (first) { document.getElementById(`f-${first}`)?.focus(); return; } // con trỏ nhảy tới ô lỗi đầu tiên
    }
    if (step === 2 && !(quote?.shipping?.status === "ok" && quote.pkg)) return;
    setDone((d) => Array.from(new Set([...d, step])).sort() as Step[]);
    const next = (Math.min(4, step + 1)) as Step;
    setOpen(next);
    setTimeout(() => document.getElementById(`step-${next}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }
  function edit(step: Step) {
    setOpen(step);
    setDone((d) => d.filter((s) => s < step));
  }

  // ---- Đặt hàng / thanh toán ----
  const shipOk = quote?.shipping?.status === "ok" && Boolean(quote.pkg);
  const allDone = done.includes(1) && done.includes(2) && done.includes(3);
  const canPlace = Boolean(quote && shipOk && allDone && agreed && !placing && !quoting && !(method === "cod" && !quote.codAllowed) && !(method === "sepay" && !quote.sepayAvailable));

  async function place() {
    if (!quote || !canPlace || !quote.pkg) return;
    setPlacing(true); setPlaceError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: keyRef.current, items, customer: { name: form.name, phone: form.phone, email: form.email },
          address: { provinceId: form.provinceId, wardId: form.wardId, line: form.line }, note: form.note,
          pkgId: quote.pkg.id, couponCode: coupon, method, lang, agreed, saveProfile,
          seen: { subtotal: quote.money.subtotal, discount: quote.money.discount, shippingPayable: quote.money.shippingPayable, total: quote.money.total, vatRate: quote.money.vatRate, pkgFee: quote.pkg.fee, lines: quote.lines.map((l) => ({ variantId: l.variantId, qty: l.qty, price: l.price })) },
        }),
      });
      const r = await res.json();
      if (r.status === "order") {
        try { localStorage.removeItem("nf_cart"); localStorage.removeItem(DRAFT_KEY); rememberOrder(r.code, r.token); } catch { /* bỏ qua */ }
        router.push(`/order/${r.code}?t=${r.token}`);
        return;
      }
      if (r.status === "session") { router.push(`/pay/${r.code}?t=${r.token}`); return; }
      setPlacing(false);
      keyRef.current = newKey();
      if (r.status === "changed") { setChanges(r.changes); return; }
      if (r.status === "invalid") { setTouched(Object.fromEntries(Object.keys(r.errors).map((k) => [k, true]))); setTried1(true); edit(1); setPlaceError(L.checkout.fixErrors); return; }
      switch (r.error) {
        case "cod_pending_limit": setPlaceError(L.checkout.pendingLimit); break;
        case "sepay_unavailable": setPlaceError(L.checkout.sepayDown); setNonce((n) => n + 1); break;
        case "cod_over_cap": setMethod("sepay"); setPlaceError(fmt(L.checkout.codLocked, { amount: money(meta?.codCap ?? 5_000_000) })); break;
        case "unserved": edit(2); break;
        default: setPlaceError(L.checkout.genericError);
      }
    } catch {
      setPlacing(false);
      setPlaceError(L.checkout.genericError);
    }
  }

  function reviewChanges() {
    const first = Math.min(...(changes ?? []).map((c) => (c.step === 0 ? 0 : c.step)));
    if (changes?.some((c) => c.kind === "coupon")) setCoupon(undefined);
    setChanges(null);
    setNonce((n) => n + 1);
    if (first === 0) { router.push("/cart"); return; }
    edit(first as Step);
  }

  // ---- Hiển thị ----
  if (ready && hydrated && !items.length) {
    return (
      <main className="container"><div className="empty"><p>{L.checkout.emptyCart}</p><Link className="btn" href="/">{L.cart.continue}</Link></div></main>
    );
  }

  const province = findProvince(form.provinceId);
  const wardName = findWard(form.provinceId, form.wardId)?.name;
  const err = (k: keyof ContactInput) => { const e = showErr(k); return e ? L.errors[e] : null; };
  const fieldProps = (k: keyof ContactInput) => ({ id: `f-${k}`, name: k, value: form[k], onChange: set(k), onBlur: blur(k), "aria-invalid": Boolean(showErr(k)), "aria-describedby": `h-${k}` });
  const s = quote?.money;
  const codCap = meta?.codCap ?? 5_000_000;
  const autoCap = meta?.autoConfirmCap ?? 2_000_000;
  const stepTitle = (n: Step) => L.checkout.steps[n - 1];
  const head = (n: Step, summary: React.ReactNode) => {
    const isDone = done.includes(n) && open !== n;
    return (
      <div className="acc-head">
        <h2 id={`s${n}`}><span className="n" data-done={isDone}>{isDone ? "✓" : n}</span>{stepTitle(n)}</h2>
        {isDone && <button type="button" className="link-btn" onClick={() => edit(n)} aria-label={`${L.checkout.edit}: ${stepTitle(n)}`}>{L.checkout.edit}</button>}
        {isDone && <div className="acc-summary">{summary}</div>}
      </div>
    );
  };
  const pkgName = quote?.pkg ? quote.pkg.serviceName[lang] : "";
  const couponLabel = coupon && quote?.coupon?.status === "applied" ? `${coupon} · −${money(quote.coupon.discount + quote.coupon.shippingDiscount)}` : null;

  return (
    <>
      <main className="container">
        <div className="checkout-title"><h1>{L.checkout.title}</h1><p className="help">{L.checkout.draftNote}</p></div>
        <div className="checkout">
          <div className="accordion">
            {/* ---------- B1 Thông tin nhận hàng ---------- */}
            <section id="step-1" className="acc" data-open={open === 1} aria-labelledby="s1">
              {head(1, <>{form.name}, {form.phone} · {form.email}<br />{[form.line, wardName, province?.name].filter(Boolean).join(", ")}</>)}
              {open === 1 && (
                <div className="acc-body">
                  {member ? (
                    <div className="member-row">
                      <span>{fmt(L.checkout.loggedInAs, { name: member.name })}</span>
                      <button type="button" className="link-btn" onClick={async () => { await fetch("/api/auth/demo", { method: "POST", body: JSON.stringify({ action: "logout" }) }); setMember(null); setAddressId(undefined); setSaveProfile(false); }}>{L.checkout.logout}</button>
                    </div>
                  ) : (
                    <div className="member-row">
                      <span>{L.checkout.loginHint}</span>
                      <button type="button" className="link-btn" onClick={async () => {
                        const r = await fetch("/api/auth/demo", { method: "POST", body: JSON.stringify({ action: "login" }) }).then((x) => x.json());
                        setMember(r.member);
                        const def = r.member.addresses.find((a: Member["addresses"][number]) => a.isDefault);
                        if (def) pickAddress(r.member, def.id);
                      }}>{L.checkout.loginLink}</button>
                    </div>
                  )}

                  {member && (
                    <div className="field" style={{ marginBottom: 24 }}>
                      <label htmlFor="f-addr">{L.checkout.savedAddress}</label>
                      <select id="f-addr" className="select" value={addressId ?? ""} onChange={(e) => { if (e.target.value) pickAddress(member, e.target.value); else { setAddressId(undefined); setForm((f) => ({ ...f, provinceId: "", wardId: "", line: "" })); } }}>
                        {member.addresses.map((a) => <option key={a.id} value={a.id}>{a.label}{a.isDefault ? ` (${L.checkout.defaultTag})` : ""}: {a.line}, {findWard(a.provinceId, a.wardId)?.name}</option>)}
                        <option value="">{L.checkout.newAddress}</option>
                      </select>
                    </div>
                  )}

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
                      <span id="h-note" className="help counter">{form.note.length}/{NOTE_MAX}</span>
                    </div>
                    {member && (
                      <label className="check"><input type="checkbox" checked={saveProfile} onChange={(e) => setSaveProfile(e.target.checked)} /><span>{L.checkout.saveProfile}</span></label>
                    )}
                  </div>
                  <button type="button" className="btn btn-primary acc-next" onClick={() => complete(1)}>{L.checkout.continue}</button>
                </div>
              )}
            </section>

            {/* ---------- B2 Vận chuyển và mã giảm giá ---------- */}
            <section id="step-2" className="acc" data-open={open === 2} data-locked={!done.includes(1) && open !== 2} aria-labelledby="s2">
              {head(2, <>{pkgName} · {s ? (s.shippingPayable ? money(s.shippingPayable) : L.totals.free) : ""}{couponLabel && <><br />{L.checkout.couponLine}: {couponLabel}</>}</>)}
              {open === 2 && (
                <div className="acc-body">
                  {requoted && <p className="notice notice-info" role="status"><InfoIcon />{fmt(L.checkout.requoted, { n: meta?.quoteMaxAgeMinutes ?? 30 })}</p>}
                  {!quote || quoting && !quote.shipping ? (
                    <p className="notice notice-info"><span className="spinner" aria-hidden="true" />{L.checkout.quoting}</p>
                  ) : quote.shipping?.status === "unserved" ? (
                    <div className="notice notice-error" role="alert"><AlertIcon /><div><p>{L.checkout.unserved}</p><div className="actions"><button type="button" className="btn btn-sm" onClick={() => edit(1)}>{L.checkout.fixAddress}</button></div></div></div>
                  ) : quote.shipping?.status === "error" ? (
                    <div className="notice notice-error" role="alert"><AlertIcon /><div><p>{L.checkout.quoteFailed}</p><div className="actions"><button type="button" className="btn btn-sm" onClick={() => setNonce((n) => n + 1)}>{L.checkout.retry}</button></div></div></div>
                  ) : (
                    <>
                      <div className="choices" role="radiogroup" aria-labelledby="s2" aria-busy={quoting}>
                        {quote.shipping?.packages.map((p) => (
                          <label key={p.id} className="choice">
                            <input type="radio" name="pkg" checked={quote.pkg?.id === p.id} onChange={() => setPkgId(p.id)} />
                            <span>
                              <span className="choice-title">{p.serviceName[lang]}{p.cheapest && <span className="tag tag-accent">{L.checkout.cheapest}</span>}</span>
                              <span className="choice-desc" style={{ display: "block" }}>{fmt(L.checkout.eta, { date: new Date(p.etaDate).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-GB", { weekday: "short", day: "2-digit", month: "2-digit" }) })}</span>
                            </span>
                            <span className="choice-aside num">{money(p.fee)}</span>
                          </label>
                        ))}
                      </div>
                      <p className="help" style={{ marginTop: 12 }}>{fmt(L.checkout.source, { g: quote.weightGrams })}</p>
                      <p className="help">{quote.freeshipRemaining > 0 ? fmt(L.checkout.freeHint, { amount: money(quote.freeshipRemaining) }) : fmt(L.checkout.freeship, { amount: money(meta?.freeshipThreshold ?? 1_500_000) })}</p>
                    </>
                  )}

                  <button type="button" className="coupon-line" onClick={() => setCouponOpen(true)} disabled={!shipOk}>
                    <TagIcon />
                    <span>{L.checkout.couponLine}</span>
                    <span className="coupon-line-val">{couponLabel ?? ""}</span>
                    <span className="coupon-line-act">{coupon ? L.checkout.couponChange : L.checkout.couponChoose}</span>
                  </button>
                  {couponMsg && <p className="error-text" role="status" style={{ marginTop: 8 }}>{couponMsg}</p>}

                  <button type="button" className="btn btn-primary acc-next" disabled={!shipOk || quoting} onClick={() => complete(2)}>{L.checkout.continue}</button>
                </div>
              )}
            </section>

            {/* ---------- B3 Phương thức thanh toán ---------- */}
            <section id="step-3" className="acc" data-open={open === 3} aria-labelledby="s3">
              {head(3, <>{method === "cod" ? L.checkout.cod : L.checkout.sepay}</>)}
              {open === 3 && (
                <div className="acc-body">
                  <div className="choices" role="radiogroup" aria-labelledby="s3">
                    <label className="choice">
                      <input type="radio" name="pay" value="cod" checked={method === "cod"} disabled={Boolean(quote && !quote.codAllowed)} onChange={() => { setMethod("cod"); setPlaceError(null); }} />
                      <span>
                        <span className="choice-title">{L.checkout.cod}</span>
                        <span className="choice-desc" style={{ display: "block" }}>{L.checkout.codDesc}</span>
                        {quote && !quote.codAllowed && <span className="choice-desc warn-text" style={{ display: "block" }}>{fmt(L.checkout.codLocked, { amount: money(codCap) })}</span>}
                      </span>
                      <span className="choice-icon"><CashIcon /></span>
                    </label>
                    <label className="choice">
                      <input type="radio" name="pay" value="sepay" checked={method === "sepay"} disabled={Boolean(quote && !quote.sepayAvailable)} onChange={() => { setMethod("sepay"); setPlaceError(null); }} />
                      <span>
                        <span className="choice-title">{L.checkout.sepay}</span>
                        <span className="choice-desc" style={{ display: "block" }}>{L.checkout.sepayDesc}</span>
                        {quote && !quote.sepayAvailable && <span className="choice-desc warn-text" style={{ display: "block" }}>{L.checkout.sepayDown}</span>}
                      </span>
                      <span className="choice-icon"><QrIcon /></span>
                    </label>
                  </div>
                  <button type="button" className="btn btn-primary acc-next" onClick={() => complete(3)} disabled={(method === "cod" && Boolean(quote && !quote.codAllowed)) || (method === "sepay" && Boolean(quote && !quote.sepayAvailable))}>{L.checkout.continue}</button>
                </div>
              )}
            </section>

            {/* ---------- B4 Xem lại đơn ---------- */}
            <section id="step-4" className="acc" data-open={open === 4} aria-labelledby="s4">
              {head(4, null)}
              {open === 4 && allDone && quote && s && (
                <div className="acc-body">
                  <dl className="review-list">
                    <dt>{L.checkout.recipient}</dt><dd>{form.name}, {form.phone}<br />{form.email}</dd>
                    <button type="button" className="link-btn" onClick={() => edit(1)}>{L.checkout.edit}</button>
                    <dt>{L.checkout.deliverTo}</dt><dd>{[form.line, wardName, province?.name].filter(Boolean).join(", ")}{form.note && <><br /><span className="line-meta">{form.note}</span></>}</dd>
                    <button type="button" className="link-btn" onClick={() => edit(1)}>{L.checkout.edit}</button>
                    <dt>{L.checkout.shipBy}</dt><dd>{pkgName} · {s.shippingPayable ? money(s.shippingPayable) : L.totals.free}{couponLabel && <><br />{L.checkout.couponLine}: {couponLabel}</>}</dd>
                    <button type="button" className="link-btn" onClick={() => edit(2)}>{L.checkout.edit}</button>
                    <dt>{L.checkout.payWith}</dt><dd>{method === "cod" ? L.checkout.cod : L.checkout.sepay}</dd>
                    <button type="button" className="link-btn" onClick={() => edit(3)}>{L.checkout.edit}</button>
                  </dl>

                  <p className="notice notice-info review-notice"><InfoIcon />
                    {method === "sepay" ? fmt(L.checkout.noticeSepay, { n: meta?.sessionMinutes ?? 15 })
                      : s.total > autoCap ? fmt(L.checkout.noticeCodConfirm, { amount: money(autoCap) }) : L.checkout.noticeCod}
                  </p>

                  <div className="place">
                    <label className="check">
                      <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} aria-describedby="agree-help" />
                      <span>{fmtNodes(L.checkout.agree, {
                        terms: <a href="/policies/terms" target="_blank" rel="noopener">{L.checkout.terms}</a>,
                        privacy: <a href="/policies/privacy" target="_blank" rel="noopener">{L.checkout.privacy}</a>,
                      })}</span>
                    </label>
                    {!agreed && <p id="agree-help" className="help">{L.checkout.agreeRequired}</p>}
                    {placeError && <p className="notice notice-error" role="alert"><AlertIcon />{placeError}</p>}
                    <button type="button" className="btn btn-primary btn-block desktop-only" onClick={place} disabled={!canPlace}>
                      {placing ? <><span className="spinner" aria-hidden="true" />{L.checkout.placing}</> : method === "sepay" ? fmt(L.checkout.payBtn, { amount: money(s.total) }) : L.checkout.placeBtn}
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>

          <OrderSummary lines={quote?.lines ?? null} money={s ?? null} couponCode={quote?.coupon?.status === "applied" ? coupon : undefined}
            shippingKnown={shipOk} shippingLabel={quoting && form.wardId ? L.checkout.quoting : undefined} />
        </div>
      </main>

      {open === 4 && allDone && (
        <div className="mobile-bar">
          <span><span className="line-meta" style={{ display: "block" }}>{L.totals.total}</span><span className="total">{s ? money(s.total) : "—"}</span></span>
          <button type="button" className="btn btn-primary" onClick={place} disabled={!canPlace}>{placing ? L.checkout.placing : method === "sepay" ? fmt(L.checkout.payBtn, { amount: s ? money(s.total) : "" }) : L.checkout.placeBtn}</button>
        </div>
      )}

      {couponOpen && (
        <CouponDialog
          ctx={{ items, provinceId: form.provinceId, wardId: form.wardId, pkgId, phone: form.phone, email: form.email }}
          current={coupon}
          onClose={() => setCouponOpen(false)}
          onConfirm={(code) => { setCoupon(code); setCouponMsg(null); setCouponOpen(false); }}
        />
      )}
      {changes && <ChangesDialog changes={changes} onOk={reviewChanges} />}
    </>
  );
}

function fmtNodes(s: string, nodes: Record<string, React.ReactNode>) {
  return s.split(/(\{\w+\})/).map((p, i) => { const m = p.match(/^\{(\w+)\}$/); return <span key={i}>{m && nodes[m[1]] ? nodes[m[1]] : p}</span>; });
}

function ChangesDialog({ changes, onOk }: { changes: Change[]; onOk: () => void }) {
  const { L } = useLang();
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const kinds = Array.from(new Set(changes.map((c) => c.kind)));
  return (
    <div className="dialog-scrim" role="presentation">
      <div className="dialog stock" role="alertdialog" aria-modal="true" aria-labelledby="chg-t">
        <h2 id="chg-t">{L.checkout.changedTitle}</h2>
        <ul>{kinds.map((k) => <li key={k}>{L.checkout.changes[k]}{changes.filter((c) => c.kind === k && c.detail).map((c) => ` (${c.detail})`).join("")}</li>)}</ul>
        <button ref={ref} type="button" className="btn btn-primary" onClick={onOk}>{L.checkout.changedOk}</button>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <>
      <TopBar mode="checkout" />
      <Suspense><CheckoutInner /></Suspense>
      <Footer slim />
    </>
  );
}
