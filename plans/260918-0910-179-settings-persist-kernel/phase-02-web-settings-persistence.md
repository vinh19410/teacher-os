---
title: "Phase 2: Web Settings Persistence & UI Re-enable"
description: "Tích hợp client query/mutation cho settings, bật lại các input/select/textarea trên trang Settings, thêm nút Lưu thay đổi, bỏ nhãn 'Chưa mở' tại các tab đã hoạt động."
status: completed
---

# Phase 2: Web Settings Persistence & UI Re-enable

## 1. Client Repository (`apps/web/src/lib/repos/settings.ts`)

- Khai báo helper:
  - `fetchWorkspaceSettings(baseUrl: string)`: gọi `GET /api/kernel/settings`.
  - `updateWorkspaceSettings(baseUrl: string, payload: WorkspaceSettingsUpdate)`: gọi `PUT /api/kernel/settings`.
  - `workspaceSettingsQueryOptions(baseUrl: string)`: TanStack Query options với key `['kernel', 'settings']`.
- Tích hợp invalidation vào command bus hoặc query client sau khi mutation thành công.

## 2. SettingsPage Component (`apps/web/src/routes/_auth/settings.tsx`)

- Nạp settings qua `useQuery(workspaceSettingsQueryOptions(baseUrl))`.
- Quản lý state form (cho phép người dùng chỉnh sửa đơn giá, 3 mẫu tin, 7 quy tắc).
- Bật lại (bỏ prop `disabled` và `opacity-60`) trên:
  - Tab Tài khoản: `Field label="Đơn giá mặc định / buổi"` (input nhập được giá tiền).
  - Tab Mẫu tin Zalo: 3 `Textarea` (nhắc lịch, nhắc nợ, báo cáo tuần).
  - Tab Quy tắc: 2 select vắng học, 1 input số buổi vắng tối đa, 4 select quy tắc nhắc nhở.
- Gỡ bỏ `NotYetOpenNote` ("Chưa mở — sẽ lưu khi tính năng ra mắt") khỏi các tab trên.
- Thêm nút "Lưu thay đổi" (kèm indicator loading / success toast / thông báo phản hồi trung thực).
- Tab Dữ liệu: giữ nguyên tính trung thực (nút Xuất file CSV/JSON vẫn disabled kèm nhãn chưa mở, vì export file là non-goal).

## 3. Unit & Component Tests (`apps/web/src/routes/_auth/settings.test.tsx`)

- Cập nhật test suite của `settings.test.tsx`:
  - Khẳng định các control trong tab Tài khoản (đơn giá), Mẫu tin Zalo và Quy tắc KHÔNG còn disabled.
  - Khẳng định các tab trên KHÔNG còn render text "Chưa mở — sẽ lưu khi tính năng ra mắt".
  - Test tương tác form: chỉnh sửa giá trị và submit lưu thay đổi.
  - Tab Dữ liệu vẫn bảo đảm tính honest (không nhận là bản demo, nút xuất file disabled).
