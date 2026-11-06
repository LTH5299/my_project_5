import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Cormorant_Garamond, Inter } from "next/font/google";
import "./globals.css";
import { LangProvider } from "@/lib/i18n/client";
import type { Lang } from "@/lib/types";

// Cormorant Garamond cho tiêu đề (chất editorial của các nhà mốt), Inter cho chữ đọc và số tiền.
// Cả hai đều có bộ ký tự tiếng Việt đầy đủ dấu.
const display = Cormorant_Garamond({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600"], variable: "--nf-display", display: "swap" });
const body = Inter({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600"], variable: "--nf-body", display: "swap" });

export const metadata: Metadata = {
  title: "Next Fashion – Thanh toán",
  description: "Thanh toán đơn hàng Next Fashion bằng tiền mặt khi nhận hàng hoặc chuyển khoản VietQR.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang: Lang = (await cookies()).get("nf_lang")?.value === "en" ? "en" : "vi";
  return (
    <html lang={lang} className={`${display.variable} ${body.variable}`}>
      <body>
        <LangProvider initial={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}
