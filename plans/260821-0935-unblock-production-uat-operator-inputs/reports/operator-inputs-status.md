# Operator inputs status — blocker #41 (verdict-only)

Tracker per-item cho 5 inputs của [#41](https://github.com/vinh19410/teacher-os/issues/41). Chỉ ghi verdict + timestamp + kênh — không hostname, không zone name/ID, không client ID, không account identity. Issue #41 giữ mở làm tracker đến khi evidence r2 (phase 2) hoàn tất.

| # | Input (item trong #41) | Status | Verdict / evidence (verdict-only) |
|---|---|---|---|
| 1 | Production domain + `APP_DOMAIN` (kèm dọn `CORS_ORIGIN` dev khỏi `apps/server/.env`) | ✅ verdict pass | 2026-08-30: operator chọn domain (redacted). Zone check Cloudflare API `GET /zones?name=` → success, 1 zone, status `active`. Dry-run `APP_DOMAIN=<domain> pnpm alchemy plan --stage prod` (main checkout, no-apply) → topology derive OK, "Plan: 3 to update". Cả 3 env file: không `CORS_ORIGIN`, không persist `APP_DOMAIN`. |
| 2 | Google OAuth redirect URI `https://api.<APP_DOMAIN>/api/auth/callback/google` | ❌ fail — chờ operator sửa | 2026-08-30: authorize precheck → Google trả `redirect_uri_mismatch` (cả URI không và có trailing slash). Operator khai báo đã register nhưng Google xác nhận URI KHÔNG nằm trên client của `GOOGLE_CLIENT_ID` đang dùng. Khả năng cao: register nhầm OAuth client (app dùng client `849029…`-prefix), hoặc chưa propagate. Cần: register lại trên đúng client, rồi agent re-run precheck. |
| 3 | Dedicated Google UAT account | ✅ verdict pass | 2026-08-30: operator xác nhận đã cấp qua GitHub environment secret (out of band, không identity trong repo). |
| 4 | Incognito Safari runner (+ Chrome runner) | ✅ verdict pass | 2026-08-30: operator chỉ định runner = AI agent điều khiển cả hai trình duyệt theo [uat-runner-kit.md](./uat-runner-kit.md); evidence phase 2 ghi runner tương ứng. |
| 5 | Release sign-off row values (operator, restore authority/approver) | ⏳ waiting operator | Row điền vào runbook **trước** deploy, theo cột runbook — không hostname literal (approved deviation, xem phase-02). |

## Agent-side progress (không chờ operator)

- [x] Harden `packages/infra/alchemy.run.ts`: dev default `http://localhost:8001` chỉ áp cho `alchemy dev` (argv); deploy/plan thiếu explicit khi topology-unset fail-loud; topology set + explicit mismatch → throw (red-team 2026-08-21)
- [x] Runbook: deploy/rollback inline `APP_DOMAIN` không rơi vào shell history; staging bootstrap inline `CORS_ORIGIN` (không persist `.env`)
- [x] README + `.env.example` đồng bộ inline policy
- [x] Drift assertions (dev CORS default ↔ web dev port; không persist CORS_ORIGIN/APP_DOMAIN)
- [x] Runner kit viết xong
- [x] Cleanup PR merge vào `develop` (PR #49, 2026-08-21 — 4 gates xanh, proof trong #48)
- [x] Xóa `CORS_ORIGIN` khỏi `apps/server/.env` tại main checkout sau khi verify HEAD == merge SHA; `pnpm dev` proof (2026-08-21, ghi trong #48; re-verified 2026-08-30: `grep -c CORS_ORIGIN apps/server/.env` = 0)
- [ ] Dry-run no-apply `APP_DOMAIN=… pnpm alchemy plan --stage prod` tại main checkout (không `--yes`) — _chờ operator chọn domain (gate 1)_

_Cập nhật file này mỗi khi một item đổi trạng thái; đồng bộ comment tương ứng vào #41._
