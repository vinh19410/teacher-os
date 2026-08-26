---
phase: 1
title: "Helper + extract ClassScheduleTable"
status: pending
priority: P2
effort: 0.5d
dependencies: []
---

# Phase 1: Helper + extract ClassScheduleTable

## Overview

Mở rộng `ClassSessionLesson` bằng `id`, export helper điểm danh tuần tự + date gate, extract `ClassScheduleTable` sang file riêng **không thêm CTA**. Route `$classId.tsx` xuống dưới 500 dòng trước khi Phase 2 nhét UI.

## Requirements

- Functional:
  - `ClassSessionLesson` Pick thêm `"id"` (`class-sessions.ts:40-43`). `Lesson.id` đã có (`mock-data.ts:31`); `mapLessons` đã giữ id.
  - Export `sessionIsEligibleDate(session, todayISO)` = `session.dateISO <= todayISO` (so sánh chuỗi `YYYY-MM-DD`).
  - Export `firstUpcomingLessonId(session, sid): string | null` — **một** upcoming id của sid từ `session.rows` (slot bag). Sort ổn định `id` localeCompare trước khi find (UUID tie-break; `createdAt` không có trên DTO). Không `rowsForSid[slotIndex-1]`. Không sort theo ngày (bag không có ngày).
  - Export `sessionAttendanceState(session, todayISO)` — kind hiển thị + per-sid sequential head. Field per-sid đặt tên **`enrollmentLessonId`** (không `lessonId`) để khỏi lẫn `sessionLessonInfo().lessonId` (syllabus). **Không** sửa `sessionStatus` / `sidStateAt`.
  - Extract nguyên `ClassScheduleTable` (`$classId.tsx:246-474`) → `apps/web/src/components/class-detail/class-schedule-table.tsx`. Hành vi UI **giống hệt** (vẫn row-click, vẫn Badge). **Chưa** CTA.
  - Cập nhật `class-detail-sessions-tab.contract.test.ts`: markup bảng đọc file mới; `lineCount < 500` vẫn đo `$classId.tsx`.
  - `row()` trong `class-sessions.test.ts` thêm `id` (string ổn định).
- Non-functional:
  - Không đụng server, schema, `data-actions.ts`.
  - Không gọi `todayISOVietnam()` bên trong helper thuần — nhận `todayISO` để test deterministic.
  - `$classId.tsx` sau extract phải `<500` dòng (hiện 474; cắt ~230 dòng table).

## Architecture

### Vì sao không bind index

`buildClassSessions` gán `rows: rowsBySlot.get(slotKey) ?? []` (`class-sessions.ts:167`) — **cùng một mảng** cho mọi occurrence của weekday+time. Test: `class-sessions.test.ts:76-80`.

`sidStateAt` (`class-sessions.ts:209-213`):

```ts
if (slotIndex <= stats.completed) return "completed";
if (slotIndex <= stats.completed + stats.cancelled) return "cancelled";
return "upcoming";
```

Check-in upcoming id nào của sid cũng tăng `completed` → sơn occurrence sớm nhất. `firstUpcomingLessonId` trên session 1 và session 5 (cùng Tue) **trả cùng id**. CTA chỉ được phép trên sequential head.

### Helper — implement đúng như sau

```ts
export function sessionIsEligibleDate(
  session: ClassSession,
  todayISO: string,
): boolean {
  return session.dateISO <= todayISO;
}

export function firstUpcomingLessonId(
  session: ClassSession,
  sid: string,
): string | null {
  const row = session.rows
    .filter((r) => r.sid === sid && r.status === "upcoming")
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  return row?.id ?? null;
}

// Sequential head: occurrence upcoming đầu tiên của sid trên slot này.
// Dùng sidStateAt nội bộ — KHÔNG export, KHÔNG đổi công thức.
function isSequentialHead(session: ClassSession, sid: string): boolean {
  const stats = slotStatsBySid(session.rows).get(sid);
  if (!stats) return false;
  return (
    sidStateAt(stats, session.slotIndex) === "upcoming" &&
    session.slotIndex === stats.completed + stats.cancelled + 1
  );
}
```

`sessionAttendanceState(session, todayISO)`:

1. `sessionStatus(session) === "cancelled"` → `{ kind: "cancelled", sids: [] }`
2. `=== "completed"` → `{ kind: "completed", sids: [] }`
3. `!sessionIsEligibleDate` → `{ kind: "future", sids: [] }`
4. Còn lại (eligible + upcoming): map `sessionStudents(session)`:
   - `sidStateAt === "completed"` → `{ sid, enrollmentLessonId: null, display: "completed" }`
   - `=== "cancelled"` → `{ sid, enrollmentLessonId: null, display: "cancelled" }`
   - `isSequentialHead` → `{ sid, enrollmentLessonId: firstUpcomingLessonId(...), display: "check-in" }` (nếu id null thì `"upcoming"`)
   - else → `{ sid, enrollmentLessonId: null, display: "upcoming" }`
5. `kind = sids.some(s => s.display === "check-in") ? "actionable" : "upcoming"`

Cấm dùng `sessionLessonInfo().lessonId` (syllabus) cho check-in.



Phase 1 **chưa render** state này — chỉ export + unit test. Phase 2 mới wire UI.

### Extract

Move nguyên function + imports chỉ table dùng:

- `ChevronDown` / `ChevronRight`, `Fragment`, `useState`
- `Badge`, `Card`, `DataTable`
- `buildClassSessions`, `formatSessionDate`, `sessionLessonInfo`, `sessionStatus`, `sessionStudents`, `sessionTimeRange`
- `lessonDayLabel`
- types `ClassGroup`, `Lesson`, `Student`, `Syllabus`

