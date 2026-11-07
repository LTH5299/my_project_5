import Link from "next/link";

export const metadata = { title: "Câu hỏi về thanh toán – Next Fashion", description: "Giải đáp về thanh toán COD và chuyển khoản VietQR tại Next Fashion." };

// FAQ thanh toán theo REQ-A8.3.2 (v2.1: SePay/VietQR, hạn 15 phút)
const FAQ = [
  ["Next Fashion nhận những hình thức thanh toán nào?", "Bạn có thể trả tiền mặt khi nhận hàng (COD) hoặc chuyển khoản bằng mã VietQR. Đơn trên 5.000.000đ cần chuyển khoản trước."],
  ["Thanh toán bằng VietQR như thế nào?", "Sau khi đặt hàng, trang đơn hàng hiện mã QR đã điền sẵn số tiền và nội dung là mã đơn. Bạn mở app ngân hàng, quét mã và xác nhận. Hệ thống tự ghi nhận, bạn không cần gửi ảnh chụp."],
  ["Tôi có bao lâu để chuyển khoản?", "15 phút kể từ lúc mã QR hiện ra. Trang đơn hàng có đồng hồ đếm ngược và ghi rõ giờ hết hạn."],
  ["Quá 15 phút chưa thanh toán thì sao?", "Đơn tự hủy và sản phẩm được trả lại kho. Bạn có thể bấm Đặt lại đơn này để đặt lại."],
  ["Tôi đã chuyển tiền nhưng đơn bị hủy, phải làm gì?", "Giao dịch của bạn vẫn được ghi nhận để Kế toán đối chiếu. Bạn gọi hotline hoặc nhắn Zalo, nhân viên CSKH sẽ liên hệ xử lý."],
  ["Có được sửa số tiền hoặc nội dung chuyển khoản không?", "Bạn vui lòng giữ nguyên. Nếu số tiền hoặc nội dung khác với đơn, hệ thống không thể tự xác nhận."],
];

export default function PaymentFaq() {
  return (
    <main className="container" style={{ paddingBlock: "64px" }}>
      <div className="stack" style={{ maxWidth: "64ch", gap: 24 }}>
        <h1>Câu hỏi về thanh toán</h1>
        {FAQ.map(([q, a]) => (
          <div key={q} className="stack" style={{ gap: 6 }}>
            <h2>{q}</h2>
            <p>{a}</p>
          </div>
        ))}
        <p><Link href="/checkout">Quay lại thanh toán</Link></p>
      </div>
    </main>
  );
}
