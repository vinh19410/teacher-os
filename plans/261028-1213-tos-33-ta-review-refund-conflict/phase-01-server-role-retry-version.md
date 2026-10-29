---
phase: 1
title: "Server: phân quyền, retry + hoàn Credit, khóa phiên bản"
status: completed
effort: 1d
---

# Phase 1 — Server: phân quyền, retry + hoàn Credit, khóa phiên bản

## Files

- Sửa `packages/auth/src/role.ts` (+ `role.test.ts`): `canPublishGrade` (teacher/owner/admin/class_teacher), `canReviewGrade` (+ `ta`) — **map viết riêng, không copy `canImportExam`** (nó chặn `class_teacher`); test bảng đủ 6 trường hợp (teacher, owner, admin, class_teacher, ta, lạ/null).
- Sửa `apps/server/src/routes/grading.ts`: gate vai CHỈ trên route GHI (GET giữ staff); publish CÓ draft → CAS draft trước rồi `quiz_attempt` theo `changes() = 1`, không draft giữ luồng cũ; wire 409 thống nhất `E-selfomy-alignment-011` (thay `DRAFT_VERSION_CONFLICT` TOS-30 — sửa test cũ); `POST /:attemptId/ai-retry` vai `canPublishGrade` (TA → 403 `AI_RETRY_FORBIDDEN`), điều kiện `manual_pending` + `error_code ∈ {TIMEOUT, FAILED}`, release idempotent lượt n−1 TRƯỚC CAS `ai_processing` + reset `started_at` + `retry_count + 1`, gọi entry retry riêng.
- Sửa `apps/server/src/lib/ai-grading/run-grading.ts`: entry `runAiGrading(deps, attemptId, { retryCount })` bỏ bước insert draft; vòng retry D2 — deadline chung 30s đo từ TRƯỚC reserve, per-call timeout = min(20s, còn lại), còn <1s dừng, hết ngân sách → `AI_GRADING_TIMEOUT`; backoff inject `retryDelaysMs`; release + E-004.
- Sửa `apps/server/src/lib/credits/wallet.ts`: `CreditMutationInput.retryCount?` — khóa idempotency `ai_grading:<attemptId>:r<n>:<op>` cho cả reserve/settle/release khi `n ≥ 1` (`ref_id` giữ `attemptId`; lượt 0 giữ key cũ).
- Sửa `apps/server/src/lib/ai-grading/release-stale.ts`: sweep đối chiếu THEO TỪNG LƯỢT — key dựng từ `draft.retry_count` (r0 = key cũ, KHÔNG parse/LIKE chuỗi); lượt cũ hơn `retry_count` release an toàn; lượt hiện tại chỉ release khi draft đã rời `ai_processing` hoặc sweep thắng CAS nhóm 1; test bất biến reserved = settled + released.
- Migration nhỏ: cột `retry_count` NOT NULL DEFAULT 0 trên `ai_grading_draft` (drizzle-kit generate).
- `packages/api/src/contracts.ts`: ánh xạ thông điệp E-004 (2 mã TIMEOUT/FAILED) + E-011; bỏ `DRAFT_VERSION_CONFLICT` khỏi wire docs.

## Tests

- `role.test.ts`: bảng vai trò × quyền (6 trường hợp × 2 hàm).
- `run-grading.test.ts`: lỗi 3 lượt → 1 reserve + 1 release đủ số + `AI_GRADING_TIMEOUT/FAILED`; lỗi 1 rồi OK → settle; vượt ngân sách chung → release + TIMEOUT; per-call = min(20s, còn lại); backoff inject [0,0]; retry entry bỏ insert và CAS được draft `ai_processing`.
- `wallet.test.ts`: reserve/settle/release với `retryCount ≥ 1` sinh key riêng `r<n>`, gọi lại cùng n trả log cũ; n khác nhau không đè nhau; lượt 0 key cũ nguyên vẹn.
- `release-stale.test.ts`: crash sau reserve r1 khi r0 đã released → sweep vẫn release r1 đúng key; sweep song song với runner (runner thắng CAS → sweep không release lượt hiện tại).
- `grading.test.ts`: TA publish → 403; TA PATCH → OK; version cũ → 409 E-011 VÀ `quiz_attempt.grade_scores` không đổi; publish có draft thiếu `version` → 409 E-011; publish không draft không cần version (luồng cũ); publish khi draft `ai_processing` lượt r1 → draft không bị đè + runner thua CAS release đúng key r1; ai-retry khi `ai_processing` → 409; ai-retry TA → 403 `AI_RETRY_FORBIDDEN`; ai-retry song song → 1 reserve; ai-retry với `NO_TRANSCRIPT`/`DISABLED`/`error_code` null → chặn.

## Verify

- `pnpm --filter auth test`, `pnpm --filter server test -- grading ai-grading`
