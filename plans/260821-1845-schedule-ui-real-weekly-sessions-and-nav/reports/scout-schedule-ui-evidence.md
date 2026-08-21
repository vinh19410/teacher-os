# Scout report: Schedule UI — issue #56 (evidence, verified trên worktree feat/56-schedule-ui-weekly-nav @ develop sau PR #74)

## 1. Route /schedule hiện tại

File: `apps/web/src/routes/_auth/schedule.tsx` (115 dòng).

- `PageHead title="Lịch dạy"` (không lead) → grid 7 cột tĩnh theo `dayNames.map((dn, i) => ...)` lọc `data.lessons.filter((l) => l.day === i + 1)` (dòng 29-32) → legend loại buổi → `LessonModal`.
- Không có nav tuần, không có ngày thật, không highlight "hôm nay" — PR #74/#58 đã gỡ GCal badge, chip "← Trước / Tuần này / Sau →", `todayIdx`, `dayDates`, lead "19–25/08". Grid thuần weekday: mọi lesson `day=2` hiện ở cột T3 của MỌI tuần.
- Trạng thái dòng 57-61: `completed` → `opacity-60` + line-through; `cancelled` → `opacity-35` + line-through.
- Modal: `apps/web/src/components/schedule/lesson-modal.tsx` — badge Hoàn thành/Đã hủy/Sắp tới (dòng 47-55), nút "Hủy buổi"/"Điểm danh" qua `useDirectKernelAction` (dòng 68-92). Ngày hiển thị chỉ là `lessonDayLabel(lesson.day)` (tên thứ).

## 2. Mô hình structured schedule (packages/db)

- `packages/db/src/schema/class.ts:24-28` — `schedule` là TEXT thô: JSON `{"days":[0-6],"start":"HH:MM","end":"HH:MM"}` (0 = Thứ 2) hoặc legacy free-text; kèm `sessionsTotal`, `sessionsDone` (legacy, không còn writer), `startDate` (TEXT, chỉ hiển thị).
- `packages/db/src/schema/lesson.ts:16-44` — bảng `lesson`: `classId` + `enrollmentId` NOT NULL, `day` (1-7, 1=Monday), `time` (HH:MM), `dur` (phút), `type`, `status` (default `"upcoming"`), `topic`, `zoom`. KHÔNG có cột ngày tháng — buổi học chỉ mang weekday định kỳ.
- Lesson sinh lúc enroll (POST /students với classId): `generateScheduleLessons` tại `apps/server/src/routes/kernel.ts:81-104` sinh `sessionsTotal` row, `day = scheduleDay + 1` (cycling `i % days.length`), `time = schedule.start`, `dur` wrap midnight. Comment dòng 72-80 pin off-by-one: schedule JSON 0-6 vs lesson.day 1-7, "never JS getDay()".
- Parse schedule phía web: `apps/web/src/lib/format-schedule.ts:16-44` (`parseSchedule`, `formatSchedule`), `lessonDayLabel` (dòng 53-55), `addMinutes` (58-64).

## 3. API lessons/sessions (PR #71 / issue #55)

Tất cả trong `apps/server/src/routes/kernel.ts`, mount tại `/api` (`apps/server/src/app.ts:103`):

- `GET /api/kernel` (dòng 229-233) → `loadSnapshot` (`apps/server/src/routes/snapshot.ts:70-261`): trả toàn bộ `lessons` (KernelLessonRow: id, classId, enrollmentId, day, time, dur, type, status, topic, zoom — dòng 235-246), sort `asc(day), asc(time), asc(createdAt)`.
- `POST /api/students` (242-309) — với `classId` sinh lesson series trong cùng `db.batch`.
- `POST /api/lessons/:id/check-in` (455-457) và `/cancel` (459-461) → `lessonStatusAction` (413-453): upcoming→completed/cancelled, khác đi 409, body phải là `{}`.
- `POST /api/lessons/:id/edit` (471-516): upcoming-only, full-replace 5 field (day/time/dur/topic/zoom) + optimistic concurrency (old values trong WHERE).
- KHÔNG có endpoint expand schedule thành occurrence có ngày cho date-range/tuần — không tồn tại khái niệm ngày trên lesson row.

## 4. Check-in / điểm danh & bug sessionsDone

