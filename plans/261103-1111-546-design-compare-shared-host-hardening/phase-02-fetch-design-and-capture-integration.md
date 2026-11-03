---
phase: 2
title: "Phase 2: Fetch-Design & Capture Integration + Smoke Verification"
status: completed
priority: P1
effort: "1.5h"
dependencies: [1]
---

# Phase 2: Fetch-Design & Capture Integration + Smoke Verification

## Goal
Tích hợp toàn bộ cơ chế bảo vệ từ `harness-lib.mjs` vào `scripts/design-compare/fetch-design.sh` và `scripts/design-compare/capture.mjs` (kể cả các quyết định red-team: kiểm tra port TRƯỚC thao tác git, `DESIGN_NO_REUSE` + exit `3`, xác minh danh tính tiến trình trước khi kill, làm chủ tín hiệu Chromium), bổ sung integration test trực tiếp cho `fetch-design.sh`, và chạy smoke verification thực tế trên Linux (thành công + ngắt `SIGTERM`) cùng toàn bộ cổng kiểm tra của repo.

## Files to Create / Modify
- Modify: `scripts/design-compare/fetch-design.sh`
- Modify: `scripts/design-compare/capture.mjs`
- Modify: `scripts/design-compare.test.mjs`

## Handover Note
Plan này được viết theo hợp đồng bàn giao `--advice` + `--tdd`: mỗi Task có bước thực thi cụ thể, điều kiện đạt quan sát được, lệnh `Verify` cơ học và khối `Failure Protocol` bắt buộc dừng + hỏi `kongming` ngay khi bất kỳ `Verify` nào lệch kết quả kỳ vọng.

## Tasks & Steps

### Task 2.1 — Bổ sung integration test TDD (Red) cho `fetch-design.sh`
- **Goal:** Viết trước các bài test tích hợp trong `scripts/design-compare.test.mjs` kiểm chứng `fetch-design.sh` từ chối listener lạ trên `DESIGN_PORT` TRƯỚC mọi thao tác git/network (không cần `gh`, không treo CI), từ chối `DESIGN_PORT` không hợp lệ, kiểm soát reuse theo `DESIGN_NO_REUSE`, và khởi chạy/dừng sạch process group theo cổng `.pid-$PORT`.
- **Target files and symbols:**
  - `scripts/design-compare.test.mjs`
- **Steps:**
  1. Thêm các test case mới vào `scripts/design-compare.test.mjs` (mọi test chạy `fetch-design.sh` trong thư mục tạm `TMP` với `DESIGN_CACHE_DIR="$TMP/.cache/design-v2"` — biến override được thêm ở Task 2.2 để test không đụng `.cache` thật của worktree):
     - **Test `DESIGN_PORT` không hợp lệ:** chạy `fetch-design.sh run` với `DESIGN_PORT="abc"` và `DESIGN_PORT="70000"` → kỳ vọng exit `2` và stderr chứa thông báo port không hợp lệ.
     - **Test port bận từ chối reuse (`DESIGN_NO_REUSE`):** dựng HTTP server trên `127.0.0.1:<port>` với hai biến thể payload — (i) nội dung lạ (`"hello from stranger"`) và (ii) đúng chữ ký design-v2 (`/` có `<div id="root"></div>`, `/src/lib/art.tsx` chứa `TeacherDesk` + phần đệm > 64 KiB sau `TeacherDesk` để bẫy SIGPIPE của `curl | grep -q`) — chạy `DESIGN_NO_REUSE=1 DESIGN_PORT=<port> bash scripts/design-compare/fetch-design.sh run` với cả hai → kỳ vọng kết thúc trong `<5s` với exit `3` và stderr chứa `"occupied by another service"` / `"occupied by another design-v2"` (KHÔNG chứa `"already on"`); KHÔNG tạo gì trong `DESIGN_CACHE_DIR` trước đó, không bao giờ được đụng `gh repo clone` (bằng chứng: hoàn thành nhanh mà không tạo `$DESIGN_CACHE_DIR`). Chạy thêm lần nữa KHÔNG có `DESIGN_NO_REUSE` với biến thể (ii) → in `"design v2 already on 127.0.0.1:<port>"` và exit `0` (chỉ phục vụ người chạy tay).
     - **Test lifecycle `run`/`stop` cô lập theo port:** dựng fake `pnpm` trong `PATH` tạm thời chạy một Node HTTP server trên `127.0.0.1:$PORT` phục vụ đúng chữ ký, đồng thời đẻ thêm một tiến trình cháu bắt và phớt lờ `SIGTERM`; chạy `fetch-design.sh run` → kiểm chứng `.pid-$PORT` và `.dev-$PORT.log` được tạo; chạy `fetch-design.sh stop` → kiểm chứng cả server lẫn tiến trình cháu đều chết sạch và `.pid-$PORT` được xoá.
     - **Test `stop` với `.pid-$PORT` stale (danh tính sai):** ghi thủ công `.pid-$PORT` chứa PGID của một tiến trình KHÔNG phải `vite` (ví dụ `sleep 30` do test tự tạo), chạy `fetch-design.sh stop` → kỳ vọng tiến trình đó KHÔNG bị kill và file pid bị xoá (in cảnh báo stale).
