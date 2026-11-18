---
phase: 2
title: "Phase 2: UI Editor and Verification"
status: todo
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: UI Editor and Verification

## Goal

Thêm nút chuyển nhanh `3 lựa chọn` / `4 lựa chọn` trực tiếp cho câu `mcq` trong `AnswerKeyGrid`, đồng bộ toàn bộ consumer phía UI (`QuestionKeyEditor`, `BulkKeyPaste`, `questionSummary`, `QuizPaper`, và `apps/web` `test-answer-key.ts` + `assignments/new.tsx`), rồi xác minh bằng unit test, E2E và smoke test đề số 1.

<!-- Applied: Red-Team Findings 3, 4, 5, 6 (Security Adversary + Assumption Destroyer) -->

## Files to Create / Modify

- Modify: `packages/ui/src/components/assignments/editor/answer-key-grid.tsx` —
  - `rowChoicesOf(item)` gọi `effectiveAnswerChoices(kind, item.opts)` cho `mcq4`/`mcq3`.
  - Chuẩn hóa `options` cho câu `mcq4`/`mcq3`: nếu `item.opts && item.opts.length > 0`, lấy `item.opts.slice(0, maxChoices)` (với `mcq4`: tối đa 4, `mcq3`: tối đa 3); nếu null/rỗng, fallback `mcqChoices.map(() => "")` để không bao giờ render 0 ô hay `Lựa chọn undefined`.
  - Trong `handleKeyDown`: bỏ qua `Enter` khi `target.closest("button")` (hoặc `SELECT`) để nhấn `Enter` trên nút chuyển `3 lựa chọn` / `4 lựa chọn` không bị `onAddQuestion()` cướp mất.
  - Render nhóm nút `aria-label="Số lựa chọn câu {number}"` với 2 nút `3 lựa chọn` (`aria-pressed={options.length === 3}`) và `4 lựa chọn` (`aria-pressed={options.length === 4}`) cho các câu `rowKind === "mcq4"`.
  - Khi chuyển 4 → 3: cắt `opts` còn `options.slice(0, 3)` và xóa `answer` nếu không nằm trong `["A", "B", "C"]`.
  - Khi chuyển 3 → 4: mở rộng `opts` thành 4 phần tử `[options[0] ?? "", options[1] ?? "", options[2] ?? "", options[3] ?? ""]`.
- Modify: `packages/ui/src/components/assignments/editor/question-key-editor.tsx` —
  - Khi `addQuestion()` thêm câu mới cho `typeId === "mcq"`, nếu câu cuối cùng đang có `opts?.length === 3`, khởi tạo câu mới với `opts: ["", "", ""]` (ngược lại vẫn là `emptyItem("mcq")` 4 lựa chọn).
- Modify: `packages/ui/src/components/assignments/editor/question-summary.ts` —
  - Khi `kind === "mcq4" || kind === "mcq3"`, nếu `item.opts && item.opts.length > 0`, trả về `Math.min(item.opts.length, fallback)`, else `fallback` (tránh `"0 lựa chọn"` khi `opts: []`).
- Modify: `packages/ui/src/components/assignments/editor/bulk-key-paste.ts` —
  - Tính `rowType = next[index]?.type ?? typeId` và `rowKind` theo từng dòng (hỗ trợ cả đề trộn dạng), rồi tính `rowChoices = effectiveAnswerChoices(rowKind, next[index]?.opts)` và dùng chính `rowChoices` cho cả kiểm tra hợp lệ lẫn thông báo lỗi.
- Modify: `packages/ui/src/components/quiz/quiz-paper.tsx` —
  - Khi `!hasOwnInstruction` và `part.typeId === "mcq"`: nếu mọi câu đều có `opts?.length === 3`, dùng `"Choose the correct letter A, B or C."`; nếu trộn lẫn 3 lựa chọn và 4 lựa chọn trong cùng part, dùng `"Choose the correct letter."`; nếu toàn 4 lựa chọn (hoặc null), giữ `"Choose the correct letter A, B, C or D."`.
- Modify: `apps/web/src/lib/test-answer-key.ts`, `apps/web/src/components/assignment-tests/test-builder-shell.tsx`, `apps/web/src/components/assignment-tests/answers-checking-panel.tsx` —
  - Cho phép `TestAnswerRange` / `TestAnswerSlot` mang theo `questionChoices` (hoặc `questions` có `opts`) để `parseTestAnswerKey` dùng `effectiveAnswerChoices` theo từng câu `mcq` thay vì ép `A–D` cho cả slot.
