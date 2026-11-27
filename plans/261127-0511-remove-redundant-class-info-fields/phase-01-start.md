---
phase: 1
title: "Phase 1: Remove redundant items and dead props from ClassInfoCard (TDD)"
status: completed
priority: P1
effort: "30m"
dependencies: []
---

# Phase 1: Remove redundant items and dead props from ClassInfoCard (TDD)

## Overview

Gỡ 2 mục `Khoá` (`cls.level`) và `Số buổi đã học` (`{held}/{totalSessions} buổi`) khỏi `ClassInfoCard` (`apps/student/src/components/class/class-info-card.tsx`), loại bỏ 2 prop chết (`held`, `totalSessions`) và 2 icon import không còn dùng (`BookOpen`, `ClipboardCheck`), đồng thời cập nhật cả hai caller (`class-detail-view.tsx` và `apps/student/test/class-detail.test.tsx`) theo chu trình TDD (Red -> Green -> Verify).

## Files to Modify

- Modify: `apps/student/src/components/class/class-info-card.tsx`
- Modify: `apps/student/src/components/class/class-detail-view.tsx`
- Modify: `apps/student/test/class-detail.test.tsx`
- Modify: `apps/student/src/components/class/class-detail-view.test.tsx`

## Requirements

- [x] Gỡ khối `<InfoItem icon={BookOpen} label="Khoá">` (`apps/student/src/components/class/class-info-card.tsx:59-63`) và khối `<InfoItem icon={ClipboardCheck} label="Số buổi đã học">` (`apps/student/src/components/class/class-info-card.tsx:93-95`).
- [x] Gỡ 2 import không còn dùng (`BookOpen`, `ClipboardCheck` tại `apps/student/src/components/class/class-info-card.tsx:4,6`).
- [x] Thu gọn props của `ClassInfoCard` (`apps/student/src/components/class/class-info-card.tsx:40-48`) từ `{ detail, held, totalSessions }` thành `{ detail }`, cập nhật JSDoc (`apps/student/src/components/class/class-info-card.tsx:35-39`) mô tả đúng 4 mục còn lại (`Lịch`, `Hình thức`, `Giáo viên`, `Khai giảng`).
- [x] Cập nhật đủ **cả hai caller** của `ClassInfoCard`:
  1. Production caller: `apps/student/src/components/class/class-detail-view.tsx:347-351` (chỉ truyền `detail={detail}`).
  2. Test caller: `apps/student/test/class-detail.test.tsx:415,439,462` (chỉ truyền `detail={...}`).
- [x] Bảo toàn nguyên vẹn 4 mục còn lại trong `ClassInfoCard` (`Lịch`, `Hình thức`, `Giáo viên` + `mailto:` + fallback `"Chưa có thông tin giáo viên."`, `Khai giảng`), 4 vòng `RingStat` (`apps/student/src/components/class/class-detail-view.tsx:355-390`), và `JourneySummitCard` (`apps/student/src/components/class/journey-summit-card.tsx`).

## Test Matrix (TDD)

<!-- Updated: Red Team Session 2026-11-27 - scope RingStat and JourneySummitCard DOM queries to avoid duplicate text collisions and RingStat static-HTML false-pass -->
1. **`ClassInfoCard` renders only 4 metadata items (Lịch, Hình thức, Giáo viên, Khai giảng) and omits Khoá & Số buổi đã học** (`apps/student/test/class-detail.test.tsx:413-428`):
   - Assert có đủ: `Lịch`, `T3 &amp; T6 · 19:00–20:30`, `Hình thức`, `Online`, `Giáo viên`, `Cô Lan`, `href="mailto:lan@example.com"`, `Khai giảng`, `Chủ Nhật, 01/03/2099`.
   - Assert KHÔNG render: `Khoá`, `Band 6.5`, `Số buổi đã học`, `2/5 buổi` (và vẫn giữ không có `Buổi tới:`, `/\d+\s*tháng/`, `border-t`, khung giờ `19:00–20:30` xuất hiện đúng 1 lần).
2. **`ClassInfoCard` structured JSON schedule & sparse/missing optional fields** (`apps/student/test/class-detail.test.tsx:430-472`):
   - Lịch JSON `'{"days":[1,4],"start":"19:00","end":"20:30"}'` format đúng thành `T3 &amp; T6 · 19:00–20:30` (1 lần) và không có `Khoá` / `Số buổi đã học`.
   - Lớp thưa (`level: ""`, `schedule: ""`, `mode: ""`, `startDate: ""`, `teacher: null`) vẫn render `"Chưa có thông tin giáo viên."`, không có `Khoá`, `Số buổi đã học`, `0/0 buổi`, `Lịch`, `Hình thức`, `Khai giảng`.
