---
title: "Ship release v0.0.11 — truyền biến mail vào deploy"
date: 2026-10-01
type: ship
---

# Ship release v0.0.11 — truyền biến mail vào deploy

## Bối cảnh

Student đăng ký xong không nhận được mail kích hoạt (issue #293). Debug bằng đọc cấu hình, chưa có log runtime.

## Nguyên nhân

- `apps/server/src/index.ts` dùng `createLogMailer()` khi `MAILER_IMPL` khác `resend`; nhánh sign-up trong `packages/auth/src/index.ts` nuốt lỗi gửi mail nên học viên không thấy gì.
- `alchemy.run.ts` mặc định `MAILER_IMPL=log`, đọc từ môi trường lúc deploy. `deploy.yml` / `deploy-staging.yml` chỉ truyền 5 biến, nên mỗi lần deploy worker bị ghi đè về log-only.
- Log deploy gần nhất (run 36733478213) chỉ ghi `injected env (0)`.

## Quyết định

- Biến mail đặt trên GitHub environment (`RESEND_API_KEY` là secret, hai biến còn lại là variable) và truyền qua `env:` của bước deploy. Giữ đúng cơ chế đang dùng cho 5 secret cũ, không thêm cơ chế mới.
- Dispatch deploy từ `develop` bị environment protection của `production` chặn (chỉ cho `main`), không đổi protection rule. Đi theo promotion convention `develop` → `main`.
- Bump 0.0.11 vì thay đổi hạ tầng có hiệu lực lên prod.

## Việc còn lại

- Xác nhận sau deploy: đăng ký thử một student thật, mail phải vào inbox. Chưa có bằng chứng runtime cho đến lúc đó.
- Staging chưa có 3 biến mail; đặt khi cần gửi mail thật ở staging.
- `RESEND_API_KEY` trong `alchemy.run.ts` vẫn là plaintext (nợ kỹ thuật đã ghi từ release 0.0.7).
- `packages/infra/.env` local có `MAIL_FROM` thiếu dấu `>` — sửa tay, file này ngoài git.
