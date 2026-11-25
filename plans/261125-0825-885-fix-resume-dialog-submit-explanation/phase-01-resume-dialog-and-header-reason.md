# Phase 1: Resume Dialog Helper, Header Disabled Reason & TDD Tests

## Goal

Add a clear Vietnamese explanation inside `QuizResumeDialog` (with hardened `z-[60]` stacking and `Shift+Tab` focus trap), wire `submitDisabledReason` from `QuizTakeView` into `QuizRuntimeHeader` with a stable React wrapper tree (permanently mounted `sr-only` `aria-describedby` + Base UI `Tooltip` hover wrapper), and verify strictly TDD Red → Green across SSR and jsdom tests.

## Files to Create or Modify

- `apps/student/test/quiz-navigator.test.tsx` (modify — add TDD tests for `QuizResumeDialog` helper text and `QuizRuntimeHeader` `submitDisabledReason` SSR markup)
- `apps/student/test/quiz-take-view.test.tsx` (modify — add TDD tests for `QuizTakeView` reload resume locked/unlocked submit state with stable button DOM identity, `Shift+Tab` focus-trap guard, jsdom hover tooltip with `ResizeObserver` stub, and `resolveSubmitDisabledReason` priority)
- `apps/student/src/components/quiz/quiz-lifecycle-dialogs.tsx` (modify — add `helperText?: string` to `QuizDialog`, raise backdrop to `z-[60]`, harden `Shift+Tab` + `:not([disabled])` focus trap, and pass helper text in `QuizResumeDialog`)
- `apps/student/src/components/quiz/quiz-runtime-header.tsx` (modify — add `submitDisabledReason?: string | null` with stable wrapper tree, `aria-describedby` + `sr-only`, and `@teacher-os/ui/components/tooltip`)
- `apps/student/src/components/quiz/quiz-take-view.tsx` (modify — export `resolveSubmitDisabledReason`, derive `submitDisabled` from it, pass `submitDisabledReason` to `QuizRuntimeHeader`, and call `storeRef.current?.halt("auth")` in Speaking `onAuthError`)

## Tasks & Steps

### Task 1.1 — Write failing TDD tests for `QuizResumeDialog`, `QuizRuntimeHeader`, and `QuizTakeView` (Red phase)
- **Goal:** Establish mechanical failing tests proving the current code lacks explanation in `QuizResumeDialog`, lacks `aria-describedby`/tooltip on disabled `"Nộp bài"`, lacks `resolveSubmitDisabledReason`, and allows `Shift+Tab` to escape `QuizDialog` from initial card focus.
- **Target files and symbols:**
  - `apps/student/test/quiz-navigator.test.tsx` (`describe("QuizRuntimeHeader — save-state element (RT#7)")`, `describe("QuizLifecycleDialogs — copy vòng đời (Selfomy parity)")`)
  - `apps/student/test/quiz-take-view.test.tsx` (import `resolveSubmitDisabledReason` from `@/components/quiz/quiz-take-view`; add `ResizeObserver` stub in `beforeAll`/`afterAll` following `packages/ui/src/components/date-picker-input.test.tsx:14-22`; add `describe("QuizTakeView — submitDisabledReason & QuizResumeDialog explanation (#885)")`)
