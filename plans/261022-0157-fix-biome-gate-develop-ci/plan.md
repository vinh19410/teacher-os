---
title: "Fix biome gate: non-mutating check, ignore report HTML, CI cho develop"
description: "pnpm check đỏ vì artifact HTML trong plans/reports + format error watchdog, và tự mutate file ngoài phạm vi; bật CI quality cho develop kèm cập nhật contract test."
status: completed
priority: P1
effort: 2h
issue: 409
branch: ai-handle-issue-409
tags: [bugfix, infra]
blockedBy: []
blocks: []
created: 2026-10-22
---

# Fix biome gate: non-mutating check, ignore report HTML, CI cho develop

## Overview

`pnpm exec biome check .` (gate read-only mà CI dùng) fail trên develop HEAD `c5cfe9d4` với **34 errors**: 33 trong file artifact `plans/reports/brainstorm-261021-1500-syllabus-refactor.html` (brainstorm #400) và 1 formatter error ở `apps/e2e/devserver-watchdog.mjs` (commit #408). Script gate local `"check": "biome check --write ."` tự mutate file (chính nó đã format watchdog + HTML trong lần tái hiện — che luôn 1 phần lỗi). `biome.json:47` dùng field deprecated `rules.recommended`. CI chỉ trigger `main` nên develop merge trong lúc gate đỏ không ai nhận ra. Fix: exclude HTML report khỏi biome, format watchdog (format-only), tách `check`/`check:fix`, migrate `preset`, bật CI quality cho develop và khóa hợp đồng mới bằng contract test.

## Root cause (đo lại trên tree SẠCH, 2026-10-22, HEAD `c5cfe9d4` — read-only run)

| # | Sự cố | Bằng chứng |
|---|-------|-----------|
| 1 | 34 lint/format errors chặn gate | `pnpm exec biome check . --reporter=summary`: **34 errors, 99 warnings, 19 infos**. Riêng `plans/reports/brainstorm-261021-1500-syllabus-refactor.html`: 33e/59w/10i (`noDuplicateProperties` 10e, `noInnerDeclarations` 18e, `noNoninteractiveTabindex` 2e, `useSemanticElements` 2e, còn lại warnings/infos + 1e khác). Riêng `apps/e2e/devserver-watchdog.mjs`: 1 formatter error (dòng 139-141, tab-in-tab từ commit #408) |
| 2 | Gate tự mutate tree | `package.json:21` `"check": "biome check --write ."`; lần tái hiện đã format `apps/e2e/devserver-watchdog.mjs` + file HTML — mutation vừa là side-effect có hại, vừa CHE ĐI 1 formatter error (số liệu "32 errors" trong issue #409 là đo trên tree đã bị mutate) |
| 3 | Deprecation | `pnpm exec biome check biome.json`: `biome.json:47:12 deserialize DEPRECATED — use preset instead` |
| 4 | Develop không có CI | `.github/workflows/ci.yml:3-7` chỉ trigger `main`; `scripts/ci-workflow.test.mjs:24-26` assert `doesNotMatch /\bdevelop\b/` trên ci.yml (khối e2e.yml:118-122 giữ nguyên; test staging :78 chỉ có "develop" trong tên test, không assert yaml) |

Bài học đo đạc: mọi số liệu trong issue #409 và bản plan đầu được lấy SAU khi `--write` chạy — luôn đo bằng read-only run trên tree sạch.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | `pnpm exec biome check .` exit 0 với **0 errors, 40 warnings, 9 infos** (delta: −33e/−59w/−10i từ HTML exclude, −1e từ format watchdog) | P1 |
| 2 | `pnpm check` không mutate tree; autofix chủ động tách sang `check:fix` | P1 |
| 3 | Không còn deprecation warning `biome.json`; diagnostics không đổi sau migrate preset | P2 |
| 4 | CI quality chạy cho push `develop` + PR target `develop`, khóa bằng assertion cấu trúc trong contract test; AGENTS.md đồng bộ | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Biome config + format watchdog + gate script non-mutating](./phase-01-biome-config.md) | Pending |
| 2 | [Phase 2: CI develop + contract test + docs](./phase-02-ci-develop.md) | Pending |

## Quyết định thiết kế (counsel kongming: GO; red-team 2 reviewer: 6+3 findings đã adjudicate)

1. **Exclude hẹp `!plans/reports/**/*.html`** — KHÔNG exclude nguyên thư mục: chỉ artifact HTML sinh tự động (hôm nay 1 file, 0 giá trị lint) thoát check; `.md`/`.yaml`/script trong dir vẫn bị lint/formatter phủ (chặn blind spot commit code thực thi ngoài gate — finding Security #3). File HTML giữ nguyên trong git.
2. **Format `apps/e2e/devserver-watchdog.mjs`** (format-only, biome --write scoped 1 file): bắt buộc để gate read-only exit 0; đây chính là file mà gate cũ âm thầm format — đưa vào scope tường minh thay vì mutation ngầm (finding Critical chung 2 reviewer). Diff format-only + `pnpm test:devserver-watchdog` xanh làm bằng chứng behavior không đổi.
3. **Tách `check` (read-only) và `check:fix` (mutate)**: giữ năng lực autofix cũ dưới tên mới; gate local hết side-effect. Kongming: giữ `check:fix` không phải scope creep.
4. **`"preset": "recommended"`** thay `"recommended": true` (schema `PresetConfig` enum); Verify theo delta: tổng diagnostics trước/sau giống hệt.
5. **Thêm `develop` vào CẢ `push.branches` và `pull_request.branches` của ci.yml**: PR event = gate pre-merge (chặn drift trước khi vào develop); push event = convergence sau merge (pipeline `--ship` beta cần watch develop CI). Chấp nhận double compute khi cả 2 event chạy. `e2e.yml` GIỮ NGUYÊN. **Không** thêm autofix bot vào CI (finding Assumptions #3): PR gate đã chặn drift pre-merge; develop đỏ vì drift trực tiếp = tín hiệu, remedy là `pnpm check:fix` (ghi trong AGENTS.md) — auto-commit bot là scope creep + rủi ro push war.
6. **Contract test: thay assertion `\bdevelop\b` lỏng bằng assertion cấu trúc** trên `pull_request:`/`push:` + `branches: [main, develop]` (finding Security #4) — substring tự do match cả comment. Chỉ sửa khối ci.yml; khối e2e.yml và test staging GIỮ NGUYÊN (3 vị trí "develop" trong file được liệt kê tường minh trong Task 2.1, cấm replace_all — finding Security #6).
7. **AGENTS.md đồng bộ**: CI quality có develop; bộ lệnh local VẦN là gate chính; remedy develop-CI-đỏ-lỗi-format = `pnpm check:fix`; convention artifact HTML report đặt `plans/reports/` + caveat: file trong glob exclude không được quét lint — KHÔNG dán secret/log nhạy cảm vào report (finding Security #5, ghi nhận trade-off thay vì gitignore vì report là durable record).

## Non-goals

- Không đổi behavior runtime của app; không đụng `main`; không deploy.
- Không sửa nội dung file HTML artifact; không xóa nó khỏi git; không gitignore `plans/reports/`.
- Không bật E2E workflow cho develop; không đổi deploy.yml/deploy-staging.yml.
- Không bật `--error-on-warnings`; không sửa 40 warnings/9 infos pre-existing ngoài phạm vi.
- Không thêm autofix bot/commit tự động vào CI.

## Acceptance Criteria

- [x] `pnpm exec biome check .` exit 0 với **0 errors** (hard assert); warnings/infos kỳ vọng 40/**8** (99−59, 19−10−1: −1 info là diagnostic DEPRECATED bị xóa — chính mục tiêu fix; soft assert, counsel kongming plan-gates + verify-failure).
- [x] `git diff apps/e2e/devserver-watchdog.mjs` chỉ chứa thay đổi format; `pnpm test:devserver-watchdog` exit 0.
- [x] `pnpm check` chạy trên tree sạch → `git status --porcelain` rỗng sau khi chạy; `pnpm test:ci-workflow` xanh với assertion mới "root check must not mutate the tree".
- [x] `package.json`: `"check": "biome check ."`, `"check:fix": "biome check --write ."`.
- [x] `pnpm exec biome check biome.json` không còn DEPRECATED; tổng diagnostics không đổi xuyên suốt migrate preset.
- [x] `.github/workflows/ci.yml`: `pull_request.branches` và `push.branches` đều `[main, develop]`; contract test assert cấu trúc này; khối e2e.yml + staging test không đổi.
- [x] `AGENTS.md`: bullet CI mới + note plans/reports + remedy check:fix.
- [x] Full local gate trên branch: `pnpm exec biome check .` + `pnpm test` + `pnpm check-types` + `VITE_SERVER_URL=http://localhost:8000 pnpm build` đều exit 0.

### Advisory receipt — kongming plan-gates (2026-10-22)
- **GO** cho thiết kế sửa; baseline 34/99/19 được kongming verify độc lập (khớp 100%).
- Điều chỉnh đã áp: (1) Verify hard-lock chỉ `errors = 0`, warnings/infos soft; (2) regex flow-style kèm comment chữ ký trong test.
- Watchdog format: risk ~0 (biome không đổi template literal); bắt buộc đọc diff 1 lần (Task 1.3 bước 2).

## Red Team Review

### Session — 2026-10-22
**Reviewers:** Security Adversary + Fact Checker (`RedTeamSecurity2`), Assumption Destroyer + Fact Checker (`RedTeamAssumptions2`) — spawn qua default `task` agent (agent type `code-reviewer` lỗi host: "No model selected"; fallback ghi nhận, prompt/persona giữ nguyên).
**Findings:** 9 (3 accepted-as-is, 2 accepted-modified, 1 accepted-partial, 3 duplicate/rejected)
**Severity breakdown:** 2 Critical (duplicate của nhau), 4 High, 3 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Baseline contaminated: đo sau `--write`; thật = 34e/99w/19i, còn 1 format error watchdog ngoài HTML — gate vẫn đỏ sau Phase 1 cũ | Critical | **Accept** | plan.md Root cause #1/#2; Phase 1 Task 1.3 mới (format watchdog) |
| 2 | Metrics/target không tái hiện được; Verify exact-match số tuyệt đối dễ fail oan | High | **Accept** | Số liệu thay bằng đo sạch; Verify đổi sang delta (−33e/−59w/−10i, −1e) + expected 0e/40w/9i |
| 3 (Sec) | Exclude nguyên dir `plans/reports` = blind spot vĩnh viễn cho file thực thi (supply channel) | High | **Accept** | Quyết định #1: glob hẹp `!plans/reports/**/*.html` |
| 3 (Assump) | Không có autofix trong CI → develop đỏ vĩnh viễn với format drift | High | **Accept risk** | Quyết định #5: PR gate chặn pre-merge; remedy `check:fix` vào AGENTS.md; từ chối bot (scope creep) |
| 4 | Assertion `\bdevelop\b` lỏng — match cả comment, không khóa branches | Medium | **Accept** | Task 2.1: regex cấu trúc `pull_request:/push:` + `branches: [main, develop]` |
| 5 | Dir exclude + không gitignore + `useIgnoreFile:false` = kênh rò secret không quét | Medium | **Accept (partial)** | AGENTS.md note caveat secret; KHÔNG gitignore (report = durable record; issue cho phép chọn ignore-biome) |
| 6 | 3 vị trí "develop" trong contract test (ci.yml ~24-26, staging test name ~78, e2e ~118-122) — rủi ro replace_all sửa nhầm khối e2e | Medium | **Accept** | Task 2.1 liệt kê đủ 3 vị trí + anchor duy nhất + cấm replace_all |

Evidence filter: mọi finding đều có `file:line` hoặc lệnh đo kèm output — không finding nào bị reject vì thiếu evidence. Finding "Target 40w/9i sai" của Security #2 KHÔNG được chấp nhận về con số (99−59=40, 19−10=9 — đích đúng, diễn giải sai), chỉ chấp nhận phần đổi cách Verify.

## Validation Log

### Verification Results (fact-check thủ công, 2026-10-22)
- Claims checked: 7 (package.json:21; ci.yml:3-7; ci-workflow.test.mjs:24-26/78/118-122; AGENTS.md:11; biome.json:47; baseline biome 34/99/19; không có script khác chạy biome --write)
- Verified: 7 | Failed: 0 | Unverified: 0
- Tier: Light (2 phases, Fact Checker, ≥5 claims/phase)
- Ghi chú: 2 claim số liệu của bản plan đầu FAILED khi đo lại trên tree sạch → đã sửa theo Red Team #1/#2.
