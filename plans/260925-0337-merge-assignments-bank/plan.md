---
title: "Gộp trang Bài tập: /assignments + /assignments/bank"
description: "Gộp 2 route trùng tính năng thành một trang /assignments duy nhất chỉ hiển thị danh sách bài tập đã tạo; xoá route /assignments/bank và cập nhật toàn bộ tham chiếu điều hướng, unit test và e2e."
status: pending
priority: P2
effort: 4h
issue: 267
branch: develop
tags: [refactor, frontend]
blockedBy: []
blocks: []
created: 2026-09-25
---

# Gộp trang Bài tập: /assignments + /assignments/bank

## Overview

Hai route `/assignments` và `/assignments/bank` đang trùng tính năng: cả hai đều là
"trang danh sách bài tập". Theo yêu cầu, gộp thành **một trang duy nhất `/assignments`**
chỉ hiển thị **danh sách bài tập đã được tạo** (dữ liệu `assignmentPrompts` — nội dung
hiện tại của trang bank). Route `/assignments/bank` bị xoá, bảng tracking per-học viên
cũ (nạp từ `data.assignments`, có phần mock) bị thay thế hoàn toàn.

## Giải pháp & giả định

- "Bài tập đã được tạo" = các đề đã lưu qua `/assignments/new` (`POST /api/assignments/prompts`),
  hiện đang hiển thị ở `/assignments/bank`. Đây là dữ liệu thật duy nhất; bảng cũ của
  `/assignments` đọc `data.assignments` (luồng server-fed per-học viên, dùng `averageBand` từ `mock-data.ts`).
- Trang gộp giữ nguyên UX của trang bank (filter kỹ năng/phần thi, search, preview aside,
  StatusTag "Nháp/Sẵn sàng/Đã dùng N lớp") vì các tính năng này phục vụ chính việc duyệt
  danh sách bài tập đã tạo.
- Học viên theo dõi tiến độ làm bài vẫn xem ở trang Lớp học (tab Bài tập —
  `class-assignments-tab.tsx`), không mất khả năng theo dõi.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | `/assignments` hiển thị duy nhất danh sách bài tập đã tạo (prompts + trạng thái sử dụng) | P1 |
| 2 | Xoá route `/assignments/bank` và mọi tham chiếu điều hướng tới nó | P1 |
| 3 | Unit test + e2e cập nhật theo, toàn bộ suite xanh | P1 |

## Non-goals

- Không đổi backend/DB/contracts (`assignment_prompt`, `class_assignment`, kernel snapshot giữ nguyên).
- Không xoá field `assignments` trong snapshot (`data-provider.assignmentById`, trang học viên `$studentId` vẫn dùng).
- Không thêm redirect từ `/assignments/bank` → `/assignments` (app nội bộ, link nội bộ đã cập nhật hết).
- Không đổi luồng tạo đề (`/assignments/new`) và luồng giao đề ở trang Lớp học.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Gộp trang Bài tập](./phase-01-merge-assignments-page.md) | Pending |
| 2 | [Cập nhật unit test](./phase-02-update-unit-tests.md) | Pending |
| 3 | [Cập nhật e2e + verify toàn diện](./phase-03-update-e2e-and-verify.md) | Pending |

## Success Criteria

- [ ] `/assignments` là path duy nhất hiển thị danh sách bài tập đã tạo; `/assignments/bank` không còn tồn tại (404)
- [ ] `grep -rn "assignments/bank" apps packages --include="*.ts" --include="*.tsx" | grep -v routeTree.gen` trả về 0 kết quả
- [ ] `pnpm --filter web check-types`, `pnpm --filter web test`, `pnpm --filter e2e e2e` đều pass
- [ ] Không thay đổi nào ở `apps/server`, `packages/api`, `packages/db`

## Risks

- `routeTree.gen.ts` được sinh tự động bởi TanStack Router plugin khi chạy vite — phải regenerate bằng lệnh build/dev, không sửa tay.
- Giữa phase 1 và phase 2, unit test cũ của `index.test.tsx` sẽ fail tạm thời (chúng assert bảng cũ) — đây là trạng thái trung gian chấp nhận được, phase 2 sửa ngay.
- E2E phụ thuộc label nút: `+ Tạo bài tập` (giữ nguyên), heading `Ngân hàng bài tập` (đổi thành `Bài tập`) — phải update đúng spec `assignment-bank.spec.ts`.

## Validation Log

### Verification Results
- Claims checked: 24 (file paths, line refs, label e2e, scripts — đọc trực tiếp toàn bộ file liên quan)
- Verified: 24 | Failed: 0 | Unverified: 0
- Tier: Standard (3 phases)
- Failures: none

### Quyết định đã chốt (từ yêu cầu người dùng)
- Trang gộp CHỈ hiển thị danh sách bài tập đã tạo → bảng tracking per-học viên cũ bị bỏ,
  không giữ dưới dạng tab (theo đúng chữ "chỉ hiển thị danh sách bài tập đã được tạo").
