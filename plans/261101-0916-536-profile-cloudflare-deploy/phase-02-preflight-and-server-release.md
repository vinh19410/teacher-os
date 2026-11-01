---
phase: 2
title: "Preflight và đợt 1: promote server, phát hành bộ đề"
status: pending
priority: P1
effort: "1h agent + chờ vận hành"
dependencies: []
---

# Phase 2: Preflight và đợt 1

## Goal

Đưa API và migration đang chờ lên prod, để cô Mỹ phát hành bộ đề và API công khai sẵn sàng trước khi trang lên.

## Files to Create / Modify

- Modify: `docs/production-release-runbook.md` (dòng sign-off của release)

## Tasks & Steps

### Preflight (vận hành xác nhận)

1. Trên Cloudflare dashboard và qua API (`GET /client/v4/zones?name=msmy.io.vn`), xác nhận zone `msmy.io.vn` nằm cùng account với `CLOUDFLARE_ACCOUNT_ID` của environment `production`. <!-- Updated: Red Team RT-5 -->
2. Xác nhận `CLOUDFLARE_API_TOKEN` của environment `production` có phạm vi gồm zone `msmy.io.vn` (bao gồm quyền Workers Domains/Routes trên zone này). Secret này đặt từ 2026-08-30 nên có thể chỉ cấp cho `teacheros.io.vn`. Nếu thiếu, mở rộng token và cập nhật secret.
3. Đối chiếu tài khoản giáo viên trên prod D1, chọn đủ email cho `TEACHER_EMAILS`. Các email này phải đã xác thực (`email_verified = 1`), vì #524 trả `403 ACCOUNT_TEACHER_EMAIL_UNVERIFIED` nếu chưa.
4. Lấy `organization.id` của cô Mỹ trên prod và của tài khoản giáo viên QA trên staging (query join `organization` ↔ `membership` ↔ `user` theo email giáo viên, tránh lấy nhầm org rác từ tài khoản smoke trên staging). Không dán ID hay email vào issue. <!-- Updated: Red Team RT-5 -->
5. Đặt biến (và kiểm tra `gh variable list --env staging` / `--env production` để chắc chắn không còn biến `LEAD_ORIGINS` cũ ghi đè):

   ```bash
   gh variable set TEACHER_EMAILS --env production
   gh variable set LEAD_ORG_ID --env production
   gh variable set LEAD_ORG_ID --env staging
   ```

   Không cần đặt `LEAD_ORIGINS`: topology tự suy ra theo từng stage.

### Promote

6. Tính lại migration đang chờ: `git diff --name-only --diff-filter=A origin/main 7d331c05b305fbe7fd16b98fb0942e5ab93a68cb -- packages/db/src/migrations`. Đảm bảo các migration này (`0057`..`0060`) đã được chạy thử trên `staging` trước khi promote lên `main`. <!-- Updated: Red Team RT-5 -->
7. Backup prod D1 bằng `wrangler d1 export <db> --remote --output backup-<date>.sql`, lưu ngoài repo.
8. Mở PR từ commit `7d331c05b305fbe7fd16b98fb0942e5ab93a68cb` (SHA của `develop` ngay trước khi merge PR Phase 1, **không chứa `profileWorker`**) vào `main`. Thao tác này là phát hành production nên cần người dùng duyệt merge. <!-- Updated: Red Team RT-5 & Kongming -->
9. Theo dõi `deploy.yml` đến khi xanh.

### Phát hành bộ đề

10. Cô Mỹ đăng nhập `https://app.teacheros.io.vn/placement-test`, xác nhận không có cảnh báo lệch tổ chức, nhập đề gốc, nghe thử và bấm **Phát hành**.

## Verification

- `curl -i https://api.teacheros.io.vn/readyz` trả `200 {"ok":true}`.
- `curl -i https://api.teacheros.io.vn/public/placement-test -H "Origin: https://msmy.io.vn"` trả `200` kèm `Access-Control-Allow-Origin: https://msmy.io.vn`.
- `curl -i -H "Range: bytes=0-99" https://api.teacheros.io.vn<src-của-clip-1>` trả `206`.
- Thêm dòng sign-off vào runbook với commit, người vận hành và kết quả smoke.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.

Ghi chú vận hành: Deploy fail vì `TEACHER_EMAILS` rỗng → đặt biến rồi chạy lại `workflow_dispatch`. Giáo viên bị khóa sau deploy → bổ sung email rồi deploy lại, không nới lỏng kiểm tra `emailVerified`.
