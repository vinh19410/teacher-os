---
phase: 2
title: "Phase 2: Regenerate Pay Composites, Visual Audit & Quality Gates"
status: pending
priority: P1
effort: "35m"
dependencies: [1]
---

# Phase 2: Regenerate Pay Composites, Visual Audit & Quality Gates

<!-- Updated: Red Team Session 1 - Single 3-run capture before visual audit, full temp/token cleanup, strict allowlist diff & .pid-* orphan check -->

## Goal

Chụp và ghép lại đúng 6 ảnh composite `plans/261020-1446-378-redesign-design-v2/screenshots/pay/*.png` (cả phía design lẫn phía app) trên cache `.cache/design-v2` cô lập của worktree, kiểm chứng tính lặp lại qua 2 lượt `--force` liên tiếp + 1 lượt cache-hit, đối chiếu trực quan 3 viewport × 2 theme, cập nhật `verdict.md` + `CHANGELOG.md`, dọn sạch mọi artifact tạm chứa token/cookie, và vượt qua toàn bộ cổng chất lượng local.

## Files to Create / Modify

- Modify: `plans/261020-1446-378-redesign-design-v2/screenshots/pay/desktop-light.png`
- Modify: `plans/261020-1446-378-redesign-design-v2/screenshots/pay/desktop-dark.png`
- Modify: `plans/261020-1446-378-redesign-design-v2/screenshots/pay/tablet-light.png`
- Modify: `plans/261020-1446-378-redesign-design-v2/screenshots/pay/tablet-dark.png`
- Modify: `plans/261020-1446-378-redesign-design-v2/screenshots/pay/phone-light.png`
- Modify: `plans/261020-1446-378-redesign-design-v2/screenshots/pay/phone-dark.png`
- Modify: `plans/261020-1446-378-redesign-design-v2/screenshots/verdict.md`
- Modify: `CHANGELOG.md`

## Handover Note

Plan này được viết theo hợp đồng bàn giao `--advice` + `--tdd` cho executor. **Cảnh báo phạm vi & thứ tự quan trọng:**
1. Tuyệt đối chỉ truyền `--screens pay` khi chạy `--side both`; không chạy `--screens all --side both` vì raw mới sinh trên worktree sẽ làm `shouldCompose` ghi đè 210 file PNG của 35 màn không liên quan.
2. Không truyền `DESIGN_CACHE_DIR` sang thư mục ngoài worktree; không chạy `pnpm check:fix` toàn repo.
3. Sau khi duyệt trực quan 6 ảnh ở Task 2.2 và xoá `.state` ở Task 2.3, **tuyệt đối không chạy lại `design:compare`** để tránh ghi đè ảnh đã duyệt mắt hoặc tái sinh `.state` / `.mail-log.jsonl` / `local.db*`.
4. Repo `teacher-os` là public còn `teacheros-design-v2` là private: mọi nội dung đăng lên GitHub Issue/PR/POT phải redact token, cookie, đường dẫn tuyệt đối nội bộ và không trích nguyên văn mã nguồn `teacheros-design-v2`.

## Tasks & Steps

### Task 2.1 — Chụp ghép lại 6 ảnh composite màn `pay` và kiểm chứng 2 lượt `--force` + 1 lượt cache-hit

- **Goal:** Tái tạo đúng 6 ảnh `screenshots/pay/{desktop,tablet,phone}-{light,dark}.png` từ stack e2e thật + `.cache/design-v2` của worktree và chứng minh lệnh chạy ổn định qua đúng 3 lượt (2 lượt `--force` liên tiếp + 1 lượt không `--force` cache-hit) mà không phải chạy nhân đôi ở bước `Verify`.
- **Target files and symbols:**
  - `plans/261020-1446-378-redesign-design-v2/screenshots/pay/{desktop,tablet,phone}-{light,dark}.png`
  - `scripts/design-compare/capture.mjs`
