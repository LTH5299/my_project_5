# Next Fashion – Module thanh toán (Checkout v1.2)

Module thanh toán end to end cho Site Khách hàng, làm theo bộ tài liệu v1.2 (NF_CHECKOUT_URD_v1.2, NF_CHECKOUT_SRS_v1.2, NF_CHECKOUT_UM_v1.2, NF_CHECKOUT_RTM_v1.2 và prototype của BA):

giỏ hàng → 4 bước trên một trang (Thông tin nhận hàng, Vận chuyển và mã giảm giá, Phương thức thanh toán, Xem lại đơn) → COD tạo đơn ngay, hoặc phiên thanh toán SePay (NFP, giữ hàng 15 phút) → đơn hàng → vận đơn GHN/Viettel Post tạo tự động → theo dõi trạng thái giao, hủy đơn, email EM-01 đến EM-05.

Công nghệ: Next.js 15 (App Router, TypeScript), API route nội bộ, dữ liệu lưu trong `.data/db-v3.json`. SePay, GHN và Viettel Post chạy ở chế độ giả lập. Giao diện theo skill Hallmark (theme Atelier, chỉnh theo nhận diện xanh – trắng), tiếng Việt và tiếng Anh.

## Chạy thử

```bash
npm install
npm run dev
```

Mở http://localhost:3000. Các trang chính:

| Đường dẫn | Nội dung | Màn hình SRS |
| --- | --- | --- |
| `/` | Sản phẩm mẫu, thêm vào giỏ | |
| `/cart` | Giỏ hàng, nút "Mua hàng", tối đa min(tồn, 10) mỗi dòng | SCR-01 |
| `/checkout` | 4 bước dạng accordion, mỗi bước có nút Tiếp tục, nháp lưu 7 ngày | SCR-02 đến SCR-06 |
| `/pay/<NFP…>?t=…` | Trang quét VietQR của phiên thanh toán, đếm ngược 15 phút, "Đổi sang COD" | SCR-07 |
| `/order/<NF…>?t=…` | Đặt hàng / thanh toán thành công, mã vận đơn, hành trình đơn, hủy đơn | SCR-08, UC-09, UC-10 |
| `/orders` | Tra cứu đơn bằng mã + SĐT, "Đơn hàng của tôi" | UC-09 |
| `/admin` | Màn hình nội bộ giả lập: CSKH xác nhận COD, Kho đóng gói, Kế toán đối soát và hoàn tiền, nhật ký tích hợp, cấu hình | ADM-01 đến ADM-04, STF-01 |
| `/dev` | Bảng giả lập: chuyển khoản SePay các kiểu, webhook bị lỡ, tiền đến muộn, trạng thái GHN/VTP, công tắc lỗi đối tác, hộp thư email, tồn kho và giá | |
| `/dev/images` | Tự thay ảnh sản phẩm | |
| `/help/payment` | Câu hỏi về thanh toán | |

Thư mục dự án nằm trong OneDrive. Nếu `npm run dev` báo `EINVAL: invalid argument, readlink ... .next`, xóa thư mục `.next` rồi chạy lại.

Đưa web lên mạng (Render, link cố định): [TRIEN-KHAI.md](TRIEN-KHAI.md). Hướng dẫn tự sửa web: [HUONG-DAN-TU-SUA.md](HUONG-DAN-TU-SUA.md).

Kiểm thử tự động: `npm test` (43 ca, bám theo AC của SRS v1.2).

## Kịch bản thử nhanh

| Muốn thử | Làm thế nào |
| --- | --- |
| COD tự xác nhận, vận đơn tạo ngay | Đơn ≤ 2.000.000đ, SĐT bất kỳ khác 0909000000 |
| COD chờ CSKH gọi | Đơn > 2.000.000đ (áo khoác dạ 3.200.000đ) hoặc SĐT 0909000000; xử lý ở `/admin`, tab CSKH |
| Khóa COD | Tổng > 5.000.000đ (3 áo blazer) |
| Không giao được (MSG-02) | Tỉnh Lai Châu |
| Lỗi báo phí (MSG-03) | `/dev`: đặt cả GHN và Viettel Post thành "Lỗi 500" |
| Chỉ hiện một hãng | `/dev`: đặt một hãng thành "Quá 5 giây" |
| SePay gián đoạn (MSG-06) | `/dev`: bật "Kết nối SePay gián đoạn" |
| Đơn thay đổi khi bấm đặt (MSG-04) | Ở Bước 4, đổi giá ở `/dev` hoặc thuế suất ở `/admin` rồi bấm đặt |
| Phiên hết hạn (MSG-05) | Trang QR, rồi `/dev`: "Hết hạn ngay" |
| Tiền đến muộn, thiếu, thừa, thiếu mã | `/dev`, bảng Phiên thanh toán; xử lý ở `/admin`, tab Kế toán · Đối soát |
| Lỗi tạo vận đơn | `/dev`: bật "API tạo vận đơn bị lỗi"; xử lý ở `/admin`, tab Kho |
| Không hủy được vì đã lấy hàng | `/dev`: bật "ĐVVC báo đã lấy hàng khi khách hủy" |
| Mã giảm giá | GIAM10, GIAM100K, FREESHIP, NAM15, KHONGSALE, HETHAN, SAPMO, HETLUOT, MOTLAN (SĐT 0912345678 đã dùng) |

