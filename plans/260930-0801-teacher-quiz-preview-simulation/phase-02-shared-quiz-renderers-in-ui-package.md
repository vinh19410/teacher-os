---
phase: 2
title: "Shared quiz renderers in ui package"
status: completed
priority: P2
effort: "4h"
dependencies: [1]
---

# Phase 2: Shared quiz renderers in ui package

## Goal

Move 6 quiz render component từ `apps/student` sang
`packages/ui/src/components/quiz/` để web tái dùng cho simulation — pure move +
một thay đổi API duy nhất: `AttemptScoreCard` bỏ router Link student, nhận
`action?: ReactNode`.

## Context Links

- `reports/scout-report.md` mục 2 — bảng props/imports từng component.
- Tiền lệ #284 Phase 2 ("renderer extraction"): move + student imports cut over
  clean (no shims), originals deleted.
- Phase 1 — `quiz-parts` đã ở `@teacher-os/api/lib/quiz-parts`.

## Key Insights

- 5/6 component chỉ phụ thuộc contracts + ui primitives + `cn` — di chuyển thuần.
  `apps/student/src/lib/cn.ts` vốn re-export `@teacher-os/ui/lib/utils` nên bên
  trong package đổi thành relative import theo pattern component ui hiện có.
- `attempt-score-card.tsx` là ngoại lệ duy nhất trong nhóm move: import `Link`
  từ `@tanstack/react-router` và cứng href `/learn/quizzes/attempt/$attemptId`
  (L63-66) — không thể dùng chung. Giải pháp: bỏ props `attemptId`, thêm
  `action?: ReactNode` render tại vị trí CTA cũ; route summary student tự
  compose `<Link className={cn(buttonVariants(), "mt-5")} …>` bên ngoài — giữ
  đúng variant default + spacing hiện tại (Red Team: đổi sang secondary là
  regression visual không gate nào bắt được).
- **3 file student-specific KHÔNG move** (ngoài `attempt-review-error.tsx`
  phụ thuộc `@/lib/query-client`): `quiz-lifecycle-dialogs.tsx` và
  `quiz-runtime-header.tsx` — runtime-header phụ thuộc
  `@/lib/quiz-attempt-store` (store autosave student) + router; move sẽ kéo
  store vào packages/ui, phá quyết định Key Decision #4 của plan.
- Token CSS (text-muted-fg, border-line, bg-surface, text-accent-blue, bg-bg/95)
  đến từ globals của `@teacher-os/ui` mà cả web lẫn student đều consume — không
  việc gì thêm.
- `QuizPaper` phụ thuộc chéo `quiz-question-item` → `quiz-review-item` (type
  `QuizReviewInfo`) + `@teacher-os/api/lib/quiz-parts` — move cả cụm, giữ
  relative imports nội bộ trong package.

## Requirements

- [ ] `packages/ui` export `components/quiz/{quiz-paper, quiz-question-item,
      quiz-review-item, quiz-navigator, attempt-score-card, attempt-compact-list}.tsx`
      qua exports map `"./components/*"` sẵn có.
- [ ] `AttemptScoreCard` mới: bỏ `attemptId` + Link; thêm `action?: ReactNode`;
      route student summary compose Link (giữ nguyên UX + testid counters).
- [ ] apps/student cutover import 6 component từ `@teacher-os/ui/components/quiz/*`;
      xoá 6 file gốc trong `apps/student/src/components/quiz/` (thư mục còn lại
      đúng 3 file student-specific: `attempt-review-error.tsx`,
      `quiz-lifecycle-dialogs.tsx`, `quiz-runtime-header.tsx`); cập nhật import
      trong test files tương ứng.
- [ ] Unify kiểu `QuizNavigator.verdicts` về `Record<number, QuizVerdict>` và
      đổi build ở `$attemptId.detail.tsx:97` sang number key (1 dòng; test
      navigator + e2e detail phủ).
- [ ] Behavior không đổi: toàn bộ test student hiện có xanh mà không cần sửa
      logic (chỉ sửa import path + compose Link ở test summary nếu cần).

## Architecture

```
packages/ui/src/components/quiz/
├── quiz-paper.tsx            ← apps/student/src/components/quiz/quiz-paper.tsx
├── quiz-question-item.tsx    ← (idem, giữ export QuizChoiceRow/questionChoiceRows)
├── quiz-review-item.tsx      ← (idem, giữ export QuizReviewInfo/QUIZ_REVIEW_CHIP_CLASSES/quizReviewChipText)
├── quiz-navigator.tsx        ← (idem)
├── attempt-score-card.tsx    ← (idem + prop- hóa action)
└── attempt-compact-list.tsx  ← (idem)
```

