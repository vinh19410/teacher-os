---
title: "Ghi đè buổi học thủ công khi nhập giáo trình cho lớp"
description: "Phát hiện buổi học thủ công (đặc biệt các buổi trùng ngày lịch giáo trình) khi nhập template giáo trình vào lớp, hiển thị cảnh báo chi tiết để người dùng xác nhận ghi đè và chuyển hẳn lớp sang lịch tự động theo giáo trình."
status: completed
priority: P1
effort: "1d"
tags: [curriculum, manual-sessions, classes, tdd]
created: 2026-11-26
---

# Ghi đè buổi học thủ công khi nhập giáo trình cho lớp

## Overview

Khi giáo viên chọn nhập giáo trình mẫu (`POST /api/classes/:id/curriculum/import`) cho một lớp đang có buổi học thủ công (`class_session`), thay vì chặn cứng không có lối thoát, hệ thống phát hiện các buổi thủ công (liệt kê rõ ngày trùng với lịch dạy hiệu lực của giáo trình và các buổi thủ công ở ngày khác nếu có), kèm `overwriteHash` xác nhận phiên bản để hiển thị cảnh báo chi tiết trong `ImportSyllabusModal`. Nếu giáo viên có quyền quản lý lớp (`canManageClassStatus`) đồng ý ghi đè, server thực hiện giao dịch nguyên tử: xóa toàn bộ buổi thủ công chưa điểm danh, chuyển hẳn lớp sang chế độ `auto` theo giáo trình, giữ và đồng bộ link Zoom cùng ngày (kể cả link Zoom dán thủ công bằng cách upsert vào `class_session_meeting`), bảo toàn `recordingUrl`, dọn tài liệu riêng của buổi thủ công, và sinh lại lịch + gói buổi cho học viên đang học. Các buổi thủ công đã điểm danh hoặc hoàn thành luôn bị chặn ghi đè để bảo toàn lịch sử học tập và gói buổi.

## Outcome, Constraints & Non-Goals

- **Outcome:** Giáo viên nhập giáo trình vào lớp có buổi thủ công chưa điểm danh nhận được thông báo liệt kê ngày trùng (và buổi thủ công khác ngày nếu có); đồng ý thì ghi đè nguyên tử và chuyển lớp sang lịch giáo trình (`auto`).
- **Constraints:**
  - Không tạo trạng thái lai `class_session` + `syllabus` trong DB (bảo toàn bất biến #670).
  - Chỉ các vai trò quản lý lớp (`canManageClassStatus`: `teacher`, `owner`, `admin`, `class_teacher`) được phép thực hiện ghi đè buổi thủ công (`ta` nhận `403 FORBIDDEN`).
  - Chặn cứng ghi đè nếu có bất kỳ buổi thủ công nào đã điểm danh hoặc hoàn thành (`completed`, `absent`, có `attendance` hoặc `attendanceNote`), kể cả khi dòng `lesson` có `date: null`.
  - Chặn cứng ghi đè (`422`) nếu lớp thiếu lịch cấu trúc hợp lệ (`schedule`) hoặc ngày khai giảng ISO (`startDate`) hoặc kỳ nghỉ lễ chạm trần `SCAN_CAP_DAYS` (364 ngày).
  - Giữ lại và đồng bộ Zoom (`class_session_meeting` + best-effort `updateMeeting`) trên các ngày dạy hiệu lực (`activeDates`) trùng lịch giáo trình, kể cả link Zoom dán tay (`class_session.zoom` được upsert vào `class_session_meeting` trong cùng batch); xóa chủ đề/giờ thủ công và tài liệu gắn riêng (`lesson_material`) của buổi thủ công; bảo toàn `recordingUrl` nếu có trên các ngày bị dọn và giữ nguyên tài liệu chung của lớp (`class_material`).
  - Yêu cầu `overwriteHash` khớp trạng thái lớp + tập ngày buổi thủ công hiện hành khi `overwriteManualSessions: true` để chống TOCTOU liên request; đồng thời khóa CAS đầy đủ trong `db.batch`.
  - Không xóa dòng `lesson` của lớp `auto` cũ (0 `class_session`, đã gỡ giáo trình trước đó) ngay cả khi request truyền `overwriteManualSessions: true`.
  - Tương thích ngược 100% với payload cũ `{ templateId }` khi không gửi `overwriteManualSessions`.
- **Non-Goals:**
  - Không hỗ trợ chế độ lai giữ buổi thủ công khác ngày song song giáo trình.
  - Không ghi đè buổi đã điểm danh/hoàn thành.
  - Không thay đổi luồng `AddClassModal` (lớp mới chưa có buổi thủ công) hoặc `SyncCurriculumModal` (lớp đã có giáo trình không có buổi thủ công).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Chuẩn hóa contract API (`.strict()`, `overwriteHash`) & helper thuần tính ngày dạy hiệu lực của giáo trình (bắt lỗi `SCAN_CAP_DAYS`) và phân loại ngày trùng/không trùng | P1 |
| 2 | Triển khai force-overwrite nguyên tử trên server kèm RBAC guard, `overwriteHash`, CAS đầy đủ, upsert Zoom thủ công, bảo toàn `recordingUrl`, đồng bộ `updateMeeting` và D1 chunking | P1 |
| 3 | Hoàn thiện UX cảnh báo & xác nhận ghi đè trong `ImportSyllabusModal` (chống stale templateId/Enter/submitBlocked, format ngày có năm), đạt chuẩn 3 viewport Light/Dark và phủ test unit + E2E | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Shared Contracts & Curriculum Overlap Helper](./phase-01-start.md) | Done |
| 2 | [Phase 2: Server Force-Overwrite Import](./phase-02-server-force-overwrite-import.md) | Done |
| 3 | [Phase 3: Web Overwrite Confirmation UX & E2E](./phase-03-web-overwrite-confirmation-ux-and-e2e.md) | Done |

