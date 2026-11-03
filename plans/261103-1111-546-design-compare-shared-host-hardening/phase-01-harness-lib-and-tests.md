---
phase: 1
title: "Phase 1: Harness Library & TDD Suite"
status: completed
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Harness Library & TDD Suite

## Goal
Xây dựng module `scripts/design-compare/harness-lib.mjs` chứa toàn bộ logic có thể kiểm thử độc lập của harness (parse CLI args có validate, env child có `VITE_TEACHER_SIGNUP_ENABLED=true`, dò free port dual-stack, nhận diện chữ ký `design-v2`, kiểm tra pixel PNG bằng `pngjs`, tính staleness `compose`, spawn bất đồng bộ và giết process group `SIGTERM` → `SIGKILL`) theo quy trình TDD đỏ → xanh với `scripts/design-compare.test.mjs`.

## Files to Create / Modify
- Create: `scripts/design-compare/harness-lib.mjs`
- Create: `scripts/design-compare.test.mjs`
- Modify: `package.json`

## Handover Note
Plan này được viết theo hợp đồng bàn giao `--advice` + `--tdd`: mỗi Task có bước thực thi cụ thể, điều kiện đạt quan sát được, lệnh `Verify` cơ học và khối `Failure Protocol` bắt buộc dừng + hỏi `kongming` ngay khi bất kỳ `Verify` nào lệch kết quả kỳ vọng.

## Tasks & Steps

### Task 1.1 — Đăng ký script `test:design-compare` và viết bộ test TDD giai đoạn Red
- **Goal:** Tạo bộ test `scripts/design-compare.test.mjs` kiểm chứng đầy đủ các nhóm hành vi (kể cả các ca red-team được chấp nhận) và nối vào `package.json`, xác nhận trạng thái Red (chưa có `harness-lib.mjs`).
- **Target files and symbols:**
  - `package.json` (`scripts.test`, `scripts["test:design-compare"]`)
  - `scripts/design-compare.test.mjs` (file mới)
