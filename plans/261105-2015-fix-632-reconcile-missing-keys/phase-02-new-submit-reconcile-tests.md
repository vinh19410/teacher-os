---
phase: 2
title: "Bổ sung Integration Test cho đối soát edit mode"
status: ready
priority: P1
effort: "25m"
dependencies: ["phase-01-canonical-json-and-unit-tests.md"]
---

# Phase 2: Bổ sung Integration Test cho đối soát edit mode

## Goal

Viết các test tích hợp trong `apps/web/src/routes/_auth/assignments/new-submit.test.tsx` để chứng minh lỗi #632 đã được khắc phục hoàn toàn: đối soát báo thành công khi câu hỏi thiếu key `type` hoặc `pin`, vẫn báo chưa lưu khi snapshot thực sự khác payload, và không gửi thừa `questions` khi save trên đề đã có attempt.

## Target files and symbols

- `apps/web/src/routes/_auth/assignments/new-submit.test.tsx` (describe block: `NewAssignmentRoute — field-diff edit payload + honest reconcile (#630)`)
- `apps/web/src/components/assignment-tests/test-builder-shell.test.tsx`

## Tasks & Steps

### Task 2.1 — Viết test đối soát thành công khi câu hỏi trong payload thiếu `type` hoặc `pin`
- **Goal**: Xác thực rằng khi giáo viên lưu đề có câu hỏi thiếu `type`/`pin` (như tạo từ `pin-editor` hoặc `emptyItem`), server trả về snapshot có `type: null` và `pin: null`, bấm đối soát báo "Đã cập nhật bài tập".
- **Target files and symbols**: `apps/web/src/routes/_auth/assignments/new-submit.test.tsx`.
- **Steps**:
  1. Thêm test case với tên chính xác: `it("reconcile passes when sent question payload omits type or pin but snapshot returns them as null (#632)", async () => { ... })`.
  2. Mở edit mode với prompt có câu hỏi legacy không có key `type` và `pin`: `openEditMode({ ...editablePrompt, questions: [{ stem: "S1", opts: null, answer: "TRUE", alts: "" }] })`.
  3. Sửa stem câu hỏi: `fireEvent.change(screen.getByLabelText("Nội dung câu hỏi phía học viên"), { target: { value: "S1 updated" } })`.
  4. Bấm "Lưu thay đổi", kernel snapshot được set với câu hỏi có `type: null, pin: null`: `{ ...editablePrompt, questions: [{ stem: "S1 updated", opts: null, answer: "TRUE", alts: "", type: null, pin: null }] }`.
  5. Bấm "Tải lại" (đối soát).
  6. Kỳ vọng: hiển thị "Đã cập nhật bài tập" và `submitFixture.error` là `undefined`.
- **Success criteria**: Test chạy qua thành công, output ghi nhận `1 passed`, `0 skipped`.
- **Verify**: `pnpm --filter web exec vitest run src/routes/_auth/assignments/new-submit.test.tsx -t "reconcile passes when sent question payload omits type or pin (#632)"` thoát 0 và in `1 passed`, `0 skipped`.

### Task 2.2 — Viết test đối soát vẫn cảnh báo chưa lưu khi snapshot thực sự khác payload
- **Goal**: Đảm bảo việc bỏ qua `null`/`undefined` không làm lỏng lẻo logic so sánh; khi dữ liệu câu hỏi thực sự khác (ví dụ khác stem hoặc đáp án), đối soát vẫn báo chưa lưu.
- **Target files and symbols**: `apps/web/src/routes/_auth/assignments/new-submit.test.tsx`.
- **Steps**:
  1. Thêm test case với tên chính xác: `it("reconcile fails and warns when sent questions truly differ from snapshot (#632)", async () => { ... })`.
  2. Mở edit mode với prompt có câu hỏi legacy không có `type`/`pin`, sửa stem câu hỏi sang `"S1 updated"`.
  3. Bấm "Lưu thay đổi", nhưng kernel snapshot trả về câu hỏi khác: `stem: "S1 different on server"`.
  4. Bấm "Tải lại" (đối soát).
  5. Kỳ vọng: `submitFixture.error` nhận thông báo "Đã tải lại dữ liệu nhưng thay đổi của bạn chưa được lưu. Vui lòng lưu lại." và không hiển thị "Đã cập nhật bài tập".
- **Success criteria**: Test xác nhận lỗi được phát hiện chính xác, output ghi nhận `1 passed`, `0 skipped`.
- **Verify**: `pnpm --filter web exec vitest run src/routes/_auth/assignments/new-submit.test.tsx -t "reconcile fails and warns when sent questions truly differ from snapshot (#632)"` thoát 0 và in `1 passed`, `0 skipped`.

### Task 2.3 — Viết test baseline diff không gửi thừa `questions` khi câu hỏi không đổi
- **Goal**: Đảm bảo đề đã khóa nội dung khi resave không bị gửi nhầm trường `questions` chỉ vì sự khác biệt giữa `null` và `undefined`.
- **Target files and symbols**: `apps/web/src/routes/_auth/assignments/new-submit.test.tsx`.
- **Steps**:
  1. Thêm test case với tên chính xác: `it("does not re-send questions when questions only differ by null or missing keys (#632)", () => { ... })`.
  2. Mở edit mode với đề legacy có `questions` ban đầu thiếu key `type`/`pin` (chỉ có stem, opts, answer, alts).
  3. Chỉ sửa tiêu đề (`title: "New Title"`) mà không sửa câu hỏi.
  4. Bấm "Lưu thay đổi".
  5. Kiểm tra payload gửi đi trong `submitFixture.run`: trường `questions` KHÔNG có trong payload (`expect("questions" in action.payload).toBe(false)`).
- **Success criteria**: Payload chỉ chứa metadata đổi, không chứa key `questions`, output ghi nhận `1 passed`, `0 skipped`.
- **Verify**: `pnpm --filter web exec vitest run src/routes/_auth/assignments/new-submit.test.tsx -t "does not re-send questions when questions only differ by null or missing keys (#632)"` thoát 0 và in `1 passed`, `0 skipped`.

### Task 2.4 — Bổ sung test cho `test-builder-shell.test.tsx`
- **Goal**: Đảm bảo `sameJson` trong full-test builder coi câu hỏi có `type: null, pin: null` và câu hỏi thiếu các key này là tương đương, không gửi thừa `questions` khi cập nhật đề.
- **Target files and symbols**: `apps/web/src/components/assignment-tests/test-builder-shell.test.tsx`.
- **Steps**:
  1. Trong `test-builder-shell.test.tsx`, bổ sung test case với tên chính xác: `it("Cập nhật đề KHÔNG sửa gì khi câu hỏi chỉ lệch null/undefined (#632)", () => { ... })`.
  2. Mở builder với baseline mang câu hỏi từ snapshot (`type: null, pin: null`) và composer mang câu hỏi tương đương không có `type`/`pin`.
  3. Bấm "Cập nhật đề", kiểm tra payload PATCH không gửi trường `questions`.
- **Success criteria**: Test chạy pass, không sinh PATCH payload thừa cho `questions`, output ghi nhận `1 passed`, `0 skipped`.
- **Verify**: `pnpm --filter web exec vitest run src/components/assignment-tests/test-builder-shell.test.tsx -t "Cập nhật đề KHÔNG sửa gì khi câu hỏi chỉ lệch null/undefined (#632)"` thoát 0 và in `1 passed`, `0 skipped`.
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
