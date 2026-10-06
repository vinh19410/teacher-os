---
title: "Tích hợp SePay Bank Hub: giáo viên liên kết ngân hàng, học phí thu qua VietQR tự gạch nợ"
description: "Giáo viên liên kết tài khoản ngân hàng qua SePay Bank Hub Hosted Link; mỗi phiếu học phí sinh mã QR VietQR có mã thanh toán riêng, IPN của Bank Hub tự cộng dồn và gạch nợ."
status: completed
priority: P1
effort: 6d
issue: 320
branch: feat/sepay-bank-hub-tuition-qr
tags: [feature, backend, frontend, database, api, payments, sepay]
blockedBy: [261005-1523-remove-settings-route]
blocks: []
created: 2026-10-05
---

> **✅ Đã unblock (2026-10-05):** #321/#324 gỡ `/settings` đã merge vào `develop`; UI liên kết ngân hàng triển khai ở **trang riêng `/payments`** (sidebar "Nhận học phí"), kèm rebase trên `develop` (#319, #324, #325 — migration của plan renumber 0033→0034). Nút "Sao chép tin nhắc nợ" tạm bỏ vì API workspace-settings đã gỡ kèm #324 — follow-up nếu template quay lại.

---

## Overview

Giáo viên (một org) liên kết tài khoản ngân hàng của mình qua **SePay Bank Hub
Hosted Link** (iframe trong modal). <!-- Updated: settings route removed 2026-10-05 — trang Cài đặt (/settings) đã bị gỡ theo issue #321; UI liên kết ngân hàng đặt ở trang riêng, đề xuất `/payments` (đối chiếu `/tuition` đang tồn tại: gắn panel vào `/tuition` hoặc khác biệt hoá rõ route mới, quyết định cuối khi review plan này). --> Mỗi phiếu học phí (`invoice`)
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
| 1 | Giáo viên liên kết / huỷ liên kết / khôi phục tài khoản ngân hàng qua Hosted Link, trạng thái hiển thị ở trang riêng `/payments` (đề xuất — `/settings` đã gỡ, xem ghi chú ở Overview) | P1 |
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

- [ ] Sandbox: giáo viên liên kết tài khoản mẫu MBBank → trang ngân hàng hiện "Đã liên kết • MBBank •••6789".
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

4 lens: Security Adversary / Failure Mode Analyst / Assumption Destroyer / Scope & Complexity Critic (kèm Fact Checker, Flow Tracer, Scope Auditor, Contract Verifier). 18 finding sau dedup — 18 accept, 0 reject. Fact-check 25 claims: 22 verified, 2 failed (đã xử lý), 1 unverified. Chi tiết đầy đủ trong PR #320 (bảng 18 finding + dispositions). Điểm chính: `Config.redacted` → `withDefault("")` (đỡ crash dev), bỏ phantom API list-company, predicate `bank_account_xid` trong webhook, `past_bank_account_xids` cho đối soát mọi TK, `no_code`/`foreign_code` + che DTO, const `BANK_HUB_LINK_ORIGINS` một nguồn sự thật, bỏ đổi default `tplDebt` (scope creep), PublicPayView bỏ `note`, parse-lỏng IPN, poll cap 15 phút.

#### Whole-Plan Consistency Sweep (Session 2)

- Đã quét lại thuật ngữ cũ trên mọi file sau khi áp 18 finding — không còn mâu thuẫn (chi tiết sweep trong PR).
- Cập nhật 2026-10-06 sau merge #324: mọi tham chiếu "Cài đặt → tab Nhận học phí" chuyển sang trang riêng `/payments`; nút copy `tplDebt` bỏ khỏi phase 5 (API settings đã gỡ).

### Whole-Plan Consistency Sweep

- Đã quét lại các thuật ngữ cũ (`5 binding env`, `INSERT…SELECT`, `student.ts:52`, `ui test`, allowlist phía web) trên tất cả file — đã sửa, không còn mâu thuẫn.
- Env thống nhất 6 biến (4 bí mật + `SEPAY_BANKHUB_BASE_URL`, `SEPAY_BANKHUB_LINK_ORIGINS`) ở phase 1, 2, 6.
- Thứ tự kiểm tra trong `ingestTransaction` (mã trước, org sau) khớp giữa Architecture và test matrix phase 4.
- Không còn mâu thuẫn chưa giải quyết.
