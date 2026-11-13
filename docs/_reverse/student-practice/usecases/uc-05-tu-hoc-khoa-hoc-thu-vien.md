---
feature: student-practice
type: reverse-usecase
uc: UC-05
status: draft
updated: "2026-11-12"
---

# UC-05 — Tự học khóa học từ vựng thư viện

a. **Mục tiêu:** Học viên tự chọn khóa học dùng chung (không qua giáo viên), mở bài học
   và học như bộ từ thường. 🟡 (khái niệm "tự đăng ký" không có nút tách biệt — OQ-10)
b. **Actor:** Học viên.
c. **Tiền điều kiện:** Đăng nhập; danh mục khóa đọc được cho mọi học viên.
d. **Luồng chính (truy vết F6 + F2):**
   1. Tổng quan → CTA khóa học → `/practice/vocabulary/courses`: tìm kiếm debounce,
      12 khóa/trang (FR/NFR-09).
   2. Chọn khóa → chi tiết: các bài theo thứ tự, auto-scroll 1 lần tới "Bắt đầu tại đây".
   3. Mở bài → session-data nhánh libdeck-: cấp thẻ lần đầu với mốc thư viện (FR-11, BR-09).
   4. Từ đây học/ôn như UC-02/UC-03; âm thanh qua URL xa allowlist (UC-06).
e. **Luồng thay thế:**
   - 1a. Không khóa khớp → "Không tìm thấy khóa học từ vựng phù hợp." (E-21).
   - 2a. Khóa không tồn tại → 404 E-11 → "Không tìm thấy bài học phù hợp." (E-22).
   - 3a. Bộ thư viện chỉ truy cập được sau khi có thẻ — lần mở đầu chính là lúc cấp (FR-10).
f. **Hậu điều kiện:** Thẻ được cấp per (học viên, libword-*) một lần (BR-10); sau đó
   bộ xuất hiện trong tổng quan với nguồn "Khóa".
g. **Quy tắc liên quan:** FR-10..FR-13; BR-08, BR-09, BR-10, BR-16.
h. **Truy vết:** apps/server/src/routes/vocab.ts:353-561; apps/server/src/lib/vocab-provision.ts:368-594,
:520-532; packages/db/src/schema/vocab-library.ts:1-83;
apps/student/src/routes/_auth/practice/vocabulary/courses/index.tsx:44-115;
apps/student/src/routes/_auth/practice/vocabulary/courses/$courseId.tsx:40-95, :180-190;
apps/server/src/routes/vocab.test.ts:1197-1501.
