# Next Fashion – Module thanh toán (Checkout A7)

Module thanh toán end to end cho Site Khách hàng: giỏ hàng → thông tin nhận hàng → vận chuyển → phương thức thanh toán → xem lại và đặt hàng → trang đặt hàng thành công / màn hình VietQR → email. Xây dựng theo Requirement List v2.1 (nhánh A7), UC-01 đến UC-08, US-01 đến US-17, FC-01, ACT-01 và SEQ-01.

Công nghệ: Next.js 15 (App Router, TypeScript), API route nội bộ, dữ liệu lưu trong `.data/db.json`, SePay chạy ở chế độ giả lập (đổi sang `live` bằng biến môi trường). Giao diện thiết kế theo skill Hallmark (theme Atelier, chỉnh lại theo nhận diện xanh – trắng), hỗ trợ tiếng Việt và tiếng Anh.

## Chạy thử

```bash
npm install
npm run dev
```

Mở http://localhost:3000. Các trang chính:

| Đường dẫn | Nội dung |
| --- | --- |
| `/` | Danh sách sản phẩm mẫu, thêm vào giỏ, mini-cart |
| `/cart` | Giỏ hàng |
| `/checkout` | Trang thanh toán 4 bước |
| `/order/<mã đơn>?t=<mã truy cập>` | Trang đặt hàng thành công, màn hình QR SePay |
| `/dev` | Công cụ giả lập: thay vai SePay gửi webhook, Kế toán xem giao dịch không khớp, hộp thư email, đổi tồn kho/giá, bật lỗi SePay/lỗi email |
| `/dev/images` | Tự thay ảnh sản phẩm: chọn ảnh, căn khung 4:5, lưu (không cần sửa code) |
| `/help/payment` | FAQ thanh toán (A8.3.2) |

Thư mục dự án nằm trong OneDrive. Nếu `npm run dev` báo `EINVAL: invalid argument, readlink ... .next`, xóa thư mục `.next` rồi chạy lại.

Hướng dẫn tự sửa web cho người không lập trình (ảnh, sản phẩm, chữ, màu, thông tin liên hệ): [HUONG-DAN-TU-SUA.md](HUONG-DAN-TU-SUA.md).

Kiểm thử tự động: `npm test` (33 ca, bám theo AC của US-07 và US-11 cùng các ngoại lệ trong UC-01).

## Bảng truy vết yêu cầu

