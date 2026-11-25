"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Footer, TopBar } from "@/components/Chrome";
import { formatDateTime, formatVnd } from "@/lib/money";
import type { Settings } from "@/lib/types";
import { RECON_VI, STATUS_VI, useAdminState, type AdminOrder } from "@/lib/useAdminState";

const TABS = [
  ["cskh", "CSKH · Xác nhận COD"],
  ["kho", "Kho · Đóng gói"],
  ["recon", "Kế toán · Đối soát"],
  ["refund", "Kế toán · Hoàn tiền"],
  ["log", "Nhật ký tích hợp"],
  ["config", "Cấu hình"],
] as const;
type Tab = (typeof TABS)[number][0];

// Màn hình nội bộ (bản giả lập) theo SRS v1.2: ADM-01, STF-01, ADM-02, ADM-03, ADM-04
export default function AdminPage() {
  const { s, log, admin } = useAdminState();
  const [tab, setTab] = useState<Tab>("cskh");
  useEffect(() => { const h = window.location.hash.slice(1) as Tab; if (TABS.some(([k]) => k === h)) setTab(h); }, []);
  const go = (t: Tab) => { setTab(t); history.replaceState(null, "", `#${t}`); };
  const count: Record<Tab, number> = {
    cskh: s?.orders.filter((o) => o.status === "pending_confirmation").length ?? 0,
    kho: s?.orders.filter((o) => (o.status === "awaiting_pickup" && !o.packedWeightGrams) || (o.status === "packing" && o.shipment.error)).length ?? 0,
    recon: s?.recon.filter((r) => r.status === "open").length ?? 0,
    refund: s?.refunds.filter((r) => r.status === "open").length ?? 0,
    log: 0, config: 0,
  };
  return (
    <>
      <TopBar />
      <main className="container dev">
        <div className="page-head" style={{ paddingBottom: 0 }}>
          <h1>Màn hình nội bộ</h1>
          <p>Bản giả lập cho CSKH, Kho và Kế toán. Bản thật đặt sau đăng nhập nhân viên và phân quyền theo vai trò. <Link href="/dev">Bảng giả lập</Link></p>
        </div>
        <div className="tabs" role="tablist" aria-label="Khu vực">
          {TABS.map(([k, t]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className="tab" onClick={() => go(k)}>{t}{count[k] > 0 && <span className="cart-count">{count[k]}</span>}</button>
          ))}
        </div>
        {log && <p className="notice notice-info" role="status">{log}</p>}
        {!s ? <div className="skeleton" style={{ height: 240 }} /> : (
          <>
            {tab === "cskh" && <Cskh orders={s.orders} phones={s.phones} admin={admin} />}
            {tab === "kho" && <Kho orders={s.orders} admin={admin} />}
            {tab === "recon" && (
              <section className="stock dev-panel">
                <h2>Giao dịch cần đối soát (ADM-02)</h2>
                <p className="help">Tạo đơn khi tiền về trong {s.settings.lateWindowHours} giờ, đủ tiền và còn hàng. Còn lại thì hoàn tiền trong 7 ngày làm việc.</p>
                <div className="tbl-wrap"><table>
                  <thead><tr><th>Giao dịch</th><th>Lúc nhận</th><th>Số tiền</th><th>Nội dung</th><th>Phiên</th><th>Lý do</th><th>Xử lý</th></tr></thead>
                  <tbody>
                    {s.recon.length === 0 && <tr><td colSpan={7}>Không có giao dịch cần đối soát.</td></tr>}
                    {s.recon.map((r) => (
                      <tr key={r.transactionId}>
                        <td>{r.transactionId}</td><td>{formatDateTime(r.receivedAt)}</td>
                        <td>{formatVnd(r.amount)}{r.expectedAmount != null && <><br /><span className="line-meta">Cần {formatVnd(r.expectedAmount)}</span></>}</td>
                        <td>{r.content}</td><td>{r.sessionCode ?? "—"}</td>
                        <td>{RECON_VI[r.reason]}{r.lateMinutes ? ` ${r.lateMinutes} phút` : ""}</td>
                        <td>{r.status === "open" ? (
                          <div className="row-actions">
                            <button type="button" className="btn btn-sm" onClick={() => admin({ action: "reconCreate", txId: r.transactionId }, "Tạo đơn")}>Tạo đơn</button>
                            <button type="button" className="btn btn-sm btn-quiet" onClick={() => admin({ action: "reconRefund", txId: r.transactionId }, "Hoàn tiền")}>Hoàn tiền</button>
                          </div>
                        ) : r.status === "order_created" ? `Đã tạo ${r.orderCode}` : `Đã hoàn (${r.refundRef})`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </section>
            )}
            {tab === "refund" && (
              <section className="stock dev-panel">
                <h2>Yêu cầu hoàn tiền</h2>
                <div className="tbl-wrap"><table>
                  <thead><tr><th>Đơn</th><th>Số tiền</th><th>Lý do</th><th>Tạo lúc</th><th>Xử lý</th></tr></thead>
                  <tbody>
                    {s.refunds.length === 0 && <tr><td colSpan={5}>Không có yêu cầu hoàn tiền.</td></tr>}
                    {s.refunds.map((r) => (
                      <tr key={r.orderCode + r.createdAt}>
                        <td>{r.orderCode}</td><td>{formatVnd(r.amount)}</td><td>{r.reason}</td><td>{formatDateTime(r.createdAt)}</td>
                        <td>{r.status === "open" ? <button type="button" className="btn btn-sm" onClick={() => admin({ action: "refundDone", code: r.orderCode }, "Đã hoàn tiền")}>Đã chuyển hoàn</button> : `Xong (${r.refundRef})`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </section>
            )}
            {tab === "log" && (
              <section className="stock dev-panel">
                <h2>Nhật ký tích hợp (ADM-03)</h2>
                <p className="help">Mỗi lời gọi tới SePay, GHN, Viettel Post và máy chủ email. Không lưu SĐT đầy đủ.</p>
                <div className="tbl-wrap"><table>
                  <thead><tr><th>Thời điểm</th><th>Đối tác</th><th>Hành động</th><th>HTTP</th><th>ms</th><th>Tham chiếu</th><th>Ghi chú</th></tr></thead>
                  <tbody>
                    {s.logs.map((l, i) => (
                      <tr key={i} data-bad={l.http === 0 || l.http >= 400}>
                        <td>{formatDateTime(l.at)}</td><td>{l.partner}</td><td>{l.action}</td><td>{l.http || "timeout"}</td><td>{l.ms}</td><td>{l.ref ?? ""}</td><td>{l.note ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </section>
            )}
            {tab === "config" && <Config settings={s.settings} admin={admin} />}
          </>
        )}
      </main>
      <Footer />
    </>
  );
}

type Admin = (body: object, label: string) => Promise<{ ok?: boolean; warn?: boolean; expected?: number; error?: string }>;

function Cskh({ orders, phones, admin }: { orders: AdminOrder[]; phones: Record<string, string>; admin: Admin }) {
  const list = orders.filter((o) => o.status === "pending_confirmation");
  return (
    <section className="stock dev-panel">
      <h2>Đơn COD cần gọi xác nhận (ADM-01)</h2>
      <p className="help">Đơn COD trên trần tự xác nhận hoặc SĐT từng bom hàng. Gọi 2 lần không được thì hủy.</p>
      <div className="tbl-wrap"><table>
        <thead><tr><th>Đơn</th><th>Khách</th><th>SĐT</th><th>Tổng</th><th>Lý do</th><th>Đã gọi</th><th>Xử lý</th></tr></thead>
        <tbody>
          {list.length === 0 && <tr><td colSpan={7}>Không có đơn chờ xác nhận.</td></tr>}
          {list.map((o) => (
            <tr key={o.code}>
              <td>{o.code}<br /><span className="line-meta">{formatDateTime(o.createdAt)}</span></td>
              <td>{o.customer.name}</td><td>{phones[o.code]}</td><td>{formatVnd(o.money.total)}</td>
              <td>{o.confirmReason === "blocked_phone" ? "SĐT từng bom hàng" : "COD > 2 triệu"}</td>
              <td>{o.callAttempts} lần</td>
              <td><div className="row-actions">
                <button type="button" className="btn btn-sm" onClick={() => admin({ action: "confirm", code: o.code }, `Xác nhận ${o.code}`)}>Xác nhận</button>
                <button type="button" className="btn btn-sm btn-quiet" onClick={() => admin({ action: "call", code: o.code }, `Gọi ${o.code} không được`)}>Gọi không được</button>
                <button type="button" className="btn btn-sm btn-quiet" disabled={o.callAttempts < 2} onClick={() => admin({ action: "cancelUnreachable", code: o.code }, `Hủy ${o.code}`)}>Hủy (không liên lạc được)</button>
                <button type="button" className="btn btn-sm btn-quiet" onClick={() => { const r = prompt("Lý do hủy theo yêu cầu khách"); if (r) admin({ action: "cancel", code: o.code, reason: r }, `Hủy ${o.code}`); }}>Khách hủy</button>
              </div></td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </section>
  );
}

function Kho({ orders, admin }: { orders: AdminOrder[]; admin: Admin }) {
  const toPack = orders.filter((o) => o.status === "awaiting_pickup");
  const failed = orders.filter((o) => o.status === "packing" && o.shipment.error);
  const [grams, setGrams] = useState<Record<string, string>>({});
  const [warn, setWarn] = useState<Record<string, string>>({});
  return (
    <>
      {failed.length > 0 && (
        <section className="stock dev-panel">
          <h2>Lỗi tạo vận đơn</h2>
          <div className="tbl-wrap"><table>
            <thead><tr><th>Đơn</th><th>ĐVVC</th><th>Lỗi từ đối tác</th><th>Xử lý</th></tr></thead>
            <tbody>
              {failed.map((o) => (
                <tr key={o.code}>
                  <td>{o.code}</td><td>{o.shipment.carrier}</td><td className="error-text">Lỗi tạo vận đơn: {o.shipment.error}</td>
                  <td><div className="row-actions">
                    <button type="button" className="btn btn-sm" onClick={() => admin({ action: "retryWaybill", code: o.code }, `Tạo lại ${o.code}`)}>Sửa &amp; tạo lại</button>
                    <button type="button" className="btn btn-sm btn-quiet" onClick={() => admin({ action: "retryWaybill", code: o.code, carrier: o.shipment.carrier === "GHN" ? "VTP" : "GHN" }, `Đổi ĐVVC ${o.code}`)}>Đổi sang {o.shipment.carrier === "GHN" ? "Viettel Post" : "GHN"}</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>
      )}
      <section className="stock dev-panel">
        <h2>Đơn chờ đóng gói (STF-01)</h2>
        <p className="help">Vận đơn đã tạo sẵn: in nhãn, cân hàng, đóng gói. Lệch quá 30% so với khối lượng chuẩn sẽ cảnh báo.</p>
        <div className="tbl-wrap"><table>
          <thead><tr><th>Đơn</th><th>Vận đơn</th><th>Sản phẩm</th><th>Khối lượng chuẩn</th><th>Cân thực tế (g)</th><th>Xử lý</th></tr></thead>
          <tbody>
            {toPack.length === 0 && <tr><td colSpan={6}>Không có đơn chờ đóng gói.</td></tr>}
            {toPack.map((o) => (
              <tr key={o.code}>
                <td>{o.code}<br /><span className="line-meta">{STATUS_VI[o.status]}</span></td>
                <td>{o.shipment.carrier} {o.shipment.trackingCode}<br /><a href={o.shipment.labelUrl} target="_blank" rel="noopener">In nhãn</a></td>
                <td>{o.items.map((i) => <div key={i.variantId}>{i.qty} × {i.sku}</div>)}</td>
                <td>{o.expectedWeight}g</td>
                <td>{o.packedWeightGrams ? `${o.packedWeightGrams}g` : (
                  <input className="input" style={{ width: 110, minHeight: 36 }} type="number" min={1} aria-label={`Khối lượng ${o.code}`} value={grams[o.code] ?? ""} onChange={(e) => setGrams({ ...grams, [o.code]: e.target.value })} />
                )}{warn[o.code] && <div className="warn-text">{warn[o.code]}</div>}</td>
                <td>{!o.packedWeightGrams && <button type="button" className="btn btn-sm" onClick={async () => {
                  const r = await admin({ action: "pack", code: o.code, grams: Number(grams[o.code]) }, `Đóng gói ${o.code}`);
                  setWarn({ ...warn, [o.code]: r.error === "weight_required" ? "Nhập khối lượng" : r.warn ? `Lệch quá 30% so với ${r.expected}g, kiểm tra lại` : "" });
                }}>Đóng gói xong</button>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </section>
    </>
  );
}

const CONFIG: [string, string, number][] = [
  ["codCap", "Trần COD (đ)", 1000], ["autoConfirmCap", "Trần tự xác nhận COD (đ)", 1000], ["freeshipThreshold", "Ngưỡng freeship (đ)", 1000],
  ["vatRate", "Thuế suất GTGT (0,08 = 8%)", 0.01], ["sessionMinutes", "Giữ hàng phiên thanh toán (phút)", 1], ["lateWindowHours", "Cửa sổ tiền đến muộn (giờ)", 1], ["quoteMaxAgeMinutes", "Báo phí lại sau (phút)", 1],
];

function Config({ settings: st, admin }: { settings: Settings; admin: Admin }) {
  const settings = st as unknown as Record<string, unknown>;
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(CONFIG.map(([k]) => [k, String(settings[k])])));
  const [phones, setPhones] = useState(((settings.blockedPhones as string[]) ?? []).join(", "));
  return (
    <section className="stock dev-panel">
      <h2>Tham số cấu hình (ADM-04)</h2>
      <div className="grid-2">
        {CONFIG.map(([k, label, step]) => (
          <div className="field" key={k}><label htmlFor={`c-${k}`}>{label}</label><input id={`c-${k}`} className="input" type="number" step={step} min={0} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>
        ))}
        <div className="field"><label htmlFor="c-ph">SĐT từng bom hàng (cách nhau bởi dấu phẩy)</label><input id="c-ph" className="input" value={phones} onChange={(e) => setPhones(e.target.value)} /></div>
      </div>
      <div className="row-actions">
        <button type="button" className="btn btn-primary" onClick={() => admin({ action: "settings", settings: { ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Number(x)])), blockedPhones: phones.split(/[\s,;]+/).filter(Boolean) } }, "Lưu cấu hình")}>Lưu cấu hình</button>
      </div>
      <p className="help">Đổi thuế suất hoặc phí khi khách đang ở Bước 4 sẽ làm hiện thông báo MSG-04 lúc bấm đặt.</p>
    </section>
  );
}
