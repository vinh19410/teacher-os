---
phase: 1
title: "API đếm 3 thẻ nhắc việc + contract + ReminderScope"
status: completed
priority: P1
effort: "5h"
dependencies: []
---

# Phase 1: API `GET /api/dashboard/reminders`

## Goal

Server trả về số đếm cùng tối đa 3 mục xem trước cho từng thẻ, theo phạm vi `ReminderScope`. Khi scope không có quyền tài chính, server bỏ hẳn block `tuition` (không trả `null`, không trả số 0).

## Files to Create / Modify

- Modify: `packages/api/src/contracts.ts`. Thêm `dashboardRemindersResponseSchema` (zod) và type `DashboardReminders`:
  - `date`: yyyy-mm-dd theo giờ Việt Nam.
  - `attendance`: `{ pending: number, items: Array<{ classId, className, time, dur }> }`.
  - `overdueGrading`: `{ count: number, writing: number, speaking: number }`.
  - `tuition?`: `{ students: number, outstanding: number }`. Optional, vắng mặt khi scope chặn.
- Create: `apps/server/src/routes/dashboard-reminders.ts`. Router Hono đọc `kernelCtx` (theo mẫu `grading.ts`). Hàm thuần `computeReminders(db, orgId, scope, now)` tách riêng để test.
- Create: `apps/server/src/routes/dashboard-reminders.test.ts`.
- Modify: `apps/server/src/routes/kernel.ts`. Mount `kernel.route("/dashboard", dashboardReminderRoutes(deps))` cạnh `/grading`.

## Thiết kế `ReminderScope`

```ts
type ReminderScope =
  | { kind: "org" }                                   // mọi teacher hiện tại
  | { kind: "assigned"; classIds: string[]; finance: false }; // TA — Phase 5 mới sinh ra
```

- Lúc này, route luôn tạo `{ kind: "org" }` từ session. Phase 5 chỉ cần thay hàm `resolveReminderScope(ctx)`.
- Ở scope `assigned`, mọi truy vấn lọc `classId IN classIds`. Nếu `classIds` rỗng thì không chạy query, trả 0.

## Quy tắc đếm

1. **Ca chưa điểm danh.** Lấy các lesson của org có `status = "upcoming"` thuộc hôm nay theo `vietnamTodayISO(now)`:
   - Lớp có `lesson.date`: so `date = today`.
   - Lớp legacy (`date IS NULL`): so `day` với thứ trong tuần hôm nay **suy từ `today`** theo mẫu `isoToLessonWeekday` (`apps/server/src/routes/kernel.ts:656`): `new Date(`${today}T00:00:00Z`).getUTCDay()`. KHÔNG dùng `new Date().getDay()` / `lessonDayFromDate` (local time — server chạy UTC, lệch 1 ngày từ 0h–7h giờ VN).

   Gom theo (classId, time). Mỗi nhóm có ít nhất 1 dòng `upcoming` thì tính là 1 ca chưa điểm danh. Bỏ `cancelled`. `items` sắp theo `time` tăng dần, cắt 3 mục.
2. **Bài quá hạn chấm > 24h.** Dùng cùng điều kiện với hàng chờ `/api/grading`:
   - `quiz_attempt.status = "submitted"`, skill thuộc writing/speaking, cả hai mode `assignment` và `practice`.
   - Thêm điều kiện `submittedAt < now - 24h`.
   - Trả tổng và tách số writing / speaking.
   - Ở scope `assigned`, chỉ tính nhánh assignment lọc theo `classAssignment.classId`. Nhánh practice không gắn lớp nên không tính.
3. **Học phí.** Lấy các invoice của org chưa thu đủ (`status !== "paid" || paidAmount < amount` — khớp trang `/tuition`, tuition/index.tsx:71) mà `due <= today + 7 ngày`. Hạn đã qua cũng tính.
   - `students` = số `studentId` distinct.
   - `outstanding` = tổng `amount - Math.min(paidAmount, amount)` (clamp như tuition-from-kernel.ts:259 — trả thừa không làm tổng âm).
   - Bỏ invoice có `due` rỗng.

## Tasks & Steps

1. Viết test đỏ trước cho `computeReminders`:
   - (a) Lớp có date, gồm 1 ca upcoming và 1 ca completed hôm nay, thì `pending = 1`.
   - (b) Lớp legacy đếm đúng theo thứ trong tuần.
   - (b2) Lớp legacy với `now` = 23:30 UTC Chủ nhật (06:30 sáng Thứ Hai giờ VN): phải đếm theo `day = 1` (Thứ Hai — từ `vietnamTodayISO(now)`), không phải `day = 7` mà `new Date().getDay()` của server UTC trả về.
   - (c) Ca `cancelled` không được đếm.
   - (d) Attempt submitted 25h trước được đếm, attempt 23h trước thì không.
   - (e) Invoice quá hạn và invoice còn hạn trong 7 ngày đều được đếm. Hạn sau 8 ngày và hoá đơn đã thu đủ thì không. Invoice trả thừa (`paidAmount > amount`) không được đếm lần 2 và không kéo `outstanding` âm.
   - (f) Scope `assigned` chỉ đếm lớp trong `classIds`, và response không có key `tuition`.
   - (g) Cô lập org: dữ liệu của org khác không được tính.
2. Viết contract zod và route. Response parse lại bằng schema (theo mẫu các route khác) để test hợp đồng.
3. Thêm test route:
   - GET khi chưa đăng nhập trả 401.
   - Session student nhận 403 `ACCOUNT_STUDENT_ROLE`, đúng gate hiện có (`apps/server/src/role-gates.test.ts`).
   - Teacher nhận 200 và body khớp schema.
4. Đo nhanh thời gian `computeReminders` với seed e2e. Mục tiêu nhỏ hơn 200ms ở server để cả vòng dưới 2 giây.

## Verification

- `pnpm --filter server test -- dashboard-reminders`
- `pnpm check-types`
- `pnpm check`

## Rủi ro

- Lệch quy ước "hôm nay" giữa UTC và giờ Việt Nam: luôn dùng `vietnamTodayISO`. Thêm test với `now` = 23:30 UTC, tức đã sang ngày mới ở Việt Nam.
