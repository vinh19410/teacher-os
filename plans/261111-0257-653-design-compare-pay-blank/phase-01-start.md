---
phase: 1
title: "Phase 1: TDD Red→Green Alignment of Pay Design Route"
status: completed
priority: P1
effort: "25m"
dependencies: []
---

# Phase 1: TDD Red→Green Alignment of Pay Design Route

<!-- Updated: Red Team Session 1 - Isolated worktree .cache/design-v2, resilient TDD Red regex, two-way Task 1.2 Verify -->

## Goal

Chứng minh cơ học trạng thái lỗi hiện tại (TDD Red) trên màn `pay` phía design bằng cache `.cache/design-v2` cô lập ngay trong worktree, sau đó cập nhật `scripts/design-compare/screens.json` cùng tài liệu bảng ánh xạ gốc sang hóa đơn còn dư nợ `#/pay/zz3Kpr` (`TOS9B4C7`) và xác minh toàn bộ 6 tổ hợp `pay` lẫn toàn bộ 214 ảnh design-side vượt qua kiểm tra pixel (TDD Green) mà không chạm vào `harness-lib.mjs`.

## Files to Create / Modify

- Modify: `scripts/design-compare/screens.json`
- Modify: `plans/261020-1446-378-redesign-design-v2/phase-01-visual-harness-baseline.md`

## Handover Note

Plan này được viết theo hợp đồng bàn giao `--advice` + `--tdd` cho executor. Executor chỉ đọc `plan.md` và các file `phase-NN-*.md`, thực thi tuần tự từng Task, đối chiếu kết quả lệnh `Verify` bằng phép so sánh cơ học và tuân thủ tuyệt đối khối `Failure Protocol` ở cuối file nếu bất kỳ `Verify` nào không khớp điều kiện đạt. Không truyền `DESIGN_CACHE_DIR` sang thư mục ngoài worktree; không đăng raw token, cookie, đường dẫn máy cục bộ hay nguyên văn mã nguồn `teacheros-design-v2` lên GitHub công khai.

## Tasks & Steps

### Task 1.1 — Cô lập `.cache/design-v2` của worktree và tái hiện lỗi màn `pay` phía design (TDD Red)

- **Goal:** Đảm bảo `.cache/design-v2` nằm cô lập bên trong worktree ở đúng SHA ghim `7a53fc0fcbf415367d245539cedc3855606266a7` (mode `0700`), rồi chứng minh cấu hình `#/pay/p7Hq2x` hiện tại thất bại deterministic ở `desktop-light` và `tablet-light` với `nonDominant < 1.0%`.
- **Target files and symbols:**
  - `.cache/design-v2` (gitignored trong worktree, SHA `7a53fc0fcbf415367d245539cedc3855606266a7`)
  - `scripts/design-compare/screens.json` (entry `screens[2]` với `"id": "pay"`, trường `design.hash`)
  - `scripts/design-compare/capture.mjs` (nhánh `--side design --force`)
- **Steps:**
  1. Đứng ở thư mục gốc worktree: kiểm tra `.cache/design-v2/.git` đã tồn tại trong worktree và `git -C .cache/design-v2 rev-parse HEAD` khớp `7a53fc0fcbf415367d245539cedc3855606266a7` với quyền `0700` (nếu chưa có, cho phép `fetch-design.sh` tự clone hoặc copy một lần từ cache sẵn có vào `.cache/design-v2` của worktree kèm `chmod 700 .cache/design-v2`). Tuyệt đối **không** đặt biến môi trường `DESIGN_CACHE_DIR`.
  2. Kiểm tra `scripts/design-compare/screens.json:39` vẫn đang giữ `"hash": "#/pay/p7Hq2x"`.
  3. Chạy lệnh chụp riêng màn `pay` phía design với `--force` và lưu output tạm vào `scripts/design-compare/.state/red-repro.log` (sau khi `mkdir -p -m 700 scripts/design-compare/.state`) để `Verify` đối chiếu cơ học mà không phải chạy 2 lần.
- **Success criteria:** Lệnh chụp thoát mã khác `0` (`exit code 1`) và log ghi nhận đúng `xong: 4 ảnh, 2 lỗi` với cả `design pay/desktop-light` lẫn `design pay/tablet-light` bị từ chối do `nonDominant=0.` (`< 1.0%`).
- **Verify:** `test "$(git -C .cache/design-v2 rev-parse HEAD)" = "7a53fc0fcbf415367d245539cedc3855606266a7" && mkdir -p -m 700 scripts/design-compare/.state && (pnpm design:compare --screens pay --side design --force > scripts/design-compare/.state/red-repro.log 2>&1 && exit 1 || true) && grep -Fq "xong: 4 ảnh, 2 lỗi" scripts/design-compare/.state/red-repro.log && grep -Eq "design pay/desktop-light:.*nonDominant=0\.[0-9]+%" scripts/design-compare/.state/red-repro.log && grep -Eq "design pay/tablet-light:.*nonDominant=0\.[0-9]+%" scripts/design-compare/.state/red-repro.log` thoát mã `0` (nếu `pnpm design:compare` ở bước Red thoát `0` thì subshell trả `exit 1` và dừng ngay theo Failure Protocol).

### Task 1.2 — Cập nhật `pay.design.hash` sang `#/pay/zz3Kpr` và đồng bộ bảng ánh xạ Phase 1

