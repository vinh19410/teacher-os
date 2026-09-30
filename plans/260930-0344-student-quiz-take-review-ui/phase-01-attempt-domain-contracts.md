---
phase: 1
title: "Attempt domain — DB, contracts, server routes, grading"
status: done
priority: P1
effort: "5h"
dependencies: []
---

# Phase 1: Attempt domain — DB, contracts, server routes, grading

<!-- Updated: Red Team Session 1 — auth/CSRF pinning, questions snapshot, atomic json_set PATCH, flip-first submit, summary gate, ownership predicate -->

## Goal

Thêm tầng dữ liệu + API cho lượt làm bài: bảng `quiz_attempt` (kèm snapshot đề), wire
contracts, 6 endpoint `/api/student/*` (lấy đề sạch, start/resume, autosave 1 câu, submit
+ chấm, summary, detail), grading pure function.

## Context Links

- `research/scout-evidence.md` — greenfield anchors + conventions.
- `packages/db/src/schema/class-assignment.ts` — unit giao bài + targets (title-snapshot
  precedent: đề đổi sau khi giao không ảnh hưởng bài đã giao).
- `packages/api/src/contracts.ts:450-510` — prompt schema với `questions[].answer`/`alts`.
- `apps/server/src/routes/student.ts:180-203` (session/role gate trong closure),
  `:129-178` (per-path CSRF Origin guard), `:395` (`requireStudent` — closure, không
  export được).
- `apps/server/src/routes/assignments/index.ts:11-13` — quy tắc "never mount standalone".

## Key Insights

