# Scout Report

Inventory cho plan persist class-centric kernel (mock → D1). Không redesign. Không implement.

Snapshot 2026-08-18. Domain 100% in-memory. D1 chỉ Better-Auth (4 bảng). Không `packages/api`. Không org/membership/tenant trong source.

## Relevant Files

### 1. Mock domain (types, seed, reducer, provider, tests)

- `apps/web/src/lib/mock-data.ts` — types `MockData` + seed port từ `open-design/v1/teacher-os.html` `D`. Student-centric: `Student.pkg` nhúng, `Lesson.sid`, `ClassGroup.studentIds[]`, `class.sessionsDone` stored. Seed: 5 students (`s1`–`s5`; `s2` không thuộc class nào), 11 lessons (`l1`–`l11`), 6 invoices, 6 assignments, reports/notifs/commentBank, 3 classes (`c1`–`c3`), 3 syllabi (`sy1`–`sy3`). Helpers: `fmtVND`, `averageBand`, `isAlmostOut`.
- `apps/web/src/lib/data-store-reducer.ts` — `Action` + `reducer`. Kernel-ish writes: `add-student` (+ optional `classId` enroll), `add-class`, `add-syllabus`, `assign-syllabus`, `add-module`/`edit-module`, `add-lesson`/`edit-lesson` (syllabus lesson), `update-class-notes`. Non-kernel: `check-in` (tăng `pkg.done` trên student), `cancel-lesson`, `mark-invoice-paid`, `grade-assignment`.
- `apps/web/src/lib/data-store.tsx` — `DataProvider` (`useReducer(reducer, seedData)`), `useData()`, lookup helpers. Barrel shared; mọi màn đọc qua đây.
- `apps/web/src/lib/data-store-reducer.test.ts` — characterization 23 case. Comment: delete/rewrite khi mock → API.
- `apps/web/src/lib/add-student-enroll.contract.test.ts` — source-contract lock wiring `classId` (class detail vs students list).
- `apps/web/src/components/layout/app-shell.tsx` — mount `DataProvider` quanh shell auth. Đổi persist = đổi chỗ này, không 13 route.
- `open-design/v1/teacher-os.html` — nguồn seed/types gốc (lines ~558–691 theo comment mock-data).

### 2. 13 auth screens + layout + related modals

Layout / gate (không đếm 13):

- `apps/web/src/routes/_auth/route.tsx` — session gate Better-Auth; không session → `/login`. Render `AppShell`.
- `apps/web/src/components/layout/app-shell.tsx` — shell + `DataProvider` + title map 13 route.
- `apps/web/src/components/layout/sidebar.tsx` — nav 13 màn + logout.
- `apps/web/src/components/layout/topbar.tsx` — đọc `useData()` (notif).
- `apps/web/src/components/layout/notif-panel.tsx` — panel notif mock.
- `apps/web/src/routes/login.tsx` — ngoài `_auth`; SignIn/SignUp.
- `apps/web/src/routes/index.tsx` — redirect `/` → `/dashboard`.
- `apps/web/src/lib/auth-client.ts` — `createAuthClient` base `/api/auth` trên `VITE_SERVER_URL`.

13 screens (`routes/_auth/`):

| # | Path | File | Data / modal |
|---|------|------|----------------|
| 1 | `/dashboard` | `dashboard.tsx` | `useData` + `check-in` |
| 2 | `/students` | `students/index.tsx` | `AddStudentModal` (không `classId`) |
| 3 | `/students/$studentId` | `students/$studentId.tsx` | `CreateReportModal` (stub send) |
| 4 | `/schedule` | `schedule.tsx` | `LessonModal` (`check-in` / `cancel-lesson`) |
| 5 | `/tuition` | `tuition.tsx` | `AddInvoiceModal` (stub; không mutate) + `mark-invoice-paid` |
| 6 | `/assignments` | `assignments/index.tsx` | list |
| 7 | `/assignments/$assignmentId` | `assignments/$assignmentId.tsx` | `GradeModal` |
| 8 | `/classes` | `classes/index.tsx` | `AddClassModal` |
| 9 | `/classes/$classId` | `classes/$classId.tsx` | `AddStudentModal` (`classId={cls.id}`) + `AssignSyllabusModal` + `update-class-notes` |
| 10 | `/syllabus` | `syllabus/index.tsx` | `AddSyllabusModal` |
| 11 | `/syllabus/$syllabusId` | `syllabus/$syllabusId.tsx` | add/edit module+lesson giáo trình + `AssignSyllabusModal` |
| 12 | `/reports` | `reports.tsx` | `CreateReportModal` (stub) |
| 13 | `/settings` | `settings.tsx` | local `useState` only; tab Data nói “demo, chưa xuất file” |

