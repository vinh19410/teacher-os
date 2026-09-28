---
title: "Dashboard: lịch dạy gọn — chỉ hiển thị lớp"
description: "Gọn card lịch dạy trên /dashboard: bỏ avatar lớp học và danh sách học viên, chỉ giữ tên lớp cùng thông tin buổi học."
status: completed
priority: P2
effort: 1h
issue: 278
branch: feat/dashboard-schedule-class-only
tags: [frontend, refactor]
blockedBy: []
blocks: []
created: 2026-09-28
---

# Dashboard: lịch dạy gọn — chỉ hiển thị lớp

## Overview

Trang `/dashboard` (file chính `apps/web/src/routes/_auth/dashboard.tsx`) đang render mỗi buổi học thành một Card gồm: avatar chữ-cái-đầu của lớp, tên lớp + meta buổi học, và bên dưới là danh sách học viên (avatar + tên, kèm nút "Điểm danh"/Badge "Đã học" ở section "Lịch hôm nay"). Plan này gọn card lại: **chỉ còn tên lớp + dòng meta `time · dur' · type · topic`** — bỏ avatar lớp và toàn bộ danh sách học viên ở cả hai section "Lịch hôm nay" và "Lịch sắp tới". Không đổi schema, không đổi API/server, không đụng section "Học viên rủi ro".

Ngoài file dashboard, plan còn sửa `apps/web/src/lib/kernel-runtime.contract.test.ts` — drift-guard đang pin tích cực (`toMatch`) dashboard phải có `useDirectKernelAction()` / `void run(` / `disabled={busy || isPending(l.id)}` ở 2 test (dòng ~194–196 và ~283–286); các assertion này phải đổi thành negative pin (`not.toMatch`) theo hướng UI mới.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Section "Lịch hôm nay": Card chỉ còn tên lớp + meta buổi học; xóa Avatar lớp và khối student rows (kèm nút "Điểm danh" / Badge "Đã học") | P1 |
| 2 | Section "Lịch sắp tới": xóa Avatar lớp và khối student rows tương tự | P1 |
| 3 | Dọn sạch code chết (imports, state, destructuring không còn dùng); typecheck/lint/unit/e2e xanh | P1 |
| 4 | Cập nhật `kernel-runtime.contract.test.ts`: bỏ positive pin dashboard check-in, thay bằng negative pin; giữ nguyên mọi pin tuition/classDetail/lessonModal/scheduleTable/attendanceModal/syllabus | P1 |

## Hệ quả chấp nhận (đã xác minh)

- Nút "Điểm danh" nhanh biến mất khỏi dashboard (nó nằm trong student list). Tính năng check-in vẫn đầy đủ ở: trang class detail (tab "Buổi học", `class-detail/class-schedule-table.tsx`, `session-attendance-modal.tsx`) và modal `/schedule` (`schedule/class-session-modal.tsx`, `schedule/lesson-modal.tsx`). Các e2e check-in (`class-operations.spec.ts`, `schedule-session-modal.spec.ts`, `projected-sessions.spec.ts`) đều thao tác trên các trang đó, không đụng nút trên dashboard.
- Bỏ early-return `studentRows.length === 0` (đang ẩn cả card khi học viên record thiếu): sau thay đổi, mọi buổi học trong data đều hiển thị card — đúng ngữ nghĩa "chỉ hiển thị lớp".
- `docs/diagrams/user-flow.{json,svg,html}` còn mô tả node dashboard có "Điểm danh" → stale sau refactor (không vỡ build/test); ghi chú trong PR, không sửa diagram trong plan này.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Gọn card lịch dạy trên dashboard](./phase-01-strip-schedule-rows.md) | Pending |
| 2 | [Kiểm chứng & regression](./phase-02-verify-regression.md) | Pending |

## Success Criteria

- [x] Card lịch dạy ở "Lịch hôm nay" và "Lịch sắp tới" không còn Avatar lớp, không còn hàng học viên nào
- [x] Không còn unused import/state (`Button`, `useDirectKernelAction`, `studentById`) — biome + tsc sạch
- [x] `kernel-runtime.contract.test.ts` không còn positive pin dashboard check-in; toàn bộ unit pass
- [x] `pnpm --filter web test` pass; e2e smoke dashboard + các spec check-in pass
- [ ] Dashboard không còn nút "Điểm danh"; check-in vẫn hoạt động trên class detail và /schedule (e2e chứng minh)

## Out of Scope

- Section "Học viên rủi ro" (giữ nguyên avatar + DataTable)
- Trang `/schedule`, class detail, API/server, schema
- Bổ sung nút "Điểm danh tất cả" hay bất kỳ CTA thay thế nào trên dashboard

## Dependencies

- Không có dependency chéo plan khác.
