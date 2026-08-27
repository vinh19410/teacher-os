---
title: "Phase 1: Auth DI refactor + real better-auth round-trip dưới node"
status: todo
priority: P1
effort: 3h
dependencies: []
---

# Phase 1: Auth DI refactor + real better-auth round-trip dưới node

## Overview

Refactor production code nhỏ theo đúng triết lý DI sẵn có (`AppDeps`, `apps/server/src/app.ts:23-28`) để `packages/auth` load được dưới plain node (không `cloudflare:workers`) và better-auth THẬT (không stub) chạy được với libsql drizzle. Kết thúc phase: round-trip test sign-up thật → session cookie thật → `GET /api/kernel` (org bootstrap) xanh trong `pnpm test`. Worker behavior KHÔNG đổi.

**Tại sao trước tiên:** mọi thứ phía E2E (boot shim Phase 2) phụ thuộc `createAuth(input)`. Risk "better-auth drizzleAdapter over libsql chưa từng chạy trong repo" (medium) bị retire ngay tại đây, trước khi viết dòng E2E nào.

## Requirements

- [x] `createAuth()` → `createAuth(input)` nhận explicit `{ db, corsOrigin, secret, baseURL, cookieDomain?, googleClientId, googleClientSecret }`; KHÔNG import `@teacher-os/env/server` (và không import `createDb`).
- [x] `getSessionUser(headers)` → `getSessionUser(auth, headers)`; không construct auth per-request.
- [x] Composition root `apps/server/src/index.ts` đọc env trong closure lazy (memoize MỘT auth instance + MỘT db instance tại request đầu), dùng chung cho cả `authHandler` và `getSessionUser`; KHÔNG đánh giá binding tại module-eval (giữ invariant lazy của worker entry).
- [x] Test round-trip: real better-auth + libsql `file::memory:` + migrate + `buildApp` → POST sign-up (Origin đúng) → set-cookie `better-auth.session_token` → GET `/api/kernel` 200 (org bootstrap chạy) → GET không cookie 401.
- [x] Behavior worker giữ nguyên: cùng giá trị env, `authBaseURL` transform vẫn áp bên trong createAuth.

## Architecture

Hiện trạng (đã xác minh):
- `packages/auth/src/index.ts:3` top-level `import { env } from "@teacher-os/env/server"` (unloadable dưới node); `:8` `createAuth()` không tham số, `:9` tự `createDb()`.
- `apps/server/src/session.ts:12-21` `getSessionUser` gọi `createAuth()` mỗi request.
- `apps/server/src/index.ts:11-16` composition root hard-wire `createAuth().handler` (dòng 15) + `getSessionUser` (dòng 14).
- Caller census (grep toàn repo, không còn caller nào khác): `createAuth` — `apps/server/src/index.ts:15`, `apps/server/src/session.ts:15`; `getSessionUser` prod — `apps/server/src/index.ts:14`; signature `AppDeps.getSessionUser` (`app.ts:26`) KHÔNG đổi. Các test hiện có (`kernel.test.ts`, `readiness.test.ts`) stub session — không ảnh hưởng.
- Stakeholder phi-TS quan trọng: `apps/server/src/index.ts` là worker entry được `packages/infra/alchemy.run.ts:63-77` consume trực tiếp (`main: apps/server/src/index.ts` + toàn bộ env wiring `DB/CORS_ORIGIN/BETTER_AUTH_SECRET/BETTER_AUTH_URL/COOKIE_DOMAIN/GOOGLE_*`). Refactor file này = chạm composition root của worker — BẮT BUỘC giữ invariant lazy-bindings (comment `apps/server/src/index.ts:7`: "Lazy so importing this module never touches bindings at eval time").
- GIỮ NGUYÊN `packages/auth/src/topology.ts` (không dời helpers `authBaseURL`/`crossSubDomainCookieDomain`): `scripts/topology-drift.test.mjs:8-14` grep thẳng file này trong root `pnpm test` (gate thứ ba của root test script).

Signature mới:

```ts
// packages/auth/src/index.ts
export interface CreateAuthInput {
	db: AuthDatabase; // chấp nhận cả d1 (prod) lẫn libsql (test/e2e) drizzle instance
	corsOrigin: string;
	secret: string;
	baseURL: string; // API origin; authBaseURL(baseURL) áp bên trong (mount /api/auth không đổi)
	cookieDomain?: string; // undefined → per-host cookies (giữ logic crossSubDomainCookieDomain)
	googleClientId: string;
	googleClientSecret: string;
}
export function createAuth(input: CreateAuthInput) { ... }
```

