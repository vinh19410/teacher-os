---
phase: 3
title: "Take screen — /learn/quizzes/:assignmentId"
status: pending
priority: P1
effort: "6h"
dependencies: [1, 2]
---

# Phase 3: Take screen — `/learn/quizzes/:assignmentId`

<!-- Updated: Red Team Session 1 — param naming, flat rendering, drain-before-submit, save-state model, resume reconciliation, 401/409 handling, source-gated row link, timer removed -->

## Goal

Màn hình làm bài của học viên: paper tương tác + footer navigator + autosave + vòng đời
start/resume/submit-guard — theo UX Selfomy capture, visual bằng tokens `@teacher-os/ui`.

## Context Links

- `research/selfomy-reference-capture.md` — cấu trúc take screen (header, paper,
  navigator states, dialogs, autosave hành vi).
- `apps/student/src/routes/_auth/route.tsx` — auth gate; route files dưới `_auth`.
- `apps/student/src/lib/repos/student.ts` — repo/hook pattern (`x-student-org-id`).
- `apps/student/src/lib/query-client.ts:32,42-52` — staleTime 60s, 401 reauth CHỈ ở
  QueryCache (mutation 401 chưa được xử lý — phải tự xử lý).
- `packages/api/src/contracts.ts:1444` — `StudentAssignment.source` enum
  (`class_assignment` | grading source).

## Key Insights

