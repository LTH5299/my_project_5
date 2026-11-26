import Link from "next/link";

export const metadata = { title: "Câu hỏi về thanh toán – Next Fashion", description: "Giải đáp về thanh toán COD và chuyển khoản VietQR tại Next Fashion." };

// FAQ thanh toán theo SRS v1.2: phiên thanh toán NFP giữ hàng 15 phút, đơn chỉ tạo khi tiền về
const FAQ = [
  ["Next Fashion nhận những hình thức thanh toán nào?", "Bạn có thể trả tiền mặt khi nhận hàng (COD) hoặc chuyển khoản bằng mã VietQR. Đơn trên 5.000.000đ cần chuyển khoản trước."],
  ["Thanh toán bằng VietQR như thế nào?", "Ở bước Xem lại đơn, bạn bấm Thanh toán để nhận mã QR đã điền sẵn số tiền và nội dung (mã phiên bắt đầu bằng NFP). Mở app ngân hàng, quét mã và xác nhận. Hệ thống tự ghi nhận, bạn không cần gửi ảnh chụp."],
  ["Khi nào đơn chuyển khoản được tạo?", "Đơn chỉ được tạo sau khi Next Fashion nhận đủ tiền. Trong lúc chờ, sản phẩm được giữ cho bạn 15 phút."],
  ["Quá 15 phút chưa thanh toán thì sao?", "Phiên thanh toán hết hạn, sản phẩm được trả lại kho và không có đơn nào được tạo. Bạn bấm Thanh toán lại để quay về bước chọn phương thức với thông tin cũ."],
  ["Tôi đã chuyển tiền nhưng phiên đã hết hạn?", "Đừng chuyển lại. Giao dịch của bạn vẫn được ghi nhận để Kế toán đối soát và liên hệ trong 24 giờ: tạo đơn nếu còn hàng, hoặc hoàn tiền trong 7 ngày làm việc."],
  ["Có được sửa số tiền hoặc nội dung chuyển khoản không?", "Bạn vui lòng giữ nguyên. Nếu số tiền hoặc nội dung khác, hệ thống không thể tự xác nhận và giao dịch sẽ chuyển sang Kế toán đối soát."],
  ["Bao giờ tôi có mã vận đơn?", "Ngay khi đơn đủ điều kiện (đã thanh toán, hoặc COD đã xác nhận), shop tự tạo vận đơn GHN hoặc Viettel Post và gửi mã qua email. Bạn tra cứu bằng mã đơn và số điện thoại ở mục Tra cứu đơn."],
  ["Tôi có hủy đơn được không?", "Được, khi đơn chưa được đơn vị vận chuyển lấy hàng. Mở trang đơn, bấm Hủy đơn và chọn lý do. Đơn đã chuyển khoản sẽ được hoàn tiền trong 7 ngày làm việc."],
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
        <p><Link href="/orders">Tra cứu đơn hàng</Link> · <Link href="/checkout">Quay lại thanh toán</Link></p>
      </div>
    </main>
  );
}
