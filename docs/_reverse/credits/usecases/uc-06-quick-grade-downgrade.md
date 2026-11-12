# UC-06 — Hạ cấp Chấm nhanh Writing khi hết Credit

- **a. Mô tả**: org gói tháng còn hiệu lực hết Credit chính → bài Writing được chấm "nhanh" 0 Credit, tối đa 30 lượt/tháng (tháng dương lịch VN).
- **b. Actor chính**: Hệ thống (pipeline). Actor thụ hưởng: Org (teacher thấy bản nháp AI vẫn sinh).
- **c. Tiền điều kiện**: reserve thua vì thiếu Credit; skill = Writing; `plan_kind = "monthly"` và `plan_status ∈ {active, grace_period}` (apps/server/src/lib/ai-grading/run-grading.ts:405-414). ⚠️ 🟡 GAP-1: không có writer `plan_kind` → nhánh hiện không tự kích hoạt trong runtime.
- **d. Hậu điều kiện**: draft `gradingMode = "quick"`, `creditCost = 0`; sổ cái có 1 dòng `quick_grade_writing` `settled` delta 0; AI vẫn được gọi.
- **e. Luồng chính**: claim slot (INSERT...SELECT count < 30 nguyên tử) → true → cập nhật draft quick → chạy AI 0 Credit (apps/server/src/lib/credits/wallet.ts:156-195; apps/server/src/lib/ai-grading/run-grading.ts:414-427).
- **f. Nhánh thay thế/lỗi**:
  - A1 claim thất bại (đủ 30) → `manual_pending` E-002 (:419-425; R1 apps/server/src/lib/ai-grading/run-grading.test.ts:559-587).
  - A2 AI lỗi trong quick mode → `failQuickDraft`: tuyệt đối không `releaseCredits`, hoàn lượt bằng `revertQuickGradeSlot` (:256-274; R1 :644-677).
  - A3 thua CAS `ai_drafted` → revert lượt quick (:543-548; R1 :678-705).
  - A4 crash treo → sweep nhóm 1/3 revert (apps/server/src/lib/ai-grading/release-stale.ts:89-96, 137-172; R1 :856-905).
  - A5 idempotent claim: gọi lặp cùng attemptId không đếm thêm (apps/server/src/lib/credits/wallet.test.ts:400-444).
- **g. Ràng buộc chất lượng**: 2 claim song song không vượt 30 (INSERT...SELECT nguyên tử — apps/server/src/lib/credits/wallet.test.ts:446-469); biên tháng theo UTC+7 (apps/server/src/lib/credits/wallet.test.ts:365-378, 471-497).
- **h. Truy vết**: FR-16, FR-17; BR-07; Error E-002; Flow F8; Test: apps/server/src/lib/ai-grading/run-grading.test.ts:492-558, 644-705, 856-905; apps/server/src/lib/credits/wallet.test.ts:364-553.
