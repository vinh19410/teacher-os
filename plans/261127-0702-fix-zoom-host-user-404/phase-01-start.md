---
title: "Phase 1: Infra Fail-Loud Guard"
status: done
priority: P1
---

# Phase 1: Infra Fail-Loud Guard

## Goal
Chặn `ZOOM_HOST_USER` sai định dạng (như `"Ms My"`, `"MsMy"`, `"Name <email>"`, hoặc `""` / `"me"` khi đã bật Zoom secrets) ngay tại bước cấu hình deploy Alchemy.

## Target Files and Symbols
- `packages/infra/src/topology.ts` (export mới `resolveZoomHostUser`)
- `packages/infra/alchemy.run.ts` (import `resolveZoomHostUser`, biến `zoomConfigured`, `zoomHostUser`, binding `server.env.ZOOM_HOST_USER`)
- `packages/infra/src/topology.test.ts` (suite `describe("resolveZoomHostUser")`)
- `scripts/topology-drift.test.mjs` (test mới kiểm tra workflow `ZOOM_HOST_USER` và `resolveZoomHostUser`)

## Steps
1. **Task 1.1 — Thêm `resolveZoomHostUser` vào `packages/infra/src/topology.ts`**
   - Goal: Chuẩn hoá và validate `ZOOM_HOST_USER` thuần TypeScript không import ngoài (tương thích native Node `--test` trong `scripts/topology-drift.test.mjs`).
   - Target files and symbols: `packages/infra/src/topology.ts` (`resolveZoomHostUser(raw: string | undefined, options: { zoomConfigured: boolean }): string`).
   - Steps:
     1. Giữ 0 import trong `topology.ts`.
     2. Trim `raw ?? ""`. Nếu rỗng: ném lỗi rõ ràng khi `zoomConfigured === true`, trả `""` khi `false`.
     3. Nếu `value.toLowerCase() === "me"`: ném lỗi khi `zoomConfigured === true` (S2S OAuth không hỗ trợ `"me"` ổn định), trả `"me"` khi `false`.
     4. Kiểm tra email hợp lệ (`<= 254` ký tự, 1 `@`, local part `1..64` không `..`, domain hợp lệ có dấu `.`) hoặc Zoom User ID (`/^[A-Za-z0-9_-]{16,64}$/` để chặn tên hiển thị viết liền như `"MsMy"`). Nếu không khớp: luôn ném lỗi.
   - Success criteria: Mọi giá trị không phải email/Zoom User ID đều bị chặn fail-loud, không rò import.
   - Verify: Chờ Task 1.3 chạy `topology.test.ts`.

2. **Task 1.2 — Nối `resolveZoomHostUser` vào `packages/infra/alchemy.run.ts`**
   - Goal: Worker `server` nhận giá trị `ZOOM_HOST_USER` đã chuẩn hoá qua `resolveZoomHostUser`.
   - Target files and symbols: `packages/infra/alchemy.run.ts` (`zoomConfigured`, `zoomHostUser`, `server.env.ZOOM_HOST_USER`).
   - Steps:
     1. Import `resolveZoomHostUser` từ `./src/topology.ts`.
     2. Đặt `zoomConfigured` và `zoomHostUser` ngay **sau** `studentPracticeEnabled` (không chèn vào giữa các khối `corsOriginConfig`/`studentOriginsConfig`/`adminOriginsConfig` để không vỡ split trong `topology-drift.test.mjs`).
     3. Thay `ZOOM_HOST_USER: Config.String("ZOOM_HOST_USER").pipe(Config.withDefault("me"))` bằng `ZOOM_HOST_USER: zoomHostUser`.
   - Success criteria: `alchemy.run.ts` giữ kiểu `ServerEnv["ZOOM_HOST_USER"]` là `string` và không phá `topology-drift.test.mjs`.
   - Verify: Chờ Task 1.4.

3. **Task 1.3 — Bổ sung unit test trong `packages/infra/src/topology.test.ts`**
   - Goal: Bao phủ các ca hợp lệ, trim khoảng trắng, `"me"`/`""` theo `zoomConfigured`, và từ chối tên hiển thị có/không dấu cách.
   - Target files and symbols: `packages/infra/src/topology.test.ts`.
   - Steps: Thêm `describe("resolveZoomHostUser")` kiểm tra email, 22-char Zoom ID, UUID, `"Ms My"`, `"MsMy"`, `"Admin"`, `"Ms My <teacher@example.com>"`, `"a@b"`, `"a..b@gmail.com"`, `"foo/bar"`, `""`, `"me"`.
   - Success criteria: Toàn bộ case pass.
   - Verify: `pnpm --filter @teacher-os/infra exec vitest run src/topology.test.ts` exit 0.

4. **Task 1.4 — Bổ sung drift test trong `scripts/topology-drift.test.mjs`**
   - Goal: Đảm bảo `deploy.yml` và `deploy-staging.yml` truyền `vars.ZOOM_HOST_USER` và `alchemy.run.ts` đi qua `resolveZoomHostUser(`.
   - Target files and symbols: `scripts/topology-drift.test.mjs`.
   - Steps: Thêm `test("deploy workflows pass ZOOM_HOST_USER and alchemy.run.ts validates via resolveZoomHostUser", ...)` theo mẫu `#524`.
   - Success criteria: Drift test và CI workflow test đều pass.
   - Verify: `pnpm --filter @teacher-os/infra exec vitest run src/topology.test.ts && pnpm test:topology-drift && pnpm test:ci-workflow` exit 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