Typing `AuthDatabase`: để TS suy diễn từ tham số generic của hàm (drizzleAdapter chấp nhận instance drizzle sqlite tổng quát). Nếu generics mâu thuẫn d1-vs-libsql: dùng cast `as unknown as` tại seam — tiền lệ sẵn có ở `apps/server/src/index.ts:12` và `kernel.test.ts:50`. KHÔNG import type từ d1/libsql vào packages/auth (giữ package trung lập driver).

CSRF note cho test (đã xác minh `apps/server/src/routes/kernel.ts:112-123`): origin guard nằm TRONG `kernelRoutes` (mount `/api`), còn `/api/auth/*` được `app.on(...)` đón trước tại `app.ts:98` → sign-up POST không bắt buộc Origin từ server, nhưng better-auth tự check Origin theo `trustedOrigins: [corsOrigin]` → test vẫn gửi `Origin: http://localhost:8001` + `Content-Type: application/json` (giống browser thật).

## Related Code Files

| Action | Path |
|--------|------|
| Modify | `packages/auth/src/index.ts` — createAuth(input), bỏ import env/createDb |
| Modify | `apps/server/src/session.ts` — getSessionUser(auth, headers) |
| Modify | `apps/server/src/index.ts` — composition root: 1 auth instance từ env |
| Modify | `packages/auth/package.json` — bỏ dep `"@teacher-os/env": "workspace:*"` (không còn import; giữ nguyên `dotenv`) |
| Create | `apps/server/src/auth-roundtrip.test.ts` — round-trip real better-auth dưới node |

## Implementation Steps

### Tests Before (TDD)

1. Tạo `apps/server/src/auth-roundtrip.test.ts` theo pattern boot của `apps/server/src/kernel.test.ts:33-50` (MIGRATIONS_DIR qua `import.meta.url`, `createClient({ url: "file::memory:" })`, `drizzle(client, { schema })`, `migrate(...)`, cast `as unknown as Db`), nhưng thay stub bằng auth thật:

```ts
const CORS_ORIGIN = "http://localhost:8001";
const auth = createAuth({
	db: libsql,
	corsOrigin: CORS_ORIGIN,
	secret: "test-secret-0123456789abcdef0123456789abcdef",
	baseURL: "http://localhost:8000",
	googleClientId: "test-dummy",
	googleClientSecret: "test-dummy",
});
const app = buildApp({
	getDb: () => db,
	corsOrigin: CORS_ORIGIN,
	getSessionUser: (headers) => getSessionUser(auth, headers),
	authHandler: (req) => auth.handler(req),
});
```

Test cases:
- `POST /api/auth/sign-up/email` body `{ name: "E2E Teacher", email: "t-<uuid>@test.local", password: "password-8chars" }`, headers `Origin: CORS_ORIGIN` + `Content-Type: application/json` → response ok; header `set-cookie` chứa `better-auth.session_token`.
- `GET /api/kernel` với cookie đó → 200; body có `classes` (array) → bootstrapMiddleware đã tạo org + membership.
- `GET /api/kernel` không cookie → 401.

2. Chạy `pnpm --filter server test` → ĐỎ (type error: createAuth chưa nhận input / getSessionUser chưa có tham số auth). Đây là trạng thái red mong muốn.

### Implementation (Refactor)

3. `packages/auth/src/index.ts`: đổi signature như Architecture; giữ nguyên mọi option better-auth hiện có (trustedOrigins, google socialProviders, emailAndPassword, secret, `authBaseURL(input.baseURL)`, advanced cookie attributes + crossSubDomainCookies khi có cookieDomain). Bỏ import `env` + `createDb`.
4. `apps/server/src/session.ts`: `export async function getSessionUser(auth: Auth, headers: Headers)` — gọi `auth.api.getSession({ headers })` (logic không đổi). Type `Auth`: `ReturnType<typeof createAuth>`.
5. `apps/server/src/index.ts` — GIỮ invariant lazy-bindings (không đánh giá `createDb()`/auth tại module-eval; workerd không đảm bảo binding ở global scope, và `crossSubDomainCookieDomain` ném exception với COOKIE_DOMAIN sai format — hiện chỉ 500 từng request, eval-time sẽ giết cả isolate):

