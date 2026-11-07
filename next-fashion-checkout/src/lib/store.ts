import fs from "node:fs";
import path from "node:path";
import type { Coupon, CouponUsage, Mail, Order, Product, UnmatchedTransaction } from "./types";
import { SEED_PRODUCTS } from "./data/catalog";
import { SEED_COUPON_USAGE, seedCoupons } from "./data/coupons";

export interface DB {
  products: Product[];
  coupons: Coupon[];
  couponUsage: CouponUsage[];
  orders: Order[];
  unmatched: UnmatchedTransaction[];
  processedTransactionIds: string[];
  outbox: Mail[];
  couponFailures: Record<string, { count: number; lockedUntil?: string }>;
  orderSeq: Record<string, number>;
  settings: { sepayFailNext: boolean; mailFailNext: boolean };
}

function seed(): DB {
  return {
    products: structuredClone(SEED_PRODUCTS),
    coupons: seedCoupons(),
    couponUsage: structuredClone(SEED_COUPON_USAGE),
    orders: [],
    unmatched: [],
    processedTransactionIds: [],
    outbox: [],
    couponFailures: {},
    orderSeq: {},
    settings: { sepayFailNext: false, mailFailNext: false },
  };
}

// Lưu trữ đơn giản bằng file JSON cho bản chạy thử. Mọi thao tác đọc-kiểm tra-ghi
// chạy đồng bộ trong một lượt của event loop nên không có hai yêu cầu chen nhau
// (đây là cách chặn bán vượt tồn trong bản demo; bản thật dùng transaction của CSDL).
const g = globalThis as unknown as { __nfdb?: DB; __nfdbFile?: string | null };

function dataFile(): string | null {
  if (process.env.NF_DB_MEMORY === "1") return null;
  return path.join(process.cwd(), ".data", "db.json");
}

export function db(): DB {
  if (!g.__nfdb) {
    g.__nfdbFile = dataFile();
    if (g.__nfdbFile && fs.existsSync(g.__nfdbFile)) {
      g.__nfdb = { ...seed(), ...JSON.parse(fs.readFileSync(g.__nfdbFile, "utf8")) };
    } else {
      g.__nfdb = seed();
    }
  }
  return g.__nfdb!;
}

export function save() {
  const file = g.__nfdbFile;
  if (!file || !g.__nfdb) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(g.__nfdb, null, 1));
  fs.renameSync(tmp, file);
}

export function resetDb() {
  g.__nfdb = seed();
  save();
}

export function findVariant(variantId: string) {
  for (const p of db().products) {
    const v = p.variants.find((x) => x.id === variantId);
    if (v) return { product: p, variant: v };
  }
  return undefined;
}
