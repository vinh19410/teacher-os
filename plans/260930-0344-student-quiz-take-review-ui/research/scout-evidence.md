# Scout evidence — teacher-os current state (2026-09-30)

Full report: `agent://QuizUiScout` session. Key facts with file:line anchors:

## Greenfield confirmation

- `apps/student/src/routeTree.gen.ts:22-94` — student app has exactly 3 routes:
  `/login`, `/` (overview), `/onboarding`. No `/learn`, no quizzes.
- Repo-wide grep `learn/quizzes|quizzes/` → 0 code matches (plans/journals prose only).
- `packages/db/src/schema/` (20 tables) — no attempt/submission/result table.
- `apps/server/src/routes/student.ts` — `/api/student/*` covers me / overview /
  notifications / invitations / orgs / onboarding / enrollments-accept only.
- `packages/api/src/contracts.ts:1285+` — student portal contracts have no quiz/attempt
  wire types; authoring-side schemas (`:450-510`) hold the answer key (`questions[].answer`,
  `alts`, `optionBank`).
- The reference site is a Laravel Livewire app (Selfomy) — `wire:id` markup, POST
  `/livewire/message/lms.quiz.take-quiz`. It is NOT a teacher-os deployment; student app
  deploys at `student.${APP_DOMAIN}` (`packages/infra/src/topology.ts:91-92`), the apex
  `test123456.hoc.sh` is a different product entirely.

## Reusable assets

- Paper renderer (teacher-side preview, "as the student sees it"):
  - `apps/web/src/components/assignments/student-preview-paper.tsx` — paper composition:
    header (skill/part/type, band, word count), RichTextBody passage, ClozeStemText per
    question, option-bank list, image + PinOverlay.
  - `apps/web/src/components/assignments/cloze-stem.tsx` — shared cloze stem renderer;
    docblock mandates ONE implementation for both preview surfaces; marker regex lives in
    `@/lib/cloze` (`splitStemByMarker` / `countBlanks`).
  - `apps/web/src/components/assignments/pin-editor.tsx` — PinOverlay (image label pins,
    answers never render).
  - `apps/web/src/components/ui/rich-text-body.tsx` — sanitized Tiptap HTML body.
  - `apps/web/src/lib/test-ranges.ts` — `computeTestRanges`, canonical numbering.
- Assignable unit: `packages/db/src/schema/class-assignment.ts:21-74` — `class_assignment`
  (promptId NOT NULL, title snapshot, due ISO date) + `class_assignment_target`
  (unique assignmentId+studentId, `submittedAt` null = chưa nộp; docblock marks the
  submittedAt write-path as an open non-goal from plan #208 — this plan closes it).
  Tests (`assignment_test`) are NOT assignable yet (deferred by plan 260928-0419).
- Student overview feed: `apps/server/src/routes/student.ts:552-573` maps target rows →
  `StudentAssignment` (`contracts.ts:1450`); `apps/student/src/components/overview/assignment-row.tsx`
  renders rows with status badge — **no href today** (entry point to add).
- Design system: Tailwind v4 CSS-first + shadcn tokens in `packages/ui/src/styles/globals.css`
  (frozen Apple-style tokens: `--bg #fff`, `--surface #f5f5f7`, `--fg #1d1d1f`,
  `--muted #6e6e73`, `--border #d2d2d7`, `--accent #0071e3`, `--success #16a34a`,
  `--warn #eab308`, `--danger #dc2626`; radius 8/12/18px; `--breakpoint-app 921px`).
  Shared components in `packages/ui/src/components/` (button, card, checkbox, input,
  textarea, dropdown-menu, tooltip, skeleton, empty, sonner, marker, bubble).
- State/data: TanStack Router (file-based) + Query v5; hand-rolled repos in
  `apps/student/src/lib/repos/student.ts` (x-student-org-id header pattern,
  getActiveStudentOrgId); QueryClient + HttpError + 401 reauth in
  `apps/student/src/lib/query-client.ts`.
- Student app shell: `apps/student/src/components/layout/student-shell.tsx`; auth gate
  `apps/student/src/routes/_auth/route.tsx`; loaders `components/loader.tsx`; toasts sonner.

## Conventions

- `docs/code-standards.md`: contracts.ts ↔ server+web change together; Biome owns
  format/lint (`pnpm check`); validation via root `check`/`test`/`check-types`.
- Unit tests: Vitest node-env, `renderToStaticMarkup` string assertions (e.g.
  `apps/web/src/components/assignment-tests/test-preview-paper.test.tsx` — the model for
  a paper renderer test). Commands: `pnpm --filter student test`, `pnpm --filter web test`.
- E2E: Playwright `apps/e2e` (`pnpm --filter e2e e2e`), boots api :8000 / web :8001 /
  student :8003; student-flow spec pattern:
  `apps/e2e/specs/student-org-invitation-and-switcher.spec.ts`,
  `apps/e2e/specs/student-portal-onboarding.spec.ts`; assignment authoring pattern:
  `apps/e2e/specs/assignment-bank.spec.ts`, `assignment-prompt-create.spec.ts`.
- DB migrations: `pnpm db:generate` (drizzle-kit, `packages/db`).
