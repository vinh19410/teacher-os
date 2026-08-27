# Research: verify advise backend/D1/auth vs live source

- Type: researcher
- Date: 2026-08-18
- Scope: advisory only. Không implement. Không redesign.
- Advise: `plans/reports/advise-2026-08-17-feature-rollup-roadmap.md`
- Verdict: **10/10 claim đúng hướng.** 8 confirm thẳng. 2 confirm + nuance (không đảo advise).

Nguồn chính = live tree. Cross-check: `README.md`, `bts.jsonc`, `package.json` workspace, schema SQL + snapshot.

---

## Verdict matrix

| # | Advise claim | Kết luận | Confidence |
|---|---|---|---|
| 1 | Backend chỉ Better-Auth + 4 bảng auth trên D1 | **CONFIRM** + nuance process | 98% |
| 2 | Server chỉ `/` + `/api/auth/*` | **CONFIRM** | 99% |
| 3 | CORS GET/POST/OPTIONS only | **CONFIRM** | 99% |
| 4 | Không org/membership/student/class/enrollment | **CONFIRM** | 99% |
| 5 | Stack Hono + D1 + Drizzle + Better-Auth + Alchemy | **CONFIRM** | 99% |
| 6 | Không tRPC | **CONFIRM** | 99% |
| 7 | Session/user access hôm nay | **CONFIRM** — client-only | 97% |
| 8 | Generate/apply migrations | **CONFIRM** + nuance apply path | 95% |
| 9 | `packages/api` tồn tại? | **CONFIRM không tồn tại** | 99% |
| 10 | User fields cho bootstrap-org-on-first-login | **CONFIRM** — chỉ core Better-Auth user | 97% |

---

## 1. Backend chỉ Better-Auth + 4 bảng auth trên D1 — CONFIRM

Advise (`advise-2026-08-17…md:11`, evidence `:256–257`).

**DB.** Barrel chỉ re-export auth:

```1:1:packages/db/src/schema/index.ts
export * from "./auth";
```

4 bảng Drizzle: `user` (`auth.ts:4–19`), `session` (`:21–40`), `account` (`:42–70`), `verification` (`:72–88`). SQL khớp: `0000_mushy_amazoness.sql:1,19,33,44`. Snapshot cùng 4 table (`0000_snapshot.json:7,131,227,297`). Không file schema khác dưới `packages/db/src/schema/`.

**Consumer DB.** `createDb()` (`packages/db/src/index.ts:6–8`) chỉ được gọi từ `createAuth()` (`packages/auth/src/index.ts:1–8,11–15`). Grep `createDb` / `@teacher-os/db` ngoài 2 file đó = 0.

**Auth surface.** Better-Auth + drizzleAdapter sqlite + Google + email/password (`packages/auth/src/index.ts:10–25`). Không `plugins`, không `databaseHooks`, không `additionalFields`, không organization plugin.

**Nuance (không đảo claim).** Process không “chỉ Better-Auth”: Hono logger + CORS + `GET /` + mount handler (`apps/server/src/index.ts:7–24`). Domain mock sống trên web (`apps/web/src/lib/mock-data.ts:1–28`), không phải backend. Advise nói đúng **persisted backend**.

---

## 2. Server chỉ `/` + `/api/auth/*` — CONFIRM

`apps/server/src/` chỉ `index.ts`. Route đăng ký:

- `app.on(["POST", "GET"], "/api/auth/*", …)` — `:20`
- `app.get("/", … "OK")` — `:22–24`

Grep `app.(get|post|put|patch|delete|on|route)` trong `*.ts` = đúng 4 hit, toàn file này (2 `use` + 2 route). Không `routes/`, không kernel API.

Khớp advise evidence `:256`.

---

## 3. CORS GET/POST/OPTIONS only — CONFIRM

```10:18:apps/server/src/index.ts
app.use(
	"/*",
	cors({
		origin: env.CORS_ORIGIN,
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
		credentials: true,
	}),
);
```

Grep `allowMethods` / `cors(` = chỉ chỗ này. Trusted origin auth = cùng `CORS_ORIGIN` (`packages/auth/src/index.ts:16`).

Hệ quả wave 0 (advise đã ghi `:77`, `:173`): PATCH/DELETE browser sẽ fail preflight. POST action hoặc nới CORS trước endpoint đầu.

---

## 4. Không organization/membership/student/class/enrollment — CONFIRM

Grep `organization|membership|enrollment|sqliteTable` trong `*.{ts,sql,json}`: `sqliteTable` chỉ 4 bảng auth. 0 table/column org.

