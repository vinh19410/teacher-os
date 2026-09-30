---
title: "Teacher preview: quiz take + review simulation"
description: "Đưa trải nghiệm làm thử + soi bài của học viên vào trang preview giáo viên /assignments/preview — simulation thuần client-side, tái dùng renderer/logic đã extract từ #283/#284."
status: pending
priority: P2
effort: 12h
issue: 285
branch: vinh19410/issue-285-teacher-quiz-preview-simulation
tags: [feature, frontend, refactor]
blockedBy: []
blocks: []
created: 2026-09-30
---

# Teacher preview: quiz take + review simulation

## Overview

Trang preview giáo viên `/assignments/preview?id=` hiện chỉ mô phỏng **đề bài** dạng
tĩnh (`StudentPreviewPaper`) — giáo viên không kiểm tra được luồng làm bài tương tác
và không thấy trước giao diện review (đúng/sai/bỏ, Đáp án, Giải thích) mà học viên
nhận sau khi nộp. Toàn bộ UX đó đã có ở student app (#283/#284) nhưng renderer chỉ
chia sẻ ở tầng primitive (`@teacher-os/ui`).

Plan này áp dụng trải nghiệm đó cho giao diện giáo viên: với đề ngân hàng
**reading/listening** (?id=), trang preview có segmented control 2 tab —
**"Đề bài"** (giữ nguyên hiện trạng) và **"Làm thử & Soi bài"** (giáo viên làm bài
tương tác như học viên, bấm nộp → thấy review chấm bằng `gradeQuiz` chạy
client-side). Không lưu, không autosave — thuần local state, đúng thông điệp
"Bài làm ở đây không được lưu" sẵn có của trang. Writing/speaking giữ nguyên
layout hiện tại.

Không có API/DB mới: simulation dựng từ prompt data giáo viên đã sở hữu
(`useData()` snapshot).

## Key Decisions

1. **Zero backend** — không endpoint, không migration, không lưu trữ. Grading chạy
   client-side bằng `gradeQuiz` (pure fn, import type-only từ contracts —
   `apps/server/src/lib/grade-quiz.ts:1-4`). Take view **không render key**
   (mirror leak contract của take payload); key chỉ xuất hiện ở review view sau
   khi "nộp" — giáo viên là chủ sở hữu đề nên đây không phải leak.
2. **Extract theo đúng tiền lệ #284** (commit `f0ceefc`: move + cutover sạch, không
   shim, xoá gốc):
   - Logic thuần → `packages/api/src/lib/` (`grade-quiz.ts`, `quiz-parts.ts`).
     packages/api không có vitest — test giữ ở app tiêu thụ (precedent
     `format-schedule.ts` được test từ `apps/web/src/lib/format-schedule.test.ts`).
   - Render component → `packages/ui/src/components/quiz/` (6 file: quiz-paper,
     quiz-question-item, quiz-review-item, quiz-navigator, attempt-score-card,
     attempt-compact-list). packages/ui không có test script — behavior được cover
     bởi test student/web + e2e như hiện nay.
3. **`AttemptScoreCard` bỏ router Link student** — thay prop `attemptId`+Link bằng
   `action?: ReactNode`; route student tự compose Link, simulation web tự compose
   nút "Làm lại". `attempt-review-error.tsx` student-specific (query-client) —
   KHÔNG move.
