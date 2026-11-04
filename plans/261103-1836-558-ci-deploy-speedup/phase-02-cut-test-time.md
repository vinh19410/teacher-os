# Phase 2 — Cắt thời gian test, cấu hình Turbo env/inputs & cache an toàn

<!-- Updated: Validation, Red-Team & Probe-Gate Review - Reconciled 394-file/16-suite baseline, Turbo v2 Transit Nodes + strict env + server cross-package inputs, per-job actions/cache@v6 gated on inputs.turbo-cache, and CI maxWorkers tuning -->

## Goal

Đưa mỗi job test song song (`test-web`, `test-server`, `test-workspace`) xuống ≤ ~3.5–4 phút ngay cả khi cold cache trên runner 2 vCPU, tách `ledger-invariants.test.ts` sang `test-workspace` qua `server#test:ledger`, cấu hình chuẩn xác `turbo.json` (`env` + cross-package `inputs`) để không bao giờ bị lọc biến môi trường hoặc trúng cache giả, và bật `.turbo` cache riêng từng job cho `ci.yml`.

## Files to Create or Modify

- Create: `apps/server/turbo.json`
- Create: `plans/reports/261104-558-test-baseline-and-timings.md`
- Modify: `turbo.json`
- Modify: `apps/server/package.json`
- Modify: `apps/server/vitest.config.ts`
- Modify: `apps/web/vitest.config.ts`
- Modify: `.github/workflows/quality.yml`
- Modify: `scripts/ci-workflow.test.mjs`

## Tasks & Steps

### Task 2.1 — Ghi nhận baseline đầy đủ 12 workspace packages + 4 root contract suites
- [x] Hoàn thành Task 2.1
- **Goal:** Lưu mốc đối chiếu đầy đủ 394 file test / 16 bộ test (9 Vitest workspace + 3 `node --test` workspace + 4 `node --test` root scripts) vào `plans/reports/261104-558-test-baseline-and-timings.md` để đối chiếu không bỏ sót sau khi tách job.
- **Target files and symbols:** `plans/reports/261104-558-test-baseline-and-timings.md`.
- **Steps:**
  1. Đếm chính xác số file test và số test thực thi của cả 12 workspace (`web`, `server` [gồm 96 file thường + 1 file `ledger-invariants.test.ts`], `student`, `admin`, `api`, `ui`, `auth`, `db`, `infra`, `e2e`, `landing`, `profile`) và 4 root scripts (`ci-workflow`, `topology-drift`, `devserver-watchdog`, `design-compare`).
  2. Ghi bảng số liệu baseline + bảng đo `taskset -c 0,1` + số liệu run CI gốc `#41685858123` / `#41623794011` vào `plans/reports/261104-558-test-baseline-and-timings.md`.
- **Success criteria:** File báo cáo tồn tại và liệt kê đủ 16 bộ test với tổng số file và số test rõ ràng.
- **Verify:** `test -f plans/reports/261104-558-test-baseline-and-timings.md` thoát mã `0`.

### Task 2.2 — Tách `ledger-invariants.test.ts` an toàn trong `apps/server` và tinh chỉnh `maxWorkers` trên CI 2 vCPU
- [x] Hoàn thành Task 2.2
- **Goal:** Cho phép job `test-server` bỏ qua duy nhất file `src/lib/payments/ledger-invariants.test.ts` khi có `VITEST_SKIP_SLOW=1`, thêm script `test:ledger` chạy riêng file đó ở job `test-workspace`, giữ nguyên hành vi `pnpm test` cục bộ khi không đặt biến, và giới hạn `maxWorkers: 2` khi `process.env.CI` bật để tránh thrashing trên runner 2 vCPU.
- **Target files and symbols:** `apps/server/vitest.config.ts`, `apps/server/package.json` (`scripts.test:ledger`), `apps/web/vitest.config.ts` (`test.maxWorkers`).
- **Steps:**
  1. Trong `apps/server/vitest.config.ts`: import `configDefaults, defineConfig` từ `"vitest/config"`. Cấu hình `include: ["src/**/*.test.ts"]`, `maxWorkers: process.env.CI ? 2 : undefined`, và `exclude: process.env.VITEST_SKIP_SLOW === "1" ? [...configDefaults.exclude, "src/lib/payments/ledger-invariants.test.ts"] : configDefaults.exclude`.
  2. Trong `apps/server/package.json`: thêm `"test:ledger": "vitest run src/lib/payments/ledger-invariants.test.ts"` vào `scripts` (giữ nguyên `"test": "vitest run"`).
  3. Trong `apps/web/vitest.config.ts`: thêm `maxWorkers: process.env.CI ? 2 : undefined` bên trong khối `test:` (giữ nguyên toàn bộ `apps/web/package.json` `"test": "vitest run"` theo hợp đồng `ci-workflow.test.mjs`).
