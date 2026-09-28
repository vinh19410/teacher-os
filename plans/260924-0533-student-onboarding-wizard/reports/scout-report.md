# Scout Report — Student Onboarding Wizard

Ngày: 2026-09-24 · Scope: teacher-os repo (read-only) · Mục tiêu: lên plan cho wizard thu thập thông tin học viên sau đăng ký (IELTS/TOEIC, target score, mục tiêu học, số giờ/ngày).

## 1. Bố cục repo

Monorepo Turborepo + pnpm workspaces (sinh từ Better-T-Stack, `bts.jsonc`): TanStack Router + Hono + Workers + Drizzle + D1 + better-auth + Biome.

- `apps/web/` — app giáo viên (React 19 + Vite + TanStack Router), port 8001
- `apps/student/` — **student portal** (cùng stack, port 8003) — nơi đặt wizard
- `apps/server/` — API Hono chạy Cloudflare Workers, port 8000
- `apps/landing/` — marketing tĩnh, port 8002
- `apps/e2e/` — Playwright suite
- `packages/`: `ui` (shadcn/ui primitives), `auth` (better-auth + mailer), `db` (Drizzle schema + migrations), `api` (zod contracts dùng chung), `infra` (Alchemy), `env`, `config`
- Root scripts: `db:generate`, `test`, `check`, `check-types`; docs: `docs/index.md`, `docs/code-standards.md` (quy ước ownership, "derived-until-user-mutable", validation norms)

## 2. Luồng auth / đăng ký

