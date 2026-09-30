---
phase: 4
title: "Result + review screens"
status: done
priority: P1
effort: "4h"
dependencies: [3]
---

# Phase 4: Result + review screens

## Goal

Trang kết quả (summary) và trang soi chi tiết (review detail) sau khi nộp — đúng cấu
trúc reference: score card đúng/sai/bỏ qua, list compact per part, và paper render
read-only với verdict chip + Đáp án + giải thích.

## Context Links

- `research/selfomy-reference-capture.md` — Result summary + Review detail sections.
- Phase 3 `quiz-paper.tsx` — tái dùng ở chế độ read-only.
- `packages/api` attempt summary/detail contracts (Phase 1).

<!-- Updated: Red Team Session 1 — render from questionsSnapshot, in_progress handling -->

## Key Insights

- Verdict per question tính ở server (Phase 1) — client chỉ render, không tự chấm.
- **Render + grade từ `questionsSnapshot` của attempt** (RT#3): paper ở detail là đề học
  viên THẤY lúc làm, không phải prompt hiện tại — teacher edit prompt sau đó không đổi
  review.
- Detail = paper composition y hệt take nhưng input disabled + chip verdict cạnh số câu;
  Đáp án reveal ("Đáp án: X — thay thế: a / b") + "Giải thích" disclosure chứa `note`
  của snapshot (withhold ở take, chỉ có ở detail).
- URL parity: `/learn/quizzes/attempt/:attemptId` + `.../detail`.
- Summary/detail payload server trả 409 khi attempt còn `in_progress` (RT#6) — client xử
  lý 409 bằng redirect về take screen (không render partial).

## Requirements

- [x] Summary: header exit + title; submitted-at + thời lượng hoàn thành ("X phút Y
      giây"); score card (Điểm = correctCount lớn, Câu đúng / Câu sai / Câu bỏ qua);
      CTA "Xem giải thích chi tiết"; list compact per part (`n → đáp án học viên ("—"
      nếu bỏ) → Đáp án đúng`).
- [x] Detail: paper read-only (input disabled) + per-question verdict chip — đúng =
      success token, sai = danger chip hiện đáp án học viên, bỏ = "Chưa trả lời" muted;
      dòng "Đáp án: X" (+ alts) dưới mỗi câu; disclosure "Giải thích" render `note`.
- [x] Navigator footer ở detail: giữ part tabs + số câu, màu theo verdict (đúng
      success / sai danger / bỏ muted).
- [x] Overview: row đã nộp link thẳng summary; summary có breadcrumb/exit về overview.

## Architecture

```
routes/_auth/learn/quizzes/attempt/$attemptId.tsx        → summary screen
routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx → detail screen (URL .../detail)
components/quiz/attempt-score-card.tsx
components/quiz/attempt-compact-list.tsx   → per-part n/your/key
components/quiz/quiz-review-item.tsx       → verdict chip + đáp án reveal + giải thích disclosure
lib/repos/quiz.ts                          → +useAttemptSummary/useAttemptDetail
```

## Files to Create / Modify

- Create: các file trong Architecture (apps/student/src/...).
- Modify: `lib/repos/quiz.ts`, `assignment-row.tsx` (nếu Phase 3 chưa map nhánh submitted).
- Test: `apps/student/test/attempt-summary.test.tsx` (static render: counters, list
  compact), `quiz-review-item.test.tsx` (chip class theo verdict, Đáp án text, note
  trong disclosure).

## Implementation Steps

1. Repos: `useAttemptSummary(id)`, `useAttemptDetail(id)` — GET endpoints Phase 1.
2. Summary screen: compose score card + compact list từ summary payload; duration =
   submittedAt − startedAt format "X phút Y giây".
3. Detail screen: render paper TỪ SNAPSHOT (tái dùng `quiz-paper.tsx` với prop `review` —
   inputs disabled + value = đáp án học viên) + `quiz-review-item` chèn sau mỗi câu.
4. Navigator variant: prop `verdicts` đổi màu nút theo verdict thay vì answered.
5. Link wiring: summary CTA → detail; exit/Thoát → `/` overview.
6. Unit tests + typecheck.

## Todo

- [x] Repos summary/detail
- [x] Summary screen (score card + compact list + duration)
- [x] Detail screen (review items + đáp án + giải thích)
- [x] Navigator verdict variant + wiring links
- [x] Unit tests + typecheck

## Success Criteria

- Sau khi nộp (Phase 3 flow), summary đúng count đúng/sai/bỏ so với answers đã nhập;
  detail chip đúng màu theo từng câu, Đáp án + giải thích hiển thị đúng payload.
- `pnpm --filter student test` + `check-types` xanh.

## Risk Assessment

- Reuse `quiz-paper.tsx` cho 2 chế độ (take/review) có thể kéo prop drilling — chấp nhận
  prop `mode: 'take' | 'review'` đơn giản, không abstraction thêm.

## Security Considerations

- Detail endpoint chỉ trả dữ liệu khi attempt `submitted` (server-side check Phase 1);
  client không render key từ nguồn nào khác.

## Next Steps

→ Phase 5 e2e khóa trọn flow + leak-check.
