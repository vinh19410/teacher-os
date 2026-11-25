---
title: "Phase 2: Chuẩn hóa hướng dẫn & Dedup introPreamble"
status: todo
---

# Phase 2: Chuẩn hóa hướng dẫn & Dedup introPreamble

## Mục tiêu

Xóa bỏ hiện tượng mâu thuẫn giữa hướng dẫn ở đầu bài (`detail.intro`) và hướng dẫn tại từng nhóm câu hỏi, đồng thời loại bỏ việc lặp lại nội dung nhóm câu ở phần đầu đề mà vẫn bảo toàn phần mở đầu chung (preamble Canary / `RT11`).

## Nhiệm vụ cụ thể

1. **Helper thuần JS tách/chuẩn hóa nội dung:**
   - Tạo helper thuần JS (dùng `htmlToPlainText` / `collapseWhitespace` từ `@teacher-os/api/rich-text`, không dùng `DOMParser` hay `document` để tương thích hoàn toàn với Vitest môi trường `node`).
   - Hàm deduplicate: khi `hasGroupSource === true`, rà soát `introPreamble` và loại bỏ các block/dòng trùng lặp với bất kỳ `part.instructionHtml` nào của các nhóm câu.
   - Bảo vệ trường hợp `RT11` (`apps/student/test/quiz-paper.test.tsx:814-829`): các đoạn text preamble chung (ví dụ "You should spend about 20 minutes...", "Preamble CANARY giữ nguyên.") không trùng với hướng dẫn của nhóm nào thì vẫn được giữ lại hiển thị ở đầu bài.

2. **Nâng cấp `resolvePartInstruction`:**
   - Mở rộng signature: `resolvePartInstruction(typeId, questions, fallback, contextIntro?: string): string`.
   - **Xử lý Word Bank cho Summary/Flow:** Nếu `(typeId === "summary" || typeId === "flow") && partBank.length > 0` và `!hasOwnInstruction`, trả về hướng dẫn dạng chọn từ ngân hàng từ (ví dụ `"Complete the summary below. Choose the correct letter from the box for each answer."`) thay vì `"Choose ONE WORD ONLY from the passage..."`.
   - **Xử lý giới hạn từ theo ngữ cảnh (Type-anchored word-limit):**
     Khi `!hasOwnInstruction` trên các completion types (`summary`, `flow`, `flowchart`, `note`, `notes`, `sent`, `sent4`, `tablecomp`, `form`, `diagram`, `shortans`, `fill_blank`):
     - Quét `contextIntro` (hoặc `introPreamble`) để tìm dòng hướng dẫn neo theo tên loại câu (ví dụ `summary` khớp `/\bsummary\b/i`).
     - Trích xuất chỉ thị giới hạn từ (`ONE WORD ONLY`, `ONE WORD AND/OR A NUMBER`, `NO MORE THAN (TWO|THREE|\d+) WORDS(?:\s+AND\/OR A NUMBER)?`).
     - Nếu tìm thấy (ví dụ `"NO MORE THAN TWO WORDS"`), thay thế vào chuỗi hướng dẫn của nhóm câu: `"Complete the summary below. Choose NO MORE THAN TWO WORDS from the passage for each answer."`.
     - Tiêu thụ dòng hướng dẫn đó khỏi `introPreamble` để không hiển thị lặp hai lần.

3. **Kiểm thử đơn vị:**
   - Thêm test case cho `resolvePartInstruction` với các biến thể word-limit (`NO MORE THAN TWO WORDS`, `NO MORE THAN THREE WORDS`, `ONE WORD ONLY`).
   - Thêm test case cho `QuizPaper`:
     - Khi `intro` chứa "Complete the summary below. Write NO MORE THAN TWO WORDS from the passage for each answer." và nhóm summary không có instruction riêng: nhóm summary hiển thị "NO MORE THAN TWO WORDS", không hiển thị "ONE WORD ONLY", và đầu đề không lặp lại câu đó.
     - Kiểm tra lại test `RT11` trong `apps/student/test/quiz-paper.test.tsx` đảm bảo vẫn pass.

## Tiêu chí hoàn thành

- Không còn mâu thuẫn giữa đầu bài ("NO MORE THAN TWO WORDS") và nhóm câu ("ONE WORD ONLY").
- Khi đáp án Q13 là 2 từ (`predatory animals`), hướng dẫn nhóm câu cho phép tối đa 2 từ.
- `RT11` và các test hiện hành của `QuizPaper` không bị phá vỡ.
