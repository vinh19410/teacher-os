---
phase: 1
title: "Phase 1: Route URL Search & Pure Helpers"
status: completed
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Route URL Search & Pure Helpers

## Goal
Thiết lập contract URL search params an toàn trên route `/classes/$classId` (lọc ký tự điều khiển/Bidi, hỗ trợ `JSON.parse` số của TanStack Router, `resetScroll: false`, functional updater chống race `_auth.beforeLoad`, `key={classId}`) và tạo module helper thuần dùng chung cho 3 tab với bộ unit test TDD phủ trước.

## Files to Create / Modify
- Create: `apps/student/src/components/class/class-detail-helpers.ts`
- Create: `apps/student/src/components/class/class-detail-helpers.test.ts`
- Modify: `apps/student/src/routes/_auth/classes/$classId.tsx`
- Modify: `apps/student/src/components/class/class-detail-view.tsx` (thêm props search controlled tùy chọn dùng functional updater + callback nhảy Tab 1 → Tab 2 + reset theo `cls.id`; giữ nguyên shell phía trên `<Tabs>`)

## TDD Structure

### Tests Before
Viết `apps/student/src/components/class/class-detail-helpers.test.ts` phủ toàn bộ biên trước khi implement:
- `parseClassDetailSearch` & `buildClassDetailSearch` (<!-- Updated: Red-Team RT-6 -->):
  - Chấp nhận `tab` (`journey|assignments|materials`), `jf` (`all|done|ahead`), `af` (`all|todo|submitted|graded`), `mk` (`all|file|media|link`), kiểm tra strictly qua allowlist `.includes()` (chặn prototype keys như `constructor`/`toString`).
  - Với `mq`: chấp nhận cả `string` lẫn `number` hữu hạn (xử lý `JSON.parse` của TanStack Router như `?mq=18` → `"18"`, `?mq=6.5` → `"6.5"`), từ chối `object`/`array`/`boolean`/`NaN`/`Infinity`; lọc bỏ mọi `/[\p{Cc}\p{Cf}]/gu` (ASCII control & Unicode Bidi override như `U+202E`, `%0A`, `%00`) trước khi `trim().slice(0, 200)`.
  - Dọn bỏ giá trị mặc định (`journey`, `all`, `""`) VÀ dọn ngay tham số không thuộc `tab` hiện tại ở cả `parseClassDetailSearch` lẫn `buildClassDetailSearch`.
- `formatSessionCountdown` (<!-- Updated: Red-Team RT-12 -->):
  - Tính theo `vietnamDateTimeMs(date, time)` và `vietnamSessionEndMs(date, time, dur)` so với `nowMs`.
  - Trả chuỗi hoàn chỉnh: `"Bắt đầu sau X ngày Y giờ"` / `"Bắt đầu sau Y giờ Z phút"` / `"Bắt đầu sau Z phút"` (làm tròn tối thiểu `"Bắt đầu sau 1 phút"` khi `0 < diff < 60_000`), `"Đang diễn ra"` khi `nowMs >= startMs && nowMs < endMs`, và `null` khi `nowMs >= endMs` hoặc ngày/giờ không hợp lệ.
- `formatZoomOpenAtLabel` (<!-- Updated: Red-Team RT-12 -->):
  - Tính từ `evaluateZoomJoinWindow` (`ZOOM_EARLY_JOIN_MINUTES = 30`); trả `HH:mm` khi ngày mở trùng `todayISO` và `HH:mm dd/mm` khi ngày mở khác `todayISO`, `null` khi không `too_early`/không hợp lệ.
- `normalizeVietnameseSearch`: bỏ dấu tiếng Việt (NFD), đổi `đ/Đ` → `d`, hạ chữ thường, thu gọn khoảng trắng.
- `formatMaterialTypeLabel` & `extractSafeHostname`: ánh xạ `MATERIAL_MIME` (`PDF`, `PNG`, `DOCX`, `MP3`, `MP4`...), fallback `Audio`/`Video`/`Tài liệu`/`Liên kết`; parse hostname an toàn (chỉ cho `http:`/`https:`, trả `null` với `javascript:` hoặc URL lỗi).
- `buildSessionNumberByDate`: ánh xạ `date -> teachingIndex` bỏ qua buổi `holiday` và bỏ qua `date == null` (khớp `buildIndexedLessons` trong `class-lesson-list.tsx`).

