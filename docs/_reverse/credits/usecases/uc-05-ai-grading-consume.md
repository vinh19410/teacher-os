# UC-05 — Chấm nháp AI tự động tiêu Credit

- **a. Mô tả**: học viên nộp bài Writing/Speaking → pipeline nền giữ Credit (1 Writing / 2 Speaking), gọi AI, chốt trừ khi tạo được bản nháp; mọi thất bại thì hoàn.
- **b. Actor chính**: Học viên (kích hoạt gián tiếp); Org (chủ ví). Actor phụ: Grader AI; Hệ thống (`actor_user_id = "system"` — apps/server/src/lib/ai-grading/run-grading.ts:67).
- **c. Tiền điều kiện**: tính năng AI bật; bài thuộc kỹ năng Writing/Speaking; Speaking phải có transcript (không thì `NO_TRANSCRIPT`, không giữ Credit); bài gộp phải có phần Writing có nội dung.
- **d. Hậu điều kiện**:
  - Thành công: draft `ai_drafted`, ví −creditCost.
  - Thất bại: draft `manual_pending` kèm mã lỗi; ví nguyên (release) hoặc lượt quick đã revert.
- **e. Luồng chính**: nộp bài → `scheduleAiGrading` (waitUntil) → INSERT draft `ai_processing` (`creditCost`) → `ensureWallet` → reserve → grade (20s/lần, có tự thử lại) → CAS `ai_drafted` → settle; CAS thua → release (apps/server/src/routes/student.ts:1961; apps/server/src/lib/ai-grading/run-grading.ts:341-362, 400-440, 528-551).
- **f. Nhánh thay thế/lỗi**:
  - A1 thiếu Credit → UC-06 hoặc `manual_pending` E-001 (:405-440).
  - A2 AI lỗi/timeout → CAS `manual_pending` TIMEOUT/FAILED + release (:520-526, 242-255) hoặc revert quick (:256-274).
  - A3 Speaking không transcript → `manual_pending` NO_TRANSCRIPT, 0 Credit (:368-382).
  - A4 bài gộp Writing rỗng → `manual_pending`, 0 Credit, không gọi AI (:384-397).
  - A5 AI tắt → không tạo draft, không log (R1 apps/server/src/routes/student-quiz.test.ts:1443-1500).
  - A6 draft không reserve (test seed/NO_TRANSCRIPT) không có held — release mù bị tránh qua per-occasion (apps/server/src/lib/ai-grading/release-stale.ts:78-88).
- **g. Ràng buộc chất lượng**: "draft trước, ví sau"; idempotency 1 draft/attempt; pipeline chạy nền sau response.
- **h. Truy vết**: FR-04..FR-08, FR-15, FR-19; BR-04, BR-06, BR-08; Error E-001/E-002 (draft), AI_GRADING_*; Flow F7, F9; Test: apps/server/src/lib/ai-grading/run-grading.test.ts:218-247, 356-397, 464-489; e2e apps/e2e/specs/ai-grading-ac-001.spec.ts:184-208.