- Status tuple: `"upcoming" | "completed" | "cancelled" | "absent"` (web `apps/web/src/lib/mock-data.ts:28`; contracts `packages/api/src/contracts.ts:300`). `"absent"` không có write path (chỉ dùng trong at-risk logic `dashboard-from-kernel.ts:43`).
- UI hiện trạng thái ở 3 chỗ: schedule.tsx (opacity/line-through), lesson-modal.tsx:47-55 (Badge), class detail `$classId.tsx:200-212` (Badge "Đã học"/"Đã hủy"/"Sắp tới" trong tab "Lịch học" — cột Ngày chỉ có tên thứ `lessonDayLabel`).
- **sessionsDone collapse bug**: derive ở `apps/web/src/lib/repos/classes.ts:28-46` — đếm DISTINCT `${day}|${time}` mỗi class; weekly recurrence (12 buổi trên 2 slot) check-in đủ vẫn ra 2/12. Pin test đỏ: `apps/web/src/lib/repos/classes.test.ts:289-345` ("weekly-recurrence collapse pin — issue #55 red-target for #56", "do not fix it here without updating that issue"). Sửa derive + tick DOD "tiến độ lớp derive từ lesson thật" thuộc #56 (plan #55 phase-03:65 mục (a)).
- Cột DB `sessionsDone` là legacy không writer; contracts.ts:210-214 ghi "Do not trust it".

## 5. Pattern data-fetching (TanStack Query)

- QueryClient: `apps/web/src/lib/query-client.ts` — staleTime Infinity, no retry, no refetch on focus/reconnect, `networkMode: "offlineFirst"`; tạo module-scope trong `main.tsx:31`.
- MỘT query key duy nhất: `["kernel"]` (`apps/web/src/lib/repos/kernel.ts:286`), qua `kernelQueryOptions(baseUrl)` + shape-guard `fetchKernelSnapshot`. `DataProvider` (`apps/web/src/lib/data-provider.tsx:60-157`, mount trong `app-shell.tsx:65`) gate toàn app; mọi route đọc qua `useData()` (`data-store.tsx` shim).
- Write: `dispatch(action)` → serialized command bus (`createKernelCommandBus`, kernel.ts:333-414) → POST + refetch `['kernel']`; UI await `KernelCommandResult` (`refreshed|committed|definite-failure|outcome-unknown`).
- Hook pattern cho module mới: `apps/web/src/lib/repos/use-classes.ts` — memo selection trên `useData().data`, "No second fetch". Hook schedule nên theo pattern này (không tạo query key mới).
- Action map: `apps/web/src/lib/data-actions.ts` — name-collision: `"add-lesson"`/`"edit-lesson"` đã thuộc syllabus lesson (dòng 59-81); action edit buổi học của #56 cần tên khác (hand-off #55 mục (c)).
- Direct action hook: `apps/web/src/lib/use-direct-kernel-action.ts` (`run(key, action, successText)`, `isPending`, `busy`).

## 6. Routing

- TanStack Router file-based (`routeTree.gen` bởi `@tanstack/router-plugin`); router tạo ở `main.tsx:10-16`.
- `/schedule` = file route `/_auth/schedule` — dưới layout `/_auth/route.tsx` có `beforeLoad` session check (redirect `/login` kèm `returnUrl = location.href`).
- Chưa có route nào trong `_auth` dùng search params; tiền lệ duy nhất: `apps/web/src/routes/login.tsx:17-23` `validateSearch` trả `{ returnUrl?: string }`. Param path có sẵn: `$classId` v.v. Nav tuần dạng `/schedule?week=...` cần thêm `validateSearch` mới — reload giữ tuần đúng sẽ đi qua URL.

## 7. Test setup & CI

