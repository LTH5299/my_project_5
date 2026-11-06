import { NextResponse } from "next/server";
import { handleSepayWebhook, verifyWebhookAuth } from "@/lib/webhook";
import { sepayConfig } from "@/lib/sepay";

export const dynamic = "force-dynamic";

// Endpoint nhận webhook SePay. SePay gửi header "Authorization: Apikey <khóa>" và
// coi phản hồi HTTP 200 kèm {"success": true} là đã nhận.
export async function POST(req: Request) {
  if (!verifyWebhookAuth(req.headers.get("authorization"), sepayConfig().webhookKey)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }
  const p = await req.json().catch(() => null);
  if (!p || p.id == null || typeof p.transferAmount !== "number") {
    return NextResponse.json({ success: false, error: "bad_payload" }, { status: 400 });
  }
  const outcome = handleSepayWebhook(p);
  return NextResponse.json({ success: true, outcome });
}
