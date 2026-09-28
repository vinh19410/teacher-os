---
title: "Danh sách học viên hiển thị lớp học thay vì gói học"
description: "Màn danh sách học viên bỏ 3 cột Gói/Còn lại/Đơn giá, thay bằng cột Lớp học liệt kê các lớp học viên đang tham gia — theo đúng pattern PR #245 ở tab Hồ sơ."
status: completed
priority: P2
effort: 3h
issue: 247
branch: vinh19410/feat/student-list-class-instead-of-package
tags: [feature, frontend, test]
blockedBy: []
blocks: []
created: 2026-09-22
---

# Danh sách học viên hiển thị lớp học thay vì gói học

## Overview

Màn danh sách học viên (`apps/web/src/routes/_auth/students/index.tsx`) đang hiển thị 3 cột derive từ gói: "Gói" (`total buổi · mode` / "Chưa có gói"), "Còn lại" (`remaining / total`), "Đơn giá" (`fmtVND(price)`). Theo yêu cầu "cũng thay gói thành lớp học" như #245 đã làm ở tab Hồ sơ, cả 3 cột gói được thay bằng 1 cột "Lớp học" liệt kê các lớp học viên đang tham gia — join `data.enrollments` + `data.classes` đã có sẵn trong kernel snapshot, tách thành helper dùng chung với route chi tiết. Không đổi API, không đổi schema, không đổi display type `Student`. Trang Học phí, Dashboard, global-search vẫn hiển thị gói như cũ.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Danh sách học viên: cột "Lớp học" thay 3 cột gói; mỗi lớp hiện tên + meta (level · skills · mode); hỗ trợ nhiều lớp | P1 |
| 2 | Học viên chưa thuộc lớp nào thấy "Chưa có lớp" tại cột Lớp học | P1 |
| 3 | Join enrollments×classes đứng ở 1 pure helper dùng chung; route chi tiết ($studentId) refactor dùng lại helper | P2 |
| 4 | E2E assert theo UI mới; toàn bộ verification pass | P1 |

## Key Decisions

- **Thay trọn bộ 3 cột gói, không chỉ cột "Gói"**: "Còn lại" và "Đơn giá" đều là chỉ số của gói — giữ lại mà mất cột "Gói" thì vô nghĩa (còn lại của cái gì?). #245 cũng thay toàn bộ card gói (tổng buổi, đã học, còn lại, đơn giá, hạn dùng) bằng card Lớp học; plan này làm đúng nguyên tắc đó ở cấp list.
- **Helper `classesByStudent` trong `apps/web/src/lib/repos/enrollments.ts`**: join enrollments×classes giờ cần ở 2 route (list + detail). Repos là nơi pure mapping theo convention hiện có (`mapStudents`, `mapEnrollments`); tránh nhân bản logic join.
- **Text thuần trong cell, không Link**: row list đã có onClick → detail học viên; link tới lớp nằm ở card Lớp học trên detail (giữ nguyên contract row→detail của `student-row-detail.spec.ts`, tránh xung đột click lồng nhau).
- **Không đổi display type `Student`**: `pkg`/`hasPackage` vẫn được Học phí, Dashboard, global-search, reducer sử dụng. `attentionCount` và lead "sắp hết gói" giữ nguyên (vẫn derive được, không thuộc yêu cầu).

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Cột Lớp học thay các cột gói trong danh sách học viên](./phase-01-list-classes-column.md) | Completed |
| 2 | [Cập nhật E2E + verification](./phase-02-e2e-regression-verification.md) | Completed |

## Success Criteria

- [x] Trên /students không còn text "Gói", "Còn lại", "Đơn giá", "Chưa có gói"; cột "Lớp học" liệt kê đúng mọi lớp đang tham gia (multi-class OK).
- [x] Học viên chưa có lớp thấy "Chưa có lớp" tại cột Lớp học.
- [x] Join enrollments×classes chỉ tồn tại 1 nơi (`classesByStudent`); `$studentId.tsx` dùng helper này.
- [x] `pnpm check-types`, `pnpm --filter web test`, `pnpm exec biome check apps/web/src apps/e2e/specs` pass.
- [x] 4 spec e2e pass: `student-package-without-class`, `student-package-validation`, `student-row-detail`, `enroll-existing-student`.

## Dependencies

- Không có plan chặn. Tiền đề: PR #245 (đã merge — detail hiển thị card Lớp học) và #240 (tạo học viên trong lớp tự derive gói active).

## Out of Scope

- Trang Học phí, Dashboard, global-search — vẫn hiển thị gói.
- Xóa field `pkg`/`hasPackage` khỏi display type `Student`.
- Đổi bất kỳ endpoint/kernel route hay contract nào.
- Copy empty-state "Chưa có học viên nào" (đề cập "gói học"), chip filter "Sắp hết buổi", logic `attentionCount`.

## Open Questions

- Nếu giáo viên vẫn cần nhìn nhanh số buổi còn lại tại list, có thể giữ "Còn lại" như cột phụ — cần xác nhận product trước khi thêm lại (mặc định: bỏ hẳn theo hướng lớp học).

## Validation Log

### Verification Results
- Claims checked: 8
- Verified: 8 | Failed: 0 | Unverified: 0
- Tier: Light (2 phases)
- Codebase evidence verified:
  - `apps/web/src/routes/_auth/students/index.tsx`: `useData()`, headers `["Học viên", "Gói", "Còn lại", "Tags", "Đơn giá"]`, `fmtVND`, `attentionCount`
  - `apps/web/src/routes/_auth/students/$studentId.tsx`: join `data.classes.filter` + `data.enrollments.some`
  - `apps/web/src/lib/repos/enrollments.ts`: existing read repo for enrollments
  - `apps/e2e/specs/student-package-without-class.spec.ts`: assertions for "Chưa có gói", "0 buổi · Online"
  - `apps/e2e/specs/student-package-validation.spec.ts`: assertions for "Chưa có gói", "500.000đ", `/buổi · Online/`

### Whole-Plan Consistency Sweep
- Consistency: All phases align on replacing the 3 package columns with "Lớp học", pure helper `classesByStudent`, unit tests in `enrollments.test.ts`, and updated E2E assertions.
- Unresolved contradictions: None.

## Red Team Review

### Reviewers
- Security Adversary: Multi-tenancy isolation confirmed (`useData` snapshot is org-scoped); XSS prevention confirmed (React JSX escapes strings); auth protection confirmed (`/_auth/` layout).
- Assumption Destroyer: Orphaned enrollment tolerance confirmed (`data.classes.filter` only emits valid classes); row click interaction confirmed (no nested interactive elements in list cell); sidebar vs header DOM order confirmed.

### Findings
- Total findings: 0 Critical, 0 High, 0 Medium
- Disposition: 0 Accepted, 0 Rejected

### Whole-Plan Consistency Sweep
- Status: Pass. Plan is ready for implementation.
