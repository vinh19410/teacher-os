---
title: "Phase 1: Đồng bộ code và tài liệu"
status: completed
---

# Phase 1: Đồng bộ code và tài liệu

## Overview

Đồng bộ các vị trí code, script phát hành và tài liệu liên quan đến tên người gửi mail và tiêu đề hiển thị:
1. `packages/auth/src/index.ts`: Bổ sung `fromName: BRAND_NAME` cho 2 lời gọi mailer trong Better-Auth.
2. `scripts/notify-discord-changelog.mjs`: Đổi `RELEASE_AUTHOR_NAME = "Cô Mỹ Dạy Tiếng Anh Releases"`.
3. `apps/e2e/scripts/regen-syllabus-v4-fixture.mjs`: Đổi `workbook.creator = "Cô Mỹ Dạy Tiếng Anh"`.
4. `docs/production-release-runbook.md`: Thêm lệnh cho biến môi trường staging.

## Requirements

- [x] Lời gọi `sendResetPassword` truyền `fromName: BRAND_NAME`.
- [x] Lời gọi `sendVerificationEmail` truyền `fromName: BRAND_NAME`.
- [x] `RELEASE_AUTHOR_NAME` trong `scripts/notify-discord-changelog.mjs` mang tên thương hiệu mới.
- [x] `scripts/notify-discord-changelog.test.mjs` pass.
- [x] `apps/e2e/scripts/regen-syllabus-v4-fixture.mjs` cập nhật creator.
- [x] `docs/production-release-runbook.md` cập nhật hướng dẫn cho staging.

## Implementation Steps

1. Sửa `packages/auth/src/index.ts` để truyền `fromName: BRAND_NAME`.
2. Sửa `scripts/notify-discord-changelog.mjs` cập nhật `RELEASE_AUTHOR_NAME`.
3. Sửa `apps/e2e/scripts/regen-syllabus-v4-fixture.mjs`.
4. Sửa `docs/production-release-runbook.md`.
5. Chạy unit tests: `pnpm --filter @teacher-os/auth test`, `node --test scripts/notify-discord-changelog.test.mjs`.
6. Chạy `pnpm check-types` và `pnpm exec biome check .`.

## Success Criteria

Tất cả các file được chỉnh sửa sạch sẽ, test và lint xanh.
