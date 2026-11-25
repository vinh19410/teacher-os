---
phase: 2
title: "Phase 2: Student Practice Intro Screen, Navigation & Hydration"
status: completed
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Student Practice Intro Screen, Navigation & Hydration

## Goal

Navigate directly from practice catalog cards to `/learn/quizzes/practice/$testId` without eagerly starting an attempt, render an accessible inline `PracticeIntroScreen` when `source.kind === "practice" && attempt === null`, keep `useStartQuizAttempt` pending until `GET /quiz` refetches, ensure fresh loader state, keyed view resets, and safe one-shot `null -> in_progress` hydration without mid-session store disposal, and route practice exit/back actions back to `/practice/$skill`.

## Files to Create / Modify

- Create: `apps/student/src/components/practice/practice-skill-labels.ts`
- Create: `apps/student/src/components/quiz/practice-intro-screen.tsx`
- Create: `apps/student/test/practice-intro-screen.test.tsx`
- Modify: `apps/student/src/components/practice/skill-catalog.tsx`
- Modify: `apps/student/src/lib/repos/quiz.ts`
- Modify: `apps/student/src/components/quiz/quiz-runtime-header.tsx`
- Modify: `apps/student/src/components/quiz/quiz-take-view.tsx`
- Modify: `apps/student/src/routes/_auth/practice/$skill.tsx`
- Modify: `apps/student/src/routes/_auth/learn/quizzes/practice/$testId.tsx`
- Modify: `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx`
- Modify: `apps/student/src/lib/repos/student.ts`
- Modify: `apps/student/test/quiz-take-view.test.tsx`
- Modify: `apps/student/test/quiz-navigator.test.tsx`

## Tests Before (TDD Red Phase)

### Task 2.1 — Add failing unit tests for `PracticeIntroScreen`, `QuizRuntimeHeader` exitTarget, and `QuizTakeView` practice intro + safe one-shot hydration
<!-- Updated: Red Team Session 1 - added // @vitest-environment jsdom, XSS/null-collection tests, Link mock params interpolation, store-level multi-tab hydration + mid-session refetch stability + org-mismatch/404 error tests -->
- **Goal:** Write failing tests covering all intro screen behaviors, duration formatting, sanitized rich-text description + XSS stripping, collection/testGroup formatting, all 4 skills, Band exclusion, double-click disable, assignment `QuizStartDialog` isolation, practice exit link target with `params`, one-shot multi-tab `attempt: null -> in_progress` store hydration, mid-session refetch stability (no store disposal / no popup `QuizResumeDialog`), and `403 STUDENT_ORG_MISMATCH` / `404` error handling on Start.
- **Target files and symbols:**
  - Create `apps/student/test/practice-intro-screen.test.tsx`
  - Modify `apps/student/test/quiz-take-view.test.tsx`
  - Modify `apps/student/test/quiz-navigator.test.tsx`
