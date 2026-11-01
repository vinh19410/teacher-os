---
phase: 2
title: "Phase 2: Dạng bài Grammar & Vocabulary tự chấm"
status: pending
priority: P1
effort: "4h"
dependencies: [1]
---

# Phase 2: Dạng bài Grammar & Vocabulary tự chấm

## Goal

Thêm hai kỹ năng `grammar` và `vocabulary` vào ngân hàng đề (`assignment_prompt`) dùng lại engine quiz tự chấm của Reading/Listening, không có luồng chấm AI/credit.

## Files (đã xác minh tồn tại)

- Modify: `packages/api/src/contracts.ts` (`ASSIGNMENT_SKILLS` ~313, `ASSIGNMENT_PART_TYPES` ~321, `superRefine` ~730 chỉ cho `questions` khi reading/listening, schema ~990)
- Modify: `apps/server/src/lib/quiz-grade.ts`, `apps/server/src/routes/assignments/index.ts` (+ test)
- Modify: `apps/web/src/routes/_auth/assignments/new.tsx`, `$assignmentId.tsx` (editor ngân hàng đề)
- Modify: màn làm quiz của học viên dưới `apps/student/src/routes/_auth/learn/quizzes/` và `apps/student/src/routes/_auth/assignments/index.tsx` (nhãn skill)
- Audit: `packages/api/src/lib/ielts-band.ts` (`isGradableSkill`), `PRACTICE_SKILLS`/`HISTORY_SKILLS` (contracts ~1952/2024), `student-history.ts` (đã có nhánh `vocabulary` riêng ~289)

## Tasks

1. **Catalog**: thêm `grammar` (`parts: ["g1"]`, types `mcq|gap|transform`) và `vocabulary` (`parts: ["v1"]`, types `mcq|match|gap`). Cập nhật `ASSIGNMENT_SKILLS`; mở `auto` ở `superRefine` thành `reading|listening|grammar|vocabulary`; `passage` tuỳ chọn cho hai skill mới; `band` không bắt buộc ý nghĩa (giữ giá trị mặc định).
2. **Chấm điểm**: xác nhận `quiz-grade.ts` chấm theo `answer`/`alts`/`opts`; bổ sung chuẩn hoá đáp án gap-fill (trim, không phân biệt hoa/thường) và `transform` nếu cần. Không đụng `isGradableSkill` (writing/speaking) → hai skill mới **không** vào hàng chờ chấm tay/AI.
3. **Editor web**: thêm lựa chọn skill + form câu hỏi (tái dùng component câu hỏi Reading), ẩn trường audio/passage khi không áp dụng.
4. **Học viên**: nhãn kỹ năng, quiz renderer hiển thị đúng khi không có passage/audio; kết quả "tự chấm" (không "Chờ giáo viên chấm").
5. **Hồi quy**: `PRACTICE_SKILLS` không đổi (grammar/vocabulary chưa có catalog luyện tập); lọc bank theo skill không làm lộ skill lạ sang màn cũ.

## Tests

Contract (grammar hợp lệ / writing có `questions` vẫn bị từ chối), `quiz-grade` (gap-fill chuẩn hoá), route tạo prompt grammar `ready`, component editor, student quiz render grammar.

## Verify

`pnpm --filter server test -- quiz-grade assignments`, `pnpm --filter web test -- assignments`, `pnpm --filter student test`, `pnpm check-types`.

## Risk

Enum skill được dùng ở nhiều chỗ ngoài tầm grep → kiểm kê bằng `rg "\"reading\"|'reading'"` trước khi sửa; type-check bắt các `Record<AssignmentSkill, …>` thiếu khoá.
