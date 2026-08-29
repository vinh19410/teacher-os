---
title: "fix-global-search-no-op-issue-109"
description: "P1: ô tìm kiếm global trên topbar không có phản hồi nào (không dropdown, không navigate) — issue #109"
status: completed
priority: P1
effort: "4h"
tags: [bugfix, web, search]
created: 2026-08-29
---

# fix-global-search-no-op-issue-109

## Overview

Sửa lỗi P1 issue #109: ô tìm kiếm global trên topbar của app.teacheros.io.vn
không tạo ra bất kỳ phản hồi hiển thị nào khi người dùng gõ và Enter. Root cause
được xác định bằng đọc code (không đoán): `submitSearch` trong
`apps/web/src/components/layout/topbar.tsx` chỉ tìm **tên học viên** trong
`data.students` và **chỉ navigate khi match**; mọi đường còn lại là silent
no-op — không có dropdown, không có thông báo "không tìm thấy", và không tìm
lớp học dù placeholder hứa "Tìm học viên, buổi học, hóa đơn…".

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Mỗi lần gõ + Enter vào ô tìm kiếm phải tạo ra **kết quả hiển thị** (dropdown kết quả có thể click, hoặc trạng thái "không tìm thấy") | P1 |
| 2 | Chọn kết quả → điều hướng đúng trang (`/students/$studentId`, `/classes/$classId`) | P1 |
| 3 | Tìm kiếm không phân biệt dấu tiếng Việt và không phân biệt hoa/thường | P2 |

## Root Cause

**Verified from code:**
- `topbar.tsx:32-43` — `submitSearch()`: match duy nhất là
  `data.students.find(s => s.name.toLowerCase().includes(q))`; không match →
  return sớm, **không có bất kỳ feedback nào** (silent no-op branch).
- Không có UI dropdown trong toàn bộ file — expectation "dropdown" của QC chưa
  từng được implement.
- Placeholder "Tìm học viên, buổi học, hóa đơn…" hứa nhiều hơn năng lực thực
  (chỉ học viên).

**Unverified runtime hypothesis** (bằng chứng runtime không suy ra được từ code):
QC vào staging có thể rơi vào silent no-op branch vì snapshot của
`usertest1@mail.com` không chứa học viên tên "Minh" (hoặc snapshot rỗng). Có
tồn tại giả thuyết cạnh tranh: staging có học viên "Minh" nhưng `navigate`
lỗi vì lý do khác. E2E case 1 của phase 1 (org mới có học viên "Nguyễn Minh
E2E", gõ "minh" → dropdown hiện đúng học viên đó → Enter → URL
`/students/<id>` chính xác) là bằng chứng loại trừ giả thuyết này: nếu path
match→navigate hoạt động, silent no-op branch là nguyên nhân duy nhất còn lại.

**Triệu chứng phụ "field đọc lại rỗng":** có một đường remount thật trong
code — `data-provider.tsx:159-161` render `null` khi query đang
pending/không snapshot → toàn bộ cây (kể cả topbar) unmount, input rỗng.
Đây là hành vi của load gate kernel, không phải của search; fix dropdown
không che được nó và **nằm ngoài scope** của plan này (sẽ ghi nhận trong
comment issue để theo dõi riêng nếu QC tái hiện).

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Global search có phản hồi hiển thị + điều hướng](./phase-01-start.md) | Pending |

## Acceptance Criteria

- [ ] Gõ text bất kỳ + Enter: nếu có match → dropdown hiện kết quả và Enter/click điều hướng tới trang tương ứng; nếu không có match → hiện trạng thái "Không tìm thấy kết quả" rõ ràng. Không còn đường silent no-op.
- [ ] Tìm được cả học viên (theo tên, SĐT, phụ huynh) và lớp học (theo tên).
- [ ] Match không phân biệt hoa/thường và dấu tiếng Việt ("minh" khớp "Minh", "nguyen" khớp "Nguyễn").
- [ ] Unit test cho module search thuần + e2e spec `global-search.spec.ts` (match → navigate; no-match → empty state) pass trong CI.
- [ ] Placeholder của ô search phản ánh đúng phạm vi tìm được ("Tìm học viên, lớp học…").

## Success Criteria

- [ ] Toàn bộ acceptance criteria trên hoàn thành.
- [ ] `pnpm check` (biome), typecheck, unit tests, build, e2e liên quan xanh.
- [ ] Không regression ở các spec e2e hiện có.

## Non-Goals (scope boundary)

- Không xây search API server-side hay index full-text (dữ liệu đã có sẵn
  trong kernel snapshot phía client).
- Không tìm hóa đơn/buổi học — không có route đích riêng cho hóa đơn
  (tuition là trang tổng hợp theo học viên); placeholder được sửa lại cho
  trung thực thay vì mở rộng scope.
- Không đụng vào auth, kernel snapshot, hay bất kỳ surface nào ngoài topbar
  search + module search mới.
- Chấp nhận Enter = chọn match đầu tiên; hỗ trợ chọn item bất kỳ bằng
  phím mũi tên (arrow-key) không nằm trong scope này (đã có click per-item).
- Đường remount load-gate kernel (`data-provider.tsx:159`) gây mất state input
  không được xử lý trong scope này — xem mục Root Cause.

## Quality Gates & Lệnh Chạy (đã verify từ package.json)

- Unit: `pnpm --filter web test` (vitest).
- E2E toàn bộ: `pnpm --filter e2e e2e` (script tên là `e2e`, KHÔNG có
  `pnpm --filter e2e test`); 1 spec: `pnpm --filter e2e exec playwright test
  specs/global-search.spec.ts`.
- `pnpm check` là biome check có autofix (`--write`) — chạy xong phải review
  diff vì working tree có thể bị mutate.

<!-- slug: fix-global-search-no-op-issue-109 -->
