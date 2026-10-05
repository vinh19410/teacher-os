---
phase: 1
title: "Phase 1: Nền tảng Bank Hub — client, secrets, schema"
status: completed
priority: P1
effort: "1d"
dependencies: []
---

# Phase 1: Nền tảng Bank Hub — client, secrets, schema

## Overview

Tạo `BankHubClient` (server-only, fetch thuần chạy được trên Workers và Node),
khai báo secrets trong infra, thêm 3 thay đổi schema D1 và inject client qua
`AppDeps` theo đúng mẫu `getMediaStore?()`. Chưa có route nào dùng — phase này
chỉ dựng nền và test đơn vị.

## Context Links

- [research/bank-hub-research.md](./research/bank-hub-research.md)
- `apps/server/src/app.ts:38` (`AppDeps`, mẫu `getMediaStore?()`)
- `apps/server/src/index.ts` (memo lazy per-isolate)
- `packages/infra/alchemy.run.ts` (secrets `Config.redacted`)
- `packages/db/src/schema/invoice.ts`, `packages/db/src/schema/index.ts`

## Key Insights

- `/v1/token` trả `ttl` (giây). Cache token trong module-scope theo isolate; làm mới khi gần hết hạn **hoặc** khi API trả 401 (retry đúng 1 lần).
- Rate limit Bank Hub không được công bố riêng; SePay API chung là 2–3 req/s → client tôn trọng `Retry-After` khi 429, không tự retry vòng lặp.
- `invoice.enrollmentId` không có FK (giữ hồ sơ tài chính khi xoá enrollment) — bảng mới theo cùng tinh thần: `payment_transaction.invoice_id` không cascade-delete.
- Hai bí mật inbound (IPN `Apikey`, webhook `X-Secret-Key`) là **hai giá trị khác nhau**.

## Requirements

- Client hỗ trợ: `createCompany`, `getCompany`, `editCompany` (`POST /v1/company/edit/{xid}` — phase 2 cần đặt `transaction_amount` thành `Unlimited`), `createLinkToken`, `getBankAccount`, `listBankAccounts`, `listTransactions`. `createSandboxTransaction` **không** nằm trong client (chỉ là công cụ sandbox, 403 trên production) — phase 6 đặt helper riêng trong `apps/server/scripts/bankhub-setup.ts`. <!-- RT2 #S3/#B2 -->
- Lỗi được chuẩn hoá thành `BankHubError { status, code?, message }`; không log `client_secret`, access token hay body chứa token.
- Env mới (5 biến): 4 bí mật `SEPAY_BANKHUB_CLIENT_ID`, `SEPAY_BANKHUB_CLIENT_SECRET`, `SEPAY_BANKHUB_IPN_API_KEY`, `SEPAY_BANKHUB_WEBHOOK_SECRET` khai báo `Config.string().pipe(Config.withDefault(""))` — **không** dùng `Config.redacted` vì redacted là required lúc eval deploy: thiếu giá trị làm `alchemy dev/deploy` ném ConfigError trước khi Worker chạy, phá yêu cầu "local/dev không vỡ" (repo đã ghi giới hạn này tại `packages/infra/alchemy.run.ts:129-131` cùng pattern `RESEND_API_KEY`). 1 cấu hình thường `Config.string` — `SEPAY_BANKHUB_BASE_URL` (mặc định sandbox ở dev). Origin hosted-link **không** qua env: dùng const dùng chung `BANK_HUB_LINK_ORIGINS` ở `packages/api` (phase 2) để server validate và web CSP cùng một nguồn sự thật. <!-- RT2 #A1/#A3 -->
- Thiếu bất kỳ secret nào (chuỗi rỗng) ⇒ `getBankHub()` trả `undefined` ⇒ route Bank Hub trả `503 { code: "BANKHUB_DISABLED" }` (giống media trả 503) — local/dev không vỡ.

## Architecture

```
apps/server/src/lib/bank-hub/
  bank-hub-client.ts      # interface BankHubClient + createBankHubClient(cfg, fetchImpl)
  bank-hub-types.ts       # DTO: Company, LinkToken, BankAccount, BankHubTransaction, Ipn, WebhookEvent (zod)
  bank-hub-client.test.ts # fetch giả: token cache, 401→refresh 1 lần, 429, map lỗi
```

`AppDeps` thêm:

```ts
/** SePay Bank Hub — vắng mặt (thiếu secret) thì route ngân hàng trả 503. */
getBankHub?(): BankHubContext | undefined;
// BankHubContext = { client: BankHubClient; ipnApiKey: string; webhookSecret: string; env: "sandbox" | "production" }
```

### Schema (một migration `0033_*.sql` sinh bằng drizzle-kit)

1. **`org_bank_link`** (1 dòng / org; PK `org_id` FK organization cascade):
   `company_xid` text unique not null, `bank_account_xid` text unique nullable,
   `past_bank_account_xids` text not null default "[]" (JSON array — các
   `bank_account_xid` đã từng liên kết trước khi đổi TK; đối soát phase 4 quét
   cả các xid này để không mất giao dịch về TK cũ), <!-- RT2 #S2/#F1 -->
   `status` text (`none|linked|inactive|unlinked`), `brand_name`, `bank_bin`,
   `bank_code`, `account_number`, `account_holder_name` (text default ""),
   `last_event_at` integer default 0 (unix giây của webhook event mới nhất đã
   áp dụng — chống event đến sai thứ tự; `sync` từ client cũng advance), `last_reconciled_at` integer default 0
   (cooldown nút đối soát), `linked_at`, `updated_at` (timestamp_ms).