- **Steps:**
  1. Create `apps/student/test/practice-intro-screen.test.tsx` starting with `// @vitest-environment jsdom` on line 1 and `afterEach(() => { cleanup(); })`:
     - `formatPracticeTimeLimit`: `null -> "Không giới hạn thời gian"`, `1200 -> "20 phút"`, `3600 -> "60 phút"`, `90 -> "1 phút 30 giây"`, `45 -> "45 giây"`, `undefined -> null`.
     - `getPracticeExitTarget`: `"reading" -> { to: "/practice/$skill", params: { skill: "reading" } }`, `"listening" -> ...`, unknown skill `"grammar" -> { to: "/practice" }`.
     - `PracticeIntroScreen` rendering for Reading (`13 câu hỏi` exact text node, `3 phần`, `60 phút`, `IELTS Trainer 2 · TEST 1`, rich-text `description` `"<p><strong>Lưu ý</strong> đề mẫu</p>"` rendered without raw `<p>`/`<strong>` tags, Reading instructions, `"Bắt đầu làm bài"` + `"Quay lại danh sách"`, no `"Band"` text).
     - `collection: null` with `testGroup: "TEST 6"` renders `"TEST 6"` (never `"null · TEST 6"`).
     - XSS & empty rich-text guard: `description: '<img src=x onerror=alert(1)><p>An toàn</p>'` renders `"An toàn"` with zero `img`/`onerror` attributes; `description: '<script>alert(1)</script>'`, `"<p></p>"`, and `null` hide the description block completely.
     - Omitting `partsCount` hides the parts stat; omitting `timeLimitSeconds` (`undefined`) hides the duration stat.
     - Listening (`hasAudio: true` shows `"Có file nghe"` + Listening instructions without false server-block claims), Writing (`Bài viết` + `tối thiểu 250 từ`, never `"0 câu hỏi"`), and Speaking (`Bài nói · Part 2 · nộp 1 file audio/video (tối đa 50 MB)`, never `"0 câu hỏi"`).
     - Clicking `"Bắt đầu làm bài"` calls `onStart`; when `starting={true}` both `"Đang bắt đầu…"` and `"Quay lại danh sách"` are disabled; clicking `"Quay lại danh sách"` calls `onBack`.
  2. Update `Link` mocks in BOTH `apps/student/test/quiz-navigator.test.tsx` (`lines 16-20`) and `apps/student/test/quiz-take-view.test.tsx` (`lines 41-43`) so `props.params` interpolates `$param` placeholders in `props.to` (e.g., `to="/practice/$skill"` + `params={{ skill: "reading" }}` -> `href="/practice/reading"`).
  3. In `apps/student/test/quiz-navigator.test.tsx`, add tests verifying `QuizRuntimeHeader` renders `href="/"` when `exitTarget` is omitted, `href="/practice/reading"` when `exitTarget={{ to: "/practice/$skill", params: { skill: "reading" } }}`, and `href="/practice"` when `exitTarget={{ to: "/practice" }}`.
  4. In `apps/student/test/quiz-take-view.test.tsx`, add tests asserting:
     - Practice `attempt: null`: renders `PracticeIntroScreen` (`data-testid="practice-intro-screen"`), NO `role="alertdialog"`, passes `null` to `useQuizAudioStream`, header exit link resolves to `href="/practice/reading"`, clicking `"Bắt đầu làm bài"` triggers `startMutation.mutate`, clicking `"Quay lại danh sách"` navigates to `{ to: "/practice/$skill", params: { skill: "reading" } }`.
     - Assignment `attempt: null`: STILL renders `role="alertdialog"` (`"Bắt đầu làm bài"`) via `QuizStartDialog` with `href="/"` header exit link.
     - One-shot multi-tab hydration + active store proof: mount `QuizTakeView` with `attempt: null, serverAnswers: {}`, then rerender with `attempt: { id: "att-1", status: "in_progress", answers: { "0": "B" }, essay: "", media: null }` -> NO `QuizResumeDialog` overlays the user who just started, `store` is active (`navigator-progress` shows `Đã trả lời 1/2 câu`), question 1 radio `"B"` is checked, AND answering question 2 (`q = 1`) updates progress to `Đã trả lời 2/2 câu` and calls `patchQuizAnswer("att-1", 1, ...)` (proving live store, not read-only fallback!).
     - Mid-session refetch stability: mount with `attempt: null, serverAnswers: {}`, transition to `attempt: { id: "att-2", status: "in_progress", answers: {} }`, answer question 1 (`"A"`), then rerender with a simulated background refetch returning `attempt: { id: "att-2", status: "in_progress", answers: { "0": "A" } }` -> assert `QuizResumeDialog` does NOT appear, active store is NOT disposed, and subsequent edits on question 2 still work.
     - Stale cache error on intro: when `attempt === null` and `quizQuery.isError === true`, `QuizTakeView` renders `<QuizTakeError />` instead of stale `PracticeIntroScreen`.
     - Existing `hides band on start gate for practice auto-graded quiz without hybrid writing` test (`quiz-take-view.test.tsx:355-380`) stays intact and still asserts `screen.getByText("2 câu hỏi", { exact: true })` and `not.toContain("Band")`.
