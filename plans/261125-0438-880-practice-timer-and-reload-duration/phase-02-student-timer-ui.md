---
phase: 2
title: "Phase 2: Student Practice Countdown Timer & Header Reflow"
status: done
priority: P1
effort: "1.5h"
dependencies: [1]
---

# Phase 2: Student Practice Countdown Timer & Header Reflow

<!-- Updated: Red Team Session 2026-11-25 - Extracted leaf QuizTimerBadge (no per-second QuizPaper/DOMPurify re-renders, stops at 00:00), synced X-Server-Now in fetchStudentQuizDetail + preserved updatedAt in setQuizDetailMedia, added shrink-0 on header + flex-1 min-h-0 wrapper around QuizReadingSplitLayout fillParent, synchronous useRef click lock spanning navigate, 320px header budget under saving + 3-digit timer -->

## Goal

Sync client-server clock offset from the `X-Server-Now` HTTP header at fetch time, render a leaf `<QuizTimerBadge>` (`MM:SS`) with warning threshold and soft-expiry banner without triggering per-second `QuizPaper` re-renders, keep Reading split-pane height locked to `100svh` even when banners appear, guard `PracticeSkillPage` with a synchronous `useRef` lock spanning navigation, and tighten `QuizRuntimeHeader` for `320px` reflow.

## Files to Create / Modify

- Modify: `apps/student/src/lib/attempt-format.ts` (`formatQuizClock`, `computeQuizClockSkewMs`, `computeQuizTimerState`, `syncServerClock`, `getServerClockSkewMs`, `resetServerClockForTests`)
- Modify: `apps/student/test/attempt-summary.test.tsx`
- Modify: `apps/student/src/lib/repos/quiz.ts` (capture `X-Server-Now` in `fetchStudentQuizDetail`, preserve `updatedAt` in `setQuizDetailMedia`)
- Create: `apps/student/src/components/quiz/quiz-timer-badge.tsx` (`QuizTimerBadge` leaf component)
- Modify: `apps/student/src/components/quiz/quiz-runtime-header.tsx` (`shrink-0`, compact `< sm` spacing)
- Modify: `apps/student/test/quiz-navigator.test.tsx`
- Modify: `apps/student/src/components/quiz/quiz-take-view.tsx` (mount `<QuizTimerBadge>`, one-shot `timeExpired` state + soft-expiry banner, `lg:h-svh` + `flex-1 min-h-0` wrapper around `QuizReadingSplitLayout fillParent`, Start Gate duration metadata)
- Modify: `apps/student/test/quiz-take-view.test.tsx`
- Modify: `apps/student/src/routes/_auth/practice/$skill.tsx` (synchronous `useRef` + `openingTestId` lock across `POST` and `await navigate`)
- Modify: `apps/student/src/components/practice/skill-catalog.tsx` (`openingTestId` disables `TestCard`)
- Modify: `apps/student/src/components/practice/practice-catalog.test.tsx`

## Tests Before (TDD Red Phase)

### Task 2.1 — Write failing unit tests for pure quiz timer & server-clock sync helpers
- **Goal:** Define exact behavior of clock formatting, skew sync/compensation, warning threshold, and expiry before implementation.
- **Target files and symbols:** `apps/student/test/attempt-summary.test.tsx` (importing `formatQuizClock`, `computeQuizClockSkewMs`, `computeQuizTimerState`, `syncServerClock`, `getServerClockSkewMs`, `resetServerClockForTests` from `@/lib/attempt-format`).
- **Steps:**
  1. Add tests asserting:
     - `formatQuizClock`: `1200 -> "20:00"`, `600 -> "10:00"`, `3600 -> "60:00"`, `14400 -> "240:00"`, `59 -> "00:59"`, `0 -> "00:00"`, `-10 -> "00:00"`, `NaN -> "00:00"`.
     - `computeQuizClockSkewMs(serverNowIso, receivedAtMs)`: returns `receivedAtMs - Date.parse(serverNowIso)` when valid, `0` when missing/invalid.
     - `syncServerClock` / `getServerClockSkewMs` / `resetServerClockForTests`: records skew on valid ISO string, ignores null/invalid strings (preserving prior value), resets to `0`.
     - `computeQuizTimerState({ timeLimitSeconds, startedAt, nowMs, clockSkewMs })`:
       - returns `null` when `timeLimitSeconds` is `null`/`undefined`/`<= 0` or `startedAt` is missing/invalid;
       - computes `remainingSeconds = Math.max(0, timeLimitSeconds - Math.max(0, Math.floor((nowMs - clockSkewMs - startedAtMs) / 1000)))`;
       - `phase`: `"running"` above warn threshold, `"warn"` at/below `Math.min(300, Math.floor(timeLimitSeconds * 0.2))` (`<= 120s` for 10m, `<= 240s` for 20m, `<= 300s` for 60m) and `> 0`, `"expired"` when `0`;
       - produces identical remaining time for client clocks skewed +5m or -5m once `clockSkewMs` is supplied;
       - clamps negative elapsed (minor sub-second jitter) to `0` so remaining never exceeds `timeLimitSeconds`.