- Modify: `apps/web/src/routes/_auth/assignments/new.tsx` —
  - Trong `missingRequirementsFor` và `actionCopyFor`, kiểm tra các câu có `answer` khác rỗng không hợp lệ theo `questionRowError` / `effectiveAnswerChoices` để chặn client trước khi gửi API.
- Modify tests: `answer-key-grid.test.tsx`, `bulk-key-paste.test.ts`, `question-key-editor.test.tsx`, `question-summary.test.ts`, `quiz-paper.test.tsx`, `apps/web/src/lib/test-answer-key.test.ts`, `apps/e2e/specs/admin-library-reading.spec.ts`.

## Tests Before

1. `answer-key-grid.test.tsx`:
   - Render `mcq` mặc định vẫn hiện 4 ô `Lựa chọn A`–`D` và 4 chip `A`–`D`.
   - Bấm `"3 lựa chọn"` (và thử nhấn `Enter` khi focus vào nút) → `onItemsChange` nhận `opts` dài 3, ẩn `Lựa chọn D` và chip `D`, không gọi `onAddQuestion`; nếu đang chọn đáp án `D`, `answer` reset về `""`; phím `d` không gán đáp án `D`.
   - Bấm `"4 lựa chọn"` trở lại → khôi phục 4 ô `A`–`D`.
   - Câu `mcq` với `opts: []` vẫn render đủ 4 ô A–D; `opts` 5 phần tử vẫn bị giới hạn tối đa 4 ô.
2. `question-key-editor.test.tsx`:
   - Khi câu `mcq` đang có 3 lựa chọn, bấm `"Thêm câu"` tạo câu mới cũng có `opts` dài 3.
3. `bulk-key-paste.test.ts`:
   - Dán `1. D` vào câu `mcq` 3 lựa chọn → lỗi `invalid-choice` với thông báo `(A, B, C)`; `1. C` → apply thành công.
   - Đề trộn dạng (`typeId = "note"`, câu 2 có `type: "mcq"` 3 lựa chọn): `2. D` bị từ chối, `2. C` thành công.
4. `question-summary.test.ts`:
   - `mcq` với `opts: []` → fallback `4` (không trả `0`).
5. `quiz-paper.test.tsx`:
   - Part `mcq` toàn 3 `opts` → `"Choose the correct letter A, B or C."`; part trộn 3 và 4 `opts` → `"Choose the correct letter."`.
6. `apps/web/src/lib/test-answer-key.test.ts`:
   - Câu `mcq` 3 `opts` trong slot `p3`: dán `27. D` báo `invalid-choice`, `27. C` hợp lệ.

## Implementation Steps

1. Cập nhật `answer-key-grid.tsx` (chuẩn hóa `options`, `rowChoicesOf`, `Enter` skip button/select, toggle `3 lựa chọn` / `4 lựa chọn`).
2. Cập nhật `question-key-editor.tsx` (`addQuestion` kế thừa 3 lựa chọn), `question-summary.ts`, và `bulk-key-paste.ts` (per-row `type` + `effectiveAnswerChoices`).
3. Cập nhật `quiz-paper.tsx` (instruction linh hoạt cho 3 / 4 / hỗn hợp).
4. Cập nhật `apps/web/src/lib/test-answer-key.ts`, `test-builder-shell.tsx`, `answers-checking-panel.tsx`, và `apps/web/src/routes/_auth/assignments/new.tsx`.
5. Bổ sung unit test ở `packages/ui`, `apps/web`, và E2E test trong `apps/e2e/specs/admin-library-reading.spec.ts` (tạo câu `mcq` 3 lựa chọn, lưu, kiểm tra xem trước chỉ hiện A/B/C).

## Tests After & Verification

- `pnpm --filter @teacher-os/ui test`
- `pnpm --filter admin test`
- `pnpm --filter web test`
- `pnpm check:fix` (nếu cần) rồi `pnpm check` (`biome check .`)
- `pnpm check-types`
- Chạy spec E2E lẻ: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/admin-library-reading.spec.ts`
- Smoke test lại đề số 1 (`Step-IELTS-solving-traffic-problems-in-big-cities.json`) qua Admin UI và kiểm tra screenshot 3 viewport.

## Todo

- [x] Viết test thất bại trước trong `packages/ui` và `apps/web`
- [x] Cài đặt UI & logic trong `answer-key-grid.tsx`, `question-key-editor.tsx`, `question-summary.ts`, `bulk-key-paste.ts`, `quiz-paper.tsx`, và `apps/web`
- [x] Bổ sung E2E test trong `admin-library-reading.spec.ts`
- [x] Chạy toàn bộ test, `pnpm check`, `pnpm check-types`, E2E spec lẻ và smoke test đề số 1
