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
| POST thiếu `Content-Length` (stream/chunked; GitHub luôn gửi header này) | `411 {"error":"length required"}` — middleware chặn trước khi đọc body, tránh `bodyLimit` phải buffer 25 MB vào memory isolate với request chưa xác thực |
| Body > 25 MB (trần payload của GitHub) | `413` — middleware `bodyLimit` chặn theo `Content-Length` trước khi handler chạy |
| `GITHUB_WEBHOOK_SECRET` rỗng / dep vắng | `503 {"error":"GITHUB_WEBHOOK_DISABLED"}` |
| Thiếu/sai định dạng/sai chữ ký `X-Hub-Signature-256` | `401 {"error":"unauthorized"}` |
| `Content-Type` không phải `application/json` | `415 {"error":"unsupported content type"}` |
| Body không phải JSON hợp lệ | `400 {"error":"invalid json"}` |
| Thiếu header `X-GitHub-Event` | `400 {"error":"missing event"}` |
| `X-GitHub-Event: ping` | `200 {"ok":true}` |
| Event khác | `202 {"ok":true}` + 1 dòng log |

`GET` (và method khác) → 404 từ Hono; guard `Content-Length` chỉ áp dụng POST.

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

## Red Team Review

Ngày 2026-10-23, 2 reviewer (Security Adversary + Assumption Destroyer). 3 findings, chấp nhận 3 (1 modified):

| # | Severity | Finding | Disposition |
|---|---|---|---|
| S1 | High | `bodyLimit` 25 MB buffer toàn bộ body vào memory isolate TRƯỚC khi HMAC verify — request chunked (không `Content-Length`) chưa xác thực vẫn ép isolate buffer ~25 MB (peak ~50 MB sau copy `Buffer.from`), 3–5 request đồng thời vượt limit 128 MB/isolate của Workers, ảnh hưởng route teacher/student cùng isolate | **Accept (modified):** thêm middleware chặn POST thiếu `Content-Length` → 411 trước `bodyLimit`; giữ cap 25 MB theo quyết định đã chốt (variant hạ cap 256 KB–1 MB bị từ chối vì lệch hợp đồng user) |
| S2 | Medium | Bảng hợp đồng khai 503 đứng trước 413 nhưng `bodyLimit` là middleware chạy trước handler → request > 25 MB vào deployment thiếu secret nhận 413, không phải 503; không có test 413 | **Accept:** đảo thứ tự bảng (413 trước 503), thêm test 413 + 411 vào phase 1 |
| S3 | Medium | `Config.withDefault("")` khiến mọi deploy ngoài CI thiếu `GITHUB_WEBHOOK_SECRET` ghi đè secret production về rỗng → endpoint 503, delivery GitHub fail tới lần deploy CI kế tiếp; runbook không cảnh báo | **Accept:** thêm cảnh báo vào runbook row (mirror precedent `production-release-runbook.md:582`); từ chối variant fail-loud trong `alchemy.run.ts` vì lệch pattern `withDefault("")` của RESEND/SEPAY và phá dev deploy |

### Kongming checkpoint (sau plan gates) — GO

4 chỉnh sửa đã áp vào plan: (3a) kiểm format `^sha256=[0-9a-f]{64}$` trước khi đọc body — request sai
format không tốn buffer; (3b) test 413 dùng `Content-Length` giả + body nhỏ, test 411 dùng stream
`duplex: "half"` theo precedent `student-quiz-media.test.ts:466-502`; (3c) `bodyLimit` thêm
`onError` JSON `{"error":"payload too large"}` đồng bộ precedent `student.ts:366`; (3d) binding
`alchemy.run.ts` gộp vào commit phase 1 để mọi commit xanh.

**Residual risk accepted (user cap 25 MB):** request có `Content-Length` thật ~24 MB kèm chữ ký đúng
format nhưng sai key vẫn được buffer trước khi HMAC fail — guard 411 + format check chỉ chặn request
chunked và request sai format. Đây là cái giá chấp nhận của hợp đồng 25 MB do user chốt; khi có
handler thật, xem lại cap theo từng event.

### Whole-Plan Consistency Sweep

- Đã cập nhật bảng hợp đồng `plan.md` (thứ tự 411 → 413 → 503), test cases phase 1 (thêm 411, 413,
  format-check 401 sớm, test dùng precedent giả `Content-Length`), runbook phase 2 (cảnh báo deploy
  ngoài CI), gộp binding `alchemy.run.ts` vào phase 1 (kongming 3d). Không còn tham chiếu cũ nào tới
  thứ tự "503 trước 413" hay "body 25 MB thật trong test".
- Không có mâu thuẫn chưa giải quyết.
