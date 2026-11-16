---
phase: 1
title: "Phase 1: TDD Unit, Integration & Server Lead Org Resolution"
status: pending
---

# Phase 1: TDD Unit, Integration & Server Lead Org Resolution

## Context & Files

- **Tạo mới:**
  - `/root/orca/workspaces/teacher-os/Debug-entry-test/apps/server/src/lib/resolve-lead-org.ts`
  - `/root/orca/workspaces/teacher-os/Debug-entry-test/apps/server/src/lib/resolve-lead-org.test.ts`
- **Cập nhật:**
  - `/root/orca/workspaces/teacher-os/Debug-entry-test/apps/server/src/routes/public-leads.ts`
  - `/root/orca/workspaces/teacher-os/Debug-entry-test/apps/server/src/routes/public-leads.test.ts`
  - `/root/orca/workspaces/teacher-os/Debug-entry-test/apps/server/src/routes/public-placement-test.ts`
  - `/root/orca/workspaces/teacher-os/Debug-entry-test/apps/server/src/routes/leads-placement-submission.test.ts`
  - `/root/orca/workspaces/teacher-os/Debug-entry-test/apps/server/src/routes/kernel.ts`
  - `/root/orca/workspaces/teacher-os/Debug-entry-test/apps/server/src/routes/placement-test.ts`

## Requirements & Design Constraints

1. **Giữ cầu dao `503`:** Khi `leadOrgId?.trim()` rỗng, trả `null` ngay từ `resolveLeadTargetOrg` (và các route public tiếp tục trả `503 LEAD_INTAKE_DISABLED` / `503 PLACEMENT_DISABLED` trước khi chạm DB).
2. **Chuẩn hóa & lọc `FINANCE_ROLES`:**
   - Import `FINANCE_ROLES` từ `@teacher-os/auth/role`.
   - Join `membership` → `user` → `organization` (đảm bảo org còn tồn tại, khớp `lower(trim(user.email)) IN (...)` và `membership.role IN FINANCE_ROLES`).
   - **Không** lọc `user.email_verified = 1` trong SQL (vì `AUTH_ASSUME_EMAIL_VERIFIED="true"` trên staging có thể khiến `email_verified = 0` trong DB).
   - Thứ tự ưu tiên: index của email trong `teacherEmails` (đã chuẩn hóa lowercase + trim), sau đó `membership.createdAt ASC, membership.id ASC` (khớp `bootstrapMiddleware`).
   - Nếu không có membership khớp, fallback `targetOrgId = configuredLeadOrgId`.
   - `allowedOrgIds`: `[targetOrgId]` nếu trùng `configuredLeadOrgId`, ngược lại `[targetOrgId, configuredLeadOrgId]`.
3. **`loadPublishedPlacementSnapshot`:**
   - Truy vấn bảng `placement_test` với `inArray(placementTest.orgId, resolved.allowedOrgIds)` (1 round-trip D1).
   - Duyệt lần lượt `resolved.allowedOrgIds` (`targetOrgId` ưu tiên trước `configuredLeadOrgId`), parse + chuẩn hóa bằng `normalizePublishedPlacementSnapshot`. Trả bản hợp lệ đầu tiên `{ snapshot, publishedVersion, sourceOrgId }`, hoặc `null`.
4. **Cập nhật route công khai & giáo viên:**
   - `public-leads.ts`: thêm `teacherEmails?: string[]`; sau khi qua check `503`/`403`/`413`/`400`/`201 honeypot`, giải `targetOrgId` và dùng đồng nhất cho `INSERT INTO lead`, dedupe `UPDATE lead`, `countsRow`, và `notifyNewLead`.
   - `public-placement-test.ts`: thêm `teacherEmails?: string[]`; giải `resolvedOrg` trong `GET /`, `GET /audio/:id`, `POST /submissions`, `PUT /submissions/:id/speaking-media`, `GET /results/:token`. Luôn ghi/dedupe/rate-limit `lead` và `placement_test_submission` vào `resolvedOrg.targetOrgId`, đọc snapshot qua `loadPublishedPlacementSnapshot`, lọc `audio` và `submission` bằng `inArray(..., resolvedOrg.allowedOrgIds)`, và dùng `sub.orgId` cho R2 key + CAS update ở `PUT .../speaking-media`.
   - `kernel.ts` & `placement-test.ts`: truyền `teacherEmails?: string[]` qua `kernelRoutes` xuống `placementTestRoutes`, tính `isLeadOrg = Boolean(resolvedOrg && resolvedOrg.targetOrgId === ctx.orgId)` ở `GET /api/placement-test`.

## Tasks

- [ ] **RED:** Viết `resolve-lead-org.test.ts` + bổ sung integration test drift vào `public-leads.test.ts` và `leads-placement-submission.test.ts`; chạy test xác nhận FAIL đúng kỳ vọng.
- [ ] **GREEN:** Triển khai `resolve-lead-org.ts` và cập nhật `public-leads.ts`, `public-placement-test.ts`, `kernel.ts`, `placement-test.ts`.
- [ ] **Verify:** Chạy `pnpm --filter server test` và xác nhận 100% pass không skip/nới assertion.

## Risk & Rollback

- **Rủi ro:** Nếu `user` có `organization` bị xóa hoặc chỉ có role `ta`/`class_teacher` thì query có thể trỏ nhầm org. Đã giảm thiểu bằng `innerJoin(organization, ...)` và lọc `inArray(membership.role, [...FINANCE_ROLES])` kèm unit test riêng.
- **Rollback:** Revert các commit sửa `apps/server/src/`; không đụng D1 schema/migration nên rollback hoàn toàn an toàn.
