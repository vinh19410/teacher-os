---
phase: 1
title: "Trạng thái gói tối thiểu và hạn mức Chấm nhanh"
status: completed
effort: 0.75d
---

# Phase 1 — Trạng thái gói tối thiểu và hạn mức Chấm nhanh

## Files to Create or Modify

- `packages/api/src/contracts.ts` — thêm `QUICK_GRADE_MONTHLY_LIMIT = 30`, mở rộng `AI_GRADING_ERROR_CODES` (`INSUFFICIENT_CREDITS: "E-selfomy-alignment-001"`, `QUOTA_EXHAUSTED: "E-selfomy-alignment-002"`), thêm `AI_GRADING_ERROR_MESSAGES` nguyên văn spec, thêm `AI_GRADING_MODES = ["standard", "quick"] as const`.
- `packages/api/src/vietnam-date.ts` (+ `vietnam-date.test.ts` nếu cần) — thêm hàm thuần `monthWindowVietnamMs(now?: Date): { startMs: number; endMs: number }` tính `[00:00:00.000 ngày 01, 00:00:00.000 ngày 01 tháng kế)` theo múi giờ `Asia/Ho_Chi_Minh` (+07:00).
- `packages/db/src/schema/credit-wallet.ts` + migration SQL kế tiếp (`0055_*.sql` + snapshot meta): thêm cột `plan_kind` (`text("plan_kind").notNull().default("none")`) và `plan_status` (`text("plan_status")`, nullable).
- `apps/server/src/lib/credits/wallet.ts`: thêm `OrgPlanKind`, `OrgPlanStatus`, `OrgPlanState`, `readOrgPlan(db, orgId)`, `claimQuickGradeSlot(db, { orgId, attemptId, actorUserId?, now? })`, `revertQuickGradeSlot(db, { orgId, attemptId, actorUserId?, now? })`.
- `apps/server/src/lib/ai-grading/grader.ts` + `apps/server/src/lib/ai-grading/workers-ai-grader.ts`: thêm `mode?: "standard" | "quick"` vào `AiGradingInput`; `gradingPrompt` trong `workers-ai-grader.ts` sinh nhánh prompt ngắn cho `mode === "quick"` (chỉ 4 điểm tiêu chí + 1–2 câu nhận xét tổng quan, không gợi ý sửa câu chi tiết).
- `apps/server/src/lib/ai-grading/run-grading.ts` + `apps/server/src/lib/ai-grading/release-stale.ts`: rẽ nhánh khi `InsufficientCreditsError` theo D3, UPDATE `grading_mode = "quick", credit_cost = 0`, tách fail-path/settle-path cho quick mode để không bao giờ gọi `releaseCredits`/`settleCredits`, và bổ sung revert quick slot trong `releaseStaleGradings`.
- `apps/server/src/lib/credits/wallet.test.ts`, `apps/server/src/lib/ai-grading/run-grading.test.ts`, `apps/server/src/lib/ai-grading/workers-ai-grader.test.ts`: unit/integration tests trên SQLite in-memory + migrations thật.

## Tasks & Steps

### Task 1.1 — Mở rộng contracts & helper biên tháng giờ Việt Nam
- **Goal:** Cung cấp hằng số hạn mức 30, mã lỗi E-001/E-002 kèm thông điệp nguyên văn spec trong `@teacher-os/api/contracts`, và hàm `monthWindowVietnamMs` trong `@teacher-os/api/vietnam-date`.
- **Target files and symbols:**
  - `packages/api/src/contracts.ts`: `QUICK_GRADE_MONTHLY_LIMIT`, `AI_GRADING_MODES`, `AiGradingMode`, `AI_GRADING_ERROR_CODES` (`INSUFFICIENT_CREDITS`, `QUOTA_EXHAUSTED`), `AI_GRADING_ERROR_MESSAGES`.
  - `packages/api/src/vietnam-date.ts`: `monthWindowVietnamMs(now?: Date): { startMs: number; endMs: number }`.
