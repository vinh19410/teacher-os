---
phase: 2
title: "Tab Sessions & practice: danh sách buổi + bài đã giao"
status: pending
effort: "3.5h"
dependencies: [1]
---

# Phase 2: Sessions & practice

## Files

- Create: `apps/web/src/components/class-detail/class-sessions-section.tsx` (danh sách buổi dạng `li` card), `apps/web/src/components/class-detail/class-assigned-practice-section.tsx` (accordion bài đã giao), `apps/web/src/components/class-detail/attendance-summary.tsx` (thanh 3 màu).
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx` (lắp lưới 2 cột `xl:grid-cols-2 xl:items-start`), `apps/web/src/components/class-detail/class-schedule-table.tsx` (giữ logic occurrence, tách phần hiển thị hàng dùng chung hoặc thay bằng section mới).
- Modify nhẹ: `apps/web/src/components/classes/class-assignments-tab.tsx` (bọc `Section`, đổi `GRADE_LINK_BUTTON_CLASS`; không đổi logic giao/chấm).

## Steps

1. `Section` (card `rounded-xl border bg-card p-5 shadow-sm`, tiêu đề + badge đếm + action) — kiểm tra `components/ui` đã có thì dùng lại, chưa có thì tạo một chỗ dùng chung.
2. Danh sách buổi: mỗi buổi là `li` — ô số `size-9` (`bg-primary` nếu đã học), `ngày · giờ · phút`, chủ đề, link "Điểm danh →"/"Sửa điểm danh →" (mở `SessionAttendanceModal`), thanh điểm danh 3 màu `bg-success`/`bg-warn`/`bg-destructive`, nút "Sửa" (mở `SessionActionsModal` như hiện tại). Buổi quá khứ chưa điểm danh: `border-warn/50 bg-warn-soft`. Mặc định hiện 6 buổi quanh buổi gần nhất + nút "Hiện cả N buổi".
3. Giữ nguyên handler hoàn thành/huỷ/dời buổi và `ClassSessionsManageModal` ("Sắp xếp buổi") — đặt nút này vào `action` của `Section`.
4. Bài đã giao: accordion `aria-expanded`, icon theo kỹ năng, "n/N đã nộp" (`text-success` khi đủ, `text-warn` khi 0), thanh tiến độ, mở ra danh sách học viên + badge "Hoạt động gần nhất"/"Chưa làm" + nút "Chấm bài" khi cần chấm. Nguồn: `classAssignments[].targets` (đã có `submittedAt`); bỏ thanh kỹ năng nếu không có dữ liệu.
5. "Giao bài tập" ở header đặt `assignmentsView="assign"`: hiển thị form giao bài **thay thế** lưới (như hiện tại ở tab Bài tập), có nút quay lại.
6. Thay `GRADE_LINK_BUTTON_CLASS` bằng `buttonVariants({ variant: "outline", size: "sm" })` nếu `Button` export được, nếu không thì export thêm từ `button.tsx` (một dòng).

## Verification

- Unit: test mới cho section buổi (trạng thái chưa điểm danh, đã điểm danh, sắp tới) và accordion bài (mở/đóng, đủ/0 bài nộp).
- `pnpm --filter web test` xanh; e2e `class-operations`, `class-assign`, `class-sessions-manage-modal` xanh.
- Làm tay: điểm danh một buổi, dời một buổi, giao một bài, bấm "Chấm bài" sang trang chấm rồi "← Về lớp" quay đúng chỗ.
