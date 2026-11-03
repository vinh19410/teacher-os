---
title: "Plan 536: deploy apps/profile lên msmy.io.vn"
date: 2026-11-01
summary: "Lập plan bốn phase đưa profile vào Alchemy, phát hành hai đợt vì prod chưa có API bộ đề"
---

# Plan 536: deploy apps/profile lên msmy.io.vn

## What happened

Lập plan #536 để đưa `apps/profile` lên Cloudflare tại `msmy.io.vn`. Khảo sát cho thấy việc này không chỉ là thêm một resource: `msmy.io.vn` và `www` đang trả `525`, production chậm `develop` 23 commit nên `/public/placement-test` trả `404`, environment `production` thiếu `TEACHER_EMAILS` và `LEAD_ORG_ID`, staging thiếu `LEAD_ORG_ID`.

## Decision

- Phát hành hai đợt: promote server, cô Mỹ phát hành bộ đề, rồi mới đưa profile lên prod. Runbook #515 đã cấm deploy profile trước khi bộ đề phát hành, và Alchemy apply mọi thứ một lần nên cổng này phải tách bằng PR.
- Ghi lại rồi xóa bản ghi A/AAAA/CNAME web ở apex và www, giữ MX/TXT của Tino.
- `www` là alias kèm canonical, cùng cách với landing.
- Staging dùng `profile.staging.teacheros.io.vn`; chỉ prod được gắn `msmy.io.vn`.

## Chưa kiểm chứng

- Zone `msmy.io.vn` có cùng account không: mới có tín hiệu cùng cặp nameserver.
- CI token có quyền trên zone này không. Staging không đụng zone nên lỗi chỉ lộ ra ở prod, vì vậy đây là preflight bắt buộc.
- Hành vi của `alchemy@2.0.0-beta.72` với bản ghi DNS có sẵn và prop `env` của StaticSite: hook chặn đọc `node_modules`, tài liệu công khai không nêu đủ.

## Next steps

Chạy `/ak-cook plans/261101-0916-536-profile-cloudflare-deploy/plan.md`. PR của Phase 1 chỉ merge sau khi đợt 1 đã lên `main`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
