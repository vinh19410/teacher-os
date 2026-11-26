---
title: "Chấm tập hợp không thứ tự cho câu Choose TWO/THREE (mcq_many) và đồng bộ Review (#886)"
date: 2026-11-25
summary: "Khắc phục 5 nguyên nhân gốc rễ (RC1–RC5) của lỗi chấm theo vị trí trên câu Choose TWO/THREE, bảo toàn answerSet xuyên biên part/snapshot/sim và đồng bộ hiển thị Review (#886)."
---

# Journal: Chấm tập hợp không thứ tự cho câu Choose TWO/THREE (`mcq_many`) và đồng bộ Review (#886)

- **Date:** 2026-11-25
- **Issue:** #886 (`fix(listening): câu Choose THREE có thể đang chấm theo thứ tự từng ô`)
- **Branch:** `vinh19410/fix-listening-c-u-choose-three-c-th-ang-ch-m-the` (target: `develop`)

## Bối cảnh & thực tế điều tra
- QA trên Staging báo câu Choose THREE *Talking about the history of bikes* Q8–10 (đáp án `C, D, F`) có vẻ chấm theo thứ tự từng ô. Thoạt nhìn tưởng chỉ là lỗi nhỏ ở bộ chấm, nhưng càng lần theo vòng đời `answerSet` càng thấy ức chế: lỗi không nằm ở một chỗ mà rò rỉ đồng thời qua **5 nguyên nhân gốc rễ (RC1–RC5)**:
  1. **RC1:** Bất đối xứng giữa `QuizPaper` (tự gom checkbox theo `(stem, opts)`) và `gradeQuiz` (chỉ chấm tập hợp khi có `answerSet` tường minh) khiến mọi snapshot/prompt thiếu `answerSet` rơi thẳng về chấm theo vị trí từng ô.
  2. **RC2:** `apps/server/src/routes/snapshot.ts` cắt mất `answerSet` khi dựng snapshot và `normalizeQuestions` (`apps/server/src/routes/assignments/index.ts`) thiếu chuẩn hóa canonical (`null` vs `undefined`), gây `409 PROMPT_CONTENT_LOCKED` giả khi resend `questions` từ snapshot.
  3. **RC3:** `apps/web/src/lib/assignment-quiz-sim.ts` strip mất `answerSet` trên `takeQuestions`.
  4. **RC4:** `apps/server/src/routes/student-practice.ts` chưa tách biên part cho đề đa part và thiếu chốt `max(20)` trên đường đọc.
  5. **RC5:** Màn Summary (`AttemptCompactList`) và Detail (`QuizMcqManyCard` + `QuizReviewItem` + `InlineAnswerSlot`) vẫn hiển thị single key theo vị trí — ngay cả khi chấm đúng cũng khiến người xem tin rằng hệ thống chấm theo ô.

## Thay đổi & Quyết định kỹ thuật
- **Hợp nhất logic chấm & tạo key tập hợp (`packages/api/src/lib/grade-quiz.ts`):** Thống nhất `resolveAnswerSetGroups`, `canClusterImplicitMcqMany` (xử lý hậu tố `(lựa chọn i/K)` / `(choice i/K)`, fallback `promptType`, yêu cầu `>= 2` opts không rỗng), `sanitizeAnswerSetKeys` (`<= 20` ký tự), và `resolveSummaryAnswerKeys` (bảo vệ chữ thường La Mã ở `headings`, giữ thứ tự xuất hiện khử trùng cho text tự do).
- **Bảo toàn `answerSet` & biên part phía server (`snapshot.ts`, `assignments/index.ts`, `study-packs.ts`, `student-practice.ts`, `student.ts`):** Bảo toàn và sanitize `answerSet` (`max(20)`, gồm cả seed `study-packs.ts`), chuẩn hóa canonical `normalizeQuestions`, tách biên part `p{part}-s{seq}` cho explicit/implicit/solo `mcq_many` khi `parts.length > 1`, đồng bộ `gradingPromptType` & `detailPromptType` chặn rò Part 1 sang Part 2+ trên đề tự luyện; giữ nguyên `.strict()` schema & single wire key ở `/detail`.
- **UI Review & Web Simulation (`packages/ui/src/components/quiz/*`, `apps/web/src/lib/*`, `preview-quiz-simulation.tsx`):** Dùng chung `canClusterImplicitMcqMany`, chuẩn hóa `.trim().toUpperCase()`, gắn nhãn `(không tính thứ tự)` cho cả `mcq_many` lẫn non-`mcq_many` chung `answerSet >= 2` (`effectiveReview` UI-only ở `QuizReviewItem` + `InlineAnswerSlot`), và áp dụng wrap `break-words` trên `AttemptCompactList` ở `375 / 768 / 1440px`.
- **Non-goals & Rollout caveats:** Chủ động từ chối viết D1 backfill migration cho snapshot/historical `correct_count` (3 bề mặt đọc `correct_count` lịch sử gồm `/history`, `practiceScoreLabel`, hybrid `grading.ts` giữ số liệu cũ); hoãn follow-up cho choice-based non-`mcq_many` `answerSet >= 2` trên `QuizQuestionItem`.

## Rebase & Xác minh
- Rebase sạch trên `origin/develop` (`v0.0.27`, #883/#884), giải quyết xung đột EOF ở `student-practice.test.ts` giữ đủ cả 2 suite.
- Xác minh bằng `biome check .`, `pnpm check-types`, `pnpm build`, 5 script tests CI, bộ Vitest đa gói, và 8 ảnh POT thực tế 3 viewport (`plans/reports/886-*.png`).

## Bài học & Bước tiếp theo
- **Bài học:** Không để UI tự suy diễn gom câu bằng predicate tách khỏi grader, và không ánh xạ tay từng field ở snapshot/sim khiến metadata chấm điểm như `answerSet` rơi rụng âm thầm giữa các biên dữ liệu.
- **Bước tiếp theo:** Mở PR vào `develop` kèm POT, kiểm tra lại câu Q8–10 *Talking about the history of bikes* sau deploy Staging, và theo dõi follow-up cho choice-based non-`mcq_many` `answerSet >= 2` trên `QuizQuestionItem`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
