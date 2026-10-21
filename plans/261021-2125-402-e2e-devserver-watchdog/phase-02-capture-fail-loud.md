---
phase: 2
title: "capture.mjs fail-loud mid-run"
status: completed
priority: P1
effort: 1h
dependencies: [1]
---

# Phase 2: capture.mjs fail-loud mid-run

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
`pnpm design:compare` (capture.mjs) phát hiện api/web/student chết giữa lúc
capture (sau seed) → dump log tail đã redact + exit 1 NGAY, thay vì cascade
connection-refused im lặng trên nửa còn lại của run. Không restart (giữ ảnh
design deterministic — quyết định kongming).

## Files to Create / Modify
- Modify: `scripts/design-compare/capture.mjs` — thêm `startChildWatchdog()`/`stopChildWatchdog()` quanh vùng capture.

## Tasks & Steps

### Task 2.1 — Watchdog children trong capture.mjs
- Goal: child chết giữa capture → fail loud với log đầy đủ.
- Target files: `scripts/design-compare/capture.mjs` (hàm `start`/vùng `// ── capture ──`).
- Steps:
  1. Thêm hàm `childAlive(c)` = `c.exitCode === null && c.signalCode === null`.
  2. Thêm `startChildWatchdog()`: `setInterval` 3000ms — với mỗi child đã start trong `children` (chỉ api/web/student; design là spawnSync blocking nên không nằm trong children dài hạn), nếu `!childAlive(c)` thì: `clearInterval`, `console.error("[harness] <name> CHẾT giữa run (exit=" + c.exitCode + " signal=" + c.signalCode + ")")`, dump `redactLog(outputTail.get(name))` cho TẤT CẢ các service (đủ ngữ cảnh crash), rồi `process.exit(1)` (handler `exit` đã có sẽ cleanup process group + design).
  3. Gọi `startChildWatchdog()` ngay trước khối `try {` của vùng capture (chỉ khi `needApp`; nếu chỉ `--side design` không có app server thì không cần watchdog).
  4. `stopChildWatchdog()` (clearInterval) là statement ĐẦU của `finally` —
     TRƯỚC `await browser.close()` (Fail RT2-Failure: tránh exit(1) giữa
     `browser.close()` nếu child chết đúng khoảnh khắc đó), trước khi
     `process.exit(failures.length ? 1 : 0)` để không false-positive lúc
     shutdown.
- Success criteria: file parse được; watchdog không can thiệp lúc shutdown bình thường.
- Verify: `node --check scripts/design-compare/capture.mjs` exit 0 (so sánh output).

### Task 2.2 — Kill-injection smoke design:compare
- Goal: chứng minh fail-loud thật, không orphan.
- Target files: không sửa code — chỉ chạy.
- Steps:
  1. `pnpm design:compare --screens all` chạy nền (không reuse ảnh cũ: xóa `scripts/design-compare/.state/raw/new` trước để nó phải capture lại nhiều bước, kéo dài đủ lâu).
  2. Đợi qua seed (log `seed xong`), xác định PID `vite --port <WEB_PORT free-port hiện tại>` qua `lsof`/`ps` rồi `kill -9` nó.
  3. Kỳ vọng trong ≤10s: log `[harness] web CHẾT giữa run …` + tail log api/web/student + process harness exit code 1.
  4. Sau exit: `lsof -nP -iTCP -sTCP:LISTEN | grep -E "vite|node"` cho các port của run — phải rỗng (không orphan).
- Success criteria: đủ 3 kết quả (dump + exit 1 + port sạch).
- Verify: dán log kill-injection + exit code + kết quả lsof vào evidence.

## Verification (phase gate)
- `node --check scripts/design-compare/capture.mjs` exit 0.
- Kill-injection Task 2.2 đủ kết quả.
- Run sạch `pnpm design:compare --screens t-attendance` vẫn 12/12, 0 lỗi (watchdog không false-positive).