- **Success criteria:** Các test mới thất bại trên bản `fetch-design.sh` cũ (do bản cũ tin nhầm HTTP 200 lạ, chưa có `.pid-$PORT` / kiểm tra `PORT` / `DESIGN_NO_REUSE` / xác minh danh tính).
- **Verify:** `pnpm test:design-compare` thoát mã khác `0` ở đúng các test tích hợp `fetch-design.sh` vừa thêm (nếu thoát `0` ngay khi chưa sửa `fetch-design.sh` là sai).

### Task 2.2 — Cứng hoá `scripts/design-compare/fetch-design.sh` (Green)
- **Goal:** Sửa `scripts/design-compare/fetch-design.sh` để xác thực `PORT`, kiểm tra port/chữ ký TRƯỚC mọi thao tác git/clone (đáp ứng `<5s` và không cần `gh` trong test), bind loopback `127.0.0.1`, tách `.pid-$PORT` / `.dev-$PORT.log` theo worktree, quản lý vòng lifecycle process group di động bằng Node, và chỉ dừng đúng server do phiên mình spawn.
- **Target files and symbols:**
  - `scripts/design-compare/fetch-design.sh` (`is_design_v2`, `port_is_listening`, `pid_identity_is_ours`, nhánh `run`, nhánh `stop`)
