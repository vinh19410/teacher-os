---
phase: 1
title: "e2e dev-watchdog (playwright)"
status: completed
priority: P1
effort: 2.5h
dependencies: []
---

# Phase 1: e2e dev-watchdog (playwright)

> Đã hấp thụ findings red-team RT2-Security/RT2-Failure/RT2-Assumption (xem
> `## Red Team Review` trong plan.md). Thay đổi so với bản đầu: state machine
> có warming/grace, phân biệt refused/stall/status, marker resolve tuyệt đối,
> heartbeat + crash marker, không shell, module services dùng chung.

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

## Goal
Playwright e2e tự phát hiện dev server chết giữa run: vite web/student được
restart (tối đa 1 lần/vite; chết lần 2 → marker + run fail với message rõ),
API chết → fail-loud không restart. Watchdog tự chết (SIGKILL/crash) cũng phải
bị phát hiện. Hết cascade `ERR_CONNECTION_REFUSED` vô định.

## Files to Create / Modify
- Create: `apps/e2e/devserver-services.mjs` — nguồn sự thật chung: định nghĩa 3 service (url poll, command restart, env), builder redaction (rawTail carry-over double-pass như capture.mjs:130-141).
- Create: `apps/e2e/devserver-watchdog.mjs` — watchdog process (entry webServer thứ 4).
- Create: `apps/e2e/global-teardown.ts` — đọc marker/crash/heartbeat + probe 3 URL → throw (fail run rõ nguyên nhân).
- Create: `scripts/devserver-watchdog.test.mjs` — unit test (node:test).
- Modify: `apps/e2e/playwright.config.ts` — entry watchdog + `globalTeardown` + `stderr: "pipe"` tường minh 2 entry vite; dựng entry web/student từ `devserver-services.mjs`.
- Modify: `apps/e2e/tsconfig.json` — thêm `global-teardown.ts` vào `include` (hiện chỉ `["src", "specs", "scripts", "playwright.config.ts"]`).
- Modify: `package.json` (root) — thêm `test:devserver-watchdog` vào chuỗi `test`.

## Quy ước chung (bắt buộc, chống fail-open)
1. **Path tuyệt đối, cấm cwd**: writer (watchdog) lẫn reader (global-teardown)
   resolve `test-results/` từ `dirname(fileURLToPath(import.meta.url))` của
   chính file mình (cùng nằm ở `apps/e2e/`). Không bao giờ `process.cwd()` hay
   path tương đối. (RT2 Assump F1, Sec H2, Fail M4b)
2. **mkdir trước mọi write**: `test-results/` bị playwright xoá đầu mỗi run
   (`runner/index.js:6094-6110`) — `mkdir(recursive: true)` trước khi ghi
   log/marker/heartbeat.
3. **Redact mọi dump**: helper redaction trong `devserver-services.mjs` —
   rawTail ~100 ký tự + double-pass sau slice (copy cơ chế
   `capture.mjs:130-141`, TOKEN_RE `/(?:[?&]token=)[^\s&"']+/gi`). Áp cho log
   file, marker, console.error, message throw. Unit test assert không có chuỗi
   khớp `token=<value>` kể cả khi token cắt ngang biên chunk.
4. **Điều kiện chết (fetch)**: fetch timeout 5s.
   - `ECONNREFUSED`/network-error = chết thật.
   - Timeout/abort = stall (event-loop), KHÔNG restart, đếm stall riêng.
   - HTTP: với vite web/student — chết nếu `status >= 404`; với api `readyz` —
     chết nếu `status >= 500` (503 = DB probe hỏng → coi là chết; khớp
     semantics playwright: available chỉ khi `< 404`). (Assump F6)
   - Kết luận chết cần **3 fail liên tiếp** cùng loại.
5. **Ngưỡng restart**: tối đa **1 restart/vite**; chết lần 2 → ngừng restart +
   marker `devserver-<name>.fail.json` + console.error to. (thống nhất
   plan.md ↔ spec, Fail M6a)
6. **Marker schema**: `{ service, kind, reason, log (≤4KB, redact, strip
   control chars /[\x00-\x1f\x7f]/g), pid, startedAt, originalLogNote }`;
   `originalLogNote` = "log process gốc (lần chết đầu) xem stderr trong output
   reporter playwright" (watchdog chỉ có tail của restart-child do nó spawn —
   Fail M5). Ghi bằng `writeFile` sau `JSON.stringify`; đọc trong teardown
   bằng try/catch parse — hỏng → throw marker-corrupt (message truncate).

## Tasks & Steps

