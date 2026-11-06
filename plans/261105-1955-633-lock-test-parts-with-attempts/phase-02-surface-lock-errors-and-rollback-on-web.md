---
phase: 2
title: "Thông báo lỗi và rollback state ở web"
status: done
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Thông báo lỗi và rollback state ở web

## Goal

Khi người dùng thao tác gán hoặc gỡ part trên bộ đề đã bị khóa ở server, giao diện hiển thị câu thông báo lỗi chuyên biệt hướng dẫn rõ ràng (qua `useKernelFormSubmit` và `submit.error`), đồng thời `TestBuilderShell` khôi phục (`rollback`) lại trạng thái gán part trước đó để đảm bảo màn hình luôn phản ánh trung thực dữ liệu trên máy chủ.

## Files to Create / Modify

- `apps/web/src/lib/use-kernel-form-submit.ts`: Thêm ánh xạ cho `ASSIGNMENT_TEST_ERROR_CODES.PARTS_LOCKED` trong hàm `lockFailureMessage`.
- `apps/web/src/lib/use-kernel-form-submit.test.tsx`: Thêm ca kiểm thử kiểm tra thông báo lỗi khi server trả về `TEST_PARTS_LOCKED`.
- `apps/web/src/components/assignment-tests/test-builder-shell.tsx`: Cập nhật `persistParts`, `handleAssign`, `handleRemoveSlot` để rollback state `assigned`, `overrides` và khôi phục `slotDrafts` nếu thao tác lưu thất bại.
- `apps/web/src/components/assignment-tests/test-builder-shell.test.tsx`: Thêm test kiểm tra hiển thị thông báo lỗi và hành vi rollback state khi `set-assignment-test-parts` trả `definite-failure`.

## Tasks & Steps

### Task 2.1 — TDD Red: Viết test cho useKernelFormSubmit và rollback trong TestBuilderShell
- Goal: Bộ test cho hook và component xác nhận lỗi khóa part được hiển thị và state được hoàn nguyên.
- Target files:
  - `apps/web/src/lib/use-kernel-form-submit.test.tsx`
  - `apps/web/src/components/assignment-tests/test-builder-shell.test.tsx`
- Steps:
  1. Trong `use-kernel-form-submit.test.tsx`, thêm ca test dispatch trả về `definite-failure` với `code: ASSIGNMENT_TEST_ERROR_CODES.PARTS_LOCKED`:
     Kỳ vọng `latest.current?.error` nhận câu thông báo:
     `"Bộ đề đã có học viên làm bài nên không thể thay đổi hoặc gỡ part. Bạn vẫn có thể đổi tên, thời gian và trạng thái bộ đề. Muốn thay đổi đề, hãy tạo bộ đề mới."`
  2. Trong `test-builder-shell.test.tsx`, thêm các ca test ở chế độ `mode="edit"`:
     - Giả lập `submitFixture.run` trả về `{ kind: "definite-failure", status: 409, error: new HttpError(409, "locked", { code: "TEST_PARTS_LOCKED" }) }`.
     - Ca 1 (gỡ part bị từ chối): Bấm nút "Gỡ khỏi test" trên slot đã gán -> slot đó vẫn hiển thị là đã gán sau khi bị từ chối, `submitFixture.run` được gọi đúng payload.
     - Ca 2 (gán part bị từ chối): Bấm chọn một prompt khác từ ngân hàng cho slot -> slot hoàn nguyên về promptId cũ khi bị từ chối.
     - Ca 3 (committed / outcome-unknown): Giả lập `submitFixture.run` trả về `{ kind: "outcome-unknown" }` -> không rollback state trên UI (chờ reconcile).
- Success criteria: Test mới biên dịch được và fail (Red phase) do message chưa map và chưa có cơ chế rollback.
- Verify: `pnpm --filter web test -- use-kernel-form-submit.test.tsx test-builder-shell.test.tsx` thoát với mã lỗi khác 0 do assertion failure.

### Task 2.2 — Ánh xạ thông báo lỗi cho TEST_PARTS_LOCKED trong use-kernel-form-submit.ts
- Goal: Hook cung cấp thông báo rõ ràng khi gặp mã lỗi `TEST_PARTS_LOCKED`.
- Target files: `apps/web/src/lib/use-kernel-form-submit.ts`
- Steps:
  1. Import `ASSIGNMENT_TEST_ERROR_CODES` từ `@teacher-os/api/contracts`.
  2. Trong hàm `lockFailureMessage(error: unknown)`:
     Thêm case:
     ```ts
     case ASSIGNMENT_TEST_ERROR_CODES.PARTS_LOCKED:
       return "Bộ đề đã có học viên làm bài nên không thể thay đổi hoặc gỡ part. Bạn vẫn có thể đổi tên, thời gian và trạng thái bộ đề. Muốn thay đổi đề, hãy tạo bộ đề mới.";
     ```
- Success criteria: Khi lỗi có `code === "TEST_PARTS_LOCKED"`, `lockFailureMessage` trả về câu thông báo trên.
- Verify: `pnpm --filter web test -- use-kernel-form-submit.test.tsx` thoát với mã 0.

### Task 2.3 — Triển khai Rollback state trong test-builder-shell.tsx
- Goal: Không để UI bị lệch khi server từ chối ghi parts.
- Target files: `apps/web/src/components/assignment-tests/test-builder-shell.tsx`
- Steps:
  1. Điều chỉnh `persistParts`:
     Nhận thông tin rollback theo từng part (`part`, `promptId`, `override`), sử dụng functional updater để không ghi đè trạng thái của các part khác nếu có thao tác đồng thời:
     ```tsx
     async function persistParts(
       nextAssigned: Record<string, string | null>,
       rollback: {
         part: string;
         promptId: string | null;
         override?: number | null;
       },
     ) {
       if (mode !== "edit" || !test) return;
       const result = await submit.run({
         type: "set-assignment-test-parts",
         testId: test.id,
         parts: partsSetPayload(header.skill, nextAssigned, overrides),
       });
       if (result === null || result.kind === "definite-failure") {
         setAssigned((current) => ({
           ...current,
           [rollback.part]: rollback.promptId,
         }));
         if (rollback.override !== undefined) {
           setOverrides((current) => ({
             ...current,
             [rollback.part]: rollback.override ?? null,
           }));
         }
       }
     }
     ```
  2. Cập nhật `handleAssign`:
     Chụp lại `prevPromptId = assigned[part] ?? null` trước khi update, truyền vào `persistParts`:
     `void persistParts(next, { part, promptId: prevPromptId });`
  3. Cập nhật `handleRemoveSlot`:
     Chụp lại `prevPromptId = assigned[part] ?? null` và `prevOverride = overrides[part] ?? null` trước khi update, truyền vào `persistParts`:
     `void persistParts(next, { part, promptId: prevPromptId, override: prevOverride });`
- Success criteria: Giao diện hoàn nguyên slot khi request bị từ chối; giữ nguyên khi `refreshed` hoặc khi rơi vào trạng thái cần reconcile (`committed`/`outcome-unknown`).
- Verify: `pnpm --filter web test -- test-builder-shell.test.tsx` thoát với mã 0 (Green phase).

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
