---
title: "Phase 2: CI develop + contract test + docs"
status: done
---

# Phase 2: CI develop + contract test + docs

## Goal

CI quality chạy cho push `develop` + PR target `develop`, khóa bằng assertion cấu trúc; `AGENTS.md` đồng bộ (kèm remedy `check:fix` + caveat secret); full local gate xanh để develop CI không đỏ ngay khi bật.

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
| `scripts/ci-workflow.test.mjs` | modify | THAY assertion `develop` lỏng của **ci.yml** bằng regex cấu trúc (chỉ khối ci.yml) |
| `.github/workflows/ci.yml` | modify | `pull_request.branches` + `push.branches` → `[main, develop]` |
| `AGENTS.md` | modify | Bullet CI (dòng 11) + note plans/reports + remedy check:fix |

## Tasks & Steps

### Task 2.1 — Assertion cấu trúc cho trigger develop (TDD RED)
- Goal: contract test khóa CẤU TRÚC trigger develop (không phải substring lỏng).
- Target files: `scripts/ci-workflow.test.mjs` — test đầu tiên, khối assert sau `assert.match(yaml, /\bmain\b/, "must include main");`.
- Bản đồ 3 vị trí "develop" trong file (chỉ được sửa vị trí 1):
  1. **ci.yml block, dòng ~23-26** — `assert.doesNotMatch(yaml, /\bdevelop\b/, "must not trigger on develop (runs on main only)")` ngay sau assert `main` → **SỬA khối này**.
  2. **test staging, dòng ~78** — chữ "develop" chỉ nằm trong TÊN test `staging deploy workflow is manual-only (no develop push trigger)` → KHÔNG đụng.
  3. **e2e.yml block, dòng ~118-122** — `assert.doesNotMatch(yaml, /\bdevelop\b/, ...)` giống hệt nguyên văn khối ci.yml → **KHÔNG đụng** (e2e vẫn main-only).
- Steps:
  1. Dùng anchor duy nhất: khối ngay sau dòng `assert.match(yaml, /\bmain\b/, "must include main");` CỦA TEST ĐẦU TIÊN. KHÔNG dùng replace_all; KHÔNG match theo message string trống.
  2. Thay `assert.doesNotMatch(yaml, /\bdevelop\b/, "must not trigger on develop (runs on main only)"),` (khối ci.yml) bằng:
     ```js
     assert.match(
       yaml,
       /pull_request:\s*\n\s*branches:\s*\[main,\s*develop\]/,
       "pull_request must target main and develop (pre-merge gate)",
     );
     assert.match(
       yaml,
       /push:\s*\n\s*branches:\s*\[main,\s*develop\]/,
       "push must cover main and develop (post-merge convergence)",
     );
     ```
  3. Không đổi assertion nào khác. Assertion `\bmain\b` cũ giữ nguyên.
  4. Thêm comment 1 dòng ngay trên 2 assertion mới: `// Contract locks flow-style branches lists; switching ci.yml to YAML block style requires updating this test.` (counsel kongming plan-gates: regex fail-closed một chiều — biến trade-off thành quyết định có chữ ký).
- Success criteria: `pnpm test:ci-workflow` exit khác 0, fail đúng ở 2 assertion mới (ci.yml chưa có develop).
- Verify: `pnpm test:ci-workflow 2>&1 | tail -25` — đúng 2 failure "pull_request must target..." và "push must cover..."; test e2e + staging vẫn pass.

### Task 2.2 — Thêm develop vào triggers của ci.yml (TDD GREEN)
- Goal: CI quality chạy cho PR target develop và push lên develop.
- Target files: `.github/workflows/ci.yml` — khối `on:` (dòng 3-7).
- Steps:
  1. `pull_request: branches: [main]` → `branches: [main, develop]` (giữ nguyên YAML style của file).
  2. `push: branches: [main]` → `branches: [main, develop]`.
  3. Không đổi steps, concurrency, permissions hay dòng nào khác.
- Success criteria: Task 2.1 chuyển xanh toàn bộ.
- Verify: `pnpm test:ci-workflow` exit 0 (cả 4 test pass).

### Task 2.3 — Đồng bộ AGENTS.md
- Goal: docs đúng hợp đồng mới; remedy + caveat rõ ràng.
- Target files: `AGENTS.md` (repo root) — mục "Lưu ý vận hành".
- Steps:
  1. Sửa bullet dòng 11 ("CI/E2E workflow chỉ trigger cho target `main`...") thành: CI quality (`ci.yml`) trigger push + PR cho `main` và `develop`; E2E workflow vẫn chỉ `main`, E2E vẫn chạy local qua bộ lệnh port 8100–8103; bộ lệnh local (`pnpm check`, `pnpm check-types`, test, e2e) **vẫn là gate chính** cho agent — CI develop là lưới an toàn sau merge; develop CI đỏ vì format/lint → remedy: `pnpm check:fix` rồi commit.
  2. Thêm 1 bullet: artifact HTML report sinh tự động đặt trong `plans/reports/` (glob `plans/reports/**/*.html` bị biome exclude); caveat: file dưới glob exclude không được lint quét — không dán secret/token/log nhạy cảm vào report; không commit artifact report ở chỗ khác.
  3. Giữ nguyên mọi dòng khác.
- Success criteria: AGENTS.md không còn tuyên bố "CI chỉ trigger main"; có remedy check:fix; có note plans/reports + caveat.
- Verify: `grep -c "check:fix" AGENTS.md` ≥ 1; `grep -c "plans/reports" AGENTS.md` ≥ 1; `grep -F "chỉ trigger cho target \`main\`" AGENTS.md` in `0`.

### Task 2.4 — Full local gate (điều kiện mở PR)
- Goal: branch xanh toàn bộ — develop CI chạy cùng bộ lệnh này nên không được đỏ khi bật.
- Target files: không sửa file.
- Steps:
  1. Chạy lần lượt, dừng ở lệnh đầu tiên exit khác 0:
     ```bash
     pnpm exec biome check .
     pnpm test
     pnpm check-types
     VITE_SERVER_URL=http://localhost:8000 pnpm build
     ```
  2. Ghi lại exit code từng lệnh vào báo cáo.
- Success criteria: cả 4 lệnh exit 0.
- Verify: terminal in exit 0 cho cả 4; lệnh nào đỏ → Failure Protocol.

## Verification (gate cuối phase)

```bash
pnpm test:ci-workflow                                  # exit 0 (assertion cấu trúc develop)
pnpm test                                              # exit 0
git diff --stat                                        # đúng 6 file: biome.json, package.json, apps/e2e/devserver-watchdog.mjs, .github/workflows/ci.yml, scripts/ci-workflow.test.mjs, AGENTS.md (+ plan files)
```

## Verification Log (2026-10-22)

| Lệnh | Exit | Ghi chú |
|------|------|---------|
| `pnpm exec biome check .` | 0 | 0 errors / 40 warnings / 8 infos |
| `pnpm test` | 0 | gồm test:ci-workflow 4/4, topology-drift, devserver-watchdog, turbo test |
| `pnpm check-types` | 0 | |
| `VITE_SERVER_URL=http://localhost:8000 pnpm build` | 0 | chạy lại sau review (finding Medium #1) |
| `pnpm test:devserver-watchdog` | 0 | behavior check sau format watchdog |
| `pnpm check` non-mutation | ✔ | `git status --porcelain` bất biến trước/sau |
| `git diff --stat` | ✔ | đúng 6 file phạm vi |
