---
title: "Student quiz take + review UI (Selfomy reference)"
description: "Luồng học viên làm bài và xem lại bài làm trên student portal — vertical slice từ DB/contracts tới UI, tham khảo UX Selfomy (test123456.hoc.sh)."
status: pending
priority: P1
effort: 22h
issue: 283
branch: vinh19410/issue-283-student-quiz-take-review
tags: [feature, frontend, backend, api]
blockedBy: []
blocks: []
created: 2026-09-30
---

# Student quiz take + review UI (Selfomy reference)

## Overview

Học viên hiện không làm bài được gì: student app chỉ có `/`, `/onboarding`, `/login`
(`apps/student/src/routeTree.gen.ts:22-94`); không có bảng attempt, không có endpoint
quiz, `AssignmentRow` không có href. Plan này xây trọn luồng **làm bài** (take) và **xem
lại bài làm** (review) cho unit giao bài hiện có — `class_assignment` (1 prompt reading/
listening) — tham khảo UX Selfomy đã capture live (`research/selfomy-reference-capture.md`):
paper 1 cột + input inline, footer navigator đánh dấu câu đã làm, autosave per interaction,
submit guard đếm câu chưa làm, trang kết quả (đúng/sai/bỏ qua) và trang soi chi tiết
(answer chip đỏ/xanh + Đáp án + giải thích).

