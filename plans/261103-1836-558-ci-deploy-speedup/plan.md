---
title: "#558: Tối ưu thời gian run CI trên workflow deploy"
description: "Rút job quality (~8 phút) xuống ≤ ~4 phút bằng reusable workflow, job song song, turbo cache, tách test chậm và bỏ build trùng; không bỏ bước nào của gate."
status: pending
priority: P2
effort: 5h
issue: 558
branch: ci/558-ci-deploy-speedup
tags: [ci, infra, performance]
blockedBy: []
blocks: []
created: 2026-11-03
---

# Plan: #558 — Tối ưu thời gian run CI trên workflow deploy

## Outcome

Từ lúc push `main` (prod) hoặc `staging` đến lúc bước Deploy bắt đầu chạy giảm từ ~8 phút xuống ≤ ~4 phút. Biome, test, check-types, build vẫn chạy đủ trước khi deploy. PR/CI thường cũng nhanh theo, vì dùng chung cùng một định nghĩa quality.

## Hiện trạng đã đo (run #41685858123, #41623794011, runner ubuntu-latest, repo private)

| Bước | Thời gian | Ghi chú |
|---|---|---|
| Setup (checkout, pnpm, node, install) | ~40s | Đã có cache pnpm store |
| `biome check .` | 8s | |
| `pnpm test` | **~320s** | `turbo run test` chạy 8 package song song trên 2 vCPU; turbo cache 0/12 |
| — `apps/web` | 257s / 176 file | CPU-bound |
| — `apps/server` | 271s / 97 file | `ledger-invariants.test.ts` ~61s cục bộ (1 test khám phá toàn bộ không gian trạng thái) |
| `pnpm check-types` | ~100s | `web`/`student`/`admin` chạy `vite build && tsc --noEmit` |
| `pnpm build` | 14s | Lặp lại `vite build` đã chạy trong check-types |
| Deploy + 4 smoke | ~90s | Không đụng |

Quality chạy tuần tự trong 1 job và bị lặp ở 3 file (`ci.yml`, `deploy.yml`, `deploy-staging.yml`). Deploy prod/staging chiếm ~85% thời gian chờ ở quality.

## Hướng làm

1. **Phase 1** — Gom quality vào một reusable workflow + composite action setup, chia 3 job song song (lint, test, types-build). Ba workflow gọi lại, `deploy` vẫn `needs` quality.
2. **Phase 2** — Cắt thời gian test (phần lớn lợi ích): cache turbo, tách `ledger-invariants` sang job riêng, chỉnh concurrency theo số liệu đo, shard `apps/web` nếu cần.
3. **Phase 3** — Bỏ build trùng giữa check-types và build; `paths-ignore` cho thay đổi chỉ động `plans/**`, `docs/**`, `*.md`.

## Phụ thuộc và rủi ro

- **Phải đồng bộ `develop` với `main` trước khi code.** `main` đã gỡ e2e khỏi deploy (PR #557); `develop` còn `e2e.yml` và test hợp đồng e2e trong `scripts/ci-workflow.test.mjs`. Làm trên nhánh cắt từ `develop` chưa merge `main` sẽ xung đột.
- Hợp đồng `scripts/ci-workflow.test.mjs` đang khoá nội dung `ci.yml` (regex `- run: pnpm test`, `biome check`, `check-types`, `build`, cấm `secrets.`). Chuyển quality sang file mới thì test phải đổi theo để vẫn khoá đúng các bước, không nới lỏng.
- `scripts/topology-drift.test.mjs` cũng đọc `.github/workflows/*`; phải chạy lại sau Phase 1.
- Ước lượng thời gian giảm là giả thuyết chưa đo trên runner thật. Mỗi phase kết thúc bằng một run CI thật để so với bảng trên; số đo quyết định phase tiếp theo.
- Shard `apps/web` làm tăng số phút runner (repo private, quota free). Chỉ làm khi Phase 2 chưa đạt mục tiêu và được người dùng đồng ý.

## Non-goals

- Không đổi thứ tự hay nội dung bước Deploy và smoke check.
- Không thêm lại e2e vào GitHub Actions (quyết định của #557).
- Không bỏ hoặc nới lỏng bước nào của gate để lấy tốc độ.
- Không dedupe việc CI và Deploy cùng chạy quality khi push `main`: wall-clock không đổi và `ci.yml` đang khoá trigger push `main`/`develop`. Ghi lại như câu hỏi mở.

## Acceptance criteria

- [ ] Run `deploy.yml` và `deploy-staging.yml` trên GitHub: thời gian đến lúc job `deploy` bắt đầu ≤ ~4 phút (trung bình 2 run liên tiếp).
- [ ] Tổng số file test và số test chạy trong CI bằng baseline (số liệu ghi ở Phase 2), không test nào bị bỏ sót khi tách.
- [ ] `pnpm test`, `pnpm exec biome check .`, `pnpm check-types`, `pnpm build` vẫn chạy được cục bộ như cũ.
- [ ] `node --test scripts/ci-workflow.test.mjs scripts/topology-drift.test.mjs` xanh và vẫn khoá đủ các bước gate.
- [ ] Deploy không chạy khi bất kỳ job quality nào đỏ (chứng minh bằng run thử có test cố ý fail trên nhánh).

## Phases

| # | Phase | Trạng thái |
|---|---|---|
| 1 | [Reusable quality workflow + job song song](phase-01-reusable-quality-parallel-jobs.md) | pending |
| 2 | [Cắt thời gian test](phase-02-cut-test-time.md) | pending |
| 3 | [Bỏ build trùng + paths-ignore](phase-03-dedupe-build-paths-ignore.md) | pending |

## Câu hỏi mở

- Ngân sách phút runner mỗi tháng cho phép shard `apps/web` thành 2-3 job không?
- Có chấp nhận bỏ qua CI trên PR/push chỉ động `plans/**`, `docs/**`, `*.md` không (hiện không có required check nên an toàn về gating)?
- Có muốn dedupe quality giữa CI và Deploy khi push `main` (chỉ tiết kiệm phút runner, không nhanh hơn) bằng cách đổi trigger của `ci.yml` không?
