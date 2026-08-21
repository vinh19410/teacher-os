# Operator inputs status — blocker #41 (verdict-only)

Tracker per-item cho 5 inputs của [#41](https://github.com/vinh19410/teacher-os/issues/41). Chỉ ghi verdict + timestamp + kênh — không hostname, không zone name/ID, không client ID, không account identity. Issue #41 giữ mở làm tracker đến khi evidence r2 (phase 2) hoàn tất.

| # | Input (item trong #41) | Status | Verdict / evidence (verdict-only) |
|---|---|---|---|
| 1 | Production domain + `APP_DOMAIN` (kèm dọn `CORS_ORIGIN` dev khỏi `apps/server/.env`) | ⏳ waiting operator | Cleanup PR đã có code hardening (fail-loud). Operator chưa chọn domain. Sau khi có domain: agent verify zone in-account qua Cloudflare API (`GET /zones?name=<domain>`, verdict-only) rồi mới tick. |
| 2 | Google OAuth redirect URI `https://api.<APP_DOMAIN>/api/auth/callback/google` | ⏳ waiting operator (chỉ làm được sau #1) | Operator register trên đúng client của `GOOGLE_CLIENT_ID` + audit URI dev cũ; agent chạy authorize precheck (`redirect_uri_mismatch` phải vắng mặt). |
| 3 | Dedicated Google UAT account | ⏳ waiting operator | Out of band; bản ghi mục tiêu: "supplied: yes + timestamp + kênh". |
| 4 | Incognito Safari runner (+ Chrome runner) | ⏳ waiting operator | Runner kit đã viết: [uat-runner-kit.md](./uat-runner-kit.md). |
| 5 | Release sign-off row values (operator, restore authority/approver) | ⏳ waiting operator | Row điền vào runbook **trước** deploy, theo cột runbook — không hostname literal (approved deviation, xem phase-02). |

## Agent-side progress (không chờ operator)

- [x] Harden `packages/infra/alchemy.run.ts`: dev default `http://localhost:8001` chỉ áp cho `alchemy dev` (argv); deploy/plan thiếu explicit khi topology-unset fail-loud; topology set + explicit mismatch → throw (red-team 2026-08-21)
- [x] Runbook: deploy/rollback inline `APP_DOMAIN` không rơi vào shell history; staging bootstrap inline `CORS_ORIGIN` (không persist `.env`)
- [x] README + `.env.example` đồng bộ inline policy
- [x] Drift assertions (dev CORS default ↔ web dev port; không persist CORS_ORIGIN/APP_DOMAIN)
- [x] Runner kit viết xong
- [ ] Cleanup PR merge vào `develop` (4 gates xanh) — _pending_
- [ ] Xóa `CORS_ORIGIN` khỏi `apps/server/.env` tại main checkout sau khi verify HEAD == merge SHA; `pnpm dev` proof
- [ ] Dry-run no-apply `APP_DOMAIN=… pnpm alchemy plan --stage prod` tại main checkout (không `--yes`)

_Cập nhật file này mỗi khi một item đổi trạng thái; đồng bộ comment tương ứng vào #41._
