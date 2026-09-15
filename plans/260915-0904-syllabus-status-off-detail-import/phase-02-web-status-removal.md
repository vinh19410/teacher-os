---
phase: 2
title: "Gỡ status khỏi màn hình syllabus"
status: todo
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Gỡ status khỏi màn hình syllabus

## Goal

Màn hình syllabus detail (`/syllabus/:id`) không còn hiển thị hay cho sửa trạng thái buổi học; form thêm/sửa buổi học mở từ màn hình syllabus không có trường Trạng thái. Màn hình lớp học (`curriculum-management-section.tsx`) giữ nguyên toàn bộ hiển thị + sửa status.

## Context Links

- Scout report: `reports/scout-report.md` (mục 1)
- Quyết định D1, D2, D5 trong `plan.md`
- Phase 1 phải đã xong (server chấp nhận body thiếu status)

## Files to Create / Modify

- Modify: `apps/web/src/lib/data-actions.ts` (payload `add-lesson` dòng 126–136, `edit-lesson` dòng 137–148)
- Modify: `apps/web/src/lib/data-store-reducer.ts` (case `add-lesson` gán `status: action.payload.status` ~dòng 256; case `edit-lesson` ~dòng 282)
- Modify: `apps/web/src/lib/repos/kernel.ts` (case `edit-lesson` dòng 170–179)
- Modify: `apps/web/src/components/modals/add-lesson-modal.tsx`
- Modify: `apps/web/src/components/modals/edit-lesson-modal.tsx`
- Modify: `apps/web/src/routes/_auth/syllabus/$syllabusId.tsx`
- Modify: `apps/web/src/components/class-detail/curriculum-management-section.tsx` (chỉ thêm prop `showStatus` khi render 2 modal)
- KHÔNG đổi: `apps/web/src/components/syllabus/lesson-status.tsx`, `apps/web/src/lib/mock-data.ts`, `apps/web/src/lib/repos/syllabus.ts` (class detail vẫn dùng)

## Tasks & Steps

### Task 2.1 — Payload action: status thành optional + reducer mirror semantics
- Goal: type action cho phép gửi add/edit-lesson không có status; optimistic reducer không compile-break và không reset status.
- Target files: `apps/web/src/lib/data-actions.ts` — payload của `add-lesson` (dòng 130–135) và `edit-lesson` (dòng 142–147); `apps/web/src/lib/data-store-reducer.ts` — case `add-lesson` (~dòng 256) và `edit-lesson` (~dòng 282); `apps/web/src/lib/repos/kernel.ts` — case `edit-lesson` (dòng 170–179).
- Steps:
  1. Trong `data-actions.ts`, đổi `status: SyllabusLesson["status"];` thành `status?: SyllabusLesson["status"];` ở CẢ HAI payload (add-lesson và edit-lesson).
  2. Trong `data-store-reducer.ts` (field `status` của `SyllabusLesson` vẫn bắt buộc — `mock-data.ts:124`):
     - case `add-lesson`: đổi `status: action.payload.status,` thành `status: action.payload.status ?? "upcoming",` (mirror semantics server Phase 1).
     - case `edit-lesson`: trong map lessons, đổi `status: action.payload.status,` thành `status: action.payload.status ?? l.status,` (giữ nguyên status cũ khi action không mang status).
  3. Trong `repos/kernel.ts` case `edit-lesson`, body đang liệt kê 4 field tường minh — đổi thành spread để key undefined tự rơi khỏi JSON:
     ```ts
     case "edit-lesson":
       return {
         path: `/api/syllabi/${action.syllabusId}/modules/${action.moduleId}/lessons/${action.lessonId}`,
         body: { ...action.payload },
       };
     ```
     (JSON.stringify bỏ key undefined — cùng kết quả dây cho cả nhánh có/không status.)
  4. Case `add-lesson` đã là `body: { ...action.payload }` — không đổi.
- Success criteria: typecheck qua; gửi action không status tạo body JSON không có key `status`; reducer giữ status cũ ở edit không status.
- Verify: `pnpm check-types` exit 0; `pnpm --filter web test` exit 0 (bộ test reducer hiện có `data-store-reducer.test.ts` phải vẫn xanh).

