---
title: "Plan tích hợp SePay Bank Hub thu học phí qua VietQR (#320)"
date: 2026-10-05
summary: "Lập plan 6 phase: giáo viên liên kết ngân hàng qua Bank Hub Hosted Link, phiếu học phí sinh mã TOS + VietQR, IPN tự gạch nợ qua sổ cái"
---

# Plan tích hợp SePay Bank Hub thu học phí qua VietQR (#320)

## What happened

- Lập plan hard mode `plans/261005-0754-sepay-bank-hub-tuition-qr/` (6 phase, ~6d), issue vinh19410/teacher-os#320.
- Skill `ak-payment-integration` chỉ nhắc Bank Hub một dòng → đọc trực tiếp docs developer.sepay.vn/vi/bankhub (16 trang), tóm tắt ở `research/bank-hub-research.md`.
- Phát hiện khi scout: CSP web không có `frame-src` (iframe SePay bị chặn); `bootstrapMiddleware` trả 403 cho role student trên `/api/*` → link công khai phải mount `/public/pay/:token`; repo chưa có hàm điền template `{{qr_link}}`.

## Decision

- Người dùng chốt: QR ở portal + link công khai; cộng dồn thanh toán một phần; giao dịch không khớp hiện cho giáo viên gán/bỏ qua; Hosted Link qua iframe modal.
- Mỗi org ↔ một Company Bank Hub; mã thanh toán `TOS` + 8 ký tự Crockford base32; whitelist merchant `TOS` để giao dịch cá nhân không tới server.
- Sổ cái `payment_transaction` là nguồn sự thật: `paid_amount` tính lại bằng SUM trong một D1 batch (idempotent với IPN trùng/đối soát).
- Red-team inline: 5 finding được áp dụng (fallback IPN TK cũ qua company_xid, tránh `INSERT…SELECT…ON CONFLICT`, `requireStudent` cho `/invoices/*`, bỏ `completion_redirect_uri` vì `frame-ancestors 'none'`, cập nhật contract test snapshot).

## Next steps

- Xin credential sandbox Bank Hub; chốt 4 điểm chưa kiểm chứng ở phase 6 (host hosted link sandbox, `transaction_amount` mặc định, event khôi phục, `payment_code` trong IPN).
- Thực thi: `/ak:cook plans/261005-0754-sepay-bank-hub-tuition-qr/plan.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
