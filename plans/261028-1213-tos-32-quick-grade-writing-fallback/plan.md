---
title: "TOS-32: Tự động hạ cấp mềm sang \"Chấm nhanh Writing 30 bài/tháng\" khi hết Credit chính"
description: "Khi tổ chức ở gói tháng còn hiệu lực (active / grace_period) hết Credit chính, bài Writing được chấm nhanh 0 Credit tối đa 30 lượt/tháng, gắn nhãn \"Bản nháp chấm nhanh\"; hết cả hai → manual_pending, không gọi AI, cảnh báo E-002 kèm nút nạp Credit trên màn [7]; Speaking thiếu Credit → E-001."
status: pending
priority: P1
effort: 1.5d
issue: 480
branch: null
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
| D1 | **Trạng thái gói tối thiểu** trên `credit_wallet`: thêm `plan_kind` (`none` \| `trial` \| `monthly`, default `none`) và `plan_status` (`active` \| `grace_period` \| `expired`, nullable). Service `readOrgPlan(db, orgId)` trong `lib/credits/wallet.ts`; chỉ đọc ở ticket này, ghi bằng seed/test (TOS-42 / TOS-50 cung cấp luồng ghi thật). | Không chặn AC bởi TOS-42; một chỗ duy nhất để TOS-42 nối vào. |
| D2 | **Đếm lượt Chấm nhanh bằng sổ cái**: mỗi lượt ghi 1 dòng `credit_usage_log` `action_type = "quick_grade_writing"`, `credit_delta = 0`, `tx_status = "settled"`, key `quick_grade:<attemptId>` (UNIQUE → không đếm trùng). Hạn mức = `COUNT` dòng trong **tháng dương lịch theo giờ `Asia/Saigon`** của org. Kiểm + ghi trong một `INSERT … SELECT … WHERE (count) < 30` để 2 bài nộp đồng thời không vượt 30. | Tái dùng sổ cái append-only; không thêm bảng counter; chống race. |
| D3 | **Rẽ nhánh trong `runAiGrading`** khi reserve báo thiếu Credit: Writing + `plan_kind = monthly` + `plan_status ∈ {active, grace_period}` → giành lượt (D2) thành công ⇒ chấm với `grading_mode = "quick"`, `credit_cost = 0`, không settle; giành lượt thất bại ⇒ `manual_pending` + `error_code = "E-selfomy-alignment-002"`. Writing ngoài gói tháng hoặc Speaking ⇒ `manual_pending` + `E-selfomy-alignment-001`. AI chấm nhanh lỗi ⇒ xoá không được (append-only) → ghi dòng bù `quick_grade_writing_reverted` và đếm hạn mức = settled − reverted. | Đúng spec E-001 ("với bài Speaking chuyển Chờ chấm thủ công") và E-002. |
| D4 | **"Chấm nhanh" = cùng `AiGrader`** với tham số `mode: "quick"` (prompt ngắn, chỉ điểm + nhận xét tổng, không gợi ý sửa câu). | Không cần model riêng; khác biệt chi phí do sản phẩm quyết định. |
| D5 | **UI [7]:** badge "Bản nháp chấm nhanh" khi `grading_mode = quick`; banner E-002 / E-001 với thông điệp nguyên văn spec + nút **"Nạp thêm Credit"**. Chưa có màn Top-up `[10]` (TOS-43) → nút mở hộp thoại hướng dẫn liên hệ chủ trung tâm, có `href` cấu hình để TOS-43 thay. | AC yêu cầu nút; không tự dựng luồng thanh toán. |

## Non-goals

- Luồng mua gói / Top-up / chuyển trạng thái gói (TOS-42, TOS-43, TOS-45, TOS-50).
- Cảnh báo ngưỡng 80% / 100% ví (TOS-42).
- Chấm nhanh cho Speaking (spec chỉ Writing).

## Phases

| # | Phase | Ước lượng | Trạng thái | Phụ thuộc |
|---|---|---|---|---|
| 1 | [phase-01-plan-state-and-quota.md](phase-01-plan-state-and-quota.md): migration `plan_kind`/`plan_status`, `readOrgPlan`, giành lượt Chấm nhanh nguyên tử, rẽ nhánh `runAiGrading` | 0.75d | pending | TOS-30 |
| 2 | [phase-02-quick-grade-ui.md](phase-02-quick-grade-ui.md): badge Chấm nhanh, banner E-001/E-002 + nút nạp Credit | 0.25d | pending | 1 |
| 3 | [phase-03-e2e-ac-003.md](phase-03-e2e-ac-003.md): 2 scenario | 0.5d | pending | 2 |

## Acceptance criteria (từ AC-003)

- [ ] Org gói tháng `active`/`grace_period`, ví 0, đã dùng 29 lượt → bài Writing mới `ai_drafted`, `grading_mode = quick`, sổ cái thêm 1 dòng `quick_grade_writing` delta 0, số dư ví vẫn 0; [7] hiện nhãn "Bản nháp chấm nhanh".
- [ ] Đã dùng 30/30 → bài `manual_pending`, grader không được gọi, [7] hiện thông điệp E-002 + nút nạp Credit.
- [ ] 2 bài nộp đồng thời khi còn 1 lượt → đúng 1 bài được chấm nhanh.
- [ ] Sang tháng mới (giờ Asia/Saigon) hạn mức về 30.
- [ ] Org không ở gói tháng, ví 0 → Writing/Speaking `manual_pending` + E-001.

## Verify

- `pnpm --filter server test -- ai-grading wallet`, `pnpm --filter web test -- grading`, `pnpm check && pnpm check-types`
- `pnpm --filter e2e e2e -- ai-grading-ac-003` (port override)

## Câu hỏi mở

- Gói `trial` hết 30 Credit có được Chấm nhanh không? Spec chỉ nêu "gói thuê bao tháng" → plan **không** cho trial; xác nhận với PO trước khi merge.
