---
phase: 2
title: "Phase 2: Giáo viên liên kết ngân hàng"
status: todo
priority: P1
effort: "1.5d"
dependencies: [1]
---

# Phase 2: Giáo viên liên kết ngân hàng

## Overview

Giáo viên vào **Cài đặt → tab "Nhận học phí"**, bấm "Liên kết tài khoản" →
server đảm bảo org có Company trong Bank Hub, tạo link token → web mở
`hosted_link_url` trong iframe modal. Trạng thái liên kết được cập nhật theo
**hai đường độc lập**: (a) client nhận `postMessage FINISHED_*` → gọi
`POST /api/bank-link/sync`; (b) webhook event `BANK_ACCOUNT_*` từ SePay. Cả hai
đều idempotent nên mất một đường vẫn đúng.

## Context Links

- [research/bank-hub-research.md](./research/bank-hub-research.md) — Hosted Link, webhook events
- `apps/server/src/app.ts:190-197` (thứ tự mount; `/readyz` mount ngoài `/api/*`)
- `apps/server/src/routes/kernel.ts` (CSRF Origin + JSON guard cho POST, `kernelCtx.orgId`)
- `apps/web/src/routes/_auth/settings.tsx:114` (danh sách tab), `:43` (validate `tab` search param)
- `apps/web/src/security-headers.ts:9` (CSP hiện không có `frame-src` ⇒ rơi về `default-src 'self'` ⇒ iframe SePay bị chặn)
- `apps/web/src/components/ui/modal.tsx`

## Key Insights

- Event `BANK_ACCOUNT_LINKED` **không có `company_xid`** → phải gọi `GET /v1/bank-account/{xid}` để lấy `company_xid` rồi tra `org_bank_link`. Tài khoản không thuộc company nào của mình ⇒ bỏ qua (ack).
- `postMessage` chỉ là tín hiệu UI, không phải bằng chứng: `sync` luôn đọc lại từ API Bank Hub theo `company_xid` của org.
- OCB/MSB/KienLongBank/TPBank huỷ liên kết = `inactive` → nút "Khôi phục" dùng `REACTIVATE_BANK_ACCOUNT`; các ngân hàng khác = `unlinked` → nút "Liên kết lại".
- Webhook retry chỉ khi lỗi mạng, timeout phản hồi 8 s — xử lý đồng bộ (vài lệnh D1 + 1 fetch) rồi trả `{"success": true}`.

## Requirements

Chức năng:
- Một tài khoản nhận tiền active / org. Đang `linked` thì chỉ hiện "Huỷ liên kết"; muốn đổi tài khoản phải huỷ trước.
- Hiển thị: tên ngân hàng, số TK che (`•••` + 4 số cuối), tên chủ TK, thời điểm liên kết.
- Bank Hub chưa cấu hình (503 `BANKHUB_DISABLED`) → tab hiện trạng thái "Chưa bật" thay vì lỗi.

Phi chức năng:
- Server chỉ trả `hosted_link_url` khi origin của nó thuộc allowlist env `SEPAY_BANKHUB_LINK_ORIGINS` (mặc định `https://bankhub.sepay.vn`; host sandbox xác nhận ở phase 6; E2E đặt origin trang giả cục bộ); URL khác → 502 có log.
- **Không** truyền `completion_redirect_uri` khi tạo link token cho iframe: redirect sẽ nạp app web bên trong iframe, nhưng CSP web có `frame-ancestors 'none'` (`apps/web/src/security-headers.ts:9`) ⇒ khung lỗi. Kết thúc luồng dựa hoàn toàn vào `postMessage` + `sync`. <!-- Red Team #4 -->
- Listener `message` chỉ chấp nhận `event.origin === new URL(hostedLinkUrl).origin` (URL đã được server kiểm) — web không giữ allowlist riêng.

## Architecture

