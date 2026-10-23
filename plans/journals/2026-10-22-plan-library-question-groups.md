---
title: plan library question groups
date: 2026-10-22
summary: "Plan tầng question group cho thư viện đề (PR1 + PR2), tham chiếu cấu trúc Selfomy One"
---

# plan library question groups

## Chuyện gì đã xảy ra

Mình quan sát trực tiếp Selfomy One. Đây là ứng dụng Livewire v2, mỗi lần Save gửi nguyên cây section → question_group → question → answer, với ULID do client sinh. Từ đó mình lập plan `plans/261022-1329-library-question-groups/` để admin soạn được đề IELTS có nhiều nhóm câu trong một part. Phạm vi gồm PR1 (schema câu dùng chung + grader) và PR2 (cột `groups`, contract, route, editor admin, e2e).

## Quyết định

- Giữ `questions` là mảng phẳng, vì `gradeQuiz` (`packages/api/src/lib/grade-quiz.ts`) chấm theo key `String(index)`. Lồng câu vào nhóm sẽ làm hỏng snapshot và trang review.
- Nhóm là cột JSON `library_test_part.groups`, mỗi nhóm trỏ một dải `startIndex`/`count`. `[]` nghĩa là một nhóm ngầm, nên đề cũ không cần migrate dữ liệu.
- Chỉ làm `library_test`, giữ slot cố định `p1..p3`/`s1..s4`. Thư viện bỏ khóa dạng-bài-theo-slot, `assignment_prompt` vẫn giữ khóa cũ.
- "Choose TWO" dùng khóa `answerSet` đặt trên từng câu (grader không thấy nhóm), các câu cùng khóa được so theo tập.
- Ô trống của nhóm inline dùng marker `____` có sẵn cùng `ClozeEditor`, không dùng `{{gap}}`. Lý do: tránh hai quy ước ô trống song song (người dùng chọn).

## Kongming review: bản đầu NO-GO

- Lệnh `pnpm --filter X test -- pattern` vẫn chạy cả suite. Đổi sang `test pattern --reporter=verbose`.
- `normalizeQuestions` trong `part-form.tsx` làm rơi `explanation`/`answerSet`. Lần lưu sau sẽ xóa luôn giải thích.
- Các fixture `LibraryPartInput` thiếu `groups`, và `partReadyIssues` không truyền `groups`.
- Đã sửa cả bốn lỗi trong plan.

## Rủi ro còn lại

`parseQuizQuestions` trong `apps/server/src/routes/student.ts` bỏ `answerSet`. Nhánh chấm theo tập chỉ có hiệu lực khi PR3 sửa hàm này.

## Bước tiếp

Chạy `/ak:cook --advice` cho phase 1 (PR1) trên nhánh riêng. PR1 phải chạy full e2e trước khi merge.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
