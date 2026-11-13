# UC-08 — Phục hồi bản nháp soạn dở

a) **Actor & mục tiêu:** Giáo viên quay lại phiên soạn bộ đề dở trước đó không mất nội dung.

b) **Tiền điều kiện:** localStorage có draft schema v2 chưa quá 7 ngày. `assignment-test-draft-store.ts:15-23,170-194`

c) **Trigger:** Vào `/assignments/tests/new` (create mode). `test-builder-shell.tsx:101-106`

d) **Kịch bản chính:**
1. Autosave debounce 1s khi có nội dung (header hoặc slot draft). `test-builder-shell.tsx:256-277`; `testDraftHasContent` `assignment-test-draft-store.ts:212-226`
2. Quay lại trang → banner "Đã phục hồi bản nháp bộ đề — kiểm tra rồi tiếp tục, hoặc Hủy để soạn mới."; state đã được nạp sẵn. `test-builder-shell.tsx:666-689,107-171`
3. "Tiếp tục" giữ; "Hủy" xóa draft + reset form. `test-builder-shell.tsx:589-601`

e) **Nhánh mở rộng:**
- 1a. Vượt 512KB → skip + console.warn (mất draft khi reload — có cảnh báo). `assignment-test-draft-store.ts:150-157`
- 1b. QuotaExceeded / private mode → bỏ qua im lặng. `assignment-test-draft-store.ts:158-161`
- 2a. Draft lỗi shape/hết hạn → xóa key, không banner. `assignment-test-draft-store.ts:177-184`
- 3a. Đổi skill khi đang có part/draft → confirm xóa dữ liệu kỹ năng cũ. `test-builder-shell.tsx:284-300`
- Submit thành công (kể cả outcome-unknown) → draft bị clear, không hồi sinh. `test-builder-shell.tsx:502-510`

f) **Nghiệp vụ/quy tắc:** FR-014; NFR-006.

g) **Hậu điều kiện:** Phiên soạn tiếp tục từ nội dung cũ hoặc form trắng sạch.

h) **Nguồn & nhãn:** S3 draft-store + shell. Nhãn ✅ (được test qua shell test draft-restore khởi tạo state — `test-builder-shell.tsx:101-171`).
