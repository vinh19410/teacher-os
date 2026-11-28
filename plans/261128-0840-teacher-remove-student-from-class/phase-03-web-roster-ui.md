---
phase: 3
title: "Phase 3: Web Repos, Tuition & Roster UI"
status: done
priority: P1
effort: 1h30m
dependencies: [1, 2]
---

# Phase 3: Web Repos, Tuition & Roster UI

## Goal

Cập nhật các hàm đọc snapshot phía web (`classes.ts`, `enrollments.ts`, `tuition-from-kernel.ts`, `StudentTuitionSummary`) để cô lập enrollment `removed` mà vẫn hiển thị minh bạch công nợ/hóa đơn cũ trên hồ sơ học viên, chuẩn hóa mapping lỗi `403`/`409` trong `kernel-outcome.ts`, và bổ sung nút "Xóa khỏi lớp" + modal xác nhận kèm cảnh báo công nợ vào `ClassRosterTab` theo đúng `DESIGN.md` và `REVIEW.md`.

## Files to Create / Modify

- Modify: `apps/web/src/lib/repos/classes.test.ts` & `apps/web/src/lib/repos/classes.ts`
- Modify: `apps/web/src/lib/repos/enrollments.test.ts` & `apps/web/src/lib/repos/enrollments.ts`
- Modify: `apps/web/src/lib/tuition-from-kernel.test.ts` & `apps/web/src/lib/tuition-from-kernel.ts`
- Modify: `apps/web/src/components/tuition/student-tuition-summary.test.tsx` & `apps/web/src/components/tuition/student-tuition-summary.tsx`
- Create/Modify: `apps/web/src/lib/kernel-outcome.test.ts` & `apps/web/src/lib/kernel-outcome.ts`
- Modify: `apps/web/src/components/class-detail/class-roster-tab.test.tsx` & `apps/web/src/components/class-detail/class-roster-tab.tsx`

## Tests Before (TDD)

1. `mapClasses`: loại `removed` khỏi `studentIds` và `invitedStudentIds`, giữ `sessionsDone` từ các buổi `completed` đã lưu.
2. `classesByStudent`: loại `removed`, trả đúng trạng thái mới nhất nếu học viên được re-enroll; giữ nguyên `mapEnrollments` (để `lessons`, `debtLedger`, `invoiceDetail`, `studentTuitionSummary` dùng).
3. `rosterDebtByStudent` & `studentTuitionSummary` & `StudentTuitionSummary`:
   - `rosterDebtByStudent` bỏ qua `removed`; `debtLedger` vẫn ánh xạ hóa đơn `removed`.
   - `studentTuitionSummary` giữ enrollment `removed` CHỈ KHI có ít nhất 1 hóa đơn (tách theo `eid` để không đè row `active` khi re-enroll), đặt `counted: false`, `enrollmentStatus: "removed"`, hiển thị số tiền còn thiếu/đã thu mà không cộng `tuitionFee` cũ vào `totalFee`/`totalPaid`/`totalRemaining` hoặc đổ nhầm vào `unlinkedPaid`.
   - `StudentTuitionSummary` hiện badge `"Đã rời lớp"` (không hiện `"Đã mời"`), vẫn giữ nguyên hành vi status `"pending"` → `"Đã mời"`.
4. `kernel-outcome.ts`: bắt buộc map `403` → lỗi quyền + `reconcile: "check"`, và `409 ENROLLMENT_ALREADY_REMOVED` / `ENROLLMENT_STATUS_CHANGED` → `heal-409`.
5. `ClassRosterTab`:
   - Dùng `canManageClassStatus(data.viewer?.role ?? "teacher")`: hiện `"Xóa khỏi lớp"` cho `teacher`/`owner`/`admin`/`class_teacher` (và fixture mặc định thiếu `viewer`), ẩn với `ta`.
   - Nút vẫn enabled khi lớp `paused`.
   - Click / Enter / Space trên nút không điều hướng sang `/students/$studentId`.
   - Modal `"Xóa học viên khỏi lớp?"` hiển thị đúng tên học viên, tên lớp, cảnh báo công nợ (nếu `debt.status !== "paid" && debt.outstanding > 0`) theo token `border-warn/50 bg-warn-soft`, và gửi đúng `enrollmentId` của bản ghi `active` (ngay cả khi có bản ghi `removed` cũ đứng trước trong snapshot).

## Implementation Steps

1. Viết toàn bộ unit tests fail trước cho các file test nêu trên.
2. Cập nhật `apps/web/src/lib/repos/classes.ts`, `apps/web/src/lib/repos/enrollments.ts`, `apps/web/src/lib/tuition-from-kernel.ts`, `apps/web/src/components/tuition/student-tuition-summary.tsx`.
3. Cập nhật `apps/web/src/lib/kernel-outcome.ts` và `apps/web/src/components/class-detail/class-roster-tab.tsx`.

## Verification

- `pnpm --filter web test && pnpm --filter web check-types`
- `pnpm --filter student test && pnpm --filter student check-types`