- **Steps:**
  1. Đặt `umask 077` ở đầu script; neo đường dẫn tuyệt đối từ vị trí script: `ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"`, `DIR="${DESIGN_CACHE_DIR:-$ROOT_DIR/.cache/design-v2}"` (không phụ thuộc `pwd` của người gọi — quy chuẩn giống `apps/e2e/devserver-watchdog.mjs:21`).
  2. Kiểm tra `PORT="${DESIGN_PORT:-8200}"`: xác thực `[[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ]`, nếu sai in lỗi ra stderr và `exit 2`.
  3. Viết hàm `is_design_v2()` KHÔNG dùng pipe trực tiếp `curl | grep -q` (chống SIGPIPE dưới `set -o pipefail` — red-team Finding 4): bọc output vào biến trước rồi mới grep:
     ```bash
     is_design_v2() {
       local root_html art_src
       root_html="$(curl -sf --noproxy '*' --max-time 2 "http://127.0.0.1:$PORT/")" || return 1
       art_src="$(curl -sf --noproxy '*' --max-time 2 "http://127.0.0.1:$PORT/src/lib/art.tsx")" || return 1
       grep -Fq '<div id="root"></div>' <<<"$root_html" && grep -Fq 'TeacherDesk' <<<"$art_src"
     }
     ```
     (comment gắn với `SHA="7a53fc0fcbf415367d245539cedc3855606266a7"`; khi nâng SHA phải kiểm tra lại chữ ký).
  4. Viết `port_is_listening()` dùng `node -e` thử kết nối TCP tới `127.0.0.1:$PORT` và `::1:$PORT` (timeout 500ms) — bắt buộc truyền tham số qua `node -e '<script>' -- "$PORT"` (script trong nháy đơn, đọc từ `process.argv.slice(1)`; tuyệt đối không nội suy biến shell vào chuỗi JS).
  5. Nhánh `run`, THỨ TỰ bắt buộc: (a) validate `PORT` → (b) kiểm tra listener/chữ ký trên `127.0.0.1:$PORT` → (c) nếu qua được các bước trên mới tiến hành clone/checkout/install:
     - Nếu `is_design_v2` trả `0`: nếu `DESIGN_NO_REUSE=1` → in lỗi `"port :$PORT is occupied by another design-v2 instance (DESIGN_NO_REUSE=1)"` và `exit 3`; ngược lại in `"design v2 already on 127.0.0.1:$PORT"` và `exit 0` (chỉ phục vụ người chạy tay, `capture.mjs` luôn set `DESIGN_NO_REUSE=1`).
     - Nếu không phải design-v2: nếu `port_is_listening` → in `"design v2 error: port :$PORT is occupied by another service (not design-v2)"` và `exit 3`.
     - `[ ! -d "$DIR/.git" ]` → `gh repo clone vinh19410/teacheros-design-v2 "$DIR"`;
       sau đó CHỈ chạy `git -C "$DIR" fetch origin "$SHA" >/dev/null 2>&1 || true` và `git -C "$DIR" checkout -q "$SHA"` khi `[ "$(git -C "$DIR" rev-parse HEAD 2>/dev/null || true)" != "$SHA" ]` (bỏ network ở lần chạy sau).
     - `[ ! -d "$DIR/node_modules" ]` → `(cd "$DIR" && pnpm install --ignore-workspace --silent)`.
     - Khởi chạy `pnpm exec vite --host 127.0.0.1 --port "$PORT" --strictPort` bằng one-liner `node -e` với `spawn(..., { cwd, env: { ...process.env, FIGMA_DEV_SERVER_HOST: "127.0.0.1", FIGMA_PUBLIC_URL: "" }, detached: true, stdio: ["ignore", outFd, outFd] })`, `child.unref()`, ghi `child.pid` (chính là `PGID` của nhóm tiến trình mới trên cả Linux và macOS) vào `"$PID_FILE=$DIR/.pid-$PORT"`; log ghi vào `"$DIR/.dev-$PORT.log"` (mỗi cổng một file).
     - Vòng chờ tối đa 60s: nếu `kill -0 "$(cat "$PID_FILE")"` thất bại (vite chết sớm) → in tail `"$LOG"` và `exit 1`; nếu `is_design_v2` trả `0` → in `"design v2 on 127.0.0.1:$PORT (pgid $(cat "$PID_FILE"))"` và `exit 0`. Hết 60s → gọi logic dừng nhóm `PGID`, in tail log và `exit 1`.
  6. Nhánh `stop`:
     - Đọc `PID` từ `"$PID_FILE"` (nếu hợp lệ `> 1`); XÁC MINH DANH TÍNH trước khi gửi tín hiệu (red-team Finding 1): với Linux đọc `/proc/$PID/cmdline` (kết nối các mục bằng khoảng trắng) hoặc fallback `ps -p "$PID" -o args=`; chỉ tiếp tục khi cmdline chứa `vite` VÀ `--port $PORT` (hoặc `"$PORT"`). Nếu không khớp → chỉ `rm -f "$PID_FILE"`, in cảnh báo `"stale pid file (không phải vite của mình)"` và thoát `0` (không bắn tín hiệu vào tiến trình lạ).
     - Khi khớp: gửi `kill -TERM -- -"$PID"`, chờ tối đa ~3s (30 × 0.1s) cho tới khi `kill -0 -- -"$PID"` thất bại; nếu vẫn sống bắn `kill -KILL -- -"$PID"`; xoá `"$PID_FILE"`.
  7. Mọi `curl` loopback đều có `--noproxy '*'` (chống `HTTP_PROXY` bẻ hướng probe — red-team Finding 5).
- **Success criteria:** Tất cả unit + integration test trong `scripts/design-compare.test.mjs` đều pass.
- **Verify:** `pnpm test:design-compare` thoát mã `0` và in `# fail 0`.

### Task 2.3 — Tích hợp `harness-lib.mjs` vào `scripts/design-compare/capture.mjs`
- **Goal:** Nối toàn bộ 5 bản sửa + các quyết định red-team vào `scripts/design-compare/capture.mjs` và cập nhật tài liệu đầu file.
- **Target files and symbols:**
  - `scripts/design-compare/capture.mjs` (header usage comment, CLI args, cấp port, `start`, `shutdown`, `syncBackstopCleanup`, `waitUrl`, `startChildWatchdog`, boot design server, `shoot`, khối `app`, `design`, `compose`)
