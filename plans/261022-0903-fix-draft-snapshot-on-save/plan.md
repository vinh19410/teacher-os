---
title: "fix(admin): so sánh snapshot trước khi dọn draft part & header khi save thành công"
description: "So sánh giá trị draft hiện tại với snapshot lúc gửi mutation trước khi dọn nháp part/header trong admin library test editor, chống mất ký tự gõ thêm trong lúc save."
status: completed
priority: P1
effort: "1h"
issue: 418
branch: ai-handle-issue-418
tags: [admin, library, bugfix, react]
blockedBy: []
blocks: []
created: 2026-10-22
---

# fix(admin): so sánh snapshot trước khi dọn draft part & header khi save thành công

## Overview

Trong `apps/admin/src/routes/_auth/library/tests/$testId.tsx`:
- `savePartMutation.onSuccess` dọn draft của slot vô điều kiện. Trong lúc lưu, chỉ nút "Lưu part" bị disabled, các trường input vẫn có thể chỉnh sửa.
- Nếu người dùng gõ thêm trong lúc mutation đang bay trên mạng, khi save thành công form được remount về bản đã lưu trên server, khiến các ký tự gõ thêm bị mất và `useBlocker` không cảnh báo (vì draft đã bị xóa).
- `headerMutation.onSuccess` có hành vi tương tự khi reset `headerDirtyRef = false` và ghi đè `setHeaderValue(headerFromDetail(updated))`.

Giải pháp:
1. Snapshot giá trị `PartFormValue` ngay tại thời điểm `handleSave` và truyền qua `onSave(built.input, value)`.
2. `savePartMutation.onSuccess` chỉ xóa draft của slot nếu `draft.value` bằng với snapshot lúc gửi (`arePartValuesEqual`). Nếu người dùng gõ thêm ký tự mới (khác snapshot), giữ lại draft với `dirty = true`.
3. `headerMutation.onSuccess` dùng functional updater cho `setHeaderValue` kết hợp hàm thuần `reconcileHeaderOnSaveSuccess`. Nếu `prev` bằng snapshot lúc gửi (`areTestHeadersEqual`), cập nhật bản server mới và đặt `headerDirtyRef.current = false`; nếu `prev` đã có ký tự mới gõ thêm, giữ nguyên `prev` và không reset ref.
4. Trích xuất các hàm thuần túy `reconcilePartDraftsOnSaveSuccess`, `reconcileHeaderOnSaveSuccess`, `arePartValuesEqual`, `areTestHeadersEqual` và kiểm chứng 100% bằng unit tests.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Xây dựng hàm so sánh canonical `arePartValuesEqual`, `areTestHeadersEqual` và hàm thuần `reconcilePartDraftsOnSaveSuccess`, `reconcileHeaderOnSaveSuccess` có unit test đầy đủ các nhánh | P1 |
| 2 | Nối snapshot vào `PartForm.handleSave` và `savePartMutation.onSuccess` trong `$testId.tsx` | P1 |
| 3 | Cập nhật `headerMutation.onSuccess` dùng functional updater và hàm so sánh snapshot | P1 |
| 4 | Toàn bộ test suite của admin pass (75+ tests), `pnpm check`, `pnpm check-types` sạch | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Pure comparison & reconciliation helpers (TDD)](./phase-01-pure-helpers.md) | Done |
| 2 | [Phase 2: Wire snapshot into PartForm and $testId route](./phase-02-wire-snapshots.md) | Done |

## Acceptance Criteria

- [x] `arePartValuesEqual` so sánh canonical đầy đủ các trường của `PartFormValue`, bỏ qua thứ tự key không liên quan.
- [x] `areTestHeadersEqual` so sánh đầy đủ các trường của `TestHeaderFormValue`.
- [x] `reconcilePartDraftsOnSaveSuccess`: xóa draft nếu draft bằng snapshot; giữ nguyên draft với `dirty = true` nếu draft khác snapshot; giữ nguyên map nếu slot không có draft.
- [x] `reconcileHeaderOnSaveSuccess`: trả về `fromServer` và `isDirty = false` nếu `prev` khớp `sent`; giữ nguyên `prev` và `isDirty = true` nếu `prev` khác `sent`.
- [x] `PartForm`: truyền `value` (snapshot) vào `onSave(built.input, value)`.
- [x] `savePartMutation`: nhận `{ slot, input, snapshot }` và dọn draft bằng `reconcilePartDraftsOnSaveSuccess`.
- [x] `headerMutation`: cập nhật state qua functional updater và không xóa đè nội dung đang gõ thêm.
- [x] Unit tests phủ các kịch bản: gõ thêm trong lúc lưu, undo về snapshot, lưu bình thường không gõ thêm.
- [x] `pnpm --filter admin test` pass toàn bộ (87/87 tests).
- [x] `pnpm check` và `pnpm check-types` pass không có lỗi.