- Web: vitest, `environment: "node"` (`apps/web/vitest.config.ts`) — không jsdom, không testing-library, không Playwright (E2E là issue #59). Convention: test logic trong `src/lib/**/*.test.ts` + source-contract test đọc source bằng `readSrc()` + `.toMatch/.not.toMatch`.
- Test files liên quan: `format-schedule.test.ts`, `repos/classes.test.ts` (pin collapse), `repos/lessons.test.ts`, `dashboard-from-kernel.test.ts`, `date-input.test.ts`, `kernel-runtime.contract.test.ts`, `repos/kernel.test.ts`; fixtures `apps/web/test/fixtures/mock-data.ts`.
- Server: `apps/server/src/kernel.test.ts` (~96 test, generator tests dòng 1672-1739: weekday +1 mapping, overnight wrap, fail-closed legacy).
- Lệnh: root `pnpm test` = `turbo run test && pnpm test:ci-workflow && pnpm test:topology-drift`; web/server `vitest run`. CI `.github/workflows/ci.yml:31-35`: `biome check .` → `pnpm test` → `pnpm check-types` → `pnpm build`.

## 8. Date/time utilities

- KHÔNG có date-fns/dayjs/luxon/moment. Tất cả custom:
  - `apps/web/src/lib/date-input.ts` — parse/format `yyyy-mm-dd`, `getTomorrowDateInputValue`, `isFutureDateInputValue` (dùng cho start-date picker).
  - `apps/web/src/lib/dashboard-from-kernel.ts:7-10` — `lessonDayFromDate`: `getDay() === 0 ? 7 : getDay()` (chuyển sang Mon=1..Sun=7).
  - `apps/server/src/routes/kernel.ts:716-722` — `formatDayMonth` dùng `Intl.DateTimeFormat` với `timeZone: "Asia/Ho_Chi_Minh"` + comment Workers-UTC-drift.
  - `apps/web/src/lib/format-schedule.ts:58-64` — `addMinutes` wrap midnight.

## 9. TODO/ghi chú trỏ #56 trong code

- `apps/web/src/lib/format-schedule.ts:49-52` — doc `lessonDayLabel`: "the schedule grid shows real dates only when backed by real lesson data (issue #56)".
- `apps/web/src/lib/kernel-runtime.contract.test.ts:185-209` — tripwire locks cho #58: `not.toMatch(/Tuần này|← Trước|Sau →|dayDates|todayIdx|GCal|19–25\/08/)` trên schedule.tsx/lesson-modal/$classId/mock-data, kèm comment "must keep failing until #56 lands real week nav — update this lock together with the feature, not before". #56 bắt buộc cập nhật test này cùng lúc thêm nav tuần thật.
- `apps/web/src/lib/repos/classes.test.ts:289-345` — pin test collapse sessionsDone.
- `packages/api/src/contracts.ts:157-164` — doc `lessonEditSchema`: pin off-by-one day convention + "WARNING for consumers (#56): omitted optional fields reset to \"\" — send all five fields or topic/zoom are wiped".

## 10. M1 DOD & hand-off notes

- `docs/project-roadmap.md:26-45` — M1 DOD relevant: dòng 41 "tạo lớp có lịch → sinh buổi tương ứng, hiển thị đúng trên /schedule, nav tuần hoạt động"; dòng 42 "Sửa/hủy buổi không làm hỏng buổi khác; check-in đúng trạng thái sau hard reload"; dòng 44 E2E CI xanh (thuộc #59); dòng 45 "0 CTA no-op luồng classes/schedule". Dòng 36: "Dashboard buổi hôm nay + nav tuần lịch hoạt động".
- Hand-off chính thức từ #55 (`plans/260821-1538-add-lesson-crud-api-from-class-schedule/phase-03-regression-gates-and-dod-evidence.md:65` mục (a)-(g)): (a) sửa derive sessionsDone collapse thuộc #56; (b) mapping day đã pin; (c) tránh đụng tên action `"add-lesson"/"edit-lesson"`; (d) form edit phải echo đủ 5 field nếu không wipe; (e) double-submit POST /students nhân bản N lessons — cân nhắc dedupe/toast; (f) snapshot phình theo enrollments × sessionsTotal; (g) lesson sinh ra luôn `type: "1:1"` kể cả lớp nhóm.
- Plan #58 (`plans/260821-1752-remove-schedule-fake-chrome/plan.md:78`) cảnh báo merge-conflict: #56 thêm code vào đúng vị trí #58 vừa xóa — branch này đã base trên develop sau merge #74 (chuẩn).
- PM status 2026-08-21 18:34 (`plans/reports/pm-260821-1834-m1-status.md`): "Cook #56 — Schedule UI: buổi từ lịch thật, nav tuần, fix sessionsDone collapse (hand-off từ #55/#71), edit form echo đủ field"; #59 blocked bởi #56.

## Risks

- Lesson không có ngày thật — "ngày trong tuần" của #56 phải derive theo ngữ nghĩa weekly-recurring slot (đã là ngữ nghĩa dashboard dùng: `lessonDayFromDate` match weekday). Off-by-one hazard 3 quy ước ngày (schedule JSON 0-6 Mon-first, lesson.day 1-7 Mon-first, JS getDay() 0=Sunday) đã pin nhiều chỗ — sai quy ước là bug thầm lặng.
- `kernel-runtime.contract.test.ts:185-209` là negative locks — thêm nav tuần/dates mà quên cập nhật lock này sẽ đỏ CI.
- `classes.test.ts:289-345` pin hành vi SAI có chủ đích — sửa derive sessionsDone phải đổi test này cùng issue #56.
- Check-in "đúng trạng thái sau reload": trạng thái lesson đã persist server-side qua snapshot `['kernel']` (reload là fetch mới) — không cần việc gì thêm về storage, chỉ cần UI đọc đúng status.
- Timezone: CI chạy UTC; ngày "hôm nay" phải tính theo Asia/Ho_Chi_Minh (mirror server `formatDayMonth` pattern) — không dùng `new Date().getDay()` trần.
