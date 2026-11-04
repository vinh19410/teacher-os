# Phase 3: Chuyển nội dung ra khỏi trang chính

## Context
Handoff yêu cầu đưa 4 thứ ra khỏi trang chính nhưng không mất chúng.

## Requirements
- Kịch bản tư vấn và lời mời test: sang trang nội bộ `apps/profile/public/noi-bo/index.html`, `<meta name="robots" content="noindex,nofollow">`, không link từ nav, footer, trang kiểm tra hay sitemap. Nút copy có fallback khi clipboard không khả dụng.
- Bảng quy đổi CEFR theo giờ học: vào trang kết quả của `kiem-tra-dau-vao/`, giữ hành vi chọn dải và panel chi tiết.
- 5 file PDF: chỉ còn 1 link "Tải hồ sơ cô Mỹ" ở khối 8, có hai nhóm Tiếng Việt và Tiếng Anh; file PDF trong `assets/teacher-profile/pdf` giữ nguyên.
- 6 bảo chứng đã gộp vào thanh tin cậy và khối cô Mỹ ở phase 2 (không còn khối riêng).

## Files
- Tạo: `apps/profile/public/noi-bo/index.html`
- Sửa: `apps/profile/public/kiem-tra-dau-vao/index.html`, `test.js`, `test.css`
- Đọc: `apps/profile/build.mjs` (thư mục con tự được copy; xác nhận `noi-bo/` vào `dist`)

## Steps
1. Lấy nguyên văn khối copy kịch bản và logic copy từ bản `index.html` cũ (git history) sang trang nội bộ.
2. Thêm khối CEFR vào màn kết quả của bài test, tái dùng dữ liệu và JS của panel cũ.
3. Thêm test: trang nội bộ có meta noindex, không chứa data nhạy cảm; không được trang chủ hay trang con nào link tới; `dist` có `noi-bo/index.html`.
4. Kiểm tra copy clipboard trên trang nội bộ có fallback an toàn.
## Validation
- `pnpm --filter profile test`
- `pnpm --filter profile build` rồi mở bản dist
- Chạy lại `profile-placement-test` e2e để chắc luồng kết quả không vỡ

## Risk / Rollback
Trang nội bộ công khai về mặt kỹ thuật (không auth). Đã chốt chấp nhận vì chỉ là kịch bản chat.
