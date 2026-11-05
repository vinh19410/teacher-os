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
- Create: script chuyển state một lần, chỉ copy stack `teacher-os`

## Phát hiện từ source beta.85

- `alchemy state migrate` tồn tại, nhưng trong source chỉ `BucketState` cài đặt `migrate`; Cloudflare state store thì không.
- `syncState` không dùng được: vòng copy chạy trên mọi stack của store nguồn, tùy chọn `stacks` không giới hạn việc copy, nên state của project khác sẽ bị chép sang.
- Cần script copy riêng: chỉ stack `teacher-os`, không xóa gì, có chế độ chỉ đếm. Script phải chạy trong CI và chưa thử được trên store thật.

## Tasks & Steps

1. Viết script copy dùng `Alchemist.State.store`, chỉ đọc store nguồn và chỉ ghi stack `teacher-os` vào store đích.
2. Bootstrap store mới trong CI, vì credential chỉ có trên GitHub.
3. Copy state của mọi stage sang store mới. Store cũ giữ nguyên để rollback.
4. Đổi `workerName`, chạy dry-run staging và production.
5. Chỉ deploy khi dry-run không tạo mới hay thay thế resource nào.

## Verification

- Số resource theo từng stage khớp giữa hai store.
- Dry-run hai stage không có create, replace, delete ngoài dự kiến.

## Risks

Cần quyền Secrets Store cho token CI để store mới lưu secret. Đây là điểm phải kiểm tra trước khi bắt đầu.
