---
phase: 3
title: "Phase 3: E2E, UI Verification, Review & Beta Ship"
status: todo
---

# Phase 3: E2E, UI Verification, Review & Beta Ship

## Overview

Hợp nhất 2 worktree thực thi, cập nhật E2E specs liên quan, kiểm tra UI ở 3 viewport (desktop/tablet/mobile, light/dark), chạy toàn bộ gate local, review cô lập, ship PR hướng `develop` với `--beta --merge`, theo dõi CI và đăng POT lên GitHub Issue `#716`.

## Implementation Steps

1. Merge 2 nhánh worktree của Phase 1 & Phase 2 vào `vinh19410/Sync-Student` và dọn worktree.
2. Cập nhật `apps/e2e/specs/student-org-invitation-and-switcher.spec.ts` và `apps/e2e/specs/modal-form-spacing.spec.ts`; chạy spec lẻ liên quan trên cổng E2E `8100-8105`.
3. Kiểm tra UI 3 viewport (`1440x900`, `768x1024`, `375x812`, light/dark) và `design:compare`, lưu ảnh POT vào `plans/reports/716-*.png`.
4. Chạy `pnpm check:fix`, `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`.
5. Chạy code review cô lập, cập nhật `package.json` + `CHANGELOG.md`, commit + push, mở PR vào `develop`, chạy `ak-review-pr --fix --reply --merge`, theo dõi CI/staging, cập nhật issue `#716` (`shipped`) + comment POT có permalink theo SHA.

## Tasks

- [ ] Merge worktrees & update/pass targeted E2E specs (`8100-8105`)
- [ ] Verify 3-viewport UI light/dark & capture POT screenshots in `plans/reports/`
- [ ] Pass `biome check .`, `check-types`, `pnpm test`, and isolated `code-reviewer`
- [ ] Ship PR to `develop`, merge, verify CI, post POT on `#716`, set `shipped`
