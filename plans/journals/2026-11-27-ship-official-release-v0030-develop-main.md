---
title: Ship official release v0.0.30 (develop → main)
date: 2026-11-27
summary: "Chuẩn bị bản phát hành 0.0.30 với MCP server, xem bài tự chấm và giữ recording R2"
---

# Ship official release v0.0.30 (develop → main)

## Phạm vi

Promote `develop` lên `main`, bump 0.0.29 → 0.0.30: MCP server và token cá nhân (#1029, migration `0099`), điểm và bài làm tự chấm phía giáo viên (#977, #978), giữ recording R2 khi đổi lịch (#1015), kiểm tra `ZOOM_HOST_USER` (#1031). Tab bài tập học viên (#1026) đã được cherry-pick lên `main` trước đó.

## Quá trình

- Gộp `origin/main` vào `develop` không xung đột; cây mã sau gộp trùng `origin/develop` (`b3d18934`, đã xanh CI và deploy staging).
- Gate local: `pnpm exec biome check .` exit 0, `pnpm check-types` 14/14, `pnpm test` 13/13 task (server 1938 qua + 1 expected fail, web 2592 qua). Không chạy full E2E ở local.
- Review độc lập trước phát hành: 0 Critical, 0 High. Còn mở: `/mcp` chưa có rate limit; đăng xuất hoặc đặt lại mật khẩu không thu hồi token MCP; chưa có kiểm chứng Zoom Server-to-Server chấp nhận `me`.
- Bổ sung mục CHANGELOG còn thiếu (#978, #1015, #1026), mục runbook cho `0099` và sửa dòng giới hạn đã cũ trong README.

## Việc tiếp theo

- Người vận hành backup D1 prod trước khi merge.
- Sau deploy: kiểm `/readyz`, thử tạo lịch Zoom và xem log `ZOOM_INVALID_CONFIG`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
