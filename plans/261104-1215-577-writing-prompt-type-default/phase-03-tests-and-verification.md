# Phase 3: Automated Testing & End-to-End Verification

## Goal

Bổ sung các test tự động bao phủ toàn diện cho cả 3 tầng (contract, server API, web UI) và xác minh toàn bộ codebase đáp ứng các tiêu chuẩn chất lượng (biome, typescript, vitest).

## Target files and symbols

- `apps/server/src/assignment-rich-text-contract.test.ts`: test cho `assignmentPromptCreateSchema`.
- `packages/ui/src/components/assignments/editor/assignment-presets.test.ts`: test cho `selectedTypeOf` và `typeOf`.
- `apps/server/src/kernel.test.ts`: test cho `POST /api/assignments/prompts`.
- `apps/server/src/routes/assignments/tests.test.ts`: test cho `PATCH /api/assignments/prompts/:id`.
- `apps/web/src/components/assignments/prompt-composer.test.tsx`: test UI cho `PromptComposer`.
- `apps/web/src/routes/_auth/assignments/new.test.tsx`: test UI cho `NewAssignmentRoute`.

## Tasks & Steps

### Task 3.1 — Contract tests và UI Presets tests
- Goal: Kiểm chứng Zod schema và helper `selectedTypeOf` hoạt động đúng theo các ca kiểm thử biên.
- Target files:
  - `apps/server/src/assignment-rich-text-contract.test.ts`
  - `packages/ui/src/components/assignments/editor/assignment-presets.test.ts`
- Steps:
  1. Trong `apps/server/src/assignment-rich-text-contract.test.ts`:
     - Test: Writing draft + `type: ""` -> parse thành công (`safeParse.success === true`).
     - Test: Writing ready + `type: ""` -> parse thất bại (`safeParse.success === false`).
     - Test: Reading draft + `type: ""` -> parse thất bại (chỉ Writing được phép để trống).
     - Test: Writing draft + type ngoài catalog (ví dụ `"unknown_type"`) -> parse thất bại.
     - Test: Writing ready + type hợp lệ (`"discuss"`) -> parse thành công.
  2. Trong `packages/ui/src/components/assignments/editor/assignment-presets.test.ts`:
     - Test: `selectedTypeOf("writing", "task2", "")` trả về `null`.
     - Test: `selectedTypeOf("writing", "task2", "discuss")` trả về object có `label: "Discuss both views"`.
     - Test: `typeOf("writing", "task2", "unknown")` vẫn trả về fallback `part.types[0]` (bảo vệ backwards compatibility).
- Success criteria: Mọi test case unit chạy qua 100%.
- Verify: `pnpm --filter server test -- assignment-rich-text-contract && pnpm --filter @teacher-os/ui test -- assignment-presets` exits 0 và in `passed`.

### Task 3.2 — Server integration tests cho POST và PATCH prompts
- Goal: Xác minh endpoint `POST /api/assignments/prompts` và `PATCH /api/assignments/prompts/:id`.
- Target files:
  - `apps/server/src/kernel.test.ts`
  - `apps/server/src/routes/assignments/tests.test.ts`
- Steps:
  1. Trong `kernel.test.ts`:
     - Test `POST /api/assignments/prompts`:
       - Gửi prompt Writing có `status: "draft"` và `type: ""` -> trả về 201 Created; assert DB row có `type === ""` và `genre === ""`.
       - Gửi prompt Writing có `status: "ready"` và `type: ""` -> trả về 400 Bad Request.
  2. Trong `apps/server/src/routes/assignments/tests.test.ts`:
     - Test `PATCH /api/assignments/prompts/:id`:
       - Tạo 1 prompt draft có `type: ""`.
       - Gửi PATCH `{ status: "ready" }` mà không gửi type -> trả về 400 Bad Request (lỗi invalid type).
       - Gửi PATCH `{ type: "opinion" }` (giữ status draft) -> trả về 200 OK.
       - Gửi PATCH `{ status: "ready", type: "opinion" }` -> trả về 200 OK.
       - Gửi PATCH `{ type: "invalid_type" }` -> trả về 400 Bad Request.
- Success criteria: Các ca kiểm thử server chạy thành công.
- Verify: `pnpm --filter server test -- kernel.test.ts tests.test.ts` exits 0 và in `passed`.

### Task 3.3 — Web component & route tests
- Goal: Xác minh UI không tự chọn dạng đề, hiển thị lỗi đúng và chặn submit.
- Target files:
  - `apps/web/src/components/assignments/prompt-composer.test.tsx`
  - `apps/web/src/routes/_auth/assignments/new.test.tsx`
- Steps:
  1. Trong `prompt-composer.test.tsx`:
     - Render `PromptComposer` với `value.skill = "writing"` và `value.type = ""` -> không có chip dạng đề nào có `aria-pressed="true"`.
     - Đổi part từ task2 sang task1 -> `onFieldChange` được gọi với `type: ""`.
     - Đổi skill từ reading sang writing -> `onFieldChange` được gọi với `type: ""`.
     - Truyền `showErrors={true}` và `errors={{ type: "Chọn dạng đề" }}` -> thông báo lỗi xuất hiện trên màn hình.
  2. Trong `new.test.tsx`:
     - Mount route `/assignments/new` -> mặc định nút "Lưu vào ngân hàng" bị disabled vì chưa chọn dạng đề.
     - Điền title + prompt, nhưng chưa chọn dạng đề -> nút "Lưu vào ngân hàng" vẫn bị disabled.
     - Chọn 1 dạng đề ("Discuss both views") -> nút "Lưu vào ngân hàng" được enable.
     - Đổi sang trạng thái "Bản nháp" khi chưa chọn dạng đề -> nút "Lưu bản nháp" được enable.
- Success criteria: Tất cả component test chạy pass.
- Verify: `pnpm --filter web test -- new.test.tsx prompt-composer.test.tsx` exits 0 và in `passed`.

### Task 3.4 — Toàn bộ kiểm tra chất lượng repository (Repo Gates)
- Goal: Đảm bảo toàn bộ workspace sạch lỗi type và format theo chuẩn của repository.
- Target files: Toàn bộ repo.
- Steps:
  1. Chạy `pnpm check` (biome check).
  2. Chạy `pnpm check-types` (typescript).
  3. Chạy unit tests chính: `pnpm --filter @teacher-os/ui test && pnpm --filter server test -- assignment-rich-text-contract kernel.test.ts tests.test.ts && pnpm --filter web test -- new.test.tsx prompt-composer.test.tsx index.test.tsx`.
- Success criteria: Toàn bộ lệnh hoàn thành với exit code 0.
- Verify: `pnpm check && pnpm check-types` exits 0.

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