- **Success criteria:** Tests fail because the helpers do not exist yet.
- **Verify:** `pnpm --filter student exec vitest run test/attempt-summary.test.tsx` exits non-zero with missing export error (expected TDD red state; passing before Task 2.2 is a failure).

## Implementation & Refactor

### Task 2.2 — Implement pure timer & server-clock sync helpers and wire `X-Server-Now` + `setQuizDetailMedia` preservation
- **Goal:** Provide deterministic timer utilities and capture `X-Server-Now` directly at HTTP receipt time in `fetchStudentQuizDetail`, while ensuring `setQuizDetailMedia` preserves `dataUpdatedAt`.
- **Target files and symbols:** `apps/student/src/lib/attempt-format.ts`, `apps/student/src/lib/repos/quiz.ts` (`request`, `fetchStudentQuizDetail`, `setQuizDetailMedia`).
- **Steps:**
  1. In `apps/student/src/lib/attempt-format.ts`, implement and export `formatQuizClock`, `computeQuizClockSkewMs`, `computeQuizTimerState`, `syncServerClock`, `getServerClockSkewMs`, and `resetServerClockForTests`.
  2. In `apps/student/src/lib/repos/quiz.ts`:
     - In `request(...)` (lines 94–157), right after confirming `res.ok`, read `const serverNow = res.headers.get("X-Server-Now"); if (serverNow) syncServerClock(serverNow, Date.now());` (works transparently across both GET `/quiz` and any future response carrying `X-Server-Now`, without mutating parsed JSON!).
     - In `setQuizDetailMedia` (lines 967–981), preserve existing cache timestamp: `const prevUpdatedAt = queryClient.getQueryState(queryKey)?.dataUpdatedAt; queryClient.setQueryData<StudentQuizDetail>(queryKey, ..., prevUpdatedAt ? { updatedAt: prevUpdatedAt } : undefined);`.
- **Success criteria:** All tests in `apps/student/test/attempt-summary.test.tsx` pass.
- **Verify:** `pnpm --filter student exec vitest run test/attempt-summary.test.tsx` exits 0.

### Task 2.3 — Tighten `QuizRuntimeHeader` with `shrink-0` and `320px`-safe mobile spacing
- **Goal:** Ensure `QuizRuntimeHeader` stays exact `h-14` (`3.5rem`) on desktop with `shrink-0` and fits `Thoát`, truncated title, timer pill (`children`), `save-state` (even `"Đang lưu…"`), and `Nộp bài` inside `320px` with zero horizontal overflow.
- **Target files and symbols:** `apps/student/src/components/quiz/quiz-runtime-header.tsx` (`QuizRuntimeHeader`).
- **Steps:**
  1. Update `<header>` classes to `sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-1.5 sm:gap-3 border-border border-b bg-background/95 px-2 sm:px-4 backdrop-blur`.
  2. Use `gap-1.5 sm:gap-3` on both left and right flex containers.
  3. Apply compact mobile padding on `Thoát` (`px-2 sm:px-3 shrink-0`) and `Nộp bài` (`px-2.5 sm:px-4 shrink-0 rounded-lg`).
  4. Apply `whitespace-nowrap font-mono text-[11px] uppercase tracking-normal sm:text-xs sm:tracking-[0.08em]` on `save-state`.
  5. Keep `{children}` directly before the `Nộp bài` button and preserve all existing `data-testid`, `role="status"`, `aria-live="polite"`, and `text-primary-foreground` invariants.
- **Success criteria:** Existing `QuizRuntimeHeader` tests pass and `shrink-0` + `h-14` + `children` slot are present.
- **Verify:** `pnpm --filter student exec vitest run test/quiz-navigator.test.tsx` exits 0.

