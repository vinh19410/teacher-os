---
title: "Phase 1: Cô lập optionBank cho nhóm và ngăn rò rỉ"
status: todo
---

# Phase 1: Cô lập optionBank cho nhóm và ngăn rò rỉ

## Mục tiêu

Đảm bảo các nhóm câu hỏi không khai báo `optionBank` (đặc biệt là dạng `summary` / `flow` điền từ) không bị nhận nhầm `detail.optionBank` cấp đề, render đúng ô nhập chữ (`ClozeStemText`) thay vì hiển thị các nút chọn `A–K`.

## Nhiệm vụ cụ thể

1. **`packages/api/src/lib/quiz-parts.ts` (`buildQuizPartsFromGroups`):**
   - Thay đổi: luôn gán `optionBank: [...group.optionBank]` cho `QuizPart` (trả về mảng rỗng `[]` khi nhóm không có bank, thay vì bỏ qua thuộc tính dẫn đến `undefined`).
   - Cập nhật JSDoc tại `QuizPart.optionBank` (`quiz-parts.ts:34-36`) nêu rõ: `undefined` chỉ còn tồn tại cho part không phải `"group"`.
   - *Lưu ý (theo Kongming):* Giữ nguyên `libraryPartToQuizView` (`packages/api/src/lib/library-quiz-preview.ts:128-130`) để không phá vỡ test `packages/api/src/lib/library-quiz-preview.test.ts:175`.

2. **`packages/ui/src/components/quiz/quiz-paper.tsx`:**
   - **Xác định `partBank` an toàn:**
     - Nếu `part.source === "group"`: luôn dùng `part.optionBank ?? []` (tuyệt đối không fallback sang `detail.optionBank`).
     - Nếu `part.source !== "group"`: giữ fallback `part.optionBank ?? detail.optionBank`, NHƯNG nếu part/câu thuộc nhóm optional-bank (`summary` / `flow`) mà đề có lẫn các dạng required-bank (`headings`, `info`, `features`, `match_names`, `matching`, `sentend`, `map`, `match2`, `match`), thì `detail.optionBank` thuộc về dạng required-bank chứ không được áp cho `summary`/`flow`.
   - **Tắt `showDetailBank` ở đầu đề khi dùng nhóm:**
     - Sửa điều kiện `showDetailBank` (`quiz-paper.tsx:551-554`):
       ```ts
       const showDetailBank =
         !hasGroupSource &&
         bankKind !== undefined &&
         detail.optionBank.length > 0 &&
         !isPositionalOnlyBank(detail.optionBank, bankKind);
       ```
     - Điều này ngăn chặn việc hiển thị danh sách 11 mục gộp (`i-vi` + `A-E`) ở đầu trang bài đọc.

3. **Kiểm thử đơn vị:**
   - Thêm test case vào `packages/ui/src/components/quiz/quiz-paper.test.tsx`:
     - Test đề có nhóm `headings` (6 mục) + `info` (5 mục) + `summary` (0 mục) -> câu hỏi summary render ô nhập text, không có nút `A–K`, không có bank gộp 11 mục ở đầu đề.
     - Test đề trộn dạng không nhóm (`summary` + `features`) -> summary không bị biến thành nút chọn.
   - Thêm test case vào `packages/api/test` hoặc kiểm tra `packages/api/src/lib/quiz-parts.ts`.

## Tiêu chí hoàn thành

- Q11–13 ở đề có cấu trúc như Neanderthal Technology render ô nhập chữ (`ClozeStemText`).
- Không còn danh sách optionBank 11 mục ở đầu đề khi đề có nhóm.
- Mọi test hiện hành của `QuizPaper` và `quiz-parts` đều pass.