2. **`invoice`** thêm: `payment_code` text nullable **unique**, `pay_token`
   text nullable **unique**, `paid_amount` integer not null default 0.
3. **`payment_transaction`** (sổ cái giao dịch đã nhận):
   `id` PK, `org_id` FK cascade, `provider` text default `sepay_bankhub`,
   `provider_txn_id` text not null, `bank_account_xid` text, `amount` integer,
   `content` text, `reference_code` text, `transaction_date` text,
   `payment_code` text nullable, `invoice_id` text nullable (no FK),
   `match_status` text (`matched|unmatched|ignored`),
   `unmatched_reason` text default "" (`unknown_code|invoice_paid|no_code|foreign_code`),
   `raw` text default "" (JSON gốc — **chỉ điền khi giao dịch chưa khớp** phục
   vụ debug/đối soát; giao dịch matched để rỗng, giảm PII và storage), `created_at`. <!-- RT2 #B5 -->
   **UNIQUE(`provider`, `provider_txn_id`)** = khoá chống trùng;
   index (`org_id`, `match_status`), index (`invoice_id`).

## Related Code Files

- Create: `apps/server/src/lib/bank-hub/bank-hub-client.ts`, `bank-hub-types.ts`, `bank-hub-client.test.ts`
- Create: `packages/db/src/schema/org-bank-link.ts`, `packages/db/src/schema/payment-transaction.ts`
- Create: `packages/db/src/migrations/0033_*.sql` (+ `meta/` do drizzle-kit sinh)
- Modify: `packages/db/src/schema/invoice.ts`, `packages/db/src/schema/index.ts`
- Modify: `apps/server/src/app.ts` (`AppDeps.getBankHub`), `apps/server/src/index.ts` (memo client từ env)
- Modify: `packages/infra/alchemy.run.ts` (5 binding env), `packages/env/env.d.ts` (type binding)
- Modify: `packages/api/src/contracts.ts` hoặc lib mới (`BANK_HUB_LINK_ORIGINS` const dùng chung — phase 2 tiêu thụ)
- Tên biến (không giá trị) ghi vào `docs/production-release-runbook.md` ở phase 6 — repo không có file env mẫu

## Implementation Steps

1. Viết `bank-hub-types.ts` bằng zod (parse response; field lạ bị bỏ qua, field thiếu → `BankHubError`).
2. Viết `createBankHubClient({ baseUrl, clientId, clientSecret }, fetchImpl = fetch)`; token cache `{ token, expiresAt }` với biên an toàn 60 s; helper `request()` gắn Bearer, xử lý 401 (xoá cache, thử lại 1 lần), 429 (ném `BankHubError` kèm `retryAfter`).
3. Test đơn vị với fetch giả (vitest): token được tái sử dụng, 401 → đúng 1 lần gọi `/v1/token` mới, 429 không retry, không log secret.
4. Thêm schema 3 bảng/cột; chạy `pnpm db:generate`; đọc SQL sinh ra — đảm bảo `ALTER TABLE invoice ADD` cho 3 cột (D1/SQLite: cột unique nullable thêm bằng `CREATE UNIQUE INDEX`, không phải constraint inline).
5. Backup D1 local trước khi chạy migration local (quy tắc repo); test migration theo mẫu `*-migration.test.ts` hiện có (vd `student-email-unique-migration.test.ts`): DB có invoice cũ → sau migration `paid_amount = 0`, `payment_code` NULL.
6. Wire `AppDeps.getBankHub` + memo trong `index.ts`; thêm 5 env vào `alchemy.run.ts` (4 bí mật theo pattern `Config.string().pipe(Config.withDefault(""))`, base URL `Config.string` có default) và type vào `packages/env/env.d.ts`; `getBankHub()` coi secret rỗng là thiếu.

## Todo

- [x] `bank-hub-types.ts` + `bank-hub-client.ts`
- [x] `bank-hub-client.test.ts` (token cache, 401 refresh, 429, redaction)
- [x] Schema `org_bank_link`, `payment_transaction`, cột mới của `invoice`
- [x] Migration `0033` + migration test (dữ liệu cũ giữ nguyên)
- [x] `AppDeps.getBankHub` + wiring `index.ts` + `alchemy.run.ts` (env.d.ts infer tự alchemy)

## Success Criteria

- `pnpm --filter server test -- bank-hub` xanh; migration test xanh.
- `pnpm check-types` xanh; `pnpm test:topology-drift` xanh (infra đổi env).
- Không có secret trong log khi chạy test (assert trên spy `console`).

## Risk Assessment

| Rủi ro | Giảm thiểu |
|---|---|
| `ttl` thực tế khác docs (ví dụ 60000) | Cache `min(ttl, 3600)` giây + refresh khi 401 |
| Migration unique trên cột nullable vỡ trên D1 | Dùng unique index; test migration với dữ liệu thật dạng snapshot |
| Isolate Workers không chia sẻ cache token | Chấp nhận — mỗi isolate tự xin token, số lần thấp |
| Secret `withDefault("")` mất masking `Config.redacted` | Chấp nhận — cùng pattern `RESEND_API_KEY` hiện có; giá trị chỉ ở Worker env, không log (assert trong test) |

## Security Considerations

- Secrets chỉ ở Worker env; không bao giờ trả về client, không vào snapshot.
- `raw` IPN chỉ lưu cho giao dịch **chưa khớp** (matched để rỗng) — có tên người chuyển (PII), phục vụ debug/đối soát; không có endpoint nào trả `raw`, không đưa vào snapshot. <!-- RT2 #B5 -->

## Next Steps

Phase 2 dùng `createCompany`/`createLinkToken`/`getBankAccount` + bảng `org_bank_link`.