- **Goal:** Trỏ màn `pay` phía design sang hóa đơn thanh toán một phần `TOS9B4C7` (`#/pay/zz3Kpr`) khớp với `t-invoice` (`screens.json:225`) và `seed.payToken` (`design-seed.ts:447`), đồng thời cập nhật tài liệu bảng ánh xạ gốc.
- **Target files and symbols:**
  - `scripts/design-compare/screens.json` (dòng 39, object `screens` có `"id": "pay"`, khóa `design.hash`)
  - `plans/261020-1446-378-redesign-design-v2/phase-01-visual-harness-baseline.md` (dòng 37, hàng `| pay |` trong bảng `## Bảng ánh xạ màn`)
- **Steps:**
  1. Trong `scripts/design-compare/screens.json` tại dòng 39 (bên trong entry `"id": "pay"`), đổi `"hash": "#/pay/p7Hq2x"` thành `"hash": "#/pay/zz3Kpr"`. Giữ nguyên toàn bộ các dòng khác của `screens.json`.
  2. Trong `plans/261020-1446-378-redesign-design-v2/phase-01-visual-harness-baseline.md` tại dòng 37, đổi `| pay | \`#/pay/p7Hq2x\` | web \`/pay/$token\` (seed) | 5 |` thành `| pay | \`#/pay/zz3Kpr\` | web \`/pay/$token\` (seed) | 5 |`.
  3. Không chạm vào `scripts/design-compare/harness-lib.mjs`, `scripts/design-compare.test.mjs` (mẫu `p7Hq2xSecret` ở dòng 263, 270 là dữ liệu kiểm thử `redactLog`), hay plan lịch sử `#546`.
- **Success criteria:** `screens.json` hợp lệ cú pháp JSON với `pay.design.hash === "#/pay/zz3Kpr"`, `phase-01-visual-harness-baseline.md:37` chứa hàng `| pay | \`#/pay/zz3Kpr\` |`, và cả hai file không còn chuỗi `p7Hq2x`.
- **Verify:** `node -e 'const fs=require("node:fs"); const s=JSON.parse(fs.readFileSync("scripts/design-compare/screens.json","utf8")); const p=s.screens.find(x=>x.id==="pay"); if(p?.design?.hash!=="#/pay/zz3Kpr") process.exit(1); console.log("OK", p.design.hash);' && grep -Fq '| pay | \`#/pay/zz3Kpr\` | web \`/pay/$token\` (seed) | 5 |' plans/261020-1446-378-redesign-design-v2/phase-01-visual-harness-baseline.md && ! grep -Fq 'p7Hq2x' scripts/design-compare/screens.json plans/261020-1446-378-redesign-design-v2/phase-01-visual-harness-baseline.md` thoát mã `0` và in `OK #/pay/zz3Kpr`.

### Task 1.3 — Xác minh TDD Green trên màn `pay` và toàn bộ 214 ảnh phía design

- **Goal:** Chứng minh cấu hình `#/pay/zz3Kpr` giúp cả 6 tổ hợp `pay` lẫn toàn bộ 36 màn phía design vượt qua `assertNonBlankPngFile` với `0 lỗi` trên cache worktree cô lập mà không làm bẩn ảnh composite của các màn khác.
- **Target files and symbols:**
  - `scripts/design-compare/screens.json` (`id: "pay"`)
  - `scripts/design-compare/harness-lib.mjs` (`assertNonBlankPngFile`, `inspectPngBuffer` — giữ nguyên không sửa)
- **Steps:**
  1. Chạy `pnpm design:compare --screens pay --side design --force` (dùng `.cache/design-v2` mặc định của worktree) để kiểm tra riêng 6 tổ hợp màn `pay`.
  2. Chạy `pnpm design:compare --screens all --side design --force` để kiểm tra toàn bộ 214 ảnh design-side không còn bất kỳ tổ hợp trắng/rỗng nào.
  3. Chạy `pnpm test:design-compare` để xác nhận toàn bộ 23 bài kiểm thử đơn vị và tích hợp của harness vẫn xanh nguyên vẹn.
- **Success criteria:** Cả hai lệnh `design:compare` đều thoát `0` với `0 lỗi` (`6 ảnh, 0 lỗi` và `214 ảnh, 0 lỗi`), và `pnpm test:design-compare` in `# fail 0`.
- **Verify:** `pnpm design:compare --screens pay --side design --force && pnpm design:compare --screens all --side design --force && pnpm test:design-compare` thoát mã `0`, output chứa `xong: 6 ảnh, 0 lỗi`, `xong: 214 ảnh, 0 lỗi`, và `# fail 0`.

## Todo

- [x] Task 1.1: Cô lập `.cache/design-v2` của worktree và tái hiện lỗi màn `pay` phía design (TDD Red)
- [x] Task 1.2: Cập nhật `pay.design.hash` sang `#/pay/zz3Kpr` và đồng bộ bảng ánh xạ Phase 1
- [x] Task 1.3: Xác minh TDD Green trên màn `pay` và toàn bộ 214 ảnh phía design

## Verification

- `pnpm design:compare --screens pay --side design --force` thoát mã `0` (`xong: 6 ảnh, 0 lỗi`).
- `pnpm design:compare --screens all --side design --force` thoát mã `0` (`xong: 214 ảnh, 0 lỗi`).
- `pnpm test:design-compare` thoát mã `0` (`# fail 0`).

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
