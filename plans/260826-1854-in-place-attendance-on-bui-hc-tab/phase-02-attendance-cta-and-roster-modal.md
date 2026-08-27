---
phase: 2
title: "CTA điểm danh + modal roster"
status: pending
priority: P2
effort: 0.75d
dependencies: [1]
---

# Phase 2: CTA điểm danh + modal roster

## Overview

Wire helper Phase 1 vào cột Trạng thái: 1:1 one-click; 1:2+ mở `SessionAttendanceModal`. Date gate UI-only. a11y: bỏ row-level click. Hook `useDirectKernelAction` **chỉ** instance sẵn có trên route (`$classId.tsx:64`).

## Requirements

- Functional:
  - `todayISO = todayISOVietnam()` từ `@/lib/week-grid` (`week-grid.ts:29-34`). Cấm `new Date().toISOString().slice(0,10)`.
  - Cột Trạng thái (`class-schedule-table.tsx`, hiện Badge `$classId.tsx:426-435` sau extract):
    - `kind === "completed"` → `<Badge variant="success" dot>Đã học</Badge>`
    - `kind === "cancelled"` → `<Badge variant="danger">Đã hủy</Badge>`
    - `kind === "future"` hoặc `"upcoming"` → `<Badge variant="accent">Sắp tới</Badge>` — **không** button
    - `kind === "actionable"` + đúng 1 sid `display === "check-in"` + `enrollmentLessonId` → Button `size="sm"` "Điểm danh" / pending "Đang lưu…"
    - `kind === "actionable"` + ≥2 sid trong `sessionStudents` (lớp nhóm) → Button `size="sm"` "Điểm danh" mở modal (kể cả chỉ 1 sid còn check-in)
  - 1:1 click: `void run(enrollmentLessonId, { type: "check-in", lessonId: enrollmentLessonId }, "Đã điểm danh.")`.
  - Modal: title `Điểm danh — ${formatSessionDate(session.dateISO)}`; mỗi sid một hàng (tên + Button hoặc Badge). Footer chỉ **Đóng**. **Cấm** "Điểm danh tất cả".
  - State modal giữ `session.index` (không snapshot `ClassSession`). Mỗi render: `live = sessions.find(s => s.index === modalIndex)`; tính `sessionAttendanceState(live, todayISO)`. Sid hết `check-in` → Badge, không button. Live miss → đóng modal.
  - `disabled={busy || isPending(enrollmentLessonId)}` trên mọi nút check-in. `busy` disable nút mở modal.
  - Khi nút focused bị disable: `focus()` nút Đóng (Modal trap bỏ button disabled).
  - Legacy `sessions === null`: không CTA.
  - 0 học viên / `enrollmentLessonId === null`: không button.
- a11y:
  - Xóa `onClick` / `tabIndex` / `onKeyDown` / `aria-expanded` / `cursor-pointer` trên `<tr>` (hiện `$classId.tsx:356-376`).
  - Expand **chỉ** chevron cột Chủ đề. Bỏ `tabIndex={-1}` trên chevron (hiện `:389`) để Tab tới được. Giữ `aria-expanded` + `aria-label` "Mở rộng/Thu gọn chi tiết bài học".
  - Nút điểm danh: `type="button"` + `stopPropagation` trên click **và** Enter/Space (phòng bubble tương lai).
- Non-functional:
  - Table + modal **không** gọi `useDirectKernelAction()`. Nhận `run`, `isPending`, `busy` qua props từ `ClassDetailRoute` (`$classId.tsx:64`).
  - Copy exact: `"Điểm danh"` / `"Đang lưu…"` / `"Đã điểm danh."` — khớp `dashboard.tsx:87-99`.
  - 1 POST / click. Không loop `session.rows`.
  - `$classId.tsx` vẫn `<500` dòng (chỉ thêm 3 props).

## Architecture

### Data flow (UI)

