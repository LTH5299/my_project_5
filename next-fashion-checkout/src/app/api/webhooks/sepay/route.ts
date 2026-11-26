import { NextResponse } from "next/server";
import { handleSepayWebhook, verifyWebhookAuth } from "@/lib/webhook";
import { sepayConfig } from "@/lib/sepay";
import { logCall } from "@/lib/log";
import { save } from "@/lib/store";

export const dynamic = "force-dynamic";

// Webhook SePay: header "Authorization: Apikey <khóa>", trả 200 {"success": true}
export async function POST(req: Request) {
  if (!verifyWebhookAuth(req.headers.get("authorization"), sepayConfig().webhookKey)) {
    logCall({ partner: "SePay", action: "webhook", http: 401, ms: 2, note: "Sai API key" });
    save();
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }
  const p = await req.json().catch(() => null);
  if (!p || p.id == null || typeof p.transferAmount !== "number") return NextResponse.json({ success: false, error: "bad_payload" }, { status: 400 });
  return NextResponse.json({ success: true, outcome: handleSepayWebhook(p) });
}
