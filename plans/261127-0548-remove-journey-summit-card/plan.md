---
title: "Remove JourneySummitCard from student class detail journey tab"
description: "Remove the entire JourneySummitCard ('Đích đến của bạn') top card from ClassLessonList on /classes/$classId"
status: completed
priority: P1
effort: "1h"
tags: [student, ui, cleanup]
created: 2026-11-27
---

# Remove JourneySummitCard from student class detail journey tab

## Overview

Trên trang chi tiết lớp học viên (`/classes/$classId`), tab **Hành trình học** (`ClassLessonList`, `apps/student/src/components/class/class-lesson-list.tsx`) hiện đang render thẻ `JourneySummitCard` (`apps/student/src/components/class/journey-summit-card.tsx`) ở đầu tab gồm:
- Khối bên trái: nhãn `"Đích đến của bạn"`, biểu tượng `Mountain`, `classLevel` (ví dụ `"Band 6.5"`), tên/mô tả giáo trình (`syllabus.name`, `syllabus.description`), ngày `"Về đích dự kiến"` / `"Hoàn thành ngày"`.
- Bộ đếm bên phải: `{clearedModulesCount}/{totalModulesCount} chặng đã vượt` hoặc `{heldCount}/{totalTeachingCount} buổi đã diễn ra`.
- Thanh tiến độ phía dưới: `{pct}% hành trình · Bạn đang ở trước buổi {nextTeachingIndex}` và `{heldCount}/{totalTeachingCount} buổi`.

Theo xác nhận của người dùng (Phương án 1), gỡ bỏ toàn bộ thẻ `JourneySummitCard` này:
- Tiến độ buổi học đã hiển thị sẵn ở vòng tròn `RingStat` `"Buổi học"` (`{held}/{totalSessions}`) phía trên `<Tabs>`.
- Các chặng/module giáo trình vẫn giữ nguyên ở phần `"Lộ trình chinh phục"` (`journey-module-*`).
- Tab `"Hành trình học"` bắt đầu thẳng bằng `JourneyNextStopHero` (`"Buổi tiếp theo"` / thẻ hoàn thành khi hết buổi) hoặc `"Lộ trình chinh phục"` (khi lớp tạm dừng hoặc chưa có buổi có ngày).
- **Đánh đổi được chấp nhận có chủ đích:** `syllabus.name` và ngày về đích dự kiến không còn hiển thị riêng ở đầu tab `"Hành trình học"`.

## Scope & Constraints

- **Outcome:** Xoá hoàn toàn `JourneySummitCard` (`apps/student/src/components/class/journey-summit-card.tsx`) và toàn bộ props/helper/tính toán chết liên quan trong `ClassLessonList` và `ClassDetailView`, cập nhật unit/component/E2E tests, đồng bộ `DESIGN.md` và `CHANGELOG.md`.
- **Constraints:**
  - Không sửa `ClassInfoCard` (`apps/student/src/components/class/class-info-card.tsx`), `RingStat`, `TodoBanner`, `ClassAssignmentsTab`, `ClassMaterialsTab`, `SessionDetailView`, API contracts (`GET /api/student/classes/:classId`), `docs/_reverse/*`, `open-design/*`, hoặc `package.json` version (`0.0.29`).
  - Giữ lại `Mountain` trong `class-lesson-list.tsx` (vẫn dùng ở `lessonKind === "final"`) và `formatVietnamFullDate` trong `vietnam-display-date.ts` (vẫn dùng ở `class-info-card.tsx`).
  - Không chạy full E2E ở local (chỉ chạy targeted E2E theo `AGENTS.md`).
  - Chụp 4 ảnh POT sạch PII (dữ liệu synthetic `@test.local`/`@e2e.local`, `http://localhost:<port>`) + kiểm tra reflow `320px`, Light/Dark reload và `Tab` focus theo `REVIEW.md`.