### Task 1.1 — Unit test state machine + builders (TDD đỏ trước)
- Goal: logic watchdog test được độc lập I/O, đúng layer.
- Target files: `scripts/devserver-watchdog.test.mjs`, `apps/e2e/devserver-watchdog.mjs`, `apps/e2e/devserver-services.mjs`.
- Steps:
  1. `node:test` + `assert/strict` (pattern `scripts/ci-workflow.test.mjs`). Import các pure export từ `devserver-watchdog.mjs`.
  2. `buildServices(ports)` (từ `devserver-services.mjs`): trả đúng 3 service với url poll `http://localhost:${port}/readyz`, `http://localhost:${port}/`, `http://localhost:${port}/login` — Case assert **student có url** (Fail H1/F5).
  3. `buildRestartCommand(service, ports)` + `buildSpawnOptions()`: assert command dạng `["pnpm", "--filter", "web", "exec", "vite", "--port", "8101", "--strictPort"]`, KHÔNG có `"bash"`/`shell` (M4), options KHÔNG có `detached: true`, có `cwd: ROOT`.
  4. `parsePorts(env)`: env đủ → `{api, web, student}`; thiếu/non-integer/ngoài 1..65535 → throw với message rõ (M5).
  5. `createWatchdogState({ kind, restart, now })` — pure, nhận callback:
     - Case A (vite chết thật): 3× refused → `restart` gọi đúng 1 lần, `restarts == 1`.
     - Case B (vite chết lần 2): sau restart + 1 poll OK (armed), 3× refused nữa → KHÔNG gọi restart thêm, `unstable == true`.
     - Case C (api chết): 3× refused → KHÔNG restart, `unstable == true`.
     - Case D (debounce stall): 2× timeout rồi OK → không restart (cần 3 liên tiếp).
     - Case E (warming): ngay sau restart, 3× refused trong window boot → KHÔNG restart thêm; khi có OK → armed lại; nếu grace 90s hết chưa OK → resume counting → đủ ngưỡng → `unstable` (Fail C1/F2).
     - Case F (stall không đốt ngân sách): 3× timeout sau khi armed → KHÔNG restart, KHÔNG unstable (chỉ đếm stall).
  6. `redact(s)`: 2 chunk cắt giữa `?token=` và value → output không chứa value (Sec M8/H1).
- Success criteria: `node --test scripts/devserver-watchdog.test.mjs` ĐỎ vì export chưa tồn tại.
- Verify: exit non-zero với lỗi missing export (red) — ghi output trước khi sang 1.2.

### Task 1.2 — Implement `devserver-services.mjs` + `devserver-watchdog.mjs`
- Goal: watchdog process hoạt động đúng theo quy ước chung ở trên.
- Target files: `apps/e2e/devserver-services.mjs`, `apps/e2e/devserver-watchdog.mjs`.
- Steps:
  1. `devserver-services.mjs` export: `buildServices(ports)`, `buildRestartCommand(service, ports)`, `buildSpawnOptions(root)`, `createRedactor()` (rawTail double-pass). KHÔNG shell ở bất kỳ đâu.
  2. `parsePorts(env)`: validate cả 3 port (integer, 1..65535), sai → `console.error` + `process.exit(2)` — gọi đầu `main()` trước mọi spawn/fetch.
  3. Poll loop 3s, `fetch(url, { signal: AbortSignal.timeout(5000) })`, wrap try/catch; state machine Task 1.1 điều phối.
  4. Restart vite: `spawn(...buildRestartCommand(...), buildSpawnOptions(ROOT))` — KHÔNG shell, KHÔNG detached; stdout/stderr qua `createRedactor()` → tail 4KB + append `test-results/devserver-<name>.log`; `console.log("[dev-watchdog] <name> đã restart (lần N)")`.
  5. **Exit-listener restart child** (Fail C2b): child exit trước khi URL OK trong warming → log tail + tính 1 lần chết vào ngân sách restart.
  6. API chết: KHÔNG restart → marker `devserver-api.fail.json` (schema quy ước 6, redact) + console.error to.
  7. Vite vượt ngưỡng: ngừng restart + marker `devserver-<name>.fail.json`.
  8. **Chống chết im** (Sec H3/Fail H3/Assump F4): `process.on("uncaughtException"/"unhandledRejection")` → ghi marker `devserver-watchdog.fail.json` (reason = stack, redact, truncate) → exit 1; heartbeat: mỗi poll ghi `test-results/devserver-watchdog.heartbeat` (mtime là tín hiệu sống).
  9. SIGTERM/SIGHUP → kill restart-children (defense-in-depth; lớp chính là group-SIGKILL của playwright teardown vì child không detached — `coreBundle.js:8995`).
  10. Main-guard: chỉ `main()` khi chạy trực tiếp (pattern `pathToFileURL(process.argv[1])`).