- Route param thống nhất `$assignmentId` mọi nơi (route file, Link, redirect). [RT#10]
- Chỉ link row có `source === "class_assignment"`; row grading-source giữ nguyên render
  cũ (không href) — tránh 404. [RT#10]
- Render mảng questions FLAT như `student-preview-paper.tsx` (repo không có khái niệm
  "question group boundaries" trong schema) — heading câu + numbering theo kiểu preview
  hiện có; không chế thêm tầng group. [RT#13]
- Không timer ở v1 — bỏ conditional `timeLimitMs` (không contract nào có field này;
  `assignment_test.timeLimitSeconds` chưa assignable). [RT#17-in-13]
- UI chrome tiếng Việt; nội dung đề nguyên văn teacher soạn.
- Parts-array-first: paper + navigator render theo `parts[]` (N=1 hôm nay).

## Requirements

- [ ] Route `/learn/quizzes/$assignmentId` (loader: quiz detail + attempt state);
      submitted → redirect `/learn/quizzes/attempt/:attemptId`.
- [ ] Runtime shell: header exit (về overview) + title + nút "Nộp bài".
- [ ] Paper tương tác: choice types = radio pill rows (full-row click, keyboard,
      `radiogroup` + `aria-label="Câu {n}"`); cloze types = inline text input + số câu
      prefix; width input theo GIÁ TRỊ học viên gõ (không theo answer — xem Phase 2 respec).
- [ ] Footer navigator: part tabs + nút số câu (đã làm = accent fill, chưa = surface +
      line border), click scroll-to + highlight câu hiện tại.
- [ ] Autosave store: `save-state` element `role="status"` `data-testid="save-state"`
      với 3 trạng thái terminal `saving | saved | error`; debounce 600ms; flush khi
      `pagehide`/`visibilitychange` (`fetch keepalive`).
- [ ] **Drain-before-submit**: nút "Nộp bài" cancel debounce, flush pending, await mọi
      in-flight PATCH rồi mới POST submit; disable nút khi `saving`. [RT#7]
- [ ] **Resume reconciliation**: mirror answers vào localStorage key
      `quiz-attempt:{attemptId}` (kèm timestamp); khi resume, merge mirror đè lên server
      state cho những key pending/unsent, re-queue delta PATCH. Reset mirror + store khi
      unmount, khi submit xong, và khi org-switch (key đã theo attemptId). [RT#11/#14]
- [ ] **Lỗi 401 trên mutation**: autosave store bắt HttpError 401 → halt queue + banner
      lỗi cố định + redirect reauth giữ attempt URL làm returnUrl (QueryCache onError
      không phủ mutation). [RT#11]
- [ ] **PATCH 409 `submitted`**: redirect cứng sang `/learn/quizzes/attempt/:attemptId`
      (tab thứ 2 sau khi tab kia nộp) — không toast storm. [RT#11]
- [ ] Dialogs: start confirm, resume (khi attempt in_progress + có answers), submit guard
      đếm câu trống; `beforeunload` guard khi còn thay đổi chưa flush.
- [ ] Overview `AssignmentRow`: link chỉ cho `source === "class_assignment"`; chưa nộp →
      take, đã nộp → review summary.

## Architecture

```
routes/_auth/learn/quizzes/$assignmentId.tsx    → loader + orchestration (param $assignmentId)
components/quiz/quiz-runtime-header.tsx         → exit/title/submit (submit disabled khi saving)
components/quiz/quiz-paper.tsx                  → parts[] → flat question list (mode: take|review)
components/quiz/quiz-question-item.tsx          → 1 câu: number + stem + input theo kind
components/quiz/quiz-navigator.tsx              → part tabs + question grid + states
components/quiz/quiz-lifecycle-dialogs.tsx      → start/resume/submit-guard
lib/repos/quiz.ts                               → fetch/start/saveAnswer/submit hooks
lib/quiz-attempt-store.ts                       → answers state + debounce + flush + drain + mirror
```

## Files to Create / Modify

- Create: các file trong Architecture (apps/student/src/...).
- Modify: `apps/student/src/components/overview/assignment-row.tsx` (source-gated link),
  `apps/student/src/routeTree.gen.ts` (tự sinh lại).
- Test: `apps/student/test/quiz-paper.test.tsx`, `quiz-navigator.test.tsx`,
  `quiz-attempt-store.test.ts` (drain-before-submit, mirror merge, 409 redirect signal).

## Implementation Steps

1. Repo `lib/repos/quiz.ts`: useQuery quiz detail, useMutation start/saveAnswer/submit
   theo pattern `repos/student.ts`.
2. Route + loader: `$assignmentId`; submitted → redirect attempt route.
3. Paper: flat map câu như `student-preview-paper.tsx`; inputs nhận value/onChange từ
   answers map; ClozeStemText đã respec ở Phase 2 (width theo value, answer optional).
4. Navigator: derive answered map → class per nút; scrollIntoView + current highlight;
   part tabs theo parts[].
5. Autosave store: reducer + debounce + save-state element + localStorage mirror
   (key `quiz-attempt:{attemptId}`) + drain() + xử lý 401/409 như Requirements.
6. Dialogs: dùng primitive `@teacher-os/ui` nếu có; không có thì overlay tối giản có
   focus-trap, không thêm dependency.
7. Overview row link (source-gated).
8. Unit tests + `pnpm --filter student check-types`.

## Todo

- [ ] Repos + route + loader + submitted-redirect
- [ ] Paper + inputs (choice/cloze) + flat rendering
- [ ] Navigator + states + scroll-to
- [ ] Autosave store: debounce/flush/drain/mirror + save-state element
- [ ] 401 halt + 409 redirect handling
- [ ] Lifecycle dialogs + beforeunload guard
- [ ] Overview row source-gated link
- [ ] Unit tests + typecheck

## Success Criteria

- Dev-stack smoke: trả lời radio + blank → reload → resume + answers còn nguyên (kể cả
  answer gõ ngay trước reload nhờ mirror); navigator phản ánh đúng.
- Điền câu cuối → bấm "Nộp bài" NGAY (không đợi "Đã lưu") → câu đó được tính (drain).
- `pnpm --filter student test` + `check-types` xanh.

## Risk Assessment

- Mirror stale sau khi submit ở tab khác: PATCH 409 → redirect xử lý; mirror bị clear
  khi redirect (store reset).
- ClozeStemText respec phải giữ web preview xanh — chạy `pnpm --filter web test` sau Phase 2.

## Security Considerations

- Không render answer key ở take (payload sạch từ Phase 1; width input không derive từ key).

## Next Steps

→ Phase 4 dùng lại `quiz-paper.tsx` mode `review`.
