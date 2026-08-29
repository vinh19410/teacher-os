---
phase: 3
title: "E2E QC repro + hồi quy"
status: pending
priority: P1
effort: "1.5h"
dependencies: [2]
---

# Phase 3: E2E QC repro + hồi quy

## Overview

E2E spec mới tái hiện đúng kịch bản QC issue #122 (tạo học viên trước trên `/students`, rồi enroll từ class detail), và chạy lại bộ test hồi quy toàn repo để đảm bảo flow #5/#104/#121 không vỡ.

## Requirements

- Functional: kịch bản QC end-to-end qua UI thật (Playwright) — picker mặc định, chọn học viên, roster + KPI tăng, buổi học sinh đủ.
- Non-functional: spec tuân helper hiện hữu (`signUpViaUi`, `gotoWeek`, pattern assert của `class-operations.spec.ts`).

## Architecture

Spec mới `apps/e2e/specs/enroll-existing-student.spec.ts`:

1. `signUpViaUi` → `/students` → tạo học viên `QC-122-STUDENT` (qua modal `/students` — khẳng định modal này không toggle).
2. Tạo lớp có lịch (mẫu `class-operations.spec.ts`: T2+T4, 12 buổi).
3. Mở class detail → `+ Thêm học viên` → assert dialog `"Thêm học viên"` ở chế độ **Học viên có sẵn** (mặc định) → thấy `QC-122-STUDENT` trong picker → chọn → giữ gói mặc định → `Lưu`.
4. Assert: roster tab hiện học viên; KPI `"1"` `học viên`; tab `Buổi học` hiện 12 buổi `Sắp tới`; reload giữ data.
5. Mở lại modal → `QC-122-STUDENT` **không còn** trong picker (đã enroll).

Hồi quy: chạy `pnpm test` (turbo: server + web unit) + `pnpm --filter e2e test` (spec liên quan: `class-operations`, `student-package-without-class`, `projected-sessions`, `session-occurrence`) + `biome check` + build.

## Related Code Files

- Create: `apps/e2e/specs/enroll-existing-student.spec.ts`
- Modify (chỉ khi heuristic default làm vỡ): `apps/e2e/specs/class-operations.spec.ts`

## Implementation Steps

1. Viết spec mới theo Architecture; chạy FAIL trước khi Phase 1–2 hoàn tất là bình thường (chạy lại sau khi merge code phase 1–2).
2. Chạy full unit: `pnpm test`.
3. Chạy e2e bộ liên quan; chỉnh `class-operations.spec.ts` **chỉ khi** default-mode thực sự làm vỡ bước điền form tạo mới.
4. `pnpm biome check` + `pnpm build` (hoặc turbo tương đương theo CI workflow scripts/).

## Success Criteria

- [ ] Spec mới GREEN mô tả đủ kịch bản QC (mục tiêu chấp nhận của issue).
- [ ] `class-operations` và các spec liên quan GREEN không chỉnh (hoặc chỉnh tối thiểu có lý do ghi rõ).
- [ ] CI workflow local (unit + lint + build) GREEN trước khi ship.

## Risk Assessment

- E2E môi trường local cần dev server — dùng config Playwright hiện hữu của `apps/e2e` (webServer tự khởi động như spec cũ).
- Nếu heuristic default-mode gây flake giữa 2 spec chạy chung org — không xảy ra: mỗi spec `signUpViaUi` org riêng.