### Task 2.4 — Build isolated leaf `<QuizTimerBadge>` and wire it into `QuizTakeView` with split-pane height safety
- **Goal:** Isolate the 1-second tick inside `<QuizTimerBadge>` so `QuizPaper` and `DOMPurify.sanitize()` never re-render every second; stop ticking once expired; render soft-expiry banner without vertical split-pane overflow; keep timer ticking behind `QuizResumeDialog`; show static duration on Start Gate.
- **Target files and symbols:** `apps/student/src/components/quiz/quiz-timer-badge.tsx` (`QuizTimerBadge`), `apps/student/src/components/quiz/quiz-take-view.tsx` (`QuizTakeView`).
- **Steps:**
  1. Create `apps/student/src/components/quiz/quiz-timer-badge.tsx`:
     - Props: `{ timeLimitSeconds: number; startedAt: string; onExpiredChange?: (expired: boolean) => void }`.
     - Computes initial `timerState = computeQuizTimerState({ timeLimitSeconds, startedAt, nowMs, clockSkewMs: getServerClockSkewMs() })`.
     - Runs a 1-second `setInterval` + `visibilitychange` refresh ONLY while `timerState !== null && timerState.phase !== "expired"` — immediately cleans up the interval when `remainingSeconds === 0`!
     - Calls `onExpiredChange?.(timerState?.phase === "expired")` inside `useEffect` ONLY when the boolean `isExpired` changes (fires at most once on expiry transition, never every second!).
     - Renders `<span>` with `data-testid="quiz-timer-badge"`, `data-state={timerState.phase}`, `aria-label={timerState.phase === "expired" ? "Đã hết thời gian làm bài" : \`Thời gian còn lại ${timerState.formatted}\`}` (NO `aria-live` on the ticking pill!).
     - Classes: `inline-flex shrink-0 items-center gap-1 sm:gap-1.5 rounded-full border px-2 sm:px-2.5 py-0.5 sm:py-1 font-medium font-mono text-xs tabular-nums` + semantic phase tokens (`running`: `border-border bg-muted/50 text-foreground`, `warn`: `border-warn/40 bg-warn-soft text-warn`, `expired`: `border-destructive/40 bg-destructive-soft text-destructive`).
     - Icon: `<Clock aria-hidden="true" className="hidden size-3.5 shrink-0 sm:block" />` (hidden below `sm` to keep `320px` header budget clean under `"Đang lưu…"` + `240:00`).
  2. In `apps/student/src/components/quiz/quiz-take-view.tsx`:
     - Add `const [timeExpired, setTimeExpired] = useState(false);` and reset `setTimeExpired(false)` in a `useEffect` when `attemptId` changes (and when `timeLimitSeconds` is absent). Place hooks BEFORE early returns (Rules of Hooks #702).
     - On Start Gate (`attempt === null`), if `detail.timeLimitSeconds && detail.timeLimitSeconds > 0`, append ` · ${Math.round(detail.timeLimitSeconds / 60)} phút` (or `formatQuizClock(detail.timeLimitSeconds)` when `< 60s`) to the metadata line. Do NOT render `<QuizTimerBadge>` on Start Gate.
     - On active attempt (including while `needsResumeDialog === true`):
       - Pass `<QuizTimerBadge timeLimitSeconds={detail.timeLimitSeconds} startedAt={attempt.startedAt} onExpiredChange={setTimeExpired} />` as `children` to `<QuizRuntimeHeader>` whenever `detail.timeLimitSeconds && detail.timeLimitSeconds > 0 && attempt.status === "in_progress" && attempt.startedAt`.
       - When `timeExpired` is `true`, render `<div role="status" data-testid="quiz-time-expired-banner" className="shrink-0 border-warn/40 border-b bg-warn-soft px-4 py-2 text-foreground text-xs sm:text-sm">Đã hết thời gian làm bài — bạn vẫn có thể hoàn thành câu trả lời và nộp bài bình thường.</div>` below `<QuizRuntimeHeader>`.
       - When `splitPane` is `true`: apply `lg:h-svh lg:overflow-hidden` to the outer wrapper `<div className={cn("flex min-h-svh flex-col bg-muted/30", splitPane && "lg:h-svh lg:overflow-hidden")}>`, add `shrink-0` on `authBanner` as well, and wrap `<QuizReadingSplitLayout fillParent passage={detail.passage} navigator={navigator}>...</QuizReadingSplitLayout>` inside `<div className="flex min-h-0 flex-1 flex-col">` (matching `test-preview-overlay.tsx:267`).
       - Never disable `Nộp bài` or trigger auto-submit when `timeExpired` is `true`.
- **Success criteria:** Timer ticks without re-rendering `QuizPaper`, stops ticking at `00:00`, compensates clock skew, stays live behind `QuizResumeDialog`, keeps split-pane exact `100svh`, and leaves untimed/assignment flows untouched.
- **Verify:** `pnpm --filter student exec vitest run test/quiz-take-view.test.tsx` exits 0.

### Task 2.5 — Guard `PracticeSkillPage` / `SkillCatalog` with a synchronous `useRef` lock spanning navigation
- **Goal:** Prevent rapid same-tick double-clicks AND post-`POST` loader-window clicks from firing duplicate `POST /api/student/practice/:testId/attempts` or competing navigations.
- **Target files and symbols:** `apps/student/src/routes/_auth/practice/$skill.tsx` (`handleOpen`), `apps/student/src/components/practice/skill-catalog.tsx` (`SkillCatalog`, `TestCard`).
- **Steps:**
  1. In `PracticeSkillPage`, add `const openingRef = useRef(false);` and `const [openingTestId, setOpeningTestId] = useState<string | null>(null);`.
  2. In `handleOpen(item)`:
     - Immediately `if (openingRef.current) return;`.
     - Synchronously set `openingRef.current = true; setOpeningTestId(item.testId);`.
     - Call `startPractice.mutate(item.testId, { onSuccess: () => { void Promise.resolve(navigate({ to: "/learn/quizzes/practice/$testId", params: { testId: item.testId } })).catch(() => { openingRef.current = false; setOpeningTestId(null); }); }, onError: (error) => { openingRef.current = false; setOpeningTestId(null); toast.error(...); } });`.
  3. Add optional `openingTestId?: string | null` prop on `SkillCatalog` and disable `TestCard` `<button>` when `Boolean(openingTestId)` (`disabled={disabled}` with `disabled:pointer-events-none disabled:opacity-60`).
- **Success criteria:** Synchronous double-clicks and clicks during route loader navigation are ignored cleanly; error path re-enables cards.
- **Verify:** `pnpm --filter student exec vitest run src/components/practice/practice-catalog.test.tsx` exits 0.

## Tests After

### Task 2.6 — Add component tests for `<QuizTimerBadge>`, clock skew, resume dialog, soft expiry, split-pane wrapper, and double-click lock
- **Goal:** Verify all timer lifecycle states, zero extra ticks after expiry, skew stability, resume dialog continuity, and catalog disabled state.
- **Target files and symbols:** `apps/student/test/quiz-take-view.test.tsx`, `apps/student/test/quiz-navigator.test.tsx`, `apps/student/src/components/practice/practice-catalog.test.tsx`.
- **Steps:**
  1. In `apps/student/test/quiz-take-view.test.tsx` (using `vi.useFakeTimers()` + `resetServerClockForTests()` in a dedicated `describe` block with `vi.useRealTimers()` in `afterEach`):
     - Timed practice (`timeLimitSeconds: 1200`, started 3m ago): renders `quiz-timer-badge` with `"17:00"` and `data-state="running"`, ticks to `"16:59"` after `vi.advanceTimersByTime(1000)`.
     - Client clock skew (+5m ahead via `syncServerClock`): still renders `"17:00"` instead of `"12:00"`.
     - Warning state (`timeLimitSeconds: 600`, 8m elapsed -> `"02:00"`): `data-state="warn"`.
     - Soft expiry (`timeLimitSeconds: 600`, 10m05s elapsed -> `"00:00"`): `data-state="expired"`, renders `quiz-time-expired-banner`, stops ticking (`vi.getTimerCount()` drops to 0 for timer interval), does NOT call `submitQuizAttempt`, and `Nộp bài` remains enabled.
     - Reload with existing `serverAnswers`: `QuizResumeDialog` is open AND `quiz-timer-badge` is visible and keeps ticking from original `startedAt`.
     - Untimed practice (`timeLimitSeconds: null`) and class assignment (`timeLimitSeconds: undefined`): `quiz-timer-badge` is absent.
     - Start Gate (`attempt: null`, `timeLimitSeconds: 1200`): shows `20 phút` in start gate metadata, hides `quiz-timer-badge`.
     - Reading split-pane (`skill: "reading"`, non-empty `passage`): outer container has `lg:h-svh` and wraps split layout in `flex-1 min-h-0`.
  2. In `apps/student/test/quiz-navigator.test.tsx`: assert `QuizRuntimeHeader` includes `h-14` + `shrink-0` and renders `children` in the right controls group.
  3. In `apps/student/src/components/practice/practice-catalog.test.tsx`: assert `openingTestId` disables `TestCard` buttons so additional clicks do not invoke `onOpen`.
- **Success criteria:** All unit & component tests pass cleanly with zero leaked fake timers.
- **Verify:** `pnpm --filter student exec vitest run test/attempt-summary.test.tsx test/quiz-navigator.test.tsx test/quiz-take-view.test.tsx src/components/practice/practice-catalog.test.tsx` exits 0.

## Regression Gate

- `pnpm --filter student check-types && pnpm --filter student test` exits 0.

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