- **Steps:**
  1. Cập nhật comment hướng dẫn đầu file `capture.mjs` thêm cờ `[--force]`.
  2. Thay đoạn parse args thủ công bằng `parseCliArgs(process.argv.slice(2))` (validate cờ lạ/`--label` — red-team Finding 4) và thay `freePort()` cũ bằng `probeFreePort` / `buildChildEnv` / `redactLog` / `createLogCollector` / `verifyDesignV2Server` / `loadPngJs` / `assertNonBlankPngFile` / `shouldCompose` / `ensurePrivateDir` / `killProcessGroup` / `killProcessGroupSync` / `spawnAsync` từ `./harness-lib.mjs`.
  3. Cấp port & boot (red-team Findings 1, 2, 6):
     - Giữ nguyên `WEB = http://localhost:${WEB_PORT}`, `STUDENT = http://localhost:${STUDENT_PORT}`, `API = http://localhost:${API_PORT}` (bảo toàn CORS/cookie `apps/e2e/src/boot.ts:34-40`). Chỉ cấp `[API_PORT, WEB_PORT, STUDENT_PORT]` khi `needApp` bật, qua `probeFreePort({ excludePorts })` bảo đảm 3 giá trị khác nhau.
     - Đổi `start(name, cmd, args, opts)` sang nhận `cmd` + mảng `args` trực tiếp (bỏ `shell: true`):
       - `api`: `start("api", "pnpm", ["--filter", "e2e", "run", "boot:api"], { extraEnv: { E2E_HOSTNAME: "127.0.0.1" } })`
       - `web`: `start("web", "pnpm", ["--filter", "web", "exec", "vite", "--host", "127.0.0.1", "--port", String(WEB_PORT), "--strictPort"])` (tự động nhận `VITE_TEACHER_SIGNUP_ENABLED: "true"` từ `buildChildEnv`)
       - `student`: `start("student", "pnpm", ["--filter", "student", "exec", "vite", "--host", "127.0.0.1", "--port", String(STUDENT_PORT), "--strictPort"])`
     - Sau khi `waitUrl` của `api` thành công: kiểm tra MỘT LẦN listener `[::1]:API_PORT` bằng probe đơn giản (dùng `net.connect` tới `[::1]` với timeout ~500ms) — nếu có kết nối thì fail-loud ngay với message rõ (`"api :$API_PORT cũng bị nghe trên [::1] (localhost dual-stack) — dừng để tránh hijack"`); nếu probe phức tạp quá ~20 dòng hoặc cần test matrix riêng thì bỏ hẳn (chấp nhận rủi ro, ảnh hỏng sẽ hiện qua shot fail).
     - Đổi `waitUrl(url, { child, ... })`: mỗi vòng poll phải kiểm tra `childAlive(child)` (dùng `child.exitCode === null && child.signalCode === null`) — nếu child đã chết thì throw NGAY thay vì chờ hết 150s; truyền child tương ứng vào mọi lệnh `waitUrl` của api/web/student.
     - Gọi `startChildWatchdog()` ngay sau khi api/web/student lần lượt qua `waitUrl` (trước `warm()` và `design-seed.ts`) — watchdog phát hiện child chết giữa warm/seed sẽ `await shutdown(1)` kèm dump log tail.
     - `DESIGN_PORT` + `DESIGN = http://127.0.0.1:${DESIGN_PORT}` được cấp ngay tại bước khởi động `design-v2` (tối đa 3 lần thử với `probeFreePort({ excludePorts })` mới, CHỈ retry khi `fetch-design.sh` trả exit `3` — port bận; các exit khác (clone/auth lỗi) fail ngay).
  4. Thay 3 chỗ `spawnSync` (`cleanup()` stop ở `:184`, `design-seed.ts` ở `:266`, `fetch-design.sh` ở `:299`) bằng `await spawnAsync(...)`, đăng ký tiến trình đang chạy vào tập `activeChildren` để nếu `capture.mjs` nhận `SIGINT`/`SIGTERM`/`SIGHUP` giữa lúc seed thì `shutdown()` lập tức giết cả nhóm tiến trình seed lẫn `api`/`web`/`student` (khi đó child-seed chưa kết thúc nên vẫn alive; child đã thoát bị loại khỏi vòng kill).
  5. Thay `cleanup()` và các signal handler bằng:
     - `chromium.launch({ handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false })` — `shutdown()` là chủ duy nhất của tín hiệu (red-team Finding 3).
     - Bọc toàn bộ pipeline boot + seed + design + capture + verdict trong `async function main()`, gọi `main().then((code) => shutdown(code ?? 0), (err) => { console.error(err); return shutdown(1); })`; nối thêm `process.on("uncaughtException", ...)` / `process.on("unhandledRejection", ...)` → `shutdown(1)` để mọi đường throw (fill thiếu seed key, `waitUrl`, rethrow ở khối catch) đều đi qua chu trình dọn dẹp.
     - `async function shutdown(exitCode)`: IDEMPOTENT bằng một promise duy nhất (`if (shuttingDown) return shuttingDown;` — mọi đường gọi: signal, `uncaughtException`/`unhandledRejection`, `main().catch`, kết thúc bình thường đều await CÙNG một promise); có deadline cứng tổng ~5s (`Promise.race` với timeout) để không bao giờ treo; dừng `childWatchdogTimer`; chạy SONG SONG bằng `Promise.allSettled` (t=0ms gửi tín hiệu cho mọi nhóm — không chờ browser trước): (1) `browser.close()` có trần ~2s (tự race timeout), (2) `killProcessGroup(c.pid, { graceMs: 2_000 })` cho mọi child alive trong `children` + `activeChildren`, (3) `spawnAsync("bash", [fetchDesignSh, "stop"], { env: { ...process.env, DESIGN_PORT: String(designPort) }, timeoutMs: 10_000 })` nếu `designPort && !keepDesign` (bản `stop` đã tự xác minh danh tính + `DESIGN_NO_REUSE` không cần ở đây vì `.pid-$PORT` chỉ tồn tại khi chính mình spawn); xong gọi `process.exit(exitCode)`.
     - Nối `SIGINT` (130), `SIGTERM` (143), `SIGHUP` (129) vào `void shutdown(code)`.
     - `process.on("exit", syncBackstopCleanup)` CHỈ dùng kill đồng bộ (`killProcessGroupSync`), TUYỆT ĐỐI không async trong `'exit'` handler; gọi cho các child alive còn lại; đồng thời (Linux only, `/proc` không có → skip kill, KHÔNG đoán) đọc `$DIR/.pid-$DESIGN_PORT` (khi `designPort && !keepDesign`): nếu PGID alive và cmdline (đọc từ `/proc/<pid>/cmdline`) chứa `vite` + port thì `killProcessGroupSync(pgid)` rồi `rmSync(pidFile, { force: true })` — chốt chống rò rỉ design-v2 khi thoát đồng bộ.
  6. Nạp `const { PNG } = loadPngJs(ROOT)` một lần khi khởi động; gọi `ensurePrivateDir(STATE)` (mode `0o700`) ngay sau khi tạo `STATE`; sau `ctx.storageState({ path: ... })` gọi `await chmod(path, 0o600)` cho `teacher.json` / `student.json` (red-team Finding 6); trong `shoot(page, file)` sau `await page.screenshot({ path: file, fullPage: true })`, gọi `await assertNonBlankPngFile(file, PNG)` (tự xoá `file` rồi throw nếu ảnh trắng/rỗng; ngưỡng `minNonDominantRatio` chặn luôn ảnh trắng chỉ có viền/badge góc).
  7. Áp cờ `force` + compose an toàn (red-team Finding 2):
     - Nhánh `app` (~dòng 495) và nhánh `design` (~dòng 607): khi `force` bật → `await rm(rawFile, { force: true })` TRƯỚC khi `goto`/`runSteps` (nếu bước nào ném lỗi trước `shoot()` thì không còn raw stale trên đĩa); điều kiện skip trở thành `if (!force && existsSync(rawFile))`.
     - Ghi lại kết quả chụp thất bại vào tập `failedShots` với key chính xác `${sc.id}/${vpName}-${theme}` (không dò chuỗi trong `failures` — tránh trùng prefix `t-syllabus` / `t-syllabus-detail`).
     - Nhánh `compose` (~dòng 650): xác định danh sách file raw bắt buộc của cell (`raw/${label}` khi `needApp`, `raw/design` khi `sc.design` và không bị `skipViewports`); nếu cell nằm trong `failedShots` hoặc thiếu file bắt buộc → đẩy lỗi tường minh vào `failures` (nếu chưa có) và `continue` — tuyệt đối không gọi `compose` với cột thiếu; ngược lại dùng `shouldCompose(outFile, candidateFiles, { force })` để quyết định ghi đè `outFile`.
     - Đổi chữ ký `compose(browser, outFile, columns)`: tái sử dụng `browser` đang mở của `capture.mjs`, tạo `const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })`, và trong `finally` chỉ `await ctx.close()` (tuyệt đối không `browser.close()` — tránh shadow biến và không để rò rỉ 198 tab khi `--screens all`).
