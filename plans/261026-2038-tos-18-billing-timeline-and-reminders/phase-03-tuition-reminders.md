---
phase: 3
title: "Chọn học viên đang nợ và Gửi nhắc học phí qua hàng đợi thông báo"
status: pending
priority: P1
effort: "4h"
dependencies: ["phase-02", "TOS-21 #454"]
---

# Phase 3: Nhắc học phí

> Chỉ bắt đầu khi TOS-21 (US-004 · AC-001) đã merge: cần hàm enqueue thông báo Email + In-app có `idempotency_key` và màn Nhật ký thông báo `[5]`. Trước khi code, đọc contract thật của TOS-21 và cập nhật tên hàm/route bên dưới cho khớp.

## Files

- Modify: `packages/api/src/contracts.ts` — `debtReminderCreateSchema` (`studentIds: string[]` 1..100, unique).
- Create: route `POST /api/debt-reminders` (dưới guard tài chính).
- Modify: `apps/web/src/routes/_auth/debts/index.tsx` — cột checkbox (chỉ dòng còn nợ), "chọn tất cả đang hiển thị", nút "Gửi nhắc học phí (N)" ở PageHead, hộp thoại xác nhận "Gửi nhắc học phí cho N học viên (M hóa đơn còn nợ)?".
- Test server + component tương ứng.

## Luồng server

1. Validate; lọc `studentIds` thuộc org (id lạ → bỏ qua, đếm vào `skipped`).
2. Với mỗi hóa đơn còn nợ của các học viên đó: enqueue sự kiện `tuition_reminder` (người nhận = học viên, tham chiếu = invoiceId, kênh Email + In-app, Reply-To theo org) với `idempotency_key = tuition_reminder:<invoiceId>:<YYYY-MM-DD VN>`.
3. Trả `{ queued, skipped }`. Học viên không có email → In-app vẫn tạo, Email được hạ tầng TOS-21 đánh dấu theo luật của nó.

## Tasks & Steps

1. Test đỏ: 2 học viên đang nợ (3 hóa đơn còn nợ) → `queued = 3`; gọi lại cùng ngày → `queued = 0, skipped = 3`; học viên đã thu đủ → không enqueue; org khác → bị bỏ qua; UI: checkbox disabled ở dòng `clear`, nút đếm đúng, toast có link `[5]`.
2. Viết code cho xanh.

## Verification

- `pnpm --filter server test -- debt-reminders`
- `pnpm --filter web test -- debts`
- `pnpm check`, `pnpm check-types`
