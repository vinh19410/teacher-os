---
title: "#546: Harden design-compare harness for shared multi-agent hosts"
description: "Sửa 5 điểm gãy của harness design:compare trên máy nhiều session song song: thiếu VITE_TEACHER_SIGNUP_ENABLED, tin nhầm listener lạ, skip compose khi ảnh stale, bỏ lọt PNG trắng/rỗng, và sót tiến trình mồ côi khi fail/timeout."
status: pending
priority: P1
effort: 3h
issue: 546
branch: fix/546-design-compare-shared-host-hardening
tags: [bugfix, infra, test]
blockedBy: []
blocks: []
created: 2026-11-03
---

# #546: Harden design-compare harness for shared multi-agent hosts

## Overview

Sửa toàn diện 5 nguyên nhân khiến `pnpm run design:compare` thất bại hoặc trả kết quả sai im lặng trên máy có nhiều phiên agent chạy song song: bổ sung cờ `VITE_TEACHER_SIGNUP_ENABLED=true`, xác thực chữ ký nội dung `teacheros-design-v2` và bind loopback `127.0.0.1`, ghi đè ảnh compose khi raw mới hơn hoặc có `--force`, kiểm tra pixel RGBA bằng `pngjs` sau mỗi lần chụp (xoá ngay ảnh trắng/rỗng trước khi báo lỗi), và dọn sạch toàn bộ process group con không chặn event loop. Kế hoạch được viết theo hợp đồng bàn giao `--advice` + `--tdd` để mọi executor đều kiểm chứng cơ học được từng bước.

## Root Cause Summary (`ak-debug` verified)

1. **Thiếu `VITE_TEACHER_SIGNUP_ENABLED` (`scripts/design-compare/capture.mjs:118-125, 250`):** PR #539 ẩn form đăng ký giáo viên (`#su-name`) khi thiếu `VITE_TEACHER_SIGNUP_ENABLED=true`. `apps/e2e/playwright.config.ts:76` và `apps/e2e/devserver-watchdog.mjs:147` đều đặt biến này, riêng `capture.mjs` bỏ sót khiến `warm("${WEB}/login", "#su-name")` treo hết 120s.
2. **Tin nhầm listener lạ + hở port TOCTOU + lộ `0.0.0.0` (`scripts/design-compare/fetch-design.sh:28-39`, `scripts/design-compare/capture.mjs:38-52, 299`):** `freePort()` chỉ dò IPv4 `127.0.0.1` và cấp `DESIGN_PORT` từ đầu script (60–120s trước khi chạy `fetch-design.sh`); `fetch-design.sh` chỉ chạy `curl -sf http://localhost:$PORT` nên gặp bất kỳ HTTP 200 nào của phiên khác cũng báo `"already on :$PORT"` và thoát `0`. Ngoài ra `teacheros-design-v2` mặc định bind `0.0.0.0` khi không truyền `FIGMA_DEV_SERVER_HOST=127.0.0.1`.
3. **Bỏ qua compose khi ảnh tham chiếu đã có trong git (`scripts/design-compare/capture.mjs:655-656`):** `if (existsSync(outFile)) continue;` khiến mọi lần chạy trên worktree mới đều bỏ qua bước ghép vì `plans/261020-1446-378-redesign-design-v2/screenshots/<id>/<vp>-<theme>.png` đã được commit sẵn, và thiếu cờ `--force` để ép chụp lại raw + ghép lại.
4. **Không kiểm tra pixel ảnh trắng/rỗng (`scripts/design-compare/capture.mjs:373-375`):** `shoot()` không giải mã PNG để đo tỷ lệ pixel khác trắng / khác màu nền đồng nhất; ảnh trắng 100% vẫn được lưu vào `.state/raw/` và tính là `0 lỗi`. Lưu ý pnpm strict isolation: `pngjs` nằm ngoài `apps/e2e/package.json`; để không chạm lockfile, nạp `PNG` ưu tiên qua chuỗi phụ thuộc mà `capture.mjs` đã sở hữu (`apps/e2e/package.json` → `@playwright/test` → `playwright-core/lib/utilsBundle`), fallback qua `rootRequire.resolve("e2e")` (root `package.json:41` đã khai báo `e2e@0.18.0` kéo `pngjs@7.0.0` — verified tại `pnpm-lock.yaml:10423-10436`).
5. **Sót tiến trình con sau fail/timeout (`scripts/design-compare/capture.mjs:110-129, 171-196, 184, 266, 299`, `scripts/design-compare/fetch-design.sh:32, 45-53`):** **Ba** lời gọi `spawnSync` (`cleanup()` chạy `fetch-design.sh stop` ở `:184`, `design-seed.ts` 420s ở `:266`, `fetch-design.sh run` 300s ở `:299`) chặn cứng event loop khiến `SIGTERM` không chạy được handler trước khi bị leo thang `SIGKILL`; `cleanup()` chỉ bắn một `SIGTERM` rồi thoát ngay không leo thang `SIGKILL` và dùng `shell: true`; `fetch-design.sh` dùng `nohup ... &` chung PGID + `pkill -P` bỏ sót tiến trình cháu `vite` và dùng chung một file `.pid` không xác minh danh tính tiến trình (nguy cơ `SIGKILL` nhầm PGID đã bị tái chế của phiên agent khác).

