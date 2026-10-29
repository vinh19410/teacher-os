---
title: "Phase 1: Biome config + format watchdog + gate script non-mutating"
status: done
---

# Phase 1: Biome config + format watchdog + gate script non-mutating

## Goal

`pnpm exec biome check .` exit 0 với 0 errors, 40 warnings, 9 infos (baseline sạch 34e/99w/19i − HTML 33e/59w/10i − watchdog format 1e); `pnpm check` không mutate tree; autofix tách sang `check:fix`; hết deprecation `biome.json`.

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

## Files to Modify

| File | Action | Mô tả |
|------|--------|-------|
| `scripts/ci-workflow.test.mjs` | modify | Thêm assertion: root `check` script không chứa `--write` (TDD red trước) |
| `biome.json` | modify | `files.includes` thêm `"!plans/reports/**/*.html"`; `rules.recommended: true` → `rules.preset: "recommended"` |
| `apps/e2e/devserver-watchdog.mjs` | modify | FORMAT-ONLY qua `biome check --write` scoped đúng 1 file — không đổi logic |
| `package.json` | modify | `"check": "biome check ."`; thêm `"check:fix": "biome check --write ."` |

## Tasks & Steps

### Task 1.1 — Assertion contract cho gate non-mutating (TDD RED)
- Goal: contract test khóa ràng buộc "root `check` script không mutate tree" trước khi sửa code.
- Target files: `scripts/ci-workflow.test.mjs` — test `ci workflow exists and matches the quality-gate contract`, khối đã đọc `rootPkg`.
- Steps:
  1. Trong test đầu tiên, ngay sau khối `assert.match(String(rootPkg.scripts?.test ?? ""), /test:ci-workflow/, ...)`, thêm:
     ```js
     const checkScript = String(rootPkg.scripts?.check ?? "");
     assert.doesNotMatch(checkScript, /--write/, "root check must not mutate the tree");
     assert.equal(checkScript, "biome check .", "root check must be a read-only biome check");
     ```
  2. KHÔNG đụng assertion nào khác trong file.
- Success criteria: `pnpm test:ci-workflow` exit khác 0, fail đúng ở assertion mới.
- Verify: `pnpm test:ci-workflow 2>&1 | tail -20` — assertion failure "root check must not mutate the tree"; không failure nào ở chỗ khác. Exit khác 0 = RED đạt.

### Task 1.2 — Exclude HTML report khỏi biome
- Goal: artifact HTML trong `plans/reports` không còn bị lint/format; mọi file khác trong dir VẪN được check.
- Target files: `biome.json` — mảng `files.includes`.
- Steps:
  1. Thêm `"!plans/reports/**/*.html"` vào `files.includes` (đặt cạnh các exclude khác, sau `"!assets/videos"`). KHÔNG dùng `"!plans/reports"` — exclude hẹp để script/.md trong dir vẫn nằm trong gate.
  2. Không đổi dòng nào khác.
- Success criteria: file HTML biến mất khỏi summary; watchdog error (1) còn lại là error duy nhất.
- Verify: `pnpm exec biome check . --reporter=summary 2>&1 | grep -c "brainstorm-261021"` in `0`; `pnpm exec biome check . --reporter=summary 2>&1 | tail -3` cho **1 error** (hard — kỳ vọng 1e/40w/9i theo delta −33e/−59w/−10i; warnings/infos chỉ đối chiếu, không fail nếu lệch).

### Task 1.3 — Format `apps/e2e/devserver-watchdog.mjs` (format-only)
- Goal: hết formatter error; behavior file không đổi.
- Target files: `apps/e2e/devserver-watchdog.mjs` — chỉ whitespace/indent (dòng 139-141: `console.log(` multi-line → 1 dòng).
- Steps:
  1. `pnpm exec biome check --write apps/e2e/devserver-watchdog.mjs`
  2. `git diff apps/e2e/devserver-watchdog.mjs` — đọc toàn bộ diff, xác nhận CHỈ thay đổi format (không đổi string, logic, tên biến). Nếu diff chứa thay đổi khác format → STOP theo Failure Protocol.
  3. `pnpm test:devserver-watchdog` — behavior check.
- Success criteria: biome không còn error nào; watchdog test xanh; diff format-only.
- Verify: `pnpm exec biome check . --reporter=summary 2>&1 | tail -3` cho **0 errors** (hard; kỳ vọng kèm 40w/9i — soft); `pnpm test:devserver-watchdog` exit 0; diff chỉ có dòng 139-141 gộp lại.

### Task 1.4 — Migrate `rules.recommended` → `rules.preset`
- Goal: hết deprecation warning `biome.json:47` mà không đổi hành vi lint.
- Target files: `biome.json` — object `linter.rules`.
- Steps:
  1. Đổi `"recommended": true` thành `"preset": "recommended"` (giữ nguyên vị trí).
  2. Không đổi rule nào khác.
- Success criteria: check `biome.json` hết DEPRECATED; rule table giống hệt sau Task 1.3.
- Verify (điều kiện sửa sau counsel kongming verify-failure — baseline cũ nhiễm chính diagnostic deprecation đang fix):
  1. `pnpm exec biome check biome.json 2>&1 | grep -ci deprecated` in `0`.
  2. Rule table `--reporter=summary` identical từng dòng với run Task 1.3.
  3. Footer totals = **0 errors / 40 warnings / 8 infos** — `8 infos = 9 infos baseline − 1 info từ diagnostic DEPRECATED biome.json:48:12 (chính bug Task 1.4 fix)`.
  (Đã đo 2026-10-22: bảng rule identical; −1 info explained 100%.)

### Task 1.5 — Tách `check` read-only và `check:fix` (TDD GREEN)
- Goal: gate local không mutate; autofix chủ động còn available qua script riêng.
- Target files: `package.json` — `scripts.check`, thêm `scripts.check:fix` ngay sau `check`.
- Steps:
  1. `"check": "biome check --write ."` → `"check": "biome check ."`.
  2. Thêm `"check:fix": "biome check --write .",` ngay sau `"check"`.
  3. Không đụng script khác.
- Success criteria: Task 1.1 chuyển xanh; `pnpm check` trên tree sạch không sửa file nào.
- Verify: `pnpm test:ci-workflow` exit 0; `git stash list | wc -l` ghi nhận tree sạch (`git status --porcelain | wc -l` = 0) → `pnpm check >/dev/null 2>&1; echo exit=$?` in `exit=0` → `git status --porcelain | wc -l` vẫn `0`.

## Verification (gate cuối phase)

```bash
pnpm test:ci-workflow                                  # exit 0
pnpm exec biome check .                                # exit 0, "Found 0 errors", 40 warnings, 9 infos
pnpm test:devserver-watchdog                           # exit 0
# sau pnpm check trên tree sạch:
git status --porcelain | wc -l                         # 0
```

Phase xong khi cả 4 dòng trên đạt đồng thời.