```
Web (settings "Nhận học phí")                 Server (Hono, kernel tree)              SePay Bank Hub
 ── GET  /api/bank-link ───────────────────▶  đọc org_bank_link (DTO an toàn)
 ── POST /api/bank-link/link-token ────────▶  ensureCompany(org) ── create/get ─────▶ /v1/company/*
    {purpose: link|unlink|reactivate}          createLinkToken ───────────────────────▶ /v1/link-token/create
 ◀─ {hostedLinkUrl, expiresAt} ─────────────
 iframe(hostedLinkUrl) ── người dùng OTP ─────────────────────────────────────────────▶ ngân hàng
 ◀─ postMessage FINISHED_BANK_ACCOUNT_LINK
 ── POST /api/bank-link/sync ──────────────▶  listBankAccounts(company) + detail ───────▶ /v1/bank-account
                                               upsert org_bank_link
                                 POST /webhooks/sepay/bankhub/events  ◀──────────────── BANK_ACCOUNT_LINKED…
                                 (ngoài /api/*, X-Secret-Key)  → getBankAccount → upsert
```

**`ensureCompany(orgId)`**: nếu có `org_bank_link` thì dùng `company_xid`.
Không có → `createCompany({ full_name: "teacheros-" + orgId, status: "Active" })`
→ `getCompany` kiểm tra `transaction_amount` (0 ⇒ `company/edit` thành
`Unlimited`) → insert `org_bank_link` (`status: none`) với
`onConflictDoNothing`. Tạo trùng tên (2 tab bấm cùng lúc) → Bank Hub trả 400 →
tra lại bằng `GET /v1/company` lọc `full_name` rồi dùng xid đó.

**Webhook handler** (`apps/server/src/routes/bank-hub-webhooks.ts`, export
`bankHubWebhookRoutes(deps)`), mount trong `app.ts` **trước**
`app.use("/api/*", bootstrapMiddleware)` ở path `/webhooks/sepay/bankhub` —
cùng file sau này chứa IPN (phase 4):
1. `getBankHub()` undefined → 503.
2. `bodyLimit` 64 KB; so `X-Secret-Key` với `webhookSecret` bằng `timingSafeEqual` của `node:crypto` (Worker đã bật `nodejs_compat`; chạy y hệt trong test Node) — gói trong helper `safeEqual()` (độ dài khác → false, không ném).
3. zod-parse envelope; event không quan tâm → `{"success": true}`.
4. `BANK_ACCOUNT_LINKED|UNLINKED|INACTIVED` (+ event khôi phục) → `getBankAccount(metadata.bank_account_xid)` → tìm `org_bank_link` theo `company_xid` → bỏ qua nếu `event.timestamp < last_event_at` → cập nhật trạng thái + thông tin TK.

## Related Code Files

- Create: `apps/server/src/routes/bank-link.ts` (subrouter, mount `kernel.route("/bank-link", …)` để hưởng CSRF guard — giống assignments)
- Create: `apps/server/src/routes/bank-hub-webhooks.ts`, `apps/server/src/lib/bank-hub/bank-link-service.ts` (ensureCompany, syncFromBankHub, applyAccountEvent), `apps/server/src/lib/safe-equal.ts`
- Create tests: `apps/server/src/bank-link.test.ts`, `apps/server/src/bank-hub-webhooks.test.ts`
- Modify: `apps/server/src/app.ts` (mount webhooks), `apps/server/src/routes/kernel.ts` (mount subrouter)
- Modify: `packages/api/src/contracts.ts` (`BankLinkStatus` DTO, `bankLinkTokenRequestSchema`)
- Create: `apps/web/src/components/settings/bank-link-panel.tsx`, `apps/web/src/components/modals/bank-hub-link-modal.tsx`, `apps/web/src/lib/repos/bank-link.ts` (+ tests)
- Modify: `apps/web/src/routes/_auth/settings.tsx` (tab `payments` "Nhận học phí"), `apps/web/src/security-headers.ts` (+ test) thêm `frame-src`

## Implementation Steps

