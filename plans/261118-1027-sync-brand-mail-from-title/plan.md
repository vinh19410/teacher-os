---
title: "Đồng bộ thương hiệu Cô Mỹ Dạy Tiếng Anh cho MAIL_FROM và tiêu đề phát hành"
description: "Cập nhật biến môi trường staging MAIL_FROM, thêm fromName BRAND_NAME cho email Better-Auth, đổi RELEASE_AUTHOR_NAME cho Discord release webhook và metadata creator."
status: completed
priority: P1
effort: 1h
tags: [branding, auth, infra, mail, scripts]
created: 2026-11-18
---

# Đồng bộ thương hiệu "Cô Mỹ Dạy Tiếng Anh" cho MAIL_FROM và Tiêu đề Phát hành

## Outcome

Đồng bộ triệt để tên hiển thị thương hiệu "Cô Mỹ Dạy Tiếng Anh" thay cho "Teacher OS" / "TeacherOS" ở các vị trí còn sót lại:
1. Biến môi trường GitHub `MAIL_FROM` trên staging đã cập nhật thành `"Cô Mỹ Dạy Tiếng Anh" <no-reply@teacheros.io.vn>`.
2. Lời gọi gửi mail Better-Auth trong `packages/auth/src/index.ts` truyền tường minh `fromName: BRAND_NAME` để phòng vệ triệt để.
3. Hằng số `RELEASE_AUTHOR_NAME` trong `scripts/notify-discord-changelog.mjs` đổi thành `"Cô Mỹ Dạy Tiếng Anh Releases"`.
4. Metadata `workbook.creator` trong `apps/e2e/scripts/regen-syllabus-v4-fixture.mjs` đổi thành `"Cô Mỹ Dạy Tiếng Anh"`.
5. Runbook `docs/production-release-runbook.md` cập nhật hướng dẫn cho staging environment.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Đồng bộ code và tài liệu](./phase-01-sync.md) | completed |

## Success Criteria

- [x] Biến `MAIL_FROM` trên GitHub environment `staging` là `"Cô Mỹ Dạy Tiếng Anh" <no-reply@teacheros.io.vn>`.
- [x] `packages/auth/src/index.ts` truyền `fromName: BRAND_NAME` cho `sendResetPassword` và `sendVerificationEmail`.
- [x] `scripts/notify-discord-changelog.mjs` có `RELEASE_AUTHOR_NAME = "Cô Mỹ Dạy Tiếng Anh Releases"`.
- [x] `apps/e2e/scripts/regen-syllabus-v4-fixture.mjs` có `workbook.creator = "Cô Mỹ Dạy Tiếng Anh"`.
- [x] `docs/production-release-runbook.md` cập nhật ví dụ staging cho `MAIL_FROM`.
- [x] Toàn bộ unit tests liên quan và typecheck xanh (`pnpm check-types`, test mail, test discord).

<!-- slug: sync-brand-mail-from-title -->