- **Success criteria:** Tests fail because `practice-intro-screen.tsx` and the new props/branches do not exist yet.
- **Verify:** `pnpm --filter student test -- test/practice-intro-screen.test.tsx test/quiz-take-view.test.tsx test/quiz-navigator.test.tsx` exits non-zero (expected red state; exiting 0 here is a failure).

## Refactor / Implementation (TDD Green Phase)

### Task 2.2 — Extract pure `PRACTICE_SKILL_LABELS`, return invalidation promise in `useStartQuizAttempt`, and add type-safe `exitTarget` to `QuizRuntimeHeader`
<!-- Updated: Red Team Session 1 - extract PRACTICE_SKILL_LABELS from skill-catalog.tsx to avoid env/web import in jsdom tests; branch 3 <Link> elements for strict TS; return invalidateQueries promise in useStartQuizAttempt -->
- **Goal:** Avoid pulling `@teacher-os/env/web` into `PracticeIntroScreen`/`QuizTakeView`, keep `startMutation.isPending` true until `GET /quiz` finishes, and support type-safe practice exit links in `QuizRuntimeHeader`.
- **Target files and symbols:**
  - Create `apps/student/src/components/practice/practice-skill-labels.ts` (`PRACTICE_SKILL_LABELS`)
  - Modify `apps/student/src/components/practice/skill-catalog.tsx` (re-export `PRACTICE_SKILL_LABELS` from `./practice-skill-labels`)
  - Modify `apps/student/src/lib/repos/quiz.ts` (`useStartQuizAttempt`)
  - Modify `apps/student/src/components/quiz/quiz-runtime-header.tsx` (`QuizRuntimeHeader`, `QuizRuntimeExitTarget`)
- **Steps:**
  1. Create `apps/student/src/components/practice/practice-skill-labels.ts` importing only `type { PracticeSkill } from "@teacher-os/api/contracts"` and exporting `PRACTICE_SKILL_LABELS`. Re-export `PRACTICE_SKILL_LABELS` from `apps/student/src/components/practice/skill-catalog.tsx` so existing imports remain untouched.
  2. In `apps/student/src/lib/repos/quiz.ts` (`useStartQuizAttempt`, lines 195-205), change `onSuccess` from `void queryClient.invalidateQueries(...)` to `return queryClient.invalidateQueries({ queryKey: quizDetailQueryKey(source) })` so `startMutation.isPending` stays `true` until the refetched `detail` arrives.
  3. In `apps/student/src/components/quiz/quiz-runtime-header.tsx`:
     - Export `QuizRuntimeExitTarget`:
       ```ts
       export type QuizRuntimeExitTarget =
         | { to: "/" }
         | { to: "/practice" }
         | { to: "/practice/$skill"; params: { skill: PracticeSkill } };
       ```
     - Add optional prop `exitTarget?: QuizRuntimeExitTarget` (default `{ to: "/" }`).
     - Render 3 separate strict-TS `<Link>` branches (`exitTarget.to === "/practice/$skill"`, `exitTarget.to === "/practice"`, else `"/"`) matching `apps/student/src/routes/_auth/practice/vocabulary/$deckId.tsx:62-77`.
- **Success criteria:** `quiz-navigator.test.tsx` passes and `QuizRuntimeHeader` passes strict TS.
- **Verify:** `pnpm --filter student test -- test/quiz-navigator.test.tsx` exits 0.

