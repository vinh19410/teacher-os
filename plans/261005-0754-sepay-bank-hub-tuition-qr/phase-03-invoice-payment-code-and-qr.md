---
phase: 3
title: "Phase 3: Mã thanh toán, pay token và QR"
status: completed
priority: P1
effort: "1d"
dependencies: [1, 2]
---

# Phase 3: Mã thanh toán, pay token và QR

## Overview

Mỗi phiếu học phí có `payment_code` (`TOS` + 8 ký tự Crockford base32, ví dụ
`TOS7K2M9QXA`) dùng làm nội dung chuyển khoản, và `pay_token` (128-bit
base64url) cho link công khai. Server tính `PaymentInstructions` (số còn nợ,
STK, ngân hàng, nội dung, URL ảnh VietQR) và phục vụ qua 3 cửa: giáo viên,
học viên (portal), công khai (`/public/pay/:token`).

## Context Links

- `apps/server/src/routes/kernel.ts:1467` (`POST /invoices`), `:1526` (`mark-paid`)
- `apps/server/src/app.ts:66-95` — `bootstrapMiddleware` trả 403 cho role `student` trên `/api/*` ⇒ route công khai **phải nằm ngoài `/api/*`**
- `apps/server/src/routes/student.ts:596` (mẫu `router.use(path, requireStudent)`)
- `apps/web/src/routes-matcher.ts:27` (`VALID_DYNAMIC_PREFIXES` — path lạ trả 404)
- `apps/web/src/lib/format-invoice.ts` (`invoiceCode` = `INV-` + 8 ký tự cuối id — chỉ để hiển thị, KHÁC `payment_code`)
- Skill `ak-payment-integration/references/sepay/qr-codes.md`

## Key Insights

- Mã chỉ gồm `[0-9A-Z]` (bỏ `I L O U`), không dấu gạch: ngân hàng có thể bỏ `-` và đổi hoa/thường. 32^8 ≈ 1,1·10^12 tổ hợp → va chạm gần như không xảy ra, vẫn có unique index + thử lại tối đa 3 lần.
- Prefix `TOS` trùng với whitelist keyword của merchant (phase 6) ⇒ chỉ giao dịch học phí mới tới IPN.
- VietinBank (`bank_bin` 970415): nội dung **phải** bắt đầu bằng `SEVQR ` ⇒ `memo = "SEVQR TOS…"`.
- Phiếu cũ không có mã → gán lười khi lần đầu cần QR (`UPDATE … WHERE payment_code IS NULL`), không cần data migration.
- QR luôn dựng theo TK **hiện tại** của org và **số còn nợ hiện tại** — không lưu ảnh. Ảnh đã chụp màn hình trước khi đổi TK sẽ sai: chấp nhận, ghi chú cho giáo viên ở UI huỷ liên kết.

## Requirements

- Tạo phiếu mới (`POST /invoices`) sinh luôn `payment_code` + `pay_token`.
- `PaymentInstructions` (contracts):
  `{ invoiceCode, amount, paidAmount, amountDue, status, due, note, payable: boolean, reason?: "NO_BANK_LINK"|"PAID", bank?: { brandName, accountNumber, holderName }, memo?, qrUrl? }`
  — `payable=false` khi org chưa có TK `linked` hoặc phiếu đã đủ tiền.
- Endpoints:
  - Giáo viên: `GET /api/invoices/:id/payment` → `PaymentInstructions & { payToken }` (org-scoped).
  - Học viên: `GET /api/student/invoices` (danh sách phiếu của chính học viên trong org đang chọn) và `GET /api/student/invoices/:id/payment`.
  - Công khai: `GET /public/pay/:token` → `PublicPayView = Omit<PaymentInstructions, "note" | "due"> & { orgName, studentName }` — **DTO riêng, không trả `note`** (ghi chú phiếu là free-text của giáo viên, link `/pay/<token>` lan truyền ngoài tầm kiểm soát); `Cache-Control: no-store`; token sai → 404 chung. <!-- RT2 #S4 -->
