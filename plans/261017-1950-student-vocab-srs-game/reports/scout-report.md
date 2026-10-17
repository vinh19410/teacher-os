# Scout Report — teacher-os (cho plan Student Vocab SRS Game)

Ngày: 2026-10-18 · Agent: Explore · Repo: `/Users/vinhtran/Documents/project/personal/teacher-os` (branch `develop`)

## 1. Stack tổng quan

Monorepo pnpm + turbo (`package.json`, `pnpm-workspace.yaml`; catalog react ^19.2.8, TS ^6.0.3, zod ^4.4.3, drizzle-orm 0.45, tailwind 4).

- `apps/web` — teacher: React 19 + Vite 8 + TanStack Router/Query/Form, Tailwind 4, tiptap, recharts.
- `apps/server` — API: **Hono** trên Cloudflare Workers, drizzle D1, better-auth; vitest.
- `apps/student` — student portal: React 19 + Vite + TanStack Router/Query (đơn giản hơn web).
- `apps/landing` — static build node script; `apps/e2e` — Playwright.
- `packages/api` — Zod contracts dùng chung (`src/contracts.ts`, 2152 dòng) + helpers (`src/lib/grade-quiz.ts` — server-side quiz grading precedent).
- `packages/auth`, `packages/db` (drizzle schema + 36 migrations, mới nhất `0035_ambiguous_freak.sql`), `packages/env`, `packages/infra` (alchemy IaC), `packages/ui`, `packages/config`.

## 2. Student app

- Routing TanStack Router file-based: `routes/__root.tsx`, `routes/_auth/route.tsx` (guard `beforeLoad` → `authClient.getSession()`), routes con `_auth/` (`index.tsx`, `classes/$classId.tsx`, `learn/quizzes/$assignmentId.tsx`, `learn/quizzes/attempt/$attemptId.tsx`...). `routeTree.gen.ts` do router-plugin sinh.
- KHÔNG có kernel store ở student — pattern kernel là của teacher web (`apps/web/src/lib/data-provider.tsx`, `data-store.tsx`, `kernel-state.ts`). Student dùng TanStack Query + fetch repos: `apps/student/src/lib/repos/student.ts` (fetch `credentials: "include"` + header `x-student-org-id` từ localStorage, dòng 24-46), `repos/quiz.ts`, `repos/payments-portal.ts`. Quiz runtime có external store riêng: `apps/student/src/lib/quiz-attempt-store.ts` (autosave debounce 600ms + mirror localStorage).
- Route mẫu: `routes/_auth/index.tsx` (overview + `STUDENT_ERROR_CODES`); runtime gần minigame nhất: `routes/_auth/learn/quizzes/attempt/$attemptId.tsx`.

## 3. Vocabulary / SRS: CHƯA TỒN TẠI

Grep toàn repo `vocab|flashcard|srs|spaced|deck|minigame`: chỉ false positives (`apps/web/src/lib/syllabus-import.ts:51` label `V2_STATUS_VOCAB`; chuỗi "Vocabulary Practice" trong `apps/server/src/student.test.ts:172`). Không có bảng/route/component nào. Plan P1 exam-parity (`plans/261017-1704-student-p1-exam-parity/`) đụng cùng vùng quiz runtime nhưng là feature khác.

## 4. Lesson / bài học

