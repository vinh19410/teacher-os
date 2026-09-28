---
title: "Hồ sơ học viên hiển thị lớp học thay vì gói học"
description: "Tab Hồ sơ của chi tiết học viên bỏ card Gói học, thay bằng card Lớp học liệt kê các lớp học viên đang tham gia."
status: completed
priority: P2
effort: 3h
issue: 245
tags: [feature, frontend, test]
branch: vinh19410/feat/student-profile-class-instead-of-package
blockedBy: []
blocks: []
created: 2026-09-22
---

# Hồ sơ học viên hiển thị lớp học thay vì gói học

## Overview

Tab "Hồ sơ" trong trang chi tiết học viên (`apps/web/src/routes/_auth/students/$studentId.tsx`) đang hiển thị card "Gói học" (tổng buổi, đã học, còn lại, đơn giá, hình thức, hạn dùng). Theo yêu cầu mới, card này được thay bằng card "Lớp học" liệt kê các lớp học viên đang tham gia — join ngay trong route từ `data.enrollments` + `data.classes` đã có sẵn trong kernel snapshot. Không đổi API, không đổi schema, không đổi display type `Student`. Các màn khác (danh sách học viên, Học phí, Dashboard) vẫn hiển thị gói như cũ.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Tab Hồ sơ hiển thị card "Lớp học": mỗi lớp là link tới class detail kèm meta (level · skills · mode); hỗ trợ nhiều lớp | P1 |
| 2 | Empty state "Chưa tham gia lớp học nào." khi học viên chưa thuộc lớp nào | P1 |
| 3 | Cập nhật E2E đang assert card "Gói học" trên detail; toàn bộ verification pass | P1 |

## Key Decisions

- **Join ở route component, không thêm field vào `Student`**: route đã gọi `useData()` và tự scope `lessons/invoices/assignments` theo `sid` — thêm `studentClasses` theo đúng pattern này. Tránh được việc sửa display type toàn cục (mock seeds, `data-store-reducer.ts`, mọi view đang dùng `pkg`/`hasPackage`).
- **Không đổi kernel/API**: snapshot (`GET /api/kernel`) đã chứa `enrollments` + `classes`.
- **Giữ coverage derive gói (#240 D1)** qua assertion trên hàng danh sách học viên (`"12 buổi · Online"`, `"500.000đ"`) thay vì trên detail.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Card Lớp học thay card Gói học trong tab Hồ sơ](./phase-01-profile-classes-card.md) | Completed |
| 2 | [Cập nhật E2E + verification](./phase-02-e2e-regression-verification.md) | Completed |

## Success Criteria

- [x] Trên detail học viên không còn text "Gói học"; card "Lớp học" liệt kê đúng mọi lớp đang tham gia (multi-class OK), tên lớp link tới `/classes/$classId`.
- [x] Học viên chưa có lớp thấy "Chưa tham gia lớp học nào."
- [x] `pnpm check-types`, `pnpm --filter web test`, `pnpm exec biome check apps/web/src apps/e2e/specs` pass.
- [x] 3 spec e2e liên quan pass: `student-package-without-class`, `student-package-validation`, `student-row-detail`.

## Dependencies

- Không có plan chặn. Ngữ cảnh: #240 đã derive gói từ lớp khi tạo học viên trong lớp; plan này chỉ đổi trình bày ở tab Hồ sơ.

## Out of Scope

- Xóa field `pkg`/`hasPackage` khỏi display type `Student` (còn dùng ở danh sách học viên, Học phí, Dashboard, reducer).
- Đổi bất kỳ endpoint/kernel route hay contract nào.
- Card gói ở danh sách học viên, trang Học phí, Dashboard.

## Validation Log

### Verification Results (Light tier — Fact Checker)

- Claims checked: 12
- Verified: 12 | Failed: 0 | Unverified: 0
- Tier: Light (2 phases)
- Bằng chứng chính:
  - `$studentId.tsx`: card "Gói học" 143–181, `useData()` dòng 67, filter 76–78, import `Progress` dòng 9, `fmtVND` còn dùng dòng 236 — khớp phase-01.
  - `repos/enrollments.ts`: passthrough `{id, classId, studentId, createdAt}` — khớp.
  - `mock-data.ts:149-166` (`ClassGroup`), `:242` (`classMeta`) — khớp.
  - `packages/db/src/schema/enrollment.ts`: `uniqueIndex("enrollment_class_student_uq").on(classId, studentId)` — khớp nhận định multi-class.
  - `students/index.tsx:103-116`: ô gói render `"${total} buổi · ${mode}"` + `fmtVND(price)` — khớp chiến lược assertion D1 qua list.
  - E2E: `student-package-without-class.spec.ts:34-40`, `student-package-validation.spec.ts:206-217` là 2 chỗ duy nhất assert "Gói học" trên detail; nav có item "Lớp học" (các spec dùng `.first()` khi click) — rủi ro strict-mode đã ghi trong phase-02.
- Interview: bỏ qua — session tự động, không còn decision point thật sự (text card, vị trí card, chiến lược test đều suy ra trực tiếp từ yêu cầu + pattern hiện hữu).
- Rủi ro đã ghi nhận: giá trị `sessionsTotal` do class modal quyết định → phase-02 dùng regex `/buổi · Online/` thay vì hard-code.

### Whole-Plan Consistency Sweep

- Link nội bộ: `plan.md` ↔ 2 phase files ↔ `plans/260922-0716-...` đều tồn tại; bảng Phases trỏ đúng tên file sau rename.
- Thuật ngữ thống nhất: header card "Lớp học", empty state "Chưa tham gia lớp học nào." — nhất quán xuyên suốt plan.md, phase-01, phase-02 và các assertion E2E.
- Out-of-scope rõ: `pkg`/`hasPackage` giữ nguyên cho list/tuition/dashboard/reducer — không phase nào đụng.
- Kết luận: không còn mâu thuẫn; plan đủ điều kiện implement.

## Red Team Review

### Adversarial Lenses (Security Adversary + Assumption Destroyer)

| # | Lens | Finding | Disposition | Codebase Evidence |
|---|------|---------|-------------|-------------------|
| 1 | Security Adversary | Đảm bảo `studentClasses` không rò rỉ lớp thuộc org/học viên khác | Accept (verified safe) | `apps/web/src/routes/_auth/students/$studentId.tsx:76-78`: `useData()` trả snapshot đã org-scoped; filter so sánh `e.studentId === studentId && e.classId === c.id` |
| 2 | Assumption Destroyer | Học viên có enrollment nhưng class đã bị xóa/không tồn tại | Accept (verified safe) | `data.classes.filter(...)` lặp trên `data.classes` hiện hữu, không ném lỗi nếu id rác |
| 3 | Assumption Destroyer | Test E2E conflict locator "Lớp học" với nav sidebar | Accept (addressed) | `apps/e2e/specs/student-package-validation.spec.ts`: không assert `getByText("Lớp học")` un-scoped; assert qua tên lớp và empty state |

### Whole-Plan Consistency Sweep
- Không còn mâu thuẫn giữa các file phase và plan overview.
- Các finding được xác nhận an toàn, không yêu cầu thay đổi thiết kế cốt lõi.