1. Contracts: `BankLinkStatus { enabled, status: "none"|"linked"|"inactive"|"unlinked", brandName, accountNumberMasked, holderName, linkedAt }`; `bankLinkTokenRequestSchema = z.object({ purpose: z.enum(["link","unlink","reactivate"]) }).strict()`.
2. `bank-link-service.ts`: `ensureCompany`, `syncFromBankHub(orgId)` (chọn TK `active` mới nhất; không có TK active ⇒ giữ `inactive/unlinked` theo dữ liệu), `applyAccountEvent(event)`; `maskAccount()` dùng chung.
3. Routes `bank-link.ts`: `GET /`, `POST /link-token` (unlink/reactivate yêu cầu `bank_account_xid` đang lưu; thiếu ⇒ 409), `POST /sync`. Kiểm tra origin của `hosted_link_url` theo `SEPAY_BANKHUB_LINK_ORIGINS`.
4. Webhook route + `safeEqual` + mount trong `app.ts` trước `bootstrapMiddleware`.
5. Test server (vitest, fake `BankHubClient` qua `AppDeps.getBankHub`): link-token tạo company đúng một lần; org B không đọc/sync được dữ liệu org A; webhook sai secret → 401; event cũ hơn `last_event_at` bị bỏ qua; event của company lạ → 200 không ghi gì; thiếu cấu hình → 503.
6. Web: repo `bank-link.ts` (TanStack Query key `['bank-link']`), panel + modal iframe (`allow="clipboard-write"`, `title` cho a11y, focus trap của `Modal`), xử lý `BANKHUB_TOKEN_EXPIRED/SESSION_EXPIRED` bằng nút "Thử lại" (tạo token mới), `BANKHUB_CLOSE_LINK` đóng modal.
7. CSP: thêm `frame-src https://bankhub.sepay.vn <sandbox-host>` — cập nhật `security-headers.test.ts`. (CSP bị bỏ cho HTML localhost theo quy tắc kiến trúc hiện có ⇒ E2E dùng trang giả cục bộ không vướng CSP.)
8. Verify UI 3 viewport (1440×900, 768×1024, 375×812) + keyboard focus theo `REVIEW.md`; token màu/chip theo `DESIGN.md`.

## Todo

- [ ] Contracts DTO + schema
- [ ] `bank-link-service.ts` (ensureCompany, sync, applyAccountEvent, mask)
- [ ] Routes `/api/bank-link/*` mount trong kernel tree
- [ ] Webhook `/webhooks/sepay/bankhub/events` + `safeEqual`
- [ ] Server tests (tenant isolation, secret, stale event, 503)
- [ ] Web tab "Nhận học phí" + modal iframe + repo + tests
- [ ] CSP `frame-src` + test
- [ ] Verify 3 viewport + keyboard

## Success Criteria

- `pnpm --filter server test -- bank-link bank-hub-webhooks` xanh; `pnpm --filter web test -- bank-link security-headers settings` xanh.
- Thủ công (sandbox, phase 6): liên kết MBBank mẫu → panel hiện "Đã liên kết • MBBank •••6789" mà không cần reload; huỷ liên kết → trạng thái cập nhật.

## Risk Assessment

| Rủi ro | Giảm thiểu |
|---|---|
| Host sandbox của hosted link khác `bankhub.sepay.vn` | Allowlist cấu hình theo env; xác nhận ở phase 6 trước khi merge |
| Webhook đến trước khi `org_bank_link` có `company_xid` (race lần đầu) | Insert `org_bank_link` trước khi tạo link token; `sync` từ client vẫn bù |
| Giáo viên liên kết 2 TK trong một phiên | `sync` chọn TK active mới nhất; panel nhắc huỷ TK thừa |

## Security Considerations

- Route giáo viên nằm trong kernel tree ⇒ Origin + JSON CSRF guard; mọi truy vấn có predicate `org_id`.
- Webhook ngoài `/api/*` ⇒ không chạy bootstrap/Better Auth; xác thực duy nhất bằng `X-Secret-Key` (so sánh thời gian hằng) — không tin `metadata`, luôn đọc lại từ API Bank Hub.
- Không trả `company_xid`/`bank_account_xid` ra client (không cần cho UI).
- Iframe: CSP `frame-src` chỉ mở đúng host SePay; listener kiểm tra `event.origin`.

## Next Steps

Phase 3 cần `org_bank_link` (`bank_bin`, `account_number`, `brand_name`) để dựng QR.