### Task 2.3 — Create `PracticeIntroScreen` component and helpers
<!-- Updated: Red Team Session 1 - safe collection/testGroup join, DOMPurify-backed hasVisibleRichText guard, honest Listening copy, pure skill label import -->
- **Goal:** Build a polished, accessible, responsive inline intro screen following `DESIGN.md` (shadcn neutral oklch, light/dark, no Band, no hardcoded hex, clean mobile reflow at 320px/375px).
- **Target files and symbols:** Create `apps/student/src/components/quiz/practice-intro-screen.tsx` (`PracticeIntroScreen`, `formatPracticeTimeLimit`, `getPracticeExitTarget`).
- **Steps:**
  1. Import `PRACTICE_SKILL_LABELS` from `@/components/practice/practice-skill-labels` (NEVER from `skill-catalog.tsx`), `isEmptyRichText` from `@teacher-os/api/rich-text`, `RichTextBody` from `@teacher-os/ui/components/assignments/rich-text-body`, and `sanitizeRichText` from `@teacher-os/ui/lib/rich-text-sanitize`.
  2. Implement `formatPracticeTimeLimit(seconds: number | null | undefined): string | null`:
     - `undefined` -> `null`
     - `null` -> `"Không giới hạn thời gian"`
     - `> 0`: `mins = Math.floor(seconds / 60)`, `secs = seconds % 60`; return `${mins} phút ${secs} giây` / `${mins} phút` / `${secs} giây`.
  3. Implement `getPracticeExitTarget(skill: string): QuizRuntimeExitTarget`:
     - If `(PRACTICE_SKILLS as readonly string[]).includes(skill)` return `{ to: "/practice/$skill", params: { skill: skill as PracticeSkill } }`; else return `{ to: "/practice" }`.
  4. Implement `hasVisibleRichText(raw: string | null | undefined): raw is string`:
     - Return `false` if `!raw`.
     - Compute `const candidate = typeof document !== "undefined" ? sanitizeRichText(raw) : raw;` and return `!isEmptyRichText(candidate)`.
  5. Compute `collectionMeta = [detail.collection, detail.testGroup].map((v) => v?.trim()).filter(Boolean).join(" · ")` (never produces `"null · ..."`).
  6. Implement `PracticeIntroScreen` (`data-testid="practice-intro-screen"`):
     - Container: `<main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col justify-center px-4 py-8">` containing a `<section className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm sm:p-8">`.
     - Top badges row (`flex flex-wrap items-center gap-2`): Skill badge (`PRACTICE_SKILL_LABELS[skill]` fallback `detail.skill`) + optional `collectionMeta` badge. Never render `detail.band`.
     - Heading: `<h2 className="mt-3 font-semibold text-2xl text-foreground tracking-tight sm:text-3xl">{detail.title}</h2>`.
     - Stat summary `<dl>` grid (`mt-5 grid gap-3 sm:grid-cols-2 md:grid-cols-3`, responsive at 320px/375px):
       - **Quy mô / Nội dung** (always present):
         - Speaking: `Bài nói${speakingPartLabel ? ` · ${speakingPartLabel}` : ""} · nộp 1 file audio/video (tối đa 50 MB)`
         - Writing: `Bài viết${minWords !== null ? ` · tối thiểu ${minWords} từ` : ""}`
         - Auto-graded: exact text node `{questionCount} câu hỏi` (or `{questionCount} câu hỏi + Bài viết` if `hasHybridWriting`)
       - **Số phần** (only when `typeof detail.partsCount === "number"`): `{detail.partsCount} phần`
       - **Thời lượng** (only when `durationLabel !== null`): `{durationLabel}`
       - **Âm thanh** (only when `detail.skill === "listening" && detail.hasAudio`): `Có file nghe`
     - Optional description block (only when `hasVisibleRichText(detail.description)`): `<RichTextBody text={detail.description} className="text-muted-foreground text-sm leading-relaxed" />`.
     - General instructions section (`Hướng dẫn chung`) with honest, skill-specific bullets:
       - Common: thời gian làm bài và lượt làm chỉ bắt đầu được ghi nhận khi bạn bấm **Bắt đầu làm bài**; các câu trả lời được lưu tự động trong lúc làm (trừ Speaking lưu khi tải tệp).
       - Reading: đọc kỹ bài đọc và hoàn thành các câu hỏi; sau khi nộp bài bạn sẽ xem được điểm và đáp án chi tiết.
       - Listening: kiểm tra loa hoặc tai nghe trước khi bắt đầu; trình phát âm thanh sẽ xuất hiện khi bạn vào làm bài; sau khi nộp bài bạn sẽ xem được điểm và đáp án chi tiết.
       - Writing: đọc kỹ yêu cầu đề bài và viết bài trong khung soạn thảo (chú ý số từ tối thiểu nếu có); bài viết sẽ được giáo viên chấm sau khi nộp.
       - Speaking: chuẩn bị thiết bị ghi âm/quay video trước khi bắt đầu và tải lên 1 tệp audio/video (tối đa 50 MB); bài nói sẽ được giáo viên chấm sau khi nộp.
     - Action footer (`mt-6 flex flex-col-reverse gap-2 border-border border-t pt-5 sm:flex-row sm:items-center sm:justify-end`):
       - Secondary button (`variant="outline"`): `"Quay lại danh sách"` (`onClick={onBack}`, `disabled={starting}`)
       - Primary button (`variant="default"`): `starting ? "Đang bắt đầu…" : "Bắt đầu làm bài"` (`data-testid="practice-start-btn"`, `onClick={onStart}`, `disabled={starting}`)