- **Steps:**
  1. Trong `packages/api/src/contracts.ts`, export `QUICK_GRADE_MONTHLY_LIMIT = 30`.
  2. Thêm `INSUFFICIENT_CREDITS: "E-selfomy-alignment-001"` và `QUOTA_EXHAUSTED: "E-selfomy-alignment-002"` vào `AI_GRADING_ERROR_CODES`.
  3. Export `AI_GRADING_ERROR_MESSAGES` chứa nguyên văn thông điệp E-001 (`"Tổ chức của bạn đã dùng hết Credit AI trong kỳ. Vui lòng mua thêm gói 100 Credit (149.000đ) hoặc nâng cấp gói tháng để tiếp tục sử dụng tính năng này."`) và E-002 (`"Bạn đã sử dụng hết hạn mức Credit AI và 30 lượt chấm nhanh Writing hỗ trợ thêm trong tháng này. Vui lòng nạp thêm Credit để tiếp tục chấm tự động."`).
  4. Trong `packages/api/src/vietnam-date.ts`, cài đặt `monthWindowVietnamMs(now = new Date())`: lấy `ym = vietnamDateKeyOf(now).slice(0, 7)` và `nextYm = addMonthsISO(ym, 1)`, trả `startMs = Date.parse(`${ym}-01T00:00:00+07:00`)` và `endMs = Date.parse(`${nextYm}-01T00:00:00+07:00`)`.
- **Success criteria:** `monthWindowVietnamMs` trả đúng biên tháng theo UTC+7 (ví dụ `2026-10-31T17:00:00.000Z` tức `2026-11-01 00:00:00+07:00` thuộc tháng 11/2026).
- **Verify:** `pnpm --filter @teacher-os/api check-types` exits 0.

### Task 1.2 — Migration `plan_kind`/`plan_status` trên `credit_wallet` và service `wallet.ts`
- **Goal:** Bảng `credit_wallet` có cột `plan_kind` và `plan_status`; `wallet.ts` cung cấp `readOrgPlan`, `claimQuickGradeSlot` nguyên tử chống race, và `revertQuickGradeSlot` idempotent.
- **Target files and symbols:**
  - `packages/db/src/schema/credit-wallet.ts`: `creditWallet.planKind`, `creditWallet.planStatus`.
  - `packages/db/src/migrations/0055_*.sql` + `packages/db/src/migrations/meta/_journal.json` + snapshot.
  - `apps/server/src/lib/credits/wallet.ts`: `readOrgPlan`, `claimQuickGradeSlot`, `revertQuickGradeSlot`.
  - `apps/server/src/lib/credits/wallet.test.ts`.
- **Steps:**
  1. Thêm `planKind: text("plan_kind").notNull().default("none")` và `planStatus: text("plan_status")` vào `creditWallet` trong `packages/db/src/schema/credit-wallet.ts`; tạo migration SQL `ALTER TABLE credit_wallet ADD COLUMN plan_kind text DEFAULT 'none' NOT NULL; ALTER TABLE credit_wallet ADD COLUMN plan_status text;` và cập nhật `_journal.json` + snapshot.
  2. Trong `wallet.ts`, cài đặt `readOrgPlan(db, orgId)` đọc `planKind`, `planStatus` từ `credit_wallet`; nếu chưa có row hoặc giá trị ngoài tập hợp lệ thì trả `{ planKind: "none", planStatus: null }`.
  3. Cài đặt `claimQuickGradeSlot(db, { orgId, attemptId, actorUserId = "system", now = new Date() }): Promise<boolean>`:
     - Key = `quick_grade_writing:${attemptId}:claim`.
     - Nếu dòng với key này đã tồn tại trong `credit_usage_log` → trả `true` (idempotent, không chèn lần 2).
     - Tính `{ startMs, endMs } = monthWindowVietnamMs(now)`.
     - Thực thi 1 câu `INSERT INTO credit_usage_log ... SELECT ... WHERE (SELECT COALESCE(SUM(CASE WHEN tx_status = 'settled' THEN 1 WHEN tx_status = 'reverted' THEN -1 ELSE 0 END), 0) FROM credit_usage_log WHERE org_id = ${orgId} AND action_type = 'quick_grade_writing' AND created_at >= ${startMs} AND created_at < ${endMs}) < ${QUICK_GRADE_MONTHLY_LIMIT}`.
     - Bắt lỗi UNIQUE (nếu 2 lời gọi cùng `attemptId` đua nhau) → kiểm lại bằng `findLogByKey(db, key)`. Trả `true` nếu dòng claim tồn tại sau câu lệnh, ngược lại `false`.
  4. Cài đặt `revertQuickGradeSlot(db, { orgId, attemptId, actorUserId = "system", now = new Date() }): Promise<boolean>`:
     - Key revert = `quick_grade_writing:${attemptId}:revert`, key claim = `quick_grade_writing:${attemptId}:claim`.
     - Chèn dòng `action_type = "quick_grade_writing"`, `credit_delta = 0`, `tx_status = "reverted"`, `ref_id = attemptId`, `idempotency_key = keyRevert`, `created_at = now.getTime()` bằng `INSERT INTO credit_usage_log ... SELECT ... WHERE EXISTS (SELECT 1 FROM credit_usage_log WHERE idempotency_key = ${keyClaim}) AND NOT EXISTS (SELECT 1 FROM credit_usage_log WHERE idempotency_key = ${keyRevert})`.
     - Bắt lỗi UNIQUE nếu đua nhau → trả `true` nếu dòng revert tồn tại.
  5. Viết unit tests trong `wallet.test.ts`: `readOrgPlan` (chưa có ví → `none/null`, có ví `monthly/active`); `claimQuickGradeSlot` (29 lượt → lần 30 `true`, lần 31 `false`; gọi lặp cùng `attemptId` → `true` và không tăng count; 2 claim song song khi đã dùng 29 → đúng 1 `true` và 1 `false`; sang tháng mới theo giờ `Asia/Ho_Chi_Minh` → hạn mức về 30; `revertQuickGradeSlot` trả lại 1 lượt và gọi revert 2 lần chỉ hoàn đúng 1 lượt).