- Web: route công khai `/pay/$token` (ngoài `_auth`) + thêm `"/pay/"` vào `VALID_DYNAMIC_PREFIXES`.
- Helper `fillMessageTemplate(tpl, vars)` cho `{{student_name}}`, `{{amount}}`, `{{qr_link}}` (dùng ở phase 5 "Sao chép tin nhắc nợ"). **Không đổi** default `tplDebt`: claim "chỉ ảnh hưởng org mới" là sai (org chưa từng lưu settings đọc zod default tại thời điểm request — `kernel.ts:342`) và đổi chữ nhắc nợ không nằm trong phạm vi issue. <!-- RT2 #A5/#B7 -->

## Architecture

```
packages/api/src/lib/payment-code.ts   generatePaymentCode(), PAYMENT_CODE_RE = /TOS[0-9A-HJKMNP-TV-Z]{8}/i, extractPaymentCode(text)
packages/api/src/lib/vietqr.ts         buildTransferMemo({code, bankBin}), buildVietQrUrl({bin, accountNumber, amount, memo})
packages/api/src/lib/message-template.ts fillMessageTemplate()
apps/server/src/lib/payment-instructions.ts  ensurePaymentRefs(db, invoiceId, orgId), loadPaymentInstructions(db, {invoice, orgId})
apps/server/src/routes/public-pay.ts         publicPayRoutes(deps) — mount app.route("/public/pay", …) cạnh /readyz
```

`buildVietQrUrl` → `https://vietqr.app/img?acc=…&bank=<bin>&amount=<int>&des=<memo>&template=compact`
(dùng `URLSearchParams`, `amount = Math.floor`). Thiếu `bank_bin` (Bank Hub trả
null) → dùng `bank_code`; thiếu cả hai → `payable=false`.

## Related Code Files

- Create: `packages/api/src/lib/payment-code.ts`, `vietqr.ts`, `message-template.ts` (+ `*.test.ts`)
- Create: `apps/server/src/lib/payment-instructions.ts`, `apps/server/src/routes/public-pay.ts`, `apps/server/src/public-pay.test.ts`, `apps/server/src/invoice-payment.test.ts`
- Modify: `apps/server/src/routes/kernel.ts` (`POST /invoices` sinh mã; `GET /invoices/:id/payment`)
- Modify: `apps/server/src/routes/student.ts` (`/invoices`, `/invoices/:id/payment` + `requireStudent`)
- Modify: `apps/server/src/app.ts` (mount `/public/pay`)
- Modify: `packages/api/src/contracts.ts` (`PaymentInstructions`, `PublicPayView`, `StudentInvoiceItem`, `KernelInvoiceRow.paidAmount`)
- Modify: `apps/server/src/routes/snapshot.ts` (`loadInvoices` thêm `paidAmount`)
- Modify: `apps/web/src/routes-matcher.ts` (+ test), create `apps/web/src/routes/pay.$token.tsx` (UI hoàn thiện ở phase 5)

## Implementation Steps

