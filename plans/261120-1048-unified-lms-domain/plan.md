# Plan: Gộp 3 subdomain (`app.`, `student.`, `admin.`) về 1 domain `lms.<domain>` (#866)

- **Issue:** https://github.com/vinh19410/teacher-os/issues/866
- **Branch:** `vinh19410/Detect-role-auto-redirect` → PR vào `develop` (`--merge --beta`)
- **Status:** Done

## Waves & File Ownership

| Wave | Piece | Files Owned | Status |
|---|---|---|---|
| 1 | `auth-server` | `packages/auth/**`, `apps/server/**` | Done |
| 1 | `profile` | `apps/profile/**` | Done |
| 2 | `lms-app` | `apps/lms/**` (new package) | Done |
| 2 | `web-basepath` | `apps/web/**` | Done |
| 2 | `student-basepath` | `apps/student/**` | Done |
| 2 | `admin-basepath` | `apps/admin/**` | Done |
| 3 | `infra-ci-e2e` | `packages/infra/**`, `.github/workflows/deploy*.yml`, `scripts/topology-drift.test.mjs`, `scripts/devserver-watchdog.test.mjs`, `apps/e2e/**`, `package.json`, `pnpm-lock.yaml`, `docs/production-release-runbook.md` | Done |
| 4 | `isolated-review-and-ship` | Fresh isolated `code-reviewer`, PR to `develop`, merge, staging smoke + POT on #866 | Done |

## Acceptance Criteria (Done means)
1. 1 Cloudflare Worker `lms` gắn `lms.<domain>` + 3 alias cũ (`app.`, `student.`, `admin.`) trả 301 (giữ `200 text/javascript` cho `/sw.js`, `/registerSW.js`); `test:topology-drift` & `test:ci-workflow` pass.
2. `packages/auth` & `apps/server` hỗ trợ 1 origin `lms.<domain>`, đăng ký phân role `ADMIN_EMAILS > TEACHER_EMAILS > student`, đăng nhập không chặn `ROLE_MISMATCH` theo origin, giữ API guards 403 theo role + allowlist.
3. `apps/lms` + `/teacher` (`apps/web`), `/student` (`apps/student`), `/admin` (`apps/admin`) chạy trên 1 origin; tự redirect theo role, mở nhầm prefix tự redirect về đúng cổng, chống vòng lặp allowlist, đăng xuất về `/login`.
4. Toàn bộ link email, link thanh toán `/pay/:token`, và nút "Góc học viên" trên `apps/profile` trỏ sang `lms.<domain>`.
5. `pnpm check`, `pnpm check-types`, `pnpm test`, `pnpm build` và spec E2E liên quan pass; review độc lập sạch blocking.
6. PR vào `develop` xanh CI, merge vào `develop`, `deploy-staging.yml` deploy `lms.staging.teacheros.io.vn` + smoke checks xanh, issue #866 chuyển `shipped` kèm comment POT.