- **Không tách file router**: `requireStudent` là closure trong `studentRoutes()` và
  `bootstrapMiddleware` bỏ qua `/api/student` (app.ts:50-55) — một router mount riêng sẽ
  KHÔNG có auth. Mọi endpoint mới khai báo ngay trong `studentRoutes()`
  (`apps/server/src/routes/student.ts`), đăng ký `router.use("/assignments/*", requireStudent)`
  và `router.use("/attempts/*", requireStudent)`. [RT#1]
- **CSRF**: cookies SameSite=None → mọi POST/PATCH mới phải qua Origin-allowlist +
  `Content-Type: application/json` middleware (mirror `student.ts:131-149` cho
  `/onboarding`), kèm body-size cap như onboarding (4096 bytes). [RT#2]
- **Snapshot đề lúc start**: teacher có thể PATCH prompt (questions/answer) sau khi giao
  mà không có guard (`routes/assignments/index.ts:133-178`) → attempt lưu
  `questionsSnapshot` (đầy đủ key) tại start; take-render + grading chỉ đọc snapshot. [RT#3]
- Grading: normalize `trim + collapse ws + lowercase`; candidates = `[answer, ...alts.split(" / ")]`
  (separator pin " / "); choice so exact-after-normalize. Multi-part ("B / E" kiểu
  chọn-2) — kiểm tra cách authoring lưu answer cho type `features`/multi trước khi quyết
  thêm so sánh multiset; nếu có, split parts theo " / " và so multiset. [RT#15]
- Leak rule: take payload KHÔNG chứa `answer`/`alts`/`note`; summary + detail CHỈ trả
  key/verdict khi `status === 'submitted'` (in_progress → 409). [RT#6]
- 1 attempt / (assignmentId, studentId) — không retake v1.

## Requirements

- [x] Bảng `quiz_attempt` + migration (`pnpm db:generate`): `id, orgId, assignmentId FK
      class_assignment, studentId FK student, status 'in_progress'|'submitted',
      questionsSnapshot TEXT (JSON đầy đủ key), answers TEXT (JSON `{"<qIndex>":"<value>"}`),
      correctCount INTEGER nullable, startedAt INTEGER ms, submittedAt INTEGER ms nullable`;
      `unique(assignmentId, studentId)`; index orgId.
- [x] Contracts: `studentQuizDetailSchema` (sanitized), `quizAnswerPatchSchema`,
      `quizSubmitResultSchema`, `quizAttemptSummarySchema`, `quizAttemptDetailSchema`.
- [x] 6 endpoint trong `studentRoutes()` với `requireStudent` + CSRF Origin guard +
      target-ownership predicate.
- [x] `gradeQuiz` pure fn + unit tests (case-insensitivity, " / " alts, empty, skipped,
      multiset nếu authoring có multi-part).
- [x] Submit stamp `class_assignment_target.submittedAt` (ISO datetime) — đóng non-goal #208.

## Architecture

```
GET  /api/student/assignments/:assignmentId/quiz
     → { quiz: sanitized questionsSnapshot (no answer/alts/note), attempt?: {id, answers, status} }
POST /api/student/assignments/:assignmentId/quiz/start → { attemptId }   (snapshot đề tại đây)
PATCH /api/student/attempts/:attemptId/answer {q, value} → {ok}
POST /api/student/attempts/:attemptId/submit → {correctCount, totalCount, wrongCount, skippedCount}
GET  /api/student/attempts/:attemptId → summary   (409 khi in_progress)
GET  /api/student/attempts/:attemptId/detail → full + verdicts + note (409 khi in_progress)
```

**Autosave PATCH — atomic, không read-modify-write** (D1 không có transaction,
`assignments/tests.ts:30-31`):

```sql
UPDATE quiz_attempt
SET answers = json_set(answers, '$.' || :q, json(:value))
WHERE id = :id AND org_id = :org AND student_id = :student AND status = 'in_progress'
```

`changes() === 0` → 404 (sai chủ) hoặc 409 (đã submit — phân biệt bằng lần đọc status
sau đó). Predicate `org_id + student_id` chính là ownership check (IDOR) — không query
riêng. [RT#4]

**Submit — flip-first idempotent** [RT#5]:
1. `UPDATE quiz_attempt SET status='submitted', submittedAt=:now WHERE id=:id AND
   status='in_progress' AND org_id=… AND student_id=…` — 0 rows → attempt đã submit →
   trả counts đã lưu (200 idempotent, không chấm lại, không stamp lại).
2. Đọc answers + questionsSnapshot → grade → `db.batch([UPDATE counts, stamp target
   submittedAt])` (batch = precedent nguyên tử).

**Start**: catch unique-constraint race → re-read và trả attempt hiện có (idempotent
resume; backstop pattern `enrollment-activation.ts:206-209`). 409 nếu đã `submitted`.

**Rate/size caps** [RT#16]: `value ≤ 500` chars, `q` trong phạm vi snapshot, body ≤ 4096
bytes; client-side debounce (Phase 3) là tiết lưu chính — ghi chú trong plan rằng
per-request rate limit cấp infra (WAF/DO) là follow-up, không dựng DO bucket trong plan này.

## Files to Create / Modify

- Create: `packages/db/src/schema/quiz-attempt.ts`; migration qua drizzle-kit.
- Modify: `packages/db/src/schema/index.ts` (export), `packages/api/src/contracts.ts`
  (student section), `apps/server/src/routes/student.ts` (thêm 6 endpoint + 2
  `router.use` requireStudent + Origin/CT guard cho paths mới — KHÔNG file router riêng).
- Create: `apps/server/src/lib/grade-quiz.ts` + `apps/server/src/lib/grade-quiz.test.ts`.
- Create: `apps/server/src/routes/student-quiz.test.ts` (pattern libsql harness như
  `student.test.ts`).

## Implementation Steps

1. Schema `quiz_attempt` (kèm `questionsSnapshot`) + export + `pnpm db:generate` + apply
   theo flow chuẩn.
2. Contracts: zod `.strict()` cho body (mirror `lessonActionSchema`); `q` number 0-based;
   `value` string max 500.
3. `gradeQuiz(snapshotQuestions, answers)`: per-question verdict correct/wrong/skipped +
   counters; normalize như Key Insights; viết unit tests trước khi viết routes.
4. Routes trong `studentRoutes()`: `router.use("/assignments/:assignmentId/quiz*")` và
   `/attempts/*` qua `requireStudent`; Origin/CT middleware cho POST + PATCH; start
   (snapshot + unique-race backstop), GET quiz (sanitize snapshot), PATCH answer (sql
   atomic ở trên), submit (flip-first), summary/detail (gate `submitted`).
5. Sanitizer: snapshot → bỏ `answer`, `alts`, `note`; giữ `stem, opts, pin, optionBank`.
6. Tests: (a) mọi endpoint mới 401 khi không có session cookie; (b) POST sai Origin → 403;
   (c) student cùng org không phải chủ attempt → 404 cả 4 endpoint `/attempts/*`;
   (d) start idempotent + 409 sau submit; (e) 2 PATCH interleaved (q3, q7) → cả hai còn
   nguyên; (f) double submit → response giống hệt, không re-stamp; (g) PATCH sau submit →
   409; (h) edit prompt giữa chừng (PATCH /api/assignments/prompts/:id) → resume + grading
   dùng snapshot, không đổi; (i) GET quiz + GET summary (in_progress) không chứa chuỗi key.

## Todo

- [x] Schema + migration quiz_attempt (questionsSnapshot)
- [x] Contracts student quiz/attempt
- [x] gradeQuiz + unit tests (tdd trước routes)
- [x] 6 endpoints trong studentRoutes() + requireStudent + Origin/CT guard
- [x] Atomic PATCH + flip-first submit + snapshot render/grade
- [x] Route tests (401/403/404/idempotency/races/snapshot/leak)

## Success Criteria

- `pnpm --filter server test` xanh với toàn bộ cases (a)–(i); JSON GET quiz không chứa
  key theo assert test.

## Risk Assessment

- Migration D1 production: theo `production-release-runbook.md`; bảng mới, rủi ro thấp.
- json_set path `'$.q'` với q là number — dùng `'$.{"<q>"}'` string key nhất quán với
  format JSON lưu (test sẽ pin).

## Security Considerations

- AuthN/Z: endpoints chỉ trong `studentRoutes()`, requireStudent per-path; ownership =
  predicate trong WHERE mọi statement.
- CSRF: Origin allowlist + Content-Type JSON cho POST/PATCH mới (SameSite=None cookies).
- Leak: strip answer/alts/note ở take; summary + detail gate `submitted`.
- Input caps: value ≤ 500, q trong range, body ≤ 4096 bytes.

## Next Steps

→ Phase 2 (renderer extraction) — song song được; Phase 3 consume 1 + 2.