Domain mock (không persist): `Student` + `pkg` nhúng (`mock-data.ts:6–28`), `Lesson.sid` (`:33–36`). Không `orgId`.

---

## 5. Stack Hono + D1 + Drizzle + Better-Auth + Alchemy — CONFIRM

| Layer | Live | Cite |
|---|---|---|
| HTTP | Hono `^4.12.32` | `apps/server/package.json:16`, `src/index.ts:3,7` |
| Runtime | Cloudflare Workers | `alchemy.run.ts:15–19` `Worker` + `nodejs_compat`; README `:12–13` |
| DB engine | D1 binding `DB` | `alchemy.run.ts:11–13,21`; `packages/db/src/index.ts:2,7` `drizzle-orm/d1` |
| ORM | drizzle-orm `^0.45.2` + kit `^0.31.10` | `packages/db/package.json:20,26` |
| Auth | better-auth catalog `1.6.27` | `pnpm-workspace.yaml:15`; `packages/auth/src/index.ts:4–10` |
| Provision | Alchemy `2.0.0-beta.72` | `packages/infra/package.json:7–8,19`; `alchemy.run.ts:36–43` |
| Scaffold | `--backend hono --orm drizzle --auth better-auth --api none --db-setup d1 --server-deploy cloudflare` | `bts.jsonc:13–27` |

Không `wrangler.toml` trong source. Binding = Alchemy, không Wrangler config.

**Adoption risk stack (hiện trạng, không đề xuất đổi):** Alchemy 2 beta (`2.0.0-beta.72`). Better-Auth 1.6.x ổn định. D1+Drizzle path đã ship 1 migrate. Fit wave 0: giữ stack; thêm schema + Hono routes. Không intro tRPC (advise non-goal `:27`).

---

## 6. Không tRPC — CONFIRM

Grep `trpc|@trpc` (case-insensitive): 2 hit, cả hai trong advise (`:27`, `:161`). 0 dependency. `bts.jsonc:25` `"api": "none"`. Web `package.json` không React Query / oRPC. Client auth = `better-auth/react` (`auth-client.ts:2,39`).

---

## 7. Session/user access hôm nay — CONFIRM, client-only

**Server không đọc session.** `createAuth()` chỉ dùng như `handler(c.req.raw)` (`apps/server/src/index.ts:20`). 0 `getSession` / `auth.api` / middleware session trên server.

**Web đọc session:**

| Chỗ | Cách | Cite |
|---|---|---|
| Guard `_auth` | `authClient.getSession()`; thiếu `session.data` → `/login`; context `{ session }` | `apps/web/src/routes/_auth/route.tsx:7–14` |
| Login/signup pending | `authClient.useSession()` | `sign-in-form.tsx:22`, `sign-up-form.tsx:22` |
| Sidebar | `useRouteContext({ from: "/_auth" })` → `session.data.user`; dùng `user.name` | `sidebar.tsx:194–204` |
| Sign-out | `authClient.signOut` | `sidebar.tsx:275` |
| Client base | `createAuthClient({ baseURL: …/api/auth })` | `auth-client.ts:39–43` |

Cookie Better-Auth: `sameSite: "none"`, `secure: true`, `httpOnly: true` (`packages/auth/src/index.ts:36–39`). `cookieCache` comment, chưa bật (`:26–32`).

**Hệ quả bootstrap.** Wave 0 phải **thêm** `createAuth().api.getSession({ headers })` trên route mới, hoặc `databaseHooks.user.create`. Không có hook point sẵn.

---

## 8. Migrations generate/apply — CONFIRM + nuance apply

**Generate (wired).**

- Root: `pnpm run db:generate` → turbo `-F @teacher-os/db` (`package.json:15`)
- Package: `drizzle-kit generate` (`packages/db/package.json:13`)
- Config: `schema: "./src/schema"`, `out: "./src/migrations"`, `dialect: "sqlite"`, `driver: "d1-http"` (`drizzle.config.ts:8–14`)
- Artifact: 1 entry `0000_mushy_amazoness` (`migrations/meta/_journal.json:5–11`)

**Apply (Alchemy, không drizzle-kit mặc định).**

- `Cloudflare.D1.Database("database", { migrationsDir: "../../packages/db/src/migrations" })` (`alchemy.run.ts:11–13`)
- README: Alchemy provision D1 + apply lúc `deploy` (`README.md:34`)
- Root **không** có `db:migrate`. `db:migrate:deploy` = `drizzle-kit migrate` tồn tại ở package (`packages/db/package.json:14`) nhưng **không** gắn root/`turbo` `deploy`
- `drizzle.config.ts` **không** `dbCredentials` (accountId/databaseId/token) — `d1-http migrate` chưa chạy được as-is

