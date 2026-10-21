---
title: "Giữ dev server sống + fail-loud khi chết giữa run (e2e/design:compare)"
description: "Watchdog giám sát api/web/student cho cả playwright e2e và design:compare: vite chết → restart có đếm ngưỡng, API chết → fail-loud, hết cascade connection-refused im lặng."
status: in-progress
priority: P1
effort: 4h
issue: 402
branch: vinh19410/ai-handle-issue-402
tags: [bugfix, infra]
blockedBy: []
blocks: []
created: 2026-10-22
---

# 402 — e2e/design:compare: dev server chết giữa run

Issue: https://github.com/vinh19410/teacher-os/issues/402 — Route: **bugfix** (ak:fix).

## Root cause (đã chứng minh bằng bằng chứng, không suy đoán)

1. **Vite chết do native abort, không do OS kill.** Crash report macOS
   `~/Library/Logs/DiagnosticReports/node-2026-10-21-005325.ips`: node
   SIGABRT — `abort()` trong `rolldown-binding.darwin-arm64.node` (engine
   rolldown của vite 8.2.1, dependency trực tiếp trong vite@8.2.1), coalition
   `com.stablyai.orca.terminal.*` (terminal AI worktree), uptime ~85 phút.
   Unified log 12h KHÔNG có jetsam kill node/vite. Bối cảnh máy: swap
   17.1/18.4GB đã dùng; 3 orphan vite stale đã bị phát hiện và dọn.
2. **Cascade do hạ tầng không detect.** Playwright 1.62.1
   `lib/runner/index.js`: `onExit` chỉ reject promise khởi động
   (`_processExitedPromise`); sau khi `url` availability thắng race, rejection
   bị nuốt → webServer chết giữa run = im lặng, không restart, không fail-loud
   → 185/237 test `ERR_CONNECTION_REFUSED`.
3. **capture.mjs chỉ dump log khi waitUrl timeout/seed fail.** Chết giữa
   capture (sau seed) = im lặng hoàn toàn; outputTail đã thu thập nhưng không
   bao giờ được in.
4. **Kỳ vọng #3 của issue (step click `Điểm danh` t-attendance): đã xử lý**
   bởi commit `a36113f2` (#404) — `appSteps: []`. Verify lại bằng run thực tế:
   `pnpm design:compare --screens t-attendance` → 12/12 ảnh, 0 lỗi (2026-10-22,
   worktree develop tip).

## Giải pháp (kongming đã GO sau checkpoint investigate; ghi chú điều chỉnh)

- **e2e (playwright):** thêm webServer entry thứ 4 `dev-watchdog` (không
  `url` — hợp lệ trên 1.62.1, chỉ `command` là required; đặt CUỐI mảng vì
  plugin setup chạy tuần tự theo thứ tự config) giám sát 3 service, poll mỗi
  ~3s, fetch timeout 5s, kết luận chết cần 3 fail liên tiếp, phân biệt
  ECONNREFUSED (chết) vs timeout (stall — không restart) vs HTTP status:
  - vite web/student chết thật → restart, tối đa **1 lần/vite**; chết lần 2 →
    ngừng restart + marker + run fail qua globalTeardown. Sau restart có
    warming grace 90s (disarm đếm tới poll OK đầu) để không tự bắn marker
    trên lần restart thành công. Log `[dev-watchdog]`, tail stderr vào
    `test-results/devserver-*.log`.
  - API chết (refused hoặc readyz ≥500) → KHÔNG restart (state DB/auth test —
    `boot.ts` wipe `local.db` mỗi boot), marker + fail-loud.
  - Watchdog tự chết → crash marker + heartbeat stale → teardown phát hiện.
  - Marker/log resolve tuyệt đối `<apps/e2e>/test-results` từ
    `import.meta.url`; mọi dump redact token (rawTail double-pass); restart
    child KHÔNG `detached` (cùng process group với watchdog → teardown
    playwright group-SIGKILL dọn sạch; `coreBundle.js:8905,8995`); spawn
    không shell; command/env dựng từ module chung `devserver-services.mjs`
    dùng lại bởi config (single source).
- **capture.mjs:** watchdog interval 3s trên children api/web/student khi
  capture: child chết → dump `redactLog(outputTail)` + exit 1 (fail-loud,
  KHÔNG restart để giữ ảnh design deterministic).
- **Không đổi:** `--strictPort`, `reuseExistingServer: false`, specs, seed.
  Watchdog là mitigation; root cause native rolldown abort (máy swap cạn)
  thuộc về môi trường máy + bug upstream vite/rolldown — out of scope, ghi
  nhận trong PR.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: e2e dev-watchdog (playwright)](./phase-01-e2e-watchdog.md) | Pending |
