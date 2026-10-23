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
   - `router.use("*", bodyLimit({ maxSize: 25 * 1024 * 1024 }))` — trần payload GitHub là 25 MB.
   - `router.post("/", handler)`:
     1. `secret` rỗng/undefined → `503 {"error":"GITHUB_WEBHOOK_DISABLED"}`.
     2. `const raw = Buffer.from(await c.req.arrayBuffer())`.
     3. `const signature = c.req.header("X-Hub-Signature-256") ?? ""`; expected =
        `"sha256=" + createHmac("sha256", secret).update(raw).digest("hex")` (`node:crypto`, Worker đã bật
        `nodejs_compat`). `!safeEqual(signature, expected)` → `401 {"error":"unauthorized"}`.
     4. `Content-Type` (bỏ phần `; charset=...`, lowercase) khác `application/json` → `415`.
     5. `JSON.parse(raw.toString("utf8"))` lỗi → `400 {"error":"invalid json"}`.
     6. Thiếu `X-GitHub-Event` → `400 {"error":"missing event"}`.
     7. `ping` → `200 {"ok":true}`.
     8. Còn lại: `console.log("[github-webhook] event=… delivery=… action=… repo=…")` — `action` và
        `repository.full_name` chỉ lấy khi là string, ngược lại in `-`; trả `202 {"ok":true}`.
2. **AppDeps** (`app.ts`): thêm field có JSDoc tiếng Việt cùng giọng các field khác —
   `githubWebhookSecret?: string` (rỗng/vắng → route trả 503, giống hợp đồng `getBankHub`).
3. **Mount** (`app.ts`, cạnh dòng `/webhooks/sepay/bankhub`):
   `app.route("/webhooks/github", githubWebhookRoutes({ secret: deps.githubWebhookSecret }))` kèm comment ngắn.
   Không đụng `bootstrapMiddleware` (chỉ áp `/api/*`).
4. **index.ts**: `githubWebhookSecret: env.GITHUB_WEBHOOK_SECRET` trong `buildApp({...})`. Kiểu `env` suy ra
   từ `alchemy.run.ts` — phase 2 thêm binding; làm bước infra (phase 2, bước 1) ngay trong commit này nếu
   `check-types` báo thiếu field.
5. **Test** `github-webhooks.test.ts` — gọi qua `buildApp` (như `bank-hub-webhooks.test.ts`) để phủ cả việc mount,
   `getDb` trả object rỗng ép kiểu (route không chạm DB), `getSessionUser` trả `null`. Helper `sign(body, secret)`
   bằng `createHmac`. Các case:
   - `ping` ký đúng → 200 `{ok:true}`.
   - `push` ký đúng → 202; spy `console.log` có `event=push`, `delivery=<id>`, `repo=<full_name>`; không chứa
     secret, chuỗi chữ ký, hay một field đặc trưng của payload (vd `head_commit` message).
   - Thiếu header chữ ký → 401; chữ ký sai → 401; chữ ký sai độ dài → 401; body bị sửa sau khi ký → 401.
   - Secret rỗng (`githubWebhookSecret: ""`) và vắng → 503.
   - Ký đúng nhưng `Content-Type: application/x-www-form-urlencoded` → 415.
   - Ký đúng, body không phải JSON → 400; thiếu `X-GitHub-Event` → 400.
   - `GET /webhooks/github` → 404 (chỉ nhận POST).
   - Request không bị bootstrap: `getSessionUser` spy không được gọi.

## Verification

- `pnpm --filter server test -- github-webhooks` — toàn bộ case xanh.
- `pnpm --filter server check-types`
- `pnpm check`

## Risk & Rollback

- Rủi ro thấp: route mới, không đổi route cũ. Rollback = revert commit (gỡ mount + file route).
