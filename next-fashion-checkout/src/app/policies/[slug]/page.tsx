import Link from "next/link";
import { notFound } from "next/navigation";

const TITLES: Record<string, string> = {
  terms: "Điều khoản sử dụng",
  returns: "Chính sách đổi trả",
  privacy: "Chính sách bảo mật",
};

// Trang giữ chỗ: nội dung chính thức do Phòng Pháp lý duyệt (REQ-A8.1.x)
export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const title = TITLES[slug];
  if (!title) notFound();
  return (
    <main className="container" style={{ paddingBlock: "64px" }}>
      <div className="stack" style={{ maxWidth: "60ch" }}>
        <h1>{title}</h1>
        <p>Nội dung trang này do Phòng Pháp lý của Next Fashion cung cấp và duyệt trước khi đăng, kèm ngày hiệu lực.</p>
        <p><Link href="/checkout">Quay lại thanh toán</Link></p>
      </div>
    </main>
  );
}