- **Success criteria:** `practice-intro-screen.test.tsx` passes completely.
- **Verify:** `pnpm --filter student test -- test/practice-intro-screen.test.tsx` exits 0.

### Task 2.4 — Wire `PracticeIntroScreen`, exit target, one-shot hydration, and Start error handling into `QuizTakeView`
<!-- Updated: Red Team Session 1 - fixed critical mid-session store disposal bug via one-shot startedBaselineRef + gate-start confirmation; declared isWriting early; defined handleStartAttempt with 403 org-mismatch & 404 handling + quizQuery.isError guard on intro -->
- **Goal:** Use `PracticeIntroScreen` for `source.kind === "practice" && attempt === null`, preserve `QuizStartDialog` for assignments, route practice exit/cancel to `/practice/$skill`, hydrate answers/essay safely ONCE on `attempt: null -> in_progress` transition without ever disposing active stores on later refetches, and handle Start errors cleanly.
- **Target files and symbols:** `apps/student/src/components/quiz/quiz-take-view.tsx` (`QuizTakeView`).
- **Steps:**
  1. Compute `sourceKind = source.kind`, `sourceId = quizTakeSourceId(source)`, `sourceKey = `${sourceKind}:${sourceId}``, `isWriting = detail?.skill === "writing"`, `isSpeaking = detail?.skill === "speaking"`, `hybridWriting = detail?.writing ?? null`, `hasHybridWriting = hybridWriting !== null` BEFORE baseline/resume calculations.
  2. Replace dynamic ref recalculation with a **one-shot frozen baseline ref** scoped to `sourceKey`:
     ```ts
     const gateLifecycleRef = useRef<{
       sourceKey: string;
       startedFromNull: boolean | null;
       hydratedAttemptId: string | null;
       hydratedAnswers: Record<string, string>;
       hydratedEssay: string;
     }>({
       sourceKey,
       startedFromNull: null,
       hydratedAttemptId: null,
       hydratedAnswers: {},
       hydratedEssay: "",
     });
     if (gateLifecycleRef.current.sourceKey !== sourceKey) {
       gateLifecycleRef.current = {
         sourceKey,
         startedFromNull: null,
         hydratedAttemptId: null,
         hydratedAnswers: {},
         hydratedEssay: "",
       };
     }
     if (gateLifecycleRef.current.startedFromNull === null && detail !== null) {
       gateLifecycleRef.current.startedFromNull = detail.attempt === null;
     }
     if (
       gateLifecycleRef.current.startedFromNull === true &&
       attempt !== null &&
       gateLifecycleRef.current.hydratedAttemptId !== attempt.id
     ) {
       gateLifecycleRef.current.hydratedAttemptId = attempt.id;
       gateLifecycleRef.current.hydratedAnswers = isWriting
         ? attempt.essay
           ? { "0": attempt.essay }
           : {}
         : attempt.answers;
       gateLifecycleRef.current.hydratedEssay = hasHybridWriting
         ? (attempt.essay ?? "")
         : "";
     }
     const startedFromGate = gateLifecycleRef.current.startedFromNull === true;
     const effectiveServerAnswers =
       startedFromGate && gateLifecycleRef.current.hydratedAttemptId === attemptId
         ? gateLifecycleRef.current.hydratedAnswers
         : serverAnswers;
     const effectiveServerEssay =
       startedFromGate && gateLifecycleRef.current.hydratedAttemptId === attemptId
         ? gateLifecycleRef.current.hydratedEssay
         : serverEssay;
     ```
     - Note why this is 100% immune to Finding 2:
       1. Once `hydratedAttemptId === attempt.id` is captured on the first `null -> non-null` render, subsequent background refetches NEVER mutate `effectiveServerAnswers` or `effectiveServerEssay`.
       2. `needsResumeDialog` also requires `!startedFromGate` (`!startedFromGate && attempt !== null && attempt.status === "in_progress" && serverHasAnswers && !resumeConfirmed`), because a user who JUST clicked `"Bắt đầu làm bài"` from the intro/start gate already explicitly confirmed entering the test (so multi-tab resume hydrates directly into the active store instead of throwing a redundant second dialog on top of Start, and subsequent refetches can NEVER flip `needsResumeDialog` to `true` or dispose the active store!).
  3. Compute `exitTarget`:
     - `source.kind === "practice" ? getPracticeExitTarget(detail?.skill ?? "") : ({ to: "/" } as const)`.
     - Define `navigateToExit = () => { if (exitTarget.to === "/practice/$skill") { void navigate({ to: "/practice/$skill", params: exitTarget.params }); } else { void navigate({ to: exitTarget.to }); } };`.
  4. Define `handleStartAttempt`:
     ```ts
     const handleStartAttempt = () =>
       startMutation.mutate(undefined, {
         onError: (error) => {
           if (isHttpError(error) && error.status === 409) {
             void queryClient.invalidateQueries({
               queryKey: quizDetailQueryKey(source),
             });
             return;
           }
           if (isStudentOrgMismatchError(error)) {
             toast.error(
               "Tổ chức học tập vừa thay đổi — vui lòng tải lại trang.",
             );
             return;
           }
           if (isHttpError(error) && error.status === 404) {
             void queryClient.invalidateQueries({
               queryKey: quizDetailQueryKey(source),
             });
             toast.error("Đề luyện tập này hiện không còn khả dụng.");
             return;
           }
           toast.error("Không bắt đầu được bài làm", {
             description: "Vui lòng kiểm tra kết nối rồi thử lại.",
           });
         },
       });
     ```
  5. Before the `if (attempt === null)` branch, add stale-cache error guard:
     ```ts
     if (attempt === null && quizQuery.isError) {
       return <QuizTakeError error={quizQuery.error} />;
     }
     ```
  6. Pass `exitTarget={exitTarget}` to `<QuizRuntimeHeader />` in both `attempt === null` and active take branches, and call `navigateToExit()` in `QuizResumeDialog.onCancel` and `QuizStartDialog.onCancel`.
  7. In `if (attempt === null)`:
     - When `source.kind === "practice"`, render `<QuizRuntimeHeader ... exitTarget={exitTarget} />` + `<PracticeIntroScreen detail={detail} questionCount={allQuestions.length} hasHybridWriting={hasHybridWriting} minWords={minWords} speakingPartLabel={speakingPartLabel} starting={startMutation.isPending} onStart={handleStartAttempt} onBack={navigateToExit} />`.
     - When `source.kind === "assignment"`, keep the existing gate card + `<QuizStartDialog ... onStart={handleStartAttempt} onCancel={navigateToExit} />` unchanged.
