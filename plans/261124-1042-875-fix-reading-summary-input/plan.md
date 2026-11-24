---
title: "875-fix-reading-summary-input"
description: "Fix Summary Completion Q11–13 rendering A–K buttons instead of text input and resolve conflicting instructions in Neanderthal Technology and grouped tests"
status: complete
priority: P0
effort: medium
tags: [reading, quiz, summary-completion, option-bank, instructions]
created: 2026-11-24
---

# Plan #875 — Sửa lỗi đề Neanderthal Technology Q11–13 hiện nút A–K và mâu thuẫn hướng dẫn

- **Issue:** [#875](https://github.com/vinh19410/teacher-os/issues/875)
- **Branch:** `fix/875-reading-summary-input` → PR vào `develop` (`--ship --beta --advice`)
- **Status:** Complete
- **Priority:** P0 (Nghiêm trọng - học viên không thể nhập đáp án đúng trên Staging)

## 1. Tổng quan & Mục tiêu

Khắc phục triệt để hai lỗi hiển thị ở đề Reading IELTS **Neanderthal Technology** (và các đề có cấu trúc nhóm `groups` tương tự):
1. **Bug 1 (A–K buttons thay vì ô nhập chữ):** Nhóm câu Q11–13 (range 37–39) là dạng `summary` (Summary Completion không có Word Bank, đáp án là các từ `sub-arctic`, `short`, `predatory animals`). Do `buildQuizPartsFromGroups` bỏ qua thuộc tính `optionBank` khi rỗng (`undefined`) và `QuizPaper` fallback `part.optionBank ?? detail.optionBank` (vốn chứa 11 lựa chọn từ các nhóm `headings` và `info` trước đó), hệ thống hiểu nhầm `summary` có Word Bank 11 mục, biến ô nhập chữ thành 11 nút chọn `A–K`.
2. **Bug 2 (Mâu thuẫn hướng dẫn):** Đầu bài hiển thị `"NO MORE THAN TWO WORDS"` (từ `detail.intro`), nhưng nhóm câu lại hiển thị `"ONE WORD ONLY"` (từ chuỗi fallback cố định của `QUIZ_TYPE_DISPLAY.summary.instruction`), mâu thuẫn trực tiếp với đáp án 2 từ ở Q13 (`predatory animals`).

## Phases

| Phase | Name | Status |
|---|---|---|
| 1 | [Phase 1: Cô lập optionBank cho nhóm và ngăn rò rỉ](./phase-01-option-bank-scoping.md) | Complete |
| 2 | [Phase 2: Chuẩn hóa hướng dẫn & Dedup introPreamble](./phase-02-instruction-resolution.md) | Complete |
| 3 | [Phase 3: Kiểm thử toàn diện, Code Review & Ship](./phase-03-verification-and-ship.md) | Complete |

## 3. Tiêu chí hoàn thành (Acceptance Criteria)

1. **Hiển thị đúng dạng nhập chữ cho Summary không bank:**
   - Q11–13 ở đề Neanderthal Technology (và mọi đề `summary` / `flow` không có Word Bank) hiển thị ô nhập chữ (`ClozeStemText`), không có nút radio `A–K`.
   - Học viên nhập và lưu được các đáp án từ/cụm từ: `sub-arctic`, `short`, `predatory animals`.
2. **Không rò rỉ Option Bank cấp đề:**
   - `OptionBankList` gộp 11 mục không còn xuất hiện ở đầu đề khi đề đã chia nhóm (`hasGroupSource === true`). Mỗi nhóm chỉ hiển thị bank của riêng mình nếu có.
   - Nhóm không có bank (`part.source === "group"` và `group.optionBank` rỗng) tuyệt đối không mượn bank từ `detail.optionBank`.
   - Đề không nhóm cũ (`part.source !== "group"`) có trộn dạng (ví dụ `summary` + `features`) không bị rò rỉ bank của dạng required-bank sang `summary`.
3. **Hướng dẫn nhất quán, không mâu thuẫn:**
   - Không xuất hiện đồng thời hai hướng dẫn mâu thuẫn ("NO MORE THAN TWO WORDS" ở đầu bài và "ONE WORD ONLY" ở nhóm câu).
   - `resolvePartInstruction` nhận biết giới hạn từ từ ngữ cảnh `introPreamble` khi nhóm không có hướng dẫn riêng.
   - Khi `summary` / `flow` thực sự có Word Bank, hướng dẫn fallback phản ánh việc chọn chữ cái thay vì "Choose ONE WORD ONLY from the passage".
   - `introPreamble` không bị lặp lại các đoạn hướng dẫn đã hiển thị ở từng nhóm câu, nhưng vẫn giữ nguyên preamble chung của bài đọc (bảo vệ `RT11`).
4. **Chất lượng & Không hồi quy:**
   - Toàn bộ test suite liên quan (`@teacher-os/api`, `@teacher-os/ui`, `student`, `server`) đều pass 100%.
   - `pnpm exec biome check .` và `pnpm check-types` sạch lỗi.
   - Có POT đầy đủ trên issue #875 sau khi merge beta.

<!-- slug: 875-fix-reading-summary-input -->