```
ClassDetailRoute
  useDirectKernelAction() → { run, isPending, busy }   // MỘT instance (cả notes)
  ClassScheduleTable({ ..., run, isPending, busy })
    todayISO = todayISOVietnam()
    state = sessionAttendanceState(s, todayISO)
    1:1 actionable → Button → run(id, check-in, "Đã điểm danh.")
    1:2+ actionable → setModalSession(s)
    SessionAttendanceModal({ session, studentById, run, isPending, busy, onClose })
      per sid check-in → run(id, check-in, "Đã điểm danh.")
```

Sau refresh, prefix sơn occurrence sớm nhất → sequential head dịch tới buổi kế (nếu buổi đó `dateISO <= today`).

### Quyết định 1:1 vs nhóm

```ts
const attendees = sessionStudents(s); // class-sessions.ts:240-248
const isGroup = attendees.length >= 2;
```

- `!isGroup` + một `check-in` sid → one-click (không mount modal).
- `isGroup` → không check-in từ row; chỉ mở modal. Trong modal, sid `display === "completed"` / `"cancelled"` / `"upcoming"` = Badge; chỉ `display === "check-in"` + `lessonId` = Button.

`upcoming` trong modal (sid chưa tới lượt vì buổi trước chưa điểm danh) → Badge "Sắp tới", không button. Tránh click sơn nhầm ngày trước.

### Pattern nút — copy từ dashboard

```tsx
<Button
  type="button"
  size="sm"
  disabled={busy || isPending(lessonId)}
  onClick={(e) => {
    e.stopPropagation();
    void run(lessonId, { type: "check-in", lessonId }, "Đã điểm danh.");
  }}
  onKeyDown={(e) => {
    if (e.key === " " || e.key === "Enter") e.stopPropagation();
  }}
>
  {isPending(lessonId) ? "Đang lưu…" : "Điểm danh"}
</Button>
```

### Modal

Reuse `Modal` (`apps/web/src/components/ui/modal.tsx:14-99`): props `open`, `onClose`, `title`, `children`, `footer`.

```tsx
<Modal
  open={session !== null}
  onClose={onClose}
  title={session ? `Điểm danh — ${formatSessionDate(session.dateISO)}` : "Điểm danh"}
  footer={
    <Button type="button" variant="secondary" size="sm" onClick={onClose}>
      Đóng
    </Button>
  }
>
  {/* roster rows */}
</Modal>
```

Không Sheet/Dialog/Drawer. Không confirm. Check-in irreversible — đúng kernel; 1:1 dashboard cũng không confirm.

Đóng modal **không** hủy POST đang chạy (giống `lesson-modal.tsx:57-61`: outcome vào toast).

### a11y — tách expand khỏi row

Trước: `<tr onClick={toggleExpand} tabIndex={0}>` + button lồng = nested interactive (`researcher-session-attendance-ux.md` §8).

Sau:

- `<tr>` chỉ semantic row. Không handler.
- Chevron: focusable, `aria-expanded`, `stopPropagation` giữ (vô hại).
- Sub-row `aria-label="Chi tiết lesson"` giữ nguyên (`$classId.tsx:442`) — contract còn assert.

## Related Code Files