1. TDD `payment-code.ts`: sinh đúng alphabet/độ dài; `extractPaymentCode("SEVQR tos7k2m9qxa hoc phi")` → `TOS7K2M9QXA`; không bắt `TOSHIBA123`. Lưu ý: regex có ranh giới (`\b` hoặc lookaround) để không ăn ký tự thứ 9.
2. TDD `vietqr.ts`: memo VietinBank có `SEVQR `; URL encode đúng; `amount` nguyên.
3. `POST /invoices`: sinh `payment_code`, `pay_token`; xung đột unique → sinh lại (≤ 3), quá 3 → 500 có log.
4. `ensurePaymentRefs` cho phiếu cũ (UPDATE có điều kiện `IS NULL`, rồi SELECT lại — an toàn khi 2 request song song).
5. `loadPaymentInstructions`: join `org_bank_link` (status `linked`), tính `amountDue = max(amount - paid_amount, 0)`.
6. Route giáo viên / học viên / công khai. Học viên: đăng ký **cả** `router.use("/invoices", requireStudent)` **và** `router.use("/invoices/*", requireStudent)` — Hono `use(path)` chỉ khớp đúng path, không phủ `/invoices/:id/payment` (xem cách `student.ts:596-599` liệt kê từng path); có test gọi `/invoices/:id/payment` không session → 401. <!-- Red Team #3 --> Học viên chỉ thấy phiếu có `invoice.student_id = ctx.student.id AND org_id = ctx.orgId`. Công khai tra theo `pay_token` (so sánh bằng truy vấn index; token là secret 128-bit).
7. Snapshot + `KernelInvoiceRow.paidAmount`; cập nhật adapter web (`apps/web/src/lib/repos/kernel.ts`) và các contract/fixture test của snapshot: `apps/web/src/lib/kernel-runtime.contract.test.ts`, `apps/web/test/fixtures/mock-data.ts`, `apps/web/src/lib/repos/invoices.test.ts`. <!-- Red Team #5 -->
8. `routes-matcher` thêm `/pay/` + test; tạo route `pay.$token.tsx` khung (fetch `/public/pay/:token`).

## Todo

- [x] `payment-code.ts` + test
- [x] `vietqr.ts` + test
- [x] `message-template.ts` + test (giữ default `tplDebt` hiện có)
- [x] `POST /invoices` sinh mã + token
- [x] `payment-instructions.ts` + `ensurePaymentRefs`
- [x] `GET /api/invoices/:id/payment`
- [x] `GET /api/student/invoices`, `/invoices/:id/payment`
- [x] `GET /public/pay/:token` mount ngoài `/api/*`
- [x] Snapshot `paidAmount`
- [x] Web `routes-matcher` + route `/pay/$token`

## Success Criteria

- `pnpm --filter @teacher-os/api test` (hoặc filter tương ứng) xanh cho 3 lib mới.
- Server tests: học viên A không xem được phiếu học viên B (404); org B không xem phiếu org A; token sai → 404; học viên đăng nhập mở `/public/pay/:token` → 200 (không bị gate role); phiếu đã thu → `payable=false, reason=PAID`; org chưa liên kết → `reason=NO_BANK_LINK`.
- Phiếu cũ không mã → gọi `/payment` lần đầu được gán mã, lần hai giữ nguyên mã.

## Risk Assessment

| Rủi ro | Giảm thiểu |
|---|---|
| Ngân hàng cắt nội dung dài | Memo chỉ là mã (≤ 17 ký tự kể cả `SEVQR `) |
| Học viên xoá/sửa nội dung khi chuyển (mất mã) | IPN real-time **không** tới (whitelist keyword phía SePay) và server không lưu; giáo viên đối chiếu sao kê tay. Giao dịch **có** mã nhưng mã sai → "chưa khớp" (phase 4) để gán | <!-- RT2 #F2 -->
| Lộ link công khai | Chỉ lộ số tiền/nội dung chuyển khoản/tên học viên (DTO public đã bỏ `note`/`due`); không có thao tác ghi; giáo viên có thể "Tạo link mới" (xoay `pay_token`) ở phase 5 | <!-- RT2 #S4 -->

## Security Considerations

- `/public/pay/:token` không đọc session, không ghi DB (ngoài `ensurePaymentRefs` không chạy ở route công khai — phiếu có token thì đã có mã).
- Không trả `student_id`, `org_id`, email, SĐT học viên ra route công khai.
- Không log `pay_token` (thêm vào log redaction giống `redactResetToken` trong `apps/server/src/log-redaction.ts`).

## Next Steps

Phase 4 dùng `extractPaymentCode` + `payment_code` để khớp IPN.
