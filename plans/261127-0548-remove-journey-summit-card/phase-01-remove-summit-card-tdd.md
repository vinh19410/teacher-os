---
phase: 1
title: "Phase 1: Remove JourneySummitCard and dead code (TDD)"
status: completed
priority: P1
effort: "30m"
dependencies: []
---

# Phase 1: Remove JourneySummitCard and dead code (TDD)

## Overview

Thực hiện gỡ bỏ toàn bộ `JourneySummitCard` và các props/tính toán chết liên quan theo chu trình TDD Red → Green.

## Files to Modify / Delete

- Modify (Red tests first): `apps/student/src/components/class/class-lesson-list.test.tsx`
- Modify (Red tests first): `apps/student/src/components/class/class-detail-view.test.tsx`
- Modify (Red tests first): `apps/student/test/class-detail.test.tsx`
- Delete: `apps/student/src/components/class/journey-summit-card.tsx`
- Modify: `apps/student/src/components/class/class-lesson-list.tsx`
- Modify: `apps/student/src/components/class/class-detail-view.tsx`

## Requirements

- [ ] **TDD Red:** Cập nhật 3 file unit/component test trước khi sửa code production:
  - `apps/student/src/components/class/class-lesson-list.test.tsx`: thay thế test `"Summit card nhất quán tiến độ held..."` (dòng 844–905, gỡ props `classLevel`/`className` ở dòng 848–849) để assert `JourneySummitCard` (`journey-syllabus-header`, `"Đích đến của bạn"`, `"chặng đã vượt"`, `"buổi đã diễn ra"`, `/% hành trình/`, `/Về đích dự kiến/`, `/Hoàn thành ngày/`, `role="progressbar"`) không còn render ở trạng thái bình thường, paused, và completed; giữ assertions cho `journey-next-hero`, `"Lộ trình chinh phục"`, `journey-module-m1` (`1/2 buổi` với fixture 1 completed + 1 absent), `journey-module-m2` (`0/1 buổi`), `journey-module-__extra__`. Ngoài ra, bổ sung `expect(screen.queryByTestId("journey-module-m1")).toBeNull()` vào test fallback legacy (dòng 820) để tránh false-green, và dọn tên/assertion phantom `/Về đích dự kiến/` ở test legacy (dòng 1176, 1204).
  - `apps/student/src/components/class/class-detail-view.test.tsx`: ở dòng 227–229, thay assertion `journey-syllabus-header` bằng negative assertions (`queryByTestId("journey-syllabus-header")`, `queryByText("Đích đến của bạn")`, `queryByRole("progressbar")` là `null`), giữ assertions `journey-next-hero` và `journey-module-mod-1` (`1/2 buổi`).
  - `apps/student/test/class-detail.test.tsx`: thêm negative assertions ở dòng 257–303 (`not.toContain` cho `"Đích đến của bạn"`, `"chặng đã vượt"`, `"Về đích dự kiến"`, `'role="progressbar"'`), và ở dòng 356 thay `getByText("IELTS Reading Intensive")` bằng `queryByText("IELTS Reading Intensive")` là `null` cùng negative assertions `journey-syllabus-header` / `"Đích đến của bạn"`, giữ `Module 1: Skimming` (`1/1 buổi`), `Module 2: Scanning` (`0/4 buổi`).
  - Chạy `pnpm --filter student test` xác nhận lỗi đúng kỳ vọng.
- [ ] **TDD Green:**
  - Xoá `apps/student/src/components/class/journey-summit-card.tsx`.
  - Sửa `apps/student/src/components/class/class-lesson-list.tsx`: bỏ import `JourneySummitCard` (giữ `Mountain`), bỏ `isModuleCleared`, bỏ `ModuleGroup.heldCount`, bỏ props `classLevel`/`className`, bỏ `totalTeachingCount`/`lastDatedISO`/`namedGroups`/`clearedModulesCount`, rút gọn `datedLessons` thành `const hasDatedLessons = teachingLessons.some((l) => l.date != null);`, bỏ `<JourneySummitCard ... />` khỏi JSX.
  - Sửa `apps/student/src/components/class/class-detail-view.tsx`: bỏ `classLevel={cls.level}` và `className={cls.name}` ở `<ClassLessonList />`.
  - Không đụng `apps/student/src/lib/vietnam-display-date.ts` (`formatVietnamFullDate` vẫn dùng ở `class-info-card.tsx`).
- [ ] Chạy `pnpm --filter student test` xác nhận 100% test pass.
