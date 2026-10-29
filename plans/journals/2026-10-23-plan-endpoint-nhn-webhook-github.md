---
title: Plan endpoint nhận webhook GitHub
date: 2026-10-23
summary: "Plan POST /webhooks/github: verify HMAC + ack + log, issue #421"
---

# Plan endpoint nhận webhook GitHub

## What happened
Lập plan (mode fast) cho endpoint public `POST /webhooks/github` trên `apps/server`, issue #421, plan tại `plans/261023-1014-github-webhook-endpoint/`.

## Decision
- User chốt: chỉ verify HMAC `X-Hub-Signature-256` + ack + log; không lưu D1, không xử lý nghiệp vụ.
- Mount ngoài `/api/*` theo pattern `/webhooks/sepay/bankhub` để bootstrap middleware và Better Auth không chạy; tái dùng `safeEqual`.
- Chữ ký tính trên raw bytes (`arrayBuffer`) trước khi parse JSON; `bodyLimit` 25 MB theo trần payload GitHub.
- Secret Actions đặt tên `GH_WEBHOOK_SECRET` vì GitHub Actions cấm tiền tố `GITHUB_`; binding Worker vẫn là `GITHUB_WEBHOOK_SECRET`, default rỗng ⇒ 503.

## Next steps
`/ak:cook plans/261023-1014-github-webhook-endpoint/plan.md`; sau deploy, set secret trên GitHub environment và đăng ký webhook, kiểm bằng delivery `ping`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
