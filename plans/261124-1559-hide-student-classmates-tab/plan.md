---
title: "Ẩn tab Bạn cùng lớp ở role student"
description: "Ẩn tab 'Bạn cùng lớp' khỏi giao diện chi tiết lớp học của học viên (ClassDetailView), đồng bộ unit test và E2E spec, giữ nguyên API/component để dễ khôi phục khi cần."
status: completed
priority: P1
effort: "1h"
tags: [ui, student, class-detail, e2e]
created: 2026-11-24
---

# Ẩn tab "Bạn cùng lớp" ở role student

## Overview

Hiện tại trên trang chi tiết lớp học của ứng dụng học viên (`apps/student/src/components/class/class-detail-view.tsx`), thanh tab (`CLASS_TABS`) đang hiển thị 4 mục: **Hành trình học**, **Bài tập**, **Giáo trình**, và **Bạn cùng lớp**. Theo yêu cầu sản phẩm, cần ẩn hoàn toàn tab **"Bạn cùng lớp"** ở role student trên cả môi trường staging (`develop`) và production (`main`).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Gỡ tab `"Bạn cùng lớp"` (`id: "classmates"`) khỏi `CLASS_TABS` và không render `<ClassmatesTab>` trong `ClassDetailView` (`apps/student/src/components/class/class-detail-view.tsx`) | P1 |
| 2 | Cập nhật unit test (`apps/student/test/class-detail.test.tsx`) xác nhận chỉ render 3 tab và không xuất hiện `"Bạn cùng lớp"` hay `class-tab-classmates`, không phát sinh gọi `useClassmates` khi chuyển qua lại 3 tab | P1 |
| 3 | Cập nhật E2E spec (`apps/e2e/specs/student-classmates.spec.ts`) xác nhận tab `"Bạn cùng lớp"` ẩn trên trang chi tiết lớp học viên, 3 tab còn lại hoạt động bình thường, không phát sinh request `/classmates`, không lộ tên học viên khác trên DOM, kèm POT 3 viewport (light + dark) | P1 |

## Scope & Non-Goals

### In Scope
- `apps/student/src/components/class/class-detail-view.tsx`: gỡ entry `{ id: "classmates", label: "Bạn cùng lớp" }` khỏi `CLASS_TABS`, gỡ import `ClassmatesTab` và nhánh render `{tab === "classmates" && <ClassmatesTab classId={cls.id} />}`.
- `apps/student/test/class-detail.test.tsx`: cập nhật test `renderToStaticMarkup` từ 4 tab sang 3 tab (`Hành trình học`, `Bài tập`, `Giáo trình`) kèm assertion phủ định `"Bạn cùng lớp"` và `class-tab-classmates`; thêm test JSDOM `render(...)` xác nhận `getAllByRole("tab")` dài 3, `queryByRole("tab", { name: "Bạn cùng lớp" }) === null`, điều hướng bàn phím / click qua 3 tab hoạt động bình thường và không gọi `useClassmates`.
- `apps/e2e/specs/student-classmates.spec.ts`: chuyển spec sang xác minh tab `"Bạn cùng lớp"` bị ẩn hoàn toàn trên trang chi tiết lớp học viên, tên học viên khác (`mateName`, `invitedOnlyName`) và `classmates-grid`/`classmate-card` không xuất hiện trên DOM, 3 tab còn lại (`Hành trình học`, `Bài tập`, `Giáo trình`) chuyển đổi bình thường, và không có request GET `/api/student/classes/*/classmates` phát sinh từ trang chi tiết lớp.
- `apps/student/src/components/class/classmates-tab.tsx`: thêm ghi chú ngắn nêu rõ component đang được giữ nguyên (không mount từ `ClassDetailView`) để dễ bật lại khi cần.

### Out of Scope / Non-Goals
- Giữ nguyên backend endpoint `GET /api/student/classes/:classId/classmates` (`apps/server/src/routes/student-classmates.ts`), contract `classmatesResponseSchema` (`packages/api/src/contracts.ts`), hook `useClassmates` (`apps/student/src/lib/repos/student.ts`), component `ClassmatesTab` (`apps/student/src/components/class/classmates-tab.tsx`), `AvatarInitials` (`apps/student/src/components/ui/avatar-initials.tsx`) và các unit test độc lập của chúng (`student-classmates.test.ts`, `classmates-tab.test.tsx`, `class-primitives.test.tsx`) để dễ bật lại sau khi sản phẩm cần.
  - **Trust Boundary Caveat (xác nhận bởi người dùng, tương tự tiền lệ #852):** Phạm vi thay đổi này chỉ ẩn ở lớp giao diện (`ClassDetailView`), **không** khóa endpoint `GET /api/student/classes/:classId/classmates` ở server. Học viên đang ghi danh `active` vào lớp vẫn có thể gọi trực tiếp API này để nhận `{ id, name, initials, isMe }` (không có email/SĐT/điểm/học phí). Nếu sau này có yêu cầu đóng quyền riêng tư ở lớp API, cần gỡ mount/chặn route `studentClassmatesRoutes` ở `apps/server/src/app.ts`.
- Không đụng giao diện quản lý học viên phía giáo viên (`apps/web`).
- Không thay đổi đáp án trắc nghiệm `"Bạn cùng lớp"` trong bài test mẫu `apps/e2e/specs/student-quiz-take-review.spec.ts` (đó là nội dung đề thi tiếng Anh).
- Giao hàng lên `main` (`--both` Stage 2): mở PR riêng từ nhánh sạch tách từ `origin/main` chỉ chứa thay đổi ẩn tab này (giống tiền lệ PR `#857`), không gộp 2 commit không liên quan (`#910`, `#911`) đang ở `develop`.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Ẩn tab Bạn cùng lớp, cập nhật TDD tests và E2E](./phase-01-start.md) | Pending |

