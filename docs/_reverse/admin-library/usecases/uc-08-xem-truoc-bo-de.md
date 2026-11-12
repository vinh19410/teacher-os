---
feature: admin-library
type: reverse-usecase
uc: UC-08
status: draft
updated: "2026-11-12"
---

# UC-08 — Xem trước bộ đề

a. **Mục tiêu:** Admin soát đề đúng như hình dạng học viên sẽ gặp (nhóm câu, ngân
   hàng đáp án, ảnh, intro) trước khi xuất bản — kể cả khi đề còn nháp. 🟡 (mục tiêu —
   suy từ tính năng #433; OQ-06)
b. **Actor:** Admin.
c. **Tiền điều kiện:** Đang mở trang soạn đề (UC-03).
d. **Luồng chính (truy vết F9):**
   1. Bấm xem trước → hệ thống gộp dữ liệu đã lưu với phần đang soạn chưa lưu (part
      hiệu lực) (FR-36).
   2. Render theo khung học viên: intro, đoạn văn/phiên âm bản, từng nhóm câu với chỉ
      dẫn, câu hỏi + đáp án, ảnh ghim (FR-36).
e. **Luồng thay thế:**
   - 1a. Part đang soạn lỗi hình → xem trước vẫn dựng được phần lành; lỗi part hiển
     thị ở form (không chặn xem).
f. **Hậu điều kiện:** Không đổi dữ liệu (đọc-thuần trên dữ liệu form + đã lưu).
g. **Quy tắc liên quan:** FR-36; BR-04 (xem trước phản ánh luật hiển thị).
h. **Truy vết:** apps/admin/src/components/library/test-preview-model.ts:1-139;
apps/admin/src/components/library/effective-parts.ts:1-126;
apps/admin/src/routes/_auth/library/tests/$testId.tsx:763-776;
apps/e2e/specs/admin-library-reading.spec.ts:652-824.
