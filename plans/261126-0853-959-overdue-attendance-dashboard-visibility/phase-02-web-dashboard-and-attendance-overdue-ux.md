---
phase: 2
title: "Phase 2: Web Dashboard Reminder Card & Attendance Overdue UX (TDD)"
status: completed
priority: P1
effort: "1.75h"
dependencies: [1]
---

# Phase 2: Web Dashboard Reminder Card & Attendance Overdue UX (TDD)

## Goal

Đồng bộ cache attendance (`daily` + `overdue`) qua `DataProvider` dưới `staleTime: Infinity`, gửi `?v=2` ở `fetchDashboardReminders`, cập nhật thẻ nhắc việc #1 trên `/teacher/dashboard` và màn hình `/teacher/attendance` để hiển thị rõ nợ điểm danh quá hạn, điều hướng thông minh, chống clock skew / midnight rollover, và cho phép giáo viên điểm danh trực tiếp kèm auto-advance qua toàn bộ các buổi quá hạn.

## Files to Create / Modify

- Modify: `apps/web/src/lib/attendance-draft.ts`
- Modify: `apps/web/src/lib/repos/daily-attendance.ts`
- Modify: `apps/web/src/lib/repos/daily-attendance.test.ts`
- Modify: `apps/web/src/lib/repos/dashboard-reminders.ts`
- Modify: `apps/web/src/lib/data-provider.tsx`
- Modify: `apps/web/src/lib/data-provider.test.tsx`
- Modify: `apps/web/src/components/dashboard/reminder-cards.tsx`
- Modify: `apps/web/src/components/dashboard/reminder-cards.test.tsx`
- Modify: `apps/web/src/routes/_auth/dashboard.test.tsx`
- Modify: `apps/web/src/components/attendance/attendance-session-row.tsx`
- Modify: `apps/web/src/components/attendance/attendance-session-row.test.tsx`
- Modify: `apps/web/src/routes/_auth/attendance.tsx`
- Modify: `apps/web/src/routes/_auth/attendance.test.tsx`
<!-- Updated: Validation Session 1 - bổ sung `dashboard-reminders.ts`, `data-provider.tsx`, `data-provider.test.tsx` (Red-Team #1, #3) -->

## Tasks & Steps

### Task 2.1 — Viết test đỏ (TDD Red) cho repo `overdueAttendanceQuery`, `DataProvider` invalidation, `ReminderCards`, `AttendanceSessionRow` và `/attendance`
- **Goal:** Xác định trước hành vi UI/repo/cache mong đợi bằng test thất bại trước khi sửa component.
- **Target files and symbols:**
  - `apps/web/src/lib/repos/daily-attendance.test.ts`
  - `apps/web/src/lib/data-provider.test.tsx` (`lines 206-267`)
  - `apps/web/src/components/dashboard/reminder-cards.test.tsx`
  - `apps/web/src/routes/_auth/dashboard.test.tsx` (`lines 568-576`)
  - `apps/web/src/components/attendance/attendance-session-row.test.tsx`
  - `apps/web/src/routes/_auth/attendance.test.tsx`
- **Steps:**
  1. Trong `apps/web/src/lib/repos/daily-attendance.test.ts`: thêm test cho `attendanceBaseQueryKey` (`["kernel", "attendance"]`), `overdueAttendanceBaseQueryKey` (`["kernel", "attendance", "overdue"]`), `overdueAttendanceQueryKey("2026-11-26")` (chứa ngày VN dưới prefix `overdueAttendanceBaseQueryKey`), và `fetchOverdueAttendance` (parse hợp lệ `overdueAttendanceResponseSchema`, ném `DailyAttendanceApiError` khi server trả lỗi).
  2. Trong `apps/web/src/lib/data-provider.test.tsx`: mở rộng test invalidation tại `lines 206-267` để chứng minh sau một kernel dispatch thành công, `DataProvider` invalidate **cả** `dailyAttendanceBaseQueryKey` lẫn `overdueAttendanceBaseQueryKey` (qua `attendanceBaseQueryKey`).
  <!-- Updated: Validation Session 1 - thêm test hồi quy invalidation `overdueAttendanceBaseQueryKey` ở `data-provider.test.tsx` (Red-Team #1) -->
  3. Trong `apps/web/src/components/dashboard/reminder-cards.test.tsx` và `apps/web/src/routes/_auth/dashboard.test.tsx`:
     - Cập nhật kỳ vọng heading/aria-label thẻ #1 sang `"Ca dạy chưa điểm danh"` / `"1. Điểm danh — Ca dạy chưa điểm danh"`.
     - Trong `dashboard.test.tsx`: xác nhận request gọi `/api/dashboard/reminders?v=2`.
     - Thêm test case trên `reminder-cards.test.tsx`:
       - Khi `today: 0, overdue: 6, pending: 6` và 3 item cùng 1 `classId` khác `date`: hiển thị `"6 ca dạy"`, breakdown `"6 ca quá hạn"`, preview hiển thị `dd/MM · HH:mm` (vd `"24/11 · 19:00"`), `"+3 ca khác"`, không cảnh báo duplicate key, và href dẫn `/attendance?date=2026-10-26&status=overdue`.
       - Khi `today: 1, overdue: 4, pending: 5`: hiển thị `"5 ca dạy"`, breakdown chứa `"4 quá hạn"` và `"1 hôm nay"`, item hôm nay hiện `"18:00"`, item quá hạn hiện `"24/11 · 19:00"`, và href dẫn `/attendance?date=2026-10-26&status=pending`.
       - Deploy skew fallback: payload thiếu `today` và `overdue` (`undefined`) vẫn hiển thị bình thường không `NaN` và dẫn `status=pending`.
  4. Trong `apps/web/src/components/attendance/attendance-session-row.test.tsx`:
     - Thêm test cho prop `sessionDate` + `showDate` + `isOverdue`: khi ca quá hạn (`isOverdue: true`, `sessionDate: "2026-11-24"`, `showDate: true`), header hiển thị ngày `"24/11/2026"` và badge `"Quá hạn"` (không hiện badge `"Chưa điểm danh"`).
  5. Trong `apps/web/src/routes/_auth/attendance.test.tsx`:
     - Cập nhật `validateAttendanceSearch` test nhận `status: "overdue"`.
     - Cập nhật `statefulFetch` (`lines 400-430`) và các mock `fetch` inline để tách rõ request `/api/attendance/overdue` (mặc định trả `{ today: "2026-10-07", totalCount: 0, hasMore: false, sessions: [] }`) với `/api/attendance/daily`, và đếm call theo URL `/api/attendance/daily` (tránh assert tổng cứng `toHaveBeenCalledTimes(4)` / `toHaveBeenCalledTimes(3)` ở `lines 612, 823` bị nhiễu bởi request `/overdue`).
     - Thêm test case mới cho `/attendance`:
       - Khi đang ở `?date=2026-10-07&status=all` (hôm nay 0 ca) nhưng `/api/attendance/overdue` trả 2 ca quá hạn: hiển thị chip `"Quá hạn"` (badge `2`) + banner cảnh báo `"Có 2 ca học từ các ngày trước chưa điểm danh."` + nút `"Xem ca quá hạn"` bấm sẽ navigate tới `{ to: "/attendance", search: { date: "2026-10-07", status: "overdue" } }`.
       - Khi đang ở `?date=2026-10-07&status=overdue` với 3 ca cùng một `classId` khác `date` (`2026-10-05`, `2026-10-03`, `2026-10-01`): tự mở sẵn ca đầu (`2026-10-05`); lưu ca thứ 2 (`2026-10-03`) gửi `PUT /api/classes/cls-1/sessions/2026-10-03/attendance`, auto-advance tiến sang ca thứ 3 (`2026-10-01`) thay vì nhảy ngược về ca đầu; lưu hết → live status `"Đã điểm danh xong mọi ca quá hạn"` và empty state có nút `"Quay lại hôm nay"`.
       - Refetch sau PUT ở `status=overdue` trả `500` → guard `queryState/dataUpdatedAt` chặn auto-advance trên cache stale; `PUT` trả `404 { reason: "not-found" }` → toast lỗi và refetch `/api/attendance/overdue`.
       - Khi `search.date` ở URL là ngày tương lai chắc chắn (`"2099-12-31"`) nhưng `status=overdue`, form ca quá hạn KHÔNG bị khoá read-only (`isFutureDate` là `false`).
       <!-- Updated: Validation Session 1 - thay `"2026-10-20"` bằng `"2099-12-31"` tránh phantom test (Red-Team #10) -->
       - Lớp `legacy` ở ngày quá khứ trên tab `status=all` KHÔNG gắn badge `"Quá hạn"` (giữ `"Chưa điểm danh"` + `"Lớp chưa gắn lịch ngày"`).
       - Khi `overdueQuery.data.today` lớn hơn ngày đồng hồ client (clock skew), ca trong tab `status=overdue` vẫn gắn badge `"Quá hạn"`.
       - Đổi ngày trên `<input type="date">` hoặc bấm `"Hôm nay"` khi đang ở `status=overdue` chuyển `status` về `"all"`.
       - Khi `/api/attendance/overdue` trả 500 ở tab `all`: danh sách ngày hôm nay vẫn render bình thường (không hiện error box đè tab ngày); ở tab `overdue` hiện `role="alert"` + bấm nút `"Thử lại"` gọi lại `/api/attendance/overdue` và phục hồi danh sách thành công.
       <!-- Updated: Validation Session 1 - kiểm nút `"Thử lại"` thực sự refetch `/api/attendance/overdue`, kiểm `404`, refetch-500, `prevIndex`, `legacy`, clock skew (Red-Team #7, #8, #11) -->
- **Success criteria:** Các test mới chạy và fail (TDD Red) vì repo/component chưa cập nhật.
- **Verify:** `pnpm --filter web test src/lib/repos/daily-attendance.test.ts src/lib/data-provider.test.tsx src/components/dashboard/reminder-cards.test.tsx src/routes/_auth/dashboard.test.tsx src/components/attendance/attendance-session-row.test.tsx src/routes/_auth/attendance.test.tsx` exits non-zero với lỗi assertion / missing export.

### Task 2.2 — Cập nhật `attendance-draft.ts`, `daily-attendance.ts`, `dashboard-reminders.ts` và `data-provider.tsx`
- **Goal:** Bổ sung `AttendanceRowSession` + `isSessionPaused`, prefix cha `attendanceBaseQueryKey`, query `overdueAttendanceQuery(todayISO)`, gửi `?v=2` ở `fetchDashboardReminders`, và invalidate toàn bộ cache attendance trong `DataProvider`.
- **Target files and symbols:**
  - `apps/web/src/lib/attendance-draft.ts` (`AttendanceRowSession`, `isSessionPaused`)
  - `apps/web/src/lib/repos/daily-attendance.ts` (`attendanceBaseQueryKey`, `dailyAttendanceBaseQueryKey`, `overdueAttendanceBaseQueryKey`, `overdueAttendanceQueryKey`, `fetchOverdueAttendance`, `overdueAttendanceQuery`)
  - `apps/web/src/lib/repos/dashboard-reminders.ts` (`fetchDashboardReminders`)
  - `apps/web/src/lib/data-provider.tsx` (`refetch` lines 114-124)
- **Steps:**
  1. Trong `apps/web/src/lib/attendance-draft.ts`:
     - Import `OverdueAttendanceSession` từ `@teacher-os/api/contracts`.
     - Export `export type AttendanceRowSession = DailyAttendanceSession | OverdueAttendanceSession;`.
     - Export helper narrow kiểu:
       ```ts
       export function isSessionPaused(session: AttendanceRowSession): boolean {
         return "classPaused" in session && Boolean(session.classPaused);
       }
       ```
     <!-- Updated: Validation Session 1 - thêm `isSessionPaused` ngăn lỗi `TS2339` trên union `AttendanceRowSession` (Red-Team #2) -->
  2. Trong `apps/web/src/lib/repos/daily-attendance.ts`:
     - Export `attendanceBaseQueryKey = ["kernel", "attendance"] as const;`.
     - Định nghĩa `dailyAttendanceBaseQueryKey = [...attendanceBaseQueryKey, "daily"] as const;` (giữ nguyên giá trị runtime `["kernel", "attendance", "daily"]`).
     - Export `overdueAttendanceBaseQueryKey = [...attendanceBaseQueryKey, "overdue"] as const;` (`["kernel", "attendance", "overdue"]`).
     - Export `overdueAttendanceQueryKey = (todayISO: string) => [...overdueAttendanceBaseQueryKey, todayISO] as const;`.
     - Export `fetchOverdueAttendance(baseUrl = getApiBaseUrl(), signal?: AbortSignal): Promise<OverdueAttendanceResponse>` gọi `GET ${baseUrl}/api/attendance/overdue` (`credentials: "include"`, `signal`), lỗi qua `throwAttendanceHttpError(res, "load overdue attendance")`, parse bằng `overdueAttendanceResponseSchema.parse(await res.json())`.
     - Export `overdueAttendanceQuery(todayISO: string, baseUrl = getApiBaseUrl())` trả `queryOptions({ queryKey: overdueAttendanceQueryKey(todayISO), queryFn: ({ signal }) => fetchOverdueAttendance(baseUrl, signal) })`.
     <!-- Updated: Validation Session 1 - gắn `todayISO` vào `overdueAttendanceQueryKey` cho midnight rollover và export `attendanceBaseQueryKey` (Red-Team #1, #8) -->
  3. Trong `apps/web/src/lib/repos/dashboard-reminders.ts:32`:
     - Đổi URL fetch sang `` `${baseUrl}/api/dashboard/reminders?v=2` `` (để nhận đầy đủ `today`, `overdue`, `items[].date` đồng thời giữ client cũ không có `?v=2` không vỡ `.strict()`).
     <!-- Updated: Validation Session 1 - opt-in `?v=2` ở `fetchDashboardReminders` (Red-Team #3) -->
  4. Trong `apps/web/src/lib/data-provider.tsx:27, 121-123`:
     - Import `attendanceBaseQueryKey` thay cho `dailyAttendanceBaseQueryKey` từ `@/lib/repos/daily-attendance` và gọi `await queryClient.invalidateQueries({ queryKey: attendanceBaseQueryKey });`.
     <!-- Updated: Validation Session 1 - invalidate toàn bộ prefix `["kernel", "attendance"]` trong `DataProvider` (Red-Team #1) -->
- **Success criteria:** `daily-attendance.test.ts` và `data-provider.test.tsx` pass 100%.
- **Verify:** `pnpm --filter web test src/lib/repos/daily-attendance.test.ts src/lib/data-provider.test.tsx` exits 0 và in `passed`.

### Task 2.3 — Nâng cấp `ReminderCards` trên `/teacher/dashboard`
- **Goal:** Hiển thị rõ tổng ca chưa điểm danh (hôm nay + quá hạn), breakdown màu `--destructive`, ngày `dd/MM` trên item quá hạn, key chống trùng, và smart link sang `status=overdue` khi chỉ còn ca quá hạn.
- **Target files and symbols:** `apps/web/src/components/dashboard/reminder-cards.tsx` (`ReminderCards`).
- **Steps:**
  1. Import `formatDayMonth` từ `@/lib/week-grid`.
  2. Trong `ReminderCards`:
     - Tính an toàn deploy skew:
       `const overdueCount = data.attendance.overdue ?? 0;`
       `const todayCount = data.attendance.today ?? Math.max(0, data.attendance.pending - overdueCount);`
     - Đổi `title` thẻ #1 thành `"Ca dạy chưa điểm danh"` (giữ `step={1}`, `label="Điểm danh"`, `cta="Điểm danh"`, `DONE_TODAY_LABEL = "Đã hoàn tất hôm nay"`).
     - Đặt `search`: `todayCount === 0 && overdueCount > 0 ? { date: data.date, status: "overdue" } : { date: data.date, status: "pending" }`.
     - Khi `overdueCount > 0`, render dòng tóm tắt tách bạch phía trên danh sách preview:
       - Nếu `todayCount > 0`: chấm `--destructive` + `"{overdueCount} quá hạn"` + `" · "` + `"{todayCount} hôm nay"`.
       - Nếu `todayCount === 0`: chấm `--destructive` + `"{overdueCount} ca quá hạn"`.
     - Trong `attendancePreview.map`:
       - Đổi React `key` thành `` `${item.classId}-${item.date ?? "legacy"}-${item.time}` ``.
       - Tính `const isOverdueItem = Boolean(item.date && item.date < data.date);`.
       - Hiển thị cột thời gian: nếu `isOverdueItem && item.date`, render `` `${formatDayMonth(item.date)} · ${item.time}` `` với class `text-destructive`; ngược lại giữ `{item.time}` với `text-muted-foreground`.
  3. Xác nhận `apps/web/src/routes/_auth/dashboard.tsx:144-150`: `openTasks` đã đọc `reminders.data.attendance.pending > 0` nên tự động phản ánh nợ quá hạn mà không cần sửa `dashboard.tsx`.
- **Success criteria:** `reminder-cards.test.tsx` và `dashboard.test.tsx` pass 100%, không còn warning React duplicate key.
- **Verify:** `pnpm --filter web test src/components/dashboard/reminder-cards.test.tsx src/routes/_auth/dashboard.test.tsx` exits 0 và in `passed`.

### Task 2.4 — Nâng cấp `AttendanceSessionRow` và `/teacher/attendance` cho nợ điểm danh quá hạn
- **Goal:** Cho phép nhìn thấy nợ quá hạn từ mọi tab ngày (chip `"Quá hạn"` + banner đỏ) và điểm danh inline liên tiếp toàn bộ ca quá hạn trong `status=overdue` không va chạm key, không gửi nhầm ngày, không lỗi `TS2339`, không kẹt nút `"Thử lại"`, và chống clock skew / midnight rollover.
- **Target files and symbols:**
  - `apps/web/src/components/attendance/attendance-session-row.tsx` (`AttendanceSessionRow`, `AttendanceSessionRowProps`)
  - `apps/web/src/routes/_auth/attendance.tsx` (`STATUS_VALUES`, `CHIP_OPTIONS`, `STATUS_TO_CHIP`, `CHIP_TO_STATUS`, `STATUS_LABEL`, `validateAttendanceSearch`, `sessionKey`, `AttendanceRoute`)
- **Steps:**
  1. Trong `apps/web/src/components/attendance/attendance-session-row.tsx`:
     - Import `type AttendanceRowSession`, `isSessionPaused` từ `@/lib/attendance-draft`.
     - Đổi `session: AttendanceRowSession`, thêm props optional `sessionDate?: string`, `showDate?: boolean`, `isOverdue?: boolean`.
     - Khai báo `const classPaused = isSessionPaused(session);` và thay toàn bộ 4 vị trí `session.classPaused` (`lines 64, 212, 222, 279`) bằng `classPaused`.
     <!-- Updated: Validation Session 1 - thay toàn bộ `session.classPaused` bằng `isSessionPaused(session)` (Red-Team #2) -->
     - Trong nút header: khi `showDate && sessionDate`, hiển thị ngày `dd/MM/yyyy` (format `${sessionDate.slice(8, 10)}/${sessionDate.slice(5, 7)}/${sessionDate.slice(0, 4)}`) với `font-mono text-destructive text-xs tabular-nums` trước `timeLabel` (dùng `flex-wrap` trên nhóm thông tin ca để không tràn ngang ở 320px/375px).
     - Khi `!session.recorded && !classPaused && isOverdue`, render badge quá hạn:
       `<Badge variant="outline" dot className="border-destructive/30 bg-destructive/10 text-destructive">Quá hạn</Badge>` (thay cho badge amber `"Chưa điểm danh"`).
  2. Trong `apps/web/src/routes/_auth/attendance.tsx`:
     - Import `type AttendanceRowSession`, `isSessionPaused` từ `@/lib/attendance-draft` và `overdueAttendanceQuery`, `overdueAttendanceQueryKey` từ `@/lib/repos/daily-attendance`.
     - Mở rộng `STATUS_VALUES = ["all", "pending", "completed", "overdue"] as const;`, thêm chip `"Quá hạn"` vào `CHIP_OPTIONS`, `STATUS_TO_CHIP`, `CHIP_TO_STATUS`, `STATUS_LABEL` (`overdue: "Quá hạn"`).
     - Đổi `sessionKey(session: AttendanceRowSession, fallbackDate: string)`:
       ```ts
       function sessionKey(session: AttendanceRowSession, fallbackDate: string): string {
         if (session.mode === "dated") {
           const sessionDate = "date" in session ? session.date : fallbackDate;
           return `dated:${session.classId}:${sessionDate}`;
         }
         return `legacy:${session.classId}:${session.time}`;
       }
       ```
     - Theo dõi `todayISO` reactive qua nửa đêm VN (tái dùng mẫu `dashboard.tsx:52-63`):
       ```ts
       const [todayISO, setTodayISO] = useState(() => todayISOVietnam());
       useEffect(() => {
         const sync = () => {
           const next = todayISOVietnam();
           setTodayISO((prev) => (prev === next ? prev : next));
         };
         const id = window.setInterval(sync, 60_000);
         const onVisibility = () => {
           if (!document.hidden) sync();
         };
         document.addEventListener("visibilitychange", onVisibility);
         return () => {
           window.clearInterval(id);
           document.removeEventListener("visibilitychange", onVisibility);
         };
       }, []);
       ```
     <!-- Updated: Validation Session 1 - `todayISO` reactive cho midnight rollover (Red-Team #8) -->
     - Khai báo `const overdueQuery = useQuery(overdueAttendanceQuery(todayISO));` song song với `dailyQuery`.
     - Tính `const isOverdueTab = search.status === "overdue";` và `const effectiveTodayISO = overdueQuery.data?.today ?? todayISO;`.
     - Auto-expand effect (`lines 118-133`):
       - Khi `isOverdueTab`: chờ `overdueQuery.data`, đặt `autoKey = overdue:${overdueQuery.data.today}`, tự mở ca đầu tiên trong `overdueQuery.data.sessions`.
       - Khi `!isOverdueTab`: giữ nguyên logic chờ `dailyQuery.data` với `autoKey = ${search.date}:${search.status}` và mở ca pending đầu tiên khi `search.status === "pending"` (`!s.recorded && !isSessionPaused(s)`).
     - `handleDateChange(nextDate)`: nếu đang ở `status === "overdue"`, chuyển `status` sang `"all"` (còn lại giữ `search.status`).
     - Nút `"Hôm nay"` trên `PageHead`: `disabled={search.date === todayISO && !isOverdueTab}`; khi bấm gọi `handleDateChange(todayISO)`.
     - `PageHead` kicker: khi `isOverdueTab`, hiển thị `"Các ngày trước hôm nay · Quá hạn"`; ngược lại giữ `${formatVNDate(search.date)} · ${STATUS_LABEL[search.status]}`.
     - `chipCounts`: ghép counts của `dailyQuery.data` (khi có) và `"Quá hạn": overdueQuery.data.totalCount` (khi có).
     - **Banner quá hạn:** khi `!isOverdueTab && overdueQuery.data && overdueQuery.data.totalCount > 0`, hiển thị thanh cảnh báo (`role="region" aria-label="Nợ điểm danh quá hạn"`, class `flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm`) với nội dung `"Có ${overdueQuery.data.totalCount} ca học từ các ngày trước chưa điểm danh."` và nút `<Button type="button" variant="outline" size="sm" onClick={() => handleChipChange("Quá hạn")}>Xem ca quá hạn</Button>`.
     - **`handleSaveSession(session: AttendanceRowSession, entries: SessionAttendanceSave["entries"])`:**
       - Chụp `const todayAtStart = todayISO;`, `const isOverdueAtStart = search.status === "overdue";`, `const targetDate = "date" in session ? session.date : searchAtStart.date;`, `const key = sessionKey(session, searchAtStart.date);`.
       - Nếu `isOverdueAtStart`, chụp `prevOverdueIndex = (overdueQuery.data?.sessions ?? []).findIndex((s) => sessionKey(s, todayAtStart) === key)` trước khi gọi `PUT`.
       - Gọi `await saveSessionAttendance(session.classId, targetDate, entries);`.
       - Sau `await queryClient.invalidateQueries({ queryKey: ["kernel"] })` (kiểm `latestSearchRef.current` vẫn trùng `searchAtStart`):
         - Nếu `isOverdueAtStart`:
           - Đọc `queryKey = overdueAttendanceQueryKey(todayAtStart)`, `queryState = queryClient.getQueryState(queryKey)`, `fresh = queryClient.getQueryData<OverdueAttendanceResponse>(queryKey)`.
           - Guard bắt buộc: `if (!fresh || queryState?.status === "error" || (queryState?.dataUpdatedAt ?? 0) < savedAt) return;`.
           - Dựng `ordered` giữ tiến độ từ `prevOverdueIndex` (`prevOverdueIndex >= 0 ? [...fresh.sessions.slice(prevOverdueIndex), ...fresh.sessions.slice(0, prevOverdueIndex)] : fresh.sessions`), tìm ca đầu tiên `sessionKey(s, todayAtStart) !== key`. Nếu có → mở + `setAutoFocusBulkKey(nextKey)`; nếu hết (`fresh.sessions.length === 0`) → `setLiveMessage("Đã điểm danh xong mọi ca quá hạn")` và `dateInputRef.current?.focus()`.
         - Nếu `!isOverdueAtStart`: giữ nguyên logic auto-advance trên `dailyAttendanceQueryKey(searchAtStart.date)` với `sessionKey(s, searchAtStart.date)` và `isSessionPaused(s)`.
       - Trong nhánh `catch`:
         - Thêm xử lý `err.status === 404 && err.reason === "not-found"` → `toast.error("Ca học không còn tồn tại hoặc đã thay đổi, đã tải lại.");` + refetch query đang active (và `overdueQuery` nếu `targetDate < effectiveTodayISO`) + invalidate `["kernel"]`.
         - Ở nhánh `409 CLASS_PAUSED` và `409 roster-changed` / `422`: refetch `isOverdueAtStart ? overdueQuery.refetch() : dailyQuery.refetch()` (và khi `!isOverdueAtStart && targetDate < effectiveTodayISO`, refetch thêm `overdueQuery.refetch()`).
       <!-- Updated: Validation Session 1 - guard `queryState/dataUpdatedAt`, giữ `prevOverdueIndex`, xử lý `404 not-found`, mở rộng chữ ký `AttendanceRowSession` (Red-Team #2, #7) -->
     - **Render danh sách & trạng thái tải/lỗi/rỗng độc lập:**
       - `activePending = isOverdueTab ? overdueQuery.isPending : dailyQuery.isPending`
       - `activeError = isOverdueTab ? overdueQuery.isError : dailyQuery.isError`
       - Trong khối lỗi `role="alert"` (`lines 400-414`):
         - Thông báo: `isOverdueTab ? "Không thể tải danh sách ca học quá hạn." : "Không thể tải danh sách ca học trong ngày."`
         - Nút `"Thử lại"`: `onClick={() => void (isOverdueTab ? overdueQuery.refetch() : dailyQuery.refetch())}`.
       <!-- Updated: Validation Session 1 - đổi callback nút `"Thử lại"` và message lỗi theo `isOverdueTab` (Red-Team #7) -->
       - Nếu `isOverdueTab` và danh sách rỗng: hiển thị `"Không có ca học quá hạn chưa điểm danh."` kèm nút `"Quay lại hôm nay"` (`handleDateChange(todayISO)`).
       - Nếu `isOverdueTab` và `overdueQuery.data?.hasMore`: hiển thị dòng chú thích muted `"Đang hiển thị ${overdueQuery.data.sessions.length}/${overdueQuery.data.totalCount} ca quá hạn gần nhất. Hoàn tất để xem tiếp các ca cũ hơn."`.
       - Truyền vào `AttendanceSessionRow`:
         - `sessionDate={rowDate}` (`"date" in session ? session.date : search.date`)
         - `showDate={isOverdueTab}`
         - `isOverdue={isOverdueTab || (session.mode === "dated" && !session.recorded && !isSessionPaused(session) && rowDate < effectiveTodayISO)}`
         - `isFutureDate={isOverdueTab ? false : isFutureDate}`
       <!-- Updated: Validation Session 1 - dùng `isOverdueTab || (session.mode === "dated" ... && rowDate < effectiveTodayISO)` loại `legacy` và chống clock skew (Red-Team #8, #11) -->
- **Success criteria:** Toàn bộ unit test web (bao gồm `attendance-session-row.test.tsx`, `attendance.test.tsx`, `reminder-cards.test.tsx`, `dashboard.test.tsx`, `daily-attendance.test.ts`, `data-provider.test.tsx`) pass 100%, không lỗi type hay lint.
- **Verify:** `pnpm --filter web test && pnpm check-types && pnpm exec biome check .` exits 0 và toàn bộ test pass.

## Verification

- `pnpm --filter web test`
- `pnpm check-types`
- `pnpm exec biome check .`

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
