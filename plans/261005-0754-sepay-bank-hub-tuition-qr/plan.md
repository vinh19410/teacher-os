---
title: "Tích hợp SePay Bank Hub: giáo viên liên kết ngân hàng, học phí thu qua VietQR tự gạch nợ"
description: "Giáo viên liên kết tài khoản ngân hàng qua SePay Bank Hub Hosted Link; mỗi phiếu học phí sinh mã QR VietQR có mã thanh toán riêng, IPN của Bank Hub tự cộng dồn và gạch nợ."
status: pending
priority: P1
effort: 6d
issue: 320
branch: feat/sepay-bank-hub-tuition-qr
tags: [feature, backend, frontend, database, api, payments, sepay]
blockedBy: []
blocks: []
created: 2026-10-05
---

# Tích hợp SePay Bank Hub — học phí qua VietQR

## Overview

Giáo viên (một org) liên kết tài khoản ngân hàng của mình qua **SePay Bank Hub
Hosted Link** (iframe trong modal ở Cài đặt). Mỗi phiếu học phí (`invoice`)
nhận một **mã thanh toán** duy nhất (`TOS` + 8 ký tự) và một **pay token** công
khai. Học viên xem QR trong portal; phụ huynh mở link công khai `/pay/<token>`.
QR là VietQR tĩnh (`vietqr.app/img`) trỏ về tài khoản đã liên kết, số tiền là
phần còn nợ, nội dung là mã thanh toán. Khi tiền về, Bank Hub gọi **IPN** →
server xác thực `Apikey`, chống trùng theo `transaction_id`, khớp mã → cộng dồn
`paid_amount`, đủ thì `status = paid`. Giao dịch có mã nhưng không khớp được
lưu vào danh sách "chưa khớp" để giáo viên tự gán. Nút "Đối soát" kéo
`GET /v1/transaction` để bù IPN bị lỡ.

Nguồn: skill `ak-payment-integration` (`references/sepay/*`) + docs chính thức
Bank Hub (developer.sepay.vn/vi/bankhub, đọc 2026-10-05) — tóm tắt tại
[research/bank-hub-research.md](./research/bank-hub-research.md).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Giáo viên liên kết / huỷ liên kết / khôi phục tài khoản ngân hàng qua Hosted Link, trạng thái hiển thị ở Cài đặt | P1 |
| 2 | Mỗi phiếu học phí có mã thanh toán + QR VietQR (số tiền còn nợ) — trong portal học viên và link công khai | P1 |
| 3 | IPN tự cộng dồn thanh toán, đủ tiền thì "Đã thu"; chống trùng, không cross-tenant | P1 |
| 4 | Giao dịch có mã nhưng không khớp → danh sách "chưa khớp", giáo viên gán hoặc bỏ qua | P2 |
| 5 | Đối soát thủ công kéo giao dịch từ Bank Hub, idempotent với IPN | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Nền tảng Bank Hub: client, secrets, schema](./phase-01-bank-hub-foundation.md) | Pending |
| 2 | [Giáo viên liên kết ngân hàng](./phase-02-teacher-bank-linking.md) | Pending |
| 3 | [Mã thanh toán, pay token và QR](./phase-03-invoice-payment-code-and-qr.md) | Pending |
| 4 | [IPN, khớp giao dịch và đối soát](./phase-04-ipn-matching-and-reconciliation.md) | Pending |
| 5 | [UI học phí giáo viên và portal học viên](./phase-05-tuition-and-portal-ui.md) | Pending |
| 6 | [E2E, sandbox và tài liệu](./phase-06-e2e-sandbox-and-docs.md) | Pending |

Thứ tự phụ thuộc: 1 → 2 → 3 → 4 → 5 → 6 (tuần tự; 2 và 3 chạm chung
`kernel.ts`/`contracts.ts` nên không chạy song song).

## Dependencies

