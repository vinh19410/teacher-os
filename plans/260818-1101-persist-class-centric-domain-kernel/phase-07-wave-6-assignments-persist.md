---
phase: 7
title: "Wave 6 Assignments persist"
status: pending
priority: P2
effort: "1d"
dependencies: [4]
# Blocks wave 7 (shared grade-modal.tsx).
---

# Phase 7: Wave 6 Assignments persist

## Overview

Bảng `assignment` + scores. Grade persist. Gửi/nháp vẫn stub.

## Context Links

- `apps/web/src/routes/_auth/assignments/index.tsx`, `$assignmentId.tsx`
- `apps/web/src/components/modals/grade-modal.tsx:42` — chỉ dispatch scores
- "Gửi cho học viên" / "Lưu nháp" không dispatch (`$assignmentId.tsx:121-124`)
- Consumer thứ 3 (không modify): `students/$studentId.tsx:76,242-243` đọc `data.assignments` qua `a.sid`
- DAG: doc-hai với wave 4/5 nhưng **serial trên file chung**: `schema/index.ts`, mount `app.ts`/`kernel.ts`, `packages/api/src/contracts.ts`, `repos/kernel.ts`, migration journal (`migrations/meta/_journal.json`). Wave merge sau phải rebase + regenerate migration (`db:generate`) trên journal đã merge.

## Requirements

- Functional: list/detail + grade persist theo pattern wave 1–3 (reads qua kernel snapshot).
- Non-functional: không tạo bài. Không gửi/nháp. Không đụng reports. Feedback trong grade modal vẫn discarded (không cột feedback — defer wave 7 `comment_bank`; cấm thêm cột). Ghi nhận: `/assignments` trống với user thật cho đến khi có create path (không wave nào trong plan này thêm).

## Architecture

```
assignment: id, orgId (FK organization cascade + assignment_org_idx),
  studentId (FK student cascade + assignment_student_idx),
  title, type, due (text dd/mm — formatDayMonth convention),
  status ('not-submitted' | 'late' | 'graded'), scores json/null,
  createdAt timestamp default (ORDER BY như mọi domain table)
```

**Đọc (pattern wave 1–3, không phá wave-2 lock):** assignments ride kernel snapshot — `KernelSnapshot.assignments` (`packages/api/src/contracts.ts`) + `loadSnapshot` (kernel.ts) + `mapKernelSnapshot`/`KernelSlice` (`repos/kernel.ts`) + `kernel-loaded` payload (`data-store-reducer.ts`) + `emptyData.assignments`. `repos/assignments.ts` owns `mapAssignments`: `KernelAssignmentRow.studentId → Assignment.sid`, `due` giữ text dd/mm. GET `/api/assignments` list convenience tái dùng `loadSnapshot` (như `/students`, `/classes`). **Không** GET `/:id` — detail = store lookup (wave-2 resolution: reads qua store hook).

**Ghi:** POST `/api/assignments/:id/grade` `{ scores }` — MỘT UPDATE `scores` + `status='graded'`, scope `id AND orgId`. Không create endpoint. Test grade dùng helper insert, không mở stub tạo bài.

**Mount + guard:** `apps/server/src/routes/assignments/index.ts` mount qua `kernel.route("/assignments", ...)` bên trong `kernelRoutes` để inherit Origin + JSON content-type CSRF guard (`kernel.ts:38-49`); mount duy nhất `app.route("/api", ...)` trong `app.ts` không đổi. Mọi handler bắt đầu `kernelCtx` 401 guard (như `kernel.ts:265-266`).

**Contract (`packages/api/src/contracts.ts`, tạo tay Zod):** `gradeScoresSchema = z.object({ task: z.number().min(0).max(9), coherence: …, lexical: …, grammar: … }).strict()` — 4 key bắt buộc, không passthrough, KHÔNG `.int()` (IELTS half-band 6.5 phải pass; convention `.int()` trong contracts sẽ reject mọi half-band). Response `{ ok: true }` (như assign-syllabus/notes).

