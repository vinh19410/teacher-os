---
title: "Phase 1: Pure comparison & reconciliation helpers (TDD)"
status: in_progress
---

# Phase 1: Pure comparison & reconciliation helpers (TDD)

## Goal
Tạo các hàm so sánh canonical (`arePartValuesEqual`, `areTestHeadersEqual`) và các hàm thuần túy xử lý dọn nháp (`reconcilePartDraftsOnSaveSuccess`, `reconcileHeaderOnSaveSuccess`) kèm test unit đầy đủ các nhánh theo TDD.

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

## Files to Modify / Create

| File | Action | Description |
|---|---|---|
| `apps/admin/src/components/library/part-form.tsx` | modify | Export `arePartValuesEqual` và `reconcilePartDraftsOnSaveSuccess`; refactor `isPartDirty` dùng `arePartValuesEqual` |
| `apps/admin/src/components/library/test-header-form.tsx` | modify | Export `areTestHeadersEqual` và `reconcileHeaderOnSaveSuccess` |
| `apps/admin/src/components/library/part-form.test.tsx` | modify | Thêm unit tests cho `arePartValuesEqual` và `reconcilePartDraftsOnSaveSuccess` (tất cả các nhánh: bằng nhau, khác nhau, undo, slot không tồn tại, dirty=false nhưng khác snapshot) |
| `apps/admin/src/components/library/test-header-form.test.tsx` | modify | Thêm unit tests cho `areTestHeadersEqual` và `reconcileHeaderOnSaveSuccess` (khớp, khác, prev null) |

## Tasks & Steps

### Task 1.1 — Unit tests cho helpers Part (TDD RED)
- Goal: Viết unit tests mô tả chính xác hành vi của `arePartValuesEqual` và `reconcilePartDraftsOnSaveSuccess`.
- Target files: `apps/admin/src/components/library/part-form.test.tsx`.
- Steps:
  1. Thêm import `arePartValuesEqual`, `reconcilePartDraftsOnSaveSuccess`.
  2. Viết describe("arePartValuesEqual") kiểm tra:
     - 2 PartFormValue giống nhau trả về `true`.
     - 2 PartFormValue khác title/passage/questions trả về `false`.
  3. Viết describe("reconcilePartDraftsOnSaveSuccess") kiểm tra:
     - Khi `draft.value` bằng `snapshot`: xóa slot khỏi map.
     - Khi `draft.value` khác `snapshot` (người dùng gõ thêm): giữ lại draft và gán `dirty = true`.
     - Khi `draft.value` khác `snapshot` nhưng ban đầu `dirty = false`: kết quả phải giữ lại draft với `dirty = true`.
     - Khi người dùng gõ thêm rồi undo về đúng snapshot: xóa slot khỏi map.
     - Khi slot không tồn tại trong map: giữ nguyên map không đổi reference.
- Success criteria: Test file import các symbols mới và fail vì chưa implement.
- Verify: `pnpm --filter admin test part-form.test.tsx` chạy và fail với TypeError/ReferenceError (RED).

### Task 1.2 — Implement Part helpers & refactor isPartDirty (TDD GREEN)
- Goal: Implement `arePartValuesEqual`, `reconcilePartDraftsOnSaveSuccess` trong `part-form.tsx` và dùng `arePartValuesEqual` trong `isPartDirty`.
- Target files: `apps/admin/src/components/library/part-form.tsx`.
- Steps:
  1. Đổi `canonicalValue` thành `canonicalPartValue`.
  2. Export `arePartValuesEqual(a: PartFormValue, b: PartFormValue): boolean`:
     ```ts
     export function arePartValuesEqual(a: PartFormValue, b: PartFormValue): boolean {
         return canonicalPartValue(a) === canonicalPartValue(b);
     }
     ```
  3. Refactor `isPartDirty(skill, slot, saved, value)`:
     ```ts
     const baseline = saved ? partValueFromDto(saved) : emptyPartValue(skill, slot);
     return !arePartValuesEqual(baseline, value);
     ```
  4. Export `reconcilePartDraftsOnSaveSuccess`:
     ```ts
     export function reconcilePartDraftsOnSaveSuccess(
         drafts: ReadonlyMap<string, { dirty: boolean; value: PartFormValue }>,
         slot: string,
         snapshot: PartFormValue,
     ): ReadonlyMap<string, { dirty: boolean; value: PartFormValue }> {
         const currentDraft = drafts.get(slot);
         if (!currentDraft) return drafts;
         if (arePartValuesEqual(currentDraft.value, snapshot)) {
             const next = new Map(drafts);
             next.delete(slot);
             return next;
         }
         if (!currentDraft.dirty) {
             const next = new Map(drafts);
             next.set(slot, { ...currentDraft, dirty: true });
             return next;
         }
         return drafts;
     }
     ```
- Success criteria: Các tests trong Task 1.1 pass.
- Verify: `pnpm --filter admin test part-form.test.tsx` exits 0.

### Task 1.3 — Unit tests cho Header helpers (TDD RED)
- Goal: Viết unit tests mô tả hành vi của `areTestHeadersEqual` và `reconcileHeaderOnSaveSuccess`.
- Target files: `apps/admin/src/components/library/test-header-form.test.tsx`.
- Steps:
  1. Thêm import `areTestHeadersEqual`, `reconcileHeaderOnSaveSuccess`.
  2. Viết describe("areTestHeadersEqual") kiểm tra 2 header bằng nhau và khác nhau từng trường (title, description, skill, timeLimit, collection, testGroup).
  3. Viết describe("reconcileHeaderOnSaveSuccess") kiểm tra:
     - `prev` khớp `sent`: trả về `{ nextValue: fromServer, isDirty: false }`.
     - `prev` khác `sent`: trả về `{ nextValue: prev, isDirty: true }`.
     - `prev` là `null`: trả về `{ nextValue: fromServer, isDirty: false }`.
- Success criteria: Test fail do chưa có hàm (RED).
- Verify: `pnpm --filter admin test test-header-form.test.tsx` exits non-zero.

### Task 1.4 — Implement Header helpers (TDD GREEN)
- Goal: Implement `areTestHeadersEqual` và `reconcileHeaderOnSaveSuccess` trong `test-header-form.tsx`.
- Target files: `apps/admin/src/components/library/test-header-form.tsx`.
- Steps:
  1. Export `areTestHeadersEqual(a: TestHeaderFormValue, b: TestHeaderFormValue): boolean`:
     ```ts
     export function areTestHeadersEqual(
         a: TestHeaderFormValue,
         b: TestHeaderFormValue,
     ): boolean {
         return (
             a.title === b.title &&
             a.description === b.description &&
             a.skill === b.skill &&
             a.timeLimit === b.timeLimit &&
             a.collection === b.collection &&
             a.testGroup === b.testGroup
         );
     }
     ```
  2. Export `reconcileHeaderOnSaveSuccess`:
     ```ts
     export function reconcileHeaderOnSaveSuccess(
         prev: TestHeaderFormValue | null,
         sent: TestHeaderFormValue,
         fromServer: TestHeaderFormValue,
     ): { nextValue: TestHeaderFormValue | null; isDirty: boolean } {
         if (!prev || areTestHeadersEqual(prev, sent)) {
             return { nextValue: fromServer, isDirty: false };
         }
         return { nextValue: prev, isDirty: true };
     }
     ```
- Success criteria: Toàn bộ tests của `test-header-form.test.tsx` pass.
- Verify: `pnpm --filter admin test test-header-form.test.tsx` exits 0.
