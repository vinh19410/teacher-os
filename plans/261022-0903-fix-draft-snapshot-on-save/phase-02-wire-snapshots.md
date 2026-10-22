---
title: "Phase 2: Wire snapshot into PartForm and $testId route"
status: done
---

# Phase 2: Wire snapshot into PartForm and $testId route

## Goal
Tích hợp snapshot vào `PartForm.handleSave` và các mutation hooks trong `apps/admin/src/routes/_auth/library/tests/$testId.tsx`, đảm bảo người dùng gõ thêm ký tự trong lúc lưu part hoặc lưu header không bao giờ bị mất dữ liệu và `useBlocker` cảnh báo chính xác.

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

## Files to Modify

| File | Action | Description |
|---|---|---|
| `apps/admin/src/components/library/part-form.tsx` | modify | Cập nhật kiểu `onSave: (input: LibraryPartInput, snapshot: PartFormValue) => Promise<unknown>` và truyền `value` vào `onSave(built.input, value)` |
| `apps/admin/src/routes/_auth/library/tests/$testId.tsx` | modify | Nối `snapshot` vào `savePartMutation`; dùng `reconcilePartDraftsOnSaveSuccess` trong `onSuccess`; cập nhật `headerMutation.onSuccess` dùng functional updater và `reconcileHeaderOnSaveSuccess`; thay `JSON.stringify` của `headerDirty` bằng `areTestHeadersEqual` |

## Tasks & Steps

### Task 2.1 — Cập nhật PartForm onSave signature & snapshot
- Goal: `PartForm` truyền `(built.input, value)` cho caller khi submit lưu part.
- Target files: `apps/admin/src/components/library/part-form.tsx`.
- Steps:
  1. Trong `PartFormProps`:
     ```ts
     onSave: (
         input: LibraryPartInput,
         snapshot: PartFormValue,
     ) => Promise<unknown>;
     ```
  2. Trong `handleSave`:
     ```ts
     await onSave(built.input, value);
     ```
- Success criteria: `PartForm` truyền đúng đối số snapshot cho `onSave`.
- Verify: `pnpm --filter admin test part-form.test.tsx` exits 0.

### Task 2.2 — Cập nhật $testId.tsx nối snapshot và dọn nháp an toàn
- Goal: Nối snapshot vào `savePartMutation`, dọn nháp an toàn cho part & header, không ghi đè dữ liệu đang gõ thêm.
- Target files: `apps/admin/src/routes/_auth/library/tests/$testId.tsx`.
- Steps:
  1. Import `reconcilePartDraftsOnSaveSuccess` từ `@/components/library/part-form` (chú ý: không import thừa `arePartValuesEqual` vì logic so sánh đã nằm bên trong helper).
  2. Import `areTestHeadersEqual`, `reconcileHeaderOnSaveSuccess` từ `@/components/library/test-header-form`.
  3. Cập nhật `headerDirty`:
     ```ts
     const headerDirty =
         headerValue !== null &&
         savedHeader !== null &&
         !areTestHeadersEqual(headerValue, savedHeader);
     ```
  4. Cập nhật `headerMutation.onSuccess`:
     ```ts
     onSuccess: (updated, variables) => {
         toast.success("Đã lưu thông tin bộ đề.");
         setHeaderValue((prev) => {
             const result = reconcileHeaderOnSaveSuccess(
                 prev,
                 variables,
                 headerFromDetail(updated),
             );
             if (!result.isDirty) {
                 headerDirtyRef.current = false;
             }
             return result.nextValue;
         });
         void refresh();
     },
     ```
  5. Cập nhật `savePartMutation`:
     ```ts
     const savePartMutation = useMutation({
         mutationFn: ({
             slot,
             input,
         }: {
             slot: string;
             input: LibraryPartInput;
             snapshot: PartFormValue;
         }) => upsertLibraryPart(testId, slot, input),
         onSuccess: async (_data, variables) => {
             const label =
                 slots.find((entry) => entry.part === variables.slot)?.label ??
                 variables.slot;
             toast.success(`Đã lưu ${label}.`);
             setDrafts((previous) =>
                 reconcilePartDraftsOnSaveSuccess(
                     previous,
                     variables.slot,
                     variables.snapshot,
                 ),
             );
             await refresh();
         },
         onError: (error) => {
             if (isHttpError(error) && error.status === 400) {
                 toast.error("Nội dung part chưa hợp lệ — kiểm tra các trường lỗi.");
                 return;
             }
             toast.error(libraryErrorMessage(error));
         },
     });
     ```
  6. Trong JSX tại `<PartForm>`:
     Giữ nguyên `saving={savePartMutation.isPending}` để không đổi UX behavior.
     Cập nhật prop `onSave`:
     ```tsx
     onSave={(input, snapshot) =>
         savePartMutation.mutateAsync({ slot: currentSlot, input, snapshot })
     }
     ```
- Success criteria: `$testId.tsx` compile sạch, type check không lỗi.
- Verify: `pnpm --filter admin check-types` exits 0.

### Task 2.3 — Toàn bộ Verification & Quality Gates
- Goal: Chạy toàn bộ test suites và lint checks để khẳng định không có regression.
- Steps:
  1. `pnpm --filter admin test` exits 0 với 75+ tests passed.
  2. `pnpm check` exits 0.
  3. `pnpm check-types` exits 0.
  4. `pnpm --filter admin build` exits 0.
- Success criteria: Toàn bộ các lệnh kiểm tra đều trả về mã 0.
- Verify:
  - `pnpm --filter admin test` exits 0
  - `pnpm check` exits 0
  - `pnpm check-types` exits 0
  - `pnpm --filter admin build` exits 0
