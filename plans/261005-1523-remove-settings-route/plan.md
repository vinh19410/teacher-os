---
title: "Remove /settings route"
description: "Gỡ trang Cài đặt (/settings) cùng endpoint /api/kernel/settings và contract zod vì không tính năng nào dùng workspace settings; giữ bảng DB workspace_settings."
status: pending
priority: P2
effort: "0.5d"
branch: chore/remove-settings-route
tags: [frontend, backend, cleanup]
blockedBy: []
blocks: []
created: 2026-10-05
issue: 321
---

# Remove /settings route

## Overview

Trang `/settings` (4 tab: Tài khoản, Mẫu tin Zalo, Quy tắc, Dữ liệu) chỉ ghi/đọc bảng `workspace_settings` qua `/api/kernel/settings`. Đã xác minh **không có logic nào khác** ở server hay web đọc các giá trị này (`defaultUnitPrice`, `tpl*`, quy tắc vắng/nhắc): grep `workspaceSettings|defaultUnitPrice|tplReminder|...` chỉ khớp chính route, repo web, handler `kernel.ts:332-463`, contract và test. Tab "Dữ liệu" và nút "Quản lý thanh toán" đều disabled. Giữ lại chỉ gây hiểu nhầm cho giáo viên.

## Quyết định đã chốt (user, 2026-10-05)

1. **Phạm vi: web + API, giữ bảng DB.** Xoá route, sidebar, repo web, endpoint `/api/kernel/settings` (GET/PUT/POST) và `workspaceSettingsSchema`/`workspaceSettingsUpdateSchema`. Giữ `packages/db/src/schema/settings.ts` + bảng `workspace_settings` — không migration, dữ liệu còn nguyên, khôi phục bằng revert.
2. **Plan SePay (#320) phải đổi chỗ đặt UI liên kết ngân hàng** — không còn tab `/settings?tab=payments`; plan này cập nhật plan SePay và comment lên #320.

## Scope Challenge

- **Đã có:** `getApiBaseUrl()` đang nằm trong `lib/repos/settings.ts` nhưng là helper dùng chung (`invitations.ts`, `invitations.test.ts`, plan chấm bài phase 3) → tách sang `lib/repos/api-base-url.ts` thay vì xoá.
- **Yêu cầu:** gỡ path `/settings`. Không thêm trang thay thế, không redirect riêng — `/settings` rơi vào luồng route không hợp lệ sẵn có (`routes-matcher.ts`).
- **Ngoài phạm vi:** drop bảng DB; sửa các plan đã `completed`; các mục CHANGELOG lịch sử.
- **Độ phức tạp:** ~14 file chạm, toàn bộ là xoá/đổi import; 3 phase tuần tự. Mode: fast.

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Gỡ trang /settings phía web | pending | [phase-01-remove-web-settings-route.md](phase-01-remove-web-settings-route.md) |
| 2 | Gỡ endpoint + contract settings phía server | pending | [phase-02-remove-settings-api-and-contract.md](phase-02-remove-settings-api-and-contract.md) |
| 3 | Đồng bộ plan phụ thuộc, docs, verify | pending | [phase-03-sync-dependent-plans-and-docs.md](phase-03-sync-dependent-plans-and-docs.md) |

Phase 2 phụ thuộc phase 1 (web phải hết import contract trước khi xoá contract). Phase 3 chạy sau cùng.

## Acceptance Criteria

- [ ] Sidebar không còn nhóm "Hệ thống"/mục "Cài đặt"; topbar map không còn `/_auth/settings`.
- [ ] Truy cập `/settings` cho kết quả giống một path không hợp lệ khác (vd `/admin`) — không crash, không render trang cũ.
- [ ] `GET/PUT/POST /api/kernel/settings` trả 404 (sau khi qua origin guard).
- [ ] Không còn symbol `workspaceSettingsSchema`, `workspaceSettingsUpdateSchema`, `WorkspaceSettings*`, `workspaceSettingsQueryOptions` trong `apps/` và `packages/api/src`.
- [ ] Bảng `workspace_settings` và `packages/db/src/schema/settings.ts` còn nguyên; không có migration mới.
- [ ] Test origin guard (PUT/PATCH) vẫn chạy và xanh với path thay thế.
- [ ] Plan SePay + plan chấm bài không còn trỏ tới `settings.tsx`/`/settings`/`repos/settings`; #320 có comment ghi chú.
- [ ] `pnpm check`, `pnpm check-types`, `pnpm --filter web test`, `pnpm --filter server test` xanh.

## Rủi ro

- **Plan SePay #320 đang `ready to review`:** phase 2/5/6 đặt UI ở Cài đặt. Giảm thiểu: phase 3 đổi sang trang riêng `/payments` (ghi rõ là đề xuất; quyết định cuối thuộc người review SePay).
- **`routeTree.gen.ts` bị gitignore:** phải build web để regenerate trước `check-types`, nếu không type `"/settings"` còn sót.
- **Khôi phục:** `git revert` commit; dữ liệu DB không mất.
