---
phase: 2
title: "Tách state store riêng"
status: in-progress
priority: P1
effort: "4h"
dependencies: [1]
---

# Phase 2: Tách state store riêng

## Goal

teacher-os dùng store riêng qua `Cloudflare.state({ workerName })`, với toàn bộ state hiện có được chuyển sang trước khi đổi cấu hình.

## Files to Create / Modify
- Create: `packages/infra/src/state-copy.ts` (logic copy an toàn, chỉ đọc nguồn, chỉ stack `teacher-os`, copy output, verify hash, không delete)
- Create: `packages/infra/src/state-copy.test.ts` (unit tests với fake StateService)
- Create: `packages/infra/scripts/state-copy.ts` (CLI wrapper)
- Create: `.github/workflows/state-migrate.yml` (workflow_dispatch có xác nhận cho copy)
- Modify: `.github/workflows/deploy.yml` (thêm input `dry_run`), `scripts/ci-workflow.test.mjs`, `docs/production-release-runbook.md`
- Pending (PR2 sau khi verify CI): `packages/infra/alchemy.run.ts` (đổi `workerName: "teacher-os-state"` kèm parity gate)
## Phát hiện từ source beta.85

- `alchemy state migrate` tồn tại, nhưng trong source chỉ `BucketState` cài đặt `migrate`; Cloudflare state store thì không.
- `syncState` không dùng được: vòng copy chạy trên mọi stack của store nguồn, tùy chọn `stacks` không giới hạn việc copy, nên state của project khác sẽ bị chép sang.
- Cần script copy riêng: chỉ stack `teacher-os`, không xóa gì, có chế độ chỉ đếm. Script phải chạy trong CI và chưa thử được trên store thật.

## Tasks & Steps

### PR1: Bộ công cụ di chuyển an toàn và dry-run cho prod (Hiện tại)
1. Viết `packages/infra/src/state-copy.ts`:
   - Chỉ đọc từ nguồn (`list`, `get`, `getOutput`, `getReplacedResources`).
   - Tuyệt đối không gọi `delete` hay `deleteStack`.
   - Stack cố định `teacher-os`. Stage nhận `staging` hoặc `prod`.
   - 3 chế độ: `count`, `copy`, `verify` (so sánh số lượng và hash SHA-256, không log plaintext secret).
   - Dừng lại nếu nguồn có `replacedResources` hoặc nếu đích đã có data khác nguồn (trừ khi có `--overwrite`).
2. Viết unit test `packages/infra/src/state-copy.test.ts` kiểm thử toàn bộ các nhánh: copy đúng stack, bỏ qua stack lạ, copy output, phát hiện replaced resources, verify hash khớp, không có thao tác xóa.
3. Tạo CLI wrapper `packages/infra/scripts/state-copy.ts`.
4. Thêm input `dry_run` vào `.github/workflows/deploy.yml` và cập nhật `scripts/ci-workflow.test.mjs`.
5. Tạo workflow `.github/workflows/state-migrate.yml` (chỉ chạy bằng `workflow_dispatch`, mode mặc định `count`, có input xác nhận cho `copy`, dùng concurrency group trùng với deploy).
6. Cập nhật `docs/production-release-runbook.md`.

### Các bước tiếp theo (Vận hành & PR2)
7. Promote `develop -> main` (để prod lên `beta.85` và GitHub Actions kích hoạt `state-migrate.yml` từ default branch).
8. Cấp quyền Secrets Store Edit cho token Cloudflare của cả `staging` và `production`.
9. Dispatch workflow `state-migrate.yml`: bootstrap -> count -> copy -> verify cho staging, sau đó tương tự cho prod.
10. PR2: Đổi `workerName: "teacher-os-state"` trong `alchemy.run.ts:275`, thêm parity gate vào workflow deploy, chạy dry-run trên CI xác nhận 0 create/replace/delete, rồi merge và deploy.

## Verification

- Số resource theo từng stage khớp giữa hai store.
- Dry-run hai stage không có create, replace, delete ngoài dự kiến.

## Risks

Cần quyền Secrets Store cho token CI để store mới lưu secret. Đây là điểm phải kiểm tra trước khi bắt đầu.