- Login portal: `apps/student/src/routes/login.tsx` (tabs signin/signup, `returnUrl`, redirect `/` nếu có session)
- Form đăng ký: `apps/student/src/components/auth/sign-up-form.tsx` — `authClient.signUp.email({... callbackURL: origin + "/login"})` (dòng 36-41), sau đó `getSession()` rồi `window.location.assign(validateReturnUrl(returnUrl))` (dòng 61) → user về `/` ngay (soft mode: sign-up vẫn có session)
- Guard đã đăng nhập: `apps/student/src/routes/_auth/route.tsx` — `beforeLoad` check `authClient.getSession()`, context `{ session }`. Trang chính: `apps/student/src/routes/_auth/index.tsx` (overview)
- Bridge provisioning: `apps/server/src/routes/student.ts:43-145` — middleware `/api/student/*`: match student theo `lower(trim(email))`; 0 row + `emailVerified === true` → `provisionStudentForUser` (`apps/server/src/student-provisioning.ts` — insert student vào org sớm nhất, fail-open); chưa verify → 403 `STUDENT_EMAIL_UNVERIFIED`
- Email verification (commit 3e9b07a, plan #259): `packages/auth/src/index.ts:68-96` (`sendOnSignUp: true`, `autoSignInAfterVerification: true`, `expiresIn: 3600`); mailer `packages/auth/src/mail/mailer.ts` (LogMailer dev/test, ResendMailer prod); template `packages/auth/src/mail/verification-email-template.ts`; UI chờ xác thực `apps/student/src/components/overview/student-error-view.tsx` (nhánh `EMAIL_UNVERIFIED` dòng 81-86, 115-166)
- ⚠️ Plan #260 (account-role-app-separation): `plans/260924-0215-account-role-app-separation/plan.md` bị flip `status: pending → completed` trong working tree NHƯNG code chưa có trên develop (`packages/db/src/schema/auth.ts` KHÔNG có cột `user.role`, migrations dừng ở 0023). Migration kế tiếp là **0024** — rủi ro đụng số migration nếu #260 ship song song.

## 3. Data model học viên

- Drizzle + SQLite (D1). `packages/db/src/schema/student.ts`: `id`, `orgId` (FK, cascade), `name`, `phone`, `email` (unique index `lower(trim(email)) WHERE trim(email) != ''`, dòng 37-39), `zalo`, `parentName`, `parentPhone`, `createdAt`
- KHÔNG có field nào cho exam type / target band / learning goals / study hours → cần cột mới (code-standards: "mutable facts get a real column + docblock naming the user action that writes them")
- Migrations: `drizzle-kit generate` (`pnpm db:generate`, config `packages/db/drizzle.config.ts`, out `packages/db/src/migrations/` — hiện 0000→0023 + `meta/`). Alchemy tự apply khi deploy. Không có seed production.

## 4. Backend patterns

- REST trên Hono, không tRPC/server actions. `apps/server/src/routes/student.ts`: `studentRoutes(deps)` với DI `StudentRouteDeps { getDb, getSessionUser }`; `routes/kernel.ts`, `routes/snapshot.ts`, `routes/readiness.ts`
- Mount: `apps/server/src/app.ts` `buildApp()` — `/api/student` → studentRoutes (dòng 143), `/api/auth/*` → better-auth (138); `bootstrapMiddleware` (44-90) bỏ qua `/api/student`
- Auth: better-auth 1.6.27; session `apps/server/src/session.ts` (`getSessionUser` → `{ userId, userName, email, emailVerified }`)
- Validation: zod v4 trong `packages/api/src/contracts.ts` (983 dòng); student contracts dòng 907-983: `STUDENT_ERROR_CODES`, `studentMeSchema`, `studentOverviewSchema`. Quy ước: đổi contract = đổi server + client cùng lúc

## 5. Frontend patterns (student app)

- React 19 + Vite + TanStack Router file-based (`apps/student/src/routes/`), TanStack Form (`useForm` + `validators.onSubmit: zodSchema` — `sign-up-form.tsx:25-71`), TanStack Query, sonner toast, lucide-react
- Tailwind v4 + shadcn primitives từ `packages/ui/src/components/*` (button, input, card, checkbox, label, textarea… KHÔNG có stepper/wizard). Tokens: `--radius-lg`, `bg-accent-soft`, `text-fg`, `text-muted-fg`, `font-display`, `--focus-ring` (`packages/ui/src/styles/globals.css`)
- Data fetching: `apps/student/src/lib/repos/student.ts` — fetch thuần + `credentials: "include"` + zod `.parse()` + `useQuery` hooks (`useStudentMe`, `useStudentOverview`); `HttpError` (`@/lib/query-client`, retry:false, refetchOnWindowFocus:false)
- i18n: KHÔNG có — copy tiếng Việt hardcode trong JSX
- KHÔNG có wizard/multi-step form nào hiện hữu (grep wizard/stepper/multi-step = 0)

## 6. Onboarding / profile completion hiện hữu

Không có. Gần nhất: màn chờ verify email + empty states (`apps/student/src/components/overview/empty-state.tsx`). `targetBand` chỉ là display placeholder từ thời mock: `apps/web/src/lib/repos/students.ts:67` hardcode `"—"`, render ở `apps/web/src/components/class-detail/class-roster-tab.tsx:81` và `apps/web/src/routes/_auth/students/$studentId.tsx:99` — KHÔNG persist trong DB.

## 7. Testing patterns

- Vitest. Server tests cạnh source: `apps/server/src/student-provisioning.test.ts`, `student.test.ts` (chạy plain node nhờ DI + libsql). Component test: `apps/student/test/overview.test.tsx` — `renderToStaticMarkup` (không jsdom) + `vi.mock("@/lib/auth-client")`
- Playwright E2E: `apps/e2e/specs/*.spec.ts`; config `apps/e2e/playwright.config.ts` (workers:1, timezone Asia/Ho_Chi_Minh, tự boot API/web/student qua `src/boot.ts`, ports 8000/8001/8003, override `E2E_*_PORT`, origins `specs/origins.ts`). Spec liên quan: `student-portal-email-verification.spec.ts` (seed org trực tiếp vào `local.db` qua libsql trong `beforeAll`, đọc verify URL từ mail log qua `readVerificationEmails`), `student-portal-provisioning.spec.ts`
- Gates: `pnpm check` (biome), `pnpm check-types`, `pnpm test`, E2E pass 2 lần liên tiếp cho feature auth

## 8. Quy ước plans/

`plans/<YYMMDD>-<HHMM>-<slug>/`: `plan.md` (frontmatter: title, description, status, priority, effort, issue, branch `vinh19410/feat/<slug>`, tags, blockedBy, blocks, created; sections: Overview, Decisions bảng D1..Dn, Phases, Success Criteria checkbox, Non-goals, Risks & Notes, Red Team Review, Validation Log) + `phase-NN-<slug>.md` (frontmatter: phase, title, status, priority, effort, dependencies; sections: Goal, Files to Create/Modify, Tasks & Steps — Task N.M với Goal/Target files/Steps/Success criteria/Verify command, Verification, Failure Protocol STOP + spawn `kongming`). Subdirs: `research/`, `reports/`, `assets/`. Commit: `docs(plan): <mô tả> (#issue)`.

Plan mẫu để mirror: `plans/260924-0213-student-email-verification/` (cùng domain auth/portal).

## 9. GitHub workflow

- `.github/workflows/`: `ci.yml` (PR → main: biome, test, check-types, build), `e2e.yml`, `deploy.yml`, `deploy-staging.yml`. KHÔNG có issue/PR templates hay label config. Quy ước: branch `vinh19410/feat/<slug>`, issue number trong commit message, plan gắn `issue: <số>`. CI shape được assert bởi `scripts/ci-workflow.test.mjs`.
- `gh` CLI đã đăng nhập (vinh19410).

## 10. Enums / seeding

- Không có enum DB-level (SQLite text + default). Enum nghiệp vụ nằm ở zod contracts: `packages/api/src/contracts.ts:19-20` — `CLASS_TYPES = ["ielts", "communication"] as const`; DB `class.type` default `"ielts"` (`packages/db/src/schema/class.ts:19`)
- "toeic" KHÔNG tồn tại trong codebase — enum mới, đặt trong `packages/api/src/contracts.ts` theo pattern `CLASS_TYPES` + cột text trong DB
- Seeding: chỉ E2E seed SQL trực tiếp (`apps/e2e/specs/student-portal-email-verification.spec.ts` beforeAll; `apps/e2e/src/account-seed.ts`)

## Rủi ro chính

1. Plan #260 chưa ship code nhưng đã flip completed trong working tree — migration 0024 có thể đụng hàng với migration role của #260 (drizzle-kit tự renumber, cơ học nhưng cần để ý)
2. Cột mới DB theo quy ước "derived-until-user-mutable" — cần docblock ghi user action ghi vào cột
3. Điểm chèn wizard tự nhiên: sau sign-up redirect về `/` (`sign-up-form.tsx:61`); gate 2 chiều giữa `_auth/index.tsx` và route mới `/onboarding` dưới `_auth`; data qua bridge `/api/student/*` (middleware provisions khi verified — POST endpoint mới theo pattern `studentRoutes`)
4. Copy UI tiếng Việt hardcode; không thêm dependency UI mới (không có stepper sẵn)
5. E2E workers:1 boot full stack — spec mới seed org vào `local.db` trước (mẫu: spec email-verification)
