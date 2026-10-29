---
phase: 3
title: "E2E AC-001"
status: completed
priority: P1
effort: "2h"
dependencies: ["phase-02"]
---

# Phase 3: E2E AC-001, đo hiệu năng ≤ 2 giây và chụp Screenshot 3 Viewport

## Goal
Chứng minh end-to-end AC-001 của US-003 trên trình duyệt thật: hiển thị 3 thẻ KPI, lọc chip trạng thái đồng bộ URL trong ≤ 2000ms, reload giữ trạng thái lọc, tìm kiếm không dấu debounce 300ms, kiểm tra trên cả desktop (`1440×900`), tablet (`768×1024`) và mobile (`375×812`), đồng thời xuất bộ ảnh screenshot phục vụ PR.

## Files to Create / Modify
- Create:
  - `apps/e2e/specs/debt-ledger-filters.spec.ts`
  - `plans/261026-2038-tos-15-debt-ledger-kpi-filters/screenshots/tos15-debt-ledger-1440.png`
  - `plans/261026-2038-tos-15-debt-ledger-kpi-filters/screenshots/tos15-debt-ledger-768.png`
  - `plans/261026-2038-tos-15-debt-ledger-kpi-filters/screenshots/tos15-debt-ledger-375.png`

## Tasks & Steps (Handover Contract `--advice`)

### Task 3.1 — Viết và chạy E2E spec `debt-ledger-filters.spec.ts`
- **Goal:** Kiểm chứng toàn bộ hành vi AC-001 của Sổ công nợ học viên trên stack E2E thật (port 8100/8101/8103/8104) và lưu screenshot 3 viewport.
- **Target files and symbols:**
  - `apps/e2e/specs/debt-ledger-filters.spec.ts`
- **Steps:**
  1. Tạo org mới qua `signUpViaUi(page)`, seed lớp học + 3 học viên với enrollment `active`:
     - Học viên A (`"Nguyễn Minh Anh"`): hóa đơn `4.500.000đ` quá hạn (`due = isoInDaysFromTodayVN(-1)`), chưa thu.
     - Học viên B (`"Trần Hoàng Nam"`): hóa đơn `3.800.000đ` sắp đến hạn (`due = isoInDaysFromTodayVN(3)`), chưa thu.
     - Học viên C (`"Lê Thu Hà"`): hóa đơn `4.500.000đ` đã thu đủ (`status = "paid"`, tạo qua nút `"+ Tạo khoản thu"` trên `/debts` hoặc đánh dấu `"Đã nhận"` để kiểm chứng luôn tích hợp modal).
  2. Điều hướng qua sidebar `"Công nợ"` tới `/debts`:
     - Kiểm tra bảng hiển thị đủ 3 dòng học viên với đúng Phải đóng / Đã thu / Còn nợ / Badge trạng thái (`"Quá hạn"`, `"Sắp đến hạn"`, `"Đã thu đủ"`).
     - Kiểm tra 3 thẻ KPI đầu trang (`data-testid="debt-kpis"`): `"Tổng phải thu kỳ này"` = `12.800.000đ` (`3 học viên`), `"Tổng đã thu"` = `4.500.000đ` (`1 học viên`), `"Tổng còn nợ quá hạn"` = `4.500.000đ` (`1 học viên`).
  3. Bấm chip `"Quá hạn"` và đo `performance.now()` quanh `Promise.all([expect(page).toHaveURL(/status=overdue/), expect(rows).toHaveCount(1), expect(rowA).toBeVisible()])` → khẳng định thời gian lọc ≤ `2000ms`, bảng chỉ còn Nguyễn Minh Anh, và 3 thẻ KPI vẫn giữ nguyên tổng (D5).
  4. Bấm chip `"Đã thu đủ"` → URL có `status=clear`, bảng chỉ còn Lê Thu Hà; `await page.reload()` → sau reload vẫn chỉ còn Lê Thu Hà và chip `"Đã thu đủ"` vẫn `aria-pressed="true"`.
  5. Bấm chip `"Tất cả"` rồi gõ `"tran hoang nam"` (không dấu) vào ô tìm kiếm → sau debounce (~300ms) URL có `q=tran+hoang+nam` (hoặc `q=tran%20hoang%20nam`), bảng chỉ còn Trần Hoàng Nam, KPI cập nhật theo kết quả tìm kiếm (`3.800.000đ`, `1 học viên`).
  6. Xóa bộ lọc về trạng thái đầy đủ, chụp screenshot 3 viewport (`1440×900`, `768×1024`, `375×812`) vào `plans/261026-2038-tos-15-debt-ledger-kpi-filters/screenshots/`, và tại viewport `375×812` lặp lại bước bấm chip `"Quá hạn"` kiểm tra không tràn ngang (`scrollWidth <= clientWidth`) và lọc ≤ `2000ms`.
- **Success criteria:** E2E spec `debt-ledger-filters.spec.ts` pass 100%, 3 file ảnh screenshot được tạo ra.
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e debt-ledger-filters` exits 0 và `pnpm design:compare -- --screens t-tuition` exits 0.

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
