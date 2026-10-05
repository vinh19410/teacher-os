---
title: Plan gỡ trang /settings
date: 2026-10-05
summary: "Lập plan gỡ route /settings + API /api/kernel/settings, giữ bảng workspace_settings (issue #321)"
---

# Plan gỡ trang /settings

## What happened
Lập plan `plans/261005-1523-remove-settings-route` (issue #321) để gỡ trang Cài đặt. Scout xác nhận không logic nào ở server/web đọc workspace settings (`defaultUnitPrice`, mẫu tin Zalo, quy tắc vắng/nhắc) ngoài chính trang `/settings` và handler `kernel.ts:332-463`.

## Decision
- Gỡ web + API + contract zod; giữ bảng DB `workspace_settings` (không migration, revert được).
- Tách `getApiBaseUrl()` sang `apps/web/src/lib/repos/api-base-url.ts` vì `invitations` dùng chung.
- Plan SePay (#320) phải chuyển UI liên kết ngân hàng từ `/settings?tab=payments` sang trang riêng (đề xuất `/payments`); plan chấm bài phải đổi import `./settings`.

## Rủi ro đã thấy
- 2 test origin guard trong `kernel.test.ts` đang dùng `/api/kernel/settings` làm endpoint PUT/PATCH duy nhất; sau khi gỡ phải dựa vào `kernel.use("*")` chạy trước 404.
- `routeTree.gen.ts` bị gitignore, cần build web để regenerate trước typecheck.

## Next steps
Commit + push plan lên `develop` để link trong #321 hoạt động, rồi `/ak:cook plans/261005-1523-remove-settings-route/plan.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
