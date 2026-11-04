# Phase 3: Kiểm thử tương tác và xác minh chất lượng

## Goal
Cập nhật toàn bộ các bài unit test hiện hữu (trước đây giả định nút submit mang thuộc tính `disabled`), bổ sung bộ test tương tác `new-submit.test.tsx` (jsdom) để xác minh hành vi submit bị chặn, alert xuất hiện, focus trường lỗi; và chạy toàn bộ quality gates.

## Target files and symbols
- `apps/web/src/routes/_auth/assignments/new.test.tsx`:
  - Cập nhật các test cũ kiểm tra `submit?.[0]).toMatch(/\sdisabled=/)`: đổi thành `not.toMatch(/\sdisabled=/)`.
- `apps/web/src/routes/_auth/assignments/new-submit.test.tsx` (file mới):
  - Bộ test jsdom sử dụng `@testing-library/react` (`render`, `fireEvent`).
  - Mock `scrollIntoView`.
  - Test case: bấm Save trên form trắng -> không gọi `submit.run`, hiển thị `role="alert"` với danh sách lỗi, focus vào trường đầu tiên (`assignment-field-type`).
  - Test case: bấm Save khi dữ liệu hợp lệ -> gọi `submit.run` 1 lần.
  - Test case: click vào item trong danh sách lỗi -> gọi focus vào trường tương ứng.

## Tasks & Steps

### Task 3.1 — Cập nhật các test case cũ của new.test.tsx
- **Goal:** Cập nhật các khẳng định `toMatch(/\sdisabled=/)` sang `not.toMatch(/\sdisabled=/)`.
- **Target files:** `apps/web/src/routes/_auth/assignments/new.test.tsx`
- **Steps:**
  1. Cập nhật test "renders design v5 structure with 4 skills and a blank form" (dòng 69):
     - `expect(submit?.[0]).not.toMatch(/\sdisabled=/)`
  2. Cập nhật test "blocks save for a restored diagram-ready draft missing its image (#269)" (dòng 355):
     - `expect(submit?.[0]).not.toMatch(/\sdisabled=/)`
  3. Cập nhật test "blocks save for a restored draft missing type when in ready status (#577)" (dòng 387):
     - `expect(submit?.[0]).not.toMatch(/\sdisabled=/)`
- **Success criteria:** Tất cả test trong `new.test.tsx` pass 100%.
- **Verify:** `pnpm --filter web test src/routes/_auth/assignments/new.test.tsx` exits 0.

### Task 3.2 — Viết bộ test tương tác new-submit.test.tsx (jsdom)
- **Goal:** Chứng minh bằng kiểm thử tự động rằng nút bấm hoạt động, chặn lưu khi thiếu dữ liệu, hiển thị alert và focus đúng trường.
- **Target files:** `apps/web/src/routes/_auth/assignments/new-submit.test.tsx`
- **Steps:**
  1. Tạo file `apps/web/src/routes/_auth/assignments/new-submit.test.tsx` với môi trường `// @vitest-environment jsdom`.
  2. Stub `window.HTMLElement.prototype.scrollIntoView = vi.fn()`.
  3. Viết test 1: Render `NewAssignmentRoute`, tìm nút submit (`screen.getByRole("button", { name: /Lưu vào ngân hàng/i })`). Nút không bị disable (`expect(btn).not.toBeDisabled()`).
  4. Bấm nút submit -> `submitFixture.run` không được gọi. Hộp `role="alert"` xuất hiện chứa các lỗi (chọn dạng đề, nhập tiêu đề, nội dung...).
  5. Viết test 2: Khi điền đủ thông tin hợp lệ và bấm nút submit -> `submitFixture.run` được gọi với đúng payload.
- **Success criteria:** Bộ test tương tác pass 100%.
- **Verify:** `pnpm --filter web test src/routes/_auth/assignments/new-submit.test.tsx` exits 0.

### Task 3.3 — Quality gates toàn diện
- **Goal:** Đảm bảo toàn bộ mã nguồn tuân thủ lint, format, type-check và tất cả unit test của repo.
- **Target files:** Toàn bộ repo.
- **Steps:**
  1. Chạy `pnpm check` (biome check và format).
  2. Chạy `pnpm check-types` (TypeScript).
  3. Chạy `pnpm --filter web test`.
- **Success criteria:** Tất cả lệnh exits 0, không có bất kỳ warning/error nào.
- **Verify:** `pnpm check && pnpm check-types && pnpm --filter web test` exits 0.

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