Modals (`apps/web/src/components/modals/`):

- `add-student-modal.tsx` — dispatch `add-student`; payload có `classId?`
- `add-class-modal.tsx` — `add-class`
- `add-syllabus-modal.tsx` — `add-syllabus`
- `assign-syllabus-modal.tsx` — `assign-syllabus`
- `add-module-modal.tsx` / `edit-module-modal.tsx`
- `add-lesson-modal.tsx` / `edit-lesson-modal.tsx` — syllabus lesson, không lịch
- `grade-modal.tsx` — `grade-assignment`
- `add-invoice-modal.tsx` — stub close, không store
- `create-report-modal.tsx` — stub close, không store

Related non-modal:

- `apps/web/src/components/schedule/lesson-modal.tsx` — lịch: check-in / cancel
- `apps/web/src/components/sign-in-form.tsx` / `sign-up-form.tsx` / `google-oauth-button.tsx` — auth UI
- `apps/web/src/routeTree.gen.ts` — generated; đụng route = regenerate

### 3. DB schema, migrations, drizzle

- `packages/db/src/schema/auth.ts` — `user`, `session`, `account`, `verification` + relations. Không domain.
- `packages/db/src/schema/index.ts` — `export * from "./auth"` only. Barrel chồng khi thêm org/class.
- `packages/db/src/index.ts` — `createDb()` = `drizzle(env.DB, { schema })` D1 binding.
- `packages/db/src/migrations/0000_mushy_amazoness.sql` — migration duy nhất (4 bảng auth).
- `packages/db/src/migrations/meta/_journal.json` — journal idx 0.
- `packages/db/src/migrations/meta/0000_snapshot.json` — drizzle snapshot.
- `packages/db/drizzle.config.ts` — schema `./src/schema`, out `./src/migrations`, dialect sqlite, `driver: "d1-http"`. Load `apps/server/.env`. Generate-only local; không `db:push`.
- `packages/db/package.json` — `db:generate`, `db:migrate:deploy`. Không `check-types` / `test`.

### 4. Server entry, auth wiring, env, CORS

- `apps/server/src/index.ts` — Hono duy nhất: logger, CORS (`GET|POST|OPTIONS`, `Content-Type`+`Authorization`, credentials), mount `POST|GET /api/auth/*`, `GET /` → `OK`. Chưa route domain. CORS hẹp: PATCH/DELETE chưa allow.
- `packages/auth/src/index.ts` — `createAuth()` Better-Auth + drizzleAdapter sqlite + Google OAuth + email/password. `trustedOrigins: [CORS_ORIGIN]`. Cookie `sameSite: none`, `secure`, `httpOnly`.
- `packages/env/src/server.ts` — re-export `env` từ `cloudflare:workers`.
- `packages/env/env.d.ts` — infer `ServerEnv` từ Alchemy.
- `packages/env/src/web.ts` — `VITE_SERVER_URL` required URL.
- `packages/infra/alchemy.run.ts` — D1 `migrationsDir: packages/db/src/migrations`; Worker server bind `DB`, `CORS_ORIGIN`, `BETTER_AUTH_*`, `GOOGLE_*`; web `VITE_SERVER_URL`; ports 8000/8001 `strictPort`.
- `README.md` — `CORS_ORIGIN` phải khớp web origin; OAuth callback `/api/auth/oauth2/callback/google`; D1 apply lúc Alchemy deploy.
- `bts.jsonc` — stack lock: Hono + workers + drizzle + sqlite/d1 + better-auth + **`api: none`**.

### 5. `packages/*` structure

Hiện có (không có `packages/api`):

| Package | Role | Scripts |
|---------|------|---------|
| `packages/auth` | Better-Auth factory | none |
| `packages/db` | schema + `createDb` + migrations | `db:generate`, `db:migrate:deploy` |
| `packages/env` | web/server env | none |
| `packages/infra` | Alchemy D1 + workers | `dev`, `deploy`, `destroy`, `check-types` |
| `packages/ui` | shadcn primitives | `check-types` |
| `packages/config` | `tsconfig.base.json` only | none |