- Modify: `apps/web/src/components/class-detail/class-schedule-table.tsx` — CTA, a11y, local state modal session, nhận hook props.
- Create: `apps/web/src/components/class-detail/session-attendance-modal.tsx`
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx` — truyền `run`, `isPending`, `busy` vào table (notes vẫn dùng cùng hook).
- Modify (nếu selector gãy): `apps/web/src/lib/class-detail-sessions-tab.contract.test.ts` — chevron `aria-label` / không còn `tr` `aria-expanded` nếu test có assert (hiện không assert `tr.onClick`).

Không sửa: `class-sessions.ts` (trừ khi thiếu type export — không được đổi prefix), `data-actions.ts`, server, `lesson-modal.tsx`, `dashboard.tsx`.

## Implementation Steps

1. Mở rộng props table:

   ```ts
   run: (key: string, action: KernelAction, successText: string) => Promise<void>;
   isPending: (key: string) => boolean;
   busy: boolean;
   ```

   Type `KernelAction` từ `@/lib/data-actions`. Route: `<ClassScheduleTable ... run={run} isPending={isPending} busy={busy} />`.

2. Trong table, `const todayISO = todayISOVietnam();` — **một lần** per render, không per-row `new Date()`.

3. Per session: `const attendance = sessionAttendanceState(s, todayISO);` thay `const status = sessionStatus(s)` cho cột Trạng thái. `sessionStatus` có thể bỏ nếu không còn dùng (cột cũ). Giữ `sessionStudents` cho cột Học viên.

4. Render cột Trạng thái theo Requirements. 1:1 dùng `attendance.sids.find(x => x.display === "check-in")?.enrollmentLessonId`. Cấm `info.lessonId`.
5. State `modalIndex: number | null`. Group button: `setModalIndex(s.index)`.
6. Tạo `SessionAttendanceModal`. Props: `session` (live từ `sessions.find`), `studentById` chỉ lấy `.name`, `run`, `isPending`, `busy`, `onClose`. Imports: `Modal`, `Button`, `Badge`, `formatSessionDate`, `todayISOVietnam`, `sessionAttendanceState`, `KernelAction`, types `ClassSession`/`Student`.
7. Modal rows: `studentById(sid)?.name ?? "Học viên"`. Không fallback UUID. Button chỉ khi `display === "check-in" && enrollmentLessonId`.
8. a11y: xóa handler trên `<tr>`; chevron bỏ `tabIndex={-1}`. Disable → focus Close.
9. Cấm tuyệt đối: iterate `session.rows` trong JSX; `rowsForSid[slotIndex-1]`; "Điểm danh tất cả"; hook lần 2; `toISOString().slice(0,10)`; cancel/absent; `info.lessonId` trong `run(`.
10. Contract source-parse: table/modal không match `session.rows` trong JSX; `run(` không chứa `info.lessonId`.
11. Smoke tay: lớp 1:1 start-today → button buổi đầu → toast → Badge Đã học; buổi sau (nếu ≤ today) mới hiện CTA. Lớp 1:2 mixed → modal. Buổi tương lai → chỉ Sắp tới.


## Success Criteria

- [x] 1:1 eligible sequential head: 1 click → 1 POST `check-in` → toast "Đã điểm danh." → Badge "Đã học".
- [x] Pending: nút "Đang lưu…", `disabled` khi `busy`.
- [x] 1:2+: row button mở modal; mỗi sid tối đa 1 button; không bulk.
- [x] Future / cancelled / completed / legacy / empty: 0 CTA.
- [x] `<tr>` không còn click/keyboard toggle. Chevron Tab + Enter expand.
- [x] Ghi chú lớp và điểm danh share một `pendingKey` — không 2 POST cùng lúc.
- [x] `$classId.tsx` `<500` dòng.
- [x] Diff không thêm endpoint / không sửa `lessonActionSchema`.

## Risk Assessment

| Risk | Signal | Response |
|------|--------|----------|
| Group button one-click nhầm thành check-in sid đầu | 1 click điểm danh cả lớp / sai người | `attendees.length >= 2` luôn mở modal |
| Gọi hook lần 2 | Notes + attendance pending độc lập | Props-only; grep `useDirectKernelAction` trong 2 file mới = 0 |
| Giữ `tr.onClick` + button | Click Điểm danh vừa POST vừa expand | Xóa row handler, không chỉ stopPropagation |
| `todayISOVietnam` quên → UTC slice | Buổi hôm nay bị "Sắp tới" trước 07:00 UTC | Grep `toISOString` trong table/modal = 0 |
| Modal iterate `session.rows` để list học viên | Nhiều button / sid (13 Tue rows) | Chỉ `sessionStudents` + `sessionAttendanceState.sids` |
| Check-in không undo | User bấm nhầm | 1 id / click + sequential head; không confirm (khớp dashboard) |

Assumption vỡ ("1:2 luôn cùng slotIndex"): nếu một sid không attend occurrence (`sessionStudents` filter `counts >= slotIndex`) thì sid đó không vào modal — đúng helper hiện tại, không special-case.