**Dev.** `alchemy dev` bind D1 (`packages/infra/package.json:7`). Report này không chạy live apply; chưa verify migrate có chạy lúc `dev` hay chỉ `deploy`. README chỉ nói `deploy`.

---

## 9. `packages/api` — CONFIRM không tồn tại

`packages/` live: `auth`, `config`, `db`, `env`, `infra`, `ui`. Không `api`. `bts.jsonc:25` `"api": "none"`. Advise đề xuất tạo mới (`advise:97`, `:147`) — đúng là greenfield, không phải package sẵn.

---

## 10. Auth user model vs bootstrap-org-on-first-login

**`user` columns** (`auth.ts:4–19`, SQL `:33–41`):

| Field | Null | Role bootstrap |
|---|---|---|
| `id` | PK | FK `membership.userId` |
| `name` | NOT NULL | Label org mặc định (signup gửi `name`; Google có name) |
| `email` | NOT NULL unique | Identity; không phải org key |
| `email_verified` | NOT NULL default false | Không quyết định first-login |
| `image` | nullable | UI; không org |
| `created_at` / `updated_at` | NOT NULL | Không đủ thay membership existence |

**Không có:** `orgId`, `role`, `firstLogin`, `activeOrganizationId`. Session (`auth.ts:21–40`) không `activeOrganizationId` (field plugin organization).

**Tạo user hôm nay:**

- Email signup: `authClient.signUp.email({ email, password, name })` (`sign-up-form.tsx:31–36`)
- Google: `authClient.signIn.social({ provider: "google" })` (`google-oauth-button.tsx:39–44`)

**Detect first login:** không flag. Phải query membership theo `user.id` — bảng chưa có. Hook Better-Auth chưa gắn. Server không thấy user lúc login.

**Khuyến nghị fit (không redesign):** bootstrap trên **API kernel sau `getSession`**, idempotent `INSERT org + membership(role=teacher)` nếu 0 membership. Đừng dựa `created_at`. `user.name` đủ default org name. Không cần Better-Auth organization plugin cho v1 1-org/user (advise `:174`).

---

## Trade-off (wave 0 trên baseline này)

| Option | Perf | Complexity | Maintenance | Cost | Fit |
|---|---|---|---|---|---|
| **A. Hono + Zod routes + schema mới + session via `auth.api.getSession`** | Đủ; 1 worker | Thấp — khớp file ownership advise | 1 contract package mới | 0 lib mới | **#1** — stack hiện tại |
| B. Better-Auth organization plugin | Thêm table plugin | Kéo `activeOrganizationId` + plugin API | 2 source of truth org | Plugin upgrade risk | #3 — thừa so lock role=`teacher`, 1 org/user |
| C. tRPC/oRPC ngay | Tương đương | Cao hơn; trái non-goal | Codegen + client | Lib mới | #4 — advise cấm trước 3 endpoint |
| D. Persist mock 1:1 | Nhanh short-term | Rewrite sau | Cao | Migrate Class/Enrollment | #5 — trái mục tiêu advise |

Adoption risk A: thấp. CORS phải nới hoặc POST-only trước write đầu. Migrate apply phụ thuộc Alchemy `migrationsDir`, không `drizzle-kit migrate`.

---

## Limitations

- Không gọi D1 live / `alchemy dev` — không đếm row production.
- Không đọc `apps/server/.env` (secret). Binding type từ `alchemy.run.ts:20–27` + `packages/env/env.d.ts`.
- Docs Alchemy `migrationsDir` fetch trống; apply path = README + code only.
- Không audit Better-Auth internal session JSON ngoài field schema + chỗ web đọc `user.name`.

---

## Unresolved

1. `alchemy dev` có apply `migrationsDir` giống `deploy` không? README chỉ claim deploy.
2. `db:migrate:deploy` cố ý leftover scaffold hay path apply phụ? Config thiếu credentials.

---

Status: DONE
Summary: 10 advise claims khớp live code. Backend = Hono `/` + Better-Auth `/api/auth/*` trên D1 4 bảng; không org/tRPC/`packages/api`; session chỉ đọc ở web; migrate generate drizzle-kit, apply Alchemy.
Concerns/Blockers: `drizzle-kit migrate` chưa wired; server chưa có `getSession` cho bootstrap; CORS hẹp — advise đã ghi, không đảo claim.
