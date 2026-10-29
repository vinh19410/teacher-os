---
phase: 1
title: "Route webhook + wiring app + test"
status: pending
priority: P2
effort: "2h"
dependencies: []
---

# Phase 1: Route webhook + wiring app + test

## Goal

Thêm router `githubWebhookRoutes` xác thực HMAC và ack/log, mount tại `/webhooks/github` trong `buildApp`,
truyền secret từ env Worker, kèm test phủ toàn bộ hợp đồng trong `plan.md`.

## Files to Create / Modify

- Create: `apps/server/src/routes/github-webhooks.ts`
- Create: `apps/server/src/routes/github-webhooks.test.ts`
- Modify: `apps/server/src/app.ts` — thêm `githubWebhookSecret?: string` vào `AppDeps`, mount route
- Modify: `apps/server/src/index.ts` — truyền `githubWebhookSecret: env.GITHUB_WEBHOOK_SECRET`

## Tasks & Steps

1. **Router** `apps/server/src/routes/github-webhooks.ts` (theo phong cách `bank-hub-webhooks.ts`, docblock giải
   thích vì sao mount ngoài `/api/*` và vì sao verify trên raw bytes):
   - `export function githubWebhookRoutes(deps: { secret?: string })` trả `new Hono()`.
   - Một middleware `router.use("*")` scope POST (code-review #421 — `bodyLimit` của hono
     không kiểm method, scope POST để "method khác → 404" luôn đúng kể cả Content-Length lớn):
     method ≠ POST → `next()` thẳng; POST thiếu `Content-Length` → `411 {"error":"length required"}`
     (red-team S1: GitHub luôn gửi header này; request stream/chunked là client lạ và nếu cho đi
     tiếp sẽ bị buffer tới 25 MB vào memory isolate trước khi chữ ký kịp fail); còn lại gọi
     `bodyLimit({ maxSize: 25 * 1024 * 1024, onError: (c) => c.json({ error: "payload too large" }, 413) })`
     — trần payload GitHub 25 MB, chặn theo header không đọc body; `onError` JSON đồng bộ body 4xx
     với precedent `student.ts:366` / `vocab.ts:321`.
   - `router.post("/", handler)`:
     1. `secret` rỗng/undefined → `503 {"error":"GITHUB_WEBHOOK_DISABLED"}`.
     2. Kiểm format chữ ký TRƯỚC khi đọc body (kongming 3a): `X-Hub-Signature-256` phải khớp
        `^sha256=[0-9a-f]{64}$` — không khớp → `401 {"error":"unauthorized"}` ngay, chưa gọi
        `arrayBuffer()` (request rác không tốn memory buffer).
     3. `const raw = Buffer.from(await c.req.arrayBuffer())`.
     4. `const signature = c.req.header("X-Hub-Signature-256") ?? ""`; expected =
        `"sha256=" + createHmac("sha256", secret).update(raw).digest("hex")` (`node:crypto`, Worker đã bật
        `nodejs_compat`). `!safeEqual(signature, expected)` → `401 {"error":"unauthorized"}`.
     5. `Content-Type` (bỏ phần `; charset=...`, lowercase) khác `application/json` → `415`.
     6. `JSON.parse(raw.toString("utf8"))` lỗi → `400 {"error":"invalid json"}`.
     7. Thiếu `X-GitHub-Event` → `400 {"error":"missing event"}`.
     8. `ping` → `200 {"ok":true}`.
     9. Còn lại: `console.log("[github-webhook] event=… delivery=… action=… repo=…")` — `action` và
        `repository.full_name` chỉ lấy khi là string, ngược lại in `-`; trả `202 {"ok":true}`.
2. **AppDeps** (`app.ts`): thêm field có JSDoc tiếng Việt cùng giọng các field khác —
   `githubWebhookSecret?: string` (rỗng/vắng → route trả 503, giống hợp đồng `getBankHub`).
3. **Mount** (`app.ts`, cạnh dòng `/webhooks/sepay/bankhub`):
   `app.route("/webhooks/github", githubWebhookRoutes({ secret: deps.githubWebhookSecret }))` kèm comment ngắn.
   Không đụng `bootstrapMiddleware` (chỉ áp `/api/*`).
4. **index.ts + alchemy.run.ts** (cùng commit để mọi commit đều xanh — kongming 3d):
   `githubWebhookSecret: env.GITHUB_WEBHOOK_SECRET` trong `buildApp({...})`; thêm binding
   `GITHUB_WEBHOOK_SECRET: Config.string("GITHUB_WEBHOOK_SECRET").pipe(Config.withDefault(""))` vào khối
   `env` của Worker server trong `alchemy.run.ts` (kiểu `env` suy ra từ đây qua `ServerEnv` — thiếu binding
   thì `check-types` đỏ). Chi tiết comment/bảo vệ infra xem phase 2.
5. **Test** `github-webhooks.test.ts` — gọi qua `buildApp` (như `bank-hub-webhooks.test.ts`) để phủ cả việc mount,
   `getDb` trả object rỗng ép kiểu (route không chạm DB), `getSessionUser` trả `null`. Helper `sign(body, secret)`
   bằng `createHmac`. Các case:
   - `ping` ký đúng → 200 `{ok:true}`.
   - `push` ký đúng → 202; spy `console.log` có `event=push`, `delivery=<id>`, `repo=<full_name>`; không chứa
     secret, chuỗi chữ ký, hay một field đặc trưng của payload (vd `head_commit` message).
   - Thiếu header chữ ký → 401; chữ ký sai → 401; chữ ký sai độ dài/sai format (`sha256=xyz…`) → 401;
     body bị sửa sau khi ký → 401. Case sai format kèm body lớn (Content-Length giả ~24 MB) vẫn 401
     mà không buffer (format check chạy trước khi đọc body).
   - Secret rỗng (`githubWebhookSecret: ""`) và vắng → 503.
   - Ký đúng nhưng `Content-Type: application/x-www-form-urlencoded` → 415.
   - Ký đúng, body không phải JSON hợp lệ → `400 {"error":"invalid json"}`; ký đúng, thiếu
     `X-GitHub-Event` → `400 {"error":"missing event"}`.
   - `GET /webhooks/github` → 404 (chỉ nhận POST).
   - POST không có `Content-Length` → 411 `{"error":"length required"}` — dùng pattern stream
     `ReadableStream` + `duplex: "half"` (cast `RequestInit & { duplex: "half" }`) theo precedent
     `student-quiz-media.test.ts:466-488`; `GET` không `Content-Length` vẫn 404.
   - Body quá trần → 413 `{"error":"payload too large"}` — đặt header `Content-Length` giả (> 25 MB) với
     body nhỏ theo precedent `student-quiz-media.test.ts:496-502`, kể cả khi `githubWebhookSecret` rỗng
     (`bodyLimit` middleware chặn trước handler — thứ tự bảng hợp đồng).
   - Request không bị bootstrap: `getSessionUser` spy không được gọi.

## Verification

- `pnpm --filter server test -- github-webhooks` — toàn bộ case xanh.
- `pnpm --filter server check-types`
- `pnpm check`

## Risk & Rollback

- Rủi ro thấp: route mới, không đổi route cũ. Rollback = revert commit (gỡ mount + file route).