- **Non-goals:** Không thay đổi cấu trúc các module trong `"Lộ trình chinh phục"` (`journey-module-*`), không thay đổi backend/API.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Remove JourneySummitCard and dead code (TDD)](./phase-01-remove-summit-card-tdd.md) | Completed |
| 2 | [Phase 2: Verification, Visual Audit, POT & Docs](./phase-02-verify-visual-pot-docs.md) | Completed |

## Success Criteria

- [x] Xoá file `apps/student/src/components/class/journey-summit-card.tsx`; `ClassLessonList` không còn render `JourneySummitCard` (`journey-syllabus-header`, `"Đích đến của bạn"`, `"chặng đã vượt"`, `"buổi đã diễn ra"`, `role="progressbar"`).
- [x] Dọn sạch mã chết trong `class-lesson-list.tsx` (`isModuleCleared`, `ModuleGroup.heldCount`, props `classLevel`/`className`, `totalTeachingCount`, `lastDatedISO`, `namedGroups`, `clearedModulesCount`) và gỡ `classLevel`/`className` khỏi caller `class-detail-view.tsx`.
- [x] `JourneyNextStopHero`, `"Lộ trình chinh phục"`, `journey-module-*`, `RingStat` (`Buổi học`) và `Mountain` icon cho buổi `final` hoạt động nguyên vẹn.
- [x] Toàn bộ gates pass: `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`, targeted E2E (`specs/student-class-detail.spec.ts`, `specs/student-session-detail.spec.ts`), `pnpm design:compare --screens s-class-detail --force` (hoặc `--side app --force`), không lọt PNG lịch sử ngoài phạm vi.
- [x] `DESIGN.md` và `CHANGELOG.md` được cập nhật đồng bộ; 4 ảnh POT sạch PII (`1440×900` Light/Dark, `768×1024`, `375×812`) + `320px` reflow + Light/Dark reload + `Tab` focus đạt chuẩn `REVIEW.md`.

## Red Team Review

### Session 1 — 2026-11-27
**Reviewer:** `code-reviewer` subagent (Light tier — Validate & Red Team)
**Findings:** 0 Critical, 3 Important, 3 Minor
- **Important 1:** Cập nhật assertion `expect(screen.getByText("IELTS Reading Intensive")).toBeTruthy()` tại `apps/student/test/class-detail.test.tsx:356` — đã đưa vào Phase 1.
- **Important 2:** Gỡ props `classLevel`/`className` ở `class-lesson-list.test.tsx:848-849` (tránh lỗi TS2322), bổ sung `queryByTestId("journey-module-m1")` vào test fallback legacy dòng 820 (tránh false-green), và dọn phantom assertion `/Về đích dự kiến/` dòng 1176/1204 — đã đưa vào Phase 1.
- **Important 3:** E2E không chạy trên `develop` nên targeted E2E local ở Phase 2 là bắt buộc; đồng thời đối chiếu `origin/main` xác nhận `#1010` đã nằm trên `main` (`v0.0.29`), chú ý giữ sạch `CHANGELOG.md` và `DESIGN.md` khi cherry-pick lên `main`.
- **Minor 1–3:** Rút gọn `datedLessons` thành `hasDatedLessons = teachingLessons.some(...)` trong `class-lesson-list.tsx`; tách rõ số `1/2 buổi` vs `1/1 buổi` giữa các fixture test; scope selector E2E vào section `"Buổi học"`; tạo mới `### Removed` dưới `## 2026-11-27` trong `CHANGELOG.md`; gắn issue `#1027` cho tên file POT.

## Validation Log

### Session 1 — 2026-11-27
- `ak plan validate ./plans/261127-0548-remove-journey-summit-card`: `[OK] valid plan directory`.
- `code-reviewer` xác minh toàn bộ file paths, line numbers, callers (`class-detail-view.tsx`, `session-detail-view.tsx`, `class-info-card.tsx`), icon `Mountain`, helper `formatVietnamFullDate`, `scripts/design-compare`, và E2E specs khớp mã nguồn thực tế. Không còn mâu thuẫn chưa giải quyết.

<!-- slug: remove-journey-summit-card -->
