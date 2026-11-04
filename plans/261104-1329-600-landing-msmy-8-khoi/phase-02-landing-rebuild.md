# Phase 2: Dựng lại landing 8 khối

## Context
Viết lại `apps/profile/public/index.html` theo `.orca/drops/landing-msmy-noi-dung-moi.md`. Giữ token CSS, font, honeypot, logic gửi lead, và luồng `?ketqua=&khoa=`.

## Requirements
- 8 khối đúng thứ tự và nội dung trong handoff, dùng nguyên văn tiếng Việt của handoff.
- Hero: 1 nút chính (`kiem-tra-dau-vao/`) và 1 link Zalo phụ; dòng nhỏ về thời lượng test và quà "Khám Bệnh Tiếng Anh 1-1".
- Header: giữ `#studentPortalLink` và một link kiểm tra đầu vào duy nhất trong `.nav-actions`; bỏ nút "Đăng Ký Khóa Học" và các link nav tới khối đã bỏ.
- Ba khóa dạng thẻ, mỗi thẻ có đầu ra, giá (hoặc "Nhắn Zalo để nhận báo giá"), nút "Đăng ký khóa này" cuộn tới form và chọn sẵn khóa.
- Khối "Học viên nói gì" đặt ngay sau khóa học, giữ 3 phản hồi thật kèm ảnh chụp tin nhắn có sẵn (`assets/pinned-post-20-10/student-feedback.jpg` và ảnh trong `assets/teacher-profile/images`).
- Khối cô Mỹ rút gọn, 3 ảnh bằng cấp bấm phóng to bằng `imgModal` hiện có, 1 link "Tải hồ sơ cô Mỹ".
- Form 3 ô, nút "Gửi đăng ký", dòng dưới nút theo handoff. Ngày sinh, khung giờ, hình thức, mục tiêu, kết quả test cũ không còn trên form; `placement` hidden và banner kết quả test vẫn giữ.
- Giữ nguyên các anchor id quan trọng: `#lam-test-mien-phi` và `#dang-ky-tu-van` để các liên kết cũ và luồng kết quả không vỡ.
- Hỏi đáp 4 câu dùng `<details>`; hai câu chưa có dữ kiện hiển thị "Nhắn Zalo để nhận báo giá" và tư vấn theo trường hợp, không ghi placeholder `[ ... ]` ra công khai.
- Thanh dính cuối màn hình chỉ trên điện thoại (CSS media query), 1 nút "Làm test miễn phí", tự ẩn khi form tư vấn vào viewport hoặc khi input đang focus để tránh che bàn phím.
- Giữ canonical `https://msmy.io.vn/`, meta `lead-api`, 1 `<h1>`, không `<script src>`.
## Files
- Sửa: `apps/profile/public/index.html`
- Đọc: `apps/profile/serve.mjs` (`replaceLeadApiMeta`, `replaceStudentPortalHref`); `DESIGN.md` (landing dùng token riêng trong file, nên chỉ tham chiếu khi cần)

## Steps
1. Chụp ảnh trước (3 viewport) làm baseline.
2. Dựng khung 8 khối với nội dung mới, xóa dần khối cũ, chạy `pnpm --filter profile test` sau mỗi khối.
3. Thu gọn form và JS: bỏ code đọc/validate các ô đã xóa (`studentEmail`, `studentBirthDate`, `studyMode`, `studyDays`, `timeSlot`, `targetNote`), giữ draft, validate tên và Zalo, honeypot, elapsedMs, hộp thành công, khối dự phòng khi API lỗi.
4. Cập nhật select khóa: 3 khóa mới và "Chưa rõ, cần cô tư vấn" (`undecided`).
5. Thêm mapper cho tham số URL `?khoa=`: nếu nhận mã khóa cũ (từ bộ đề placement như `ielts-foundation`, `ielts-pre`...), tự động map sang khóa mới tương ứng (`ielts-foundation`/`ielts-first-step` -> `foundation-core`, `ielts-pre`/`ielts-advanced` -> `ielts-practical`, mã khác/lạ thì bỏ qua an toàn).
6. Kiểm tra bằng tay ở 3 viewport và bàn phím (focus thấy rõ, `<details>` thao tác được bằng phím, ảnh phóng to đóng bằng Esc).
## Validation
- `pnpm --filter profile test`
- `pnpm exec biome check .`
- Chụp ảnh sau, so với baseline, không tràn ngang ở 375px.

## Risk / Rollback
Một file lớn, rủi ro lệch CSS. Rollback bằng revert commit; không đụng dữ liệu.