- **Success criteria:** `biome check`, `check-types`, và toàn bộ `pnpm test` đều pass.
- **Verify:** `pnpm exec biome check . && pnpm check-types && pnpm test` thoát mã `0`.

### Task 2.4 — Smoke Verification thực tế trên Linux cho `design:compare` + kiểm tra 0 tiến trình mồ côi
- **Goal:** Chạy thử thực tế `capture.mjs` trên một màn (`--screens login-teacher --force`) cho cả 2 kịch bản — hoàn tất bình thường và ngắt giữa chừng bằng `SIGTERM` — để chứng minh: `web` bật form `#su-name` (`warm` + `design-seed.ts` thành công), `design-v2` bind `127.0.0.1` và qua kiểm tra chữ ký, ảnh raw qua kiểm tra pixel `pngjs`, ảnh compose được ghi đè thật sự dù `outFile` đã tồn tại sẵn trong git, và sau cả 2 kịch bản không còn tiến trình mồ côi; hoàn trả `git checkout -- plans/261020-1446-378-redesign-design-v2/screenshots` sau khi kiểm chứng.
- **Target files and symbols:**
  - Runtime verification trên `scripts/design-compare/capture.mjs` và `scripts/design-compare/fetch-design.sh` (không để lại file rác trong git).
- **Steps:**
  1. Ghi nhận `mtimeMs` ban đầu của `plans/261020-1446-378-redesign-design-v2/screenshots/login-teacher/desktop-light.png`.
  2. **Smoke bình thường:** chạy `node scripts/design-compare/capture.mjs --screens login-teacher --force`. Kiểm chứng lệnh thoát mã `0`, in `0 lỗi`, `mtimeMs` của ảnh trên tăng lớn hơn giá trị ban đầu, và `.cache/design-v2/.dev-*.log` chỉ hiện `http://127.0.0.1:` (không có `0.0.0.0` hay IP public).
  3. **Smoke ngắt SIGTERM:** chạy lại `node scripts/design-compare/capture.mjs --screens login-teacher --force` ở chế độ nền (`&`, lưu PID), chờ tới khi log in dấu hiệu server đã sẵn sàng (ví dụ thấy `[harness] boot web…` hoặc endpoint `127.0.0.1:$DESIGN_PORT` đã nghe), gửi `kill -TERM $PID`, chờ tiến trình kết thúc → kỳ vọng exit `143` và sau đó KHÔNG còn tiến trình con nào sống (api/web/student/design-v2 đều đã được dọn).
  4. Khôi phục ảnh mẫu của plan #378 (`git checkout -- plans/261020-1446-378-redesign-design-v2/screenshots`) để PR #546 chỉ chứa đúng code/test của #546.
  5. Kiểm tra tiến trình mồ côi bằng pattern chặn không tự khớp (red-team Finding 8): `pgrep -af "[t]eacher-os-546-design-compare-shared-host-hardening.*(boot\.ts|vite|design-seed|capture\.mjs|fetch-design)"` → kỳ vọng KHÔNG trả kết quả nào (exit `1`).
- **Success criteria:** Cả 2 smoke run đạt kỳ vọng, ghi đè compose thành công, không lộ `0.0.0.0`, và `0` tiến trình mồ côi thuộc worktree.
- **Verify:** Lệnh smoke bình thường thoát `0`; lệnh smoke SIGTERM cho exit `143`; lệnh `pgrep` ở bước 5 thoát mã `1` (không có kết quả).

## Verification
- `pnpm exec biome check .` thoát mã `0`.
- `pnpm check-types` thoát mã `0`.
- `pnpm test` thoát mã `0`.
- Smoke run `node scripts/design-compare/capture.mjs --screens login-teacher --force` thoát mã `0`, smoke ngắt `SIGTERM` cho exit `143`, và không để lại tiến trình mồ côi.

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
