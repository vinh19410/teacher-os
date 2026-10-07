---
title: Wrapper API giả lập giao dịch SePay sandbox cho Postman
date: 2026-10-07
summary: "Thêm POST /dev/bank-hub/mock-transaction bọc /v1/transaction/create (sandbox-only, Apikey auth); commit 9eb84db trên develop"
---

# Wrapper API giả lập giao dịch SePay sandbox cho Postman

## What happened
#320 cần bắn giao dịch giả lập sandbox bằng Postman thay cho script /tmp. Đã wrap API SePay "Giả lập giao dịch" (POST /v1/transaction/create, docs bankhub/api-giao-dich/gia-lap-giao-dich):

- `apps/server/src/lib/bank-hub/bank-hub-client.ts`: method `createMockTransaction` + schema `bankHubMockTransactionRawSchema` trong bank-hub-types.ts (chỉ transaction_id là bắt buộc, còn lại nullish — shape không đồng nhất giữa các endpoint SePay).
- `apps/server/src/routes/bank-hub-mock.ts` (mới): route POST `/dev/bank-hub/mock-transaction` mount NGOÀI /api (app.ts) như webhook — auth `Authorization: Apikey <SEPAY_BANKHUB_IPN_API_KEY>` (safeEqual), 403 nếu env không phải sandbox, bodyLimit 64KB.
- Body: `{amount, content, transferType?: credit|debit (mặc định credit), bankAccountXid?}`. Thiếu bankAccountXid → lấy từ org duy nhất đang linked (409 NO_LINKED_ACCOUNT / AMBIGUOUS_ACCOUNT).
- Lỗi SePay: 429 giữ Retry-After; còn lại 502 kèm upstreamStatus/upstreamMessage (khác route teacher-facing — audience là dev đang debug).
- Cập nhật 5 stub BankHubClient (4 test file + e2e fake-bank-hub) vì interface thêm method bắt buộc.

Gate: biome sạch trên apps/server/src + apps/e2e/src (`pnpm check` gốc vẫn chết vì nested biome.json trong .claude/worktrees — known issue), check-types 7/7 packages, server test 639/639 (thêm 2 test client + 9 test route). Commit 9eb84db trên develop, chưa push.

## Decision
- Auth bằng IPN Apikey thay vì session: Postman không tiện gửi cookie Better Auth + CSRF guard; Apikey là secret merchant user đã có trong env.
- Gate sandbox-only phía server (403 SANDBOX_ONLY) dù SePay tự 403 ở production — tránh gọi nhầm production host khi base URL cấu hình lệch.
- Trả upstreamMessage trong 502: chủ đích cho dev tool, có docblock giải thích khác biệt với bank-link routes.

## Next steps
- User tự call thử bằng Postman (xem hướng dẫn trong report: Authorization: Apikey <SEPAY_BANKHUB_IPN_API_KEY>).
- Giao dịch tạo xong sẽ chảy về webhook IPN sẵn có → kiểm tra invoice được match.
- Chưa push develop; e2e suite không chạy (fake thêm method nhưng không flow nào dùng, đã phủ bởi check-types).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
