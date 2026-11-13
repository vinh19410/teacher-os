# UC-07 — Thử chấm lại AI (tiêu Credit lượt r(n))

- **a. Mô tả**: với draft `manual_pending` do AI timeout/fail (đã hoàn 100% Credit), vai được phép publish chạy thêm một lượt chấm mới — mỗi lượt một bộ reserve/settle/release riêng trong sổ cái.
- **b. Actor chính**: Teacher/Owner/Admin/Class teacher (`canPublishGrade`); TA bị chặn 403 (apps/server/src/routes/grading.ts:1237-1243; packages/auth/src/role.ts:117-135).
- **c. Tiền điều kiện**: draft `manual_pending` với `errorCode ∈ {AI_GRADING_TIMEOUT, AI_GRADING_FAILED}` (`isAiGradingRetryableError` — packages/api/src/contracts.ts:4216-4231).
- **d. Hậu điều kiện**: draft `ai_processing` với `retryCount + 1`; pipeline sẽ reserve bộ khóa `ai_grading:<attemptId>:r(n):*`; held cũ còn treo (nếu crash trước đó) đã được giải tỏa trước.
- **e. Luồng chính**: kiểm vai → load draft → kiểm trạng thái/mã lỗi → `releaseUnsettledOccasions` dọn lượt cũ → CAS `manual_pending → ai_processing` (retryCount+1) → thắng thì `scheduleAiGrading` (apps/server/src/routes/grading.ts:1235-1339).
- **f. Nhánh thay thế/lỗi**:
  - A1 vai không đủ (TA) → 403 `AI_RETRY_FORBIDDEN` (R1 apps/server/src/routes/grading.test.ts:2463-2473).
  - A2 đang `ai_processing` hoặc mã không retryable → 409 (:1264-1277; R1 :2474-2506).
  - A3 CAS thua (song song/sweep) → 409 E-011, không reserve (:1310-1316; R1 :2540-2563).
  - A4 draft bị sweep TIMEOUT trước khi kịp reserve → vẫn 200 (không 500 `InsufficientCreditsError`) nhờ dọn per-occasion (R1 :2564-2587).
  - A5 n ≥ 1 dùng bộ khóa riêng; gọi lại cùng n idempotent (apps/server/src/lib/credits/wallet.test.ts:309-350).
- **g. Ràng buộc chất lượng**: "dọn trước, reserve sau"; không parse chuỗi khóa (dùng `retryCount` của draft — apps/server/src/lib/ai-grading/release-stale.ts:33-36).
- **h. Truy vết**: FR-08, FR-19, FR-20; BR-08, BR-09; Error 403/409 E-011/409 DRAFT_NOT_RETRYABLE; Flow F11; Test: apps/server/src/routes/grading.test.ts:2463-2587; apps/server/src/lib/credits/wallet.test.ts:300-361.
