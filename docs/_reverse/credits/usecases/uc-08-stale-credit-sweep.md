# UC-08 — Giải tỏa Credit kẹt tự động (sweep)

- **a. Mô tả**: không có cron/Queue; mọi request chạm ví/job/hàng chờ là cơ hội dọn rác: hoàn Credit giữ bởi job import treo >150s, giải tỏa held của draft chấm AI treo >60s, hoàn lượt Chấm nhanh chưa revert.
- **b. Actor chính**: Hệ thống (`actor_user_id` = người tạo job cho import, "system" cho grading).
- **c. Tiền điều kiện**: có request đi qua một trong các điểm gọi: POST /exam-imports, GET /exam-imports/:id, retry, GET /credits/wallet, GET /api/grading, GET /api/grading/:attemptId (apps/server/src/lib/exam-import/release-stale.ts:27-28; apps/server/src/lib/ai-grading/release-stale.ts:38-39).
- **d. Hậu điều kiện**: held không kẹt vĩnh viễn; job stale → `failed_refunded(timeout)` hoặc `completed` (nếu đã settle); draft stale giữ nguyên trạng thái nghiệp vụ (điểm AI vẫn dùng được) nhưng held được trả.
- **e. Luồng chính**: xem Flow F6 (import) và F10 (grading).
  - Import: chọn batch 20 job `processing` quá hạn; có log settle → completed; else release + mark failed_refunded (apps/server/src/lib/exam-import/release-stale.ts:30-74).
  - Grading: nhóm 1 CAS trước ví; nhóm 2 đối chiếu số dòng reserved > settled+released; nhóm 3 revert quick (apps/server/src/lib/ai-grading/release-stale.ts:41-173).
- **f. Nhánh thay thế/lỗi**:
  - A1 release trượt (luồng khác đã nhả) → bỏ qua, giữ kết quả luồng đó (apps/server/src/lib/exam-import/release-stale.ts:65-69).
  - A2 thua CAS nhóm 1 → bỏ qua (runner sống sẽ tự settle) (:63-77).
  - A3 nhiều request sweep song song → idempotency key chặn hoàn 2 lần (R1 apps/server/src/routes/exam-imports.test.ts:640-692).
  - A4 job của org khác không bị đụng (org-scoped, R1 apps/server/src/lib/exam-import/release-stale.test.ts:85-105).
- **g. Ràng buộc chất lượng**: batch 20/bảo vệ độ trễ; ngưỡng 60s phải lớn hơn ngân sách pipeline; per-occasion không parse chuỗi khóa.
- **h. Truy vết**: FR-02, FR-18, FR-19; BR-08, BR-11; Flow F6, F10; Test: apps/server/src/lib/exam-import/release-stale.test.ts:68-105; apps/server/src/lib/ai-grading/run-grading.test.ts:856-905.
