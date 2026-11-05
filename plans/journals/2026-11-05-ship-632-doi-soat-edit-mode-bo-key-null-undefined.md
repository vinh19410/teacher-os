---
title: "Ship #632: Chuẩn hóa canonicalJson xử lý null/undefined cho đối soát edit mode (beta)"
date: 2026-11-05
summary: "Sửa canonicalJson để lọc bỏ cả null và undefined trên object entries, khắc phục báo nhầm chưa lưu khi đối soát câu hỏi thiếu type hoặc pin và ngăn gửi thừa questions trong field-diff baseline"
---

# Ship #632: Chuẩn hóa canonicalJson xử lý null/undefined cho đối soát edit mode (beta)

## Bối cảnh & Hiện tượng (#632)
- Khi giáo viên lưu đề ở edit mode bị mất response (`outcome-unknown`), bấm "Tải lại" (đối soát) báo nhầm "thay đổi của bạn chưa được lưu" dù server đã ghi nhận thành công, nếu câu hỏi thiếu key `type` hoặc `pin`.
- Nguyên nhân: `editSubmissionPersisted` trong `new.tsx` so sánh `payload.questions` và `stored.questions` bằng `canonicalJson`. Phía server, `parseQuestions` trong `apps/server/src/routes/snapshot.ts` luôn trả `type: null` và `pin: null`. Phía client, câu hỏi tạo từ form (như `pin-editor.tsx` hoặc `emptyItem`) không có key `type` (undefined). Trước fix, `canonicalJson` chỉ lọc `undefined` (`item !== undefined`), giữ lại `null`, khiến `canonicalJson(sent) !== canonicalJson(stored)`.

## Thay đổi kỹ thuật
1. `apps/web/src/lib/canonical-json.ts`:
   - Chuẩn hóa điều kiện lọc object entries: `.filter(([, item]) => item !== undefined && item !== null)`.
   - Cập nhật JSDoc giải thích tính tương đương giữa `null` và `undefined` đối với các thuộc tính câu hỏi có schema `.nullish()`.
   - Giữ nguyên các phần tử `null` trong mảng (`Array.isArray`) để bảo toàn vị trí chỉ mục câu hỏi.
2. `apps/web/src/lib/canonical-json.test.ts`:
   - Thêm 7 unit tests kiểm tra: tính độc lập thứ tự key, tính tương đương giữa omitted/undefined/null, bảo toàn null trong mảng, xử lý top-level null/undefined, phát hiện chính xác khác biệt thực sự (stem, answer, opts, type, pin), nested objects, và optionBank.
3. `apps/web/src/routes/_auth/assignments/new-submit.test.tsx`:
   - Thêm 3 integration tests: (1) đối soát thành công khi payload câu hỏi thiếu type/pin nhưng snapshot trả về null, (2) đối soát vẫn cảnh báo chưa lưu khi snapshot thực sự khác payload (khác stem), (3) baseline diff không gửi thừa `questions` khi câu hỏi chỉ lệch null/undefined trên đề legacy.
4. `apps/web/src/components/assignment-tests/test-builder-shell.test.tsx`:
   - Thêm 1 integration test: `sameJson` trong full-test builder coi câu hỏi có `type: null, pin: null` và câu hỏi thiếu các key này là tương đương, không gửi thừa `questions` khi bấm "Cập nhật đề".

## Supervision `--advice` (kongming)
- Checkpoint sau Phase 1: GO — xác nhận giải pháp trong `canonicalJson` là tối ưu, không thêm `type: null` vào `pin-editor.tsx` để tránh tạo quy ước rải rác; tách `answerSet` thành issue riêng.
- Checkpoint sau Plan Gates: GO có điều kiện — yêu cầu chỉnh test fixture (tránh `answer: "A"` trên prompt tfng), gán nhãn `(#632)` cho tên test để filter vitest không bị skip giả, và làm rõ test baseline diff.
- Checkpoint trước Ship: GO — xác nhận toàn bộ 33 web tests, 9 server tests, typecheck và linter đều đạt tiêu chuẩn.

## Code review (fresh context)
- Phán quyết: APPROVE (0 Critical / 0 Important / 1 Minor).
- Đã áp dụng quan sát Minor: chỉnh sửa test 3 của `new-submit.test.tsx` nạp câu hỏi legacy không có `type`/`pin` để kiểm tra field-diff một cách chân thực nhất.

## Kiểm chứng
- Unit test `canonical-json.test.ts`: 7/7 passed.
- Integration test `new-submit.test.tsx`: 14/14 passed.
- Integration test `test-builder-shell.test.tsx`: 12/12 passed.
- Server test `prompt-content-lock.test.ts`: 9/9 passed.
- Typecheck: `turbo run check-types` 12/12 packages passed.
- Biome linter: `pnpm exec biome check` trên các file thay đổi đạt 0 errors, 0 warnings.