Route giữ `<ClassScheduleTable ...>` (`$classId.tsx:186-192`) — đổi sang import named từ `@/components/class-detail/class-schedule-table`. Props **không đổi** ở P1. **Chưa** truyền `run`/`isPending`/`busy`.

## Related Code Files

- Modify: `apps/web/src/lib/class-sessions.ts` — Pick `id`; thêm 3 export; `sidStateAt` / `sessionStatus` **không đổi**.
- Modify: `apps/web/src/lib/class-sessions.test.ts` — `row()` có `id`; describe mới cho helper.
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx` — xóa `ClassScheduleTable` in-file; import component mới.
- Create: `apps/web/src/components/class-detail/class-schedule-table.tsx`
- Modify: `apps/web/src/lib/class-detail-sessions-tab.contract.test.ts` — tách path đọc markup.

Không xóa file. Không đụng `data-actions.ts` / server.

## Implementation Steps

1. Đổi Pick `ClassSessionLesson` thành `"id" | "sid" | "day" | "time" | "dur" | "topic" | "status"`.
2. Thêm `id` vào `row()` (`class-sessions.test.ts:18-27`). `standardRows` gán `id: \`${sid}-${i}\`` để unique. Chạy test file này — `sessionStatus` / `buildClassSessions` không được vỡ (chúng không đọc `id`).
3. Thêm `sessionIsEligibleDate`, `firstUpcomingLessonId`, `isSequentialHead` (private), `sessionAttendanceState` đúng spec Architecture. Comment 4–6 dòng: rows = slot bag; cấm index-bind; check-in sơn occurrence sớm nhất.
4. Unit tests trong `class-sessions.test.ts` (bắt buộc, junior copy fixture `standardRows` / `sessionsWithTueStatuses`):
   - `sessionIsEligibleDate`: `today` và past → true; tomorrow → false. Dùng `dateISO` giả trên object tối thiểu hoặc session built.
   - `firstUpcomingLessonId`: bag `[c,a,b]` (thứ tự đảo) vẫn trả id nhỏ nhất theo `localeCompare` — không phải phần tử đầu mảng, không phải `rowsForSid[slotIndex-1]`.
   - `firstUpcomingLessonId`: sid không có upcoming → `null`.
   - `sessionAttendanceState` + `todayISO` = date occurrence 3: 0 completed → chỉ occurrence 1 `kind === "actionable"`; occurrence 2–3 không có sid `display === "check-in"`.
   - 1 completed rồi: head chuyển sang occurrence 2.
   - Equal 1:2: `[...standardRows("s1"), ...standardRows("s2")]` + override status. s1 completed ×2, s2 upcoming → occ 1 actionable chỉ s2; occ 2 không head. s1 completed ×1, s2 upcoming → occ 1 chỉ s2; occ 2 chỉ s1.
   - Divergent counts (pattern `class-sessions.test.ts:288-303`): s1 ít row hơn slotIndex → `sessionStudents` loại s1; occ 2 **không** emit check-in cho s1.
   - Future `todayISO` trước `dateISO` đầu → mọi session `kind === "future"`.
5. Tạo `class-schedule-table.tsx` **với full import list chép từ route** (cùng commit đổi contract path). Rồi mới xóa table khỏi route. Không để CI đỏ giữa chừng vì contract còn đọc `$classId.tsx` markup.
6. Route: import named; JSX props P1 không đổi. Giữ import roster/notes (`useState`, `Badge`, `Card`, `DataTable`).
7. Contract: `classDetailSrc` vẫn 3 tab / lineCount `<500`. Markup 4-col + legacy 5-col đọc file extract.
8. **Không** thêm Button Điểm danh. **Không** import `todayISOVietnam` / `useDirectKernelAction` trong table ở phase này.

## Success Criteria

- [x] `ClassSessionLesson` có `id`; `buildClassSessions` vẫn nhận `Lesson[]` (superset).
- [x] `sessionStatus` / `sidStateAt` byte-level không đổi hành vi (test cũ pass).
- [x] Unit test chứng minh `firstUpcomingLessonId` ≠ index-bind.
- [x] Unit test chứng minh CTA-head chỉ occurrence sớm nhất / sid.
- [x] `ClassScheduleTable` sống ở `apps/web/src/components/class-detail/class-schedule-table.tsx`; route import nó.
- [x] `$classId.tsx`.split("\\n").length `< 500`.
- [x] UI tab Buổi học trông như cũ (Badge only).
- [x] Không POST mới, không CTA.

## Risk Assessment

| Risk | Signal | Response |
|------|--------|----------|
| Quên `id` trên `row()` → TS fail hàng loạt | `class-sessions.test.ts` đỏ compile | Thêm `id` vào factory trước, rồi helper |
| Extract thiếu import / `lessonDayLabel` | Typecheck route/table | Chuyển đúng import; route giữ `lessonDayLabel` chỉ nếu còn dùng |
| Contract vẫn đọc markup từ `$classId.tsx` | Test 4-col / Chi tiết lesson fail | Chuyển assert sang file mới (step 7) |
| Junior implement `firstUpcomingLessonId` bằng `rows.filter(sid)[slotIndex-1]` | Test "mọi occurrence trả id a" fail | Test đó là gate — không xóa |
| Sửa `sidStateAt` "cho tiện" | Prefix test `in-order prefix` (`class-sessions.test.ts:271-286`) fail | Cấm đụng hàm đó |

Nếu assumption "Pick thêm `id` không phá caller khác" vỡ: grep `ClassSessionLesson` — hiện chỉ `class-sessions.ts` + `class-sessions.test.ts`.
