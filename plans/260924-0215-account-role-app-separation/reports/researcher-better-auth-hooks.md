# Research: better-auth 1.6.27 hooks/databaseHooks/OAuth-state — role theo app (teacher vs student)

**Date:** 2026-09-24 · **Scope:** 8 câu hỏi về hooks.before/after, databaseHooks, OAuth state, additionalFields, APIError, trustedOrigins trong **better-auth 1.6.27** (đúng bản pinned trong repo).

**Primary evidence:** source thật của bản đã cài. Trong report, path được viết tắt:
- `BA` = `node_modules/.pnpm/better-auth@1.6.27_@cloudflare+workers-types@5.20260815.1_drizzle-kit@0.31.10_drizzle-o_f70882ace50a3d203eba2f82aeb6a0a1/node_modules/better-auth/dist`
- `CORE` = `node_modules/.pnpm/@better-auth+core@1.6.27_.../node_modules/@better-auth/core` (package này ship kèm **src/*.ts** — đọc trực tiếp được)
- `BC` = `node_modules/.pnpm/better-call@1.4.0_zod@4.4.3/node_modules/better-call/dist`
- `BF` = `node_modules/.pnpm/@better-fetch+fetch@1.3.1/node_modules/@better-fetch/fetch/dist`
- `DA` = `node_modules/.pnpm/@better-auth+drizzle-adapter@1.6.27_.../node_modules/@better-auth/drizzle-adapter/dist`

Version kiểm chứng: `BA/package.json` → `"version": "1.6.27"`; `better-auth/adapters/drizzle` → `@better-auth/drizzle-adapter@1.6.27`.

---

## 1. Bảng tóm tắt (câu hỏi → kết luận → bằng chứng)

| # | Câu hỏi | Kết luận đã verify (1.6.27) | Bằng chứng chính |
|---|---|---|---|
| 1 | `ctx.path` của các endpoint? đọc header/cookie trong hook thế nào? | `"/sign-up/email"`, `"/sign-in/email"`, `"/sign-in/social"` — chuỗi chính xác. Callback: route khai báo `/callback/:id`, nhưng `ctx.path` khi chạy qua HTTP là **path cụ thể** `"/callback/google"` (đã cắt basePath). Header: `ctx.headers` (Headers) hoặc `ctx.request.headers`. Cookie: `ctx.getCookie()/setCookie()/setSignedCookie()/getSignedCookie()`. | `BA/api/routes/sign-up.mjs`, `sign-in.mjs:107,211`, `callback.mjs:21`; `BC/router.mjs` (path = pathname − basePath); `BC/context.mjs:33-59` |
| 2 | `hooks.before` mutate `ctx.body` có persist? hay dùng `databaseHooks.user.create.before`? signature? mutate được? throw được? | Mutate trực tiếp `ctx.body` **có** persist (cùng object ref) NHƯNG phải vượt qua `parseUserInput` ở handler (nên `input:false` sẽ ném 400 nếu role nằm trong body). **`databaseHooks.user.create.before` là chỗ đúng**: signature `(user, ctx) => Promise<boolean \| void \| { data }>`; trả `{ data: { role } }` (hoặc mutate `user.role`) → được persist; chạy cho cả email sign-up LẪN OAuth sign-up (`createUser` lẫn `createOAuthUser` đều qua `createWithHooks`); **throw được** để abort. | `CORE/src/types/init-options.ts:1282-1291`; `BA/db/with-hooks.mjs:6-22`; `BA/db/internal-adapter.mjs:75-99`; `BA/api/routes/sign-up.mjs` (parseUserInput + catch isAPIError) |
| 3 | `databaseHooks.session.create.before`: signature? throw để chặn sign-in cho cả email + OAuth? ctx có Request/Origin/cookies? | Signature `(session, ctx) => Promise<boolean \| void \| { data }>`. **Throw APIError chặn được cả 2 path** (chạy trong `internalAdapter.createSession` mà signInEmail lẫn OAuth callback đều gọi). ctx = ALS `AuthEndpointContext`: có `ctx.request` (Request gốc), `ctx.headers`, `ctx.path`, `ctx.body` — **không** có method `getCookie` ở runtime; đọc cookie qua `ctx.request.headers.get("cookie")`. Tại `/callback/google` (top-level GET navigation) **thường KHÔNG có Origin header**. Chú ý: throw ở callback → **302 redirect** tới errorURL kèm `?error=<code>&error_description=<message>`, không phải JSON. | `CORE/src/types/init-options.ts:1352-1361`; `BA/db/internal-adapter.mjs` (`createSession` → `createWithHooks`); `BA/api/routes/sign-in.mjs:326`; `BA/oauth2/link-account.mjs:134`; `BA/api/routes/callback.mjs:157-160`; `BA/oauth2/errors.mjs` (redirectOnError) |
| 4 | OAuth: biết app nào initiate lúc `/callback/google`? state chứa gì? set cookie từ hook bằng API nào? | **Có, native trong 1.6:** body của `/sign-in/social` có `additionalData: Record<string, any>` — được spread vào `stateData` (lưu DB bảng `verification` theo strategy mặc định `"database"`, hoặc cookie mã hóa `oauth_state`), parse lại lúc callback, và **`getOAuthState()` được export từ `better-auth/api`** → gọi được trong databaseHook ngay tại callback request. Phương án khác: hook trên `/sign-in/social` đọc `ctx.headers.get("origin")` rồi `ctx.setCookie(...)` (API có thật, xác nhận ở better-call) — nhưng additionalData robust hơn (state sống server-side). | `BA/api/routes/sign-in.mjs:105` (schema additionalData); `BA/oauth2/state.mjs` (generateState/parseState); `BA/state.mjs` (generateGenericState/parseGenericState, looseObject); `BA/context/create-context.mjs:136` (strategy default); `BA/api/index.mjs:216` (export getOAuthState); `CORE/src/context/request-state.ts` |
| 5 | `user.additionalFields` với drizzle schema tường minh? có cần column thật? xuất hiện trên `session.user`? `input:false` chặn client? cần `inferAdditionalFields`? | Config `{ type: "string", required: false, input: false }` hợp lệ. **Bắt buộc phải có column `role` thật trong drizzle user table** — adapter ném `BetterAuthError: The field "role" does not exist in the "user" Drizzle schema` khi thiếu. Field xuất hiện trên `session.user` (mọi response đều qua `parseUserOutput`, `returned` mặc định true). `input:false`: client gửi `role` trong sign-up body → 400 `"role is not allowed to be set"`; `/update-user` gửi role → 400 tương tự; profile OAuth cũng bị bỏ qua. `inferAdditionalFields` chỉ là type-inference phía client → **bỏ qua được** nếu chỉ cần server-side (runtime vẫn trả `role`). | `CORE/src/types/init-options.ts:163-171`; `CORE/src/db/type.ts:184-282` (DBFieldAttributeConfig); `DA/index.mjs` (`checkMissingFields`); `BA/db/schema.mjs:24-26, 59-115` (parseUserOutput/parseInputData); `BA/api/routes/session.mjs:199,218,243,251`; `BA/api/routes/update-user.mjs` |
| 6 | Client nhận gì khi throw APIError từ hook? message survive? status hợp lệ? import path? | `signIn.email` nhận `{ data: null, error: { message, code?, status: <HTTP number>, statusText } }` — **`message` tùy chỉnh survive nguyên văn** (body JSON = `error.body` của APIError). Import: `import { APIError } from "better-auth/api"`; `new APIError("BAD_REQUEST", { message, code? })`. Status strings hợp lệ: chuẩn HTTP trong `statusCodes` map của better-call (BAD_REQUEST, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, UNPROCESSABLE_ENTITY, INTERNAL_SERVER_ERROR, FOUND…). | `CORE/src/error/index.ts` (APIError); `BC/error.mjs` (statusCodes, InternalAPIError); `BC/to-response.mjs:125`; `BF/index.js:698-701,734-738`; `BA/api/index.d.mts:3963` (exports) |
| 7 | POST không có Origin (curl) có bị chặn? check nào chặn cross-origin ngoài trustedOrigins? | **Không có Origin + không có cookie header → được qua** (`validateOrigin`: `if (!(forceValidate \|\| useCookies)) return`). POST **có** cookie header mà thiếu Origin → 403 `MISSING_OR_NULL_ORIGIN` ("Missing or null Origin"). POST có Origin nhưng không khớp `trustedOrigins` → 403 `INVALID_ORIGIN` ("Invalid origin"). Check này chạy ở `originCheckMiddleware` mount **toàn cục** `/**`; riêng `/sign-in/email` + `/sign-up/email` còn có `formCsrfMiddleware` (Fetch Metadata: chặn `Sec-Fetch-Site: cross-site` + `mode: navigate`). | `BA/api/middlewares/origin-check.mjs:95-152` (validateOrigin, formCsrfMiddleware); `BA/api/index.mjs` (routerMiddleware `/**`); `BA/context/helpers.mjs:60` (default trustedOrigins = origin của baseURL + config + env); `CORE/src/error/codes.ts:47-62` |
| 8 | `auth.api.getSession()` có tự include additionalFields? | **Có.** `/get-session` trả user qua `parseUserOutput` → mọi additionalField có `returned !== false` (mặc định true) đều nằm trong `user` của response (bao gồm `role`). | `BA/api/routes/session.mjs:199,218,243,251` |

---

## 2. Chi tiết từng câu hỏi

### Q1 — `hooks.before/after`: path, header, cookie

**Path khai báo (exact strings)** — `createAuthEndpoint(<path>, ...)`:

```js
// BA/api/routes/sign-up.mjs
const signUpEmail = () => createAuthEndpoint("/sign-up/email", { method: "POST", ... })
// BA/api/routes/sign-in.mjs:107
const signInSocial = () => createAuthEndpoint("/sign-in/social", { method: "POST", ... })
// BA/api/routes/sign-in.mjs:211
const signInEmail = () => createAuthEndpoint("/sign-in/email", { method: "POST", ... })
// BA/api/routes/callback.mjs:21
const callbackOAuth = createAuthEndpoint("/callback/:id", { method: ["GET", "POST"], ... })
```

**`ctx.path` là path cụ thể của request** (đã trừ basePath `/api/auth`), không phải pattern. `BC/router.mjs` (processRequest):

```js
path = pathname.slice(basePath.length);          // "/api/auth/callback/google" -> "/callback/google"
...
const context = { path, method: request.method, headers: request.headers,
  params: route.params ? { ...route.params } : {}, request, body, query, ... };
```

→ trong hook: `ctx.path === "/sign-up/email"`, `"/sign-in/email"`, `"/sign-in/social"`, `"/callback/google"` (với provider google), `/get-session`, `/update-user`, …

**Header/cookie API** — `hooks.before` là `AuthMiddleware = MiddlewareHandler` (`CORE/src/types/init-options.ts:1628-1639`, `CORE/src/api/index.ts:191`). better-call bọc handler qua `createInternalContext` (`BC/middleware.mjs` → `BC/context.mjs`), nên ctx của hook có:

```js
headers: context?.headers,          // Headers của Request (BC/context.mjs)
request: context?.request,          // Request gốc
getCookie: (key, prefix) => ...,    // parse từ request "cookie" header
setCookie: (key, value, options) => ...,          // append "set-cookie" vào responseHeaders
setSignedCookie: async (key, value, secret, options) => ...,
getSignedCookie: async (key, secret, prefix) => ...,
setHeader, getHeader, redirect, json, setStatus
```

Docs chính thức xác nhận cùng API: https://www.better-auth.com/docs/concepts/hooks (ví dụ `ctx.setCookie(...)`, `ctx.getSignedCookie("...", ctx.context.secret)`).

**Luồng chạy:** `hooks.before/after` đăng ký trong `getHooks()` với `matcher: () => true` — chạy cho **mọi** request (`BA/api/dispatch.mjs:135-169`). `hooks.before` chạy **sau** middleware origin-check toàn cục (origin-check là `routerMiddleware` chạy trong router trước `handler(context)`, hook chạy bên trong handler) — tức là request đến hook đã qua CSRF/origin check. Hook có thể:
- mutate trực tiếp ctx (cùng object ref với handler),
- `return { context: { ... } }` → merge vào request context qua `defuReplaceArrays` (`BA/api/dispatch.mjs:92-105`, docs có ví dụ "Modify Request Context" trả `{ context: { body: {...} } }`),
- `throw new APIError(...)` → error response, hoặc return Response để short-circuit.

Repo hiện tại đã dùng đúng pattern này (`packages/auth/src/index.ts` — hook `/update-user` throw `new APIError("BAD_REQUEST", { message })`).

### Q2 — Assign role lúc sign-up: `hooks.before` hay `databaseHooks.user.create.before`?

**Signature (verify từ `.d.ts` thật):** `CORE/src/types/init-options.ts:1276-1291`

```ts
user.create.before?: (
  user: User & Record<string, unknown>,
  context: GenericEndpointContext | null,
) => Promise<boolean | void | { data: Optional<User> & Record<string, any> }>;
// "if the hook returns false, the user will not be created.
//  If the hook returns an object, it'll be used instead of the original data"
```

**Cơ chế thực thi** — `BA/db/with-hooks.mjs:6-22`:

```js
async function createWithHooks(data, model, customCreateFn) {
  const context = await getCurrentAuthContext().catch(() => null);   // ctx truyền vào hook (arg 2)
  let actualData = data;
  ...
  const result = await ... toRun(actualData, context);
  if (result === false) return null;                                 // false -> không tạo row
  if (typeof result === "object" && "data" in result)
    actualData = { ...actualData, ...result.data };                  // {data} -> merge & persist
```

Ba cách đều persist được: (a) mutate `user.role = "student"` (cùng ref), (b) `return { data: { role: "student" } }` — hợp đồng chính thức, (c) `return false` (hủy, không kèm message). **Throw cũng abort** — `sign-up/email` catch rồi re-throw nguyên vẹn nếu là APIError (`BA/api/routes/sign-up.mjs`):

```js
} catch (e) {
  if (isAPIError(e)) throw e;          // message giữ nguyên
  ...
  throw APIError.from("UNPROCESSABLE_ENTITY", BASE_ERROR_CODES.FAILED_TO_CREATE_USER);
}
```

**Quan trọng — `databaseHooks.user.create.before` chạy cho CẢ OAuth sign-up:** `internalAdapter.createOAuthUser` cũng gọi `createWithHooks(..., "user", ...)` (`BA/db/internal-adapter.mjs:75-84`, gọi từ `BA/oauth2/link-account.mjs:97`). Trong khi `hooks.before` mutate `ctx.body` chỉ phủ được `/sign-up/email`.

**Vì sao không nên mutate body trong hooks.before cho việc này:** handler sign-up lọc body qua `parseUserInput(ctx.context.options, rest, "create")` (`BA/api/routes/sign-up.mjs`, `BA/db/schema.mjs:59-115`). Nếu `role` được khai báo `input:false` mà có trong body → `parseInputData` ném 400 `FIELD_NOT_ALLOWED` ("role is not allowed to be set"). Nếu `input:false` + có `defaultValue` → giá trị client bị **thay bằng defaultValue** (mutate body vô tác dụng). DatabaseHook chạy **sau** bước lọc này (trên data đã vào `internalAdapter.createUser`) nên injection `{ data: { role } }` luôn thắng cả client lẫn defaultValue.

**Kết luận (ranking):** (1) `databaseHooks.user.create.before` — chuẩn, phủ cả 2 sign-up path; (2) `hooks.before` mutate body — chỉ dùng nếu muốn validate/zoom dữ liệu đầu vào, không phải gán role; (3) không dùng defaultValue cho role.

### Q3 — `databaseHooks.session.create.before` chặn sign-in

**Signature:** `CORE/src/types/init-options.ts:1346-1361` — `(session: Session & Record<string, unknown>, context: GenericEndpointContext | null) => Promise<boolean | void | { data }>`.

**Phạm vi phủ:** `internalAdapter.createSession` → `createWithHooks(data, "session", ...)` (`BA/db/internal-adapter.mjs:176+`). Tất cả path sign-in đều đi qua đây:
- `/sign-in/email`: `BA/api/routes/sign-in.mjs:326` — `internalAdapter.createSession(user.user.id, ...)`, **không có try/catch** → APIError từ hook propagates nguyên vẹn → JSON error cho client với message tùy chỉnh. (Trả `false` thay vì throw thì chỉ được message generic `FAILED_TO_CREATE_SESSION` 401 — mất message, nên **throw APIError** là đúng.)
- OAuth callback `/callback/:id`: `handleOAuthUserInfo` → `createSession(user.id)` (`BA/oauth2/link-account.mjs:134`) — cũng ngoài try/catch của nhánh sign-up. APIError bay lên `callback.mjs:157-160`:

```js
} catch (e) {
  if (isAPIError(e) && e.body?.code)
    redirectOnError(c, resolvedErrorURL, e.body.code, e.body.message);
  throw e;
}
```
  `redirectOnError` (`BA/oauth2/errors.mjs`) **throw `c.redirect(...)`** → response là **302** tới `errorURL` (là `errorCallbackURL` lưu trong state, fallback `${baseURL}/error`) với `?error=<code>&error_description=<message>`. Tức là với OAuth, student-role login nhánh Google sẽ **không** thấy JSON error tại form — SPA phải bắt query params trên error callback page.
- `/sign-in/social` với `idToken` (Google One Tap): `handleOAuthUserInfo` gọi trực tiếp trong handler → APIError → **JSON error** (`sign-in.mjs:185-188`).

**ctx của hook có gì:** `with-hooks.mjs:7` lấy `getCurrentAuthContext()` → kiểu runtime là `AuthEndpointContext = Partial<InputContext & EndpointContext> & { context: AuthContext }` (`CORE/src/context/endpoint-context.ts:11-14`). Có: `ctx.request` (Request gốc — chính `createSession` nội bộ dùng đúng cách này để đọc `user-agent`/IP), `ctx.headers`, `ctx.path`, `ctx.body`, `ctx.query`, `ctx.context` (AuthContext). **Không có** các method `getCookie/setCookie` ở runtime (chúng được thêm bởi `createInternalContext` bên trong endpoint handler — object khác, xem `BC/endpoint.mjs:14`). Đọc cookie: `ctx.request.headers.get("cookie")` (hoặc `ctx.headers.get("cookie")`).

**Origin tại `/callback/google`:** callback là top-level **GET navigation** (browser bám redirect 302 của Google). Browser không gửi `Origin` header cho GET navigation thường → **đừng dựa vào Origin ở callback**. (Chính vì thế middleware origin-check bỏ qua GET — `origin-check.mjs:43`.) Ngược lại, POST `/sign-in/social` từ SPA thì Origin luôn có mặt.

### Q4 — Biết app nào initiate OAuth tại callback

**1.6 có sẵn cơ chế chính tả: `additionalData`.** Body schema của `/sign-in/social` (`BA/api/routes/sign-in.mjs:103-105`):

```js
additionalData: z.record(z.string(), z.any()).optional()
  .meta({ description: "Additional data to be passed through the OAuth flow" })
```

`generateState` spread nó vào state record (`BA/oauth2/state.mjs`):

```js
const stateData = {
  ...additionalData ? additionalData : {},
  callbackURL, codeVerifier, errorURL: c.body?.errorCallbackURL,
  newUserURL: c.body?.newUserCallbackURL, link,
  expiresAt: Date.now() + 600_000, requestSignUp
};
await setOAuthState(stateData);
```

**Lưu trữ** (`BA/state.mjs`): strategy `"cookie"` → JSON mã hóa (symmetricEncrypt) vào cookie `oauth_state` (maxAge 600s); strategy `"database"` → signed cookie `...state` (maxAge 300s, SameSite=lax) + row bảng `verification` với `value = JSON.stringify({...stateData, oauthState: state})`, `identifier = state`, expires 10 phút. Default: `storeStateStrategy: options.account?.storeStateStrategy || (isStateful ? "database" : "cookie")` (`BA/context/create-context.mjs:136`) → **repo có drizzle adapter nên mặc định là "database"** (state sống server-side, robust).

`stateDataSchema` là `z.looseObject` → **các key additionalData được giữ nguyên** qua parse. `parseState(c)` ở callback (`BA/api/routes/callback.mjs:54`) gọi `setOAuthState(parsedData)`.

**Đọc tại hook callback: `getOAuthState()` — được export từ `better-auth/api`** (`BA/api/index.mjs:216` export list có `getOAuthState`; định nghĩa `BA/api/state/oauth.mjs` = `defineRequestState(() => null)`; ALS request-scoped được mở cho mọi endpoint tại `BA/api/to-auth-endpoints.mjs:50` `runWithRequestState(new WeakMap(), run)`). Trong `databaseHooks.session.create.before` chạy trong cùng request callback:

```ts
import { getOAuthState } from "better-auth/api";
const state = await getOAuthState();          // { app: "teacher", callbackURL, ... } | null
const app = (state as any)?.app as "teacher" | "student" | undefined;
```

Flow đầy đủ: SPA gọi `authClient.signIn.social({ provider: "google", additionalData: { app: "teacher" } })` (hoặc tự POST `/sign-in/social` với `additionalData`) → state chứa `app` → lúc callback hook đọc ra.

**Phương án phụ (hoạt động mọi phiên bản 1.x): cookie tự đặt lúc initiate.** `hooks.before` trên `ctx.path === "/sign-in/social"`: đọc `ctx.headers.get("origin")` (Origin luôn có ở POST cross-origin từ SPA) rồi `ctx.setCookie("ba-app-role", "teacher", { maxAge: 600, path: "/", sameSite: "lax", ... })` — API `setCookie` có thật trên middleware context (Q1). databaseHook lúc callback đọc lại qua `ctx.request.headers.get("cookie")`. Điểm yếu: cookie đặt trên response của fetch cross-origin phụ thuộc chính sách cookie của deploy (repo này dùng chung parent domain qua `crossSubDomainCookieDomain` nên same-site, SameSite=Lax attach được ở cả callback navigation — OK). additionalData vẫn ưu tiên hơn vì dữ liệu sống trong state phía server.

Lưu ý: `/sign-in/social` (initiation) là nơi **đáng tin để phân biệt app bằng Origin**; callback thì dùng state/additionalData.

### Q5 — `user.additionalFields` với drizzle adapter + schema tường minh

**Config shape** (`CORE/src/types/init-options.ts:163-171` + `CORE/src/db/type.ts:184-282`):

```ts
user: { additionalFields: { role: { type: "string", required: false, input: false, defaultValue?: string, returned?: true } } }
// DBFieldAttributeConfig: required?, returned?, input?, defaultValue?, unique?, fieldName?, validator?, transform?, index?, sortable?
```

**Bắt buộc có column thật:** drizzle adapter chạy `checkMissingFields` trước mỗi insert (`DA/index.mjs`):

```js
if (!schema[fieldName]) throw new BetterAuthError(
  `The field "${key}" does not exist in the "${model}" Drizzle schema. Please update your drizzle schema or re-generate using "npx auth@latest generate".`);
```

→ plan thêm cột `role` vào bảng user của `@teacher-os/db/schema/auth` qua migration là **đúng và bắt buộc**. Field key map thẳng vào column cùng tên trong drizzle table (override bằng `fieldName` nếu muốn khác).

**Có xuất hiện trên `session.user`:** mọi response user đều qua `parseUserOutput` = `filterOutputFields(user, getFields(options, "user", "output"))` — additionalFields có `returned !== false` (mặc định true) được giữ (`BA/db/schema.mjs:6-26`). `/get-session` áp dụng ở mọi nhánh (`BA/api/routes/session.mjs:199,218,243,251`) → `auth.api.getSession({ headers })` trả `{ session, user: { ..., role } } | null` — **trả lời luôn Q8: có, tự động include**.

**`input: false` chặn gì** (`BA/db/schema.mjs:59-115` — `parseInputData`):

- `action = "create"` (sign-up/email): `input:false` + **có** `defaultValue` → giá trị client bị **thay** bằng defaultValue (không ném lỗi); `input:false` + **không** `defaultValue` + client gửi `role` truthy → **throw 400** `"role is not allowed to be set"`.
- `action = "update"` (`/update-user`, `BA/api/routes/update-user.mjs`): `input:false` → mọi attempt set role truthy → **400** `"role is not allowed to be set"` → client không tự đổi role được. ✅
- OAuth provider profile: `parseAdditionalUserInputFromProviderProfile` bỏ qua field `input:false` (`BA/db/schema.mjs:116-127`). ✅

**Khuyến nghị cấu hình:** `role: { type: "string", required: false, input: false }` (KHÔNG đặt defaultValue) + gán duy nhất bằng `databaseHooks.user.create.before` trả `{ data: { role } }` (hook merge sau cùng nên override mọi nguồn khác).

**`inferAdditionalFields`:** là client plugin type-inference (`BA/client/plugins/index.mjs:1,33` re-export từ `plugins/additional-fields/client.mjs`). Server không cần; SPA có thể bỏ qua — runtime `role` vẫn nằm trong JSON response của `getSession`/`signIn`. Chỉ thêm plugin (hoặc extends type `User` thủ công) khi SPA muốn `data.user.role` có kiểu.

### Q6 — Throw APIError từ hook: client nhận gì

**Class & import:** `better-auth/api` export `APIError` (xác nhận `BA/api/index.d.mts:3963`). `CORE/src/error/index.ts`: `class APIError extends BaseAPIError` (better-call) + helper `APIError.from(status, { code, message })`. Constructor: `new APIError(status, body, headers?)` với `status` là **status string**; map hợp lệ trong `BC/error.mjs` (`statusCodes`: `BAD_REQUEST: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, UNPROCESSABLE_ENTITY: 422, INTERNAL_SERVER_ERROR: 500, FOUND: 302, TOO_MANY_REQUESTS: 429, ...`).

**Serialization:** router onError → `toResponse(APIError)` → `new Response(JSON.stringify(data.body), { status: data.statusCode })` (`BC/to-response.mjs:125`) → body JSON = `{ message: "...", code?: "..." }`.

**Client (createAuthClient / better-fetch):** `BF/index.js:698-701,734-738`:

```js
return { data: null, error: { ...errorObject /* body JSON */, status: response.status, statusText: response.statusText } };
```

→ `signIn.email` nhận `error: { message: "<message tùy chỉnh>", code: "ROLE_MISMATCH"?, status: 403, statusText: "Forbidden" }` — **message survive nguyên văn**. (Docs tham chiếu cùng shape: https://www.better-auth.com/docs/concepts/database — ví dụ throw `APIError("BAD_REQUEST", { message: "..." })` từ databaseHook.)

Khuyến nghị kèm `code` riêng (vd `"ROLE_MISMATCH"`) vì code này chính là tham số `error=` trong redirect của OAuth callback (Q3/Q4).

### Q7 — trustedOrigins & POST không Origin

`BA/api/index.mjs` (router): `routerMiddleware: [{ path: "/**", middleware: originCheckMiddleware }]` → check chạy **mọi path**. `originCheckMiddleware` (`BA/api/middlewares/origin-check.mjs:42-69`):

```js
if (ctx.request?.method === "GET" || "OPTIONS" || "HEAD" || !ctx.request) return;  // GET đi qua tự do
await validateOrigin(ctx);            // KHÔNG force
// ... sau đó validate body.callbackURL/errorCallbackURL/... against trustedOrigins
```

`validateOrigin(ctx)` (`:95-114`) — điểm quyết định:

```js
const originHeader = headers.get("origin") || headers.get("referer") || "";
const useCookies = headers.has("cookie");
...
if (!(forceValidate || useCookies)) return;                       // (A) curl không cookie, không Origin -> PASS
if (!originHeader || originHeader === "null")
  throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.MISSING_OR_NULL_ORIGIN);   // (B) có cookie, không Origin -> 403