Consumer sau move:
- `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx` (QuizPaper, QuizNavigator)
- `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx` (ScoreCard + Link compose, CompactList)
- `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx` (QuizPaper review, QuizNavigator verdicts)

## Files to Create / Modify

- Create: 6 file trong `packages/ui/src/components/quiz/` (git mv + sửa import).
- Delete: 6 file gốc `apps/student/src/components/quiz/` đã move (thư mục còn
  lại đúng 3 file student-specific: `attempt-review-error.tsx`,
  `quiz-lifecycle-dialogs.tsx`, `quiz-runtime-header.tsx`).
- Modify: `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx`
  (unify verdicts sang number key).
- Modify: 3 route student trên + `apps/student/test/{quiz-paper,quiz-navigator,
  quiz-review-item,attempt-summary}.test.tsx` (import path; attempt-summary
  compose Link/action mới).

## Implementation Steps

1. `git mv` từng file sang `packages/ui/src/components/quiz/`; sửa import:
   `@/lib/cn` → relative utils của package; `@/components/quiz/...` → relative
   cùng thư mục; `@/lib/quiz-parts` → `@teacher-os/api/lib/quiz-parts`
   (packages/ui đã dep `@teacher-os/api`).
2. Refactor `attempt-score-card.tsx`: bỏ import router + `attemptId`; thêm
   `action?: ReactNode` render sau counters (giữ nguyên 4 testid thật:
   `attempt-correct-count`, `attempt-correct`, `attempt-wrong`,
   `attempt-skipped`).
3. Cập nhật route summary student: truyền
   `action={<Link to=... className={cn(buttonVariants(), "mt-5")}>Xem giải thích chi tiết</Link>}`.
4. Migration test `apps/student/test/attempt-summary.test.tsx`: test hiện render
   `<AttemptScoreCard … attemptId=…>` **trực tiếp** (không qua route) với stub
   `vi.mock("@tanstack/react-router")` (L5-31, L104-111) và assert
   `href="/learn/quizzes/attempt/att-1/detail"` (L125-128). Sau đổi API: render
   `action={<a href="/learn/quizzes/attempt/att-1/detail">…</a>}` (hoặc stub
   Link) ngay trong test — **giữ nguyên assertion href** để không mất coverage
   wiring CTA summary → detail; counters assertions giữ nguyên.
5. Cutover import routes + tests student; xoá 6 file gốc; unify
   `verdicts` number-key như Requirements.
6. Gates.

## Todo

- [ ] Move 6 component + sửa import nội bộ
- [ ] Prop- hóa AttemptScoreCard (action, giữ 4 testid + variant default + mt-5)
- [ ] Migration test attempt-summary (giữ href assertion) + compose Link ở route student
- [ ] Cutover routes + tests student, xoá 6 gốc (còn 3 student-specific)
- [ ] Unify verdicts Record<number, QuizVerdict> ở detail route
- [ ] Gates xanh (kể cả scoped e2e)

<!-- Updated: Red Team Session 1 — inventory 3 file còn lại, migration test đúng thực tế, CTA variant giữ default, unify verdicts, scoped e2e gate -->

## Verification

```bash
pnpm check
pnpm check-types
pnpm --filter student test
E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e -- specs/student-quiz-take-review.spec.ts
```

(scoped e2e chạy ngay tại phase này — move renderer + đổi API ScoreCard là
regression surface chỉ e2e phát hiện được: click CTA L331, leak-check L413-447.)

## Risk Assessment

- **Đổi API ScoreCard làm vỡ test summary** — xem Implementation Steps bước 4
  (render trực tiếp + giữ href assertion); không bỏ assertion counters/href.
- **Export phụ bị sót** (`QuizReviewInfo`, `questionChoiceRows`…) — sau cutover,
  `grep -rn 'from "@/components/quiz/' apps/student/src apps/student/test` chỉ
  được khớp đúng 3 file student-specific còn lại (dialogs, runtime-header,
  review-error), không match 6 component đã move.
- **CTA regression visual** — bắt buộc compose `buttonVariants()` (default) +
  `"mt-5"`; không đổi variant sang secondary.

## Security Considerations

- Không đổi luồng dữ liệu; component vẫn nhận prop từ payload server đã gate
  `submitted` — take-mode không render key (ClozeStemText interactive không
  nhận `answer`).

## Next Steps

→ Phase 3 dựng simulation web trên các component vừa shared.
