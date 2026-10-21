---
title: "Plan merge-student-vocab-route: gộp /vocab vào /practice/vocabulary"
date: 2026-10-21
summary: "Lập plan 261021-1321 (issue #387): một path từ vựng duy nhất cho học viên, /vocab/* redirect giữ query, bỏ nav 'Từ vựng' riêng"
---

# Plan merge-student-vocab-route: gộp /vocab vào /practice/vocabulary

## What happened
Lập plan qua `ak-plan --github`, mở GitHub Issue #387 (`ai-handle`, `ready to review`).

Scout cho thấy `/practice/vocabulary` chỉ render `VocabPracticeCatalog`. Đây là lưới deck rút gọn
đọc cùng `useVocabOverview` với hub `/vocab`, và mỗi card lại link ngược sang `/vocab/$deckId`.
Sidebar có hai mục trùng nhau ("Luyện tập › Vocabulary" và "Từ vựng"). Không có e2e nào dùng
`practice-vocab-deck`, còn hub `/vocab` có 4 e2e spec student phụ thuộc vào URL.

## Decision
- User chọn canonical là `/practice/vocabulary`. Hub cùng 4 route con dời bằng `git mv`.
  Static segment `vocabulary` thắng `$skill`, và `vocabulary` bị bỏ khỏi `SKILL_SLUGS`.
- Bỏ mục nav "Từ vựng" riêng.
- `/vocab/*` redirect bằng `vocab/index.tsx` + splat `vocab/$.tsx`, dùng hàm thuần
  `legacyVocabHref` để test được và giữ được query `course`/`mode`/`q`.
- Không đụng hub `/vocab` của giáo viên (`apps/web`) và API.

## Next steps
- Review `plans/261021-1321-merge-student-vocab-route/plan.md` hoặc Issue #387.
- Thực thi: `/ak:cook plans/261021-1321-merge-student-vocab-route/plan.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