- **Success criteria:** Khi `VITEST_SKIP_SLOW=1`, `apps/server` chạy đúng 96 file (bỏ qua duy nhất `ledger-invariants.test.ts`); `pnpm --filter server test:ledger` chạy đúng 1 file `ledger-invariants.test.ts` (10 tests: 9 passed, 1 expected fail); khi không đặt `VITEST_SKIP_SLOW`, `apps/server` vẫn bao gồm cả 97 file.
- **Verify:** `pnpm --filter server exec vitest list --filesOnly | wc -l` in `97` và `VITEST_SKIP_SLOW=1 pnpm --filter server exec vitest list --filesOnly | wc -l` in `96` (cả hai lệnh thoát mã `0`).

### Task 2.3 — Khai báo `env`, `globalDependencies` trong `turbo.json` và cross-package `inputs` trong `apps/server/turbo.json`
- [x] Hoàn thành Task 2.3
- **Goal:** Đảm bảo Turborepo v2 (`envMode: "strict"`) truyền đúng và băm (hash) đủ các biến môi trường (`VITEST_SKIP_SLOW`, `VERIFY_DEPTH`, `VITE_*`, `LEAD_API_URL`, `CI` trong `passThroughEnv` cho worker tuning) cũng như các file xuyên workspace mà test của `apps/server` đọc trực tiếp.
- **Target files and symbols:** `turbo.json` (`globalDependencies`, `tasks.build`, `tasks.check-types`, `tasks.test`, `tasks["test:ledger"]`), `apps/server/turbo.json` (`extends`, `tasks.test.inputs`).
- **Steps:**
  1. Trong `turbo.json` gốc:
     - Thêm `"globalDependencies": ["package.json"]`.
     - Trong `tasks.build`: giữ `"dependsOn": ["^build"]`, `"inputs": ["$TURBO_DEFAULT$", ".env*"]`, `"outputs": ["dist/**"]`, thêm `"env": ["VITE_SERVER_URL", "VITE_AI_ENABLED", "VITE_TEACHER_SIGNUP_ENABLED", "LEAD_API_URL"]`.
     - Trong `tasks.check-types`: giữ `"dependsOn": ["^check-types"]`, thêm `"env": ["VITE_SERVER_URL", "VITE_AI_ENABLED", "VITE_TEACHER_SIGNUP_ENABLED", "LEAD_API_URL"]`.
     - Thêm `"transit": { "dependsOn": ["^transit"] }` để giữ băm xuyên package mà không kéo `e2e -> server#test` chạy trùng 97 file.
     - Trong `tasks.test`: đặt `"dependsOn": ["transit"]`, `"inputs": ["$TURBO_DEFAULT$", ".env*"]`, `"env": ["VITE_SERVER_URL", "VITE_AI_ENABLED", "VITE_TEACHER_SIGNUP_ENABLED", "VITEST_SKIP_SLOW", "VERIFY_DEPTH"]`, và `"passThroughEnv": ["CI"]`.
     - Thêm `"test:ledger": { "dependsOn": ["transit"], "inputs": ["$TURBO_DEFAULT$", ".env*"], "env": ["VITE_SERVER_URL", "VITEST_SKIP_SLOW", "VERIFY_DEPTH"], "passThroughEnv": ["CI"] }`.
  2. Tạo `apps/server/turbo.json` với:
     ```json
     {
     	"$schema": "https://turbo.build/schema.json",
     	"extends": ["//"],
     	"tasks": {
     		"test": {
     			"inputs": [
     				"$TURBO_DEFAULT$",
     				".env*",
     				"../../apps/profile/public/**",
     				"../../apps/web/public/placement-seed/**",
     				"../../apps/e2e/fixtures/exam-import/**"
     			]
     		}
     	}
     }
     ```
