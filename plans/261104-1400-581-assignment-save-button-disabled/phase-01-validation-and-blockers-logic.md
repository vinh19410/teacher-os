# Phase 1: Logic kiểm tra và trích xuất trường còn thiếu đồng bộ

## Goal
Xây dựng hàm helper `missingRequirementsFor(value, status)` trích xuất danh sách có thứ tự theo DOM của các điều kiện còn thiếu, đồng bộ hoàn toàn với `canSave = missingRequirementsFor(...).length === 0`, và bổ sung parity tests.

## Target files and symbols
- `apps/web/src/routes/_auth/assignments/new.tsx`:
  - Kiểu `MissingRequirement = { id: string; label: string; fieldId?: string }`
  - Hàm `missingRequirementsFor(value: ComposerValue, status: "draft" | "ready"): MissingRequirement[]` (export để test)
  - `canSave = missingRequirementsFor(value, status).length === 0`
  - Cập nhật nhánh thiếu tiêu đề của `actionCopyFor` và đồng bộ
- `apps/web/src/routes/_auth/assignments/new.test.tsx`:
  - Thêm test suite cho `missingRequirementsFor` (test từng kỹ năng, draft vs ready, DOM order).
  - Parity test: assert `canSave === (missingRequirementsFor(value, status).length === 0)` trên ma trận các kỹ năng và trạng thái.

## Tasks & Steps

### Task 1.1 — Viết test mô tả hành vi của missingRequirementsFor (TDD Red)
- **Goal:** Định nghĩa trước các trường hợp thiếu dữ liệu cần phát hiện theo đúng thứ tự DOM.
- **Target files:** `apps/web/src/routes/_auth/assignments/new.test.tsx`
- **Steps:**
  1. Thêm `describe("missingRequirementsFor", ...)`.
  2. Test trường hợp form trắng khi `status === "ready"`: trả về mảng theo đúng thứ tự DOM:
     - `assignment-field-type` (chọn dạng đề trước khi lưu sẵn sàng giao)
     - `assignment-field-title` (nhập tiêu đề bài tập)
     - `assignment-field-prompt` (soạn nội dung đề)
  3. Test trường hợp `status === "draft"`: không bắt buộc dạng đề (`type`), chỉ yêu cầu tiêu đề và nội dung cốt lõi.
  4. Test trường hợp Writing đi kèm trong Auto-skill (Listening/Reading có `writing != null`): bắt buộc có nội dung writing prompt.
  5. Test trường hợp Reading có ảnh sai định dạng URL https: chặn lưu ở cả draft và ready.
  6. Test trường hợp Listening ready thiếu file nghe: yêu cầu file nghe.
  7. Test trường hợp Reading/Listening ready chưa đủ đáp án câu hỏi (`countAnswers !== items.length`).
  8. Parity test kiểm tra tính tương đương giữa `canSave` và `missingRequirementsFor`.
- **Success criteria:** Test file được bổ sung các test case rõ ràng.
- **Verify:** Chạy `pnpm --filter web test src/routes/_auth/assignments/new.test.tsx`. Pass condition: lệnh exits non-zero với assertion failure do `missingRequirementsFor` chưa được export/cài đặt (đúng chu trình TDD đỏ; nếu pass ngay là lỗi).