- **Steps:**
  1. Trong `package.json`, thêm `"test:design-compare": "node --test scripts/design-compare.test.mjs"` ngay sau `"test:devserver-watchdog"` (dòng 28) và nối `&& pnpm test:design-compare` vào cuối `"test"` (dòng 25).
  2. Tạo `scripts/design-compare.test.mjs` dùng `node:test` và `node:assert/strict` (theo đúng mẫu `scripts/devserver-watchdog.test.mjs`), import từ `./design-compare/harness-lib.mjs`:
     - `parseCliArgs`: kiểm tra mặc định (`screens: "all"`, `side: "both"`, `label: "new"`, `keepDesign: false`, `force: false`); parse `--force`, `--keep-design`, `--screens a,b`; ném lỗi khi `--side` sai giá trị, khi gặp cờ lạ bắt đầu `--` không thuộc danh sách cho phép, khi cờ cần giá trị nhưng token kế tiếp bắt đầu bằng `--` (ví dụ `--screens --force` phải throw), và khi `--label` chứa ký tự ngoài `/^[a-z0-9_-]{1,32}$/` (ví dụ `--label ../../..` phải throw).
     - `buildChildEnv`: kiểm tra luôn gán `VITE_TEACHER_SIGNUP_ENABLED: "true"`, giữ nguyên `http://localhost:${apiPort}` cho `VITE_SERVER_URL`, truyền đúng `E2E_API_PORT`, `E2E_WEB_PORT`, `E2E_STUDENT_PORT`, và cho phép `extraEnv` ghi đè khi cần.
     - `redactLog` (bản mở rộng): đầu vào chứa `https://app/api/auth/reset-password/abc123?token=x` → không còn đường dẫn token; chứa `https://app/pay/p7Hq2x` → không còn `p7Hq2x`; chứa `x-access-token:ghp_ABCDEF1234567890` và `Bearer github_pat_ABCDEF123456` → bị che; chứa `https://app/verify-email?token=xyz` → vẫn che như cũ (regression).
     - `probeFreePort` & `isPortFreeOnLoopback`: dựng một TCP server chiếm sẵn một cổng trên `::1` (nếu máy hỗ trợ IPv6) và kiểm chứng `isPortFreeOnLoopback(port)` trả `false` cho cổng bị chiếm trên `::1` hoặc `127.0.0.1`; `probeFreePort()` trả về cổng trống hợp lệ (`1..65535`); gọi `probeFreePort()` nhiều lần với `excludePorts` để bảo đảm 3 cổng cấp ra khác nhau.
     - `isDesignV2Fingerprint` & `verifyDesignV2Server`: dựng HTTP server giả trả 200 HTML thường → bị từ chối (`ok: false`); dựng HTTP server giả phục vụ `/` có `<div id="root"></div>` và `/src/lib/art.tsx` chứa `export function TeacherDesk` → được chấp nhận (`ok: true`); dựng HTTP server trả `302 Location: http://127.0.0.1:1/` → bị từ chối (`redirect: "error"`); dựng HTTP server trả `/src/lib/art.tsx` với body > 256 KiB → bị từ chối (giới hạn dung lượng).
     - `loadPngJs`, `inspectPngBuffer`, `assertNonBlankPngFile`: kiểm chứng `loadPngJs()` tải thành công `PNG` qua chuỗi phụ thuộc `@playwright/test` (ưu tiên) mà không sửa lockfile; tạo bằng `PNG.sync.write` các ảnh PNG 40×40: (a) trắng 100% `rgba(255,255,255,255)`, (b) trong suốt 100% `rgba(0,0,0,0)`, (c) tối đồng nhất 100% `rgba(12,12,14,255)`, (d) ảnh có nội dung thật (nền trắng/tối + khối chữ/nút khác màu > 5% diện tích) — (a), (b), (c) đều bị `assertNonBlankPngFile` ném lỗi VÀ file tạm trên đĩa đã bị xoá (`existsSync === false`), (d) pass và giữ nguyên file. Thêm 2 ca red-team: (e) ảnh nền trắng có viền tối dày 2px chạy viền ngoài (≈ 2% pixel, vẫn dưới ngưỡng màu chủ đạo) phải bị từ chối; (f) ảnh 1440×900 nền trắng chỉ có badge màu ~44×44 ở góc dưới-phải (~0.12%) phải bị từ chối.
     - `shouldCompose`: bảng chân trị đầy đủ cho `(missing outFile -> true)`, `(outFile mới hơn mọi input và force=false -> false)`, `(một input có mtimeMs > outFile.mtimeMs và force=false -> true)`, `(outFile mới hơn mọi input nhưng force=true -> true)`, `(không có input nào tồn tại -> false)`.
     - `killProcessGroup` & `spawnAsync`:
       - Spawn một process group con thực tế có tiến trình con bên trong bắt và phớt lờ `SIGTERM` (`process.on("SIGTERM", () => {})`), gọi `killProcessGroup(pgid, { graceMs: 250 })`, kiểm chứng group bị leo thang `SIGKILL` và chết sạch (`process.kill(-pgid, 0)` ném `ESRCH`).
       - Kiểm chứng `killProcessGroup` với `pgid` của child ĐÃ thoát (reap) không ném lỗi và không bắn tín hiệu lung tung (guard `pgid > 1` + child alive được kiểm ở phía caller).
       - Kiểm chứng `spawnAsync` áp timeout (`timeoutMs: 200`) tự động giết sạch cả process group con và reject với lỗi timeout.
- **Success criteria:** `package.json` có `test:design-compare` và chạy thử `pnpm test:design-compare` báo lỗi thiếu `harness-lib.mjs` đúng chuẩn TDD Red.
- **Verify:** `pnpm test:design-compare` thoát mã khác `0` và in chuỗi `ERR_MODULE_NOT_FOUND` (nếu lệnh thoát `0` ở bước Red là sai).

### Task 1.2 — Hiện thực `scripts/design-compare/harness-lib.mjs` để đưa toàn bộ unit test sang Green
- **Goal:** Hiện thực đầy đủ các hàm trong `scripts/design-compare/harness-lib.mjs` không thêm dependency mới, thoả mãn toàn bộ test của Task 1.1.
- **Target files and symbols:**
  - `scripts/design-compare/harness-lib.mjs` (`parseCliArgs`, `buildChildEnv`, `redactLog`, `createLogCollector`, `isPortFreeOnLoopback`, `probeFreePort`, `DESIGN_V2_PINNED_SHA`, `isDesignV2Fingerprint`, `verifyDesignV2Server`, `loadPngJs`, `inspectPngBuffer`, `assertNonBlankPngFile`, `shouldCompose`, `ensurePrivateDir`, `killProcessGroup`, `killProcessGroupSync`, `spawnAsync`)
