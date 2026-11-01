---
phase: 1
title: "Contract & route: source, email bắt buộc cho nguồn test"
status: pending
priority: P2
effort: "2h"
dependencies: []
---

# Phase 1: Contract & route

## Goal

`POST /public/leads` nhận `source: "placement-test"`, bắt buộc `email` khi nguồn này, và lưu nguồn vào `lead.source`; mọi request cũ (không `source`) hành xử y như trước.

## Files to Create / Modify

- Modify: `packages/api/src/lead-contracts.ts`
- Modify: `packages/api/src/lead-contracts.test.ts`
- Modify: `apps/server/src/routes/public-leads.ts`
- Modify: `apps/server/src/routes/public-leads.test.ts`

## Tasks & Steps

1. Trong `lead-contracts.ts` thêm `LEAD_SOURCES = ["profile", "placement-test"] as const` và kiểu `LeadSource`.
2. Thêm `source: z.enum(LEAD_SOURCES).optional()` vào `leadSubmitSchema`, giữ `.strict()`. Sau object thêm `.superRefine`: khi `source === "placement-test"` mà `email` là `undefined` ⇒ issue với `path: ["email"]` và message "Email là bắt buộc". Giữ nguyên hành vi `emailSchema` (chuỗi rỗng ⇒ `undefined`).
3. Trong `public-leads.ts` dùng `const source = submit.source ?? "profile"` thay cho chuỗi cứng ở INSERT (`source` trong cột `SELECT`) và ở `LeadRow` trả về. **Không** đổi `source` trong nhánh dedupe UPDATE (lead tạo từ form trang chủ giữ `profile`).
4. Cập nhật comment đầu file nếu nhắc "form đăng ký trên msmy.io.vn" để nêu thêm nguồn trang test.
5. Test (viết trước, thấy đỏ rồi mới sửa):
   - contract: có `source=placement-test` + email hợp lệ ⇒ parse OK; thiếu email hoặc email `""` ⇒ lỗi path `email`; `source` lạ ⇒ lỗi; không `source` + không email ⇒ OK (hồi quy).
   - route: 201 và `row.source === "placement-test"`; thiếu email ⇒ 400 `LEAD_INVALID` với `fields` chứa `email`, không ghi DB; gửi lần hai cùng SĐT (có `placement`) ⇒ cùng một dòng, `placement` được cập nhật, `submitCount = 2`, **không** gửi email báo thêm; lead tạo từ `profile` rồi gửi lại với `placement-test` ⇒ `source` vẫn `profile`.

## Verification

- `pnpm --filter @teacher-os/api test -- lead-contracts`
- `pnpm --filter server test -- public-leads`
- `pnpm check-types`
- `pnpm exec biome check packages/api apps/server`

## Risk / Rollback

Thay đổi tương thích ngược (trường mới tuỳ chọn). Rollback: revert commit; dữ liệu `source = placement-test` đã ghi vẫn hợp lệ vì cột là `text`.
