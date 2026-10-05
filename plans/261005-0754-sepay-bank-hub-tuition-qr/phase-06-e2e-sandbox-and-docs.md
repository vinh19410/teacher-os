---
phase: 6
title: "Phase 6: E2E, sandbox và tài liệu"
status: todo
priority: P1
effort: "1d"
dependencies: [1, 2, 3, 4, 5]
---

# Phase 6: E2E, sandbox và tài liệu

## Overview

Khoá toàn luồng bằng Playwright E2E với **fake Bank Hub** inject qua
`AppDeps.getBankHub` (giống `fs-media-store`), viết script thiết lập một lần
cho merchant (webhook URL + whitelist `TOS`), kiểm thử thủ công trên **sandbox
SePay** để chốt 4 điểm chưa kiểm chứng, rồi cập nhật tài liệu kiến trúc và
runbook.

## Context Links

- `apps/e2e/src/boot.ts:100` (`buildApp({... getMediaStore })` — chỗ inject fake)
- `apps/e2e/src/fs-media-store.ts` (mẫu fake dependency)
- `apps/e2e/playwright.config.ts`, `AGENTS.md` (port override `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103`)
- `docs/system-architecture.md` (boundary map + architectural rules), `docs/production-release-runbook.md`
- [research/bank-hub-research.md](./research/bank-hub-research.md) — "Điểm chưa kiểm chứng"

## Requirements

- Fake Bank Hub (in-memory): company/link-token/bank-account/transactions; `hosted_link_url` trỏ tới trang giả do boot E2E phục vụ (vd `http://localhost:8100/__fake-bankhub/link/:token`) — trang này có nút "Hoàn tất" gọi `window.parent.postMessage({event:"FINISHED_BANK_ACCOUNT_LINK",…}, "*")` và đánh dấu TK linked trong fake. `SEPAY_BANKHUB_LINK_ORIGINS` của E2E = origin đó.
- Helper test `simulateIpn({ bankAccountXid, amount, content })` POST thẳng `/webhooks/sepay/bankhub/ipn` với `Apikey` E2E.
- Script ops `apps/server/scripts/bankhub-setup.ts` (chạy tay, đọc env): `POST /v1/webhook` (URL `https://api.<domain>/webhooks/sepay/bankhub/events`, `SECRET_KEY`, `allow_events: ["*"]`) và `POST /v1/merchant-config { transaction_whitelist_remark_keywords: ["TOS"] }`; in kết quả **không** in secret. Chạy với production chỉ khi người vận hành xác nhận.

## Implementation Steps

1. `apps/e2e/src/fake-bank-hub.ts` + route trang giả + wire trong `boot.ts`.
2. Spec `apps/e2e/specs/tuition-bank-transfer.spec.ts`:
   1. Giáo viên mở trang ngân hàng (đề xuất `/payments` — "Cài đặt" đã gỡ theo issue #321) → Nhận học phí → Liên kết → iframe giả → Hoàn tất → panel "Đã liên kết". <!-- Updated: settings route removed 2026-10-05 -->
   2. Tạo phiếu 500.000đ → mở "Thu học phí" → thấy QR (`img[src*="vietqr.app"]` có `amount=500000`, `des=TOS…`) → copy link.
   3. Học viên (portal) thấy phiếu trong "Học phí" → mở chi tiết thấy cùng mã.
   4. `simulateIpn` 200.000đ → trong ≤ 10 s portal hiện "Đã nhận 200.000đ / 500.000đ"; giáo viên thấy "Thu một phần".
   5. `simulateIpn` 300.000đ (mã chữ thường) → "Đã thanh toán đủ" ở trang `/pay/<token>` (ngữ cảnh không đăng nhập).
   6. Gửi lại IPN bước 4 (cùng `transaction_id`) → tổng không đổi.
   7. `simulateIpn` mã lạ → xuất hiện ở "Giao dịch chưa khớp" → gán vào phiếu thứ hai → phiếu đó cập nhật.
3. Sandbox thủ công (ghi kết quả vào `reports/sandbox-verification.md` của plan):
   - Host thật của `hosted_link_url` sandbox → cập nhật `frame-src` + default `SEPAY_BANKHUB_LINK_ORIGINS` nếu khác.
   - `transaction_amount` mặc định của company mới; nếu 0 thì xác nhận `company/edit` → `Unlimited` hoạt động.
   - Tên event của luồng khôi phục (`REACTIVATE`).
   - IPN thật từ `POST /v1/transaction/create` (qua tunnel `cloudflared` tới server dev): `payment_code` có được điền với mã `TOS…` không; định dạng `transaction_date` và tham số `start_transaction_date` cho đối soát.
4. Docs:
   - `docs/system-architecture.md`: thêm vào boundary map (Bank Hub client + `getBankHub`; webhooks `/webhooks/sepay/bankhub/*` và `/public/pay/:token` mount ngoài `/api/*`); thêm architectural rules: "sổ cái `payment_transaction` là nguồn sự thật của `paid_amount`, không cộng dồn trực tiếp", "chỉ khớp phiếu trong org sở hữu tài khoản nhận tiền", "IPN không retry khi 5xx — giữ handler tối giản và có đối soát".
   - `docs/production-release-runbook.md`: 6 biến env (tên, không giá trị), quy trình xin credential SePay, gửi URL IPN `https://api.<domain>/webhooks/sepay/bankhub/ipn` cho SePay, chạy `bankhub-setup.ts`, checklist go-live.
   - `docs/codebase-summary.md` nếu liệt kê module server.

## Todo

- [ ] Fake Bank Hub + trang hosted link giả + wiring E2E
- [ ] Spec `tuition-bank-transfer.spec.ts` (7 bước)
- [ ] Script `bankhub-setup.ts`
- [ ] Sandbox verification + report; cập nhật allowlist/CSP nếu cần
- [ ] Docs: system-architecture, production-release-runbook, codebase-summary

## Success Criteria

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e` xanh (cả spec mới và cũ).
- Gate đầy đủ: `pnpm check`, `pnpm check-types`, `pnpm test`, build.
- `reports/sandbox-verification.md` trả lời đủ 4 điểm trong mục "Điểm chưa kiểm chứng" của `research/bank-hub-research.md` (cập nhật mục đó thành fact đã xác nhận).

## Risk Assessment

| Rủi ro | Giảm thiểu |
|---|---|
| Chưa có credential sandbox riêng khi tới phase 6 | E2E với fake vẫn chạy; sandbox verification là gate trước khi bật production, không chặn merge vào `develop` |
| IPN URL cần SePay cấu hình thủ công | Ghi vào runbook; xác nhận bằng `POST /v1/transaction/create` trên sandbox |

## Security Considerations

- Route trang giả và fake chỉ tồn tại trong `apps/e2e` — không bundle vào Worker production.
- Script ops không in secret; không commit file env.

## Next Steps

Mở PR vào `develop` (gate local theo `AGENTS.md`), kèm screenshot 3 viewport; bật production sau khi sandbox verification đạt.
