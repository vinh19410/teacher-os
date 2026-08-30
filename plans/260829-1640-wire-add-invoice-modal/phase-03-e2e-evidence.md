---
phase: 3
title: "E2E evidence + full gates"
status: pending
priority: P1
effort: "2h"
dependencies: [2]
---

# Phase 3: E2E evidence + full gates

## Overview

E2E Playwright (server thật + local.db, không mock) chạy đúng kịch bản QC trong issue #61 làm evidence cho DOD M2, rồi chạy full gates workspace.

## Requirements

- Functional: spec tái hiện 3 case của QC (empty / `-5000` / `400000`) + reload persistence.
- Non-functional: dùng helpers có sẵn (`signUpViaUi`...), `workers: 1`, không mock API.

## Related Code Files

- Create: `apps/e2e/specs/create-invoice.spec.ts`
- Reuse: `apps/e2e/specs/helpers.ts` (chỉ có `signUpViaUi`, `openClassScheduleTab` + date/week helpers — KHÔNG có helper tạo class/enroll; setup sẽ inline ~50 dòng theo `enroll-existing-student.spec.ts:21-68`, effort đã tính)
- Pattern: `create-class-validation.spec.ts`, `enroll-existing-student.spec.ts`

## Implementation Steps (TDD)

1. Viết spec trước (chưa wire sẽ đỏ — xác nhận thất bại đúng chỗ), cấu trúc **3 test độc lập** (không chuỗi phụ thuộc happy path):
   - Setup (mỗi test): `signUpViaUi(page)` (org mới) → tạo student trước → tạo class → enroll student qua class-detail picker (thứ tự student-trước-class như `enroll-existing-student.spec.ts:21-38`).
   - **Happy path:** Học phí → "+ Tạo hóa đơn" → chọn enrollment → amount `400000` → due giữ mặc định → "Tạo hóa đơn" → modal đóng, bảng Hóa đơn (scope assert trong card chứa heading "Hóa đơn") hiện row mới với **`400.000đ`** (`fmtVND` dùng `toLocaleString("vi-VN")` — dấu chấm ngăn cách nghìn, deterministic) và badge "Chưa thu" → `page.reload()` → row vẫn còn.
   - **Validation empty amount:** mở modal, submit để trống amount → field error "Vui lòng nhập số tiền." và số row bảng Hóa đơn không đổi.
   - **Validation negative amount:** amount `-5000` → field error "Số tiền phải là số nguyên dương." và số row không đổi.
   - Assert "không có POST thành công": trong 2 test validation, đếm request qua `page.on("request")` lọc `POST /api/invoices` — phải bằng 0 (observe-only, không mock).
2. Chạy spec, sửa selector/flow theo UI thật nếu cần (không sửa assertion nội dung — trừ assertion tiền tệ đã đúng `400.000đ` ngay từ đầu).
3. Full gates từ repo root: `pnpm check` → `pnpm check-types` → `pnpm test` (gồm e2e nếu script root bao phủ).

## Success Criteria

- [x] E2E spec xanh: happy path + 2 validation case độc lập (field error hiện, không POST /api/invoices nào, row count không đổi).
- [x] Root `pnpm check`, `pnpm check-types`, `pnpm test` xanh.
- [x] Evidence DOD M2 của issue #61 trỏ được tới spec này.

## Risk Assessment

- **Setup org trống cần enrollment** — server `POST /students` với `classId` đã tạo enrollment cùng batch (kernel.ts:411-417), nên cả hai đường đều được; dùng flow enroll-existing-student vì khớp spec pattern #122 có sẵn (student phải tạo trước class).
- **E2E flaky do ngày hệ thống** (due prefill hôm nay) — assertion không phụ thuộc giá trị due, chỉ phụ thuộc amount/status badge.
- **Row-count assertion bắt nhầm bảng khác** — scope mọi assert trong card chứa heading "Hóa đơn"; bảng "Gói học đang hoạt động" phía trên không bị đụng đến.
