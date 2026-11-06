"use client";
import { useCallback, useEffect, useState } from "react";
import type { CartItem } from "./types";

// Giỏ của khách vãng lai lưu trên trình duyệt tối thiểu 7 ngày (REQ-A6.3.1, đề xuất).
const KEY = "nf_cart";
const TTL_MS = 7 * 24 * 3600 * 1000;

export function readCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as { items: CartItem[]; updatedAt: number };
    if (Date.now() - data.updatedAt > TTL_MS) return [];
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}

export function writeCart(items: CartItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ items, updatedAt: Date.now() }));
    window.dispatchEvent(new Event("nf-cart"));
  } catch { /* trình duyệt chặn lưu trữ: giỏ chỉ sống trong phiên */ }
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sync = () => setItems(readCart());
    sync();
    setReady(true);
    window.addEventListener("nf-cart", sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("nf-cart", sync); window.removeEventListener("storage", sync); };
  }, []);
  const update = useCallback((next: CartItem[]) => { writeCart(next); setItems(next); }, []);
  return { items, ready, update, count: items.reduce((s, i) => s + i.qty, 0) };
}

export function clientId() {
  try {
    let id = localStorage.getItem("nf_client");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("nf_client", id); }
    return id;
  } catch {
    return "anonymous";
  }
}
