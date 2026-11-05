---
phase: 2
title: "Tách state store riêng"
status: pending
priority: P1
effort: "4h"
dependencies: [1]
---

# Phase 2: Tách state store riêng

## Goal

teacher-os dùng store riêng qua `Cloudflare.state({ workerName })`, với toàn bộ state hiện có được chuyển sang trước khi đổi cấu hình.

## Files to Create / Modify

- Modify: `packages/infra/alchemy.run.ts`, các workflow deploy, `docs/production-release-runbook.md`
- Create: script chuyển state một lần dùng `syncState` của Alchemy, chỉ copy stack `teacher-os`

## Tasks & Steps

1. Xác minh `syncState` không ghi vào store nguồn và chỉ copy stack `teacher-os`.
2. Bootstrap store mới trong CI, vì credential chỉ có trên GitHub.
3. Copy state của mọi stage sang store mới. Store cũ giữ nguyên để rollback.
4. Đổi `workerName`, chạy dry-run staging và production.
5. Chỉ deploy khi dry-run không tạo mới hay thay thế resource nào.

## Verification

- Số resource theo từng stage khớp giữa hai store.
- Dry-run hai stage không có create, replace, delete ngoài dự kiến.

## Risks

Cần quyền Secrets Store cho token CI để store mới lưu secret. Đây là điểm phải kiểm tra trước khi bắt đầu.
