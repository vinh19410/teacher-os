---
title: "Phase 1: Contracts & Preview Round-Trip"
description: "Cập nhật PreviewDraft interface và validator, validateSearch của route /assignments/new, và điều hướng quay lại từ /assignments/preview."
status: completed
---

# Phase 1: Contracts & Preview Round-Trip

## Goal
Bổ sung `promptId` vào hợp đồng `PreviewDraft`, cho phép lưu và nạp lại trạng thái đang chỉnh sửa khi chuyển tiếp giữa `/assignments/new` và `/assignments/preview`, đồng thời cấu hình router nhận `promptId` chuẩn hóa.

## Files to Create or Modify
- `apps/web/src/lib/assignment-preview-draft.ts`
- `apps/web/src/routes/_auth/assignments/preview.tsx`
- `apps/web/src/lib/assignment-preview-draft.test.ts` (nếu có, hoặc tạo test mới)

## Tasks & Steps

### Task 1.1 — Bổ sung `promptId` vào `PreviewDraft` và validator
- **Goal:** `PreviewDraft` lưu được `promptId?: string`, và hàm `isPreviewDraft` chấp nhận field tùy chọn này mà không làm hỏng các draft hiện hành.
- **Target files and symbols:** `apps/web/src/lib/assignment-preview-draft.ts` (`PreviewDraft`, `isPreviewDraft`).
- **Steps:**
  1. Thêm `promptId?: string;` vào interface `PreviewDraft`.
  2. Cập nhật hàm `isPreviewDraft`: nếu `v.promptId !== undefined`, kiểm tra `typeof v.promptId === "string"`. Nếu không phải string thì trả về false (hoặc bỏ qua field không hợp lệ).
- **Success criteria:** `PreviewDraft` có kiểu `promptId?: string` và parse an toàn cả payload có lẫn không có `promptId`.
- **Verify:** Chạy lệnh vitest cho preview draft:
  ```bash
  pnpm --filter web exec vitest run src/lib/assignment-preview-draft.test.ts
  ```
  Pass condition: Lệnh chạy thành công, exit code 0.

### Task 1.2 — Cập nhật nút "Quay lại soạn đề" trên `/assignments/preview`
- **Goal:** Khi người dùng bấm "Quay lại soạn đề" từ bản nháp xem trước có mang `promptId`, router điều hướng quay lại `/assignments/new` kèm search param `promptId`.
- **Target files and symbols:** `apps/web/src/routes/_auth/assignments/preview.tsx`.
- **Steps:**
  1. Tại các vị trí navigate về `/assignments/new` (nút "Quay lại soạn đề" và nút trên breadcrumb/empty card nếu có), kiểm tra `draft.promptId`.
  2. Nếu có `draft.promptId`, truyền `search: { promptId: draft.promptId }`. Ngược lại không truyền `search`.
- **Success criteria:** Nút "Quay lại soạn đề" giữ nguyên `promptId` khi draft được khởi tạo từ chế độ chỉnh sửa.
- **Verify:**
  ```bash
  pnpm --filter web exec vitest run src/routes/_auth/assignments/preview.test.tsx
  ```
  Pass condition: Tất cả các test trong `preview.test.tsx` pass, exit code 0.

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