| REQ | Đã làm | Nơi xử lý |
| --- | --- | --- |
| A7.1.1 Họ tên, SĐT, email | Họ tên 2–50 ký tự, không chứa số; SĐT 10 số, đầu 03/05/07/08/09, tự chuẩn hóa +84; email bắt buộc. Lỗi hiện ngay dưới ô, không xóa dữ liệu. Tải lại trang vẫn giữ thông tin. Có link đăng nhập (không bắt buộc) | `lib/validation.ts`, `app/checkout` |
| A7.1.2 Tỉnh/Thành – Phường/Xã | Danh sách 2 cấp, không nhập tay. Chưa chọn Tỉnh thì khóa Phường. Đổi Tỉnh thì đặt lại Phường và tính lại phí. Địa chỉ cũ còn Quận/Huyện thì yêu cầu chọn lại | `lib/data/locations.ts` |
| A7.1.3 Địa chỉ chi tiết | 5–200 ký tự, phải có chữ, báo "Vui lòng nhập số nhà, tên đường" | `lib/validation.ts` |
| A7.1.4 Ghi chú | Tối đa 250 ký tự, có bộ đếm, không cho nhập thêm; không ảnh hưởng giá | `app/checkout` |
| A1.4.3 / UC-03 Sổ địa chỉ | Thành viên mẫu: tự điền địa chỉ mặc định, chọn địa chỉ khác, sửa chỉ áp dụng cho đơn này, cảnh báo địa chỉ cũ và ngoài vùng giao | `app/checkout`, `lib/data/coupons.ts` (DEMO_MEMBER) |
| A7.2.1 Tính phí ship | Theo bảng phí vùng do admin cấu hình, ngưỡng miễn phí 1.500.000đ. Khu vực chưa có phí: báo "Chưa hỗ trợ giao đến khu vực này" và chặn đặt. Đang tính phí: khóa nút Đặt hàng | `lib/pricing.ts` |
| A7.2.2 Hiển thị phí ship | Tạm tính, Giảm giá, Phí vận chuyển, Tổng thanh toán; Tổng = Tạm tính − Giảm giá + Phí ship, luôn ≥ 0; miễn phí vẫn giữ dòng "Miễn phí" | `components/Summary.tsx` |
| A7.3.1 Áp mã | Mã %, mã tiền, mã freeship; mức giảm tối đa; không vượt tạm tính; giới hạn danh mục và hàng Sale; lượt tổng và lượt theo SĐT/email; khách vãng lai kiểm tra lại khi nhập SĐT; áp thử không tính lượt | `lib/pricing.ts` |
| A7.3.2 Báo lỗi mã | Thông báo riêng cho 7 trường hợp, nêu số tiền còn thiếu; sai 5 lần liên tiếp khóa ô 10 phút | `lib/couponGuard.ts` |
| A7.3.3 Gỡ mã | Gỡ mã tính lại ngay, không tính lượt; giỏ/địa chỉ/SĐT đổi làm mã hết điều kiện thì tự gỡ và báo lý do | `app/checkout` |
| A7.4.1 COD | Chọn sẵn COD, hiện "Số tiền thanh toán khi nhận hàng"; đơn trên 5.000.000đ khóa COD và chuyển sang SePay; đơn COD "Chờ xác nhận", "Chưa thanh toán" | `lib/orders.ts` |
| A7.4.2 SePay VietQR | QR động (số tiền = tổng, nội dung = mã đơn), ngân hàng, số tài khoản, nút sao chép, đếm ngược 15 phút và giờ hết hạn; webhook xác thực bằng `Apikey`; chỉ nhận khi số tiền và nội dung khớp; webhook trùng chỉ xử lý 1 lần; quá hạn thì hủy đơn và hoàn tồn; tiền lệch hoặc chuyển sau khi hủy thì ghi "Không khớp đơn"; SePay lỗi thì hủy đơn vừa tạo, hoàn tồn và lượt mã, khách chọn Thử lại hoặc COD | `lib/sepay.ts`, `lib/webhook.ts`, `app/api/webhooks/sepay` |
| A7.5.1 Xem lại đơn | Người nhận, địa chỉ, phương thức, số sản phẩm, link sửa; bắt buộc tick Điều khoản sử dụng và Chính sách đổi trả | `app/checkout` |
| A7.5.2 Kiểm tra lại khi đặt | Kiểm tra tồn, giá, mã, phí ship tại thời điểm bấm; có thay đổi thì không tạo đơn và hiện hộp thoại liệt kê thay đổi | `lib/orders.ts` |
| A7.5.3 Chặn hết hàng | Hai khách cùng đặt món cuối: chỉ đơn đầu được tạo, tồn không âm; khách sau quay về giỏ với dòng đánh dấu "Hết hàng" | `lib/orders.ts`, `app/cart` |
| A7.5.4 Đặt hàng | Mã đơn `NF` + yymmdd + 4 số (chỉ chữ không dấu và số); trừ tồn khi tạo đơn; lưu giá, mã, phí ship lúc đặt; tối đa 3 đơn chờ mỗi SĐT; khóa nút sau lần bấm đầu và chống tạo trùng bằng khóa idempotency | `lib/orders.ts` |
| A7.6.1 Trang thành công | Mã đơn, tóm tắt, phương thức, thời gian xử lý, hotline/Zalo; đơn SePay tự chuyển "Thanh toán thành công" hoặc "Đã hủy do quá hạn" kèm nút đặt lại; sai mã truy cập thì báo "Không tìm thấy đơn hàng"; sự kiện Purchase (GA4 `dataLayer`, Meta Pixel) chỉ ghi 1 lần | `app/order/[code]` |
| A7.6.2 Email | Email xác nhận, thanh toán thành công, hủy do quá hạn; mẫu xanh – trắng; mỗi sự kiện chỉ 1 email; gửi lỗi thì tự gửi lại sau 1 phút | `lib/mail.ts` |
| A6.x Giỏ hàng | Giỏ khách vãng lai lưu 7 ngày; +/−, giảm về 0 thì hỏi xác nhận xóa; tối đa 5/biến thể; kiểm tra lại tồn, giá, trạng thái mỗi lần mở; mini-cart tự đóng sau 5 giây | `app/cart`, `app/page.tsx` |
| A8.3.2 FAQ thanh toán | COD, VietQR, hạn 15 phút, đơn bị hủy, đã chuyển tiền nhưng đơn hủy | `app/help/payment` |