- **Success criteria:** Mọi test mới và cũ trong `wallet.test.ts` đều pass trên SQLite in-memory với migration thật.
- **Verify:** `pnpm --filter server test -- wallet` exits 0.

### Task 1.3 — Nhánh Chấm nhanh trong `grader.ts`, `workers-ai-grader.ts`, `run-grading.ts`, và `release-stale.ts`
- **Goal:** Khi thiếu Credit chính, bài Writing của org gói tháng `active`/`grace_period` hạ cấp mềm sang Chấm nhanh (`grading_mode = "quick"`, `credit_cost = 0`, prompt ngắn); hết 30 lượt → `manual_pending` + `E-selfomy-alignment-002`; ngoài gói tháng hoặc Speaking thiếu Credit → `manual_pending` + `E-selfomy-alignment-001`; lỗi AI hoặc stale crash khi quick → hoàn lượt qua `revertQuickGradeSlot`, không đụng `held` của ví.
- **Target files and symbols:**
  - `apps/server/src/lib/ai-grading/grader.ts`: `AiGradingInput.mode`.
  - `apps/server/src/lib/ai-grading/workers-ai-grader.ts`: `gradingPrompt(input)`.
  - `apps/server/src/lib/ai-grading/run-grading.ts`: `runAiGrading`, `failDraft`.
  - `apps/server/src/lib/ai-grading/release-stale.ts`: `releaseStaleGradings`.
  - `apps/server/src/lib/ai-grading/run-grading.test.ts`, `apps/server/src/lib/ai-grading/workers-ai-grader.test.ts`.
