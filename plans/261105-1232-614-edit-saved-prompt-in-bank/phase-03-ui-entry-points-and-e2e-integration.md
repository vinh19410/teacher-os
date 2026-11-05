---
title: "Phase 3: UI Entry Points & Verification"
description: "Thêm nút Chỉnh sửa ở PromptPreviewAside và preview.tsx, viết bài kiểm thử unit/integration và kiểm tra toàn diện chất lượng repo."
status: completed
---

# Phase 3: UI Entry Points & Verification

## Goal
Tạo các đường vào trực quan (nút "Chỉnh sửa") trên giao diện tại khung xem trước (`PromptPreviewAside`) và trang xem trước (`/assignments/preview`), bổ sung unit test cho toàn bộ các trường hợp cạnh và chạy kiểm tra toàn bộ chất lượng repo.

## Files to Create or Modify
- `apps/web/src/components/assignments/prompt-preview-aside.tsx`
- `apps/web/src/routes/_auth/assignments/preview.tsx`
- `apps/web/src/components/assignments/prompt-preview-aside.test.tsx` (hoặc `index.test.tsx`)
- `apps/web/src/routes/_auth/assignments/preview.test.tsx`
- `apps/web/src/routes/_auth/assignments/new.test.tsx`

## Tasks & Steps

### Task 3.1 — Nút "Chỉnh sửa" ở `PromptPreviewAside`
- **Goal:** Khi xem chi tiết một đề trong danh sách `/assignments`, aside hiển thị nút "Chỉnh sửa" bên cạnh nút "Xem trước".
- **Target files and symbols:** `apps/web/src/components/assignments/prompt-preview-aside.tsx`.
- **Steps:**
  1. Thay thế nút "Xem trước" đơn lẻ ở cuối component thành nhóm 2 nút:
     ```tsx
     <div className="mt-3 flex gap-2">
       <Button
         variant="secondary"
         className="flex-1"
         onClick={() => navigate({ to: "/assignments/preview", search: { id: prompt.id } })}
       >
         Xem trước
       </Button>
       <Button
         className="flex-1"
         onClick={() => navigate({ to: "/assignments/new", search: { promptId: prompt.id } })}
       >
         Chỉnh sửa
       </Button>
     </div>
     ```
- **Success criteria:** Aside xem trước có cả nút "Xem trước" và "Chỉnh sửa". Bấm "Chỉnh sửa" điều hướng tới `/assignments/new?promptId=<prompt.id>`.
- **Verify:**
  ```bash
  pnpm --filter web exec vitest run src/routes/_auth/assignments/index.test.tsx
  ```
  Pass condition: Test suite chạy thành công, exit code 0.

### Task 3.2 — Nút "Chỉnh sửa" ở `/assignments/preview`
- **Goal:** Khi xem đề từ ngân hàng tại `/assignments/preview?id=...`, trang hiển thị nút "Chỉnh sửa" cạnh nút "Quay lại danh sách".
- **Target files and symbols:** `apps/web/src/routes/_auth/assignments/preview.tsx`.
- **Steps:**
  1. Khi `bankPrompt` tồn tại:
     ```tsx
     <div className="flex items-center gap-2">
       <Button
         variant="secondary"
         onClick={() => navigate({ to: "/assignments" })}
       >
         Quay lại danh sách
       </Button>
       <Button
         onClick={() => navigate({ to: "/assignments/new", search: { promptId: bankPrompt.id } })}
       >
         Chỉnh sửa
       </Button>
     </div>
     ```
  2. Khi không phải `bankPrompt` (đang xem trước draft nháp): giữ nguyên nút "Quay lại soạn đề" (Task 1.2 đã đảm bảo truyền `promptId` nếu có).
- **Success criteria:** Người dùng có thể bấm "Chỉnh sửa" ngay trên trang preview để mở composer sửa đề.
- **Verify:**
  ```bash
  pnpm --filter web exec vitest run src/routes/_auth/assignments/preview.test.tsx
  ```
  Pass condition: Test suite chạy thành công, exit code 0.

### Task 3.3 — Unit & Integration Test Suite
- **Goal:** Bao phủ toàn bộ các kịch bản của tính năng chỉnh sửa đề đã lưu:
  1. Mở `/assignments/new?promptId=...` nạp đúng dữ liệu và khóa `skill`/`part`.
  2. Bấm lưu gửi action `update-assignment-prompt` với method PATCH.
  3. Bỏ qua autosave localStorage và không ghi đè bản nháp tạo mới.
  4. Đề không tồn tại hiển thị card "Không tìm thấy đề này".
  5. Đổi `type` (dạng đề) trong edit mode được cho phép.
  6. Luồng xem trước vòng tròn: New (edit) -> Preview -> Quay lại soạn đề giữ nguyên `promptId`.
- **Target files and symbols:** `apps/web/src/routes/_auth/assignments/new.test.tsx`, `apps/web/src/routes/_auth/assignments/new-submit.test.tsx`, `apps/web/src/routes/_auth/assignments/preview.test.tsx`.
- **Steps:**
  1. Thêm test case cho edit mode vào `new.test.tsx`.
  2. Thêm test case cho submit update vào `new-submit.test.tsx`.
  3. Thêm test case cho nút Chỉnh sửa và nút Quay lại vào `preview.test.tsx`.
- **Success criteria:** Toàn bộ test liên quan đến assignments pass 100%.
- **Verify:**
  ```bash
  pnpm --filter web exec vitest run src/routes/_auth/assignments/
  ```
  Pass condition: Tất cả test pass, exit code 0.

### Task 3.4 — Chạy Quality Gate toàn diện của repo
- **Goal:** Đảm bảo toàn bộ dự án tuân thủ tiêu chuẩn chất lượng (biome lint, check-types, test).
- **Target files and symbols:** Toàn bộ repository.
- **Steps:**
  1. Chạy `pnpm check` (biome formatting và linting).
  2. Chạy `pnpm check-types` (TypeScript compiler check toàn repo).
  3. Chạy `pnpm test` (vitest suite).
- **Success criteria:** Tất cả các gate chất lượng đều xanh không có lỗi.
- **Verify:**
  ```bash
  pnpm check && pnpm check-types
  ```
  Pass condition: Exit code 0, không có lỗi biome hay TypeScript.

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
