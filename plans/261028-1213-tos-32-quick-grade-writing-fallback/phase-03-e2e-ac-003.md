---
phase: 3
title: "E2E AC-003"
status: completed
effort: 0.5d
---

# Phase 3 — E2E AC-003

## Files to Create or Modify

- Tạo `apps/e2e/specs/ai-grading-ac-003.spec.ts` — E2E kiểm chứng AC-003 (US-006) trên stack thật (API + Web + Student portal).

## Tasks & Steps

### Task 3.1 — Viết và chạy E2E `ai-grading-ac-003.spec.ts`
- **Goal:** Chứng minh end-to-end 2 kịch bản của AC-003: (1) lượt thứ 30 trong tháng được chấm nháp chế độ `"Chấm nhanh"` 0 Credit, màn [7] hiện nhãn `"Bản nháp chấm nhanh"`, số dư ví vẫn 0; (2) lượt thứ 31 chuyển `manual_pending`, không có điểm AI, màn [7] hiện thông điệp `E-selfomy-alignment-002` + nút `"Nạp thêm Credit"`.
- **Target files and symbols:**
  - `apps/e2e/specs/ai-grading-ac-003.spec.ts`.
- **Steps:**
  1. Trong `test.beforeAll`: đăng ký giáo viên qua UI (`signUpViaUi`), lấy `orgId`, gọi `seedQuizFixture` tạo 2 bài tập Writing (`writingTitle1`, `writingTitle2`) cho học viên, và đăng ký + xác thực email học viên qua `verifyStudentEmailFromMailLog`.
  2. Seed trực tiếp vào `local.db` (qua `@libsql/client`):
     - Upsert dòng `credit_wallet` của `orgId` với `balance = 0, held = 0, plan_kind = 'monthly', plan_status = 'active'`.
     - Dùng `monthWindowVietnamMs(new Date())` từ `@teacher-os/api/vietnam-date` lấy `startMs` của tháng hiện tại và chèn 29 dòng `credit_usage_log` (`action_type = 'quick_grade_writing'`, `credit_delta = 0`, `tx_status = 'settled'`, `idempotency_key = 'quick_grade_writing:seed-N:claim'`, `created_at = startMs + (N + 1) * 1000`) để luôn nằm gọn trong đầu tháng hiện tại theo giờ VN.
  3. **Scenario 1 (lượt 30/30 — Chấm nhanh thành công):**
     - Học viên đăng nhập portal và nộp bài Writing 1 → thấy `"Đã nộp — Đang chờ giáo viên chấm"`.
     - Giáo viên mở `/grading/${attemptId1}` → `ai-draft-panel` hiển thị badge `"AI đã chấm nháp"`, badge `"Bản nháp chấm nhanh"`, và 4 điểm tiêu chí gợi ý từ AI (`6.5`, `7.0`, `6.0`, `6.5`).
     - Kiểm tra `GET /api/credits/wallet` trả `balance: 0`.
  4. **Scenario 2 (lượt 31/30 — chạm trần E-002):**
     - Học viên nộp bài Writing 2.
     - Giáo viên mở `/grading/${attemptId2}` → `ai-draft-panel` hiển thị badge `"Chờ chấm tay"`, thông điệp nguyên văn `E-selfomy-alignment-002` (`"Bạn đã sử dụng hết hạn mức Credit AI và 30 lượt chấm nhanh Writing hỗ trợ thêm trong tháng này. Vui lòng nạp thêm Credit để tiếp tục chấm tự động."`), nút `"Nạp thêm Credit"`, và `"AI chưa có điểm gợi ý cho bài này."`.
- **Success criteria:** Cả 2 scenario trong `ai-grading-ac-003.spec.ts` đều pass.
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e exec playwright test specs/ai-grading-ac-003.spec.ts` exits 0.

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
