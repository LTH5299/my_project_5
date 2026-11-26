import { findOrder } from "@/lib/orders";
import { devToolsEnabled } from "@/lib/devtools";
import { formatVnd } from "@/lib/money";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// Nhãn vận đơn giả lập (bản thật tải PDF nhãn từ GHN /a5/gen-token hoặc VTP /order/printing-code)
export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!devToolsEnabled()) return new Response("Not found", { status: 404 });
  const { code } = await params;
  const o = findOrder(code);
  if (!o?.shipment.trackingCode) return new Response("Not found", { status: 404 });
  const cod = o.method === "cod" ? o.money.total : 0;
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Nhãn ${esc(o.shipment.trackingCode)}</title>
<style>body{font-family:Arial,sans-serif;margin:24px;color:#111}.l{width:400px;border:2px solid #111;padding:16px}h1{font-size:18px;margin:0 0 8px}.big{font-size:28px;font-weight:bold;letter-spacing:2px;margin:8px 0}.r{display:flex;justify-content:space-between;border-top:1px solid #111;padding:6px 0}.bars{height:56px;background:repeating-linear-gradient(90deg,#111 0 2px,#fff 2px 4px,#111 4px 7px,#fff 7px 9px);margin:8px 0}@media print{button{display:none}}</style></head>
<body><div class="l"><h1>${o.shipment.carrier === "GHN" ? "GIAO HÀNG NHANH" : "VIETTEL POST"}</h1><div class="bars"></div><div class="big">${esc(o.shipment.trackingCode)}</div>
<div class="r"><span>Đơn</span><b>${esc(o.code)}</b></div>
<div class="r"><span>Người nhận</span><b>${esc(o.customer.name)} · ${esc(o.customer.phone)}</b></div>
<div class="r"><span>Địa chỉ</span><span style="text-align:right">${esc(o.address.line)}, ${esc(o.address.wardName)}, ${esc(o.address.provinceName)}</span></div>
<div class="r"><span>Thu hộ (COD)</span><b>${formatVnd(cod)}</b></div>
<div class="r"><span>Dịch vụ</span><span>${esc(o.shipment.serviceName.vi)}</span></div></div>
<p><button onclick="print()">In nhãn</button></p></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