### Task 1.2 — Cài đặt missingRequirementsFor và refactor canSave (TDD Green)
- **Goal:** Cài đặt hàm helper trả về danh sách có thứ tự DOM của các lỗi chặn lưu kèm fieldId tương ứng để phục vụ việc focus, và quy `canSave` về `missing.length === 0`.
- **Target files:** `apps/web/src/routes/_auth/assignments/new.tsx`
- **Steps:**
  1. Định nghĩa kiểu `MissingRequirement`:
     ```ts
     export type MissingRequirement = {
       id: string;
       label: string;
       fieldId?: string;
     };
     ```
  2. Cài đặt `missingRequirementsFor(value: ComposerValue, status: "draft" | "ready"): MissingRequirement[]`:
     - **Thứ tự 1 (Type):** Nếu `status === "ready"` và `!value.type.trim()`, push `{ id: "type", label: "Chọn dạng đề trước khi lưu sẵn sàng giao", fieldId: "assignment-field-type" }`.
     - **Thứ tự 2 (Title):** Nếu `!value.title.trim()`, push `{ id: "title", label: "Nhập tiêu đề bài tập", fieldId: "assignment-field-title" }`.
     - **Thứ tự 3 (Content - Prompt/Passage/Cue):**
       - Writing: `isEmptyRichText(value.prompt)` -> `{ id: "prompt", label: "Dán hoặc soạn đề trước khi lưu", fieldId: "assignment-field-prompt" }`.
       - Reading: `isEmptyRichText(value.passage)` -> `{ id: "passage", label: "Nhập đoạn đọc", fieldId: "assignment-field-passage" }`. Nếu không có câu nào có stem -> `{ id: "questions-stem", label: "Thêm ít nhất 1 câu hỏi có nội dung", fieldId: "assignment-field-questions" }`.
       - Listening, Grammar, Vocabulary: nếu không có câu nào có stem -> `{ id: "questions-stem", label: "Thêm ít nhất 1 câu hỏi có nội dung", fieldId: "assignment-field-questions" }`.
       - Speaking: nếu part2 và `!value.cueTopic.trim()` -> `{ id: "cueTopic", label: "Nhập chủ đề cue card", fieldId: "assignment-field-cueTopic" }`. Nếu khác part2 và `isEmptyRichText(value.prompt)` -> `{ id: "prompt", label: "Soạn nội dung Speaking", fieldId: "assignment-field-prompt" }`.
       - Kèm Writing (Auto-skill): nếu `isAutoSkill(value.skill) && value.writing != null && isEmptyRichText(value.writing.prompt)` -> `{ id: "writingPrompt", label: "Dán hoặc soạn đề phần Writing đi kèm", fieldId: "assignment-field-writing-prompt" }`.
     - **Thứ tự 4 (Audio):** Nếu `value.skill === "listening" && status === "ready" && !value.audioName.trim()`, push `{ id: "audioName", label: "Đính file nghe (MP3 hoặc WAV)", fieldId: "assignment-field-audio" }`.
     - **Thứ tự 5 (Image):**
       - Nếu `isImageBased(value.skill, value.type)`: nếu URL sai -> `{ id: "imageUrl", label: "Chỉ nhận link ảnh https (tối đa 500 ký tự)", fieldId: "assignment-field-image" }`; nếu ready và rỗng -> `{ id: "imageUrl", label: "Dán link ảnh (https) trước khi lưu", fieldId: "assignment-field-image" }`.
       - Nếu `value.skill === "reading"` và URL sai -> `{ id: "imageUrl", label: "Chỉ nhận link ảnh https (tối đa 500 ký tự)", fieldId: "assignment-field-image" }`.
     - **Thứ tự 6 (Option bank & Cloze stem & Pin):**
       - `bankIssue`: `{ id: "optionBank", label: bankIssue, fieldId: "assignment-field-questions" }`
       - `stemIssue`: `{ id: "clozeStem", label: stemIssue, fieldId: "assignment-field-questions" }`
       - `pinIssue` (khi không có stemIssue): `{ id: "imagePin", label: pinIssue, fieldId: "assignment-field-questions" }`
     - **Thứ tự 7 (Answers):** Nếu `isAutoSkill(value.skill) && status === "ready" && countAnswers(value) !== value.items.length`, push `{ id: "answers", label: `Khóa đáp án đúng cho mọi câu trước khi lưu sẵn sàng giao (${countAnswers(value)}/${value.items.length})`, fieldId: "assignment-field-questions" }`.
  3. Thay thế biểu thức `const canSave = ...` dài dòng bằng:
     ```ts
     const missingRequirements = missingRequirementsFor(value, status);
     const canSave = missingRequirements.length === 0;
     ```
- **Success criteria:** Toàn bộ test của Task 1.1 chuyển sang màu xanh (pass).
- **Verify:** `pnpm --filter web test src/routes/_auth/assignments/new.test.tsx` exits 0.

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
