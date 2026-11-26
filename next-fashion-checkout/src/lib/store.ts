import fs from "node:fs";
import path from "node:path";
import type {
  Coupon, CouponUsage, IntegrationLog, Mail, Order, PaymentSession, Product, ReconItem, RefundRequest, Settings,
} from "./types";
import { SEED_PRODUCTS } from "./data/catalog";
import { SEED_COUPON_USAGE, defaultSettings, seedCoupons } from "./data/coupons";

export interface DB {
  version: 3;
  products: Product[];
  coupons: Coupon[];
  couponUsage: CouponUsage[];
  sessions: PaymentSession[];
  orders: Order[];
  recon: ReconItem[];
  refunds: RefundRequest[];
  processedTransactionIds: string[];
  sepayLedger: { id: string; amount: number; content: string; code?: string; at: string }[]; // giao dịch SePay (để API tra cứu)
  carrierEvents: string[]; // khóa chống trùng webhook ĐVVC
  outbox: Mail[];
  logs: IntegrationLog[];
  couponFailures: Record<string, { count: number; lockedUntil?: string }>;
  settings: Settings;
  savedProfiles: Record<string, { name: string; phone: string; email: string; provinceId: string; wardId: string; line: string }>;
}

function seed(): DB {
  return {
    version: 3,
    products: structuredClone(SEED_PRODUCTS),
    coupons: seedCoupons(),
    couponUsage: structuredClone(SEED_COUPON_USAGE),
    sessions: [], orders: [], recon: [], refunds: [],
    processedTransactionIds: [], sepayLedger: [], carrierEvents: [],
    outbox: [], logs: [], couponFailures: {},
    settings: defaultSettings(),
    savedProfiles: {},
  };
}

// Bản demo lưu bằng file JSON; mọi thao tác đọc-kiểm tra-ghi chạy đồng bộ trong một lượt event loop.
// Bản thật dùng CSDL có giao tác và khóa dòng tồn kho (NFR-05).
const g = globalThis as unknown as { __nfdb3?: DB; __nfdbFile3?: string | null };

function dataFile(): string | null {
  if (process.env.NF_DB_MEMORY === "1") return null;
  return path.join(process.cwd(), ".data", "db-v3.json");
}

export function db(): DB {
  if (!g.__nfdb3) {
    g.__nfdbFile3 = dataFile();
    const f = g.__nfdbFile3;
    g.__nfdb3 = f && fs.existsSync(f) ? { ...seed(), ...JSON.parse(fs.readFileSync(f, "utf8")) } : seed();
  }
  return g.__nfdb3!;
}

export function save() {
  const file = g.__nfdbFile3;
  if (!file || !g.__nfdb3) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(g.__nfdb3));
  fs.renameSync(tmp, file);
}

export function resetDb() {
  g.__nfdb3 = seed();
  save();
}

export function findVariant(variantId: string) {
  for (const p of db().products) {
    const v = p.variants.find((x) => x.id === variantId);
    if (v) return { product: p, variant: v };
  }
  return undefined;
}

export function settings() {
  return db().settings;
}
