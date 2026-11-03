# Phase 2 — Cắt thời gian test

## Mục tiêu

Job `test` từ ~320s xuống ≤ ~150s (mục tiêu gián tiếp: đến-deploy ≤ ~4 phút). Mọi test vẫn chạy.

## Files

Đọc: `turbo.json`, `apps/server/vitest.config.ts`, `apps/server/package.json`, `apps/web/vitest.config.ts`, `apps/server/src/lib/payments/ledger-invariants.test.ts`, `.github/workflows/quality.yml` (từ Phase 1).

Sửa:
- `.github/workflows/quality.yml`
- `turbo.json` (khai báo `inputs`/`env` cho task `test` nếu cần để cache đúng)
- `apps/server/vitest.config.ts`, `apps/server/package.json` (tách test chậm)
- `scripts/ci-workflow.test.mjs` (khoá job test chậm để không bị gỡ im lặng)

## Các bước

1. **Ghi baseline số test**: chạy `pnpm test` cục bộ, ghi tổng số file và số test mỗi package vào `plans/reports/` (dùng làm mốc "không bỏ sót" ở bước 4). Hiện: web 176 file, server 97, student 42, admin 19, api 26, ui 14, auth 9, db 2.
2. **Turbo cache**: thêm `actions/cache` cho `.turbo` (key theo `runner.os` + hash `pnpm-lock.yaml` + `github.sha`, `restore-keys` theo lockfile) trong job `test` và `types-build`. Kiểm `turbo.json`: task `test` cần `inputs` gồm `$TURBO_DEFAULT$` và biến môi trường ảnh hưởng (ví dụ `VITE_SERVER_URL`) để cache không trả kết quả sai. Chứng minh: chạy lại không sửa gì thì `Cached: N cached` > 0; sửa 1 file trong `packages/ui` thì chỉ package phụ thuộc chạy lại.
3. **Tách test chậm**: trong `apps/server`, loại `ledger-invariants.test.ts` khỏi lượt `test` mặc định của CI bằng biến môi trường (ví dụ `VITEST_SKIP_SLOW=1` đọc trong `vitest.config.ts` để `exclude`), và thêm script `test:ledger` chạy riêng file đó. Chạy cục bộ `pnpm test` không đặt biến vẫn chạy đủ. Thêm job `test-ledger` song song trong `quality.yml` chạy `pnpm --filter server test:ledger`.
4. **Chứng minh không bỏ sót**: tổng test của job `test` + `test-ledger` bằng baseline ở bước 1 (so số file, số test trong log vitest).
5. **Đo concurrency trên runner thật** (nhánh thử, không merge): chạy `turbo run test` với `--concurrency` 1, 2, mặc định và vitest `--maxWorkers` 1/2, ghi bảng thời gian vào `plans/reports/`. Chọn cấu hình nhanh nhất, ghi lý do. Không chọn theo suy đoán: runner repo private chỉ 2 vCPU, cục bộ có 4.
6. **Điều kiện Phase 2.5, cần người dùng đồng ý**: nếu job `test` vẫn > ~150s sau bước 2-5, shard `apps/web` bằng `vitest --shard=i/n` trên matrix 2-3 runner. Hỏi lại về ngân sách phút runner trước khi làm.

## Kiểm chứng

- `pnpm test` cục bộ vẫn chạy đủ (cả ledger).
- `VITEST_SKIP_SLOW=1 pnpm --filter server test` bỏ qua đúng 1 file; `pnpm --filter server test:ledger` chạy đúng file đó.
- Run CI thật: job `test` và `test-ledger` xanh, thời gian từng job ghi vào report; lần chạy thứ hai có `Cached` > 0.
- `node --test scripts/ci-workflow.test.mjs` xanh và có assert `quality.yml` còn job chạy ledger.

## Rủi ro và rollback

- Cache turbo trả kết quả cũ khi test phụ thuộc môi trường ngoài input: giảm bằng `inputs`/`env` ở bước 2; nếu nghi ngờ, bỏ bước cache (không đụng gì khác).
- Test mới của server vô tình phình ra thành "chậm": chỉ file ledger bị tách, các file khác vẫn trong lượt mặc định.
- Rollback: bỏ biến `VITEST_SKIP_SLOW` và job `test-ledger`; `pnpm test` trở lại chạy đủ trong một job.
