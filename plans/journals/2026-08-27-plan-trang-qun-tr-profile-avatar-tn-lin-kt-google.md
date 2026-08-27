---
title: "Plan: trang quản trị profile (avatar, tên, liên kết Google)"
date: 2026-08-27
summary: "Hoàn thành ak-plan --github --advice cho profile page: 3 phase, red-team 12 findings đã apply, issue #94"
---

# Plan: trang quản trị profile (avatar, tên, liên kết Google)

## What happened
- Chạy /ak:plan --github --advice cho trang quản trị profile (đổi avatar, đổi tên, trạng thái liên kết Google + nút kết nối).
- Mode hard: 2 researcher song song (better-auth 1.6.27 source-verified + codebase scan), kongming advisory GO với 4 delta, red-team 3 reviewer → 12 findings (2 Critical, 6 High, 4 Medium) tất cả accepted + applied.
- Plan dir: plans/260827-0949-add-profile-management-page-avatar-name-google-account-linking — 3 phase, issue #94, label "ready to review".

## Decision
- Avatar = data URL sau client resize (192px/64KB) lưu user.image — không R2, không endpoint mới; budget nhỏ vì defaultPreload "intent" fetch get-session cả khi hover.
- Google link: listAccounts() (providerId==="google") + linkSocial với callbackURL ABSOLUTE (split-origin app./api. domain).
- Bắt buộc destructure { error } cho mọi authClient call (client không throw); validateSearch cho param ?error= (better-auth tự append, KHÔNG có linkError).
- Server hook validate /update-user trong createAuth vì signup công khai (premise "app 1 user" sai).
- E2e linked-state: seed thẳng account row vào local.db (id từ JS crypto.randomUUID, PHẢI kèm updated_at — NOT NULL không default, $onUpdate bị raw SQL bypass).

## Next steps
- User review issue #94 → /ak:cook plans/260827-0949-add-profile-management-page-avatar-name-google-account-linking/plan.md
- Khi cook: truyền --advice để supervision tiếp tục; sau PR xanh, kongming review implementation trên PR.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
