---
title: "Bỏ chữ \"khách quan\" trong bộ entry test"
description: "Loại bỏ các cụm từ \"khách quan\" khỏi giao diện và test của hệ thống bài kiểm tra đầu vào (entry/placement test) trên profile, student portal và web giáo viên."
status: completed
priority: P2
effort: "1h"
tags: [placement-test, ui-copy, entry-test]
created: 2026-11-17
---

# remove-khach-quan-entry-test

## Overview

Bỏ toàn bộ chữ `"khách quan"` hiển thị cho người dùng trong bộ bài kiểm tra đầu vào (entry test / placement test) ở cả 3 bề mặt (`apps/profile`, `apps/student`, `apps/web`), đồng thời cập nhật các unit test, API contract test description và E2E spec assertions liên quan. Giữ nguyên dữ liệu từ vựng vocab-library (`packages/db/seed-data/vocab-library/lesson_details.csv`) và các identifier kỹ thuật nội bộ (`objective`, `unansweredObjective`).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Bỏ mọi chữ `"khách quan"` khỏi UI bài kiểm tra đầu vào (profile, student, web) | P1 |
| 2 | Cập nhật đồng bộ unit test, API test description và E2E specs | P1 |
| 3 | Xác minh lint, typecheck, unit test và E2E specs liên quan đều xanh | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Start](./phase-01-start.md) | Pending |

## Success Criteria

- [ ] `apps/profile/public/kiem-tra-dau-vao/`, `apps/student/src/components/placement/`, `apps/web/src/components/leads/`, `apps/web/src/components/placement-test/`, `packages/api/src/placement-test-contracts.test.ts` và `apps/e2e/specs/` không còn chuỗi `"khách quan"`.
- [ ] `packages/db/seed-data/vocab-library/lesson_details.csv` không bị chỉnh sửa.
- [ ] `pnpm exec biome check .`, `pnpm check-types`, unit tests (`web`, `student`, `profile`, `api`) và các E2E specs liên quan (`profile-placement-test.spec.ts`, `placement-test-editor.spec.ts`, `student-placement-test.spec.ts`) pass.

## Red Team Review

### Session — 2026-11-17
**Findings:** 3 (3 accepted, 0 rejected)
**Severity breakdown:** 0 Critical, 0 High, 3 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Copy thay thế `"Điểm các phần"` tại `placement-result-views.tsx:387` cụt nghĩa; nên dùng `"Điểm các kỹ năng"` như `result.js:305` | Medium | Accept | Phase 1 |
| 2 | Thiếu regression guard `"khách quan"` trong `apps/profile/tests/placement-test.test.mjs:324-341` | Medium | Accept | Phase 1 |
| 3 | Verification bỏ sót `student-placement-test.spec.ts` và nhánh confirm nộp bài khi còn câu chưa trả lời | Medium | Accept | Plan & Phase 1 |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`
- Decision deltas checked: 3 (`Điểm các kỹ năng`, `forbiddenToken` ở `apps/profile/tests/placement-test.test.mjs`, thêm `student-placement-test.spec.ts` & case confirm ở `placement-test.test.tsx`)
- Reconciled stale references: 0
- Unresolved contradictions: 0

## Validation Log

### Verification Results (Light Tier — Fact Checker)
- **Tier:** Light
- **Claims checked:** 16 file/line references across `apps/profile`, `apps/student`, `apps/web`, `packages/api`, `apps/e2e`, `packages/db`
- **Verified:** 16 | **Failed:** 0 | **Unverified:** 0

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`
- Decision deltas checked: 0
- Reconciled stale references: 0
- Unresolved contradictions: 0

<!-- slug: remove-khach-quan-entry-test -->