### Task 2.2 — Prop `showStatus` cho 2 modal buổi học
- Goal: form thêm/sửa buổi học chỉ hiển thị + gửi status khi được bật (dùng riêng cho lớp học).
- Target files: `apps/web/src/components/modals/add-lesson-modal.tsx` (Field Trạng thái dòng 95–104), `apps/web/src/components/modals/edit-lesson-modal.tsx` (Field Trạng thái dòng 96–105), `apps/web/src/components/class-detail/curriculum-management-section.tsx` (render 2 modal dòng 351–363).
- Steps:
  1. Ở cả 2 modal: thêm prop `showStatus?: boolean` vào props interface (KHÔNG default `true`).
  2. Bọc Field "Trạng thái" trong `{showStatus && (...</Field>)}`. State `status` + `setStatus`/reset giữ nguyên (vẫn init từ lesson ở edit).
  3. Payload submit: đổi field `status,` thành spread có điều kiện `...(showStatus ? { status } : {}),`.
  4. Trong `curriculum-management-section.tsx`: thêm `showStatus` cho cả `<AddLessonModal ... />` và `<EditLessonModal ... />` (dòng 351–363). Đây là nơi DUY NHẤT bật.
- Success criteria: mở form từ màn hình syllabus → không có Select Trạng thái, request không có key `status`; mở từ màn hình lớp → Select hiện, request có `status`.
- Verify: `pnpm check-types` exit 0. (behavior UI được e2e phase sau khóa; ở bước này chỉ cần biên dịch.)

### Task 2.3 — Gỡ hiển thị status ở trang syllabus detail
- Goal: trang `/syllabus/:id` không còn bất kỳ dấu vết status buổi học nào.
- Target files: `apps/web/src/routes/_auth/syllabus/$syllabusId.tsx`.
- Steps:
  1. Xóa import `LessonStatusBadge, lessonDotClassFor` (dòng 12–15).
  2. Xóa 3 dòng biến `const all = ...; const done = ...; const current = ...` (dòng 93–95) — `classesForSyllabus` dòng 96 giữ.
  3. StatCard grid (dòng 136–149): đổi className `grid grid-cols-4 ...` thành `grid grid-cols-2 ...` (giữ `max-app:grid-cols-2`); xóa 2 StatCard "đã dạy" và "đang học"; giữ "tổng buổi" và "module".
  4. Xóa cả Card "Buổi hiện tại" (block `{current && (...)})`, dòng 151–161).
  5. Trong `sy.modules.map` (dòng 183): xóa `const mDone = m.lessons.filter(...)` (dòng 184); đổi hiển thị `{mDone}/{m.lessons.length} buổi` (dòng 216–218) thành `{m.lessons.length} buổi`.
  6. Hàng lesson (dòng 223–265): xóa span dot (dòng 228–230); className hàng đổi `grid-cols-[20px_1fr_auto]` → `grid-cols-[1fr_auto]` và `max-app:grid-cols-[20px_1fr]` → `max-app:grid-cols-[1fr]`; xóa `<LessonStatusBadge status={l.status} />` (dòng 241); ở div actions xóa `max-app:col-start-2` (giữ `max-app:pt-1`).
  7. KHÔNG đụng bảng "Lớp đang dùng template này" (dòng 279–319) — cột "Trạng thái" ở đó là status của lớp.
  8. 2 modal render cuối file (dòng 332–344): KHÔNG truyền `showStatus`.
- Success criteria: grep trang này không còn `status` trừ `c.status` của lớp; render không dot/badge/card status.
- Verify: `grep -n "status" apps/web/src/routes/_auth/syllabus/\$syllabusId.tsx` chỉ còn các dòng thuộc bảng lớp (`c.status`) hoặc không còn dòng nào; `pnpm check-types` exit 0.

### Task 2.4 — Regression gate phase
- Goal: chắc chắn không phá màn hình lớp học và tests hiện có.
- Steps:
  1. Đọc lại diff của phase — xác nhận `curriculum-management-section.tsx` chỉ thêm prop, phần render dot/badge/tiến độ (dòng 77–80, 166–168, 200–249) không đổi.
- Success criteria: các lệnh dưới exit 0.
- Verify:
  1. `pnpm --filter web test` → exit 0
  2. `pnpm --filter server test` → exit 0
  3. `pnpm check-types` → exit 0
  4. `pnpm check` → exit 0

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
