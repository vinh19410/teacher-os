---
title: "Remove redundant footer strip from student ClassInfoCard"
description: "Remove the redundant summary footer (duration months, duplicate time range, duplicate next session) from ClassInfoCard on /classes/$classId"
status: completed
priority: P1
effort: "1h"
tags: [student, ui, cleanup]
created: 2026-11-26
---

# Remove redundant footer strip from student ClassInfoCard

## Overview

Sau khi tái thiết kế 3 tab trang chi tiết lớp học viên (`/student/classes/$classId`, `#1010`), thanh footer ngăn cách bởi `border-t` ở đáy thẻ thông tin lớp (`ClassInfoCard`, `apps/student/src/components/class/class-info-card.tsx:169-191`) hiển thị 3 mục dư thừa (`{months} tháng`, `{timeRange}`, `Buổi tới: ...`):
- Khung giờ (`timeRange`) trùng với mục **Lịch** ngay phía trên trong lưới `<dl>` đối với các lớp có lịch định kỳ.
- Dòng **Buổi tới** trùng với thẻ `JourneyNextStopHero` ("BUỔI TIẾP THEO") và badge `Buổi tới` trên tab **Hành trình học**.
- Thời lượng ước lượng `{months} tháng` nằm chung cụm footer cần gỡ theo khoanh đỏ của người dùng.
- **Đánh đổi được chấp nhận có chủ đích:** với lớp thủ công không có lịch định kỳ (`cls.schedule === ""`) hoặc khi học viên chuyển sang tab phụ (`?tab=assignments`, `?tab=materials`), thẻ thông tin lớp không còn lặp lại giờ học hay dòng `Buổi tới:` — thông tin buổi tới nằm tập trung ở tab mặc định **Hành trình học**.

## Scope & Constraints

- **Outcome:** Gỡ bỏ hoàn toàn thanh footer `border-t` và toàn bộ logic/import chết liên quan khỏi `ClassInfoCard` trên `/student/classes/$classId`, giữ nguyên toàn bộ lưới `<dl>` thông tin lớp (Khoá, Lịch, Hình thức, Giáo viên + email, Số buổi đã học, Khai giảng), 4 vòng `RingStat` và 3 tab bên dưới.
- **Constraints:** Không đổi API contract `GET /api/student/classes/:classId`, không đổi `JourneyNextStopHero` / `ClassLessonList` / `ClassCard` (trang tổng quan) / `StudentScheduleView`, giữ đạt 3 viewport + 320px reflow + Light/Dark + keyboard focus theo `REVIEW.md` và `DESIGN.md`. Ảnh POT bắt buộc chụp trên stack E2E/seed cô lập sạch PII thật.
- **Non-goals:** Không sửa `apps/student/src/components/overview/class-card.tsx`, không sửa `apps/student/src/components/schedule/student-schedule-view.tsx`, không sửa tài liệu snapshot lịch sử `docs/_reverse/*`, không thay đổi bố cục lưới `<dl>` hay hành vi `mailto:` sẵn có.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Gỡ hoàn toàn cụm footer dư thừa và mã chết khỏi `ClassInfoCard` theo quy trình TDD | P1 |
| 2 | Cập nhật unit/component/E2E tests, đồng bộ `DESIGN.md` (gồm mục `Lệch có chủ đích`), kiểm chứng gates + targeted E2E + `design:compare` + POT 3 viewport Light/Dark sạch PII | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Remove ClassInfoCard footer and dead code (TDD)](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Verification, Visual Audit, POT & Docs](./phase-02-verification-visual-docs.md) | Pending |

## Success Criteria

- [x] `ClassInfoCard` (`apps/student/src/components/class/class-info-card.tsx`) chỉ render lưới `<dl>` thông tin lớp, không còn thanh footer `border-t`, không còn hiển thị `{months} tháng`, khung giờ lặp, hay `Buổi tới:` trong thẻ thông tin lớp.
- [x] Mã chết (`computeCourseMonths`, `parseISODateUTC`, `ISO_DATE_RE`, prop `todayISO`/`now` trên `ClassInfoCard`, và các import không còn dùng) được dọn sạch hoàn toàn; cả hai caller (`class-detail-view.tsx` và `class-detail.test.tsx`) đều đã cập nhật.
- [x] `JourneyNextStopHero` ("Buổi tiếp theo", `journey-next-hero`) và badge `Buổi tới` trong `ClassLessonList` (và `ClassCard` trang tổng quan) vẫn hoạt động nguyên vẹn.
- [x] Toàn bộ gates pass: `pnpm exec biome check .`, `pnpm check-types`, `pnpm --filter student test`, `pnpm test`, targeted E2E `student-class-detail.spec.ts` (có assertion cho `ClassInfoCard`), `pnpm design:compare --screens s-class-detail --force` (hoặc `--side app --force` nếu không clone được `teacheros-design-v2`), không lọt 9 PNG lịch sử bị ghi đè ngoài phạm vi.
- [x] 4 ảnh POT sạch PII (`plans/reports/1013-class-info-card-{desktop,dark,tablet,mobile}.png`) + `320px` reflow (0px tràn ngang) + kiểm tra `Tab` focus đạt chuẩn `REVIEW.md`, đã soi trực quan bằng `read_file`, và `DESIGN.md` được cập nhật đồng bộ (kèm mục `Lệch có chủ đích`).