UI dùng design tokens có sẵn của `@teacher-os/ui` (Apple-style, frozen) — không nhập
palette indigo/Inter của Selfomy. Paper renderer tái dùng `StudentPreviewPaper` /
`ClozeStemText` / `PinOverlay` (dời về package chung ở Phase 2 — giữ nguyên tắc "one
implementation for BOTH surfaces" của `cloze-stem.tsx:9-11`).

Take UI được thiết kế parts-array-first (navigator + paper render theo `parts[]`) nên khi
plan "giao full test cho lớp" (đã defer bởi 260928-0419) lands, UI không phải dựng lại —
chỉ thêm nguồn parts.

## Key Decisions

1. **Quiz = class_assignment (lượt giao prompt)**. Attempt unique theo
   `(assignmentId, studentId)` — 1 lượt làm/lượt giao, không retake v1.
2. **Snapshot đề lúc start**: attempt lưu `questionsSnapshot` (đầy đủ key) — đề đổi sau
   khi giao không ảnh hưởng bài đang làm đã chấm (mở rộng title-snapshot precedent
   #208). Take-render + grading chỉ đọc snapshot.
3. **Answers = JSON map trên row attempt** (`qIndex → string`), autosave qua MỘT
   statement atomic `UPDATE ... json_set(answers, ...) WHERE ... AND status='in_progress'`
   + predicate ownership (org + student) — không read-modify-write (D1 không transaction).
4. **Grading server-side, pure function**: normalize (trim + collapse ws + lowercase),
   so `answer` + `alts` (split " / "), choice-type so exact label. Verdict per question
   (correct / wrong / skipped) tính lúc submit (flip-first idempotent), lưu `correctCount`.
5. **Leak rule**: payload take KHÔNG chứa `questions[].answer`, `alts`, hay `note`;
   summary + detail CHỈ trả key/verdict khi `submitted` — mirror leak-check precedent
   của preview e2e.
6. **URL parity với reference**: `/learn/quizzes/:assignmentId`,
   `/learn/quizzes/attempt/:attemptId`, `/learn/quizzes/attempt/:attemptId/detail`.
   Param tên `$assignmentId` thống nhất.
7. **Submit là write-path `submittedAt`** của `class_assignment_target` — đóng non-goal
   #208 ("derived cho tới khi có write-path đánh dấu nộp").
8. **AuthN/CSRF pin**: endpoint khai báo trong `studentRoutes()` (`requireStudent` là
   closure — router mount riêng = không auth); POST/PATCH mới qua Origin-allowlist +
   Content-Type JSON guard (SameSite=None cookies).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Attempt domain: bảng `quiz_attempt` (+questionsSnapshot) + contracts + 6 endpoint `/api/student/*` + grading pure fn, có unit test | P1 |
| 2 | Paper renderer dùng chung (dời renderers + cloze/sanitize lib + deps về `@teacher-os/ui`), ClozeStemText respec interactive, web chuyển import sạch | P1 |
| 3 | Take screen `/learn/quizzes/:assignmentId`: paper tương tác + navigator + autosave (drain-before-submit, mirror reconciliation) + dialogs | P1 |
| 4 | Review: summary + detail (verdict chips, Đáp án, giải thích — render từ snapshot) + entry từ overview row | P1 |
| 5 | E2E trọn flow (seed thẳng DB) + leak-check 3 lớp + full gates xanh | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Attempt domain — DB, contracts, server routes, grading](./phase-01-attempt-domain-contracts.md) | Pending |
| 2 | [Shared paper renderer extraction](./phase-02-shared-paper-renderer.md) | Pending |
| 3 | [Take screen](./phase-03-take-screen.md) | Pending |
| 4 | [Result + review screens](./phase-04-result-review-screens.md) | Pending |
| 5 | [E2E + full verification](./phase-05-e2e-verification.md) | Pending |

## Success Criteria

- [ ] Học viên bấm assignment row trên overview → làm bài (radio pills + blanks inline)
      → reload giữa chừng còn nguyên answers (autosave) → nộp (guard đếm câu trống) →
      thấy điểm + đúng/sai/bỏ qua → vào detail soi từng câu với Đáp án + giải thích.
- [ ] Payload take không lộ answer key (e2e assert).
- [ ] `submittedAt` của target được stamp khi nộp; overview badge đổi "Đã nộp".
- [ ] Full gates xanh: `pnpm --filter student test`, `pnpm --filter web test`, server
      tests, `check-types` các app, `pnpm check`, e2e spec mới.

## Non-Goals

- Giao full test (`assignment_test`) cho lớp — teacher-side, plan sau (UI đã array-ready).
- Retake ("Làm lại"), "Tải bài làm" (download), timer đếm ngược (không có nguồn
  timeLimit cho prompt assignment; timer đến cùng plan giao full test), band-score
  mapping.
- Reading tools của Selfomy (Tô sáng / Ghi chú / Font Size / Fullscreen) — đề xuất defer,
  xác nhận ở Validation.
- Writing/Speaking submission (contracts: questions chỉ tồn tại cho reading/listening).
- Teacher grading UI (GradeModal rubric flow) — không đụng.

## Cross-Plan Dependencies

| Relationship | Plan | Status |
|-------------|------|--------|
| Builds on | `260928-0419-ielts-full-test-builder` (test entity + parts model) | completed |
| Unblocks (future) | test-assignment plan (giao `assignment_test` cho lớp) | not created |

## Dependencies

- `packages/db` (drizzle migration qua `pnpm db:generate`), `packages/api` contracts,
  `apps/server` student routes, `apps/student` UI, `apps/e2e` spec.

## Reference

- `research/selfomy-reference-capture.md` — live UX capture (URL map, dialogs, states,
  grading semantics).
- `research/scout-evidence.md` — codebase anchors + conventions.

## Red Team Review

### Session — 2026-09-30
**Reviewers:** Security Adversary (+Fact Checker), Failure Mode Analyst (+Flow Tracer),
Assumption Destroyer (+Scope Auditor) — 3 subagents; mọi finding có dẫn chứng file:line.
**Findings:** 29 raw → 15 sau dedup (3 Critical, 7 High, 5 Medium) — 15 accepted
(#16 partial: payload caps + client debounce accepted; Durable-Object rate bucket
deferred), 0 rejected. User approved "Apply accepted findings".

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Standalone `student-quiz.ts` router branch = zero auth (`requireStudent` closure; bootstrap skips `/api/student`) | Critical | Accept | Phase 1 |
| 2 | Missing CSRF Origin+Content-Type guard on new POST/PATCH (SameSite=None cookies) | Critical | Accept | Phase 1 |
| 3 | Prompt edits corrupt live attempts → snapshot `questionsSnapshot` at start | Critical | Accept | Phase 1, 4 |
| 4 | PATCH lost-update race + IDOR → atomic `json_set` UPDATE with org+student predicate | High | Accept | Phase 1 |
| 5 | Submit non-idempotent + PATCH-vs-submit race → flip-first submit | High | Accept | Phase 1 |
| 6 | Summary leaks answer key pre-submit → gate summary+detail on `submitted` | High | Accept | Phase 1, 4, 5 |
| 7 | Submit không drain autosave queue → mất câu cuối | High | Accept | Phase 3, 5 |
| 8 | ClozeStemText width derive từ answer key (crash + key-length oracle) → respec interactive | High | Accept | Phase 2, 5 |
| 9 | Phase-2 dep graph thiếu (@teacher-os/api types, dompurify, sanitize sink) | High | Accept | Phase 2 |
| 10 | Row link không gate theo `StudentAssignment.source`; `$quizId`/`$assignmentId` drift | High | Accept | Phase 3 |
| 11 | Mutation 401 chưa xử lý; PATCH-409 toast storm; thiếu resume reconciliation | Medium | Accept | Phase 3 |
| 12 | E2e mega-test vượt 120s + chờ text "Đã lưu" flaky → seed DB + testid states | Medium | Accept | Phase 5 |
| 13 | "Group boundaries" không tồn tại trong schema → render flat; bỏ timer `timeLimitMs` không thỏa | Medium | Accept | Phase 3 |
| 14 | Attempt store trùng state query cache; org-switch contamination → key theo attemptId | Medium | Accept | Phase 3 |
| 15 | Grading separator: pin `alts.split(" / ")`; multi-part multiset chờ authoring check | Medium | Accept | Phase 1 |
| 16 | Autosave PATCH rate abuse (repo không có rate limiting) | Medium | Accept (partial) | Phase 1 |

Adjudication notes: #15 — cloze teacher-os = 1 marker/stem = single answer, nên
order-insensitive multi-match chỉ áp dụng nếu authoring lưu answer multi-part; implementer
verify với type `features`/multi trước khi thêm so sánh multiset. #16 — in-memory token
bucket trên Workers stateless chỉ per-isolate; ship payload/body caps + client debounce,
rate limit cấp infra (WAF/DO) ghi nhận là follow-up.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01…phase-05 (sau khi apply findings).
- Decision deltas checked: 8 (router pin, CSRF guard, snapshot, atomic PATCH, flip-first
  submit, summary gate, param naming, timer removal + flat rendering).
- Reconciled stale references: 0 — grep xác nhận các thuật ngữ cũ (`single-writer`,
  `PATCH merge`, `timeLimitMs` như tính năng, `$quizId` ngoài finding-table,
  `phase-01-start`) không còn xuất hiện ngoài bảng finding/chú thích giải thích.
- Unresolved contradictions: 0.

## Validation Log

### Session 1 — 2026-09-30
**Trigger:** Post red-team gate, pre-GitHub publish (`--github` run).
**Questions asked:** 3

#### Questions & Answers

1. **[Scope]** Reading tools của Selfomy (Tô sáng/Ghi chú/Font Size/Fullscreen) có vào
   plan này không?
   - Options: Defer all tools | Add Font Size + Fullscreen now | Include all tools
   - **Answer:** Defer all tools
   - **Rationale:** Giữ slice nhỏ nhất ship được; tools là follow-up plan riêng.
2. **[Scope]** Retake ("Làm lại") / "Tải bài làm" (download) có vào không?
   - Options: Defer both | Include retake | Include download
   - **Answer:** Defer both
   - **Rationale:** Khớp thiết kế unique(assignmentId, studentId) 1 attempt/lượt giao.
3. **[Scope]** Score card hiển thị thế nào?
   - Options: Raw correct count | Correct/total + percent
   - **Answer:** Raw correct count
   - **Rationale:** Mirror reference Selfomy (Điểm = correctCount + 3 counters).

#### Confirmed Decisions
- Reading tools: defer — Non-Goals giữ nguyên, không thêm phase.
- Retake + download: defer — Non-Goals giữ nguyên.
- Score display: raw correct count — Phase 4 spec đã đúng, không đổi.

#### Action Items
- Không có — cả 3 quyết định khớp trạng thái hiện tại của plan.

#### Impact on Phases
- Không phase nào cần cập nhật.

### Whole-Plan Consistency Sweep
- Files reread: plan.md (Non-Goals, Phase 3/4 requirements) sau answers.
- Decision deltas checked: 3 (tools defer, retake/download defer, score display).
- Reconciled stale references: 0 — Phase 3 không nhắc tools; Phase 4 score card đã là
  correctCount + counters; Non-Goals đã liệt kê đủ.
- Unresolved contradictions: 0.
