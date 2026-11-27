---
phase: 1
title: "Phase 1: Shared API Contracts"
status: pending
priority: P1
effort: "15m"
dependencies: []
---

# Phase 1: Shared API Contracts

## Goal
Bổ sung metadata bộ đề tự học (optional/nullable, tương thích ngược) vào `studentAssignmentSchema` trong `packages/api/src/contracts.ts`.

## Files to Create / Modify
- Modify: `packages/api/src/contracts.ts` (`studentAssignmentSchema`)

## Tasks & Steps

### Task 1.1 — Mở rộng `studentAssignmentSchema` với metadata bộ đề tự học
- Goal: `StudentAssignment` mang đủ thông tin phân loại và sắp xếp bộ đề tự học mà không phá client/fixture cũ.
- Target files and symbols: `packages/api/src/contracts.ts` (symbol `studentAssignmentSchema`, khoảng dòng 2610–2633).
- Steps:
  1. Đọc `studentAssignmentSchema` tại `packages/api/src/contracts.ts`.
  2. Thêm 6 trường optional/nullable vào `studentAssignmentSchema`:
     - `classStudyPackId: z.string().nullable().optional()`
     - `studyPackTitle: z.string().nullable().optional()`
     - `studyPackStatus: z.enum(["active", "cancelled"]).nullable().optional()`
     - `availableAt: z.string().nullable().optional()`
     - `studyPackDayIndex: z.number().int().positive().nullable().optional()`
     - `studyPackPosition: z.number().int().min(0).nullable().optional()`
  3. Giữ nguyên toàn bộ trường hiện có của `studentAssignmentSchema`.
- Success criteria: `studentAssignmentSchema.parse(...)` chấp nhận cả payload cũ lẫn payload mới có đầy đủ 6 trường bộ đề tự học, và reject giá trị sai kiểu (ví dụ `studyPackDayIndex: 0` hoặc `studyPackStatus: "other"`).
- Verify: `pnpm --filter @teacher-os/api check-types && pnpm --filter @teacher-os/api test` exits 0 with all API tests passing.

## Todo
- [ ] Task 1.1: Mở rộng `studentAssignmentSchema` trong `packages/api/src/contracts.ts`

## Verification
- `pnpm --filter @teacher-os/api check-types && pnpm --filter @teacher-os/api test`

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