- **Steps:**
  1. Tạo `scripts/design-compare/harness-lib.mjs` với các hằng số và hàm sau:
     - `DESIGN_V2_PINNED_SHA = "7a53fc0fcbf415367d245539cedc3855606266a7"` (ghi rõ comment: khi nâng SHA trong `fetch-design.sh` phải kiểm tra lại đường dẫn chữ ký `/src/lib/art.tsx` + `TeacherDesk`).
     - `parseCliArgs(argv)`: đọc `--screens` (mặc định `"all"`), `--side` (`"design" | "app" | "both"`, mặc định `"both"`), `--label` (mặc định `"new"`, chỉ nhận `/^[a-z0-9_-]{1,32}$/`), `--keep-design` (boolean), `--force` (boolean). Ném lỗi khi: `--side` ngoài tập cho phép; token bắt đầu bằng `--` không thuộc danh sách cờ; cờ cần giá trị nhưng token kế tiếp bắt đầu bằng `--` hoặc hết argv; `--label` vi phạm regex.
     - `buildChildEnv(baseEnv, { apiPort, webPort, studentPort, extraEnv })`: trả object env gồm `...baseEnv`, `E2E_API_PORT: String(apiPort)`, `E2E_WEB_PORT: String(webPort)`, `E2E_STUDENT_PORT: String(studentPort)`, `VITE_SERVER_URL: \`http://localhost:${apiPort}\``, `VITE_TEACHER_SIGNUP_ENABLED: "true"`, `...extraEnv`.
     - `redactLog` và `createLogCollector(maxBytes = 4000)`: giữ nguyên cơ chế `rawTail` 100 ký tự + redact 2 lượt từ `capture.mjs:108-145`, mở rộng tập biểu thức redact (áp 2 lượt cho toàn bộ tập): `/([?&]token=)[^\s&"']+/gi`, `/(\/api\/auth\/reset-password\/)[^?\s"'&]+/gi` (giữ prefix, che token), `/(\/pay\/)[A-Za-z0-9_-]{6,}/gi` (giữ prefix, che token), `/(x-access-token:|Bearer\s+)[^\s@"']+/gi`, `/\b(gh[pousr]_[A-Za-z0-9_]{10,}|github_pat_[A-Za-z0-9_]{10,})\b/g`.
     - `isPortFreeOnLoopback(port)` & `probeFreePort({ excludePorts = new Set() } = {})`:
       - Mở `net.createServer()` nghe trên `(0, "127.0.0.1")` để lấy `port`; trong khi vẫn giữ socket IPv4 mở, thử mở thêm `net.createServer()` trên `(port, "::1")`. Nếu `::1` thành công thì đóng cả hai và trả `port`; nếu `::1` lỗi `EADDRNOTAVAIL` hoặc `EAFNOSUPPORT` (máy tắt IPv6) thì đóng socket IPv4 và trả `port`; nếu `::1` lỗi `EADDRINUSE` thì đóng socket IPv4 và thử lại (tối đa 10 lần); nếu port trùng `excludePorts` hoặc slot đã cấp cho phiên này thì tiếp tục thử. Nếu hết 10 lần không được, ném lỗi rõ ràng.
     - `isDesignV2Fingerprint({ rootHtml, artModuleSource })`: trả `true` khi `rootHtml` chứa `<div id="root"></div>` và `artModuleSource` chứa `TeacherDesk`.
     - `verifyDesignV2Server(baseUrl, { timeoutMs = 3_000, maxBytes = 256 * 1024 } = {})`: `fetch` song song `${baseUrl}/` và `${baseUrl}/src/lib/art.tsx` với `AbortSignal.timeout(timeoutMs)` và `redirect: "error"` (chặn SSRF qua 302); đọc body có trần `maxBytes` — nếu `Content-Length` vượt trần hoặc khi đọc stream vượt trần thì abort và trả `{ ok: false, reason: "body quá lớn" }`; nếu cả hai `res.ok` và `isDesignV2Fingerprint` trả `true` thì trả `{ ok: true }`, ngược lại trả `{ ok: false, reason }`.
     - `loadPngJs(rootDir)`: ưu tiên nạp `PNG` từ chuỗi phụ thuộc đã có của harness: `createRequire(path.join(rootDir, "apps/e2e/package.json")).resolve("@playwright/test")` → `createRequire(pwCoreEntry)("playwright-core/lib/utilsBundle")` → lấy `PNG`; nếu nhánh ưu tiên lỗi thì fallback `createRequire(path.join(rootDir, "package.json")).resolve("e2e")` → `createRequire(e2eEntry)("pngjs")`. Nếu cả hai lỗi thì ném message rõ `"Không nạp được pngjs (thử playwright-core/lib/utilsBundle rồi root e2e)"`.
     - `inspectPngBuffer(buf, PNG, { minNonWhiteRatio = 0.001, minNonDominantRatio = 0.005 } = {})`: giải mã bằng `PNG.sync.read(buf)`; với mỗi pixel `(r, g, b, a)`, tính kênh quy chiếu nền trắng `alpha = a / 255`, `er = Math.round(r * alpha + 255 * (1 - alpha))`, tương tự `eg`, `eb`; đếm `nonWhite` khi `er < 250 || eg < 250 || eb < 250`. Đếm màu chủ đạo bằng histogram bucket 5-bit/kênh (`r >> 3`, `g >> 3`, `b >> 3`, `a >> 3` gộp thành key); `nonDominant = total - maxBucketCount`. Ảnh hợp lệ (`ok: true`) khi `total > 0 && nonWhiteRatio >= minNonWhiteRatio && nonDominantRatio >= minNonDominantRatio`.
     - `assertNonBlankPngFile(filePath, PNG, opts)`: đọc file, chạy `inspectPngBuffer`; nếu lỗi giải mã hoặc `!res.ok` thì gọi `await rm(filePath, { force: true })` trước khi `throw new Error(...)` ghi rõ tỷ lệ `nonWhite`/`nonDominant`.
     - `shouldCompose(outFile, inputFiles, { force = false } = {})`: lọc các `inputFiles` đang tồn tại (`statSync` thành công); nếu không có file đầu vào nào tồn tại trả `false`; nếu `force === true` trả `true`; nếu `outFile` chưa tồn tại trả `true`; ngược lại trả `maxInputMtimeMs > outStat.mtimeMs`.
     - `ensurePrivateDir(dir)`: `mkdir(dir, { recursive: true, mode: 0o700 })`, sau đó `chmodSync(dir, 0o700)` để ép lại mode ngay cả khi thư mục đã tồn tại từ lần chạy cũ.
     - `killProcessGroup(pgid, { graceMs = 3_000, pollMs = 100 } = {})`: chỉ tác động khi `Number.isInteger(pgid) && pgid > 1`; trên POSIX gửi `process.kill(-pgid, "SIGTERM")`, lặp kiểm tra `process.kill(-pgid, 0)` mỗi `pollMs` tới `graceMs`; nếu vẫn chưa ném `ESRCH` thì gửi `process.kill(-pgid, "SIGKILL")`. Kèm `killProcessGroupSync(pgid)` gửi `SIGKILL` cho `-pgid` dùng trong handler đồng bộ `'exit'` (caller chịu trách nhiệm chỉ truyền pgid của child còn sống).
     - `spawnAsync(cmd, args, { cwd, env, timeoutMs = 0, onChild, onCleanup } = {})`: spawn trực tiếp `spawn(cmd, args, { cwd, env, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] })` (tuyệt đối KHÔNG `shell: true`), thu gom stdout/stderr qua `createLogCollector()`, cài timer nếu `timeoutMs > 0` để gọi `killProcessGroup(child.pid, { graceMs: 1_000 })` rồi reject lỗi timeout có đính kèm tail log đã redact.
- **Success criteria:** Toàn bộ unit test trong `scripts/design-compare.test.mjs` chạy xanh và `biome check` không báo lỗi trên các file mới/sửa.
- **Verify:** `pnpm test:design-compare && pnpm exec biome check package.json scripts/design-compare/harness-lib.mjs scripts/design-compare.test.mjs` thoát mã `0` và in `# fail 0`.

## Todo
- [x] Task 1.1: Đăng ký `test:design-compare` trong `package.json` và viết bộ test TDD Red `scripts/design-compare.test.mjs`
- [x] Task 1.2: Hiện thực `scripts/design-compare/harness-lib.mjs` đạt TDD Green + `biome check`

## Verification
- `pnpm test:design-compare` thoát mã `0` (`# fail 0`).
- `pnpm exec biome check package.json scripts/design-compare/harness-lib.mjs scripts/design-compare.test.mjs` thoát mã `0`.

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