| 2 | [Phase 2: capture.mjs fail-loud mid-run](./phase-02-capture-fail-loud.md) | Pending |
| 3 | [Phase 3: Verification gates](./phase-03-verification.md) | Pending |

## Plan Deviations (trong lúc implement)

1. **Race interval-3s vs `page.goto` (phát hiện bởi kill-injection Task 2.2 lần
   2):** web chết ngay sau seed → `page.goto` ERR_CONNECTION_REFUSED thoát qua
   main `try` (chỉ có `finally`) trước tick watchdog đầu tiên → crash exit 1
   KHÔNG có log dump. Fix: thêm `catch` vào main try của capture.mjs — child
   chết → dump tail + exit 1; không child chết → rethrow (lỗi harness thật).
   Kill-injection lần 3: PASS (message + 3 tail + exit 1 + 0 orphan).
2. **Cosmetic từ kill-injection:** bỏ prefix `[dev-watchdog]` trùng lặp trong
   output playwright (entry `name` đã prefix sẵn); console.error "bất ổn" chỉ
   in khi marker mới ghi (trước đó spam mỗi poll).
3. **Interop khác worktree:** kill-injection lần 1 của Task 2.2 (script
   throwaway, không commit) matched nhầm vite của worktree song song
   `ai-handle-issue-403` do match `*/apps/web` không đủ cụm — đã sửa script
   match đúng path worktree; run của session 403 bị ảnh hưởng (rerun được,
   design:compare idempotent). Ghi nhận trong Completion Report.

## Success Criteria

- [ ] Unit test watchdog state machine (node:test) đỏ khi chưa implement logic, xanh sau khi implement.
- [ ] Kill-injection e2e: kill vite 8101 giữa run → watchdog restart, run tiếp tục; kill ≥2 lần → run fail với message rõ.
- [ ] Kill-injection design:compare: kill vite giữa capture → harness exit 1, dump log tail đã redact, không orphan (`lsof` sạch).
- [ ] Kill API giữa e2e run → không restart, run fail kèm message.
- [ ] Full local gate xanh: `pnpm check`, `pnpm check-types`, `pnpm --filter e2e e2e` (override 8100/8101/8103), `pnpm design:compare --screens t-attendance` 12/12.
- [ ] Sau mọi run test: không còn process chiếm 8100/8101/8103.

## Validation Log

### Verification Results (pre-implementation fact-check)
- Claims checked: 8 | Verified: 8 | Failed: 0 | Tier: Light (3 phases → Standard but infra-only; fact-check ran on all load-bearing claims)
- Verified: vite@8.2.1 deps có `rolldown` (node_modules/vite/package.json); crash report .ips stack `rolldown-binding…abort()`; playwright 1.62.1 `onExit` chỉ hiệu quả lúc startup (`runner/index.js:883` — correction từ RT2-Assumption, không phải 877), spawn webServer `detached` + teardown group-SIGKILL (`coreBundle.js:8905,8995`), plugin setup tuần tự (`runner/index.js:5827-5836` taskLoop — correction từ RT2-Assumption), WebServerConfig `url?` optional chỉ `command` required (`types/test.d.ts:10846`), `stderr` forward mặc định khi unset (`runner/index.js:898-901`), `stdout` chỉ forward khi `stdout:"pipe"` (`runner/index.js:894-896`); screens.json t-attendance `appSteps: []` sau #404 (git show a36113f2); baseline run t-attendance 12/12 0 lỗi.
- Bổ sung đã verify khi adjudicate: `boot.ts:31` HOSTNAME mặc định `"::"` (dual-stack, poll localhost OK); `boot.ts:74-84` mỗi boot wipe `local.db` + `-wal`/`-shm` → không restart API là đúng; `readyz` trả 503 khi DB probe fail (`routes/readiness.ts:73`); playwright coi URL available chỉ khi status `< 404` (`coreBundle.js:8514-8524`); teardown unshift đảo ngược → globalTeardown chạy TRƯỚC plugin teardown (`runner/index.js:5835,6082-6094`); `test-results` bị xoá đầu mỗi run (`runner/index.js:6094-6110`); global hook KHÔNG chdir (`runner/index.js:2687-2689`); apps/e2e tsconfig include chưa có `global-teardown.ts`.

