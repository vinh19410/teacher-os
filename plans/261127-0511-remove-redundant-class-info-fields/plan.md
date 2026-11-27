---
title: "Remove redundant Khoá and Số buổi đã học items from student ClassInfoCard"
description: "Remove the redundant Khoá (level) and Số buổi đã học (held/total) items and dead props/imports from ClassInfoCard on /classes/$classId"
status: completed
priority: P1
effort: "1h"
tags: [student, ui, cleanup]
created: 2026-11-27
---

# Remove redundant Khoá and Số buổi đã học items from student ClassInfoCard

## Overview

Trên trang chi tiết lớp học viên (`/classes/$classId`), thẻ thông tin chung của lớp (`ClassInfoCard`, `apps/student/src/components/class/class-info-card.tsx:40-104`) hiện render 6 mục trong lưới `<dl>` 2→4 cột: `Khoá`, `Lịch`, `Hình thức`, `Giáo viên`, `Số buổi đã học`, và `Khai giảng`. Hai mục được người dùng gạch đỏ trên ảnh chụp màn hình là dư thừa:
- **`Khoá`** (`cls.level`, ví dụ `Band 6.5`): đã được hiển thị tại thẻ đích đến `JourneySummitCard` ("Đích đến của bạn", `apps/student/src/components/class/journey-summit-card.tsx:37-38, 70-72`) khi lớp có ít nhất 1 buổi học, và trên thẻ `ClassCard` ở trang Tổng quan (`/`) & Lớp học (`/classes`).
- **`Số buổi đã học`** (`{held}/{totalSessions} buổi`): trùng trực tiếp với thẻ `RingStat` đầu tiên ngay bên dưới (`Buổi học` / `Buổi đã diễn ra`, `apps/student/src/components/class/class-detail-view.tsx:356-363`) và bộ đếm `{heldCount}/{totalTeachingCount} buổi` trên `JourneySummitCard` (`apps/student/src/components/class/journey-summit-card.tsx:128-130`).

Sau khi gỡ 2 mục này, `ClassInfoCard` còn tối đa 4 mục (`Lịch`, `Hình thức`, `Giáo viên`, `Khai giảng`), xếp gọn thành 1 hàng 4 cột trên `md+` (`md:grid-cols-4`) và 2×2 trên mobile (`grid-cols-2`), đồng thời loại bỏ 2 prop chết (`held`, `totalSessions`) cùng 2 icon import không còn dùng (`BookOpen`, `ClipboardCheck`).

- **Đánh đổi được chấp nhận có chủ đích:** <!-- Updated: Red Team Session 2026-11-27 - clarify 0-lesson empty state trade-off -->
  - Khi học viên chuyển sang tab phụ (`?tab=assignments`, `?tab=materials`) hoặc khi lớp chưa có buổi học nào (`lessons.length === 0`, `ClassLessonList` trả sớm `<OverviewEmptyState />` trước `JourneySummitCard`), `cls.level` không còn hiển thị trên `/classes/$classId` (vẫn hiện trên `ClassCard` ở `/` và `/classes`).
  - Số buổi đã học vẫn luôn hiển thị tại vòng `RingStat` đầu tiên (`Buổi học` / `Buổi đã diễn ra`) ở mọi tab và mọi trạng thái lớp.

## Scope & Constraints