## Scope & Non-Goals (Kongming Advisor Lock)

- **In Scope:**
  - Tách các hàm thuần/hệ thống có thể kiểm thử độc lập sang `scripts/design-compare/harness-lib.mjs` và phủ bộ unit/integration test `scripts/design-compare.test.mjs` gắn vào `pnpm test` (`package.json`).
  - Cứng hoá `scripts/design-compare/fetch-design.sh` (kiểm tra `PORT`, bind `127.0.0.1`, xác thực chữ ký `TeacherDesk` của SHA ghim `7a53fc0fcbf415367d245539cedc3855606266a7`, chạy `vite` trong process group riêng bằng Node `detached: true` tương thích Linux/macOS, `.pid-$PORT` + `.dev-$PORT.log`, dừng nhóm bằng `SIGTERM` → `SIGKILL`).
  - Cập nhật `scripts/design-compare/capture.mjs` (thêm `VITE_TEACHER_SIGNUP_ENABLED: "true"`, giữ nguyên `http://localhost:...` cho `API`/`WEB`/`STUDENT` theo allowlist CORS/cookie tại `apps/e2e/src/boot.ts:34-40` nhưng dùng `http://127.0.0.1:...` cho `DESIGN`, cấp `DESIGN_PORT` sát lúc boot kèm retry 3 lần chỉ khi `fetch-design.sh` trả exit `3` (port bận), thêm `--force` + so sánh `mtimeMs` khi compose, kiểm tra pixel RGBA và xoá file lỗi trong `shoot()`, bỏ `shell: true` + toàn bộ 3 `spawnSync`, thêm `shutdown` bất đồng bộ leo thang `SIGTERM` → `SIGKILL` + backstop `'exit'` có xác minh danh tính tiến trình design-v2).
  - **Chống tái sử dụng server design của phiên khác (red-team Finding 1):** `capture.mjs` gọi `fetch-design.sh run` với `DESIGN_NO_REUSE=1` — mọi listener có sẵn trên `DESIGN_PORT` (kể cả design-v2 của phiên khác) đều bị coi là port bận (exit `3`) để vòng retry đổi cổng mới; chỉ phiên tự spawn (có `.pid-$PORT` do mình ghi) mới được dừng qua `stop`, và `stop` luôn xác minh danh tính tiến trình (cmdline chứa `vite` + `--port $PORT`) trước khi gửi tín hiệu, tránh `SIGKILL` nhầm PGID đã bị kernel tái chế.
  - **Siết đầu vào + chống lộ token (red-team Findings 4, 6):** `parseCliArgs` chỉ nhận `--label` khớp `/^[a-z0-9_-]{1,32}$/`, ném lỗi với cờ lạ và cờ thiếu giá trị; `redactLog` mở rộng che thêm `/api/auth/reset-password/<token>`, `/pay/<payToken>`, `x-access-token:…`, `ghp_…`/`github_pat_…`, đồng thời bọc `dbg.url()`/`errors.log`; thư mục `.state` tạo với mode `0o700`, `storageState` json chmod `0o600`.
  - **Làm chủ tín hiệu (red-team Finding 3):** `chromium.launch({ handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false })`, bọc toàn bộ pipeline trong `main().catch(shutdown)`, nối thêm `uncaughtException`/`unhandledRejection` vào `shutdown(1)`; `waitUrl` nhận `child` và fail ngay khi child chết; `startChildWatchdog` bật ngay sau khi boot từng service (trước `warm()` + seed); web/student Vite spawn thêm `--host 127.0.0.1`; sau khi `api` lên sẽ fail-loud nếu phát hiện listener `[::1]:API_PORT` (Happy-Eyeballs hijack).