- **Success criteria:** All tests in `quiz-take-view.test.tsx`, `practice-intro-screen.test.tsx`, and `quiz-navigator.test.tsx` pass.
- **Verify:** `pnpm --filter student test -- test/quiz-take-view.test.tsx test/practice-intro-screen.test.tsx test/quiz-navigator.test.tsx` exits 0.

### Task 2.5 — Stop eager `POST /attempts` on catalog click, harden practice loader, key `<QuizTakeView>`, and remove dead `useStartPractice`
<!-- Updated: Red Team Session 1 - add key={testId} and key={assignmentId} on <QuizTakeView> -->
- **Goal:** Make clicking a practice card navigate directly to `/learn/quizzes/practice/$testId`, ensure the route loader fetches fresh server attempt state (`staleTime: 0`) and cleans essay mirror on submitted redirect, isolate `QuizTakeView` state per route param via `key`, and remove dead `startPractice` / `useStartPractice` exports.
- **Target files and symbols:**
  - `apps/student/src/routes/_auth/practice/$skill.tsx` (`PracticeSkillPage`, `handleOpen`)
  - `apps/student/src/routes/_auth/learn/quizzes/practice/$testId.tsx` (`Route.loader`, `TakePracticePage`)
  - `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx` (`TakeAssignmentPage`)
  - `apps/student/src/lib/repos/student.ts` (remove `startPractice`, `useStartPractice`, unused imports)