- `lesson` table = buổi dạy lịch (`packages/db/src/schema/lesson.ts:29`); curriculum = `syllabus_lesson`/`syllabus_module` (`packages/db/src/schema/syllabus.ts`).
- Student học qua Bài tập: `class_assignment` + `class_assignment_target` (#208, `packages/db/src/schema/class-assignment.ts:21,51`) → `quiz_attempt` (unique (assignmentId, studentId), `questionsSnapshot` freeze đề, answers JSON autosave).
- Đề: `assignment_prompt` (`skill/part/type`, `questions` JSON, `transcript`, `audioName`, `optionBank`).
- Media: R2 bucket MEDIA qua MediaStore; media bài nói student có route; audio prompt chưa serve (P1 sẽ thêm `audio_key` 0036). Component phát: `apps/student/src/components/quiz/quiz-media-player.tsx` (blob fetch + revoke).

## 5. Database

- `packages/db/drizzle.config.ts`: dialect sqlite, driver d1-http, schema `./src/schema`, out `./src/migrations`; journal `meta/_journal.json`; migration 0035 có comment DEPLOY ORDER migrate trước worker.
- Lệnh `pnpm db:generate` (drizzle-kit generate) → `db:migrate:deploy`. Prod = D1 (teacher-os-db) qua alchemy; e2e dùng libsql local (`apps/e2e/local.db`, fake bindings `apps/e2e/src/boot.ts`).
- Query: drizzle ORM; DB inject `AppDeps.getDb()` (`apps/server/src/app.ts:49`); `Db = DrizzleD1Database` (`app.ts:28`); route factory deps injection → test node thuần.

## 6. API pattern

- Hono; `buildApp` (`apps/server/src/app.ts`); routes: `routes/kernel.ts` (2108 dòng, teacher `/api/kernel`), `routes/student.ts` (1845 dòng, `/api/student`), `routes/grading.ts`, `routes/snapshot.ts`...; sub-route mount precedent: `routes/assignments.ts`, `bank-link.ts`, `grading.ts`, `reporting.ts` mount trong kernel (`kernel.ts:78-83`).
- Student guard: `requireStudent` closure `apps/server/src/routes/student.ts:500-577`; đăng ký per-path `router.use("/me", requireStudent)` (`:579-594`, quiz `:589-591`); CSRF = Origin check mọi method ghi; kernel có Origin check riêng (`kernel.ts:110-121`).
- Validation Zod `.strict()` từ `packages/api/src/contracts.ts` → **release train implication** (precedent #304, contracts.ts:1945-1951). Error `{ error, code }` + `STUDENT_ERROR_CODES`. Route student mẫu: `GET /api/student/overview`; deps `StudentRouteDeps` (`student.ts:76-83`).

## 7. Test infrastructure

- Vitest mỗi app: server test đồng vị trí (`routes/student-quiz.test.ts` 1377 dòng — buildApp + fake deps); web/student component test @testing-library/react jsdom; packages/api có vitest; packages/ui KHÔNG có script test.
- E2E Playwright `apps/e2e` (52 specs `specs/`); 3 webServer boot; override `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103`; workers 1; tz Asia/Ho_Chi_Minh; CI chỉ chạy target main (biome check → test → check-types → build).

## 8. UI conventions

- `packages/ui` (shadcn-style): button/card/input/checkbox/dropdown/textarea/tooltip/skeleton/sonner/theme-toggle/illustrations + nhóm quiz (`quiz-paper`, `quiz-navigator`, `quiz-question-item`, `quiz-verdict`...) + `media-dropzone`.
- DESIGN.md: dark mặc định; 1 accent cam `#ff5b1f` (light `#c93d0b`); `--verdict-correct/wrong` chỉ đúng/sai + icon ✓/✗; Inter Tight + DM Mono; radius 4/6/8; motion 150ms `cubic-bezier(0.28,0,0.22,1)`; chip chọn nền chìm chữ cam; badge đếm `aria-hidden`; filter sống URL; token nguồn `packages/ui/src/styles/globals.css`.
- Student dùng `@teacher-os/ui` + Tailwind 4 + lucide-react. Audio player generic chưa có (chỉ quiz-media-player cho attempt media).

## 9. plans/ precedent

`plans/261017-1704-student-p1-exam-parity/`: `plan.md` frontmatter đầy đủ (title/description/status/priority/effort/issue/branch/tags/blockedBy/blocks/created), Overview dẫn nguồn reports, Key Decisions đánh số, Goals table, Phases table (link phase-NN), Dependencies + deploy order, Success Criteria checkboxes, Out of Scope, Red Team Review, Validation Log; `phase-NN-*.md` frontmatter title/status + Context Links/Key Insights/Requirements/Architecture; `reports/` scout + researcher.

## 10. Deployment

- Alchemy `packages/infra/alchemy.run.ts`: server Worker (`:103`), web + student Cloudflare.Website.Vite (`:170`, `:216`), landing StaticSite, D1 + R2 MEDIA; `pnpm deploy`.
- Release train: migration TRƯỚC worker (#319); contracts `.strict()` thêm key → server + student cùng release (#304); web teacher sau server OK. Runbook `docs/production-release-runbook.md`.

## Patterns đáng reused

- Contract-first Zod `.strict()` — server + 2 client parse cùng nguồn.
- Route factory + deps injection (test không cần bindings).
- Snapshot/title-snapshot server-side authority (questionsSnapshot precedent) — server giữ SRS state, client render.
- `db.batch` (BatchItem, `kernel.ts`) — atomic multi-statement D1.

## Risks

- Quiz runtime student phức tạp (autosave/mirror/halt) — session vocab nên là route + state riêng, không nhét vào attempt store.
- Migration số 0036 có thể bị P1 #358 chiếm trước — lấy số theo journal lúc generate.
- Audio prompt chưa có serving — tái dùng media-store R2 pattern (#305).
- `student.ts` (1845 dòng) + `kernel.ts` (2108 dòng) — thêm code vào file route MỚI, không phình 2 file này.
