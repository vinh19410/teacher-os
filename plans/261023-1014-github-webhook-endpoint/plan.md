---
title: "Endpoint public POST /webhooks/github nhận webhook GitHub"
status: pending
created: 2026-10-23
branch: develop
mode: fast
issue: https://github.com/vinh19410/teacher-os/issues/421
---

# Endpoint public POST /webhooks/github nhận webhook GitHub

## Mục tiêu

Worker `apps/server` có endpoint public `POST /webhooks/github` nhận webhook từ GitHub: xác thực chữ ký
HMAC `X-Hub-Signature-256` bằng secret dùng chung, trả ack nhanh và log metadata của delivery. Chưa xử lý
nghiệp vụ, chưa lưu DB — đây là nền để gắn handler theo event ở các issue sau.

## Quyết định đã chốt (user, 2026-10-23)

| Câu hỏi | Chốt |
|---|---|
| Làm gì với event sau khi verify | Verify + ack + log. Không DB, không xử lý nghiệp vụ |
| Path | `POST /webhooks/github`, mount ngoài `/api/*` (cùng cách `/webhooks/sepay/bankhub`) |

## Scope Challenge

- **Code tái dùng:** `apps/server/src/lib/safe-equal.ts` (so sánh constant-time), pattern route webhook
  ngoài `/api/*` + `bodyLimit` + dep optional → 503 khi thiếu secret ở
  `apps/server/src/routes/bank-hub-webhooks.ts`, pattern secret `Config.string(...).pipe(Config.withDefault(""))`
  ở `packages/infra/alchemy.run.ts`, pattern truyền secret qua khối `env:` của bước deploy (`RESEND_API_KEY`).
- **Scope yêu cầu:** endpoint POST public nhận webhook GitHub — giao đủ, không thêm.
- **Độ phức tạp:** 2 file mới (route + test), 7 file sửa (app.ts, index.ts, alchemy.run.ts, 2 workflow deploy,
  2 doc). Vượt ngưỡng 8 file nhẹ vì phần lớn là wiring 1–3 dòng; không thêm class/service mới.
- **Mode:** HOLD SCOPE.

## Hợp đồng endpoint

| Điều kiện (theo thứ tự kiểm) | Response |
|---|---|
| `GITHUB_WEBHOOK_SECRET` rỗng / dep vắng | `503 {"error":"GITHUB_WEBHOOK_DISABLED"}` |
| Body > 25 MB (trần payload của GitHub) | `413` (từ `bodyLimit`) |
| Thiếu/sai định dạng/sai chữ ký `X-Hub-Signature-256` | `401 {"error":"unauthorized"}` |
| `Content-Type` không phải `application/json` | `415 {"error":"unsupported content type"}` |
| Body không phải JSON hợp lệ | `400 {"error":"invalid json"}` |
| Thiếu header `X-GitHub-Event` | `400 {"error":"missing event"}` |
| `X-GitHub-Event: ping` | `200 {"ok":true}` |
| Event khác | `202 {"ok":true}` + 1 dòng log |

Chữ ký được tính trên **raw bytes** của body (đọc `arrayBuffer` trước khi parse), so khớp constant-time.
Dòng log chỉ gồm `event`, `delivery` (`X-GitHub-Delivery`), `action`, `repository.full_name` — không bao giờ
log payload, header chữ ký hay secret.

## Phases

| # | Phase | Trạng thái | Phụ thuộc |
|---|---|---|---|
| 1 | [Route webhook + wiring app + test](phase-01-github-webhook-route.md) | pending | — |
| 2 | [Secret infra/CI + docs + verify](phase-02-infra-docs-verify.md) | pending | 1 |

## Tiêu chí nghiệm thu

1. `POST /webhooks/github` với chữ ký đúng → `ping` trả 200, event khác trả 202; chữ ký sai/thiếu → 401;
   secret chưa cấu hình → 503. Tất cả có test trong `apps/server/src/routes/github-webhooks.test.ts`.
2. Request đi qua route không chạy bootstrap middleware lẫn Better Auth (mount ngoài `/api/*`).
3. Test khẳng định log không chứa secret, chữ ký hay nội dung payload.
4. `GITHUB_WEBHOOK_SECRET` khai trong `alchemy.run.ts` (default rỗng) và được truyền ở bước deploy của
   `deploy.yml` + `deploy-staging.yml` từ secret Actions `GH_WEBHOOK_SECRET` (Actions cấm tiền tố `GITHUB_`).
5. `pnpm check`, `pnpm check-types`, `pnpm --filter server test` xanh.
6. Runbook có dòng secret inventory + hướng dẫn đăng ký webhook trên GitHub; `system-architecture.md` có dòng route.

## Ngoài phạm vi

- Lưu event vào D1, dedupe theo `X-GitHub-Delivery`, retry/queue.
- Xử lý nghiệp vụ theo event (issues, pull_request, push…).
- Hỗ trợ content type `application/x-www-form-urlencoded` (cấu hình webhook phải chọn `application/json`).
- Lọc IP theo dải `hooks` của GitHub `/meta` — HMAC đã đủ xác thực.
