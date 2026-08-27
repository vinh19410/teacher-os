---
phase: 2
title: "SessionActionsModal — bulk hoàn thành/hủy buổi"
status: blocked
priority: P1
effort: "6-8h"
dependencies: [1]
---

# Phase 2: SessionActionsModal — bulk hoàn thành/hủy buổi

> **⏸️ DEFERRED (2026-08-27, Scope Decision ở plan.md):** requester chọn full per-occurrence edit (OQ1 option 3) — phase này KHÔNG implement trong plan này; thiết kế (đã red-team + kongming C1–C5) được giữ làm tư liệu cho plan server-side occurrence-identity kế tiếp.

## Overview

Thêm khả năng **điều chỉnh buổi học tại chỗ** cho admin/giáo viên trên tab Buổi học: một modal hành động theo buổi với 2 thao tác bulk — **Hoàn thành buổi** (fan-out `check-in`) và **Hủy buổi** (fan-out `cancel-lesson`) — targeting **sequential-head per sid**. Đây là phạm vi "điều chỉnh" trung thực với data model slot-bag hiện có (xem plan.md → Advisory Checkpoint): tab này chỉ có thẩm quyền mutation **trạng thái prefix-counted**, không phải thuộc tính row-level. *(OQ1 ĐÃ CHỐT — option 3 ⇒ chính vì thế phase này DEFERRED; toàn bộ dưới đây là tư liệu thiết kế cho plan server-side kế tiếp.)*

## Requirements

- Functional:
  - Mỗi session **có target** — `sessionActionTargets(session).length > 0`, kể cả buổi tương lai (C5; KHÔNG gate theo `attendance.kind === "actionable"` vì kind nhúng date gate) — có nút "Điều chỉnh" mở **SessionActionsModal**. CTA Điểm danh tại chỗ #91 giữ nguyên nguyên vẹn.
  - **Hoàn thành buổi**: fan-out `check-in` — đúng 1 upcoming enrollment lesson id per sid; disabled khi `!sessionIsEligibleDate(session, todayISO)` (VN date gate).
  - **Hủy buổi**: fan-out `cancel-lesson` — luôn khả dụng khi có target (không date gate); **confirm 2 bước nội bộ** liệt kê từng học viên kèm **ngày occurrence đích** (C3), nhóm riêng cho behind-head "sẽ áp dụng cho buổi [ngày] (bù buổi trễ)".
  - Modal hiển thị: ngày & giờ buổi, chủ đề, danh sách học viên ảnh hưởng (tên via `studentById`) + ngày đích từng người.
  - Không có field edit nào (topic/day/time/dur/zoom) — non-goal pin.
