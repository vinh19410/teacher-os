---
title: "TOS-32: Tự động hạ cấp mềm sang \"Chấm nhanh Writing 30 bài/tháng\" khi hết Credit chính"
description: "Khi tổ chức ở gói tháng còn hiệu lực (active / grace_period) hết Credit chính, bài Writing được chấm nhanh 0 Credit tối đa 30 lượt/tháng, gắn nhãn \"Bản nháp chấm nhanh\"; hết cả hai → manual_pending, không gọi AI, cảnh báo E-002 kèm nút nạp Credit trên màn [7]; Speaking thiếu Credit → E-001."
status: completed
priority: P1
effort: 1.5d
issue: 480
branch: ai-handle-issue-480
tags: [feature, backend, frontend, e2e, ai, credits]
blockedBy: [478]
blocks: []
created: 2026-10-28
---

# Plan: TOS-32 — Hạ cấp mềm sang "Chấm nhanh Writing 30 bài/tháng"

## Overview

AC-003 của US-006 (FR-selfomy-alignment-014, BR-selfomy-alignment-007; E-selfomy-alignment-001/002):

> - Gói tháng còn hiệu lực (`active` hoặc `grace_period`), **ví = 0**, đã dùng **< 30** lượt Chấm nhanh Writing trong tháng → bài Writing mới được chấm nháp chế độ **"Chấm nhanh"**, **0 Credit**, gắn nhãn **"Bản nháp chấm nhanh"** trên [7].
> - Ví = 0 **và** đã dùng **30/30** lượt → bài lưu ở **`manual_pending`**, **không gọi AI**, hiển thị **E-selfomy-alignment-002** kèm nút nạp thêm Credit trên [7].