## Red Team Review

### Session — 2026-11-26
**Reviewers:** Security Adversary (`code-reviewer`) + Assumption Destroyer (`code-reviewer`) — Light tier (2 phases, Fact Checker role)
**Findings:** 6 unique (5 accepted, 1 rejected)
**Severity breakdown:** 0 Critical, 3 High, 3 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | E2E `student-class-detail.spec.ts` và `design:compare --force` âm thầm ghi đè 9 PNG đang tracked trong git + phụ thuộc clone `teacheros-design-v2` chưa có trong `.cache/` | High | Accept | Phase 2, `plan.md` |
| 2 | Phase 2 thiếu cơ chế thực thi cụ thể để chụp 4 ảnh POT + `320px` reflow + `Tab` focus trên `/classes/$classId`, thiếu ràng buộc dữ liệu synthetic sạch PII, E2E chưa assert `ClassInfoCard`, và chưa chốt prefix `<issue-number>` | High | Accept | Phase 2, `plan.md` |
| 3 | Pha TDD Red dễ pass giả nếu bỏ `todayISO`/`now` trước khi sửa component (`date >= undefined === false`), sót caller test thứ 2 (`class-detail.test.tsx:421-427`), và rủi ro xoá nhầm 2 test `ClassAssignmentTable` dùng chung `describe` (`:442-542`) | High | Accept | Phase 1, `plan.md` |
| 4 | Test Matrix #3 sai nhãn thực tế của `JourneyNextStopHero` (`"Buổi tiếp theo"`, không phải `"Buổi tới"`), thiếu assertion số lần khung giờ `19:00–20:30` = 1, lịch JSON có cấu trúc, trường rỗng/legacy, và mô tả test `class-detail-view.test.tsx:103` | Medium | Accept | Phase 1 |
| 5 | `plan.md` khái quát quá mức tính "trùng 100%" cho lớp không lịch/tab phụ; Phase 2 cần ghi lý do gỡ footer vào `Lệch có chủ đích` trong `DESIGN.md:118-119` và loại trừ `docs/_reverse/*` | Medium | Accept | `plan.md`, Phase 2 |
| 6 | `href="mailto:${teacherEmail}"` chưa lọc RFC 6068/Bidi ở `class-info-card.tsx:146` và `class-detail-view.tsx:328` | Medium | Reject | None (ngoài phạm vi yêu cầu gỡ cụm footer; bề mặt sẵn có đọc từ `user.email` do Better Auth kiểm định) |

### Whole-Plan Consistency Sweep (Red Team)
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-verification-visual-docs.md`
- Decision deltas checked: 5
- Reconciled stale references: 5 (`caller duy nhất`, nhãn `JourneyNextStopHero`, phạm vi dòng `442-542`, cơ chế chụp POT sạch PII + revert 9 PNG, mục `Lệch có chủ đích` trong `DESIGN.md`)
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-11-26
**Trigger:** `ak-vibe` Step 4 plan validation gate (Light tier — 2 phases)
**Questions asked:** 0 (yêu cầu khoanh đỏ trên ảnh và chế độ `--ship --beta` đã rõ ràng, toàn bộ quyết định kỹ thuật đã xác minh từ mã nguồn và red-team)

### Verification Results
- **Tier:** Light (Fact Checker)
- **Claims checked:** 24
- **Verified:** 24 | **Failed:** 0 (2 sai lệch phát hiện trong red-team — caller test thứ 2 của `ClassInfoCard` và nhãn `"Buổi tiếp theo"` của `JourneyNextStopHero` — đã được đối chiếu và sửa đồng bộ; tracking issue `#1013` đã gắn cho 4 ảnh POT) | **Unverified:** 0

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-verification-visual-docs.md`
- Decision deltas checked: 5
- Reconciled stale references: 0 (đã đồng bộ xong ở lượt Red Team)
- Unresolved contradictions: 0

<!-- slug: remove-redundant-class-info-footer -->
