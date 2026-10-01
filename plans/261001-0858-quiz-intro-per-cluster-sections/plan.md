---
title: "Quiz take: tách intro thành instruction theo từng cụm Questions X–Y"
description: "Intro giáo viên dán nhiều khối 'Questions X–Y …' được tách và đặt instruction ngay trên đúng nhóm câu của nó, thay vì gom cục ở đầu trang."
status: completed
priority: P1
effort: "6.5h"
issue: 301
branch: develop
tags: [feature, frontend, quiz]
blockedBy: []
blocks: []
created: 2026-10-01
---

# Quiz take: tách intro thành instruction theo từng cụm Questions X–Y

## Overview

#286 đã thêm header cụm, nhưng ranh giới cụm CHỈ dựa vào type của từng câu. Đề do giáo viên soạn mà không khai type riêng cho từng câu (bao gồm toàn bộ đề cũ) vẫn chỉ có 1 cụm. Trong khi đó giáo viên đã dán đủ các khối "Questions 1–4 …", "Questions 5–8 · Flow-chart completion — Complete the flow-chart below. Write ONE WORD ONLY from the passage for each answer.", … vào `intro`. Blob này render một lần ở đầu trang (`packages/ui/src/components/quiz/quiz-paper.tsx:164`). Kết quả là instruction bị gom cục, rồi mới tới danh sách câu.

Mong muốn của user: hiện `Questions 1–4` + instruction, ngay dưới là câu 1–4. Tiếp theo là `Questions 5–8 · Flow-chart completion — …`, ngay dưới là câu 5–8. Mỗi khối instruction đứng trên đúng số câu nó ghi.

## Key Decisions

1. **Tách intro ở client, lúc render** bằng hàm thuần `splitQuizIntro` (`packages/api/src/lib/quiz-intro-sections.ts`). Không parse ở server, không lưu DB, không migration. Muốn bỏ hay nâng cấp đều không cần động tới dữ liệu. Đây là counsel của kongming. Phương án "giáo viên khai section khi soạn" để sau: nó không cứu được đề cũ, và khi cần backfill thì vẫn dùng lại parser này.
2. **Tách theo block HTML, không qua plain text.** Bold, list, bảng trong instruction được giữ nguyên và render qua `RichTextBody` (đã sanitize). Marker chỉ được nhận khi nằm ĐẦU block, để tránh false positive kiểu "Answer questions 1–4 using…".
3. **Strict, rồi fallback.** Gặp range chồng nhau, đảo ngược, vượt số câu, hoặc không có marker thì `null`, và giữ nguyên hành vi hiện tại (intro blob + cụm theo type). Thà không tách còn hơn tách sai.
4. **Section của intro thay thế cụm theo type** trong vùng nó phủ, không giao nhau. Widget vẫn theo type từng câu (`quiz-paper.tsx:217`), nên không cần sub-part. Khoảng không được intro phủ thì vẫn gom theo type.
5. **Text của giáo viên được ưu tiên** hơn `QUIZ_TYPE_DISPLAY`. Section chỉ có marker thì fallback về instruction chuẩn. Không sửa map chuẩn (map ghi "Choose ONE WORD ONLY", còn đề của giáo viên ghi "Write ONE WORD ONLY").
6. **Offset numbering.** Intro ghi `Questions 14–20` (đề part 2) map sang câu 1–7, vì học viên đánh số từ 1 theo assignment.
7. **An toàn khi caller quên truyền intro.** QuizPaper chỉ cắt intro khi parts thật sự được dựng từ intro, nên không bao giờ mất nội dung.

## Non-Goals

- Không đổi UI soạn đề, không thêm field section vào contract.
- Không đổi `student-preview-paper.tsx` (aside xem trước lúc soạn). Tab "Làm thử & Soi bài" dùng `QuizPaper` nên vẫn được hưởng.
- Không đổi grading, autosave, `q`/`number`.
- Không tự xoá hay sửa intro đã lưu của giáo viên.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Intro splitter + buildQuizParts theo cụm instruction](./phase-01-intro-splitter-and-parts.md) | Completed |
| 2 | [QuizPaper render instruction theo cụm + nối 3 caller](./phase-02-render-section-headers.md) | Completed |
| 3 | [E2E đề intro chia cụm + gate cuối + changelog](./phase-03-e2e-and-gates.md) | Completed |

Tuần tự 1 → 2 → 3.

## Success Criteria

- [x] Đề có intro "Questions 1–4 … / Questions 5–8 · Flow-chart completion — … / Questions 9–13 …" hiển thị 3 header, mỗi header ngay trên đúng nhóm câu, trên take, review và teacher simulation. Navigator có 3 tab tương ứng.
- [x] Đầu trang chỉ còn preamble (phần trước marker đầu tiên).
- [x] Intro không có marker hoặc marker không hợp lệ: hiển thị y hệt hiện tại.
- [x] Đề trộn type từ #286 không hồi quy (3 test e2e cũ xanh).
- [x] `pnpm check`, `pnpm check-types`, `pnpm --filter student test`, `pnpm --filter web test`, e2e `student-quiz-take-review` (ports 8100/8101/8103) xanh.

## Handover

Plan được viết theo contract `--advice`. Mỗi task có Goal, Target files, Steps, Success criteria và Verify mang tính cơ học, kể cả các bước red có chủ đích ở Task 1.1, 1.3 và 2.1. Mỗi phase có Failure Protocol riêng: verify fail thì STOP và hỏi `kongming`, đó là hành vi được dự định chứ không phải bị kẹt.

## Dependencies

- Xây trên #286 (cụm theo type + `QUIZ_TYPE_DISPLAY`), đã merge.
- Issue theo dõi: [#301](https://github.com/vinh19410/teacher-os/issues/301).
- PR đích: `develop` (theo precedent). CI chỉ chạy cho `main`, nên gate là bộ lệnh local ở Phase 3.