```ts
// Lazy so importing this module never touches bindings at eval time (giữ nguyên comment invariant).
let db: Db | undefined;
let auth: ReturnType<typeof createAuth> | undefined;
const getAuth = () =>
	(auth ??= createAuth({
		db: (db ??= createDb() as unknown as Db) as CreateAuthInput["db"],
		corsOrigin: env.CORS_ORIGIN,
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		...(env.COOKIE_DOMAIN ? { cookieDomain: env.COOKIE_DOMAIN } : {}),
		googleClientId: env.GOOGLE_CLIENT_ID,
		googleClientSecret: env.GOOGLE_CLIENT_SECRET,
	}));

export default buildApp({
	getDb: () => (db ??= createDb() as unknown as Db),
	corsOrigin: env.CORS_ORIGIN,
	getSessionUser: (headers) => getSessionUser(getAuth(), headers),
	authHandler: (req) => getAuth().handler(req),
});
```

(Cả `db` và `auth` memoize lazily trong closure lần gọi request đầu — 1 instance duy nhất sau đó, như yêu cầu "MỘT auth instance", nhưng KHÔNG đánh giá lúc module eval. `createAuth` nhận `db` đã cast — input type trung lập driver.)

6. `packages/auth/package.json`: remove `@teacher-os/env` dep; chạy `pnpm install` (lockfile cập nhật — PHẢI commit lockfile).

### Tests After

7. `pnpm --filter server test` → xanh (bao gồm round-trip + kernel + readiness cũ).
8. `pnpm --filter @teacher-os/auth test` → xanh (topology.test.ts không đổi).
9. `pnpm check-types` → xanh (chứng minh không caller nào bị sót).

### Regression Gate

```bash
pnpm install --frozen-lockfile && pnpm exec biome check . && pnpm test && pnpm check-types
```

(tất cả file mới/sửa dùng tabs + double quotes — biome sẽ bắt.)

**Worker smoke gate (bắt buộc, chạy local — credentials Cloudflare có sẵn trên máy dev, không cần trong CI):** boot worker thật qua `pnpm --filter @teacher-os/infra dev` (hoặc `pnpm dev`) với env thật, rồi `curl http://localhost:8000/readyz` → 200 `{"ok":true}` và `curl http://localhost:8000/` → "OK". Không gate node nào trong chuỗi trên thực thi `src/index.ts` dưới workerd — bước này là lớp verify duy nhất cho invariant lazy-bindings của worker entry mà alchemy consume (`packages/infra/alchemy.run.ts:63-77`). Nếu boot fail: đổi lại snippet về lazy thuần (không eval-time binding) rồi thử lại.

## Success Criteria

- [x] Round-trip test xanh trong `pnpm test` (turbo task `test` kéo theo apps/server).
- [x] `grep -rn "@teacher-os/env" packages/auth/src/` trả về rỗng.
- [x] `apps/server/src/index.ts` giữ invariant lazy (không `createDb()`/`createAuth()` ở module-eval scope; grep file không thấy top-level call); worker smoke gate xanh (alchemy dev boot + `/readyz` 200).
- [x] Regression gate xanh.

## Risk Assessment

| Risk (wrong assumption) | Observable signal | Pre-decided response |
|---|---|---|
| drizzleAdapter từ chối libsql instance (d1-only assumption trong adapter) | Round-trip test fail tại sign-up với adapter/type error | better-auth hỗ trợ provider "sqlite" với drizzle libsql (chuẩn); nếu type lỗi → cast seam; nếu runtime lỗi thật → thử `drizzle(client)` không schema cho adapter; escalate planner nếu vẫn fail |
| Generic d1-vs-libsql làm tsc packages/auth đỏ | `pnpm check-types` đỏ ở packages/auth | Dùng generic `<TDb>` trên createAuth hoặc kiểu structural tối thiểu; cast tại caller seam (tiền lệ index.ts:12) |
| better-auth yêu cầu secret độ dài tối thiểu | Warning/error ở test | Secret test ≥ 32 chars (đã ghi trong snippet) |
| Sign-up endpoint path/shape khác assume | Round-trip 404 tại sign-up | better-auth 1.6.27 default: `POST /api/auth/sign-up/email` `{name,email,password}` — chính là endpoint `authClient.signUp.email` web đang dùng (`sign-up-form.tsx`); verify bằng response status, nếu 404 → in ra routes từ `/api/auth/` |
| Sót caller createAuth/getSessionUser | tsc đỏ | Census đã liệt kê đủ 3 call site; nếu xuất hiện thêm → cập nhật theo cùng pattern DI |
