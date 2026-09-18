---
title: "Fix #166: Trang Bài tập không có CTA tạo bài tập — bổ sung Empty State & CTA"
description: "First-run workspace trống không có CTA tạo bài tập khiến trang Bài tập thành trang chết. Wave 6 kernel chưa có create-assignment endpoint; bổ sung empty state card hướng dẫn kèm CTA chuyển tới Lớp học và Học viên, bổ sung nút '+ Tạo bài tập' kèm modal hướng dẫn đồng bộ và nút điều hướng, xử lý filter empty message khi lọc."
status: completed
priority: P1
effort: 2h
issue: 166
branch: vinh19410/auto-loop-implement-v2-run-1-20260918T0256
tags: [frontend, bugfix, assignments, empty-state, ux]
blockedBy: []
blocks: []
created: 2026-09-18
---

# Fix #166: Trang Bài tập không có CTA tạo bài tập — bổ sung Empty State & CTA

## Overview

Theo kết quả Dogfood QA (issue #2 trong `dogfood-output/report.md` và issue #166), khi người dùng mới đăng ký tài khoản và mở trang `/assignments`, giao diện hiển thị: `0 bài tập · 0 cần xử lý`, filter `Tất cả / Chưa nộp / Trễ / Đã chấm`, và một bảng `DataTable` rỗng chỉ có header. Trang không có nút "+ Tạo bài tập" hay bất kỳ CTA tạo bài nào (khác với các trang Lớp học, Học viên, Syllabus, Báo cáo).

Kiểm tra kiến trúc hiện tại:
- Bảng `assignment` và Wave 6 persist (`plans/260818-1101-persist-class-centric-domain-kernel/phase-07-wave-6-assignments-persist.md`) được thiết kế cho việc đọc và chấm điểm (`grade-assignment`); không có endpoint tạo bài trực tiếp (`POST /api/assignments` trả về 404 có test contract khóa ở `apps/server/src/kernel.test.ts:2246`).
- Bài tập trong Teacher OS được dự kiến đồng bộ từ hoạt động của học viên trong các lớp học hoặc theo từng học viên.
- Giải pháp trung thực, đúng quy chuẩn sản phẩm và giải quyết trọn vẹn yêu cầu của issue #166 ("CTA tạo bài, hoặc empty state dẫn tới chỗ tạo (từ lớp/học viên)"):
  1. Thêm nút "+ Tạo bài tập" ở thanh thao tác trên cùng (cùng hàng với ChipFilter, đồng bộ layout với các trang Lớp học / Học viên / Syllabus). Khi bấm, mở modal `AddAssignmentModal` giải thích cơ chế quản lý bài tập và cung cấp CTA điều hướng tới "Lớp học" hoặc "Học viên".
  2. Khi workspace chưa có bài tập nào (`data.assignments.length === 0`), thay vì render bảng rỗng chỉ có header cột, render một `Empty State` card thân thiện với tiêu đề "Chưa có bài tập nào", mô tả rõ ràng cách bắt đầu và 2 nút CTA: "Quản lý lớp học" (`/classes`) và "Quản lý học viên" (`/students`).
  3. Khi có bài tập nhưng bộ lọc cho 0 kết quả (`list.length === 0`), hiển thị thông báo "Không có bài tập nào phù hợp với bộ lọc." bên trong Card.
  4. Giữ nguyên dynamic KPI counters `${data.assignments.length} bài tập · ${pendingCount} cần xử lý` để bảo đảm contract test `kernel-runtime.contract.test.ts`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Bổ sung nút CTA "+ Tạo bài tập" trên thanh filter/action của trang Bài tập | P1 |
| 2 | Bổ sung modal hướng dẫn `AddAssignmentModal` khi bấm "+ Tạo bài tập", cung cấp nút dẫn tới Lớp học và Học viên | P1 |
| 3 | Bổ sung Empty State card khi workspace chưa có bài tập nào, loại bỏ trang chết cho tài khoản mới | P1 |
| 4 | Xử lý filter empty message khi danh sách bài tập được lọc không có kết quả | P2 |
| 5 | Đảm bảo SSR tests và contract tests xanh hoàn toàn, không có regression | P1 |

## Non-Goals

- Không tự ý thêm endpoint `POST /api/assignments` vào server (Wave 6 lock test và database schema quy định no direct create endpoint).
- Không sửa đổi logic chấm điểm trong `grade-modal.tsx` hay router `$assignmentId.tsx`.

## Phases

| Phase | Name | Status |
|---|---|---|
| 1 | [Bổ sung Empty State card, CTA button, AddAssignmentModal và unit tests](./phase-01-empty-state-and-cta.md) | Completed |

## Success Criteria

- [x] Khi `data.assignments.length === 0`: render Empty State card với tiêu đề "Chưa có bài tập nào", đoạn giải thích và 2 nút CTA tới Lớp học (`/classes`) và Học viên (`/students`).
- [x] Thanh filter có nút "+ Tạo bài tập"; khi bấm mở `AddAssignmentModal` với hướng dẫn và các nút điều hướng tương ứng.
- [x] Khi lọc trạng thái không có bài tập: hiển thị thông điệp rỗng cho filter.
- [x] Khi có bài tập: render bảng DataTable đầy đủ như hiện tại.
- [x] KPI counter `PageHead lead` giữ nguyên định dạng phục vụ contract test.
- [x] Unit test cho component `assignments/index.tsx` và `AddAssignmentModal` pass.
- [x] `pnpm test`, `pnpm check`, `pnpm check-types` pass sạch 100%.

## Verification Commands

```bash
cd apps/web && pnpm vitest run src/routes/_auth/assignments/index.test.tsx
pnpm test
pnpm check
pnpm check-types
```

## Red-Team Record (2026-09-18)

**Assumptions** — Kernel không có create-assignment endpoint (đã xác thực qua schema comment và `apps/server/src/kernel.test.ts:2246` Wave 6 lock). Thao tác tạo bài tập xuất phát từ luồng lớp học và học viên. Việc cung cấp Empty State và CTA điều hướng giải quyết triệt để vấn đề "trang chết" cho người dùng mới mà không tạo form giả hay vi phạm truthful mutation.

**Failure Modes** —
- (F1) Click "+ Tạo bài tập" không làm gì: Đã giải quyết bằng cách mở `AddAssignmentModal` hướng dẫn rõ ràng và dẫn tới các trang khởi tạo thực tế.
- (F2) Nhầm lẫn giữa workspace rỗng và kết quả lọc rỗng: Đã phân biệt `data.assignments.length === 0` (workspace empty state) và `list.length === 0` khi `data.assignments.length > 0` (filter empty message).
- (F3) Vi phạm contract test KPI counters: Giữ nguyên exact template string trong `PageHead lead`.

**Scope** — Giới hạn trong `apps/web/src/routes/_auth/assignments/` và modal component. Không thay đổi backend hay DB schema.

**Verdict: GO** — 0 blocker.