Apps:

- `apps/web` — React + TanStack Router + mock store + vitest
- `apps/server` — Hono entry only (`src/index.ts`)

Advise wave 0 đề xuất `packages/api` (Zod) + `apps/server/src/routes/kernel/` — **chưa tồn tại**.

### 6. Characterization / contract tests

- `apps/web/src/lib/data-store-reducer.test.ts` — 23 tests. Invariants quan trọng cho kernel:
  - check-in tăng `s.pkg.done` / `remaining`; **không** đổi `classes` / `sessionsDone`
  - check-in cancelled (`l9`) vẫn complete + increment (hole hiện tại)
  - `add-student` + `classId` chỉ enroll class đó; unknown/empty `classId` không đụng roster
  - syllabus `totalLessons` recompute từ module lessons (trừ seed `sy1` add-module giữ 12)
  - `assign-syllabus` chỉ `class.syllabusId`
  - `update-class-notes` scoped 1 class
  - invoice/grade vẫn mock (ngoài kernel wave 0)
- `apps/web/src/lib/add-student-enroll.contract.test.ts` — parse JSX: class detail truyền `classId={cls.id}` + key; students list omit `classId`; modal đưa `classId` vào payload.
- `scripts/ci-workflow.test.mjs` — contract CI: biome read-only, `pnpm test`, `check-types`, build, dummy `VITE_SERVER_URL`.
- `apps/web/vitest.config.ts` — node env, tsconfig paths.
- Không test server/auth/db/API. Không contract OpenAPI.

### 7. Shared barrels / conflict points

Xem section dưới.

### 8. Org / membership / tenant — expect none

Grep `tenant|organization|membership|orgId` trong `apps/` + `packages/`: **0 hit**.

Chỉ xuất hiện trong plans/reports (advise + red-team). Source = single-tenant in-memory + Better-Auth user.

### 9. Package.json scripts

Root `package.json`:

- `test` = `turbo run test && pnpm test:ci-workflow`
- `check-types` = `turbo run check-types`
- `check` = `biome check --write .` (local mutate; CI dùng `pnpm exec biome check .`)
- `db:generate` = `turbo run db:generate -F @teacher-os/db`
- `dev` / `dev:web` / `dev:server` / `build` / `deploy` / `destroy`

Per-package:

- `apps/web`: `test` = `vitest run`; `check-types` = `vite build && tsc --noEmit`
- `apps/server`: `check-types` = `tsc -b`; **không test**
- `packages/db`: `db:generate`, `db:migrate:deploy`; **không check-types**
- `packages/auth`, `packages/env`: không script
- `packages/infra`, `packages/ui`: `check-types`

CI (`.github/workflows/ci.yml`): install → biome check → `pnpm test` → `check-types` → `build`. Env: `VITE_SERVER_URL=http://localhost:8000`. Không D1/secrets.

`turbo.json`: tasks `test`, `check-types`, `db:generate` (cache false, interactive).

### 10. Docs / constraints backend-domain

Repo **không** có `CLAUDE.md`, `AGENTS.md`, `docs/`.

- `README.md` — stack, D1+Alchemy, Better-Auth Google, CORS, ports 8000/8001, scripts.
- `bts.jsonc` — `api: none`, drizzle+d1, hono workers, better-auth.
- `plans/reports/advise-2026-08-17-feature-rollup-roadmap.md` — **authority product** cho roadmap này (user-confirmed). Wave 0 tables: `organization`, `membership`, `student`, `class`, `syllabus`, `syllabus_module`, `syllabus_lesson`, `enrollment`, `session_package`. Không `lesson`/`invoice`/`assignment`/`report` ở wave 0. Org mới trống. Role `teacher`. Adapter giữ 13 màn. File ownership wave 0: schema mới + migrate + `apps/server/src/routes/kernel/` + `packages/api` + tách `data-provider`/`repos/kernel.ts`. Không sửa 13 route.
- `plans/260816-1640-add-automated-web-app-test-suite/` — lock reducer invariants.
- `plans/260816-1821-class-detail-enroll-student-into-viewed-class/` — enroll `classId`; “Do not add authz”; single-tenant mock.
- `plans/260815-1553-convert-open-design-v1-to-react-and-remove-better-t-mock-ui/` — nguồn UI + derived-data contract (tags static).

