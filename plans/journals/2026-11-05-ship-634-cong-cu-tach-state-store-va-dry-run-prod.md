---
title: "Ship #634: Bộ công cụ tách state store an toàn và dry-run cho prod (beta)"
date: 2026-11-05
summary: "Thêm module packages/infra/src/state-copy.ts và CLI scripts/state-copy.ts (count/copy/verify, chỉ stack teacher-os, copy output, verify hash, không delete), workflow state-migrate.yml manual dispatch với concurrency group deploy, input dry_run cho deploy.yml; giữ nguyên cấu hình deploy hiện tại"
---

# Ship #634: Bộ công cụ tách state store an toàn và dry-run cho prod (beta)

## Bối cảnh & Hiện tượng (#634)
- Deploy Staging của PR #629 fail vì `alchemy-state-store` dùng chung trên Cloudflare đã lên v8, trong khi repo teacher-os đang dùng Alchemy `beta.72` (v7).
- Phase 1 đã nâng Alchemy lên `2.0.0-beta.85` và deploy staging xanh thành công (PR #635, run 42017463081).
- Phase 2 (tách state store riêng `teacher-os-state` để cô lập với các project khác) gặp các trở ngại kỹ thuật:
  1. `syncState` trong Alchemy `beta.85` có bug lặp qua toàn bộ stacks của account thay vì lọc theo `stacks` option, dẫn đến copy cả stack lạ.
  2. Cloudflare state store không implement hàm `migrate`.
  3. Môi trường local/VM không có Cloudflare credentials; credentials chỉ có trên GitHub Actions secrets.
  4. Nếu đổi `workerName` trong `alchemy.run.ts` trước khi copy state, Alchemy sẽ coi như toàn bộ resources chưa tồn tại và có thể recreate/delete tài nguyên Cloudflare thật.
  5. `main` (prod) vẫn đang ở `beta.72` và chưa có cơ chế dry-run.

## Tham vấn `--advice` (kongming)
- Quyết định: Thực hiện theo **Lựa chọn 2** (PR1 chỉ công cụ, không đổi hành vi deploy).
- 5 điều kiện an toàn:
  1. Không đóng #634: PR dùng "Refs #634", ghi nhận Phase 1 xong, Phase 2 triển khai PR1 công cụ.
  2. Logic copy nằm trong `src/state-copy.ts` (có unit test); `scripts/state-copy.ts` là CLI mỏng; chỉ đọc nguồn, chỉ stack `teacher-os`, stage bắt buộc `staging`|`prod`, copy output, verify SHA-256 hash (không log plaintext secret), không bao giờ gọi `delete` hay `deleteStack`.
  3. `deploy.yml`: thêm `dry_run` (mặc định `false`), lệnh khi không dry-run giữ nguyên `--stage prod --yes`. Cập nhật `scripts/ci-workflow.test.mjs`.
  4. `state-migrate.yml`: `workflow_dispatch` với mode `bootstrap|count|copy|verify` (mặc định `count`), mode `copy` yêu cầu confirm bằng cách gõ đúng stage, concurrency group trùng với deploy (`deploy-staging` / `deploy-production`).
  5. Không đổi `alchemy.run.ts:275`. Ghi rõ quy trình an toàn vào runbook.

## Thay đổi kỹ thuật
1. `packages/infra/src/state-copy.ts`:
   - Định nghĩa `canonicalJson` và `hashValue` (SHA-256) chuẩn xác để so sánh cấu trúc (hỗ trợ cả Effect `Redacted` và `Date` để không bị false positive match khi secret khác nhau).
   - Types: `ReadonlySourceStateService` (chỉ gồm read methods) và `TargetStateService` (chỉ gồm read + set/setOutput, tuyệt đối không có delete).
   - `countState`: đếm tài nguyên theo stage.
   - `copyState`: kiểm tra `replacedResources` (dừng nếu còn pending), kiểm tra empty source state (`EmptySourceStateError`), kiểm tra conflict dữ liệu tại đích (yêu cầu `overwrite: true` nếu khác), copy tuần tự và copy stack output.
   - `verifyState`: so sánh FQN sets, SHA-256 hash của từng resource, hash của stack output (dừng nếu source có 0 FQN để tránh pass giả trên store rỗng).
2. `packages/infra/src/state-copy.test.ts`:
   - 10 unit tests (42 tests toàn infra) bao phủ: tính tất định của hash, phân biệt secret `Redacted`, format `Date`, từ chối stage không hợp lệ, đếm tài nguyên, chỉ copy `teacher-os` và bỏ qua stack ngoại lai (`lexi-quest`, `vox-flow`), chặn khi có `replacedResources`, chặn khi source rỗng (0 FQN), phát hiện xung đột dữ liệu ở đích, tính lũy đẳng (idempotent).
3. `packages/infra/scripts/state-copy.ts`:
   - CLI wrapper hỗ trợ flags: `--mode <count|copy|verify>`, `--stage <staging|prod>`, `--source-name`, `--dest-name`, `--overwrite`.
4. `.github/workflows/deploy.yml`:
   - Thêm input `dry_run` vào `workflow_dispatch`.
   - Cập nhật lệnh deploy dùng `--dry-run` khi input `dry_run: true` hoặc `--yes` khi deploy thật.
   - Thêm `if: ${{ !inputs.dry_run }}` cho toàn bộ 4 bước smoke check.
5. `.github/workflows/state-migrate.yml`:
   - Workflow thủ công hỗ trợ 4 mode: `count` (mặc định), `bootstrap`, `copy` (bảo vệ bởi input `confirm_copy`), `verify`.
   - Concurrency group `deploy-staging` hoặc `deploy-production` để không bao giờ chạy song song với deploy.
6. `scripts/ci-workflow.test.mjs`:
   - Thêm test bảo vệ input `dry_run` và bước skip smoke của `deploy.yml`.
   - Thêm test bảo đảm `state-migrate.yml` chỉ chạy `workflow_dispatch`, read-only permissions, không upload artifact state.
7. `docs/production-release-runbook.md` & `CHANGELOG.md`:
   - Cập nhật hướng dẫn chạy dry-run prod và quy tắc an toàn khi tách state store.

## Kiểm chứng
- `pnpm --filter @teacher-os/infra test`: 42/42 tests passed.
- `node scripts/ci-workflow.test.mjs`: 8/8 tests passed.
- `node scripts/topology-drift.test.mjs`: 11/11 tests passed.
- `pnpm --filter @teacher-os/infra check-types`: 0 errors.
- `pnpm check-types`: 12/12 packages passed.
- `pnpm exec biome check packages/infra/ scripts/ci-workflow.test.mjs`: sạch 100%.