- **Success criteria:** `turbo run test --dry=json` chạy hợp lệ, `VITEST_SKIP_SLOW=1` đi xuyên qua `pnpm exec turbo run test --filter=server` làm hash của `server#test` thay đổi so với không đặt biến, và `apps/profile/public/index.html` nằm trong danh sách file hash của `server#test`.
- **Verify:** `H1=$(pnpm exec turbo run test --filter=server --dry=json | jq -r '.tasks[] | select(.taskId=="server#test") | .hash') && H2=$(VITEST_SKIP_SLOW=1 pnpm exec turbo run test --filter=server --dry=json | jq -r '.tasks[] | select(.taskId=="server#test") | .hash') && test -n "$H1" && test "$H1" != "$H2"` thoát mã `0`.

### Task 2.4 — Nối `VITEST_SKIP_SLOW=1`, `test:ledger`, và per-job `.turbo` `actions/cache@v6` vào `quality.yml` + khoá hợp đồng
- [x] Hoàn thành Task 2.4
- **Goal:** Hoàn tất phân tách `test-server` (có `VITEST_SKIP_SLOW: "1"` ở đúng step test) với `test-workspace` (chạy thêm `pnpm exec turbo run test:ledger --filter=server`), thêm cache `.turbo` tách biệt theo từng job khi `inputs.turbo-cache` bật (restore trên PR/push, chỉ save trên `push`), và khoá trong `scripts/ci-workflow.test.mjs`.
- **Target files and symbols:** `.github/workflows/quality.yml`, `scripts/ci-workflow.test.mjs`.
- **Steps:**
  1. Trong `.github/workflows/quality.yml`:
     - Ở cả 4 job (`checks`, `test-web`, `test-server`, `test-workspace`), thêm bước restore `.turbo` (`if: inputs.turbo-cache && github.event_name != 'push'` dùng `actions/cache/restore@v6`, và `if: inputs.turbo-cache && github.event_name == 'push'` dùng `actions/cache@v6` kèm tỉa cache >7 ngày) với `path: .turbo` và `key: turbo-<job-name>-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-${{ github.sha }}` cùng `restore-keys: turbo-<job-name>-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-`.
     - Trong `test-server`: đặt `env: { VITEST_SKIP_SLOW: "1" }` **chỉ** ở step `pnpm exec turbo run test --filter=server` (tuyệt đối không đặt ở workflow-level `env:`).
     - Trong `test-workspace`: thêm step `- run: pnpm exec turbo run test:ledger --filter=server` (không có `VITEST_SKIP_SLOW`) cùng với `--filter=!web --filter=!server` và 4 root scripts.
  2. Trong `scripts/ci-workflow.test.mjs`: thêm assert khoá rằng:
     - `quality.yml` có step chạy `test:ledger` và step đó không mang `VITEST_SKIP_SLOW`.
     - `VITEST_SKIP_SLOW` không xuất hiện ở top-level `env:` của `quality.yml`.
     - Mỗi job cache `.turbo` trong `quality.yml` có tiền tố key riêng biệt (`turbo-checks-`, `turbo-test-web-`, `turbo-test-server-`, `turbo-test-workspace-`) và được cổng bởi `inputs.turbo-cache`.
- **Success criteria:** Hợp đồng `ci-workflow.test.mjs` pass, Biome pass, tổng file test của `test-web` (176) + `test-server` (96) + `test:ledger` (1) + `test-workspace` (117 + 4 = 121) bằng đúng **394 file** của baseline.
- **Verify:** `node --test scripts/ci-workflow.test.mjs scripts/topology-drift.test.mjs && pnpm exec biome check .` thoát mã `0` và in `fail 0`.

## Risiko & Rollback

- Nếu trên GitHub runner thật job `test-workspace` (`--filter=!web --filter=!server` + `test:ledger` + 4 root scripts) vượt ~4 phút do `test:ledger` chạy tuần tự sau 10 package, có thể tách riêng `test-ledger` thành job thứ 5 mà không ảnh hưởng bất kỳ hợp đồng nào khác.
- Rollback: gỡ `VITEST_SKIP_SLOW`, xoá `apps/server/turbo.json`, trả `quality.yml` về chạy full `server#test`.

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