- **Steps:**
  1. In `apps/student/test/quiz-navigator.test.tsx`:
     - Add a test in `QuizLifecycleDialogs` verifying `QuizResumeDialog` markup includes `'Hãy chọn &quot;Tiếp tục&quot; để khôi phục bài làm và mở khóa nút &quot;Nộp bài&quot;.'`, preserves exact text `"Bạn có bài làm chưa hoàn thành. Bạn có muốn tiếp tục không?"`, has `z-[60]`, and `aria-describedby` contains two space-separated IDs (description + helper).
     - Add a test in `QuizRuntimeHeader` rendering `<QuizRuntimeHeader title="T" saveState={null} onSubmitClick={() => undefined} submitDisabled submitDisabledReason={'Hãy chọn "Tiếp tục" trong hộp thoại để mở khóa nút nộp bài.'} />` via `renderToStaticMarkup`, verifying: (a) `<button` has `disabled` and `aria-describedby="..."`, (b) a matching `sr-only` element with that `id` contains the reason text, (c) exactly one `<button` exists in the header (no nested `<button>`), (d) no `text-bg` class is emitted, and (e) when `submitDisabled={false}`, `aria-describedby`, `cursor-not-allowed`, and `data-testid="submit-disabled-trigger"` are absent even if `submitDisabledReason` is passed.
  2. In `apps/student/test/quiz-take-view.test.tsx`:
     - Stub `globalThis.ResizeObserver` in `beforeAll` / restore in `afterAll` (same lightweight class stub as `packages/ui/src/components/date-picker-input.test.tsx:14-22`).
     - Add a `describe` block testing `resolveSubmitDisabledReason` directly for all 7 priority branches:
       1. `attemptStatus !== "in_progress"` → `"Bài làm không còn ở trạng thái đang làm."`
       2. `needsResumeDialog === true` → `'Hãy chọn "Tiếp tục" trong hộp thoại để mở khóa nút nộp bài.'`
       3. `isSubmitting === true` → `"Đang nộp bài…"`
       4. `haltedReason === "auth"` → `"Phiên đăng nhập đã hết hạn — vui lòng đăng nhập lại."`; `"org_mismatch"` → `"Tổ chức học tập vừa thay đổi — vui lòng tải lại trang."`; `"submitted"` / `"finalized"` → `"Bài làm không còn ở trạng thái đang làm."`
       5. `isSpeaking && mediaUploading` (even when `hasMedia === false`) → `"Đang tải file bài nói lên — vui lòng chờ hoàn tất."`
       6. `isSpeaking && !hasMedia` (when `mediaUploading === false`) → `"Bạn cần tải file bài nói lên trước khi nộp bài."`
       7. `!hasPrimaryStore || (hasHybridWriting && !hasEssayStore)` → `"Đang khôi phục dữ liệu bài làm…"`
       8. Otherwise → `null`.
     - Add a component test rendering `<QuizTakeView>` with `serverAnswers={{ "0": "TRUE" }}`:
       - Verify `role="alertdialog"` named `"Tiếp tục bài làm"` is visible and shows BOTH exact description `"Bạn có bài làm chưa hoàn thành. Bạn có muốn tiếp tục không?"` AND `quiz-dialog-helper` text `'Hãy chọn "Tiếp tục" để khôi phục bài làm và mở khóa nút "Nộp bài".'`.
       - Verify pressing `Shift+Tab` immediately after mount (while focus is on the dialog card) wraps focus to the last enabled button (`"Tiếp tục"`) inside the dialog instead of escaping.
       - Capture `const submitBtn = screen.getByRole("button", { name: "Nộp bài" }) as HTMLButtonElement;`, assert `submitBtn.disabled === true`, and verify its `aria-describedby` resolves via `document.getElementById` to `'Hãy chọn "Tiếp tục" trong hộp thoại để mở khóa nút nộp bài.'`.
       - Click `"Tiếp tục"` inside the dialog; verify the dialog unmounts, **the same `submitBtn` DOM node remains connected** (`submitBtn.isConnected === true`), `submitBtn.disabled === false`, and `submitBtn.getAttribute("aria-describedby")` is `null`.
     - Add a component test for Speaking with `media: null` (non-modal disabled state):
       - Verify `"Nộp bài"` is disabled with `aria-describedby` resolving to `"Bạn cần tải file bài nói lên trước khi nộp bài."`.
       - Assert `document.querySelector('[data-slot="tooltip-content"]')` is `null` BEFORE hover (blocks phantom pass from `sr-only`).
       - Trigger hover via `fireEvent.mouseEnter(screen.getByTestId("submit-disabled-trigger"))`.
       - Assert via `await waitFor(() => expect(document.querySelector('[data-slot="tooltip-content"]')?.textContent).toBe("Bạn cần tải file bài nói lên trước khi nộp bài."))`, spying on `console.error` to assert zero React/Base UI warnings.
- **Success criteria:** New tests fail cleanly on unmodified production code.
- **Verify (Red phase — expected non-zero exit):** `pnpm --filter student test test/quiz-navigator.test.tsx test/quiz-take-view.test.tsx` exits non-zero with assertion/import failures proving the missing behavior (passing with exit 0 here is a verification failure).

### Task 1.2 — Add `helperText`, raise stacking to `z-[60]`, and harden focus trap in `QuizDialog` / `QuizResumeDialog`
- **Goal:** Display the clear unlock explanation inside `QuizResumeDialog` without altering the existing description `<p>`, ensure `QuizDialog` always stacks above `z-50` tooltip portals, and close the `Shift+Tab` / disabled-button focus-trap gap.
- **Target files and symbols:**
  - `apps/student/src/components/quiz/quiz-lifecycle-dialogs.tsx` (`QuizDialog`, `QuizResumeDialog`)
