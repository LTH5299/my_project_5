# Đưa web Next Fashion lên mạng để gửi cho người khác

Có hai cách. Cách 1 cho đường link cố định, dùng để gửi PO, giảng viên, nhóm. Cách 2 chỉ để cho người khác xem nhanh trong lúc máy anh/chị đang chạy.

## Cách 1: Render (miễn phí, link cố định)

Render chạy web như một máy chủ luôn bật, phù hợp với bản demo này (giỏ hàng, đơn hàng, đồng hồ QR 15 phút đều hoạt động).

### Bước 1: Đưa code vào nhánh main

Render lấy code từ nhánh `main` của repo `LTH5299/my_project_5`. Mở PR từ nhánh `feature/checkout-module` vào `main` và bấm **Merge**:

https://github.com/LTH5299/my_project_5/compare/main...feature/checkout-module?expand=1

Lưu ý: repo đang có workflow CD tự build Docker khi có thay đổi trên `main`. Workflow đó build `Dockerfile` ở gốc repo, không liên quan thư mục `next-fashion-checkout`. Nếu nó báo lỗi vì thiếu tài khoản Docker Hub thì đó là lỗi có sẵn của repo, không ảnh hưởng web trên Render.

### Bước 2: Tạo dịch vụ trên Render

1. Vào https://render.com, bấm **Get Started**, đăng nhập bằng tài khoản GitHub `LTH5299`.
2. Bấm **New +**, chọn **Blueprint**.
3. Chọn repo `my_project_5` (lần đầu cần bấm **Configure GitHub** để cho Render đọc repo này).
4. Render đọc tệp `render.yaml` ở gốc repo và hiện dịch vụ `next-fashion-checkout`. Bấm **Apply**.
5. Đợi khoảng 3–5 phút cho lần build đầu. Khi trạng thái là **Live**, link có dạng:
   `https://next-fashion-checkout.onrender.com`

Gửi link đó cho người xem. Các trang chính:

| Trang | Link |
| --- | --- |
| Cửa hàng | `/` |
| Thanh toán | `/checkout` |
| Giả lập chuyển khoản SePay, hộp thư email, tồn kho | `/dev` |
| Thay ảnh sản phẩm | `/dev/images` |

### Cần biết về bản miễn phí

- Không có ai truy cập trong 15 phút thì web tạm ngủ. Lần mở sau chờ khoảng 30–60 giây để web thức dậy. Trước buổi demo, mở link trước vài phút.
- Đơn hàng thử, ảnh tải lên qua `/dev/images` và dữ liệu đã sửa sẽ mất mỗi khi Render khởi động lại hoặc build lại. Web tự quay về dữ liệu mẫu.
- Trang `/dev` đang bật để người xem tự thử luồng SePay. Ai có link cũng vào được trang này, nên đây chỉ là bản demo, không dùng để bán hàng thật.
- Mỗi lần merge code mới vào `main`, Render tự build lại.

### Khi muốn bán hàng thật

Cần làm thêm trước khi mở cho khách:

1. Thay kho dữ liệu file JSON bằng cơ sở dữ liệu (PostgreSQL), đặt job hủy đơn quá hạn chạy riêng.
2. Tắt `/dev`: đặt `ENABLE_DEV_TOOLS` và `NEXT_PUBLIC_ENABLE_DEV_TOOLS` thành `false`.
3. Đặt `SEPAY_MODE=live`, điền tài khoản nhận tiền thật, cấu hình webhook SePay trỏ về `https://<tên miền>/api/webhooks/sepay` với đúng `SEPAY_WEBHOOK_KEY` (xem trong tab Environment của Render).
4. Gắn tên miền riêng (Render: Settings, Custom Domains) và chuyển sang gói trả phí để web không ngủ.

## Cách 2: Chia sẻ tạm từ máy đang chạy

Dùng khi chỉ cần cho người khác xem trong vài giờ và máy anh/chị đang chạy `npm run dev`.

1. Tải Cloudflare Tunnel (`cloudflared`): https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
2. Trong lúc web đang chạy, mở terminal khác và gõ:

```bash
cloudflared tunnel --url http://localhost:3000
```

3. Terminal in ra một link `https://....trycloudflare.com`. Gửi link đó. Link chỉ hoạt động khi máy anh/chị còn bật và lệnh còn chạy.
