---
title: "Phase 1: Kernel Schema & API Endpoints"
description: "Tạo bảng workspace_settings trong packages/db, sinh migration D1, định nghĩa Zod contracts trong packages/api, triển khai GET/PUT /api/kernel/settings trong apps/server."
status: completed
---

# Phase 1: Kernel Schema & API Endpoints

## 1. Database Schema (`packages/db/src/schema/settings.ts`)

- Bảng `workspace_settings`:
  - `orgId`: text, primary key, foreign key references `organization.id` on delete cascade.
  - `defaultUnitPrice`: text, default `"400.000đ"`.
  - `tplReminder`: text.
  - `tplDebt`: text.
  - `tplReport`: text.
  - `absenceNoticeHours`: text, default `"2 giờ trước buổi học"`.
  - `unexcusedDeduct`: text, default `"Có, trừ 1 buổi"`.
  - `maxAbsencesBeforeAlert`: integer, default `2`.
  - `reminderSchedule`: text, default `"T−24h và T−1h"`.
  - `overdueDebtReminder`: text, default `"Sau 3 ngày và 7 ngày"`.
  - `packageEndReminder`: text, default `"Khi còn 3 buổi"`.
  - `preferredChannel`: text, default `"Zalo trước, email dự phòng"`.
  - `updatedAt`: integer timestamp.
- Xuất bảng trong `packages/db/src/schema/index.ts` và `packages/db/src/index.ts`.
- Chạy `drizzle-kit generate` để sinh file migration.

## 2. API Contracts (`packages/api/src/contracts.ts`)

- `workspaceSettingsSchema`:
  - `defaultUnitPrice`: string, min 1, default "400.000đ"
  - `tplReminder`: string, min 1, default tpl text
  - `tplDebt`: string, min 1, default tpl text
  - `tplReport`: string, min 1, default tpl text
  - `absenceNoticeHours`: string, min 1, default "2 giờ trước buổi học"
  - `unexcusedDeduct`: string, min 1, default "Có, trừ 1 buổi"
  - `maxAbsencesBeforeAlert`: number, int, min 0, default 2
  - `reminderSchedule`: string, min 1, default "T−24h và T−1h"
  - `overdueDebtReminder`: string, min 1, default "Sau 3 ngày và 7 ngày"
  - `packageEndReminder`: string, min 1, default "Khi còn 3 buổi"
  - `preferredChannel`: string, min 1, default "Zalo trước, email dự phòng"
- `workspaceSettingsUpdateSchema`: partial của schema trên.
- Export types: `WorkspaceSettings`, `WorkspaceSettingsUpdate`.

## 3. Server Endpoints (`apps/server/src/routes/kernel.ts`)

- `GET /api/kernel/settings`:
  - Yêu cầu session / orgId qua middleware hiện có.
  - Truy vấn `workspace_settings` theo `orgId`.
  - Nếu chưa có row, trả về default từ `workspaceSettingsSchema.parse({})`.
- `PUT /api/kernel/settings`:
  - Validate body với `workspaceSettingsUpdateSchema`.
  - Upsert vào `workspace_settings` theo `orgId` (nếu có rồi thì update `updatedAt` và các field được cung cấp, nếu chưa có thì insert kèm defaults).
  - Trả về status 200 kèm `WorkspaceSettings` đầy đủ sau khi upsert.

## 4. Tests

- Viết integration tests trong `apps/server/src/kernel.test.ts`:
  - Test 1: `GET /api/kernel/settings` trả về mặc định khi chưa có cấu hình.
  - Test 2: `PUT /api/kernel/settings` lưu cấu hình mới và `GET` sau đó trả về đúng dữ liệu vừa lưu.
  - Test 3: `PUT` với invalid payload (ví dụ maxAbsencesBeforeAlert âm) bị reject 400.
  - Test 4: Cách ly giữa 2 orgs (Org A lưu settings không ảnh hưởng Org B).