**Write wiring:** `repos/kernel.ts` — thêm `"grade-assignment"` vào `KERNEL_WRITE_TYPES` + case `kernelCommand` → `POST /api/assignments/${assignmentId}/grade` body `{ scores }`. `GradeModal.submit` thành async, `await dispatch(...)` trước khi close (pattern `add-student-modal.tsx:42,65`), giữ modal mở + error khi fail. Reducer case `grade-assignment` giữ nguyên làm fixture (wave 8 dọn).

## Related Code Files

- Create: `packages/db/src/schema/assignment.ts` (export qua `schema/index.ts`)
- Create: `apps/server/src/routes/assignments/index.ts` (mount trong `kernelRoutes`)
- Create: `apps/web/src/lib/repos/assignments.ts` (`mapAssignments`)
- Modify: `packages/api/src/contracts.ts` (`KernelAssignmentRow`, `KernelSnapshot.assignments`, `gradeScoresSchema`)
- Modify: `apps/server/src/routes/kernel.ts` (`loadSnapshot` + mount + GET `/api/assignments`)
- Modify: `apps/web/src/lib/repos/kernel.ts` (`KernelSlice` + `mapKernelSnapshot` + `KERNEL_WRITE_TYPES` + `kernelCommand`)
- Modify: `apps/web/src/lib/data-store-reducer.ts` (`kernel-loaded` payload + `emptyData` nếu cần)
- Modify: `apps/web/src/lib/data-provider.tsx` (widen slice type nếu cần)
- Modify: `assignments/*`, `grade-modal.tsx`
- Do not modify: `reports.tsx`, `students/$studentId.tsx` (vẫn đọc `data.assignments` qua store)

## Implementation Steps

1. Schema (đủ convention: FK cascade org/student + 2 index + `createdAt` default) + export `schema/index.ts` + migrate.
2. Contracts (`KernelAssignmentRow` + snapshot + `gradeScoresSchema` strict 0–9 float) + `loadSnapshot` + GET `/api/assignments` + POST grade (một UPDATE scores+status, org-scoped, 401 guard, mount trong kernel router).
3. `mapAssignments` (sid, due) + write wiring (`KERNEL_WRITE_TYPES` + `kernelCommand` + payload widen) + GradeModal async/await. Gửi/nháp giữ no-op.
4. Org mới: 0 assignment.
5. Server tests (harness `kernel.test.ts` buildApp + in-memory libsql + migrate thật): helper insert → POST grade → GET giữ scores + `status='graded'`; cross-org grade → 404 không mutate; Origin guard trên grade POST (403/415); half-band 6.5 pass, `10`/`"6"`/thiếu key reject.
6. Contract test pin `grade-assignment` là kernel write (mirror `kernel-runtime.contract.test.ts`) + một test chạy rows qua `mapKernelSnapshot` thật (chống wiring chết im lặng — module luôn trống ngoài test).

## Todo

- [ ] Bảng assignment (đủ convention)
- [ ] Assignments vào kernel snapshot (đọc)
- [ ] Grade persist (ghi: scores + status một UPDATE)
- [ ] Gửi/nháp no-op
- [ ] Cross-org + CSRF + half-band tests
- [ ] Quality gate

## Success Criteria

- [ ] Reload giữ scores + status graded
- [ ] Không insert assignment mới từ UI
- [ ] Quality gate xanh

## Risk Assessment

Scores shape `task/coherence/lexical/grammar` phải validate 0–9. Signal: NaN từ input. Response: Zod server-side (strict, 4 key, float — KHÔNG `.int()`), giữ check grade-modal. Risk wiring: nếu `grade-assignment` sót khỏi `KERNEL_WRITE_TYPES`, dispatch thành local no-op nhưng reducer test vẫn xanh — chống bằng contract test pin.

## Security Considerations

Grade chỉ assignment cùng org (UPDATE scope `id AND orgId`; không nhận `studentId` đổi chủ). 401 guard mỗi handler. Router mount trong kernel chain để inherit Origin/content-type CSRF guard (cookies SameSite=None). Cross-org grade test bắt buộc.

## Red Team Dispositions

Session 2026-08-19 (4 reviewers, tier Full). 13 accepted, 0 rejected — xem `plan.md` Red Team Review bảng "Wave 6 pre-implementation".