- **Explicit Non-Goals:**
  - Không nâng SHA của repo `teacheros-design-v2` và không sửa `screens.json`.
  - Không đổi sang `127.0.0.1` cho `API`/`WEB`/`STUDENT` (phá CORS/cookie `localhost` ở `apps/e2e/src/boot.ts:34-40`).
  - Không sửa `apps/web/src`, `apps/student`, `apps/server`, hay thêm dependency mới vào `pnpm-lock.yaml`.
  - Không cài tiến trình pipe-EOF reaper riêng cho kịch bản `SIGKILL` trực tiếp vào chính `capture.mjs` ở vòng này (theo khuyến nghị Kongming: tránh tạo bề mặt rò rỉ tiến trình mới).
  - Không khoá socket chắn trên `[::1]:API_PORT` suốt phiên — chỉ kiểm tra fail-loud một lần sau boot (đủ chặn hijack seed mà không giữ tài nguyên vô ích).
  - Không dựng cơ chế image-diff/hash cho compose (mtimeMs + `--force` là đủ, quyết định Kongming).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Đảm bảo `web` vite child nhận `VITE_TEACHER_SIGNUP_ENABLED=true` để `warm()` và `design-seed.ts` thấy `#su-name` | P1 |
| 2 | Chặn hoàn toàn việc dùng nhầm listener lạ trên `DESIGN_PORT` và cô lập `design-v2` trên `127.0.0.1` | P1 |
| 3 | Tái tạo ảnh compose khi file chưa có, raw mới hơn output (`mtimeMs`), hoặc truyền `--force` | P1 |
| 4 | Phát hiện ảnh PNG trắng hoặc đồng màu rỗng bằng `pngjs`, xoá ảnh hỏng khỏi `.state/raw/` và báo lỗi rõ | P1 |
| 5 | Loại bỏ `shell: true` + `spawnSync`, dọn sạch mọi process group con (`SIGTERM` → `SIGKILL`) khi kết thúc hoặc lỗi | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Harness Library & TDD Suite](./phase-01-harness-lib-and-tests.md) | Pending |
| 2 | [Phase 2: Fetch-Design & Capture Integration + Smoke Verification](./phase-02-fetch-design-and-capture-integration.md) | Pending |

## Validation Log