## Success Criteria

- [x] `POST /api/classes/:id/curriculum/import` không có `overwriteManualSessions` trên lớp có buổi thủ công chưa điểm danh trả `409` với `code: "MANUAL_SESSIONS_EXIST"`, `conflictingDates`, `otherManualDates`, `manualSessionCount`, và `overwriteHash`.
- [x] `POST /api/classes/:id/curriculum/import` với `{ templateId, overwriteManualSessions: true, overwriteHash }` (bởi vai trò được phép `canManageClassStatus`) trên lớp có lịch cấu trúc + `startDate` ISO hợp lệ và buổi thủ công chưa điểm danh chuyển lớp sang `auto`, `sessionsTotal = K`, xóa sạch `class_session`, `lesson` thủ công, `lesson_material`, `holiday_session_shift`, `holiday_session_cancel`, upsert link Zoom thủ công ở ngày trùng vào `class_session_meeting`, đồng bộ Zoom Cloud (`updateMeeting` ngày giữ lại + `deleteMeeting` ngày bỏ), bảo toàn `recordingUrl` nếu có, và sinh lại `lesson` + `session_package.total = K` cho mọi học viên `active`.
- [x] Vai trò `ta` gọi `overwriteManualSessions: true` bị chặn `403 FORBIDDEN`.
- [x] Lớp có buổi thủ công đã điểm danh/hoàn thành (kể cả `date: null`) luôn bị chặn `409` với `code: "MANUAL_SESSIONS_COMPLETED"` và `completedDates` (kể cả khi có race điểm danh đồng thời).
- [x] Lớp có lịch `schedule` legacy hoặc `startDate` rỗng/phi-ISO trả `422 CURRICULUM_INVALID_CLASS_SCHEDULE`; kỳ nghỉ lễ vượt `SCAN_CAP_DAYS` trả `422 CURRICULUM_HOLIDAY_SCAN_CAP`.
- [x] Lệch `overwriteHash` (buổi thủ công hoặc lịch/ngày khai giảng thay đổi giữa 2 bước xác nhận) trả `409 MANUAL_SESSIONS_EXIST` kèm danh sách ngày và `overwriteHash` mới nhất; race xóa buổi thủ công cuối cùng về `0` trả `409 CLASS_STATE_CHANGED` (không 500, không trả `manualSessionCount: 0`).
- [x] Lớp `auto` (0 `class_session`, có `lesson` thật sau khi gỡ giáo trình) không bao giờ bị xóa `lesson` khi gọi `curriculum/import` dù có truyền `overwriteManualSessions: true`.
- [x] `ImportSyllabusModal` hiển thị thông báo rõ ngày trùng định dạng `Thứ ..., dd/mm/yyyy` (và buổi thủ công ngày khác nếu có), khóa theo `templateId` & `submitBlocked`, chặn `Enter` gửi nhầm, xử lý 409 refresh khi danh sách đổi giữa chừng, và hiển thị lỗi chặn rõ ràng cho `MANUAL_SESSIONS_COMPLETED` / `FORBIDDEN` / `422`.
- [x] Tất cả gate pass: `pnpm --filter @teacher-os/api test`, `pnpm --filter server test`, `pnpm --filter web test`, `pnpm exec biome check .`, `pnpm check-types`, spec E2E liên quan, và kiểm tra 3 viewport (1440×900, 768×1024, 375×812) Light/Dark.

## Red Team Review

