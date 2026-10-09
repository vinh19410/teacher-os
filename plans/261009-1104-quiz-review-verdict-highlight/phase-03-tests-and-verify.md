---
phase: 3
title: "Test, e2e và verify 3 viewport × 2 theme"
status: completed
priority: P2
effort: "2h"
dependencies: [2]
---

# Phase 3: Test, e2e và verify 3 viewport × 2 theme

## Goal
Khoá hành vi mới bằng test, giữ nguyên contract e2e hiện có, rồi kiểm bằng mắt ở 3 viewport và 2
theme theo `REVIEW.md`.

## Files to Create / Modify
- Modify: `apps/student/test/quiz-review-item.test.tsx`
- Modify: `apps/student/test/quiz-paper.test.tsx`
- Modify: `apps/student/test/quiz-navigator.test.tsx`
- Modify: `apps/student/test/attempt-summary.test.tsx` (nếu assert class verdict của compact list)
- Modify: `packages/api/src/lib/grade-quiz.test.ts` (thêm case `isAcceptedAnswer`)
- Modify: `apps/web/src/components/assignments/preview-quiz-simulation.test.tsx` (nếu assert class verdict cũ)
- Modify: `apps/e2e/specs/student-quiz-take-review.spec.ts` (chỉ thêm assert, không đổi assert cũ)

## Tasks & Steps
1. **Unit `isAcceptedAnswer`:** khớp key, khớp alt sau normalize (hoa/thường, khoảng trắng thừa),
   không khớp khi alt rỗng, và `"a/b"` không bị tách (separator phải đúng `" / "`).
2. **`quiz-review-item.test.tsx`:**
   - Chip vẫn ra "Đúng" / đáp án học viên / "Chưa trả lời". Icon là `<svg aria-hidden>` nên không
     lẫn vào text của chip.
   - Khi `wrong`: có dòng "Bạn trả lời" với class `line-through`. "Đáp án" mang class `text-verdict-correct`.
   - Fieldset review có `data-verdict` + class `border-l-verdict-*`. Ở take mode thì không có.
3. **`quiz-paper.test.tsx` (review mode, câu choice TFNG/MCQ):**
   - Học viên chọn sai: hàng đã chọn có "Bạn chọn" + `text-verdict-wrong`, hàng key có "Đáp án đúng".
   - Học viên chọn đúng: chỉ một hàng có ✓, không có nhãn "Đáp án đúng".
   - Bỏ qua: hàng key có "Đáp án đúng".
   - Review mode không còn `text-hot` trên hàng đã chọn.
   - Câu cloze review: input có `border-b-verdict-*`.
4. **`quiz-navigator.test.tsx`:** nút verdict có `bg-verdict-correct` hoặc `bg-verdict-wrong`, có
   `<svg aria-hidden>`. `aria-label` giữ nguyên "Câu N — đúng". Dòng status giữ chuỗi
   "Đúng 1 câu · Sai 0 · Bỏ qua 1".
5. **E2E `student-quiz-take-review.spec.ts`:** giữ mọi assert cũ. Thêm assert ở bước detail:
   - Câu sai (q2) có một hàng chứa "Đáp án đúng".
   - Fieldset q1 có `data-verdict="correct"`.
   Chạy với port override:
   `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e student-quiz-take-review`.
6. **Verify bằng mắt:** mở detail của một attempt có đủ đúng/sai/bỏ qua và trộn MCQ + TFNG + cloze.
   Kiểm 3 viewport (1440×900, 768×1024, 375×812) × dark/light:
   - Nhìn lướt phân biệt được 3 trạng thái mà không cần đọc chữ.
   - Focus bàn phím trên navigator vẫn thấy ring cam và không bị nền đặc che.
   - Fieldset disabled không làm mờ màu verdict.
   - Tab "Làm thử & Soi bài" phía giáo viên (`/assignments/preview`) hiển thị giống hệt.
   - Chụp screenshot cho PR (6 ảnh cho student detail, cộng 1 ảnh dark cho teacher preview).
7. **Gate cuối:** `pnpm check`, `pnpm check-types`, `pnpm --filter student test`,
   `pnpm --filter web test`, `pnpm --filter @teacher-os/api test`, e2e ở bước 5.

## Verification
- Tất cả lệnh ở bước 7 exit 0.
- Có đủ screenshot 3 viewport × 2 theme, đính vào PR.