- Non-functional:
  - **Resolve-before-dispatch** (C4): targets chụp thành mảng local trước POST đầu tiên; không re-resolve theo props giữa chừng (bus refetch sau mỗi POST làm store repaint).
  - **Phân loại 4 bucket theo `KernelCommandResult.kind`** (C1): `refreshed` → ok; `committed` → ok + cờ stale; `outcome-unknown` → bucket riêng, kết thúc batch **bắt buộc** thêm một `refresh()` + liệt kê tên; `definite-failure` → thất bại + liệt kê tên. KHÔNG phân loại theo status 409 (client không đọc được body lỗi — `HttpError` chỉ mang status + message generic, repos/kernel.ts:214–216, kernel-load-state.ts:9–14).
  - **Một toast summary duy nhất** cuối batch (tên fail truncate "tên1, tên2, tên3 +n"); cấm per-call `reportDirectOutcome` (C4).
  - **Khóa đóng modal khi đang chạy** (precedent grade-modal.tsx:170); disable bằng **cờ batch-local** — KHÔNG dựa `busy` của route hook (CurriculumManagementSection có hook instance riêng, `busy` không phủ được).
  - Modal không gọi `useDirectKernelAction`/`dispatch` trực tiếp — mọi POST đi qua callback route-level (contract #91).

## Architecture

**Helper thuần (testable seam, trong `class-sessions.ts` — dùng được helper private cùng file):**

```ts
// class-sessions.ts — thêm export. Đặt cạnh doc comment slot-bag (dòng 311–322).
export interface SessionActionTarget {
  sid: string;
  /** Sequential-head upcoming enrollment lesson id — đúng 1 per sid. */
  lessonId: string;
  /** Prefix position của sid: completed + cancelled + 1 (luôn ≤ slotIndex nhờ gate). */
  targetSlotIndex: number;
}
/**
 * Bulk-targets cho mutation theo buổi (kongming C2/C3): CHỈ sid có trạng thái
 * "upcoming" tại occurrence đang hiển thị (gate sidStateAt === "upcoming",
 * tương đương isSequentialHead semantics). Với sid behind-head, lessonId thuộc
 * occurrence ĐẦU CHƯA ĐÁNH DẤU của sid đó (paint prefix) — caller phải surface
 * targetSlotIndex ở confirm. Không bao giờ iterate session.rows ở JSX.
 */
export function sessionActionTargets(session: ClassSession): SessionActionTarget[] {
  const stats = slotStatsBySid(session.rows);
  return sessionStudents(session)
    .filter((sid) => sidStateAt(stats.get(sid)!, session.slotIndex) === "upcoming")
    .map((sid) => {
      const lessonId = firstUpcomingLessonId(session, sid);
      if (lessonId === null) return null; // không thể xảy ra khi gate pass (logic kín), guard-type
      const entry = stats.get(sid)!;
      return { sid, lessonId, targetSlotIndex: entry.completed + entry.cancelled + 1 };
    })
    .filter((t): t is SessionActionTarget => t !== null);
}
```

**Route-level batch callback (`$classId.tsx`) — xây trên `dispatch` từ `useData()`, KHÔNG qua `run`** (precedent grade-modal.tsx:24,94,115; `run` là `Promise<void>` nuốt kết quả — use-direct-kernel-action.ts:15–26):

```ts
const runSessionBatch = async (
  targets: SessionActionTarget[],
  buildAction: (lessonId: string) => KernelAction,
): Promise<{ ok: number; stale: number; unknown: string[]; failed: string[] }> => {
  const snapshot = [...targets]; // C4: chụp local, không re-resolve
  const unknown: string[] = []; const failed: string[] = []; let ok = 0; let stale = 0;
  for (const t of snapshot) {
    const result = await dispatch(buildAction(t.lessonId)); // KernelCommandResult
    if (result.kind === "refreshed") ok += 1;
    else if (result.kind === "committed") { stale += 1; ok += 1; }
    else if (result.kind === "outcome-unknown") unknown.push(t.sid);
    else failed.push(t.sid);
  }
  if (unknown.length > 0) await refresh(); // C1: unknown → refresh bắt buộc
  // MỘT toast summary duy nhất (tên fail truncate "+n") — không đi qua reportDirectOutcome per call
  return { ok, stale, unknown, failed };
};
```

**Modal** (`session-actions-modal.tsx`): nhận `session`, `sessions` (để map `targetSlotIndex` → `dateISO` sibling cùng slot), `studentById`, `runSessionBatch`, `todayISO`, `onClose`. Confirm = **state 2 bước nội bộ** (không `window.confirm` — vô hình trong Playwright; repo không có AlertDialog primitive). Khi batch chạy: khóa đóng modal (không onClose giữa chừng), progress text "đang xử lý x/N…".

**Entry point trong `ClassScheduleTable`:** state `actionsIndex` song song `modalIndex`; tính `targets = sessionActionTargets(s)` mỗi row; nút "Điều chỉnh" (label ≠ "Điểm danh") render khi `targets.length > 0`. Cell Trạng thái: **giữ nguyên cả 2 nhánh "Điểm danh"**, wrap trong `<>…</>` Fragment, append nút mới — các regex pin #91 (`disabled={busy || isPending(`, `lessonId: checkInId`, not-match `useDirectKernelAction`/`session\.rows`) phải vẫn match.

## Related Code Files

- Create: `apps/web/src/components/class-detail/session-actions-modal.tsx`
- Modify: `apps/web/src/lib/class-sessions.ts` (export `sessionActionTargets` + `SessionActionTarget`)
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx` (`runSessionBatch` từ `dispatch`/`refresh` của `useData()`; thread xuống table → modal)
- Modify: `apps/web/src/components/class-detail/class-schedule-table.tsx` (nút "Điều chỉnh" + render modal)
- Modify: `apps/web/src/lib/kernel-runtime.contract.test.ts` (pin callback-threading cho modal mới + non-goal pins)
- Delete: không

## Implementation Steps

1. Viết unit tests TRƯỚC cho `sessionActionTargets` (xem danh sách case ở phase 3 — tests-first cho helper thuần), rồi implement helper trong `class-sessions.ts` (đặt sau `firstUpcomingLessonId`, dòng ~342).
2. Viết `runSessionBatch` ở `$classId.tsx` trên `dispatch` + `refresh` từ `useData()` (đúng signature ở Architecture); một toast summary cuối.
3. Viết `session-actions-modal.tsx`: info buổi + danh sách targets (tên + ngày đích; nhóm behind-head riêng khi `targetSlotIndex < session.slotIndex`); Hoàn thành disabled khi chưa eligible; Hủy mở confirm 2 bước → `runSessionBatch`; khóa modal khi chạy.
4. `ClassScheduleTable`: thêm `actionsIndex` state; tính `sessionActionTargets(s)` per row; nút "Điều chỉnh" theo Fragment wrap (xem Architecture); render `<SessionActionsModal>` với live re-resolve session theo index (pattern `modalSession` dòng 133–135).
5. Cập nhật `kernel-runtime.contract.test.ts`: pin modal nhận callback props (không import `useDirectKernelAction`/`dispatch`), pin không có input/select topic/dur/zoom/day/time trong file modal, pin các regex #91 vẫn match sau restructure.
6. Gates: `pnpm check && pnpm test && pnpm check-types`.

## Success Criteria

- [ ] Session có target (1:1, group, tương lai) mở modal; buổi hết target (tất cả sid settled) không có nút.
- [ ] Targeting: đúng 1 id/sid; sid đã settled tại occurrence này bị exclude (unit test); behind-head có `targetSlotIndex < slotIndex` được group riêng ở confirm kèm ngày đích.
- [ ] Hoàn thành tôn trọng VN date gate; Hủy không date gate, confirm liệt kê tên + ngày.
- [ ] Batch: targets local snapshot; 4 bucket đúng kind; unknown → refresh + tên; MỘT toast; modal khóa khi chạy; không per-call toast.
- [ ] Contract test: modal không tự gọi hooks; không field edit; không action type mới; regex #91 vẫn match.
- [ ] Gates xanh.

## Risk Assessment

**Risk 1 (HIGH): Sequential head trôi giữa các POST.** Bus refetch sau mỗi POST → store repaint → resolve lazy sẽ trôi target.
- Signal: POST trùng id / badge buổi khác thay đổi.
- Response: C4 — targets là mảng local chụp trước loop; review closure trong `runSessionBatch`; unit test chụp snapshot.

**Risk 2 (HIGH): Bulk-cancel phá attendance đã ghi.**
- Signal: học viên đã "Đã học" bị "Đã hủy".
- Response: gate `sidStateAt === "upcoming"` loại sid đã settled tại occurrence này; confirm liệt kê đúng người + ngày đích (C3).

**Risk 3 (HIGH): Báo thành công giả.**
- Signal: summary "N/N" trong khi badge không đổi.
- Response: C1 buckets; unknown ≠ success; toast liệt kê tên fail; e2e partial-failure mock nếu feasible.

**Risk 4 (MEDIUM): Nút mới vỡ regex pin #91 / e2e count "Điểm danh".**
- Signal: kernel-runtime.contract.test / class-operations.spec fail sau restructure.
- Response: Fragment wrap giữ nguyên 2 nhánh cũ; label ≠ "Điểm danh"; cập nhật assertion cùng commit.

**Risk 5 (MEDIUM): N×(POST + full snapshot GET) chậm với lớp đông.**
- Signal: modal treo "đang xử lý" hàng chục giây với ~15 học viên.
- Response: progress text x/N; khóa modal; documented Known Limitation; server batch = Roadmap.

**Risk 6 (LOW): Modal file phình.**
- Response: targeting ở helper thuần; batch callback mỏng ở route; UI = info + list + 2 nút + confirm state.
