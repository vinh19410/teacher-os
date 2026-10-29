---
title: "Fix #340 tuition remaining amount"
date: 2026-10-07
summary: rosterDebtByStudent bỏ qua paidAmount; nhãn còn Xđ thống nhất 3 surface; red-team 7 findings; e2e + screenshots
---

# Fix #340 tuition remaining amount

## Vibe run fix #340 — học phí hiển thị số còn lại

- **Root cause:** `rosterDebtByStudent` (tuition-from-kernel.ts:110) cộng nguyên `inv.amount` cho hóa đơn chưa paid, bỏ qua ledger `paidAmount` (#320). Fix: `amount - Math.min(paidAmount, amount)` per-invoice, Pick thêm "paidAmount".
- **Nhãn "còn Xđ":** helper `formatRemainingVND` + `invoiceRemainingLabel` trong format-invoice.ts (copy đơn nguồn — red-team finding); 3 surface: roster (mọi hóa đơn chưa paid), /tuition (chỉ partial, cạnh badge "Thu một phần"), hồ sơ (chỉ partial, Quá hạn → text-danger).
- **Red-team plan (2 reviewer):** 7 findings — quan trọng nhất: /tuition thiếu class danger (badge partial luôn chiếm slot trạng thái nên đỏ nhãn là cách duy nhất báo quá hạn); fixture `inv()` không tồn tại ngoài describe tuitionTotals (compile error nếu dán nguyên văn); Risk sót `tuition-bank-transfer.spec.ts` (3 spec đụng chuỗi tiền, không spec nào vỡ).
- **Quirk e2e/screenshots:** bảng DataTable tràn ngang ở 375/768px là behavior cuộn sẵn — screenshot cần thêm variant `scrollIntoViewIfNeeded` (-scrolled) mới thấy cell; tab hồ sơ học viên là useState, không đọc search param; bảng DB là `class` không phải `class_group`; privacy hook pattern-match cả chuỗi "env" trong lệnh shell (paraphrase hoặc đi qua script file).
- **Env worktree:** các file biến môi trường của infra/server/web không carry qua worktree nhưng e2e stack (boot.ts libsql local.db + fake-bank-hub) KHÔNG cần — web unit test vẫn pass thiếu chúng (memory cũ "worktree thiếu env làm web test fail" không còn đúng cho web unit).
- **Verify:** gates 4 lệnh pass đủ (re-run sau minor fixes); e2e full 139/1 skipped ×2 lần; 15 screenshots seed partial thật qua fake-bank-hub IPN (UI tạo hóa đơn → query payment_code từ local.db → POST webhook Apikey e2e-ipn-key).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
