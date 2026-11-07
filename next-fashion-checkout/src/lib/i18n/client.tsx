"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { dict } from "./dict";
import type { Lang } from "../types";
import { formatVnd } from "../money";

export function fmt(s: string, vars: Record<string, string | number> = {}) {
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

// "Size M" nhưng giữ nguyên "Free size" để không lặp chữ
export function sizeLabel(size: string, prefix = "Size") {
  return /free|one size/i.test(size) ? size : `${prefix} ${size}`;
}

type Ctx = { lang: Lang; L: (typeof dict)[Lang]; setLang: (l: Lang) => void; money: (n: number) => string };
const LangContext = createContext<Ctx | null>(null);

export function LangProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    document.cookie = `nf_lang=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
  }, []);
  const value = useMemo<Ctx>(() => ({ lang, L: dict[lang], setLang, money: (n) => formatVnd(n, lang) }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const c = useContext(LangContext);
  if (!c) throw new Error("useLang outside LangProvider");
  return c;
}