if (!trustedOrigins.some(o => matchesOriginPattern(originHeader, o)))
  throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.INVALID_ORIGIN);           // (C) Origin ngoài trustedOrigins -> 403
```

`(C)` chính là chỗ chặn cross-origin POST (browser fetch luôn gửi Origin) — SPA origins phải nằm trong `trustedOrigins` (repo đã truyền `input.corsOrigin`). Default list (`BA/context/helpers.mjs:60-84`): origin của `baseURL` + `options.trustedOrigins` + env `BETTER_AUTH_TRUSTED_ORIGINS`.

Riêng `/sign-in/email` và `/sign-up/email` còn gắn `formCsrfMiddleware` (`:119-149`): nếu request **không** có cookie header → check Fetch Metadata: chặn `Sec-Fetch-Site: cross-site` + `Sec-Fetch-Mode: navigate` (403 `CROSS_SITE_NAVIGATION_LOGIN_BLOCKED`); có bất kỳ Sec-Fetch header → `validateOrigin(ctx, /*force*/ true)`; có origin/referer → force validate. **curl trần (không cookie, không Sec-Fetch, không Origin) → đi qua tất cả.** Trong browser thật, POST từ SPA luôn có Origin → quyết định chặn/cho nằm ở trustedOrigins.

### Q8 — `auth.api.getSession()` có additionalFields?

**Có.** Xem Q5: `/get-session` trả `{ session, user }` với user qua `parseUserOutput` ở mọi path (cookie cache, refresh, DB fetch — `BA/api/routes/session.mjs:199,218,243,251`), additionalField `returned !== false` luôn có trong `user`.

---

## 3. Khuyến nghị kiến trúc (ranking) cho teacher-os

Bối cảnh đã đọc: `packages/auth/src/index.ts` (createAuth: drizzleAdapter sqlite + schema `@teacher-os/db/schema/auth`, trustedOrigins từ corsOrigin, google provider, đã có hooks.before cho `/update-user`), `apps/server/src/app.ts` (Hono mount `/api/auth/*`, hai SPA cross-origin cùng parent domain — cookie zone dùng chung qua `crossSubDomainCookieDomain`).

1. **Gán role lúc sign-up:** `databaseHooks.user.create.before` — đọc app: OAuth → `(await getOAuthState())?.app`; email → Origin từ `ctx.request.headers.get("origin")` (map origin→role từ config) → `return { data: { role } }`. Kèm thêm cột `role` TEXT vào bảng user (drizzle migration) và `user.additionalFields.role = { type: "string", required: false, input: false }`.
2. **Chặn sign-in sai role:** `databaseHooks.session.create.before` — tính expected role giống trên; mismatch → `throw new APIError("FORBIDDEN", { message: "...", code: "ROLE_MISMATCH" })`. Email/password: form nhận JSON error trực tiếp. OAuth: browser redirect tới `errorCallbackURL` với `?error=ROLE_MISMATCH&error_description=...` → SPA error page phải đọc 2 param này.
3. **OAuth app-detection:** ưu tiên `additionalData` gửi từ client lúc `signIn.social` (state DB-side, không phụ thuộc cookie) + fallback đọc Origin ngay lúc `/sign-in/social` (hooks.before) cho nhánh idToken (One Tap) không có state. Cookie tự đặt chỉ làm phương án cuối.
4. **trustedOrigins:** giữ nguyên 2 SPA origins — đã đủ cho cả CSRF check lẫn validate callbackURL.

Trade-off đã cân nhắc: làm tất cả trong `hooks.before` (một nơi, nhưng bỏ sót OAuth callback vì callback không mang Origin và mutate body không phủ OAuth sign-up) vs `databaseHooks` (chạy đúng ở mọi path, ctx đủ dùng) → chọn 2 hooks databaseHooks + dùng `hooks.before` chỉ cho validate đầu vào (pattern repo đang có).

## 4. Limitations & câu hỏi chưa giải quyết

- **Không chạy runtime test** — mọi kết luận là đọc tĩnh source đúng bản 1.6.27 đã cài (kèm docs latest để đối chiếu API surface; docs có thể mô tả bản mới hơn, mọi claim hành vi đều neo vào source 1.6.27).
- `getOAuthState` được export công khai (`better-auth/api`) nhưng **hầu như không có trang docs riêng** — nếu muốn "API chính thức", có thể tự fallback: đọc row `verification` theo `state` query param trong hook (state strategy "database"), hoặc dùng cookie tự đặt (Q4 phương án phụ).
- Chưa verify hành vi Set-Cookie thực tế qua D1/workers với `additionalData` flow trong E2E (khuyến nghị test 1 case: sign-in Google từ student app với tài khoản teacher-role → assert redirect error params).
- `databaseHooks.session.create.before` cũng chạy khi sign-up auto sign-in — role vừa gán sẽ khớp nên vô hại, nhưng nhớ khi viết hook phải handle trường hợp `session.userId` vừa tạo (nếu logic cần).
- Origin header từ một số client nội bộ (curl, server-to-server) sẽ không có → hook phải quyết định default role hoặc từ chối; câu hỏi mở: có cần hỗ trợ sign-in không trình duyệt không?