- **Outcome:** Gỡ hoàn toàn 2 mục `Khoá` và `Số buổi đã học` cùng props/imports thừa (`held`, `totalSessions`, `BookOpen`, `ClipboardCheck`) khỏi `ClassInfoCard`, giữ nguyên 4 mục còn lại (`Lịch`, `Hình thức`, `Giáo viên` + `mailto:`, `Khai giảng`), 4 vòng `RingStat`, và 3 tab bên dưới.
- **Constraints:**
  - Không đổi API contract `GET /api/student/classes/:classId` hay schema `class`.
  - Không đổi `JourneySummitCard` (`classLevel` vẫn được truyền từ `ClassDetailView` -> `ClassLessonList`), `RingStat` (`stats.held`/`stats.totalSessions` vẫn được tính và truyền nguyên vẹn), `ClassCard` (overview), hay `EditClassModal` (phía giáo viên).
  - Đạt chuẩn `REVIEW.md` & `DESIGN.md`: 3 viewport (`1440×900`, `768×1024`, `375×812`) + `320px` reflow (`0px` tràn ngang) + Light/Dark (qua `ThemeToggle` + reload giữ `localStorage.theme`) + keyboard focus `Tab`.
  - Ảnh POT chụp trên stack E2E/seed cô lập sạch PII thật (`@test.local` / `@e2e.local`, bind loopback `E2E_HOSTNAME=127.0.0.1`), không ghi đè các file PNG lịch sử đang tracked ngoài phạm vi và không ghi rò ra ngoài worktree do đường dẫn UTF-8.
- **Non-goals:** Không sửa `apps/student/src/components/overview/class-card.tsx`, không sửa `apps/student/src/components/class/journey-summit-card.tsx`, không sửa `apps/web/src/components/modals/edit-class-modal.tsx`, không sửa `docs/_reverse/*`, không đổi cấu trúc lưới `<dl>`, kiểu `truncate`, hay hành vi `mailto:` sẵn có.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Gỡ 2 mục `Khoá` và `Số buổi đã học` cùng props/imports chết khỏi `ClassInfoCard` theo chu trình TDD | P1 |
| 2 | Sửa lỗi đường dẫn `fileURLToPath` trên worktree UTF-8, mở rộng `seedQuizFixture` + `student-class-detail.spec.ts` (kèm cờ opt-in `CAPTURE_POT=1`), đồng bộ `DESIGN.md`, chạy gates + targeted E2E + `design:compare` + soi 4 ảnh POT sạch PII | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Remove redundant items and dead props from ClassInfoCard (TDD)](./phase-01-start.md) | Pending |
| 2 | [Phase 2: E2E Coverage, Verification, Visual Audit, POT & Docs](./phase-02-verification-visual-docs.md) | Pending |

## Success Criteria

- [x] `ClassInfoCard` (`apps/student/src/components/class/class-info-card.tsx`) chỉ còn tối đa 4 mục trong lưới `<dl>` (`Lịch`, `Hình thức`, `Giáo viên` + `mailto:`, `Khai giảng`); không còn render nhãn/giá trị `Khoá` hay `Số buổi đã học`.
- [x] Props thừa (`held`, `totalSessions`) và icon imports không dùng (`BookOpen`, `ClipboardCheck`) được gỡ sạch khỏi `ClassInfoCard`; cả hai caller (`apps/student/src/components/class/class-detail-view.tsx` và `apps/student/test/class-detail.test.tsx`) đều đã cập nhật.
- [x] `RingStat` (`Buổi học` / `Buổi đã diễn ra`) và `JourneySummitCard` (`destinationTitle` từ `cls.level` và `{heldCount}/{totalTeachingCount} buổi`) hoạt động nguyên vẹn.
- [x] Toàn bộ gates pass: `pnpm exec biome check .`, `pnpm check-types`, `pnpm --filter student test`, `pnpm test`, targeted E2E `specs/student-class-detail.spec.ts` (đã sửa `fileURLToPath`, seed đủ `classMeta` với lịch khác `18:30`, assert cả negative trên `infoCard` lẫn positive trên `JourneySummitCard`/`RingStat`), và `pnpm design:compare --screens s-class-detail --force` (hoặc `--side app --force`), không lọt PNG lịch sử hay thư mục percent-encoded ngoài worktree.
- [x] 4 ảnh POT sạch PII (`plans/reports/${POT_PREFIX}-class-info-card-{desktop,dark,tablet,mobile}.png`, với `POT_PREFIX` là số GitHub issue tạo trước khi triển khai) + `320px` reflow (`0px` tràn ngang) + toggle Light/Dark giữ qua reload (`localStorage.theme`) + kiểm tra `Tab` focus đạt chuẩn `REVIEW.md`, đã kiểm tra trực quan bằng `read_file`, và `DESIGN.md` được cập nhật đồng bộ.