### Refactor
Tách helper thuần vào `class-detail-helpers.ts`, nối `validateSearch` + `useNavigate` (`replace: true, resetScroll: false`, functional updater `search: (prev) => ...`) + `key={classId}` ở `apps/student/src/routes/_auth/classes/$classId.tsx`, và nối props controlled/uncontrolled vào `ClassDetailView` để unit test không có `<RouterProvider>` vẫn hoạt động bình thường.

### Tests After
Xác minh toàn bộ test mới trong `class-detail-helpers.test.ts` và các test hiện có của `ClassDetailView` đều pass.

### Regression Gate
- `pnpm --filter student test -- src/components/class/class-detail-helpers.test.ts src/components/class/class-detail-view.test.tsx test/class-detail.test.tsx`
- `pnpm --filter student exec tsc --noEmit`

## Tasks & Steps

### Task 1.1 — Viết unit test đỏ cho `class-detail-helpers` (TDD Red)
- **Goal:** Định nghĩa và khóa hành vi toàn bộ hàm thuần trước khi viết code triển khai.
- **Target files and symbols:** `apps/student/src/components/class/class-detail-helpers.test.ts` (tests cho `parseClassDetailSearch`, `buildClassDetailSearch`, `formatSessionCountdown`, `formatZoomOpenAtLabel`, `normalizeVietnameseSearch`, `formatMaterialTypeLabel`, `extractSafeHostname`, `buildSessionNumberByDate`).
- **Steps:**
  1. Tạo `apps/student/src/components/class/class-detail-helpers.test.ts` import các hàm dự kiến từ `./class-detail-helpers`.
  2. Viết test phủ đầy đủ: enum hợp lệ & prototype keys (`constructor`), `mq` dạng số (`18`, `6.5`), `mq` chứa Bidi `U+202E` / newline `%0A` / object, cross-tab param stripping ở `parseClassDetailSearch`, `formatSessionCountdown` (`30s` → `"Bắt đầu sau 1 phút"`, đang diễn ra, đã kết thúc → `null`), `formatZoomOpenAtLabel` (cùng ngày vs khác ngày), dấu tiếng Việt (`đ/Đ`, NFD/NFC), URL `javascript:`, và buổi `holiday` + legacy `date: null`.
- **Success criteria:** File test tồn tại và thất bại vì module chưa triển khai.
- **Verify:** `pnpm --filter student test -- src/components/class/class-detail-helpers.test.ts` exits non-zero (module/export missing; passing is a failure).

### Task 1.2 — Triển khai `class-detail-helpers.ts` (TDD Green)
- **Goal:** Toàn bộ hàm thuần trong `class-detail-helpers.ts` đáp ứng đầy đủ test biên và tái dùng utility có sẵn từ `@teacher-os/api`.
- **Target files and symbols:** `apps/student/src/components/class/class-detail-helpers.ts` (export `CLASS_TAB_IDS`, `ClassTabId`, `JOURNEY_FILTERS`, `JourneyFilter`, `ASSIGNMENT_TAB_FILTERS`, `AssignmentTabFilter`, `MATERIAL_KIND_FILTERS`, `MaterialKindFilter`, `ClassDetailSearchState`, `parseClassDetailSearch`, `buildClassDetailSearch`, `formatSessionCountdown`, `formatZoomOpenAtLabel`, `normalizeVietnameseSearch`, `formatMaterialTypeLabel`, `extractSafeHostname`, `buildSessionNumberByDate`).
- **Steps:**
  1. Dùng `vietnamDateTimeMs`, `vietnamSessionEndMs`, `vietnamDateKeyOf`, `formatVietnamTimeHHMM` từ `@teacher-os/api/vietnam-date` và `evaluateZoomJoinWindow` từ `@teacher-os/api/zoom-window` (không tự tính tay offset UTC+7 hay cứng 15 phút).
  2. Dùng `MATERIAL_MIME`, `isSafeMaterialUrl` từ `@teacher-os/api/material-contracts`.
  3. Trong `parseClassDetailSearch` và `buildClassDetailSearch`: chấp nhận `string | finite number` cho `mq`, lọc `/[\p{Cc}\p{Cf}]/gu` trước `trim().slice(0, 200)`, loại bỏ mọi key có giá trị mặc định và dọn param không thuộc `tab` hiện tại.