Nguồn: Jira [TOS-32](https://teacher-os.atlassian.net/browse/TOS-32) (subtask của TOS-28 / US-006 · AC-003), spec lỗi E-001/E-002 (`docs/selfomy-alignment/srs/selfomy-alignment-spec.md:110-111`).

## Scope Challenge

- **Phụ thuộc TOS-30:** nhánh `InsufficientCreditsError` trong `runAiGrading`, cột `grading_mode`, panel AI [7].
- **Chưa có mô hình gói thuê bao tháng** (TOS-42 / US-009 vẫn To Do; `credit_wallet` chỉ có `balance`/`held`). AC cần biết "gói tháng còn hiệu lực" → plan thêm **trạng thái gói tối thiểu** trên ví (D1), TOS-42 sẽ tiếp quản và ghi vào đó.
- **Mode:** fast + scout, HOLD SCOPE.

## Quyết định

| # | Quyết định | Lý do |
|---|---|---|
| D1 | **Trạng thái gói tối thiểu** trên `credit_wallet`: thêm `plan_kind` (`none` \| `trial` \| `monthly`, default `none`) và `plan_status` (`active` \| `grace_period` \| `expired`, nullable). Service `readOrgPlan(db, orgId)` trong `lib/credits/wallet.ts` trả `{ planKind: "none", planStatus: null }` khi org chưa có dòng ví; chỉ đọc ở ticket này, ghi bằng seed/test (TOS-42 / TOS-50 cung cấp luồng ghi thật). Lưu ý cho TOS-42: phải coi ledger COUNT (D2) là nguồn truth duy nhất cho hạn mức Chấm nhanh thay vì cột `monthly_fast_writing_used` rời rạc. | Không chặn AC bởi TOS-42; một chỗ duy nhất để TOS-42 nối vào. |
| D2 | **Đếm lượt Chấm nhanh bằng sổ cái**: mỗi lượt ghi 1 dòng `credit_usage_log` với `action_type = "quick_grade_writing"`, `credit_delta = 0`, `tx_status = "settled"`, `actor_user_id` (truyền từ pipeline, mặc định `"system"`), `ref_id = attemptId`, `idempotency_key = "quick_grade_writing:<attemptId>:claim"` (UNIQUE → không đếm trùng). Hạn mức (`QUICK_GRADE_MONTHLY_LIMIT = 30`) = `MAX(settled − reverted, 0)` trong **tháng dương lịch theo giờ `Asia/Ho_Chi_Minh`** (`monthWindowVietnamMs(now)` trong `packages/api/src/vietnam-date.ts`) của org. Kiểm + ghi trong một câu `INSERT INTO credit_usage_log … SELECT … WHERE (count) < 30` để 2 bài nộp đồng thời không vượt 30. | Tái dùng sổ cái append-only; không thêm bảng counter; chống race. |
| D3 | **Rẽ nhánh trong `runAiGrading`** khi reserve báo thiếu Credit (`InsufficientCreditsError`): Writing + `plan_kind = "monthly"` + `plan_status ∈ {"active", "grace_period"}` → gọi `claimQuickGradeSlot`: thành công ⇒ UPDATE `ai_grading_draft` đặt `grading_mode = "quick", credit_cost = 0`, chấm với `mode: "quick"`, thắng CAS `ai_drafted` thì **không gọi `settleCredits`**; thất bại claim ⇒ CAS `manual_pending` + `error_code = AI_GRADING_ERROR_CODES.QUOTA_EXHAUSTED` (`"E-selfomy-alignment-002"`). Writing ngoài gói tháng hoặc Speaking thiếu Credit (khi có transcript từ TOS-31) ⇒ CAS `manual_pending` + `error_code = AI_GRADING_ERROR_CODES.INSUFFICIENT_CREDITS` (`"E-selfomy-alignment-001"`). Trong nhánh quick (`quickMode = true`), mọi fail-path (grader thiếu, AI lỗi/timeout, thua CAS, hoặc sweep `releaseStaleGradings` dọn draft `grading_mode = "quick"` bị treo/hỏng) **TUYỆT ĐỐI KHÔNG gọi `releaseCredits`** (tránh ăn nhầm `held` của job khác hoặc ném `InsufficientCreditsError`), mà gọi `revertQuickGradeSlot(db, { orgId, attemptId, actorUserId })` ghi dòng bù `action_type = "quick_grade_writing"`, `tx_status = "reverted"`, `credit_delta = 0`, `idempotency_key = "quick_grade_writing:<attemptId>:revert"` (idempotent theo UNIQUE key, chỉ chèn khi đã có dòng claim `settled` của cùng `attemptId`). | Đúng spec E-001 và E-002; an toàn với crash/race. |
| D4 | **"Chấm nhanh" = cùng `AiGrader`** với tham số `mode?: "standard" \| "quick"` trên `AiGradingInput` (`grader.ts`) và `workers-ai-grader.ts` (prompt ngắn: chỉ chấm 4 điểm tiêu chí + 1–2 câu nhận xét tổng quan, không gợi ý sửa câu chi tiết). | Không cần model riêng; khác biệt chi phí do sản phẩm quyết định. |
| D5 | **UI [7] và hàng chờ `/grading`:** mở rộng `AI_GRADING_ERROR_CODES` + `AI_GRADING_ERROR_MESSAGES` trong `packages/api/src/contracts.ts` với nguyên văn thông điệp E-001 / E-002 từ spec (`selfomy-alignment-spec.md:111-112`), và thêm `aiGradingMode?: "standard" \| "quick" \| null` vào `GradingQueueItem`. Trên `AiDraftPanel` ([7]) và hàng chờ `/grading`: hiện badge `"Bản nháp chấm nhanh"` khi `gradingMode === "quick"`; khi `errorCode` là E-001 hoặc E-002 thì hiện banner cảnh báo nguyên văn spec + nút **"Nạp thêm Credit"** (mở hộp thoại hướng dẫn liên hệ chủ trung tâm hoặc điều hướng `topUpHref` cấu hình được để TOS-43 nối vào). | AC yêu cầu nhãn + thông điệp nguyên văn + nút nạp Credit. |

## Non-goals

- Luồng mua gói / Top-up / chuyển trạng thái gói (TOS-42, TOS-43, TOS-45, TOS-50).
- Cảnh báo ngưỡng 80% / 100% ví (TOS-42).
- Chấm nhanh cho Speaking (spec chỉ Writing).

## Phases

| # | Phase | Ước lượng | Trạng thái | Phụ thuộc |
|---|---|---|---|---|
| 1 | [phase-01-plan-state-and-quota.md](phase-01-plan-state-and-quota.md): migration `plan_kind`/`plan_status`, `readOrgPlan`, giành lượt Chấm nhanh nguyên tử, rẽ nhánh `runAiGrading` | 0.75d | completed | TOS-30 |
| 2 | [phase-02-quick-grade-ui.md](phase-02-quick-grade-ui.md): badge Chấm nhanh, banner E-001/E-002 + nút nạp Credit | 0.25d | completed | 1 |
| 3 | [phase-03-e2e-ac-003.md](phase-03-e2e-ac-003.md): 2 scenario | 0.5d | completed | 2 |

## Acceptance criteria (từ AC-003)

- [x] Org gói tháng `active`/`grace_period`, ví 0, đã dùng 29 lượt → bài Writing mới `ai_drafted`, `grading_mode = quick`, sổ cái thêm 1 dòng `quick_grade_writing` delta 0, số dư ví vẫn 0; [7] hiện nhãn "Bản nháp chấm nhanh".
- [x] Đã dùng 30/30 → bài `manual_pending`, grader không được gọi, [7] hiện thông điệp E-002 + nút nạp Credit.
- [x] 2 bài nộp đồng thời khi còn 1 lượt → đúng 1 bài được chấm nhanh.
- [x] Sang tháng mới (giờ Asia/Saigon) hạn mức về 30.
- [x] Org không ở gói tháng, ví 0 → Writing/Speaking `manual_pending` + E-001.

## Verify

- `pnpm --filter server test`, `pnpm --filter web test`, `pnpm check && pnpm check-types`
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e exec playwright test specs/ai-grading-ac-003.spec.ts`
## Câu hỏi mở

- Gói `trial` hết 30 Credit có được Chấm nhanh không? Spec chỉ nêu "gói thuê bao tháng" → plan **không** cho trial; xác nhận với PO trước khi merge.

## Red Team Review

### Session — 2026-10-28
**Findings:** 9 (8 accepted, 1 rejected)
**Severity breakdown:** 1 Critical, 3 High, 5 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Quick-mode fail-paths (`failDraft`, grader missing, CAS loss) gọi `releaseCredits` làm ăn nhầm `held` của job khác hoặc throw `InsufficientCreditsError` | Critical | Accept | D3, Phase 1 |
| 2 | Isolate crash giữa `claimQuickGradeSlot` và CAS `ai_drafted` làm rò lượt vĩnh viễn vì `releaseStaleGradings` chưa revert quick slot | High | Accept | D3, Phase 1 |
| 3 | `E-selfomy-alignment-001`/`002` và `AI_GRADING_ERROR_MESSAGES` chưa có trong `packages/api/src/contracts.ts` | High | Accept | D3, D5, Phase 1, Phase 2 |
| 4 | D4 "prompt ngắn" cần sửa `workers-ai-grader.ts` (không chỉ interface `grader.ts`) | High | Accept | D4, Phase 1 |
| 5 | `runAiGrading` INSERT draft với `grading_mode = 'standard', credit_cost = cost` trước reserve — cần UPDATE sang `grading_mode = 'quick', credit_cost = 0` sau khi claim | Medium | Accept | D3, Phase 1 |
| 6 | `revertQuickGradeSlot` cần idempotency key riêng (`quick_grade_writing:<attemptId>:revert`) và guard chỉ revert khi có claim `settled` để chống double-revert | Medium | Accept | D2, D3, Phase 1 |
| 7 | Hàng chờ `/grading` (`GradingQueueItem` + `loadGradingQueue`) thiếu `aiGradingMode` để render badge Chấm nhanh | Medium | Accept | D5, Phase 2 |
| 8 | Helper biên tháng `Asia/Ho_Chi_Minh` (`monthWindowVietnamMs`) đặt trong `packages/api/src/vietnam-date.ts` và dùng chung cho E2E seed để tránh flake biên tháng; port E2E verify là 8100/8101/8103/8104 | Medium | Accept | D2, Phase 1, Phase 3 |
| 9 | Chưa có writer production cho `plan_kind = 'monthly'` / `plan_expires_at` và Speaking chưa có STT thật | Medium | Reject (by design: thuộc scope TOS-42 / TOS-31 trong Non-goals; Speaking với transcriber inject vẫn test được nhánh E-001) | Non-goals |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-plan-state-and-quota.md`, `phase-02-quick-grade-ui.md`, `phase-03-e2e-ac-003.md`
- Decision deltas checked: 8
- Reconciled stale references: 8 (đồng bộ tên key sổ cái, danh sách file `contracts.ts`/`workers-ai-grader.ts`/`release-stale.ts`/`vietnam-date.ts`/`routes/grading.ts`, UPDATE `grading_mode`, `aiGradingMode` trên queue item, helper biên tháng VN)
- Unresolved contradictions: 0