## Success Criteria

- [x] `ClassDetailView` chỉ hiển thị đúng 3 tab: `"Hành trình học"`, `"Bài tập"`, `"Giáo trình"`; không có tab `"Bạn cùng lớp"` hay `data-testid="class-tab-classmates"`.
- [x] Không có lời gọi API `/api/student/classes/:classId/classmates` khi học viên mở và chuyển qua lại đủ 3 tab trên trang chi tiết lớp; tên học viên cùng lớp (`mateName`, `invitedOnlyName`) không hiển thị trên DOM.
- [x] Unit tests `apps/student/test/class-detail.test.tsx` (19/19), toàn bộ `pnpm --filter student test` (64 files, 622/622 tests) và `apps/server/src/routes/student-classmates.test.ts` (6/6) pass 100%.
- [x] Lint (`pnpm exec biome check .`) và typecheck (`pnpm check-types`, 14/14 tasks) pass 100%.
- [x] E2E spec lẻ `apps/e2e/specs/student-classmates.spec.ts` (1/1) và `apps/e2e/specs/student-class-detail.spec.ts` (4/4) pass xanh, không chứa lệnh ghi screenshot bẩn vào repo.
- [x] Kiểm chứng UI theo `REVIEW.md` / `AGENTS.md`: 3 viewport (`1440×900`, `768×1024`, `375×812`) + `320px` reflow không tràn ngang (`scrollWidth <= clientWidth`), keyboard focus (`Tab` + `Enter`), cả light và dark theme, lưu 4 ảnh POT sạch PII vào `plans/reports/`.

## Red Team Review

### Session — 2026-11-24
**Reviewers:** Security Adversary (Fact Checker) + Assumption Destroyer (Fact Checker)
**Findings:** 4 merged findings (4 accepted, 0 rejected)
**Severity breakdown:** 0 Critical, 3 High, 1 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Trust boundary API `/api/student/classes/:classId/classmates` vẫn mở & lập luận rolling deploy sai cho dead code frontend | High | Accept (user confirmed UI-only + explicit caveat) | `plan.md`, `phase-01-start.md`, `classmates-tab.tsx` |
| 2 | Trộn `renderToStaticMarkup` với `screen.*` và phantom TDD assertion cho `useClassmates` | High | Accept | `phase-01-start.md` |
| 3 | Thiếu gate `REVIEW.md` (dark mode, 320px reflow, keyboard focus, `design:compare`, tách chụp POT khỏi E2E spec) | High | Accept | `plan.md`, `phase-01-start.md` |
| 4 | E2E thiếu kiểm chứng click 3 tab, thiếu check không lộ tên học viên khác, thiếu `E2E_LMS_PORT` và thiếu chạy `student-class-detail.spec.ts` | Medium | Accept | `plan.md`, `phase-01-start.md` |

## Validation Log

### Session 1 — 2026-11-24
- **Verification Results:** `ak plan validate` = valid (`Failed: 0`); toàn bộ file path, symbol và line number (`class-detail-view.tsx:23,54,371`, `class-detail.test.tsx:258-342`, `student-classmates.spec.ts`, `playwright.config.ts:8-12`, `screens.json:278-296`) đã được fact-check khớp 100%.
- **Decisions Confirmed (via `ask_question`):**
  1. **Trust boundary & dead code:** Chỉ ẩn trên UI (gỡ tab khỏi `ClassDetailView`), giữ nguyên API `GET /api/student/classes/:classId/classmates` & `ClassmatesTab` để dễ bật lại sau, ghi rõ trust-boundary caveat.
  2. **Chiến lược `--both` Stage 2 (`main`):** Mở PR riêng từ nhánh sạch tách từ `origin/main` chỉ chứa thay đổi ẩn tab này (giống tiền lệ PR `#857`), không gộp `#910`/`#911` từ `develop`.
- **Whole-Plan Consistency Sweep:** Passed — `plan.md` và `phase-01-start.md` thống nhất phạm vi, tiêu chí nghiệm thu, lệnh chạy E2E và yêu cầu POT.

<!-- slug: hide-student-classmates-tab -->
