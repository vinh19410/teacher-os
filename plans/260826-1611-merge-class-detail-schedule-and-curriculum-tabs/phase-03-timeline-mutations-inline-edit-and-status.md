---
title: "Phase 3: Timeline mutations inline edit and status"
status: todo
priority: P1
effort: "1-1.5d"
dependencies: [2]
---

# Phase 3: Timeline mutations inline edit and status

> **⚠️ SUPERSEDED (một phần) — 2026-08-27** bởi [`plans/260827-0941-session-actions-bo-cot-hoc-vien-tab-buoi-hoc`](../260827-0941-session-actions-bo-cot-hoc-vien-tab-buoi-hoc/plan.md):
> Phần **inline topic edit** bị hủy — thiết kế `handleEditTopic` fan-out cùng topic cho toàn bộ `session.rows` ghi **nhầm occurrence** (`sessionTopic()` phân phối edited topics theo first-appearance trên cả slot-bag, class-sessions.ts:256–269; edit buổi k hiện lên buổi 1). Phần **status mutations** được thay bằng **SessionActionsModal** (bulk hoàn thành/hủy với sequential-head gate per sid + confirm liệt kê ngày đích) trong plan mới. Red-team 3 reviewer + kongming advisory xác nhận (session 2026-08-27).

# ⚠️ HIGH-RISK PHASE — semantics phải pin trước khi code

Đây là phase rủi ro nhất trong plan (theo kongming advisory). Có 2 semantic ambiguity phải pin trước khi bắt đầu:

1. **Inline edit topic ghi vào đâu?** → **`row.topic` per-occurrence override** (không ghi `SyllabusLesson.title`). Lý do: comment file `class-sessions.ts:253` ghi rõ "Render-only: syllabus titles are never written back to `lesson.topic`". User muốn đổi title chung của lesson vẫn dùng modal Edit Lesson trong khu Quản lý giáo trình.
2. **Status dropdown fan-out semantics** → dropdown chỉ đổi rows có state hiện tại là `upcoming` sang `completed`/`cancelled`. Rows đã `absent`/`completed`/`cancelled` khác giữ nguyên (để bảo vệ attendance data đã ghi). Nếu tất cả rows đã ở state khác → dropdown disabled với tooltip giải thích.

## Overview

Cho phép user (a) inline edit title lesson trực tiếp trên row session, (b) đổi status session (upcoming → completed/cancelled) qua dropdown fan-out cho tất cả rows chưa có state đích.

## Requirements

- [ ] Click title lesson trong cột "Chủ đề" → chuyển thành `<input>` editable (auto-focus + select).
- [ ] Enter → save qua kernel action `lesson-edit` với payload đầy đủ 5 fields (day, time, dur, topic, zoom) — lấy 4 field còn lại từ lesson row hiện tại, thay `topic` bằng giá trị mới.
- [ ] Escape → hủy edit, restore text cũ.
- [ ] Blur → save (giống Enter) để tránh mất thay đổi.
- [ ] Nếu topic mới = topic cũ → không dispatch action.
- [ ] Fan-out: nếu session có N lesson rows (N học viên), edit áp cho **tất cả N rows** tại cùng occurrence index để giữ `sessionTopic()` invariant "edited topic distribute per-slot-index".
- [ ] Status dropdown ở cột "Trạng thái" (thay Badge read-only hiện tại) — 3 options: `Upcoming`, `Completed`, `Cancelled`.
- [ ] Chọn `Completed` → dispatch `check-in { lessonId }` cho từng lesson row của session có state hiện tại là `upcoming`.
- [ ] Chọn `Cancelled` → dispatch `cancel-lesson { lessonId }` cho từng lesson row upcoming.
- [ ] Chọn `Upcoming` khi session đang ở state khác → **disabled** (không undo được qua kernel action hiện có; giữ cẩn trọng).
- [ ] Confirm dialog trước khi bulk-cancel session (destructive action, không undo dễ).
- [ ] Toast/inline notification sau mỗi thao tác.

## Architecture

**Inline edit component**
- Tạo `<EditableLessonTitle>` nhỏ: nhận `value`, `onSave(newValue)`, render `<span>` hoặc `<input>` tùy `isEditing` state.
- State điều khiển local trong row (không dùng expandedIdx state).
- Handler `handleEditTopic(session, newTopic)`:
  ```ts
  const rows = session.rows; // ClassLesson[]
  for (const row of rows) {
    if (row.topic === newTopic) continue;
    await dispatch({
      type: "lesson-edit",
      lessonId: row.id,
      payload: {
        day: row.day, time: row.time, dur: row.dur,
        topic: newTopic, zoom: row.zoom,
      },
    });
  }
  ```
- Batch dispatch nếu kernel support; nếu không, dispatch tuần tự + await.

**Status dropdown**
- Reuse `<Select>` từ `apps/web/src/components/ui/select.tsx`.
- Value = kết quả `sessionStatus(session)`.
- Handler `handleChangeStatus(session, newStatus)`:
  ```ts
  const action = newStatus === "completed" ? "check-in" : "cancel-lesson";
  for (const row of session.rows) {
    const state = sidStateAt(...); // reuse from class-sessions.ts
    if (state !== "upcoming") continue;
    await dispatch({ type: action, lessonId: row.id });
  }
  ```