Ngoài phạm vi module này (đúng theo Out of scope của US-07, US-11): tạo và cấu hình mã trên Site quản trị, đối chiếu và hoàn tiền thủ công của Kế toán/CSKH, đóng gói và giao hàng (ACT-02), email "giao thành công" và "hoàn hàng" do trạng thái từ ĐVVC kích hoạt.

## Quyết định đã chốt với BA và các giả định

Đã chốt với BA:
1. SePay lỗi khi tạo QR: hủy đơn vừa tạo, hoàn tồn kho và lượt mã, khách chọn lại COD hoặc thử lại.
2. Tiền lệch hoặc chuyển sau khi đơn hủy: theo US-11, đơn giữ nguyên trạng thái, giao dịch vào danh sách "Không khớp đơn" để Kế toán đối chiếu. Requirement List v2.1 (A7.4.2, A1.5.2) vẫn còn ghi "Chờ hoàn tiền", cần cập nhật.

Giả định theo hướng đề xuất trong tài liệu, cần PO xác nhận:
- Đã có mã thì chặn nhập mã thứ hai, phải gỡ mã cũ trước.
- Webhook về đúng 00:00 thì coi là hết hạn. Mã giảm giá hết hiệu lực đúng tại thời điểm kết thúc.
- Đơn SePay hết hạn thì trả lại lượt dùng mã giảm giá.
- Các con số: trần COD 5.000.000đ, 3 đơn chờ/SĐT, khóa mã 10 phút sau 5 lần sai, ngưỡng miễn phí ship 1.500.000đ, phí 25.000đ/35.000đ theo vùng.

## Dữ liệu cần thay trước khi go-live

- Ảnh sản phẩm: hiện là ảnh minh họa có giấy phép mở từ Wikimedia Commons, nằm trong `public/products/`, đã ghi nguồn ở footer (danh sách đầy đủ trong `src/lib/data/photoCredits.ts`). Khi có ảnh chụp sản phẩm thật, chỉ cần thay file cùng tên và xóa phần ghi nguồn tương ứng.
- Danh mục Tỉnh/Thành – Phường/Xã đầy đủ: lấy từ GHN/GHTK.
- Bảng phí vận chuyển thật.
- Tài khoản nhận tiền SePay, `SEPAY_WEBHOOK_KEY`, hotline, link Zalo (`.env.example`).
- Nội dung Điều khoản sử dụng, Chính sách đổi trả, Chính sách bảo mật do Phòng Pháp lý duyệt.

## Chuyển sang SePay thật

1. Sao chép `.env.example` thành `.env.local`, đặt `SEPAY_MODE=live`, điền tài khoản nhận tiền và khóa webhook.
2. Trên SePay, tạo webhook trỏ về `https://<tên miền>/api/webhooks/sepay`, kiểu xác thực "API Key".
3. Bản demo lưu dữ liệu bằng file JSON và xử lý trừ tồn trong một luồng. Khi chạy thật cần thay bằng CSDL có transaction (khóa dòng tồn kho) và job hủy đơn quá hạn chạy riêng.