## Bảng truy vết yêu cầu

| Yêu cầu | Đã làm | Nơi xử lý |
| --- | --- | --- |
| UC-01 Giỏ hàng | Nút "Mua hàng"; tối đa min(tồn, 10); hết hàng báo MSG-01 và khóa Mua hàng; giá đổi thì gắn nhãn; "Phí giao và mã giảm giá được tính ở bước sau" | `app/cart` |
| UC-02 Thông tin nhận hàng | Họ tên 2–50 chữ, SĐT `^0[0-9]{9}$`, email, Tỉnh/Thành – Phường/Xã 2 cấp, địa chỉ 5–200 ký tự, ghi chú ≤ 200; báo lỗi đúng câu chữ SRS, con trỏ nhảy về ô lỗi đầu tiên; thành viên có danh sách địa chỉ đã lưu và "Lưu thông tin cho lần sau" | `lib/validation.ts`, `app/checkout` |
| UC-03 Phí giao hàng | Báo phí GHN và Viettel Post song song (giả lập, có quá 5 giây); chọn sẵn gói rẻ nhất, nhãn "Rẻ nhất"; ngày giao dự kiến; một hãng lỗi thì hiện hãng còn lại; cả hai lỗi MSG-03 + Thử lại; không phục vụ MSG-02 + Sửa địa chỉ; freeship khi tạm tính sau giảm ≥ 1.500.000đ; nháp quá 30 phút thì báo phí lại | `lib/shipping.ts`, `lib/quote.ts` |
| UC-04 Mã giảm giá | Hộp thoại SCR-04: danh sách mã công khai (mã chưa đủ điều kiện hiện mờ kèm lý do), ô nhập + Áp dụng, "Không dùng mã", "Xác nhận"; 7 câu báo lỗi theo SRS; % làm tròn xuống và có trần; mã tiền; freeship có trần; còn hiệu lực tới hết giây cuối; sai 5 lần khóa 10 phút; giỏ đổi làm mã hết điều kiện thì tự bỏ và báo lý do; chỉ trừ lượt khi tạo đơn | `lib/pricing.ts`, `lib/couponGuard.ts`, `components/CouponDialog.tsx` |
| UC-05 Đặt COD | Tạo đơn ngay (NF + 8 ký tự), trừ tồn và lượt mã, gửi EM-01; ≤ 2.000.000đ và SĐT không bị chặn thì tự xác nhận; còn lại "Chờ xác nhận"; > 5.000.000đ khóa COD; SĐT có 3 đơn chờ xác nhận thì từ chối | `lib/orders.ts` |
| UC-06 Phiên SePay | Bấm "Thanh toán {Tổng}" tạo phiên NFP, giữ hàng 15 phút, chưa phải đơn; trang QR có ngân hàng, số tài khoản, số tiền, nội dung, nút sao chép, đếm ngược, hỏi trạng thái 3 giây/lần; "Đổi sang COD" đóng phiên, nhả hàng, quay về Bước 4 | `lib/orders.ts`, `lib/sepay.ts`, `app/pay` |
| UC-07 Webhook SePay | Sai API key → 401; khớp mã NFP + đúng số tiền → tạo đơn "Đã thanh toán", gửi EM-02; webhook trùng không xử lý lại; thiếu tiền, thừa tiền, thiếu mã → danh sách đối soát, phiên vẫn chờ; hết 15 phút tra cứu giao dịch một lần cuối rồi mới hết hạn (MSG-05, không tạo đơn, không gửi email); tiền đến muộn → "Đến muộn {n} phút" | `lib/webhook.ts`, `app/api/webhooks/sepay` |
| UC-08 Xem lại và đặt | Thông báo riêng cho SePay và COD; Tổng đã gồm VAT, tách Tiền hàng chưa thuế và Thuế GTGT 8%; bắt buộc tick điều khoản; kiểm tra lại tồn, giá, mã, phí, thuế suất lúc bấm, có thay đổi thì MSG-04 kèm danh sách và mở lại bước liên quan; khóa idempotency chống tạo trùng | `lib/quote.ts`, `lib/orders.ts` |
| UC-09 Xem đơn | Qua link email (token), "Đơn hàng của tôi" khi đăng nhập, hoặc mã đơn + SĐT; sai thì "Không tìm thấy đơn hàng"; hành trình đơn, mã vận đơn + "Tra cứu ›" | `app/order`, `app/orders` |
| UC-10 Hủy đơn | Cho hủy khi trạng thái ≤ "Chờ lấy hàng", bắt buộc lý do; có vận đơn thì gọi hủy vận đơn trước, đã lấy hàng thì báo không hủy được; trả tồn và lượt mã; đơn đã trả tiền tạo yêu cầu hoàn tiền; gửi EM-05 | `lib/orders.ts` |
| UC-11 Vận đơn tự động (v1.2) | Đơn đủ điều kiện (đã thanh toán, COD tự xác nhận hoặc CSKH đã xác nhận) tạo vận đơn ngay → "Chờ lấy hàng", gửi EM-03; COD trên vận đơn = Tổng (COD) hoặc 0 (đã trả); lỗi thì "Lỗi tạo vận đơn" kèm thông báo đối tác, Admin "Sửa & tạo lại" hoặc đổi hãng | `lib/orders.ts`, `app/admin` |
| UC-12 Đóng gói | Kho in nhãn có sẵn, nhập khối lượng (bắt buộc, lệch > 30% cảnh báo), "Đóng gói xong" | `app/admin` (STF-01), `app/dev/label` |
| UC-13 Trạng thái giao | Webhook GHN (`/api/webhooks/ghn/<secret>`) và Viettel Post (`/api/webhooks/vtp`, TOKEN) ánh xạ về SM-01, chỉ cập nhật theo chiều tiến, chống trùng; EM-04 khi Đang giao, Đã giao, Giao thất bại; hoàn hàng trả tồn và tạo yêu cầu hoàn tiền nếu đã trả | `lib/shipping.ts`, `lib/orders.ts` |
| CSKH, Kế toán | ADM-01 gọi xác nhận COD, ghi số lần gọi, "Hủy (không liên lạc được)" sau 2 lần; ADM-02 Tạo đơn (trong 24 giờ, đủ tiền, còn hàng) hoặc Hoàn tiền; hoàn tiền đơn đã hủy | `app/admin`, `lib/webhook.ts` |
| NFR-09, NFR-10 | Nhật ký mọi lời gọi SePay, GHN, VTP, email (ADM-03); SĐT che, chỉ giữ 3 số cuối | `lib/log.ts` |
| Email EM-01…EM-05 | Mẫu xanh – trắng, mỗi mốc một email, gửi lỗi thì thử lại tối đa 3 lần | `lib/mail.ts` |
| ADM-04 Cấu hình | Trần COD, trần tự xác nhận, ngưỡng freeship, thuế suất, phút giữ hàng, cửa sổ tiền đến muộn, phút báo phí lại, SĐT bị chặn | `app/admin` |

