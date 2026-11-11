---
title: "Plan #652: loại bỏ goto Vite ở verify-email và thêm retry theo SEED_DEADLINE"
date: 2026-11-11
summary: "TDD handover plan (#652): API verify-email + non-nested withNavRetry + SEED_DEADLINE"
---

# Plan #652: loại bỏ goto Vite ở verify-email và thêm retry theo SEED_DEADLINE

Lập kế hoạch TDD + bàn giao `--advice` (2 phase) cho issue #652 (`design-seed.ts` nổ `TimeoutError: page.goto(...verify-email...%3Fverified%3Dok), waiting until "load"` khi máy tải 4 core).

- **Root cause & thiết kế**: `design:compare` không chụp màn `/verify-email` (luồng UI xác thực đã được phủ bởi E2E specs). Thay vì mở `verifyUrl` qua `studentPage.goto` (đụng cold-transform Vite dev của cổng student), Step 7 đóng nguyên tử `studentPage` ngay sau `POST /api/auth/sign-up/email` (chặn race `window.location.assign("/")` của `SignUpForm`), gọi `studentCtx.request.get(verifyUrl, { maxRedirects: 0 })` trực tiếp vào `boot:api`, kiểm tra `302` + `Location` tuyệt đối + cookie phiên + `GET /api/auth/get-session` (`emailVerified === true`).
- **Red Team & Kongming gates**: Áp dụng 7/8 findings từ Red Team 2 chiều và tinh chỉnh từ Kongming Checkpoint 2 (chặn bypass relative `Location`, redact đầy đủ `?token=` / `%3Ftoken%3D` / `/reset-password/` / `/pay/` và `safeLabel` cho mọi nhánh lỗi không kèm `Error.cause`, kẹp `SEED_DEADLINE = 390s` qua `clampTimeoutMs`, bọc retry không lồng nhau cho phần điều hướng chỉ-đọc của Step 8, quyền `0o700`/`0o600` cho `.state`).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
