---
title: "Edit class opening email template — remove level, replace duration with expected end date"
description: "Bỏ dòng Trình độ và thay dòng Thời lượng bằng Ngày kết thúc khóa học dự kiến (tự động tính từ lịch lớp/buổi học thực tế) trong email khai giảng và iframe xem trước."
status: completed
priority: P1
effort: "2h"
tags: [email, notifications, classes, opening]
created: 2026-11-28
---

# Edit class opening email template — remove level, replace duration with expected end date

## Overview

Cập nhật template email thông báo khai giảng (`renderClassOpeningEmail` tại `packages/api/src/class-opening-email.ts`) để bỏ dòng `Trình độ` và thay dòng `Thời lượng` (`N buổi`) bằng `Ngày kết thúc khóa học dự kiến` (tự động tính từ dữ liệu buổi học thực tế hoặc công thức lịch học `startDate + schedule + sessionsTotal`, không thêm input hay cột DB). Giữ nguyên khung tóm tắt `<dl>` đầu `ConfirmOpeningModal`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Bỏ `Trình độ` và thay `Thời lượng` bằng `Ngày kết thúc khóa học dự kiến` trong `renderClassOpeningEmail` (HTML + plain-text) | P1 |
| 2 | Đồng bộ tính toán ngày kết thúc dự kiến ở server `POST /api/classes/:id/confirm-opening` và web preview `ConfirmOpeningModal` | P1 |
| 3 | Giữ nguyên `<dl>` tóm tắt đầu modal, kiểm chứng 3 viewport + light/dark + POT và ship `--both` (`develop` rồi `main` bằng cherry-pick sạch) | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Start](./phase-01-start.md) | Pending |
| 2 | [Phase 2: web-and-visual-pot](./phase-02-web-and-visual-pot.md) | Pending |

## Success Criteria

- [x] Email khai giảng (HTML, plain-text, và `iframe` xem trước trong `ConfirmOpeningModal`) không còn `Trình độ` hay `Thời lượng`.
- [x] Email hiển thị `Ngày kết thúc khóa học dự kiến` theo định dạng `Thứ ..., dd/mm/yyyy` (ưu tiên buổi dạy cuối cùng chưa bị hủy/nghỉ lễ; fallback `skeletonOf` khi chưa có buổi thực tế hoặc khi đang xem trước đổi `startDate`; ẩn dòng khi không tính được).
- [x] Khung `<dl>` tóm tắt đầu `ConfirmOpeningModal` (`Lịch học`, `Hình thức`, `Tổng số buổi`) giữ nguyên không đổi.
- [x] Toàn bộ test mới và hiện có tại `@teacher-os/api`, `apps/server`, `apps/web`, `biome check`, `check-types`, `build` đều xanh; ảnh chụp POT 3 viewport + light/dark đạt chuẩn `REVIEW.md`.
- [ ] Ship thành công Stage 1 (`develop` / `Deploy Staging` xanh) và Stage 2 (`main` bằng cherry-pick sạch 1 commit / `Deploy Production` xanh).

## Validation Log

### Session — 2026-11-28 (User Intake Decisions)
1. **Nguồn dữ liệu "Ngày kết thúc khóa học dự kiến":** Tự động tính từ lịch lớp (không thêm input/cột DB) — ưu tiên ngày buổi dạy cuối cùng thực tế (gồm lịch bù nghỉ lễ / buổi thủ công nếu có); nếu chưa có buổi thực tế hoặc đang xem trước khi đổi ngày khai giảng thì tính từ `startDate + schedule + sessionsTotal`; ẩn dòng nếu không tính được.
2. **Khung tóm tắt đầu modal `ConfirmOpeningModal`:** Chỉ sửa email template (HTML/plain-text và iframe xem trước), giữ nguyên khung tóm tắt modal (`Lịch học`, `Hình thức`, `Tổng số buổi`).
3. **Chiến lược Stage 2 (`--both` lên `main`):** Cherry-pick riêng thay đổi này sang nhánh `release/<issue>-edit-opening-email-end-date-main` từ `origin/main` (theo tiền lệ PR #1033, #1039), không kéo theo các PR khác đang chờ trên `develop`.

### Verification Results
- **Tier:** Light (2 phases — Fact Checker)
- **Claims checked:** 6
- **Verified:** 6 | **Failed:** 0 | **Unverified:** 0
  - `packages/api/src/class-opening-email.ts:9-203` (`ClassOpeningEmailInput`, `renderClassOpeningEmail`, `detailRows`) — VERIFIED
  - `packages/api/src/skeleton.ts:127-147` (`skeletonOf`) — VERIFIED
  - `apps/server/src/lib/notifications/templates.ts:249-299` (`classOpeningConfirmedEvents`) — VERIFIED
  - `apps/server/src/routes/kernel.ts:3018-3450` (`POST /classes/:id/confirm-opening`) — VERIFIED
  - `apps/web/src/components/modals/confirm-opening-modal.tsx:152-324` (`ConfirmOpeningModal`, `<dl>` summary `:550-571`) — VERIFIED
  - `apps/web/src/routes/_auth/classes/$classId.tsx:250-282, 784-800` (`isManual`, `holidayShiftsForClass`, `ConfirmOpeningModal`) — VERIFIED

## Red Team Review

### Session — 2026-11-28
**Findings:** 7 deduplicated (1 Critical, 3 High, 3 Medium) — 7 accepted (with scope-aligned refinement on preview live-edit), 0 rejected
**Severity breakdown:** 1 Critical, 3 High, 3 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Unbounded/non-integer `sessionsTotal > 52` in `computeExpectedEndDateFromSchedule` | High | Accept | Phase 1 |
| 2 | Preview vs server divergence on live `startDate` change with holidays | Critical | Accept (scope clarified: saved state matches server 100%; live-edited `startDate` estimates via `computeExpectedEndDateFromSchedule`) | Phase 2 |
| 3 | Manual class cancelled/holiday/makeup `lesson` rows vs `class_session` | High | Accept | Phase 1 |
| 4 | All-cancelled dated `auto` lessons must return `null`; legacy undated uses schedule estimate | High | Accept | Phase 1 |
| 5 | `sanitizeSingleLine` + `parseStartDateStrict` on `expectedEndDate` override | Medium | Accept | Phase 1 |
| 6 | `ConfirmOpeningModal` must gate live-edit recalc by `!startDateReadOnly` | Medium | Accept | Phase 2 |
| 7 | Align `isManual` and `effectiveSessionsTotal` (`curriculumCopy.totalLessons`) across server and web | Medium | Accept | Phase 1, Phase 2 |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-web-and-visual-pot.md`
- Decision deltas checked: 7
- Reconciled stale references: 3
- Unresolved contradictions: 0

<!-- slug: edit-opening-email-end-date -->
