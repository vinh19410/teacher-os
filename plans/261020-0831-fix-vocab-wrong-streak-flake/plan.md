---
title: "Fix flaky e2e vocab-srs test 3: gate overlay assertion theo wrong-streak thực tế"
description: "Thay gate `safety >= 5` bằng mirror counter wrong/forgot liên tiếp đọc từ feedback verdict, khử flake theo shuffle prompt ở vocab-srs.spec.ts test 3 (#379)."
status: completed
priority: P1
effort: 2h
issue: 379
branch: ai-handle-issue-379
tags: [bugfix, frontend, api]
blockedBy: []
blocks: []
created: 2026-10-20
---

# Fix flaky e2e vocab-srs test 3 — gate overlay assertion theo wrong-streak thực tế

## Overview

Test 3 của `apps/e2e/specs/vocab-srs.spec.ts` ("seeded overdue review card requeues on
wrong, evicts after 2 forgot…") thỉnh thoảng fail tại
`expect(overlaySeen, "wrong-streak overlay appeared").toBe(true)` vì gate
`if (safety >= 5)` dùng biến `safety` — tăng ở **mọi** vòng lặp kể cả vòng `continue`
chờ render — làm proxy cho "5 câu trả lời sai liên tiếp". Hai biến này không tương
quan: shuffle prompt có thể ra `typing`, test điền đúng `"sustainable"` → engine reset
`wrongStreak` (review-session.ts:238-239) và card `done` ngay (queue 1 card → session
kết thúc, review-session.ts:268-271) trong khi `safety` vẫn chạm 5 → assertion chạy
dù overlay chưa từng có điều kiện xuất hiện.

Root cause đã được chứng minh bằng code-path (không phải phỏng đoán):

| # | Bằng chứng | Vị trí |
|---|-----------|--------|
| 1 | `safety += 1` chạy cả vòng `continue`; gate `if (safety >= 5)` | `apps/e2e/specs/vocab-srs.spec.ts:414-417, 455-457` |
| 2 | `respond`: correct → `wrongStreak = 0`; overlay chỉ khi streak ≥ `ENCOURAGEMENT_STREAK = 5` | `packages/api/src/srs/review-session.ts:55, 238-246` |
| 3 | correct → `done += 1`; 1 card due → session có thể kết thúc với streak < 5 | `packages/api/src/srs/review-session.ts:268-275` |
| 4 | Prompt kind chọn bằng `rng.nextInt`; `typing` eligible với "sustainable" | `packages/api/src/srs/quiz-generator.ts:202-206, 269-288`; `packages/api/src/srs/quiz-rules.ts:25-32` |

Quan sát thực tế: 1/1 fail trong run gate của fix #377 (2026-10-20). Overlay rule đã có
unit test deterministic: `apps/student/src/components/vocab/vocab-session-view.test.tsx:255`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Assertion overlay chỉ chạy khi session **thực sự** có ≥ 5 wrong/forgot liên tiếp (đếm được từ feedback verdict), không còn phụ thuộc `safety` | P1 |
| 2 | Không xoá/weaken assertion: giữ nguyên expectation + message; bổ sung assert nghịch `overlaySeen ⇒ overlayRequired` để mirror không trôi | P1 |

## Non-goals

- Không seeding ≥ 5 due cards (vỡ assertion `due-count = "1"`; issue đã loại hướng này).
- Không đổi engine, UI hay unit test — chỉ sửa e2e spec test 3.
- Không đụng các test khác trong file spec.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Mirror wrong-streak counter + gate assertion](./phase-01-start.md) | Completed |

## Success Criteria

- [x] Gate assertion dùng counter wrong/forgot thực tế đọc từ `vocab-feedback-verdict`, không dùng `safety`.
- [x] Assertion chính giữ nguyên ngữ nghĩa: khi mirror chạm 5 mà overlay không xuất hiện → fail.
- [x] Assert nghịch: overlay xuất hiện nhưng mirror < 5 → fail (phát hiện mirror drift, ví dụ verdict text đổi).
- [x] `pnpm --filter e2e e2e -- vocab-srs` pass ổn định qua nhiều run liên tiếp (dev stack local, port 8100/8101/8103).
- [x] `pnpm check` + `pnpm check-types` pass.

## TDD note (red state không tái lập được)

Đây là flake xác suất: red state gốc (fail tại :564) chỉ xuất hiện theo shuffle và đã
được ghi nhận 1/1 trong run gate #377. Chế độ hang sau dismiss overlay (F1) cũng chỉ
xảyra khi overlay xuất hiện. Không thể tạo red test deterministic từ e2e; regression
gate của plan này là **multi-run green e2e** (3 run liên tiếp pass) + hai assertion
đối xứng (thiếu overlay khi mirror ≥ 5 → fail; có overlay khi mirror < 5 → fail).