### Verification Results (Fact Checker — Light tier, 2 reviewers)
- Claims checked: 27 | Verified: 22 | Failed: 3 | Unverified: 2
- Tier: Light (2 phases, ≥5 claims/phase mỗi reviewer)
- Failures → resolved:
  1. [AssumptionDestroyer 1.6] "rootRequire.resolve(\"e2e\") → pngjs" còn đúng nhưng mỏng (phụ thuộc transitive của `e2e@0.18.0`) → đổi sang ưu tiên `playwright-core/lib/utilsBundle` qua `@playwright/test`, giữ `e2e` làm fallback (plan.md root-cause #4 + phase-01 Task 1.2).
  2. [AssumptionDestroyer 2.1] Giả lập `.cache/design-v2/.git` + `node_modules` không bypass được `git checkout -q` chạy vô điều kiện → chuyển sang kiểm tra port/chữ ký TRƯỚC mọi thao tác git (phase-02 Task 2.1/2.2).
  3. [SecurityAdversary P2-2] Plan gốc bỏ sót `spawnSync` thứ 3 tại `capture.mjs:184` (cleanup) → đã sửa root-cause #5 và Task 2.3 bước 4/5.
- Unverified: repo private `teacheros-design-v2` không nằm trong worktree (đối chiếu bằng clone thực tế cùng SHA trên host: `index.html:11`, `src/lib/art.tsx:4` khớp chữ ký).

## Red Team Review

### Session — 2026-11-03
**Reviewers:** Security Adversary (code-reviewer) + Assumption Destroyer (code-reviewer), mỗi reviewer kèm vai trò Fact Checker.
**Findings:** 15 distinct (6 Critical, 5 High, 4 Medium) — 15 accepted, 0 rejected.
**Severity breakdown:** 6 Critical, 5 High, 4 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `git checkout` vô điều kiện trong `fetch-design.sh` phá test TDD + CI + SLA `<5s` port-hijack | Critical | Accept | phase-02 Task 2.1/2.2 (port check trước git; skip fetch khi HEAD == SHA) |
| 2 | `compose` ghi đè ảnh git khi chụp một phía lỗi; raw stale dính vào `--force`; `--label` tự do | Critical | Accept | phase-02 Task 2.3 bước 7 (`failedShots` key chính xác, raw bắt buộc, rm raw khi force); phase-01 `parseCliArgs` giới hạn `--label` |
| 3 | `shutdown()` đua signal handler Playwright, `browser.close()` chặn trước khi kill PGID, rò rỉ design-v2 khi throw | Critical | Accept | phase-02 Task 2.3 bước 5 (`handleSIG*: false`, `main().catch`, uncaught/unhandled, Promise.allSettled) |
| 4 | Stale `.pid-$PORT` + PGID tái chế → `SIGKILL` nhầm process group phiên khác; reuse chéo phiên rồi bắn `stop` | Critical | Accept | phase-02 Task 2.2 (xác minh danh tính `vite` + `--port`), Task 2.3 (DESIGN_NO_REUSE=1, chỉ kill child alive) |
| 5 | TOCTOU + tin nhầm listener lạ trên API/WEB/STUDENT; `waitUrl` không kiểm child; watchdog bật quá muộn; web/student lộ `0.0.0.0`; `[::1]:API_PORT` hijack | Critical | Accept | phase-02 Task 2.3 bước 3 (waitUrl child-aware, watchdog sớm, `--host 127.0.0.1`, kiểm tra `[::1]` fail-loud) |
| 6 | `set -euo pipefail` + `curl \| grep -q` dính SIGPIPE → `is_design_v2` false-negative | High | Accept | phase-02 Task 2.2 bước 3 (bọc output vào biến trước khi grep) |
| 7 | `inspectPngBuffer` (0,0) + 0.1% lọt ảnh trắng viền/badge devtools | High | Accept | phase-01 Task 1.2 (histogram bucket `>>3`, ngưỡng màu chủ đạo 0.5%) + test (e),(f) |
| 8 | Watchdog tắt suốt boot/warm/420s seed; `waitUrl` treo 150s khi child chết | High | Accept | phase-02 Task 2.3 bước 3 (watchdog ngay sau boot từng service) |
| 9 | Bỏ sót `spawnSync` thứ 3 (`cleanup()` `:184`) + không bắt uncaughtException/unhandledRejection → rò rỉ design-v2 | High | Accept | plan.md root-cause #5; phase-02 Task 2.3 bước 4–5 |
| 10 | Path traversal qua `--label` kết hợp `rm` trong `assertNonBlankPngFile` | High | Accept | phase-01 Task 1.2 (`parseCliArgs` regex `^[a-z0-9_-]{1,32}$`, cờ lạ/missing value throw) |
| 11 | JS injection vào `node -e`; `DIR` phụ thuộc cwd; `curl` đi qua `HTTP_PROXY` | High | Accept | phase-02 Task 2.2 bước 1/4/7 (argv qua `--`, `DESIGN_CACHE_DIR` + `ROOT_DIR`, `--noproxy '*'`, `FIGMA_PUBLIC_URL: ""`) |
| 12 | Lọt `payToken`, reset-password token, GitHub PAT; storageState mode `0644` | High | Accept | phase-01 `redactLog` mở rộng; phase-02 Task 2.3 bước 6 (mode `0o700`/`0o600`) |
| 13 | `loadPngJs` ghim vào transitive dep của `e2e@0.18.0` | Medium | Accept (modified) | phase-01 Task 1.2 (ưu tiên `playwright-core/lib/utilsBundle`, fallback `e2e`) |
| 14 | Task 2.4 thiếu bước SIGTERM; `pgrep -af` tự khớp shell/daemon | Medium | Accept | phase-02 Task 2.4 bước 3/5 (smoke SIGTERM, pattern `[t]eacher-os-…` scoped binary) |
| 15 | `verifyDesignV2Server` không `redirect: "error"`, không trần body (SSRF/OOM); `compose()` shadow `browser` | Medium | Accept | phase-01 Task 1.2 (redirect + 256KiB cap); phase-02 Task 2.3 bước 7 (`compose(browser, …)` + `ctx.close()`) |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-harness-lib-and-tests.md`, `phase-02-fetch-design-and-capture-integration.md`.
- Decision deltas checked: 15 (toàn bộ accepted findings đã áp vào phase tương ứng).
- Reconciled stale references: 4 (số `spawnSync` 2→3; nguồn `pngjs` root-e2e → playwright-core ưu tiên; trình tự `fetch-design.sh run` port-first; Task 2.4 bổ sung smoke SIGTERM + pgrep bracket).
- Unresolved contradictions: 0.

### Post-plan-gates Kongming counsel — 2026-11-03
- **GO** cho `ak-fix --auto --advice` rồi `ak-ship beta --advice`.
- Rủi ro cao nhất: rewrite lifecycle `capture.mjs` (Task 2.3) — yêu cầu shutdown idempotent một promise, không async trong `'exit'`, smoke SIGTERM chạy trước khi tuyên bố xong, deadline cứng ~5s cho shutdown. Đã áp vào Task 2.3 bước 5.
- Tinh chỉnh đã áp: (1) `[::1]:API_PORT` rút gọn thành 1 probe trước/sau boot, bỏ nếu >20 dòng; (2) `DESIGN_NO_REUSE`/exit-3 giữ ở mức tối thiểu — gộp test port bận còn 1 ca (nội dung lạ + chữ ký đúng) + 1 ca stale-pid; (3) `redactLog` mở rộng giữ nguyên, test table-driven; (4) `ensurePrivateDir` chmod cả thư mục đã tồn tại, không walk đệ quy.

## Success Criteria

- [ ] `pnpm test:design-compare` pass toàn bộ các bài kiểm thử đơn vị và tích hợp cho cả 5 cơ chế bảo vệ.
- [ ] Khi một HTTP server lạ chiếm `DESIGN_PORT`, `fetch-design.sh run` thất bại trong `<5s` với thông báo lỗi tường minh (exit `3`, không bao giờ in `"already on :$PORT"`), và chạy được mà không cần `gh`/network (kiểm tra port trước mọi thao tác git/clone).
- [ ] Với `DESIGN_NO_REUSE=1`, mọi listener có sẵn trên `DESIGN_PORT` (kể cả design-v2 của phiên khác) đều trả exit `3`; không phiên nào dùng ké rồi bắn `stop` chéo server của phiên khác; `fetch-design.sh stop` xác minh danh tính `vite` + `--port` trước khi gửi tín hiệu.
- [ ] `buildChildEnv` luôn cấp `VITE_TEACHER_SIGNUP_ENABLED="true"` cho child server của harness.
- [ ] `shouldCompose` trả `true` khi thiếu `outFile`, khi bất kỳ file raw đầu vào có `mtimeMs > outFile.mtimeMs`, hoặc khi bật `--force`; cờ `--force` đồng thời bỏ qua cache raw (xoá rawFile cũ trước khi chụp lại) và cell thiếu raw bắt buộc bị ghi vào `failures` thay vì ghép cột thiếu.
- [ ] `assertNonBlankPngFile` từ chối ảnh PNG 100% trắng, ảnh trong suốt `rgba(0,0,0,0)`, ảnh đồng màu nền tối, ảnh trắng chỉ có viền/badge góc nhỏ (< 0.5% pixel khác màu chủ đạo), đồng thời xoá file PNG hỏng trước khi ném lỗi.
- [ ] `redactLog` che được cả `/api/auth/reset-password/<token>`, `/pay/<payToken>` và token GitHub; thư mục `.state` mode `0o700`, file `storageState` mode `0o600`.
- [ ] Sau khi chạy smoke `capture.mjs` (cả đường thành công lẫn đường bị ngắt `SIGTERM`), không còn tiến trình con (`boot.ts`, `vite`, `design-v2`) mồ côi và không có listener `design-v2` nào bind `0.0.0.0`.
- [ ] Toàn bộ cổng chất lượng local (`pnpm exec biome check .`, `pnpm check-types`, `pnpm test`) đều xanh.

<!-- slug: 546-design-compare-shared-host-hardening -->