4. **State simulation lift lên route component** (Red Team RT#9) — hook
   `useQuizSimulation` ở `preview.tsx` giữ answers/grade: đổi tab không mất bài
   làm, đổi đề (`?id`/draft) tự reset qua `simKey` ổn định (search-only
   navigation không remount route). Render đúng 1 tab tại một thời điểm — DOM
   không chứa review key khi ở take. Không tái dùng `quiz-attempt-store`
   (autosave/drain/mirror chỉ có nghĩa khi có attempt thật); "Làm lại" là reset
   duy nhất bởi user.
5. **Take-render từ questions ĐÃ STRIP KEY, grading từ full-key** (Red Team
   RT#2, mirror precedent server `apps/server/src/routes/student.ts:886-892`):
   `buildQuizSim` trả `takeQuestions` (map `{stem, opts, pin}`) cho render take
   và `fullQuestions` cho `gradeQuiz`. Mapping `AssignmentPrompt` → quiz shape
   resolve skill/type bằng đúng công thức `StudentPreviewPaper`
   (`skill ?? "writing"`, `part ?? task`, `type ?? genre`) + normalize items
   malformed.
6. Scope theo quyết định user: chế độ **Làm thử + Soi bài** (interactive), skill
   **reading/listening only**, bố cục **tab/segmented control** trên trang hiện có.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | `gradeQuiz` + `quiz-parts` về `packages/api`, server/student cutover sạch, test xanh | P2 |
| 2 | 6 quiz render component về `@teacher-os/ui/components/quiz/`, student cutover không shim, `AttemptScoreCard` prop- hóa action, toàn test student xanh | P2 |
| 3 | Tab "Làm thử & Soi bài" trên `/assignments/preview` cho đề auto-graded (?id= và draft): take tương tác → nộp → review (score card + verdict chips + Đáp án + Giải thích) | P2 |
| 4 | Full gates local xanh + e2e student-quiz không regress sau extraction | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Quiz logic into api package](./phase-01-quiz-logic-into-api-package.md) | Completed |
| 2 | [Shared quiz renderers in ui package](./phase-02-shared-quiz-renderers-in-ui-package.md) | Completed |
| 3 | [Web preview take + review simulation](./phase-03-web-preview-take-review-simulation.md) | Pending |

## Success Criteria

- [ ] Giáo viên mở `/assignments/preview?id=<đề reading/listening>` thấy 2 tab;
      tab "Làm thử & Soi bài" cho điền đáp án, nộp, thấy đúng/sai/bỏ + Đáp án +
      Giải thích khớp `gradeQuiz`; làm lại reset sạch.
- [ ] Take view không chứa answer key/alts/note ở DOM (unit test pin).
- [ ] Đề writing/speaking và draft không phải auto-graded: trang giữ đúng hiện
      trạng (không có tab).
- [ ] `pnpm check`, `pnpm check-types`, `pnpm --filter {web,student,server} test`
      xanh; e2e `student-quiz-take-review.spec.ts` xanh sau extraction (chạy
      scoped ngay ở phase 1-2, full suite ở phase 3).
- [ ] Student app: 6 component quiz đã move sang `@teacher-os/ui/components/quiz`;
      thư mục `apps/student/src/components/quiz/` còn lại đúng 3 file
      student-specific (`attempt-review-error.tsx`, `quiz-lifecycle-dialogs.tsx`,
      `quiz-runtime-header.tsx`); grep import của 6 component đã move = 0.

## Dependencies

- Xây trên kết quả #283/#284 (đã merge): quiz attempt domain, shared primitives,
  take/review screens student.
- Không plan nào blockedBy/blocks plan này.

## Red Team Review

### Session — 2026-09-30
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer
(kèm Fact Checker + Contract Verifier, tier Standard). **Findings:** 21 thô →
13 sau dedupe (1 Critical, 3 High, 9 Medium) — **13 accepted, 0 rejected**;
user chọn "apply hết" + phương án lift-state cho RT#9.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Success criterion sai inventory — thư mục student quiz còn 3 file student-specific, không phải 1; gate grep=0 không đạt được | Critical | Accept | plan.md, Phase 2 |
| 2 | Full answer-key chảy vào take-render (trái scout/precedent server strip `{stem,opts,pin}`) | High | Accept | Phase 3, KD5 |
| 3 | Stale state khi đổi `?id` — search-only navigation không remount; grade đề cũ hiện trên đề mới | High | Accept | Phase 3, KD4 |
| 4 | Mô tả sai `attempt-summary.test.tsx` (render trực tiếp + stub router + href assertion; 4 testids thật) | Medium | Accept | Phase 2 |
| 5 | Resolver skill/type sai precedent — `type: ""` làm mcq render cloze và chấm sai | Medium | Accept | Phase 3 |
| 6 | Phase 1 thiếu `quiz-question-item.tsx` trong consumer list (quiz-parts đủ 8 file) | Medium | Accept | Phase 1 |
| 7 | Phase 1-2 thiếu e2e gate dù AGENTS.md chuẩn hóa e2e là gate local | Medium | Accept | Phase 1, 2 |
| 8 | CTA student lặng lẽ đổi variant default→secondary + mất `mt-5` | Medium | Accept | Phase 2 |
| 9 | Mất bài làm khi đổi tab không confirm | Medium | Accept (lift state) | Phase 3, KD4 |
| 10 | Malformed legacy items crash `gradeQuiz` khi "Nộp bài", không error path | Medium | Accept | Phase 3 |
| 11 | Test scope hẹp — không cover composed state (submit→Làm lại→DOM sạch) và chiến lược mount tab | Medium | Accept | Phase 3 |
| 12 | `verdicts` number-vs-string wart hoãn vô thời hạn — unify ngay ở phase 2 | Medium | Accept | Phase 2 |
| 13 | Threat model nửa vời — tab "Đề bài" giữ answer-width oracle của #282 | Medium | Accept (documented) | Phase 3 Security |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01, phase-02, phase-03 (sau khi apply).
- Decision deltas checked: 13 (strip-key takeQuestions; resolver công thức
  StudentPreviewPaper; state lift + simKey; inventory 3 file còn lại; CTA
  variant default + mt-5; verdicts number-key; scoped e2e phase 1-2; width
  oracle documented; consumer list 8+2 file; test migration direct-render;
  normalize malformed; composed-state tests).
- Reconciled stale references: 6 (plan.md criterion/gates, phase-02
  delete-list/todo/risk/verification, phase-03 architecture/insights/steps/
  risk/security/todo, phase-01 steps/verification, KD4/KD5).
- Unresolved contradictions: 0.

## Validation Log

### Validation Session 1 — 2026-09-30
**Mode:** prompt (3 câu). Verification pass: bỏ qua theo guard — red-team đã kèm
Fact Checker + Contract Verifier (tier Standard); các claim kỹ thuật chính
(exports map, type-only import, workspace deps, jsdom/tabs precedent,
consumer enumeration) được verify VERIFIED kèm file:line.

**Q1 — Ship shape:** 1 PR trọn plan (precedent #284); gate chạy trọn 1 lần.
**Q2 — Draft mode:** simulation áp cho cả bank `?id=` lẫn draft (sessionStorage)
— cùng component, `simKey` = `prompt.id` | draft fingerprint.
**Q3 — Textarea mô phỏng:** ẩn cho đề auto-graded (tab "Đề bài");
writing/speaking giữ nguyên.

**Propagation:** Phase 3 Requirements (tab "Đề bài" ẩn textarea cho auto-graded)
+ marker Validation S1. Ship shape & draft coverage nhất quán sẵn với nội dung
plan (Goal phase 3 đã nêu "cả bank mode ?id= lẫn draft mode").

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01..03.
- Decision deltas checked: 3 (Q1-Q3).
- Reconciled stale references: 1 (phase-03 bullet tab "Đề bài").
- Unresolved contradictions: 0.
