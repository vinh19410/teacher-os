---
phase: 4
title: "Docs + CHANGELOG"
status: completed
priority: P2
effort: "1h"
dependencies: [2]
---

# Phase 4: Docs + CHANGELOG

## Goal

Cập nhật tài liệu architecture/runbook/codebase/README cho đúng topology mới (apex giờ là landing, web chỉ còn `app.<domain>`, thêm env `LANDING_ORIGIN` + port 8002) và ghi CHANGELOG. Có thể chạy song song với phase 3 (cùng blockedBy phase 2) nhưng cùng người thì làm tuần tự cho nhất quán.

## Files to Create / Modify

- Modify: `docs/system-architecture.md`
- Modify: `docs/production-release-runbook.md`
- Modify: `docs/codebase-summary.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

## Tasks & Steps

1. **`docs/system-architecture.md`**:

   - "Current request flow" (`:5`): thêm nhánh đầu — request apex/`www.teacheros.io.vn` → landing StaticSite (assets-only Worker) serve trang marketing tĩnh; web app vẫn `app.<domain>`, API vẫn `api.<domain>`.
   - "Boundary map" (`:16`): thêm dòng ownership `apps/landing` (static landing page, zero-framework, deploy apex).

2. **`docs/production-release-runbook.md`**:

   - "Topology — single source of truth" (`:7`): cập nhật bảng/đoạn mô tả hostname — apex + www giờ thuộc landing Worker; web không còn alias; thêm `LANDING_ORIGIN` vào danh sách env/origin mà deploy dùng.
   - "Environments and stages" (`:37`): ghi rõ cả prod lẫn staging có landing apex tương ứng (`teacheros.io.vn` / `staging.teacheros.io.vn`).
   - Ghi chú handover: lần deploy đầu sau thay đổi này sẽ detach apex/www khỏi web Worker và attach vào landing Worker trong cùng apply — chạy staging trước; cert đã tồn tại trong zone.
   - **GIỮ NGUYÊN** dòng google redirect URI dạng `https://api.<domain>/api/auth/callback/google` — drift test assert chuỗi này tồn tại trong runbook (`scripts/topology-drift.test.mjs:24`).

3. **`docs/codebase-summary.md`** — thêm mục `apps/landing` (static landing page, zero-framework, public/index.html từ thiết kế Open Design, build = copy, serve.mjs :8002, không có dependencies).

4. **`README.md`**:

   - Đoạn local dev (`:51-52`): thêm dòng landing — `pnpm dev:landing` chạy ở `http://localhost:8002`.
   - Bảng/đoạn liệt kê apps hoặc ports nếu có: bổ sung landing 8002 cạnh server 8000 / web 8001.

5. **`CHANGELOG.md`** — thêm mục vào `### Added` của section `## 2026-09-22` (section đã tồn tại), ghi số issue/PR cuối dòng (orchestrator backfill):

   > Landing page tĩnh `apps/landing` (zero-framework theo thiết kế Open Design) deploy ở apex `teacheros.io.vn` (+www) qua `Cloudflare.Website.StaticSite`; apex không còn 301 về `app.<domain>`, web app giữ nguyên ở `app.<domain>` (…)

## Verification

- `pnpm test:topology-drift` — các test chạm runbook (google redirect URI, không persist APP_DOMAIN/CORS_ORIGIN) không vỡ.
- Grep nhất quán: `grep -rn "301" docs/ README.md` — không còn mô tả apex 301 về app; `grep -rn "appAliases\|landingHost" docs/` khớp topology mới.
- Đọc lại 5 file: không còn chỗ nào nói apex serve web app.
