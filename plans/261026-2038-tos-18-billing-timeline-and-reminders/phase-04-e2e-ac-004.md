---
phase: 4
title: "E2E AC-004"
status: completed
priority: P1
effort: "2h"
dependencies: ["phase-03"]
---

# Phase 4: E2E AC-004

<!-- Updated: Validation & Red-Team Session 1 — dùng webhook /webhooks/sepay/bankhub/ipn + seed org_bank_link thay vì bank-hub-mock -->

## Goal

Kiểm chứng end-to-end (Playwright) toàn bộ AC-004 trên trình duyệt thật ở cả desktop (1440×900) và mobile (375×812), đồng thời chụp ảnh màn hình ở 3 viewport (1440×900, 768×1024, 375×812) theo quy ước UI của repo.

## Files to Create or Modify

- Create: `apps/e2e/specs/debt-timeline-and-reminders.spec.ts`

## Tasks & Steps

### Task 4.1 — Viết và chạy E2E spec `apps/e2e/specs/debt-timeline-and-reminders.spec.ts`
- **Goal:** Phủ đầy đủ kịch bản Timeline (hóa đơn + QR Bank-Hub IPN + phiếu thu Tiền mặt) và Gửi nhắc học phí (Email + In-app + chống trùng trong ngày + kiểm tra màn `/notifications`).
- **Target files and symbols:** `apps/e2e/specs/debt-timeline-and-reminders.spec.ts`.
- **Steps:**
  1. Tạo `apps/e2e/specs/debt-timeline-and-reminders.spec.ts`:
     - Đăng ký giáo viên mới qua UI, tạo lớp + 2 học viên đang nợ (`"Nguyễn Minh Anh"`, `"Trần Hoàng Nam"`) và 1 học viên đã thu đủ (`"Lê Thu Hà"`).
     - Tạo hóa đơn `4.500.000đ` cho `"Nguyễn Minh Anh"`, đọc `payment_code` từ bảng `invoice` trong `local.db`, chèn 1 dòng `org_bank_link` (`status = 'linked'`) cho org, rồi bắn `POST ${API_ORIGIN}/webhooks/sepay/bankhub/ipn` (`Authorization: "Apikey e2e-ipn-key"`, `amount: 1_000_000`, `content` chứa `payment_code`) để tạo giao dịch QR Bank-Hub `1.000.000đ`.
     - Trên `/debts`, bấm nút `"Thu"` của `"Nguyễn Minh Anh"` để ghi nhận phiếu thu `"Tiền mặt"` `1.000.000đ` kèm ghi chú `"Đóng tiền mặt đợt 2"`.
     - **Kịch bản 1 (Timeline):** Bấm nút `(eye)` của `"Nguyễn Minh Anh"` → drawer mở ra, hiển thị 3 chỉ số (`4.500.000đ`, `2.000.000đ`, `2.500.000đ`) và 3 mục sự kiện đúng thứ tự mới nhất trước: `"Thu thủ công · Tiền mặt"`, `"QR Bank-Hub"`, và `"Phát hành hóa đơn"`. Nhấn `Escape` đóng drawer, kiểm tra focus quay về đúng nút `(eye)`.
     - **Kịch bản 2 (Nhắc phí):** Kiểm tra dòng `"Lê Thu Hà"` (đã thu đủ) có checkbox bị disabled; tích chọn `"Nguyễn Minh Anh"` và `"Trần Hoàng Nam"` → nút `"Gửi nhắc học phí (2)"` bật → bấm và xác nhận → toast thông báo đã đưa vào hàng đợi → chuyển sang `/notifications` (`[5]`) kiểm tra có 2 bản ghi `"Nhắc học phí"` cho 2 học viên (kèm kiểm tra mail log có thư nhắc học phí với số tiền còn nợ `2.500.000đ` cho Minh Anh). Quay lại `/debts`, tích chọn lại 2 học viên và bấm gửi lần 2 trong cùng ngày → toast báo đã nhắc hôm nay (`skipped`), `/notifications` vẫn giữ nguyên số dòng (không nhân đôi).
     - **Kịch bản 3 (Responsive 375×812 & 3-viewport screenshots):** Kiểm tra drawer timeline và bảng `/debts` ở 375×812, 768×1024, 1440×900 và lưu ảnh chụp màn hình vào `plans/261026-2038-tos-18-billing-timeline-and-reminders/screenshots/`.
- **Success criteria:** Spec `debt-timeline-and-reminders.spec.ts` chạy pass 100% ở lần chạy thật.
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e debt-timeline-and-reminders` exits 0.

## Verification

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e debt-timeline-and-reminders`
- `pnpm check`, `pnpm check-types`

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