## Conflict / shared barrels

Sửa song song sẽ đụng. Advise đã flag.

| File | Vì sao conflict |
|------|-----------------|
| `packages/db/src/schema/index.ts` | Barrel duy nhất; mọi bảng mới đi qua đây. Auth import `./schema/auth` trực tiếp — index vs auth.ts lệch nếu re-export lung tung. |
| `apps/server/src/index.ts` | CORS + mount duy nhất. Kernel API = 1 file này + CORS methods. |
| `apps/web/src/lib/data-store.tsx` | Provider + `useData` contract. 13 màn + 11 modal + topbar + lesson-modal import. |
| `apps/web/src/lib/mock-data.ts` | Types `MockData` = UI contract. Adapter phải map kernel → shape này. |
| `apps/web/src/lib/data-store-reducer.ts` | Mọi mutation. Wave 0 phải tách kernel actions khỏi check-in/invoice/grade. |
| `packages/auth/src/index.ts` | Bootstrap org-on-first-login nếu hook session. |
| `packages/infra/alchemy.run.ts` | Binding/env mới (nếu có). Thường không cần cho kernel thuần D1. |
| `apps/web/src/components/layout/app-shell.tsx` | Owner mount provider. |
| `packages/db/src/index.ts` | `createDb` schema import `./schema` — thêm table = type DB đổi. |

An toàn song song: schema file **mới** (`packages/db/src/schema/organization.ts` v.v.), `packages/api` **mới**, `apps/server/src/routes/**` **mới**, `apps/web/src/lib/repos/**` **mới**. Một owner mỗi barrel ở trên.

## Tests

Giữ xanh khi persist kernel:

- Characterization reducer: check-in không ghi `sessionsDone`; enroll scoped; syllabus totals; class notes.
- Contract enroll: 3 assert JSX. Đừng đổi class-detail/`AddStudentModal` wiring nếu không cập nhật test.
- CI workflow test: đừng bỏ `pnpm test` / turbo test / web vitest.
- Hole đã khóa: check-in `l9` cancelled vẫn increment — đừng “sửa” trừ khi đổi test có chủ đích.
- Tags/`atRisk` static (plan convert + reducer tests `s4` giữ `"nợ học phí"` sau mark-paid).

Thiếu (plan phải thêm, chưa có):

- Test schema/migration D1
- Test Hono kernel + org isolation
- Test bootstrap membership `teacher`
- Test adapter map enrollment → `studentIds` / package → `Student.pkg`
- Test server package (chưa có script)

## Docs

Cập nhật khi plan/implement đổi user-visible setup:

- `README.md` — API domain, env mới, bootstrap org, `db:generate` flow.
- Tạo `docs/` chỉ nếu repo quyết định evergreen (hiện không có).
- Không sửa historical `plans/2608*` trừ link.
- Plan mới: `plans/<timestamp>-persist-class-centric-kernel/` theo documentation-management.
- Advise `plans/reports/advise-2026-08-17-feature-rollup-roadmap.md` = input, không copy nguyên vào code comments.

## Unresolved Questions

1. Wave 0 có tạo `packages/api` như advise, hay Zod sống trong `apps/server` (stack `api: none`)?
2. Bootstrap org: hook Better-Auth (`databaseHooks`) hay route `/api/me` first-hit? Chưa code.
3. Org isolation v1: session 1 org implicit, hay header `X-Org-Id` sẵn?
4. CORS: nới PATCH/DELETE vs chỉ POST actions — advise để mở.
5. Seed demo: advise org trống; characterization vẫn phụ thuộc seed `s1`/`c1`/`sy1`. Adapter + test persist vs seed mock tách thế nào?
6. `packages/db` không `check-types` — kernel schema có vào CI type gate không?
7. `drizzle.config` `d1-http` — generate local có cần Cloudflare creds, hay generate schema-only đủ?

---

Status: DONE
Summary: Inventory đủ để plan wave 0. Domain mock tập trung `mock-data`/`reducer`/`data-store`; 13 màn + 11 modal + lesson-modal; D1 chỉ 4 bảng auth; không org/api package. Conflict barrels: schema/index, server/index, data-store.
Concerns/Blockers: none cho scout. Plan phải chốt packages/api vs server-local Zod và cách bootstrap org — chưa có trong source.