- Tài khoản đối tác SePay Bank Hub: `client_id`/`client_secret` sandbox + production (liên hệ SePay), API key IPN do SePay cấp, URL IPN do SePay cấu hình phía họ.
- Không phụ thuộc plan khác. Không đụng nút "Quản lý thanh toán" (issue #138 — billing SaaS, khác phạm vi).

## Non-goals

- Billing/subscription SaaS của TeacherOS; cổng thanh toán thẻ; hoàn tiền.
- Order VA (Bank Hub ghi "sắp ra mắt" cho quản lý VA) — dùng mã trong nội dung chuyển khoản.
- Nhiều tài khoản nhận tiền cùng lúc cho một org (một tài khoản active / org).
- Gửi Zalo/email tự động; template `{{qr_link}}` chỉ được điền khi giáo viên copy.

## Success Criteria

- [ ] Sandbox: giáo viên liên kết tài khoản mẫu MBBank → Cài đặt hiện "Đã liên kết • MBBank •••6789".
- [ ] Tạo phiếu 500.000đ → portal và `/pay/<token>` hiện QR với `amount=500000`, `des=TOS…`.
- [ ] `POST /v1/transaction/create` (sandbox) 200.000đ rồi 300.000đ cùng mã → phiếu "Thu một phần 200.000/500.000" rồi "Đã thu".
- [ ] Gửi lại cùng `transaction_id` không cộng tiền lần hai; IPN sai `Apikey` → 401.
- [ ] Giao dịch mã lạ hiện ở "Giao dịch chưa khớp"; gán vào phiếu → cộng dồn đúng.
- [ ] `pnpm check`, `pnpm check-types`, `pnpm --filter server test`, `pnpm --filter web test`, `pnpm --filter student test`, `pnpm --filter e2e e2e` xanh.

## Validation Log

### Session 1 — 2026-10-05 (trước khi viết phase)

| Câu hỏi | Quyết định |
|---|---|
| Học viên/phụ huynh xem QR ở đâu? | Portal học viên **và** link công khai `/pay/<token>` để giáo viên gửi Zalo |
| Chuyển thiếu / nhiều lần? | Cộng dồn; đủ (≥ số tiền) thì "Đã thu"; thiếu hiện "Thu một phần x/y" |
| Giao dịch có mã nhưng không khớp? | Lưu + hiện cho giáo viên ở trang Học phí để gán hoặc bỏ qua |
| Cách mở Hosted Link? | Iframe trong modal + lắng nghe `postMessage`; thêm `frame-src` vào CSP web |

### Verification Results

- Claims checked: 36 (đường dẫn file, symbol, script test, mẫu code)
- Verified: 34 | Failed: 2 (đã sửa) | Unverified: 4 (hành vi API SePay — chốt ở phase 6)
- Tier: Full (6 phase)
- Failures đã sửa: `packages/ui` không có script `test` (test chuyển sang `apps/web`); mẫu `db.batch` trích sai file (đổi sang `enrollment-activation.ts:188-206`).

## Red Team Review

Tự rà inline theo 4 lens (Security, Assumption, Failure mode, Scope) — không spawn subagent. 5 finding có bằng chứng, người dùng chấp nhận cả 5 (2026-10-05).

| # | Sev | Finding | Disposition | Phase |
|---|---|---|---|---|
| 1 | High | IPN của TK cũ sau khi đổi TK bị "skipped" → mất ghi nhận tiền | Accept — fallback `getBankAccount` → `company_xid` → org | 4 |
| 2 | High | `INSERT … SELECT … ON CONFLICT` mơ hồ cú pháp trong SQLite | Accept — `INSERT … VALUES` + scalar subquery | 4 |
| 3 | High | `router.use("/invoices")` không phủ `/invoices/:id/payment` | Accept — đăng ký thêm `/invoices/*` + test 401 | 3 |
| 4 | Medium | `completion_redirect_uri` trong iframe bị `frame-ancestors 'none'` chặn | Accept — không truyền; dựa vào postMessage + sync | 2 |
| 5 | Medium | `paidAmount` trong snapshot làm vỡ contract/fixture test web | Accept — cập nhật 3 file test | 3 |

Rejected (không có bằng chứng lỗi): >3 phase / >8 file — phạm vi do người dùng yêu cầu (HOLD SCOPE); IPN không có timestamp chống replay — đã có chống trùng `transaction_id`.

### Session 2 — 2026-10-05 (4 reviewer subagent song song, Full tier)

4 lens: Security Adversary / Failure Mode Analyst / Assumption Destroyer / Scope & Complexity Critic (kèm Fact Checker, Flow Tracer, Scope Auditor, Contract Verifier). 18 finding sau dedup — 18 accept, 0 reject. Fact-check 25 claims: 22 verified, 2 failed (đã xử lý ở #9/#2), 1 unverified (gộp #2).

| # | Sev | Finding | Disposition | Phase |
|---|---|---|---|---|
| 1 | Critical | `Config.redacted` là required lúc eval deploy — thiếu secret crash `alchemy dev/deploy`, phá "local/dev không vỡ" (`alchemy.run.ts:129-131`) | Accept — 4 secret theo pattern `withDefault("")` của `RESEND_API_KEY`; `getBankHub()` coi rỗng là thiếu | 1 |
| 2 | High | Fallback `ensureCompany` gọi `GET /v1/company` (list) — endpoint không tồn tại trong docs; client thiếu `editCompany` | Accept — re-SELECT `org_bank_link` sau 400 duplicate, xoá phantom API; thêm `editCompany` | 1, 2 |
| 3 | High | Webhook event của TK khác cùng company ghi đè `org_bank_link`; không chặn `link` khi đang `linked` ở server; "TK active mới nhất" không deterministic (API không có timestamp) | Accept — predicate `bank_account_xid` trong handler; 409 khi linked; pick `xid` lớn nhất | 2 |
| 4 | High | Đối soát chỉ quét TK hiện tại (7 ngày, ≤500 dòng) — tiền về TK cũ mất vĩnh viễn; fallback `getBankAccount` trong IPN hot path 500 khi Bank Hub 429 | Accept — cột `past_bank_account_xids`; reconcile quét mọi xid; fallback try/catch → ack + log | 1, 4 |
| 5 | High | Giao dịch không mã biến mất hoàn toàn — phase 3 hứa vào "chưa khớp", phase 4 luật "không lưu" | Accept — đối soát lưu `no_code`; IPN vẫn skip (whitelist đã lọc); sửa risk copy phase 3 | 3, 4 |
| 6 | High | Mã của org A vào TK org B hiện nguyên `content`/`payment_code` cho GV org B (leak chéo tenant qua unmatched list) | Accept — `foreign_code`, DTO che `content`/`paymentCode` | 4 |
| 7 | High | Whitelist keyword "TOS": hành vi case-sensitivity của SePay chưa kiểm chứng; E2E `simulateIpn` bypass SePay nên không phát hiện được | Accept — thêm điểm sandbox #5 kiểm qua đường thật | 6 |
| 8 | High | Allowlist hosted-link qua env runtime nhưng CSP `frame-src` là const — 2 nguồn sự thật; web worker không có binding env mới | Accept — const `BANK_HUB_LINK_ORIGINS` dùng chung server + web CSP, bỏ env (còn 5 biến env) | 1, 2 |
| 9 | Medium | Đổi default `tplDebt` là scope creep và claim "chỉ ảnh hưởng org mới" sai (org chưa lưu settings đọc default lúc request — `kernel.ts:342`) | Accept — bỏ thay đổi, giữ default "QR MoMo {{qr_link}}" | 3 |
| 10 | Medium | IPN zod fail → 400 = mất hàng loạt khi schema drift (SePay không retry 4xx/5xx) | Accept — parse lỏng (5 field bắt buộc), sandbox so schema thật | 4, 6 |
| 11 | Medium | Overpayment vô lối thoát: assign 409 vô điều kiện; `tuitionTotals` thiếu case `paidAmount ∈ (0, amount)` | Accept — IPN/gán vào phiếu `paid` còn thiếu ⇒ cộng dồn; totals: phiếu `paid` tính đủ `amount` | 4, 5 |
| 12 | Medium | `/public/pay/:token` trả `note` (free-text giáo viên) — mâu thuẫn claim data exposure | Accept — `PublicPayView` bỏ `note`/`due` | 3 |
| 13 | Medium | `/pay/$token` poll 5 s vô hạn không rate limit — chi phí D1 theo độ lan của link | Accept — cùng cap 15 phút + visibility gating + nút làm mới | 5 |
| 14 | Medium | `raw` write-only (PII lưu vô consumer); `invoice_missing` dead enum | Accept — `raw` chỉ lưu khi chưa khớp; bỏ `invoice_missing`, thêm `no_code`/`foreign_code` | 1, 4 |
| 15 | Medium | `createSandboxTransaction` (403 trên production) trong client production, không consumer | Accept — bỏ khỏi client, chuyển vào `bankhub-setup.ts` | 1, 6 |
| 16 | Medium | Mất webhook `INACTIVED` (bank chủ động) → `linked` stale; `FINISHED_*` postMessage có thể không phát khi không có `completion_redirect_uri` | Accept — `GET /api/bank-link?refresh=1`; poll `['bank-link']` 5 s khi modal mở; sandbox điểm #6 | 2, 6 |
| 17 | Medium | Invariant race/atomicity batch chỉ test trên libsql — D1 thật chưa từng chạy | Accept (documented risk) — batch D1 nguyên tử; batch lỗi ⇒ đối soát bù; thêm test pool-workers nếu sandbox bất thường | 4 |
| 18 | Medium | `syncFromBankHub` không advance `last_event_at` — event retry cũ có thể ghi đè trạng thái sync mới hơn | Accept — sync advance `last_event_at` + push xid cũ vào `past_bank_account_xids` | 2 |

Fact-check drift nhỏ không sửa (không đáng kể): `routes-matcher.ts:29` (plan ghi 27), `contracts.ts:1430-1435` (plan ghi 1434), `student.ts:604-609` (plan ghi 596).

#### Whole-Plan Consistency Sweep (Session 2)

- Env: 6 → **5 biến** (bỏ `SEPAY_BANKHUB_LINK_ORIGINS`, thay bằng const `BANK_HUB_LINK_ORIGINS`) — đã cập nhật phase 1, 2, 6; dòng "6 biến" của Session 1 là bản ghi lịch sử, bị supersede.
- `tplDebt`: mọi nhắc "đổi default" đã bỏ khỏi phase 3 (requirements, todo, contracts); `fillMessageTemplate` giữ nguyên, template cũ của org tiếp tục dùng `{{qr_link}}` với link mới.
- Enum `unmatched_reason`: `invoice_missing` bỏ; đồng bộ `no_code`/`foreign_code` giữa schema (phase 1) và luật khớp/test matrix (phase 4).
- Reconcile quét "xid hiện tại + `past_bank_account_xids`": khớp schema phase 1, bước 4 phase 4, UI phase 5.
- Luật phiếu `paid` còn thiếu: IPN ⇒ `matched` cộng dồn (CASE phase 4) ≡ bảng luật ≡ test matrix ≡ `assign` 409-chỉ-khi-đủ ≡ `tuitionTotals` phase 5.
- Public DTO: `PublicPayView` (phase 3) ≡ trang `/pay/$token` (phase 5) — panel nhận subset, không breaking.
- `createSandboxTransaction` đã ra khỏi client (phase 1) và nằm trong script ops (phase 6).
- Không còn mâu thuẫn chưa giải quyết.