- Với `cancelled` → show confirm dialog trước.

**Data invalidation**
- Sau mỗi dispatch, `useData()` context tự refresh (theo pattern hiện tại của `useKernelFormSubmit`). Verify không cần thêm invalidation.

## Related Code Files

- Create: `apps/web/src/components/class-detail/editable-lesson-title.tsx`
- Create: `apps/web/src/components/class-detail/session-status-select.tsx`
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx` — `ClassScheduleTable` dùng 2 component mới thay text/Badge cũ.
- Modify: `apps/web/src/lib/class-sessions.ts` — expose helper `sidStateAt` nếu chưa export (đang dùng nội bộ trong `sessionStatus`).

## Implementation Steps

1. Export `sidStateAt` từ `class-sessions.ts` nếu chưa (hoặc viết wrapper `sessionCanTransitionTo(session, newStatus)`).
2. Tạo `editable-lesson-title.tsx`: input + save/cancel/blur + Enter/Escape.
3. Trong `ClassScheduleTable`, thay `sessionLessonInfo().title` render bằng `<EditableLessonTitle value={info.title} onSave={t => handleEditTopic(session, t)}>`.
4. Handler `handleEditTopic`: fan-out `lesson-edit` cho từng row. Confirm topic invariant vẫn giữ (test bằng cách render lại `sessionTopic()` sau edit).
5. Tạo `session-status-select.tsx`: Select 3 options + confirm dialog cho cancelled.
6. Handler `handleChangeStatus`: fan-out `check-in`/`cancel-lesson` cho rows upcoming.
7. Toast success/error (dùng existing toast lib nếu có).
8. Verify legacy fallback không nhận mutations (giữ Badge read-only).
9. Manual QA: edit topic → refresh page → thấy topic mới. Đánh dấu 1 session done → sessionStatus() trả completed.
10. Test: viết 2-3 unit test cho handlers (mock dispatch, verify calls).

## Todo

- [ ] Export `sidStateAt` (hoặc viết wrapper transition helper)
- [ ] Tạo `editable-lesson-title.tsx` (Enter/Escape/blur)
- [ ] Handler `handleEditTopic` fan-out `lesson-edit` cho tất cả rows session
- [ ] Tích hợp vào cột "Chủ đề" trong `ClassScheduleTable`
- [ ] Tạo `session-status-select.tsx` (3 options + confirm dialog)
- [ ] Handler `handleChangeStatus` fan-out `check-in`/`cancel-lesson` cho rows upcoming
- [ ] Toast notifications
- [ ] Legacy fallback giữ Badge read-only
- [ ] Manual QA end-to-end (edit topic + status + refresh)
- [ ] Unit test 2-3 handler cases

## Success Criteria

- [ ] Click title → input, Enter save qua kernel, Escape cancel, blur save.
- [ ] Edit topic áp cho tất cả rows session, `sessionTopic()` trả về topic mới sau refresh.
- [ ] Status dropdown fan-out đúng: chỉ đổi rows upcoming, giữ absent/completed/cancelled khác.
- [ ] Confirm dialog xuất hiện trước khi cancel session.
- [ ] `sessionStatus(session)` sau bulk check-in trả về `completed` (do tất cả rows upcoming đã completed).
- [ ] Toast hiển thị success/error.
- [ ] Legacy fallback không có mutations.
- [ ] Không có kernel action mới được thêm vào `data-actions.ts` (verify bằng diff).

## Risk Assessment

**Risk 1** (HIGH): Fan-out `lesson-edit` sai — quên 1 field trong payload 5 fields → reset field đó về "".
- Signal: Sau edit topic, `zoom` link biến mất, hoặc `dur` reset về 0.
- Response: Luôn spread row hiện tại, chỉ override `topic`. Viết test verify 4 fields khác giữ nguyên.

**Risk 2** (HIGH): Bulk-cancel session vô ý phá attendance data của học viên đã completed.
- Signal: 1 học viên vừa được đánh check-in bị đổi thành cancelled.
- Response: Confirm dialog + filter chỉ áp cho `state === "upcoming"` (đã trong requirements).

**Risk 3**: Race condition khi user edit topic nhanh liên tiếp — dispatch cũ chưa refresh xong đã dispatch mới.
- Signal: Topic hiển thị nhấp nháy giữa 2 giá trị.
- Response: Disable input trong khi đang dispatch (`isSaving` state).

**Risk 4**: Confirm dialog UX rườm rà khi user thao tác nhanh (bulk mark done nhiều session).
- Signal: User complain "cứ hỏi confirm hoài".
- Response: Chỉ confirm cho `cancelled` (destructive), không confirm cho `completed`.

**Risk 5** (MEDIUM): Progress bar khu Quản lý không nhích sau khi đánh dấu session completed → user tưởng bug.
- Signal: Session status = completed nhưng `syDone/syLessons` vẫn 3/10.
- Response: Đã note trong plan constraints — 2 hệ status khác nhau. Thêm tooltip trên progress bar: "Tiến độ giáo trình dựa trên trạng thái từng bài giảng; đánh dấu buổi học không thay đổi tiến độ giáo trình." Đủ mà không cần thay đổi kiến trúc.
