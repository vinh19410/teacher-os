# UC-01 — Xem số dư ví Credit của tổ chức

- **a. Mô tả**: thành viên org mở số dư ví; hệ thống dọn rác Credit kẹt (nếu có), tạo lười ví 30 Credit dùng thử và trả ba con số balance/held/available.
- **b. Actor chính**: mọi thành viên org (teacher/owner/admin lớp/ta — không gate vai) ✅ apps/server/src/routes/credits.ts:14-15. Actor phụ: Hệ thống (sweep).
- **c. Tiền điều kiện**: đã đăng nhập phiên kernel (`kernelCtx` tồn tại) — apps/server/src/routes/credits.ts:24-25.
- **d. Hậu điều kiện**: ví org tồn tại (được tạo nếu thiếu, balance=30); job/draft treo quá hạn đã được giải tỏa; response trả 3 số nguyên ≥ 0.
- **e. Luồng chính**:
  1. GET `/api/credits/wallet`.
  2. Chưa có phiên → 401 `{"error":"unauthorized"}` (apps/server/src/routes/credits.ts:25).
  3. Chạy `releaseStaleImports` rồi `releaseStaleGradings` của org (:31-32).
  4. `ensureWallet` tạo lười ví 30 Credit (:33; apps/server/src/lib/credits/wallet.ts:88-93).
  5. `readWallet` và trả `{balance, held, available = balance − held}` qua `creditWalletSchema` (:34-44).
- **f. Nhánh thay thế/lỗi**:
  - A1: org chưa có ví → bước 4 tạo mới (R1: apps/server/src/routes/exam-imports.test.ts:445-457).
  - A2: job treo >150s → hoàn Credit + mark `failed_refunded(timeout)` (apps/server/src/lib/exam-import/release-stale.ts:58-73; R1: apps/server/src/routes/exam-imports.test.ts:640-692).
  - A3: draft chấm AI treo >60s → CAS `manual_pending` + release/revert (apps/server/src/lib/ai-grading/release-stale.ts:47-172).
  - A4 🟡: dữ liệu ví vi phạm bất biến (held > balance) → Zod parse fail → 500 (OQ-9).
- **g. Ràng buộc chất lượng**: sweep giới hạn 20 bản ghi/lần để bảo vệ độ trễ (apps/server/src/lib/exam-import/release-stale.ts:14-15); mọi truy vấn org-scoped.
- **h. Truy vết**: FR-01, FR-02, FR-03; BR-01, BR-02, BR-03; Error 401; Flow F1; Test: apps/server/src/routes/exam-imports.test.ts:445-457, 640-692; e2e apps/e2e/specs/ai-exam-import-ac-001.spec.ts:26-31; UI apps/web/src/lib/repos/exam-imports.ts:221-231.
