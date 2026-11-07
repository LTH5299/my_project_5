# Hướng dẫn tự sửa web Next Fashion

Tài liệu cho người không lập trình. Mỗi mục ghi rõ sửa ở đâu, sửa thế nào và cách xem kết quả.

## 0. Mở web trên máy

1. Cài Node.js bản 20 trở lên (https://nodejs.org), chọn bản LTS.
2. Mở thư mục `next-fashion-checkout`, bấm chuột phải, chọn "Open in Terminal".
3. Lần đầu gõ `npm install`, những lần sau bỏ qua bước này.
4. Gõ `npm run dev` rồi mở http://localhost:3000.

Mọi thay đổi ở các mục dưới sẽ hiện ngay khi lưu tệp, chỉ cần tải lại trang. Nếu terminal báo `EINVAL ... readlink ... .next`, xóa thư mục `.next` rồi chạy lại `npm run dev`.

Để sửa tệp, nên dùng VS Code (https://code.visualstudio.com) để có màu chữ và báo lỗi.

## 1. Thay ảnh sản phẩm (không cần sửa code)

Cách nhanh nhất:

1. Mở http://localhost:3000/dev/images.
2. Ở sản phẩm cần thay, bấm **Chọn ảnh từ máy**, chọn ảnh JPG, PNG hoặc WEBP.
3. Kéo **Căn ngang**, **Căn dọc**, **Phóng to** cho sản phẩm nằm gọn trong khung dọc 4:5.
4. Bấm **Lưu ảnh**. Ảnh hiện ngay ở cửa hàng, giỏ hàng, trang thanh toán. Dòng ghi nguồn ảnh minh họa ở footer tự ẩn với sản phẩm đó.
5. Muốn quay về ảnh cũ: bấm **Dùng lại ảnh minh họa**.

Ảnh đã tải lên nằm trong `.data/uploads/`. Đơn đã đặt vẫn giữ ảnh tại thời điểm đặt.

Cách thay cố định trong mã nguồn (dùng khi bàn giao cho đội Dev):

- Đặt ảnh vào `public/products/` với đúng tên cũ (ví dụ `blazer.jpg`), khung dọc 4:5, khuyến nghị 800 × 1000 px, dưới 300 KB.
- Nếu đó là ảnh của shop, xóa dòng tương ứng trong `src/lib/data/photoCredits.ts` để footer không ghi nguồn nữa.

Gợi ý chụp ảnh cho đồng bộ với giao diện: nền trắng hoặc xám nhạt, ánh sáng đều, sản phẩm ở giữa khung, chừa khoảng trống phía trên, cùng một góc chụp cho mọi sản phẩm.

## 2. Thêm hoặc sửa sản phẩm, giá, tồn kho

Tệp: `src/lib/data/catalog.ts`. Mỗi sản phẩm là một khối:

```ts
{
  id: "p-blazer",                         // mã sản phẩm, không dấu, không trùng
  image: "/products/blazer.jpg",          // ảnh trong public/products
  name: { vi: "Áo blazer dáng suông", en: "Relaxed-fit blazer" },
  category: "nu",                         // "nu", "nam" hoặc "phu-kien"
  onSale: false,                          // true để hiện nhãn Sale
  variants: [
    { id: "v-blazer-den-m", sku: "NF-BZ03-DE-M", color: { vi: "Đen", en: "Black" },
      swatch: "#23262b", size: "M", price: 1890000, stock: 9, active: true },
  ],
},
```

- `price` là giá bán (VNĐ, không dấu chấm). Hàng Sale thêm `compareAt` là giá gốc.
- `stock` là tồn kho. `active: false` để ngừng bán biến thể đó.
- `swatch` là mã màu của ô chọn màu.

Sau khi sửa tệp này, vào http://localhost:3000/dev và bấm **Đặt lại dữ liệu mẫu** để web nạp lại danh mục. Thao tác này xóa các đơn thử.

Đổi nhanh tồn kho và giá để thử tình huống: trang `/dev`, bảng cuối trang.

## 3. Sửa chữ trên web (tiếng Việt và tiếng Anh)

Tệp: `src/lib/i18n/dict.ts`. Khối `vi` là tiếng Việt, khối `en` là tiếng Anh, hai khối có cùng tên mục.

Ví dụ, đổi dòng mô tả trên banner:

```ts
shop: {
  title: "Bộ sưu tập thu đông",
  lead: "Áo sơ mi, đầm linen, blazer, áo khoác dạ và phụ kiện cho mùa mới.",
```

- Giữ nguyên phần trong ngoặc nhọn như `{amount}`, `{n}`, `{code}`: web tự điền số liệu vào đó.
- Sửa câu tiếng Việt thì sửa luôn câu tiếng Anh cùng mục.

## 4. Đổi màu, chữ, khoảng cách

Tệp: `src/app/globals.css`, khối `:root` ở đầu tệp. Mọi màu trên web đều lấy từ khối này, nên đổi một chỗ là cả web đổi theo.

| Muốn đổi | Sửa token |
| --- | --- |
| Màu xanh chính (nút, banner, footer, số tiền) | `--color-accent` |
| Màu xanh khi rê chuột vào nút | `--color-accent-hover` |
| Nền trang | `--color-paper` |
| Nền khung tóm tắt đơn | `--color-paper-2` |
| Màu chữ chính | `--color-ink` |
| Màu chữ phụ | `--color-muted` |
| Cỡ chữ tiêu đề banner | `--text-hero` |
| Độ bo góc (hiện là 0, góc vuông) | `--radius`, `--radius-card` |

Màu viết dạng `oklch(32% 0.12 264)`: số đầu là độ sáng, số giữa là độ đậm màu, số cuối là sắc độ (264 là xanh dương). Có thể thay bằng mã hex như `#14306b`.

Font chữ đặt trong `src/app/layout.tsx`: Cormorant Garamond cho tiêu đề, Inter cho chữ đọc. Muốn đổi font, chọn font có hỗ trợ tiếng Việt trên Google Fonts.

Toàn bộ quy tắc thiết kế (màu, chữ, khoảng cách, thành phần giao diện) xem trong bộ design system Next Fashion Web.

## 5. Thông tin liên hệ, tài khoản nhận tiền

Sao chép `.env.example` thành `.env.local`, rồi điền:

- `NEXT_PUBLIC_HOTLINE`, `NEXT_PUBLIC_ZALO_URL`: hotline và link Zalo.
- `SEPAY_ACCOUNT_NUMBER`, `SEPAY_ACCOUNT_NAME`, `SEPAY_BANK_CODE`, `SEPAY_BANK_BIN`, `SEPAY_BANK_NAME`: tài khoản nhận tiền đã cấu hình trên SePay.
- `SEPAY_MODE=live` khi chạy với SePay thật.

Khởi động lại `npm run dev` sau khi sửa tệp này.

## 6. Mã giảm giá, phí vận chuyển

- Mã giảm giá mẫu: `src/lib/data/coupons.ts`.
- Bảng phí ship theo vùng và ngưỡng miễn phí: `src/lib/data/locations.ts` (`SHIPPING_ZONES`, `FREE_SHIPPING_THRESHOLD`).

Bản chạy thật sẽ lấy hai phần này từ Site quản trị. Các tệp trên chỉ để thử luồng.

## 7. Kiểm tra trước khi giao cho đội Dev

```bash
npm test
```

```bash
npm run build
```

Cả hai phải chạy xong không báo lỗi. Sau khi build, xóa thư mục `.next` trước khi chạy lại `npm run dev`.