- **Steps:**
  1. In `apps/student/src/routes/_auth/practice/$skill.tsx`:
     - Remove unused `toast` import and `useStartPractice` import/call.
     - Replace `handleOpen` body with direct navigation to `{ to: "/learn/quizzes/practice/$testId", params: { testId: item.testId } }`.
  2. In `apps/student/src/routes/_auth/learn/quizzes/practice/$testId.tsx`:
     - Replace `studentQueryClient.ensureQueryData(quizDetailQueryOptions(source))` with `studentQueryClient.fetchQuery({ ...quizDetailQueryOptions(source), staleTime: 0 })`.
     - Import `quizAttemptEssayMirrorKey` alongside `quizAttemptMirrorKey` and clear both on `detail.attempt?.status === "submitted"` redirect.
     - Render `<QuizTakeView key={testId} source={{ kind: "practice", testId }} serverAnswers={serverAnswers} />`.
  3. In `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx`:
     - Render `<QuizTakeView key={assignmentId} source={{ kind: "assignment", id: assignmentId }} serverAnswers={serverAnswers} serverEssay={serverEssay} />`.
  4. In `apps/student/src/lib/repos/student.ts`:
     - Remove `startPractice` and `useStartPractice` (lines 752-787) and any unused `StartPracticeResponse` / `startPracticeResponseSchema` / `useMutation` imports (keep `useMutation` if still used elsewhere in the file).
- **Success criteria:** Zero references to `useStartPractice` remain, all student unit tests and typecheck pass.
- **Verify:** `pnpm --filter student test && pnpm --filter student check-types` exits 0.

## Tests After & Regression Gate

### Task 2.6 — Run package lint, typecheck, and unit test gate
- **Goal:** Verify all student, api, and server lint/typecheck/unit checks pass after Phase 2 edits.
- **Target files and symbols:** `apps/student`, `packages/api`, `apps/server`.
- **Steps:**
  1. Run biome check, typecheck, and unit tests.
- **Success criteria:** Zero errors across lint, types, and unit tests.
- **Verify:** `pnpm exec biome check apps/student packages/api apps/server && pnpm --filter student test && pnpm --filter student check-types` exits 0.

## Todo

- [x] Task 2.1: Write failing unit tests for `PracticeIntroScreen`, `QuizRuntimeHeader`, and `QuizTakeView`
- [x] Task 2.2: Extract `practice-skill-labels.ts`, return invalidation promise in `useStartQuizAttempt`, and add `exitTarget` to `QuizRuntimeHeader`
- [x] Task 2.3: Implement `PracticeIntroScreen`, `formatPracticeTimeLimit`, and `getPracticeExitTarget`
- [x] Task 2.4: Wire `PracticeIntroScreen`, practice exit target, one-shot hydration, and Start error handling into `QuizTakeView`
- [x] Task 2.5: Update `$skill.tsx`, harden `practice/$testId.tsx` loader, key `<QuizTakeView>`, remove dead `startPractice`/`useStartPractice`
- [x] Task 2.6: Run Phase 2 regression gate

## Success Criteria

- Clicking a practice card navigates directly to `/learn/quizzes/practice/$testId` without calling `POST /attempts`.
- `PracticeIntroScreen` displays accurate metadata, duration, optional sanitized rich-text description, and skill instructions without leaking `Band` or mounting audio playback.
- One-shot multi-tab hydration, mid-session refetch stability, Start error/stale-cache recovery, loader freshness, and assignment `QuizStartDialog` isolation are proven by automated tests.

## Failure Protocol

If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
