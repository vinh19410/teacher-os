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

1. Trên Cloudflare dashboard, xác nhận zone `msmy.io.vn` nằm cùng account với `CLOUDFLARE_ACCOUNT_ID` của environment `production`.
2. Xác nhận `CLOUDFLARE_API_TOKEN` của environment `production` có phạm vi gồm zone `msmy.io.vn`. Secret này đặt từ 2026-08-30 nên có thể chỉ cấp cho `teacheros.io.vn`. Nếu thiếu, mở rộng token và cập nhật secret.
3. Đối chiếu tài khoản giáo viên trên prod D1, chọn đủ email cho `TEACHER_EMAILS`. Các email này phải đã xác thực, vì #524 trả `403 ACCOUNT_TEACHER_EMAIL_UNVERIFIED` nếu chưa.
4. Lấy `organization.id` của cô Mỹ trên prod và staging. Không dán ID hay email vào issue.
5. Đặt biến:

   ```bash
   gh variable set TEACHER_EMAILS --env production
   gh variable set LEAD_ORG_ID --env production
   gh variable set LEAD_ORG_ID --env staging
   ```

   Không cần đặt `LEAD_ORIGINS`: topology tự suy ra.

### Promote

6. Tính lại migration đang chờ: `git diff --name-only --diff-filter=A origin/main origin/develop -- packages/db/src/migrations`. Xác nhận từng migration đã chạy trên staging.
7. Backup prod D1 bằng `wrangler d1 export <db> --remote --output backup-<date>.sql`, lưu ngoài repo.
8. Mở PR `develop` → `main` **không chứa PR của Phase 1**. Thao tác này là phát hành production nên cần người dùng duyệt merge.
9. Theo dõi `deploy.yml` đến khi xanh.

### Phát hành bộ đề

10. Cô Mỹ đăng nhập `https://app.teacheros.io.vn/placement-test`, xác nhận không có cảnh báo lệch tổ chức, nhập đề gốc, nghe thử và bấm **Phát hành**.

## Verification

- `curl -i https://api.teacheros.io.vn/readyz` trả `200 {"ok":true}`.
- `curl -i https://api.teacheros.io.vn/public/placement-test -H "Origin: https://msmy.io.vn"` trả `200` kèm `Access-Control-Allow-Origin: https://msmy.io.vn`.
- `curl -i -H "Range: bytes=0-99" https://api.teacheros.io.vn<src-của-clip-1>` trả `206`.
- Thêm dòng sign-off vào runbook với commit, người vận hành và kết quả smoke.

## Failure Protocol

Deploy fail vì `TEACHER_EMAILS` rỗng: đặt biến rồi chạy lại `workflow_dispatch`. Giáo viên bị khóa sau deploy: bổ sung email rồi deploy lại, không nới lỏng kiểm tra `emailVerified`.