- **Steps:**
  1. Xoá thư mục tạm `scripts/design-compare/.state` (từ Phase 1) rồi tạo lại `mkdir -p -m 700 scripts/design-compare/.state` để ghi log kiểm chứng nội bộ (mode `0600` nhờ `umask 077`).
  2. Chạy tuần tự 3 lượt và ghi log riêng từng lượt vào `scripts/design-compare/.state/run{1,2,3}.log`:
     - Lượt 1 (`--force`): `(umask 077 && pnpm design:compare --screens pay --side both --force > scripts/design-compare/.state/run1.log 2>&1)`
     - Lượt 2 (`--force` liên tiếp, khớp điều kiện 2 run liên tiếp của issue #653): `(umask 077 && pnpm design:compare --screens pay --side both --force > scripts/design-compare/.state/run2.log 2>&1)`
     - Lượt 3 (không `--force`, kiểm tra cache raw + `shouldCompose` không ghi đè lại): `(umask 077 && pnpm design:compare --screens pay --side both > scripts/design-compare/.state/run3.log 2>&1)`
- **Success criteria:** Cả 3 lượt đều thoát `0`: `run1.log` và `run2.log` đều chứa `xong: 18 ảnh, 0 lỗi`, `run3.log` chứa `xong: 0 ảnh, 0 lỗi`, và `git status --porcelain -- plans/261020-1446-378-redesign-design-v2/screenshots` chỉ chứa đúng 6 file PNG thuộc `screenshots/pay/` (không có màn khác, không có file untracked lạ).
- **Verify:** `grep -Fq "xong: 18 ảnh, 0 lỗi" scripts/design-compare/.state/run1.log && grep -Fq "xong: 18 ảnh, 0 lỗi" scripts/design-compare/.state/run2.log && grep -Fq "xong: 0 ảnh, 0 lỗi" scripts/design-compare/.state/run3.log && test "$(git status --porcelain -- plans/261020-1446-378-redesign-design-v2/screenshots | grep -v ' plans/261020-1446-378-redesign-design-v2/screenshots/pay/' | wc -l)" -eq 0 && test "$(git status --porcelain -- plans/261020-1446-378-redesign-design-v2/screenshots/pay | wc -l)" -eq 6` thoát mã `0`.

### Task 2.2 — Đối chiếu trực quan 6 ảnh `pay` và cập nhật `verdict.md` + `CHANGELOG.md`

- **Goal:** Kiểm tra bằng mắt toàn bộ 6 ảnh composite mới của màn `pay` (3 viewport × 2 theme) theo `REVIEW.md` / `AGENTS.md`, cập nhật ghi chú trung thực trong `verdict.md` và bổ sung mục `CHANGELOG.md`.
- **Target files and symbols:**
  - `plans/261020-1446-378-redesign-design-v2/screenshots/pay/{desktop,tablet,phone}-{light,dark}.png`
  - `plans/261020-1446-378-redesign-design-v2/screenshots/verdict.md` (dòng 19–24, thay thế tại chỗ 6 hàng `| pay |`)
  - `CHANGELOG.md` (thêm mục `## 2026-11-11` → `### CI/Infra` ngay trên `## 2026-11-10`)
- **Steps:**
  1. Mở và quan sát cả 6 file PNG trong `plans/261020-1446-378-redesign-design-v2/screenshots/pay/`: xác nhận cột `Design v2` hiển thị card `Tuition payment` của `TOS9B4C7` có mã QR, số tiền `3.500.000 ₫` và thông tin chuyển khoản Vietcombank; cột `App mới` hiển thị card `PayPage` v2 căn giữa của `invoicePartial` (banner chưa thiết lập nhận chuyển khoản do seed không gắn bank link); cả hai theme light/dark đúng token và `phone` (`375×812`) không tràn ngang. Chạy `sha256sum plans/261020-1446-378-redesign-design-v2/screenshots/pay/*.png > /tmp/pay-composites-653.sha256` để khoá cứng mã băm 6 file ảnh đã duyệt mắt.
  2. Trong `plans/261020-1446-378-redesign-design-v2/screenshots/verdict.md` (dòng 19–24), thay thế tại chỗ cột `Ghi chú` của đúng 6 dòng `| pay |` (không nối thêm dòng mới) từ ghi chú copy-paste `sidebar-07` cũ sang: `#653: Card PayPage v2 căn giữa (design #/pay/zz3Kpr TOS9B4C7 có dư nợ + QR; app invoicePartial chưa gắn bank link nên hiện banner chưa thiết lập chuyển khoản)`.
  3. Trong `CHANGELOG.md`, chèn mục ngày `## 2026-11-11` kèm nhóm `### CI/Infra` ngay trên `## 2026-11-10` ghi nhận: trỏ màn `pay` phía design trong `screens.json` từ `#/pay/p7Hq2x` (hóa đơn đã trả đủ làm card trắng <1% pixel trên desktop/tablet light) sang `#/pay/zz3Kpr` (`TOS9B4C7` còn dư nợ có QR, khớp `t-invoice` và `seed.payToken`) và cập nhật 6 ảnh đối chiếu `screenshots/pay/*.png` (#653).
- **Success criteria:** 6 ảnh composite đạt chuẩn thị giác ở cả 3 viewport × 2 theme; `verdict.md` có tổng cộng đúng 6 hàng `| pay |` đều mang ghi chú `#653` mới (0 hàng `pay` mang `sidebar-07`); `CHANGELOG.md` có mục `## 2026-11-11` / `### CI/Infra` chứa `(#653)`.
- **Verify:** `test -s /tmp/pay-composites-653.sha256 && sha256sum -c /tmp/pay-composites-653.sha256 && test "$(grep -Ec '^\| pay \| ' plans/261020-1446-378-redesign-design-v2/screenshots/verdict.md)" -eq 6 && test "$(grep -Ec '^\| pay \| (desktop|tablet|phone)×(light|dark) \| PASS \| #653: Card PayPage v2 căn giữa' plans/261020-1446-378-redesign-design-v2/screenshots/verdict.md)" -eq 6 && grep -Eq '^## 2026-11-11$' CHANGELOG.md && grep -Fq '(#653)' CHANGELOG.md` thoát mã `0`.

### Task 2.3 — Dọn sạch artifact nhạy cảm, kiểm tra allowlist Scope Lock, cổng chất lượng local và tiến trình mồ côi

- **Goal:** Xoá toàn bộ file tạm chứa cookie/token sinh ra khi chạy harness, xác minh chỉ các file trong allowlist của Kongming thay đổi, vượt qua `biome check`, `check-types`, toàn bộ `pnpm test`, và xác nhận 0 tiến trình con mồ côi.
- **Target files and symbols:**
  - Artifact tạm cần xoá: `scripts/design-compare/.state`, `apps/e2e/.mail-log.jsonl`, `apps/e2e/local.db`, `apps/e2e/local.db-wal`, `apps/e2e/local.db-shm`, `.cache/design-v2/.dev-*.log`
  - Allowlist thay đổi hợp lệ duy nhất: `scripts/design-compare/screens.json`, `plans/261020-1446-378-redesign-design-v2/phase-01-visual-harness-baseline.md`, `plans/261020-1446-378-redesign-design-v2/screenshots/verdict.md`, 6 file `plans/261020-1446-378-redesign-design-v2/screenshots/pay/{desktop,tablet,phone}-{light,dark}.png`, `CHANGELOG.md`, `plans/261111-0257-653-design-compare-pay-blank/**` (và `plans/journals/**` nếu sinh journal).
- **Steps:**
  1. Chạy `rm -rf scripts/design-compare/.state && rm -f apps/e2e/.mail-log.jsonl apps/e2e/local.db apps/e2e/local.db-wal apps/e2e/local.db-shm .cache/design-v2/.dev-*.log`. Tuyệt đối không chạy lại `pnpm design:compare` sau bước này.
  2. Kiểm tra format riêng `pnpm exec biome check --write scripts/design-compare/screens.json` (tuyệt đối không chạy `pnpm check:fix` toàn repo), rồi chạy cổng đọc-only `pnpm exec biome check .`, `pnpm check-types`, và `pnpm test`.
  3. Chạy kiểm tra allowlist Git (gộp cả `git diff --name-only $(git merge-base HEAD origin/develop)` và `git status --porcelain`) cùng kiểm tra tiến trình mồ côi (`pgrep` theo đường dẫn worktree + kiểm tra không còn `.cache/design-v2/.pid-*`).
- **Success criteria:** Toàn bộ artifact tạm đã bị xoá hoàn toàn; không có bất kỳ file nào ngoài allowlist bị sửa/thêm; `biome check`, `check-types`, `pnpm test` đều thoát `0`; không còn `.pid-*` hay tiến trình con mồ côi của worktree.
- **Verify:** `sha256sum -c /tmp/pay-composites-653.sha256 && rm -f /tmp/pay-composites-653.sha256 && test ! -e scripts/design-compare/.state && test ! -e apps/e2e/.mail-log.jsonl && test ! -e apps/e2e/local.db && test -z "$(find .cache/design-v2 -maxdepth 1 -name '.pid-*' -print -quit 2>/dev/null)" && test -z "$(pgrep -af '[t]eacher-os-653-design-compare-pay-blank/(apps|scripts|\.cache)' || true)" && node -e 'const {execSync}=require("node:child_process"); const base=execSync("git merge-base HEAD origin/develop",{encoding:"utf8"}).trim(); const a=execSync(`git diff --name-only ${base}`,{encoding:"utf8"}).split("\n").filter(Boolean); const b=execSync("git status --porcelain",{encoding:"utf8"}).split("\n").filter(Boolean).map(l=>l.slice(3).trim()); const all=[...new Set([...a,...b])]; const ok=new Set(["scripts/design-compare/screens.json","plans/261020-1446-378-redesign-design-v2/phase-01-visual-harness-baseline.md","plans/261020-1446-378-redesign-design-v2/screenshots/verdict.md","CHANGELOG.md",...["desktop","tablet","phone"].flatMap(v=>["light","dark"].map(t=>`plans/261020-1446-378-redesign-design-v2/screenshots/pay/${v}-${t}.png`))]); const bad=all.filter(f=>!ok.has(f)&&!f.startsWith("plans/261111-0257-653-design-compare-pay-blank")&&!f.startsWith("plans/journals/")); if(bad.length){console.error("DISALLOWED:",bad);process.exit(1);} console.log("ALLOWLIST_OK",all.length);' && pnpm exec biome check . && pnpm check-types && pnpm test` thoát mã `0` và in `ALLOWLIST_OK`.

## Todo

- [ ] Task 2.1: Chụp ghép lại 6 ảnh composite màn `pay` và kiểm chứng 2 lượt `--force` + 1 lượt cache-hit
- [ ] Task 2.2: Đối chiếu trực quan 6 ảnh `pay` và cập nhật `verdict.md` + `CHANGELOG.md`
- [ ] Task 2.3: Dọn sạch artifact nhạy cảm, kiểm tra allowlist Scope Lock, cổng chất lượng local và tiến trình mồ côi

## Verification

- `test ! -e scripts/design-compare/.state && test ! -e apps/e2e/.mail-log.jsonl && test ! -e apps/e2e/local.db` thoát mã `0` (không chạy lại `design:compare` sau bước duyệt mắt + dọn dẹp).
- `pnpm exec biome check . && pnpm check-types && pnpm test` thoát mã `0`.
- `test -z "$(find .cache/design-v2 -maxdepth 1 -name '.pid-*' -print -quit 2>/dev/null)" && test -z "$(pgrep -af '[t]eacher-os-653-design-compare-pay-blank/(apps|scripts|\.cache)' || true)"` thoát mã `0`.

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
