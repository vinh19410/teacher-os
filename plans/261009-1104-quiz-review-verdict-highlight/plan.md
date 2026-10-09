---
title: "Màn soi bài: highlight câu đúng/sai nổi bật, dễ phân biệt"
description: "Màn review đáp án (student detail + tab Làm thử & Soi bài của giáo viên) đổi sang cặp màu chấm điểm xanh lá/đỏ riêng kèm icon ✓/✗, tô cả khối câu, đánh dấu lựa chọn đúng/sai, chip verdict to hơn và navigator nền đặc có icon."
status: completed
priority: P2
effort: 6h
issue: 351
branch: feat/quiz-review-verdict-highlight
tags: [frontend, ui, design-system, quiz]
blockedBy: []
blocks: []
created: 2026-10-09
---

# Highlight đúng/sai ở màn soi bài

## Overview

Học viên mở `/learn/quizzes/attempt/$attemptId/detail` để soi lại bài. Hiện tại rất khó biết
câu nào đúng, câu nào sai. Có ba nguyên nhân, đã kiểm tra trong code:

1. **Token trạng thái bị redesign #350 làm đơn sắc.** `--success` = `--fg-2` (#e6e6e6, gần trùng
   chữ thường) và `--danger` = `--accent` (cam). Xem
   `packages/ui/src/styles/globals.css:41-43` và `:154-156`. Vì vậy chip "Đúng" có màu xám trắng
   và chìm vào nội dung.
2. **Đáp án đã chọn luôn tô cam.** Hàng radio được chọn dùng `text-hot` bất kể đúng hay sai
   (`packages/ui/src/components/quiz/quiz-question-item.tsx:117-135`). Câu đúng và câu sai đều có
   đáp án màu cam, trùng màu với `--danger`.
3. **Không có tín hiệu ở cấp câu.** Lựa chọn đúng không được đánh dấu khi học viên chọn sai.
   Khối câu (`fieldset`) không có viền hay nền theo verdict. Tín hiệu duy nhất là chip 12px nằm
   cuối khối (`quiz-review-item.tsx:51-60`).

## Quyết định đã chốt với user (2026-10-09)

| Câu hỏi | Lựa chọn |
|---|---|
| Màu phân biệt | **Cặp màu chấm điểm riêng xanh lá/đỏ.** Đây là ngoại lệ có chủ đích trong `DESIGN.md`, chỉ áp dụng cho màn chấm/soi bài, và luôn kèm icon ✓/✗ để không phụ thuộc vào màu. |
| Phạm vi | Cả 4 phần: viền/nền khối câu, đánh dấu lựa chọn đúng/sai, chip + icon to hơn, navigator có icon. |

## Token mới (contrast đã đo theo công thức WCAG)

| Token | Dark | Light | Chữ trên `--surface` | Chữ trên `-soft` |
|---|---|---|---|---|
| `--verdict-correct` | `#4ade80` | `#166534` | 9.99 / 6.37 | 8.95 / 6.14 |
| `--verdict-wrong` | `#f87171` | `#b91c1c` | 6.29 / 5.78 | 6.09 / 5.45 |
| `--verdict-on` (chữ trên nền đặc) | `#0a0a0a` | `#ffffff` | 11.36 (trên xanh) / 7.13 | — |

Nền `-soft` = `color-mix(in oklab, <token>, transparent 86%)` cho dark và `90%` cho light. Bỏ qua
(skipped) vẫn dùng `--meta` với viền đứt, không thêm màu.

`--success` và `--danger` **giữ nguyên**: các màn khác (badge, chart, trạng thái học phí) vẫn theo
ngôn ngữ đơn sắc + cam.

## Bề mặt bị ảnh hưởng

| Bề mặt | File | Ghi chú |
|---|---|---|
| Student detail (soi bài) | `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx` | Không cần sửa route, chỉ đổi component dùng chung |
| Student summary (bảng đáp án) | `packages/ui/src/components/quiz/attempt-compact-list.tsx` | Đổi sang token verdict + icon |
| Teacher "Làm thử & Soi bài" | `apps/web/src/components/assignments/preview-quiz-simulation.tsx` | Tự hưởng thay đổi vì dùng chung `QuizPaper`/`QuizNavigator` |

Ngoài phạm vi: bài Writing/Speaking (chấm tay, không có verdict từng câu) và màn chấm bài của
giáo viên (`teacher-grade-submission`).

## Phases

| # | Phase | Status | Effort | Depends |
|---|---|---|---|---|
| 1 | [Token verdict + ngoại lệ DESIGN.md](phase-01-verdict-tokens.md) | completed | 1h | — |
| 2 | [UI review: khối câu, lựa chọn, chip, navigator, compact list](phase-02-review-ui.md) | completed | 3h | 1 |
| 3 | [Test, e2e và verify 3 viewport × 2 theme](phase-03-tests-and-verify.md) | completed | 2h | 2 |

## Acceptance criteria

- [x] Ở màn detail, nhìn lướt là phân biệt được câu đúng (viền trái + nền xanh nhạt + chip ✓ Đúng)
      với câu sai (viền trái + nền đỏ nhạt + chip ✗ <đáp án>) và câu bỏ qua (viền đứt xám), ở cả dark và light.
- [x] Câu choice (MCQ/TFNG/heading): hàng học viên chọn tô theo verdict (đúng = xanh + ✓,
      sai = đỏ + ✗ + gạch ngang). Khi học viên chọn sai hoặc bỏ qua, hàng đáp án đúng có viền xanh + ✓ "Đáp án đúng".
- [x] Câu điền (cloze/pin): ô input có viền dưới theo verdict và gạch ngang khi sai.
      Dòng "Đáp án:" hiện key bằng màu xanh.
- [x] Đáp án đã chọn ở review **không còn** dùng `text-hot` (cam).
- [x] Navigator: nút số câu có nền đặc theo verdict (chữ `--verdict-on`) và icon ✓/✗ nhỏ `aria-hidden`.
      `aria-label` giữ nguyên ("Câu 3 — đúng").
- [x] Contract test/e2e giữ nguyên: `data-verdict`, `data-testid`, chữ chip ("Đúng" / đáp án học viên /
      "Chưa trả lời") và dòng trạng thái "Đúng N câu · Sai N · Bỏ qua N".
- [x] Chế độ take không đổi gì (không có class verdict, không có icon).
- [x] Toàn bộ chữ verdict đạt ≥4.5:1 và viền ≥3:1 ở cả 2 theme. `DESIGN.md` ghi rõ ngoại lệ.
- [x] `pnpm check`, `pnpm check-types`, `pnpm --filter student test`, `pnpm --filter web test`,
      e2e `student-quiz-take-review` đều pass. PR kèm screenshot 3 viewport × 2 theme.

## Rủi ro

- **Lệch ngôn ngữ thiết kế:** đây là màu trạng thái thứ hai đầu tiên. Giảm rủi ro bằng cách giới hạn
  token cho verdict, ghi rõ trong `DESIGN.md` ("chỉ màn chấm/soi bài") và không đụng `--success`/`--danger`.
- **So khớp key với lựa chọn:** để đánh dấu hàng đúng, UI phải so `row.value` với key + alts theo
  cùng quy tắc normalize của grader. Cách xử lý là export helper từ `packages/api/src/lib/grade-quiz.ts`
  thay vì viết lại.
- **Fieldset disabled làm mờ màu:** cần kiểm tra trình duyệt không hạ opacity hay đổi màu input
  disabled. Nếu có thì đặt màu tường minh trên input (`disabled:opacity-100`).