### Session — 2026-11-26
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer (3 parallel subagents, Standard verification tier: Fact Checker + Contract Verifier)
**Findings:** 11 deduplicated evidence-backed findings (11 accepted, 0 rejected)
**Severity breakdown:** 4 Critical, 5 High, 2 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| RT-1 | Thiếu RBAC role guard (`canManageClassStatus`) trên destructive overwrite cho phép `ta` xóa `lesson_material`/buổi học/Zoom | Critical | Accept | Phase 2, Phase 3 |
| RT-2 | `preservedZoomByDate` in-memory làm mất link Zoom dán tay trên lớp 0 HV, `paused`, self-heal và HV mới → thay bằng upsert `class_session_meeting` trong cùng batch | Critical | Accept | Phase 2 |
| RT-3 | TOCTOU liên request (thiếu `overwriteHash`) + CAS nội request chỉ kiểm `count(*)` (lọt `moveDate`/`startDate`/`schedule`/meeting mới) + lỗi 500/`manualSessionCount: 0` khi race xóa buổi cuối | Critical | Accept | Phase 1, Phase 2, Phase 3 |
| RT-4 | Kỳ nghỉ lễ `mode: "shift"`/`"cancel"` làm Zoom kẹt ở ngày `holiday`, bỏ sót meeting ở `makeupDate` cũ, xóa mất `recordingUrl`, và lệch org holiday trên lớp `paused` | Critical | Accept | Phase 1, Phase 2 |
| RT-5 | Cho phép overwrite trên lớp `schedule` legacy hoặc `startDate` rỗng/phi-ISO gây mất sạch lịch hoặc khóa `legacy-undated` vĩnh viễn | High | Accept | Phase 1, Phase 2, Phase 3 |
| RT-6 | `planHolidayShift` ném `Error` khi chạm `SCAN_CAP_DAYS` (364 ngày), trái tuyên bố "không throw" → trả discriminated union & `422 CURRICULUM_HOLIDAY_SCAN_CAP` | High | Accept | Phase 1, Phase 2, Phase 3 |
| RT-7 | Phòng Zoom giữ lại ở ngày trùng không gọi `updateMeeting` đồng bộ giờ/thời lượng/chủ đề + `deleteZoomMeetingBestEffort` không export → dùng `syncZoomMeetingsAfterReschedule` | High | Accept | Phase 2 |
| RT-8 | `findExistingMaterialIds` chưa chunk dưới trần 100 bind params D1; nhánh `raceCs` thiếu metadata 409; điều kiện chặn cần kiểm `settledLessons.length > 0` (kể cả `date: null`) | High | Accept | Phase 2 |
| RT-9 | Trạng thái `ImportSyllabusModal`: `confirmOverwrite` xử lý 409 mới (Race B), khóa `submitBlocked`, chặn `Enter`, khớp `pendingOverwrite.templateId === templateId`, toast sau `committed` reconcile | High | Accept | Phase 3 |
| RT-10 | `formatSessionDate` trả `dd/MM` (thiếu năm), `fmtDue` thiếu thứ → dùng helper an toàn `formatConflictDate` trả `"Thứ ..., dd/mm/yyyy"` | Medium | Accept | Phase 3 |
| RT-11 | `importSyllabusSchema` thiếu `.strict()` và `kernelCommand` thiếu `encodeURIComponent(action.classId)` | Medium | Accept | Phase 1, Phase 3 |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-server-force-overwrite-import.md`, `phase-03-web-overwrite-confirmation-ux-and-e2e.md`
- Decision deltas checked: 11 (RT-1 .. RT-11)
- Reconciled stale references: 11 (removed `preservedZoomByDate` and `enrollment-activation.ts` edit, updated `projectCurriculumDates` return type, added `overwriteHash`, added RBAC guard, aligned date formatter & modal state machine across all phases)
- Unresolved contradictions: 0

## Validation Log

### Session — 2026-11-26
- **Outcome & Scope Locked (via user confirmation):**
  1. Ghi đè các buổi trùng ngày và chuyển hẳn lớp sang lịch giáo trình (xóa toàn bộ buổi thủ công, giữ kiến trúc sạch #670).
  2. Chặn ghi đè và báo lỗi rõ ràng khi có buổi thủ công đã điểm danh hoặc hoàn thành.
  3. Giữ lại link Zoom cùng ngày, xóa chủ đề/giờ và tài liệu gắn riêng của buổi thủ công.
- **Verification Results:**
  - **Tier:** Standard (Fact Checker + Contract Verifier via 3 parallel reviewers + direct codebase spot-checks)
  - **Claims checked:** 28
  - **Verified:** 28 (after applying RT-1..RT-11 fixes for the 4 initial failed claims: `formatSessionDate`, `planHolidayShift` throw, `preservedZoomByDate` persistence, private `deleteZoomMeetingBestEffort`)
  - **Failed:** 0 | **Unverified:** 0
- **Whole-Plan Consistency Sweep:**
  - Files reread: `plan.md`, `phase-01-start.md`, `phase-02-server-force-overwrite-import.md`, `phase-03-web-overwrite-confirmation-ux-and-e2e.md`
  - Decision deltas checked: 11
  - Reconciled stale references: 11
  - Unresolved contradictions: 0

<!-- slug: overwrite-manual-sessions-on-curriculum-import -->
