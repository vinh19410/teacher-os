---
phase: 2
title: "Phase 2: Live Smoke Checks, Verification & Docs"
status: pending
priority: P1
effort: "30m"
dependencies: [1]
---

# Phase 2: Live Smoke Checks, Verification & Docs

## Goal

Xác minh thực nghiệm đầu ra bundle `apps/student` qua `apps/lms` ở cả hai chế độ staging (`true`) và prod (`false`), bổ sung smoke check tách biệt trên mọi chunk `/student/` ở cả `deploy-staging.yml` (positive check) lẫn `deploy.yml` (negative check), cập nhật tài liệu vận hành kèm trust boundary UI-only, và chạy đầy đủ local quality gates.

<!-- Updated: Red Team Session 2026-11-22 - Findings 2, 4, 6, 7 applied -->

## Files to Create / Modify

- Modify: `.github/workflows/deploy-staging.yml` (smoke check positive `required_pattern` tách biệt `found_api` / `found_required` trên mọi chunk `/student/`)
- Modify: `.github/workflows/deploy.yml` (smoke check negative `forbidden_pattern` trên mọi chunk `/student/` đảm bảo PROD không chứa `VITE_STUDENT_PRACTICE_ENABLED:"true"`)
- Modify: `scripts/topology-drift.test.mjs` (khoá cả positive smoke check trên staging và negative smoke check trên prod)
- Modify: `AGENTS.md` (cập nhật ghi chú #852: staging đặt `STUDENT_PRACTICE_ENABLED=true`, PROD fail-closed, ghi rõ trust boundary UI-only)
- Modify: `docs/production-release-runbook.md` (bảng topology, lệnh `Provision staging`, mục `Automated staging deploy`, và trust boundary UI-only)

## Tasks & Steps

1. **Xác minh thực nghiệm định dạng bundle biên dịch bởi Vite/Rolldown:**
   - Chạy build thật `LMS_REBUILD_PORTALS=1 VITE_SERVER_URL=https://api.staging.teacheros.io.vn VITE_STUDENT_PRACTICE_ENABLED=true pnpm --filter lms build` và kiểm tra file `apps/lms/dist/student/assets/*.js` khớp chính xác regex `VITE_STUDENT_PRACTICE_ENABLED["']?[[:space:]]*:[[:space:]]*["']true["']` (đồng thời xác nhận hậu kiểm trong `assemble-dist.mjs` pass).
   - Chạy build thật `LMS_REBUILD_PORTALS=1 VITE_SERVER_URL=https://api.msmy.io.vn VITE_STUDENT_PRACTICE_ENABLED=false pnpm --filter lms build` và xác nhận `apps/lms/dist/student/assets/*.js` không chứa `VITE_STUDENT_PRACTICE_ENABLED:"true"` (đồng thời kiểm chứng khi không đặt `LMS_REBUILD_PORTALS=1` mà đổi ngược cờ, `assemble-dist.mjs` tự phát hiện stale và rebuild `student`).

2. **Bổ sung smoke check live cho `/student/` trên cả staging (positive) và prod (negative):**
   - Trong bước `Smoke check LMS & legacy 301 redirects` của `.github/workflows/deploy-staging.yml`:
     - Mở rộng `check_shell_headers` nhận tham số thứ 3 tuỳ chọn `required_pattern="${3:-}"`.
     - Tách hai cờ trạng thái độc lập `found_api=""` và `found_required=""` xuyên suốt cả vòng eager assets lẫn lazy assets; chỉ `break` sớm khi `[ -n "$found_api" ] && { [ -z "$required_pattern" ] || [ -n "$found_required" ]; }`.
     - Dùng `grep -Eq -- "$required_pattern" /tmp/lms-asset.js` và in thông báo lỗi riêng nếu thiếu `required_pattern`.
     - Gọi `check_shell_headers "$LMS_ORIGIN/student/" "true" 'VITE_STUDENT_PRACTICE_ENABLED["'\'']?[[:space:]]*:[[:space:]]*["'\'']true["'\'']'`.
   - Trong bước `Smoke check LMS & legacy 301 redirects` của `.github/workflows/deploy.yml`:
     - Mở rộng `check_shell_headers` nhận tham số thứ 3 tuỳ chọn `forbidden_pattern="${3:-}"`.
     - Khi `forbidden_pattern` không rỗng, quét hết toàn bộ eager + lazy chunks (không `break` sớm sau khi thấy `$API_BASE_URL` nếu chưa hết chunks), và fail ngay nếu `grep -Eq -- "$forbidden_pattern" /tmp/lms-asset.js` khớp.
     - Gọi `check_shell_headers "$LMS_ORIGIN/student/" "true" 'VITE_STUDENT_PRACTICE_ENABLED["'\'']?[[:space:]]*:[[:space:]]*["'\'']true["'\'']'`.
   - Cập nhật `scripts/topology-drift.test.mjs` để khoá cả hai kiểm tra smoke mới trên `deploy-staging.yml` và `deploy.yml`.

3. **Cập nhật tài liệu vận hành và trust boundary:**
   - Cập nhật `AGENTS.md` dòng 16: nêu rõ `STUDENT_PRACTICE_ENABLED="true"` được bật trên staging (`deploy-staging.yml` → `alchemy.run.ts` → `VITE_STUDENT_PRACTICE_ENABLED` trên `lms` Worker), PROD giữ mặc định tắt và fail-closed trong `resolveStudentPracticeEnabled`, e2e tự bật; ghi rõ **trust boundary**: lớp cờ này chỉ ẩn 2 mục điều hướng trên sidebar (`STUDENT_NAV`), không chặn CTA `/practice/vocabulary` ở trang chủ, truy cập URL trực tiếp (`/practice/*`, `/history`), hay API `/api/student/practice/*` & `/api/student/history/*`.
   - Cập nhật `docs/production-release-runbook.md`:
     - Thêm dòng `STUDENT_PRACTICE_ENABLED` / `VITE_STUDENT_PRACTICE_ENABLED` vào bảng topology (kèm ghi chú UI-only boundary và fail-closed trên PROD).
     - Cập nhật lệnh `Provision staging` (`env APP_DOMAIN=staging.teacheros.io.vn STUDENT_PRACTICE_ENABLED=true pnpm alchemy deploy --stage staging`).
     - Cập nhật mô tả mục `Automated staging deploy (CI/CD)` phản ánh `STUDENT_PRACTICE_ENABLED=true` và smoke check `/student/`.

4. **Chạy toàn bộ local quality gates:**
   - `pnpm exec biome check .`
   - `pnpm check-types`
   - `pnpm test` (gồm turbo unit tests + `test:ci-workflow` + `test:topology-drift` + các contract test gốc)
   - Không chạy full E2E suite ở local (theo quy ước `AGENTS.md`).

## Todo

- [x] Xác minh thực nghiệm bundle `apps/lms/dist/student/assets/*.js` cho staging (`true`), prod (`false`), và auto-rebuild stale dist
- [x] Bổ sung smoke check positive (`deploy-staging.yml`) và negative (`deploy.yml`) tách biệt across-chunks, cùng drift tests trong `scripts/topology-drift.test.mjs`
- [x] Cập nhật `AGENTS.md` và `docs/production-release-runbook.md` (bảng topology, `Provision staging`, `Automated staging deploy`, trust boundary UI-only)
- [x] Chạy đầy đủ local gates (`pnpm exec biome check .`, `pnpm check-types`, `pnpm test`) đều xanh

## Verification

```bash
pnpm exec biome check . && pnpm check-types && pnpm test
```