- Success criteria: unit test Task 1.1 xanh; import không side-effect.
- Verify: `node --test scripts/devserver-watchdog.test.mjs` exit 0.

### Task 1.3 — Wire config + global-teardown
- Goal: watchdog chạy như entry cuối; mọi bất ổn để lại run FAIL với message rõ.
- Target files: `apps/e2e/playwright.config.ts`, `apps/e2e/global-teardown.ts`, `apps/e2e/tsconfig.json`, root `package.json`.
- Steps:
  1. `playwright.config.ts`: dựng 2 entry web/student từ `buildServices`/`buildRestartCommand` của `devserver-services.mjs` (single source; TS import .mjs — thêm `allowJs: true` nếu base config chưa có); giữ nguyên `reuseExistingServer: false`, `--strictPort`, timeout 120s; thêm `stderr: "pipe"` tường minh.
  2. Entry CUỐI mảng `webServer`: `{ name: "dev-watchdog", command: "node devserver-watchdog.mjs", stdout: "pipe", env: { E2E_API_PORT: String(apiPort), E2E_WEB_PORT: String(webPort), E2E_STUDENT_PORT: String(studentPort) }, reuseExistingServer: false }` — không `url` (hợp lệ: chỉ `command` required, `types/test.d.ts:10846`).
  3. `globalTeardown: "./global-teardown.ts"` trong `defineConfig`.
  4. `global-teardown.ts` (resolve mọi path từ `import.meta.url`, cấm cwd):
     a. Glob `test-results/devserver-*.fail.json` trong try/catch ENOENT → bỏ qua; parse từng file (hỏng → throw corrupt, truncate).
     b. Heartbeat `devserver-watchdog.heartbeat` tồn tại nhưng mtime cũ >30s → throw "watchdog đã chết giữa run".
     c. Fetch thử 3 URL poll (timeout 3s) — service nào chết → throw tên service (chạy TRƯỚC plugin teardown nên servers còn sống — `runner/index.js:5835` unshift đảo ngược).
     d. Message throw: ghép marker `reason` + `originalLogNote`, đã strip control chars, ≤2KB.
  5. `tsconfig.json` include thêm `"global-teardown.ts"`.
  6. Root `package.json`: `"test:devserver-watchdog": "node --test scripts/devserver-watchdog.test.mjs"`, nối `&& pnpm test:devserver-watchdog` vào chuỗi `test` (pattern `test:ci-workflow`).
- Success criteria: config parse được; watchdog nằm cuối mảng; teardown type-check được.
- Verify: `pnpm --filter e2e exec playwright test --list 2>&1 | head -3` exit 0 không lỗi config (không spawn watchdog — task list khác, `runner/index.js:6656-6661`).

### Task 1.4 — Kill-injection smoke e2e
- Goal: chứng minh hành vi restart/ngưỡng/fail-loud/watchdog-chết trên run thật.
- Target files: không sửa code — chỉ chạy.
- Steps (mỗi case chạy riêng, ghi log + exit code + `lsof`):
  1. **Kill vite 1 lần**: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e --retries=1` chạy nền; khi specs đang chạy `kill -9` process `vite --port 8101`. Kỳ vọng: log `[dev-watchdog] web đã restart (lần 1)`; run chạy tới hết; chỉ spec trúng dead-window (~8–15s: 3×5s poll + boot vite) được fail; mọi spec sau đó pass (Fail M2/Assump F3 — KHÔNG yêu cầu 0 fail vì retries chỉ bù 1 lần).
  2. **Kill vite 2 lần** (cách nhau >60s cho qua warming): lần 2 → ngừng restart + marker; run fail; message teardown nêu rõ web bất ổn + `originalLogNote`.
  3. **Kill API 8100**: KHÔNG có restart api; run fail; teardown message nêu api.
  4. **Kill watchdog** (`kill -9` node devserver-watchdog.mjs): heartbeat stale → teardown throw "watchdog đã chết giữa run"; run fail.
  5. Sau mỗi case: `lsof -nP -iTCP:8100 -iTCP:8101 -iTCP:8103 -sTCP:LISTEN` rỗng (restart-child không detached → group-SIGKILL dọn sạch; case 4 là residual risk đã ghi nhận — nếu còn sót vite thì lần chạy sau EADDRINUSE fail-loud).
- Success criteria: đủ 5 kết quả đúng kỳ vọng.
- Verify: dán log `[dev-watchdog]`, exit code, message teardown, lsof vào evidence phase.

## Verification (phase gate)
- `node --test scripts/devserver-watchdog.test.mjs` exit 0 (đủ case A–F + redact + builders).
- `pnpm check` exit 0; `pnpm check-types` exit 0 (gồm global-teardown.ts).
- Kill-injection Task 1.4 đủ 5 kết quả.
