---
phase: 4
title: "Test, e2e, so ảnh, DESIGN.md"
status: pending
effort: "1.5h"
dependencies: [2, 3]
---

# Phase 4: Verify và docs

## Hook cần giữ (kiểm bằng grep trước khi merge)

- Tab bấm bằng `getByRole("tab", { name })` ở các spec trên; cập nhật tên tab đã đổi trong spec, không đổi lại UI cho vừa test.
- `?tab=assignments` từ nút "← Về lớp" của trang chấm (#319) phải mở đúng khối bài đã giao.
- `data-testid` trong `class-schedule-table.tsx` và các modal; `aria-label` của nút trong bảng học viên.

## Steps

1. `pnpm check`, `pnpm check-types`, `pnpm --filter web test`.
2. e2e với port override (`E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103`): danh sách canh
   tối thiểu 17 spec trong `plan.md` (kể cả `teacher-grade-submission`, `syllabus-test-session-mark`,
   `create-invoice`, `global-search`, `schedule-session-modal`, `student-package-validation`,
   `student-package-without-class`, `student-tuition-summary`, `teacher-command-search` — advisory
   2026-10-21), rồi **chạy full suite** trước khi squash-merge vào `develop`.
3. `pnpm design:compare --screens t-class-detail --side app --label fidelity` ở 3 viewport × 2 theme; ghi kết quả khối-theo-khối vào `plans/.../screenshots/verdict.md` (không chỉ "khung shell").
4. Keyboard focus theo `REVIEW.md`: tab segmented, accordion, hàng buổi học.
5. `DESIGN.md`: mục lệch có chủ đích của trang này — thẻ 3 = "Bài trong syllabus" thay Attendance rate
   (chốt); thanh điểm danh 2 phân đoạn thay 3 màu (không có data đi muộn tin được); "Add session" =
   "Sắp xếp buổi" mở Quản lý buổi (kernel không có add-session theo ngày); nhãn nút giữ tiếng Việt
   ("Điều chỉnh", "Chấm bài") thay "Edit"/"Grade"; bỏ cột Chuyên cần bảng học viên; không có thanh kỹ năng
   Flashcard/Quiz; filler roster không dựng; giữ tab Từ vựng/Ghi chú thêm ngoài 3 tab design;
   **SyllabusTree descope** (giáo trình chỉ card gán/gỡ theo #221); header giữ kicker không có lead
   (học phí chuyển vào tab Học viên).
6. PR kèm screenshot (body tiếng Việt, theo precedent #281/#284).

## Verification

Tất cả lệnh ở bước 1–3 xanh; verdict ghi rõ khối nào PASS/lệch có chủ đích.