- **Steps:**
  1. In `QuizDialog`:
     - Add optional prop `helperText?: string` to props destructuring and type signature.
     - Create `const helperId = useId();`.
     - Update `handleKeyDown`:
       - Filter out disabled controls in `querySelectorAll`: `"button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"`.
       - When `event.shiftKey`: if `document.activeElement === cardRef.current || document.activeElement === first || !cardRef.current.contains(document.activeElement)`, call `event.preventDefault(); last.focus();`.
       - When `!event.shiftKey`: if `document.activeElement === last || !cardRef.current.contains(document.activeElement)`, call `event.preventDefault(); first.focus();`.
     - Change backdrop z-index from `z-50` to `z-[60]` (`fixed inset-0 z-[60] flex items-center justify-center bg-primary/40 p-4`).
     - Set `aria-describedby={helperText ? `${descriptionId} ${helperId}` : descriptionId}` on the `role="alertdialog"` card `<div>`.
     - Keep `<p id={descriptionId} ...>{description}</p>` completely unchanged.
     - Immediately below `<p id={descriptionId}>`, conditionally render:
       ```tsx
       {helperText && (
       	<p
       		id={helperId}
       		data-testid="quiz-dialog-helper"
       		className="mt-3 rounded-md border border-border bg-muted/50 px-3 py-2 text-muted-foreground text-xs leading-relaxed"
       	>
       		{helperText}
       	</p>
       )}
       ```
  2. In `QuizResumeDialog`:
     - Pass `helperText='Hãy chọn "Tiếp tục" để khôi phục bài làm và mở khóa nút "Nộp bài".'` to `<QuizDialog>`.
- **Success criteria:** `QuizResumeDialog` renders the helper block visibly at `z-[60]`, exposes both IDs in `aria-describedby`, and traps `Shift+Tab` from initial focus; all other `QuizDialog` callers remain unchanged.
- **Verify:** `pnpm --filter student test test/quiz-navigator.test.tsx` — `QuizLifecycleDialogs` describe block passes (remaining failure limited to `QuizRuntimeHeader` until Task 1.3).

### Task 1.3 — Add `submitDisabledReason` with stable wrapper tree, `aria-describedby`, and Base UI `Tooltip` to `QuizRuntimeHeader`
- **Goal:** Ensure every disabled `"Nộp bài"` button on `QuizRuntimeHeader` communicates why it is disabled via permanently mounted `sr-only` `aria-describedby` and desktop hover tooltip, while keeping HTML `disabled`, exact accessible name `"Nộp bài"`, stable DOM `<button>` identity (no remount on toggle), viewport-safe width on 320px, and SSR `renderToStaticMarkup` compatibility.
- **Target files and symbols:**
  - `apps/student/src/components/quiz/quiz-runtime-header.tsx` (`QuizRuntimeHeader`)
- **Steps:**
  1. Import `useId` from `"react"` and `{ Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }` from `"@teacher-os/ui/components/tooltip"`.
  2. Add optional prop `submitDisabledReason?: string | null` to `QuizRuntimeHeader` and update its JSDoc comment concisely.
  3. Inside `QuizRuntimeHeader`:
     - Compute `const submitReasonId = useId();` and `const disabledReason = submitDisabled && submitDisabledReason ? submitDisabledReason : null;`.
     - When `onSubmitClick !== null`, render a **stable tree** so `<Button>` never unmounts when `disabledReason` toggles `null ↔ string`:
       ```tsx
       <TooltipProvider delay={0}>
       	<Tooltip disabled={disabledReason === null}>
       		<TooltipTrigger
       			disabled={disabledReason === null}
       			render={
       				<span
       					data-testid={
       						disabledReason !== null ? "submit-disabled-trigger" : undefined
       					}
       					className={cn(
       						"inline-flex shrink-0",
       						disabledReason !== null && "cursor-not-allowed",
       					)}
       				/>
       			}
       		>
       			<Button
       				onClick={onSubmitClick}
       				disabled={submitDisabled}
       				aria-describedby={disabledReason ? submitReasonId : undefined}
       				className="shrink-0 rounded-lg px-2.5 sm:px-4"
       			>
       				Nộp bài
       			</Button>
       		</TooltipTrigger>
       		{disabledReason !== null && (
       			<TooltipContent
       				side="bottom"
       				align="end"
       				className="max-w-[calc(100vw-16px)] rounded-md text-center"
       			>
       				{disabledReason}
       			</TooltipContent>
       		)}
       	</Tooltip>
       	{disabledReason !== null && (
       		<span id={submitReasonId} className="sr-only">
       			{disabledReason}
       		</span>
       	)}
       </TooltipProvider>
       ```
     - Do NOT pass `nativeButton={false}` (unsupported on Base UI `TooltipTrigger`), do NOT add `tabIndex={0}` on `<span>`, and do NOT attach `title={disabledReason}` alongside `<Tooltip>`.
     - Note on Base UI `disabled` prop: verify via `pnpm --filter student check-types` and unit tests that `disabled` on `<Tooltip>`/`<TooltipTrigger>` type-checks cleanly and never blocks clicking `<Button>` when `submitDisabled === false`.
     - Fallback rule (only if `renderToStaticMarkup` or jsdom throws/warns on `@base-ui/react/tooltip`): keep the exact same public prop `submitDisabledReason` and stable `<span className={cn("inline-flex shrink-0", disabledReason !== null && "cursor-not-allowed")} title={disabledReason ?? undefined}>` wrapper + permanently mounted `<span id={submitReasonId} className="sr-only">` when `disabledReason !== null`, and record the fallback in the phase report.
