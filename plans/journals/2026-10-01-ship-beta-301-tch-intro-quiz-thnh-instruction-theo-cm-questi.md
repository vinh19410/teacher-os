---
title: "Ship beta #301 — tách intro quiz thành instruction theo cụm Questions X–Y"
date: 2026-10-01
summary: "Splitter thuần splitQuizIntro + buildQuizParts theo section + QuizPaper render instruction đúng nhóm câu; beta PR vào develop, gates local xanh"
---

# Ship beta #301 — tách intro quiz thành instruction theo cụm Questions X–Y

## Bối cảnh

#301: đề cũ (không khai type từng câu) chỉ có 1 cụm trong khi giáo viên đã dán đủ các khối "Questions X–Y …" vào intro — instruction bị gom cục ở đầu trang. Plan đã qua gates từ session soạn (label `ready to review`), user gọi vibe `--ship --beta`.

## Làm gì

- `splitQuizIntro` (packages/api/src/lib/quiz-intro-sections.ts): hàm thuần tách intro HTML/plain thành preamble + sections tại marker đầu block, strict → null (chồng/trùng/đảo/vượt biên thì giữ hành vi cũ). Không DOM global — strip tag + decode entity tự viết để node test và browser cho cùng kết quả.
- `buildQuizParts(questions, promptType, intro = "")`: mỗi section thành 1 part mang `instructionHtml`, khoảng trống gom theo type, offset numbering ("Questions 14–20" → học viên thấy 1–7).
- QuizPaper: chỉ cắt intro khi parts có instructionHtml (caller quên truyền intro không mất nội dung); preamble ở đầu trang, instruction của giáo viên thay 2 dòng chuẩn trong header; aria-label section từ intro không có hậu tố ` · Type` (e2e #286 pin hậu tố cho cụm theo type — giữ nguyên).
- 3 caller truyền intro (take, review, teacher simulation). E2E mới: đề 4 câu intro 2 marker → 2 header đúng vị trí trên take lẫn review + navigator tab.

## Điểm khó / bài học

- `noUncheckedIndexedAccess` buộc mọi regex group + index access phải guard — vòng lặp entries + biến `prev`/`currentSection` thay vì index truy cập.
- Tái sử dụng worktree có sẵn (cranky-elbakyan) chứa plan: rename branch + ff lên origin/develop là đủ; plan store cần `ak plan migrate --from-project-files --apply` trước khi `ak plan update` nhận id (id có prefix `teacher-os/`).
- `pnpm --filter web test` fail trong worktree mới vì thiếu `.env` (gitignored): copy env files từ main repo — lỗi môi trường, không phải code.
- Subagent spawn (code-reviewer/general-purpose) stall 600s × 3 trong môi trường này → review inline có hệ thống theo invariant list; 0 Critical / 0 Important / 1 Minor (comment) đã sửa.

## Kết quả

- Gates: pnpm check, check-types, student (156), web (1175) exit 0; e2e student-quiz-take-review 118 passed (3 test #286 không hồi quy).
- Simplifier (Step 3.S) vượt ngưỡng loc/files → chạy scoped, 3 file tinh gọn, tests vẫn xanh.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