## Red Team Review

### Session — 2026-11-27
**Reviewers:** Security Adversary (`code-reviewer`) + Assumption Destroyer (`code-reviewer`) — Light tier (2 phases, Fact Checker role)
**Findings:** 6 unique (5 accepted, 1 rejected)
**Severity breakdown:** 1 Critical, 3 High, 2 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Đường dẫn worktree có dấu tiếng Việt làm `new URL(...).pathname` (không bọc `fileURLToPath`) percent-encode sai đích DB (`helpers-quiz.ts:87`) và ghi rò ảnh chụp ra ngoài worktree (`student-class-detail.spec.ts:331-334`) | Critical | Accept | Phase 2, `plan.md` |
| 2 | `seedQuizFixture` mở rộng `classMeta?` cần allowlist cột tĩnh + tham số `?`, giữ default DB `mode = "Online"` & cột `start_date`; E2E cần chốt `schedule` khác `"18:30"` và assert positive cho `JourneySummitCard`/`RingStat` để tránh false-pass | High | Accept | Phase 2, `plan.md` |
| 3 | DOM test `class-detail-view.test.tsx:122-139` va chạm duplicate text nodes (`"1/2"`, `"Buổi học"`), và static HTML test `class-detail.test.tsx` cần neo `"Buổi đã diễn ra"` để tránh false-pass cho `RingStat` | High | Accept | Phase 1 |
| 4 | Dựng stack E2E riêng chụp POT dễ lộ `/__e2e/*` qua wildcard `::`, lệch single-origin `E2E_LMS_PORT`, dễ sai key `localStorage` (`"theme"` chứ không phải `"teacher-os-theme"`), và thiếu định nghĩa `POT_PREFIX` cho `<issue>` | High | Accept | Phase 2, `plan.md` |
| 5 | `plan.md` và ghi chú `DESIGN.md` bỏ sót đánh đổi với lớp 0 buổi (`lessons.length === 0`, `ClassLessonList` return `<OverviewEmptyState />` trước `JourneySummitCard`) và giới hạn phạm vi của `design:compare` (`design-seed.ts` không seed `level`) | Medium | Accept | `plan.md`, Phase 2 |
| 6 | `href={\`mailto:${teacherEmail}\`}` tại `class-info-card.tsx:51, 78-85` chưa lọc tham số URI/RFC 6068 | Medium | Reject | None (ngoài phạm vi yêu cầu gỡ 2 mục thừa; giống tiền lệ `#1013`, `user.email` do Better Auth + allowlist `TEACHER_EMAILS` kiểm soát) |

### Whole-Plan Consistency Sweep (Red Team)
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-verification-visual-docs.md`
- Decision deltas checked: 5
- Reconciled stale references: 5 (`fileURLToPath` cho worktree UTF-8, allowlist SQL + `mode="Online"` + lịch khác `18:30` + positive assertions, container scoped cho `RingStat`/`JourneySummitCard`, chụp POT opt-in loopback kèm `ThemeToggle`/`localStorage.theme` + `POT_PREFIX`, đánh đổi lớp 0 buổi + phạm vi `design:compare`)
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-11-27
**Trigger:** `ak-vibe` Step 4 plan validation gate (Light tier — 2 phases)
**Questions asked:** 0 (yêu cầu gạch đỏ 2 mục `Khoá` và `Số buổi đã học` trên ảnh cùng chế độ `--ship --both` đã rõ ràng, toàn bộ quyết định kỹ thuật đã xác minh từ mã nguồn và Red Team)

### Verification Results
- **Tier:** Light (Fact Checker)
- **Claims checked:** 26
- **Verified:** 26 | **Failed:** 0 | **Unverified:** 0

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-verification-visual-docs.md`
- Decision deltas checked: 5
- Reconciled stale references: 0 (đã đồng bộ xong ở lượt Red Team)
- Unresolved contradictions: 0

<!-- slug: remove-redundant-class-info-fields -->