- **Steps:**
  1. Thêm `mode?: "standard" | "quick"` vào `AiGradingInput` (`grader.ts`). Trong `workers-ai-grader.ts`, nếu `input.mode === "quick"`, dùng dòng hướng dẫn nhận xét ngắn (`"Chế độ chấm nhanh: Nhận xét (tiếng Việt, 1–2 câu ngắn gọn) chỉ nêu đánh giá tổng quan, KHÔNG gợi ý sửa câu chi tiết."`). Thêm test trong `workers-ai-grader.test.ts` kiểm tra prompt quick khác prompt standard.
  2. Trong `run-grading.ts`, khi `reserveCredits` ném `InsufficientCreditsError`:
     - Nếu `attempt.skill === "writing"`, đọc `const plan = await readOrgPlan(db, attempt.orgId)`.
     - Nếu `plan.planKind === "monthly" && (plan.planStatus === "active" || plan.planStatus === "grace_period")`:
       - Gọi `const claimed = await claimQuickGradeSlot(db, { orgId: attempt.orgId, attemptId, actorUserId: AI_GRADING_ACTOR })`.
       - Nếu `!claimed`: CAS draft sang `manual_pending` với `errorCode: AI_GRADING_ERROR_CODES.QUOTA_EXHAUSTED` (`"E-selfomy-alignment-002"`) và `return`.
       - Nếu `claimed`: đặt cờ `quickMode = true`, UPDATE `ai_grading_draft` đặt `{ gradingMode: "quick", creditCost: 0 }` cho `attemptId`.
     - Ngược lại (Writing không ở gói tháng còn hiệu lực, hoặc Speaking thiếu Credit): CAS draft sang `manual_pending` với `errorCode: AI_GRADING_ERROR_CODES.INSUFFICIENT_CREDITS` (`"E-selfomy-alignment-001"`) và `return`.
  3. Trong `run-grading.ts`, ở các bước sau reserve:
     - Khi gọi `grader.grade(...)`, truyền `mode: quickMode ? "quick" : "standard"`.
     - Nếu thiếu `grader` (`!grader`): khi `quickMode` → CAS `manual_pending` (`DISABLED`) + `revertQuickGradeSlot`, KHÔNG gọi `releaseCredits`; khi standard → `failDraft` như cũ.
     - Khi thắng CAS `ai_drafted`: chỉ gọi `settleCredits` nếu `!quickMode`.
     - Khi thua CAS `ai_drafted` (teacher đã publish hoặc sweep đã chuyển trạng thái): nếu `quickMode` → gọi `revertQuickGradeSlot` chỉ khi draft KHÔNG ở trạng thái `published`/`ai_drafted`/`teacher_reviewing` (nếu teacher chấm tay publish trước khi AI xong thì AI chưa phục vụ được bài đó → hoàn lượt `revertQuickGradeSlot`); nếu `!quickMode` → `releaseCredits`.
     - Trong `catch` lỗi AI / timeout: nếu `quickMode` → CAS `manual_pending` (`code`) + `revertQuickGradeSlot` (tuyệt đối không gọi `releaseCredits`); nếu `!quickMode` → `failDraft`.
  4. Trong `release-stale.ts`:
     - Nhóm 1 (`ai_processing` quá hạn): select thêm `gradingMode: aiGradingDraft.gradingMode`; sau khi thắng CAS sang `manual_pending`, nếu `draft.gradingMode === "quick"` thì gọi `revertQuickGradeSlot(db, { orgId, attemptId: draft.attemptId })`, ngược lại gọi `releaseIfReserved`.
     - Nhóm 2: thêm xử lý cho draft `manual_pending` có `grading_mode = 'quick'` quá hạn mà sổ cái có dòng `quick_grade_writing` `settled` nhưng chưa có `reverted` → gọi `revertQuickGradeSlot`.
  5. Thêm unit tests trong `run-grading.test.ts`:
     - Org `monthly/active`, ví 0, đã dùng 29 lượt → bài Writing thứ 30 chấm `ai_drafted`, `gradingMode = "quick"`, `creditCost = 0`, grader nhận `mode: "quick"`, sổ cái có 1 dòng `quick_grade_writing` `settled` delta 0, số dư ví vẫn 0.
     - Org `monthly/grace_period`, ví 0 → cũng được Chấm nhanh.
     - Org `monthly/active`, ví 0, đã dùng đủ 30/30 lượt → bài Writing thứ 31 `manual_pending`, `errorCode = "E-selfomy-alignment-002"`, grader KHÔNG được gọi.
     - Org `none` hoặc `trial` hoặc `monthly/expired`, ví 0 → Writing `manual_pending` + `errorCode = "E-selfomy-alignment-001"`, grader không được gọi.
     - Speaking (có transcriber trả text), ví 0 (kể cả org `monthly/active`) → `manual_pending` + `errorCode = "E-selfomy-alignment-001"`.
     - Quick mode nhưng AI lỗi / timeout (khi org đang có `held > 0` của một job khác) → draft `manual_pending`, lượt quick được revert (`reverted`), và `held` của job khác giữ nguyên (không ném `InsufficientCreditsError`).
     - Sweep `releaseStaleGradings` trên draft quick bị kẹt `ai_processing` > 60s → CAS `manual_pending` và revert lượt quick.
- **Success criteria:** Toàn bộ test trong `run-grading.test.ts` và `workers-ai-grader.test.ts` pass.
- **Verify:** `pnpm --filter server test -- wallet ai-grading` exits 0.

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