3. **`ClassDetailView` default render & scoped region assertions** (`apps/student/test/class-detail.test.tsx:257-303`, `apps/student/src/components/class/class-detail-view.test.tsx:122-139`):
   - Trong `ClassDetailView` static HTML (`class-detail.test.tsx:257-303`): không chứa `Khoá`, không chứa `Số buổi đã học`; vẫn chứa `Khai giảng`, `Chủ Nhật, 01/03/2099`, `Cô Lan`, đồng thời `JourneySummitCard` vẫn hiển thị `Band 6.5` và `2/5 buổi`, còn `RingStat` đầu tiên vẫn hiển thị nhãn duy nhất `"Buổi đã diễn ra"` (phân biệt với `"buổi đã diễn ra"` viết thường ở `JourneySummitCard`).
   - Trong `ClassDetailView` DOM test (`class-detail-view.test.tsx:122-139`):
     - `within(screen.getByRole("region", { name: "Thông tin lớp học" }))` chứa `Lịch`, `T3 & T6 · 19:00–20:30`, `Hình thức`, `1:1`, `Giáo viên`, `Thầy Minh`, `Khai giảng`, `Chủ Nhật, 01/11/2026` và KHÔNG chứa `Khoá`, `IELTS 6.5`, `Số buổi đã học`, hay `/\d+\/\d+\s*buổi/`.
     - Neo container `RingStat` đầu tiên qua nhãn duy nhất `screen.getByText("Buổi đã diễn ra").parentElement` để assert `within(sessionsRing).getByText("1/2")` và `within(sessionsRing).getByText("Buổi học")` (tránh va chạm duplicate node với `<h2 className="sr-only">Buổi học</h2>` và bộ đếm `1/2` của `JourneySummitCard`).
     - Neo `JourneySummitCard` qua container của `screen.getByText("Đích đến của bạn")` (`closest("div.rounded-xl")`) để assert `within(summitCard).getByText("IELTS 6.5")` và `within(summitCard).getByText("1/2 buổi")`.

## Implementation Steps

1. **Red (TDD):**
   - Cập nhật assertions trong `apps/student/test/class-detail.test.tsx` (dòng `268-276` và khối `describe("ClassInfoCard")` dòng `408-473`) và `apps/student/src/components/class/class-detail-view.test.tsx` (dòng `122-139`, dùng container scoped cho `infoCard`, `RingStat`, `JourneySummitCard`). Tạm giữ `held={...} totalSessions={...}` tại 3 lời gọi `<ClassInfoCard>` ở `class-detail.test.tsx:415,439,462` trong pha Red để component chưa sửa biên dịch và chạy fail thật vì vẫn render `Khoá` và `Số buổi đã học`.
   - Chạy `pnpm --filter student test test/class-detail.test.tsx src/components/class/class-detail-view.test.tsx` xác nhận test fail đúng lý do.
2. **Green:**
   - Sửa `apps/student/src/components/class/class-info-card.tsx`: gỡ 2 `<InfoItem>` (`Khoá`, `Số buổi đã học`), gỡ 2 icon import (`BookOpen`, `ClipboardCheck`), rút gọn props còn `{ detail: StudentClassDetail }`, cập nhật JSDoc.
   - Sửa cả hai caller: bỏ `held` và `totalSessions` tại `apps/student/src/components/class/class-detail-view.tsx:347-351` và `apps/student/test/class-detail.test.tsx:415,439,462`.
3. **Verify:**
   - Chạy `pnpm --filter student test`, `pnpm --filter student check-types`, `pnpm exec biome check apps/student`.

## Todo

- [x] Update assertions first (Red) in `apps/student/test/class-detail.test.tsx` and `apps/student/src/components/class/class-detail-view.test.tsx` (with scoped `RingStat` & `JourneySummitCard` containers)
- [x] Verify Red failure on student class detail unit/component tests
- [x] Remove `Khoá`, `Số buổi đã học`, unused imports (`BookOpen`, `ClipboardCheck`), and unused props (`held`, `totalSessions`) from `apps/student/src/components/class/class-info-card.tsx`
- [x] Remove `held` and `totalSessions` at both callers (`class-detail-view.tsx` and `class-detail.test.tsx`)
- [x] Run student tests, typecheck, and biome check (Green)

## Success Criteria

- `pnpm --filter student test`, `pnpm --filter student check-types`, và `pnpm exec biome check apps/student` đều pass 100%.
- Không còn nhãn/giá trị `Khoá` hay `Số buổi đã học` trong `ClassInfoCard`, không còn prop/import chết, trong khi `RingStat` và `JourneySummitCard` vẫn hiển thị đầy đủ tiến độ và band/level của lớp.