- **Success criteria:** `renderToStaticMarkup` succeeds cleanly with zero warnings, single `<button>` element (`disabled`, `aria-describedby`), matching `sr-only` span, stable `<button>` node across enabled/disabled transitions, and working hover tooltip in jsdom.
- **Verify:** `pnpm --filter student test test/quiz-navigator.test.tsx` exits 0 and all tests pass.

### Task 1.4 — Wire `resolveSubmitDisabledReason`, `submitDisabledReason`, and Speaking auth halt in `QuizTakeView`
- **Goal:** Drive both `submitDisabled` and `submitDisabledReason` from a single deterministic priority helper so `"Nộp bài"` is never silently disabled, and keep Speaking auth expiry aligned with halted state.
- **Target files and symbols:**
  - `apps/student/src/components/quiz/quiz-take-view.tsx` (`resolveSubmitDisabledReason`, `QuizTakeView`)
- **Steps:**
  1. Export a pure function `resolveSubmitDisabledReason(params: { attemptStatus: string; needsResumeDialog: boolean; isSubmitting: boolean; haltedReason: QuizAttemptHaltReason | null; isSpeaking: boolean; hasMedia: boolean; mediaUploading: boolean; hasPrimaryStore: boolean; hasHybridWriting: boolean; hasEssayStore: boolean }): string | null` (importing `type QuizAttemptHaltReason` from `@/lib/quiz-attempt-store`).
  2. Implement the exact priority order:
     1. `attemptStatus !== "in_progress"` → `"Bài làm không còn ở trạng thái đang làm."`
     2. `needsResumeDialog` → `'Hãy chọn "Tiếp tục" trong hộp thoại để mở khóa nút nộp bài.'`
     3. `isSubmitting` → `"Đang nộp bài…"`
     4. `haltedReason !== null`:
        - `"auth"` → `"Phiên đăng nhập đã hết hạn — vui lòng đăng nhập lại."`
        - `"org_mismatch"` → `"Tổ chức học tập vừa thay đổi — vui lòng tải lại trang."`
        - default (`"submitted" | "finalized"`) → `"Bài làm không còn ở trạng thái đang làm."`
     5. `isSpeaking && mediaUploading` → `"Đang tải file bài nói lên — vui lòng chờ hoàn tất."`
     6. `isSpeaking && !hasMedia` → `"Bạn cần tải file bài nói lên trước khi nộp bài."`
     7. `!hasPrimaryStore || (hasHybridWriting && !hasEssayStore)` → `"Đang khôi phục dữ liệu bài làm…"`
     8. `null`.
  3. Inside `QuizTakeView`:
     - Compute `const haltedReason = snapshot.halted ?? essaySnapshot.halted;`
     - Compute `const submitDisabledReason = resolveSubmitDisabledReason({ attemptStatus: attempt.status, needsResumeDialog, isSubmitting: submitMutation.isPending, haltedReason, isSpeaking, hasMedia: media !== null, mediaUploading, hasPrimaryStore: store !== null, hasHybridWriting, hasEssayStore: essayStore !== null });`
     - Derive `const submitDisabled = submitDisabledReason !== null;`.
     - Pass `submitDisabledReason={submitDisabledReason}` to `<QuizRuntimeHeader>`.
     - In `SpeakingSubmissionPanel`'s `onAuthError` (`quiz-take-view.tsx:672-675`), add `storeRef.current?.halt("auth");` before `setAuthBanner(true); reauth();` so Speaking auth expiry disables `"Nộp bài"` with the `"auth"` reason consistently with other skills.
- **Success criteria:** Every disabled state of `"Nộp bài"` supplies a non-null Vietnamese reason; enabled state passes `submitDisabled={false}` and `submitDisabledReason={null}`; all student unit tests pass.
- **Verify:** `pnpm --filter student test` exits 0 with all test files (including `quiz-navigator.test.tsx`, `quiz-take-view.test.tsx`, and `text-bg-guard.test.ts`) passing.

## Verification

1. `pnpm --filter student test` exits 0 (all unit & component tests pass).
2. `pnpm exec biome check apps/student/src/components/quiz/quiz-lifecycle-dialogs.tsx apps/student/src/components/quiz/quiz-runtime-header.tsx apps/student/src/components/quiz/quiz-take-view.tsx apps/student/test/quiz-navigator.test.tsx apps/student/test/quiz-take-view.test.tsx` exits 0.
3. `VITE_SERVER_URL=http://localhost:8000 pnpm --filter student check-types` exits 0.

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
