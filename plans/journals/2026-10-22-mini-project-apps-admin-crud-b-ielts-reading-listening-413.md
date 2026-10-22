---
title: "Mini project apps/admin — CRUD bộ đề IELTS Reading & Listening (#413)"
date: 2026-10-22
---

# Mini project apps/admin — CRUD bộ đề IELTS Reading & Listening (#413)

## Kết quả
Plan `261022-1025-admin-app-ielts-library` hoàn thành 7 phase trên branch `feat/413-admin-app-ielts-library`, PR vào `develop` (beta ship, ak-vibe --ship --beta --advice).

## Kiến trúc
- Role `admin` + origin `admin.<domain>` (8004/8104), 3 lớp gate: sign-up chỉ qua `ADMIN_EMAILS` (403 ADMIN_SIGNUP_FORBIDDEN), session role-match, `requireAdmin` re-check allowlist + emailVerified mỗi request. Admin bị 403 trên kernel tree (không bootstrap org) và `/api/student`.
- Bảng global `library_test`/`library_test_part` (không orgId, unique slot, cascade) — migration 0043 thuần CREATE.
- Router `/api/admin/library` 10 endpoint, CSRF riêng (Origin ∈ adminOrigins, fail-closed, chỉ WRITE_METHODS), audio R2 `library-audio` 50MB MIME allowlist, upload CAS key mới→row→xóa key cũ nền (orphan cleanup là quyết định có comment), store vắng → 503.
- Editors trích `apps/web` → `packages/ui` (git mv + shim, 1552 test giữ nguyên), scaffold `apps/admin` từ student, UI CRUD (URL filter, editor tab slot, publish bar dùng `validatePartForReady`, XHR upload progress).

## Điểm tricky
- CSRF phải fail-closed khi Origin vắng; audio upload phải CAS để 2 upload song song không mất key đang phát.
- `GET /api/admin/me` ban đầu không ai mount → guard console chết hoàn toàn; e2e đỏ bắt được, thêm `createAdminMeRoutes`.
- Landmine có sẵn: `packages/db` thiếu vitest config → sau `tsc -b`, vitest nhặt test từ `dist/` đỏ vì thiếu migrations SQL. Fix theo pattern `packages/api`.
- develop di chuyển giữa chừng (#414 fix Card v2 padding ở primitive) → merge conflict với shim Phase 4; resolution: giữ shim + port fix `p-6` sang `web-kit/card.tsx`.

## Verification
Local đúng chuỗi CI: install --frozen-lockfile ✓, biome ✓, test 10/10, check-types 8/8, build 5/5. E2E full 187 passed / 1 skipped / 0 failed. Code review: 0 Critical / 0 Important / 2 Minor (đã xử lý). Kongming checkpoints: plan gates GO, implementation GO, pre-ship GO.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