### Whole-Plan Consistency Sweep (sau red-team)
- Ngưỡng restart đã thống nhất "tối đa 1 lần/vite; chết lần 2 → marker" ở plan.md, phase-01 (Case B, quy ước 5), và Task 1.4.
- Terminology "điều kiện chết" thống nhất: refused / status≥404 (vite) / status≥500 (api), 3 fail liên tiếp, timeout 5s — plan.md + quy ước 4 phase-01.
- Path marker: "test-results/" trong mọi file hiểu là `<apps/e2e>/test-results` resolve tuyệt đối từ `import.meta.url`. Không còn claim dùng cwd hay path tương đối.
- Không còn mâu thuẫn chưa giải quyết.

## Red Team Review

3 reviewer hostile song song (task agent, persona Security Adversary / Assumption Destroyer / Failure Mode Analyst), mỗi finding bắt buộc có evidence file:line. Tổng 20 findings sau dedupe: **6 High (tính Critical 2 của Failure là High-level deliverable risks), 11 Medium, 3 đã reject**.

| # | Finding (nguồn) | Severity | Disposition |
|---|---|---|---|
| 1 | Marker/log path lệch gốc resolve → fail-open (SecH2 + FailM4b + AssumpF1) | High | **Accept** — quy ước 1+2, teardown resolve từ import.meta.url |
| 2 | Thiếu warming/grace sau restart → self-marker giả (FailC1 + AssumpF2) | Critical | **Accept** — Case E, grace 90s |
| 3 | Nhầm stall↔chết; fetch status semantics lệch playwright (FailC2 + AssumpF6) | Critical | **Accept** — quy ước 4, Case D/F |
| 4 | Restart child chết yểu không ai biết (FailC2b) | High | **Accept** — exit-listener, Task 1.2.5 |
| 5 | Thiếu URL student (FailH1 + AssumpF5) | High | **Accept** — buildServices + case test |
| 6 | Redact thiếu ở nhánh API-chết/marker/message (SecH1 + FailH2 + SecM8a) | High | **Accept** — quy ước 3, case redact biên chunk |
| 7 | Watchdog tự chết fail-open (SecH3 + FailH3 + AssumpF4) | High | **Accept** — crash marker + heartbeat + case 1.4.4 |
| 8 | Teardown race cửa sổ cuối (FailM1) | Medium | **Accept** — teardown probe 3 URL |
| 9 | `bash -lc` login shell (SecM4 + FailM6b + AssumpF7) | Medium | **Accept** — spawn không shell + module chung |
| 10 | Port env không validate (SecM5) | Medium | **Accept** — parsePorts + exit 2 |
| 11 | Marker schema/parse guard/control chars (SecM6) | Medium | **Accept** — schema quy ước 6 |
| 12 | ENOENT teardown guard (SecM7) | Medium | **Accept** — Task 1.3.4a |
| 13 | Acceptance 1.4 "run pass" phi thực (FailM2 + AssumpF3) | Medium | **Accept** — đổi pass condition, --retries=1 |
| 14 | Unit test lệch layer (FailM3) | Medium | **Accept** — buildRestartCommand/buildSpawnOptions pure |
| 15 | tsconfig include thiếu global-teardown.ts (FailM4a) | Medium | **Accept** — Task 1.3.5 |
| 16 | Marker log rỗng lần chết đầu (FailM5) | Medium | **Accept** — originalLogNote |
| 17 | Ngưỡng mâu thuẫn plan.md ↔ spec (FailM6a) | Medium | **Accept** — thống nhất 1 restart/vite |
| 18 | stopChildWatchdog đầu finally (Fail note) | Medium | **Accept** — phase-02 Task 2.1.4 |
| 19 | Mở rộng TOKEN_RE (key=/sig=) (SecM8b) | Medium | **Reject** — chỉ `token=` tồn tại (#397); speculative |
| 20 | Path traversal `--label` capture.mjs (SecM9) | Medium | **Reject** — pre-existing, ngoài scope #402; ghi follow-up trong PR |
| 21 | PID-run-binding marker (SecM10) | Medium | **Reject** — YAGNI; run trùng worktree bị strictPort chặn trong startup |

Marker `devserver-*.fail.json` + heartbeat đã được thiết kế chống forge ở mức hợp lý (schema + parse guard + truncate); đánh đổi residual: process local ghi được file marker vẫn fail được run (máy dev, chấp nhận — same trust domain).