## Giả định cần PO xác nhận

- Biểu phí GHN/VTP trong bản giả lập: nội thành Hà Nội, TP.HCM 30.000đ (GHN chuẩn), 32.000đ (VTP tiết kiệm), 36.000đ (VTP nhanh); tỉnh khác cộng 5.000đ; trên 1kg cộng 5.000đ mỗi 500g.
- Khối lượng chuẩn từng sản phẩm (áo sơ mi 300g, đầm 350g, blazer 700g, quần 500g, túi 250g, áo khoác dạ 1.200g).
- Giữ hàng chung cho phiên thanh toán: tồn khả dụng trừ ngay khi tạo phiên NFP, trả lại khi phiên hết hạn hoặc đóng.
- Kế toán "Tạo đơn" từ giao dịch thừa tiền khi phiên còn chờ thì dùng hàng đang giữ; phần tiền thừa xử lý hoàn riêng.

## Dữ liệu cần thay trước khi go-live

- Ảnh sản phẩm thật (đang dùng ảnh minh họa Wikimedia Commons, có ghi nguồn).
- Danh mục Tỉnh/Thành – Phường/Xã đầy đủ lấy từ GHN.
- Tài khoản nhận tiền SePay, `SEPAY_WEBHOOK_KEY`, `GHN_WEBHOOK_SECRET`, `VTP_WEBHOOK_TOKEN`, hotline, Zalo (`.env.example`).
- Nội dung Điều khoản sử dụng, Chính sách đổi trả, Chính sách bảo mật do Phòng Pháp lý duyệt.

## Chuyển sang đối tác thật

1. Sao chép `.env.example` thành `.env.local`, đặt `SEPAY_MODE=live`, điền tài khoản nhận tiền và các khóa webhook.
2. SePay: webhook về `https://<tên miền>/api/webhooks/sepay`, xác thực "API Key".
3. GHN và Viettel Post: thay phần giả lập trong `src/lib/shipping.ts` bằng lời gọi Open API (báo phí, tạo vận đơn, hủy vận đơn), cấu hình webhook trạng thái về hai đường dẫn ở bảng trên.
4. Bản demo lưu bằng file JSON và xử lý trong một luồng. Khi chạy thật cần CSDL có transaction (khóa dòng tồn kho), job quét phiên hết hạn và gửi lại email chạy riêng, và đăng nhập nhân viên cho `/admin`.