- **Success criteria:** Tất cả test trong `class-detail-helpers.test.ts` pass.
- **Verify:** `pnpm --filter student test -- src/components/class/class-detail-helpers.test.ts` exits 0 and prints all tests passed.

### Task 1.3 — Gắn `validateSearch`, `resetScroll: false`, `key={classId}` vào `$classId.tsx` và props controlled tùy chọn vào `ClassDetailView`
- **Goal:** Trạng thái tab/bộ lọc/tìm kiếm đồng bộ qua URL không giật scroll (`resetScroll: false`) và không race với async `_auth.beforeLoad`, đồng thời `ClassDetailView` hoạt động độc lập khi mount trong unit test không có router và reset sạch state khi `classId` đổi.
- **Target files and symbols:**
  - `apps/student/src/routes/_auth/classes/$classId.tsx` (`Route` với `validateSearch: parseClassDetailSearch`, `StudentClassDetailPage` dùng `latestSearchRef` + functional updater `navigate({ ..., search: (prev) => ..., replace: true, resetScroll: false })` + `key={classId}`)
  - `apps/student/src/components/class/class-detail-view.tsx` (`ClassDetailView` props mở rộng optional `searchState?: ClassDetailSearchState`, `onSearchChange?: (updater: (prev: ClassDetailSearchState) => ClassDetailSearchState) => void`, state `focusedAssignmentId`, reset theo `cls.id`)
- **Steps:**
  1. <!-- Updated: Red-Team RT-4, RT-7 --> Trong `$classId.tsx`, thêm `validateSearch: parseClassDetailSearch` vào `createFileRoute("/_auth/classes/$classId")`. Dùng `Route.useSearch()`, giữ `latestSearchRef` cập nhật đồng bộ trước `navigate({ to: "/classes/$classId", params: { classId }, search: (prev) => buildClassDetailSearch(updater(parseClassDetailSearch(prev as Record<string, unknown>))), replace: true, resetScroll: false })` để tránh cả race async `_auth.beforeLoad` lẫn kéo scroll về đầu (`scrollRestoration: true`). Gắn `key={classId}` lên `<ClassDetailView>`.
  2. Trong `ClassDetailView`, giữ nguyên 100% shell phía trên `<Tabs>` (`BackHomeLink`, `TodoBanner`, `<header>`, `class-paused-banner`, `ClassInfoCard`, 4 `RingStat`, `<Tabs>`). Quản lý state fallback bằng `useState<ClassDetailSearchState>({})` khi props `searchState`/`onSearchChange` không được truyền, và reset `localSearchState` + `focusedAssignmentId` khi `cls.id` đổi.
  3. Định nghĩa callback `handleOpenAssignmentFromJourney(assignmentId: string)` gọi `updateSearch(() => ({ tab: "assignments" }))` và lưu `focusedAssignmentId` để Phase 3 tự động mở + cuộn + focus đúng bài tập đó.
- **Success criteria:** Typecheck sạch và các test hiện có của `ClassDetailView` pass 100% không cần bọc RouterProvider.
- **Verify:** `pnpm --filter student test -- src/components/class/class-detail-helpers.test.ts src/components/class/class-detail-view.test.tsx test/class-detail.test.tsx && pnpm --filter student exec tsc --noEmit` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same failure evidence to the user. Never continue by self-reasoning.