## Validation Log

### Verification Results (Light tier — Fact Checker)
- Claims checked: 5
- Verified: 5 | Failed: 0 | Unverified: 0
  1. `safety += 1` cả vòng `continue` + gate `safety >= 5` — VERIFIED (`apps/e2e/specs/vocab-srs.spec.ts:414-417,455-457`).
  2. `respond`: correct → `wrongStreak = 0`; overlay tại `ENCOURAGEMENT_STREAK = 5`; engine reset streak khi overlay — VERIFIED (`packages/api/src/srs/review-session.ts:55,238-246`).
  3. `dismissEncouragement` chỉ tự-advance selfCheck — VERIFIED (`packages/api/src/srs/review-session.ts:321-327`).
  4. testid `vocab-feedback-verdict` + 3 chuỗi verdict "Chính xác"/"Chưa đúng"/"Chưa nhớ" — VERIFIED (`apps/student/src/components/vocab/vocab-feedback-panel.tsx:51-62`).
  5. Override port e2e `E2E_API_PORT/E2E_WEB_PORT/E2E_STUDENT_PORT` + script `check-types` của apps/e2e — VERIFIED (`apps/e2e/playwright.config.ts:5-7`, `apps/e2e/package.json`).

### Quyết định hướng (từ issue #379 — nguồn uy quyền)
- Chọn hướng 1 của issue: gate assertion theo counter wrong/forgot thực tế đọc từ
  feedback verdict. Hướng 2 (seed ≥ 5 due cards) bị loại vì vỡ `due-count = "1"`.

## Red Team Review

### Session — 2026-10-20
**Lens:** Security Adversary + Assumption Destroyer (Light tier, Fact Checker role).
**Lưu ý thực thi:** subagent spawn lỗi môi trường ("No model selected") nên 2 lens
được controller tự thực hiện trên chính codebase, mọi finding kèm file:line.
**Findings:** 4 (3 accepted, 1 rejected)
**Severity breakdown:** 1 Critical, 2 Medium, 1 Low

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| F1 | Deadlock sau dismiss overlay: `dismissEncouragement` chỉ auto-advance selfCheck; typing/option giữ feedback mở với input `disabled` + `disabled:pointer-events-none` → `fill()`/`click()` của loop treo tới timeout. Mọi run có overlay thật = fail chế độ hang (khác chế độ gate-assert đã ghi nhận). | Critical | Accept | Phase 1, Task 1.1 |
| F2 | Mirror đếm mọi verdict ≠ "Chính xác" là wrong; nếu UI copy drift, mirror inflation âm thầm. | Medium | Accept | Phase 1, Task 1.2 (whitelist assert) |
| F3 | Mirror không reset khi overlay xuất hiện trong khi engine reset streak về 0 (`review-session.ts:242-244`) → mirror lệch engine qua overlay thứ 2. | Medium | Accept | Phase 1, Task 1.2 (reset trong nhánh overlay) |
| F4 | Verify command `pnpm --filter e2e exec tsc --noEmit` không theo script chuẩn; apps/e2e đã có script `check-types`. | Low | Accept | Phase 1, Task 1.4 |
| — | "Seed review_log với card_id không tồn tại vi phạm FK" | Low | Reject | Không thuộc scope: seed hiện tại dùng card_id random nhưng bảng không ràng buộc FK tới vocab_card (`vocab_review_log` seed đã chạy ổn định qua các gate trước; #377 đã sửa student_id FK). No codebase evidence of a live failure. |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-start.md.
- Decision deltas checked: 3 (thêm Task 1.1 sửa nhánh overlay; mirror reset khi overlay;
  đổi verify command sang `check-types`).
- Reconciled stale references: 2 (mô tả goal phase bổ sung "sửa flow sau dismiss";
  TDD note bổ sung chế độ hang F1).
- Unresolved contradictions: 0.

### Advisory checkpoint (kongming) — post-plan-gates
**Kết quả: GO** kèm amendment bắt buộc (đã áp vào phase-01-start.md Task 1.2):
chuyển khối đọc verdict vào feedback block chung sau
`expect(feedbackContinue).toBeVisible()` (phủ cả nhánh self-forgot), bỏ giả định
"selfCheck không thể xuất hiện trong review session"; kèm limitation note rằng nhánh
self-forgot đã treo sẵn ở `toBeVisible` nếu selfCheck xuất hiện (pre-existing).
Risk canh: `vocab-continue-btn` có thể bị khóa khi persist chưa xong — `toBeEnabled`
auto-wait; nếu hang thì là bug thật, không phải flake.

<!-- slug: fix-vocab-wrong-streak-flake -->
