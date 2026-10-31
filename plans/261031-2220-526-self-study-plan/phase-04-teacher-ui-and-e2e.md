---
phase: 4
title: "Phase 4: Teacher UI, E2E Tick & End-to-End Verification"
status: pending
priority: P1
effort: "2.5h"
dependencies: [2, 3]
---

# Phase 4: Teacher UI, E2E Tick & End-to-End Verification

## Goal

Xây dựng giao diện quản lý Self Study Plan cho giáo viên trong trang chi tiết lớp (`/classes/$classId`), thêm endpoint kích hoạt tick `/__e2e/self-study-tick` chỉ trong `apps/e2e/src/boot.ts`, viết unit test UI + E2E spec trên libsql, và kiểm chứng giao diện trên 3 viewport (`1440×900`, `768×1024`, `375×812`) cùng keyboard focus theo `DESIGN.md` và `REVIEW.md`.

## Files to Create / Modify

- Create: `apps/web/src/lib/repos/self-study-plan.ts`
- Create: `apps/web/src/components/classes/self-study-plan-section.tsx`
- Create: `apps/web/src/components/classes/self-study-plan-section.test.tsx`
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx`
- Modify: `apps/e2e/src/boot.ts`
- Create: `apps/e2e/specs/self-study-plan.spec.ts`

## Tasks & Steps

### Task 4.1 — Viết component test TDD (Red) cho `SelfStudyPlanSection`

- **Goal:** Tạo test `apps/web/src/components/classes/self-study-plan-section.test.tsx` kiểm tra tạo/công bố plan, hiển thị ngày nghỉ & bật `holidayOverride`, đổi khung giờ, hiển thị cảnh báo đề mất `ready` và tiến độ nộp đúng hạn / trễ hạn.
- **Target files and symbols:**
  - `apps/web/src/components/classes/self-study-plan-section.test.tsx`
- **Steps:**
  1. Tạo `apps/web/src/components/classes/self-study-plan-section.test.tsx` kiểm tra:
     - Trạng thái lớp chưa có plan: hiển thị nút `"Tạo kế hoạch tự học"`, mở form với giờ mặc định `06:00` – `17:00`, chọn ngày bắt đầu / kết thúc và gán đề `ready` cho các ngày.
     - Trạng thái plan đã công bố (`published`): hiển thị danh sách ngày theo phân trang khoảng ngày, hiển thị rõ nhãn `"Nghỉ lễ"` trên ngày nghỉ và nút bật `"Vẫn giao ngày nghỉ"` (`holidayOverride`), hiển thị cảnh báo khi ngày có `warning` hoặc trạng thái `missed` (kèm nút `"Giao lại"`), hiển thị tiến độ học viên đã nộp / nộp trễ, cho phép đổi giờ giao – giờ hạn cho các ngày chưa tới và huỷ kế hoạch.
- **Success criteria:** Test chạy và fail vì `self-study-plan-section.tsx` chưa tồn tại.
- **Verify:** `pnpm --filter web exec vitest run src/components/classes/self-study-plan-section.test.tsx` exits non-zero (Red phase).

### Task 4.2 — Hiện thực `apps/web/src/lib/repos/self-study-plan.ts`, `SelfStudyPlanSection` và gắn vào `/classes/$classId` (Green)

- **Goal:** Hiện thực repo client, giao diện `SelfStudyPlanSection` chuẩn token `DESIGN.md` và gắn vào trang chi tiết lớp `/classes/$classId` mà không làm ảnh hưởng các test hiện hữu của `$classId`.
- **Target files and symbols:**
  - `apps/web/src/lib/repos/self-study-plan.ts` (`fetchSelfStudyPlan`, `saveSelfStudyPlanDraft`, `publishSelfStudyPlan`, `updateSelfStudyPlanHours`, `updateSelfStudyPlanDay`, `releaseMissedSelfStudyDay`, `cancelSelfStudyPlan`)
  - `apps/web/src/components/classes/self-study-plan-section.tsx` (`SelfStudyPlanSection`)
  - `apps/web/src/routes/_auth/classes/$classId.tsx` (bộ chuyển `"Bài giao tay"` / `"Kế hoạch tự học"` dùng `<button type="button" aria-pressed>`)
- **Steps:**
  1. Tạo `apps/web/src/lib/repos/self-study-plan.ts` theo đúng mẫu `apps/web/src/lib/repos/holidays.ts:19-30`: mọi lệnh `POST`/`PUT`/`PATCH` đều truyền `credentials: "include"`, `headers: { "content-type": "application/json" }`, và `body: JSON.stringify(payload ?? {})` (kể cả các lệnh không tham số như `publish` và `cancel`). <!-- Updated: Red Team RT-4 -->
  2. Tạo `apps/web/src/components/classes/self-study-plan-section.tsx` tuân thủ `DESIGN.md` và `REVIEW.md`:
     - Sử dụng token màu semantic (`bg-background`, `bg-muted`, `border-input`, `StatusTag` với tone `ok` / `warn` / `danger` / `neutral`), số liệu `tabular-nums`, badge đếm `aria-hidden="true"`, focus ring chuẩn.
     - Hỗ trợ: tạo nháp / chọn đề `status === "ready"` từ `data.assignmentPrompts`, công bố plan, chuyển trang khoảng ngày (`Trước` / `Sau`), đổi giờ giao & giờ hạn (`06:00` – `17:00`), sửa đề và bật/tắt `holidayOverride` cho ngày tương lai (`date > todayVN`), giao lại ngày `missed`, xem chi tiết học viên nộp đúng hạn / nộp trễ, và huỷ plan.
  3. Tích hợp vào `apps/web/src/routes/_auth/classes/$classId.tsx`:
     - Ở cột phải của tab `"sessions-practice"`, đặt cụm nút chuyển `<div role="group" aria-label="Chế độ giao bài">` với 2 nút `<button type="button" aria-pressed={...}>`: `"Bài giao tay"` (mặc định active) và `"Kế hoạch tự học"` (tuyệt đối không dùng `role="tab"` để bảo toàn assertion `findAllByRole("tab")` trong `$classId.test.tsx:165`).
     - Chỉ mount `<SelfStudyPlanSection classGroup={cls} />` (và chỉ gọi `fetchSelfStudyPlan`) khi người dùng chuyển sang `"Kế hoạch tự học"`, giữ nguyên `<ClassAssignmentsTab>` khi ở `"Bài giao tay"` để không phát sinh request phụ vào `server.writes` trong `$classId.test.tsx` và `$classId.sessions.test.tsx`. <!-- Updated: Red Team RT-6 -->
- **Success criteria:** Component test `self-study-plan-section.test.tsx` và toàn bộ test hiện có của `apps/web` (`$classId.test.tsx`, `$classId.sessions.test.tsx`) đều pass.
- **Verify:** `pnpm --filter web exec vitest run src/components/classes/self-study-plan-section.test.tsx src/routes/_auth/classes/\\$classId.test.tsx src/routes/_auth/classes/\\$classId.sessions.test.tsx && pnpm --filter web check-types` exits 0.

### Task 4.3 — Thêm `/__e2e/self-study-tick` vào `apps/e2e/src/boot.ts`, viết E2E `self-study-plan.spec.ts` và kiểm tra 3 viewport

- **Goal:** Đăng ký endpoint `/__e2e/self-study-tick` chỉ trong `apps/e2e/src/boot.ts`, viết E2E spec kiểm chứng luồng tự học trên libsql độc lập với giờ tường của máy chạy, và kiểm tra UI ở 3 viewport (`1440×900`, `768×1024`, `375×812`) + keyboard focus.
- **Target files and symbols:**
  - `apps/e2e/src/boot.ts` (xử lý `POST /__e2e/self-study-tick` gọi `runSelfStudyPlanTick` từ `"server/lib/self-study-plan"`)
  - `apps/e2e/specs/self-study-plan.spec.ts`
- **Steps:**
  1. Trong `apps/e2e/src/boot.ts`, thêm handler cho `POST /__e2e/self-study-tick` ngay trong wrapper `serve({ fetch })` (bên ngoài `buildApp`):
     - Đọc an toàn `{ now?: string | number, setReleasedDueAt?: string | number }` từ body JSON (`try { body = await request.json() } catch { body = {} }`).
     - Gọi `runSelfStudyPlanTick({ db: libsql as unknown as Db, now: body.now ? new Date(body.now) : new Date(), mailer: recordingMailer, studentOrigin: STUDENT_ORIGIN, retryDelaysMs: [0, 0] })`.
     - Nếu `body.setReleasedDueAt` được truyền vào, cập nhật `due_at` trên các dòng `self_study_plan_day` (`status = 'released'`) và `class_assignment` (`plan_item_id IS NOT NULL`) trong `libsql` sang mốc `new Date(body.setReleasedDueAt)` để E2E có thể kiểm thử tất định trạng thái trước hạn (`dueAt = Date.now() + 3600_000`) và quá hạn / nộp trễ (`dueAt = Date.now() - 60_000`) bất kể giờ chạy CI. <!-- Updated: Red Team RT-6 -->
  2. Tạo `apps/e2e/specs/self-study-plan.spec.ts`:
     - Giáo viên tạo lớp có học viên `active` và đề ngân hàng `ready`, mở `"Kế hoạch tự học"` tại `/classes/$classId`, lập và công bố Self Study Plan trên UI, kiểm tra trên 3 viewport (`1440×900`, `768×1024`, `375×812`) không tràn ngang và focus bàn phím rõ ràng.
     - Trước `releaseAt`: học viên mở cổng học viên chưa thấy bài tự học.
     - Kích hoạt `POST /__e2e/self-study-tick` tại `releaseAt` (với `setReleasedDueAt: Date.now() + 3600_000`): học viên nhận được thông báo trong chuông thông báo + email trong `.mail-log.jsonl`, thấy bài tự học ở trạng thái `"Sắp đến hạn"`.
     - Dịch mốc `dueAt` về quá khứ (`setReleasedDueAt: Date.now() - 60_000`, tương ứng sau 17:00 cùng ngày): cổng học viên hiển thị trạng thái `"Quá hạn"`.
     - Học viên vẫn làm và nộp được bài sau hạn, bài hiển thị nhãn nộp trễ trên cả cổng học viên và màn hình Self Study Plan của giáo viên.
- **Success criteria:** E2E spec `self-study-plan.spec.ts` chạy xanh trên libsql với port override 8100/8101/8103/8104/8105, và toàn bộ gate `pnpm check`, `pnpm check-types`, `pnpm test` đều xanh.
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e exec playwright test specs/self-study-plan.spec.ts` exits 0.

## Verification

- `pnpm --filter web test && pnpm --filter web check-types` exits 0.
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e exec playwright test specs/self-study-plan.spec.ts` exits 0.

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
