---
title: "Phase 3: Evidence record + ship beta"
status: completed
---

# Phase 3: Evidence record + ship beta

## Overview

Ghi nhận finding "0 pilot blocker" và evidence regression E2E vào nơi DOD đọc (evidence report + issue #69 + roadmap), rồi ship PR merge vào develop (beta) và theo dõi CI post-merge.

## Context Links

- Roadmap DOD mục tiêu: `docs/project-roadmap.md` mục M5, dòng "Toàn bộ pilot blocker fix; regression E2E xanh".
- Quy ước cập nhật roadmap: cùng file, section "Quy ước cập nhật" (tick kèm link bằng chứng; evidence convention dẫn CI workflow run — các dòng M1/M2 DOD tại `docs/project-roadmap.md:44,49,59`).
- Issue #69 · ak-vibe mode: `--ship beta`.
- Workflows post-merge cần watch: `.github/workflows/ci.yml`, `.github/workflows/e2e.yml`, `.github/workflows/deploy-staging.yml` (trigger push develop).

## Implementation Steps

1. Viết `reports/evidence-regression-e2e.md` trong plan dir: triage finding (5 nguồn, 0 blocker), kết quả 4 gate local (commit SHA, số test gồm skip đích danh, ngày), link CI run.
2. Update issue #69 comment: finding 0-blocker (không bịa), link evidence report, link E2E run.
3. Tick roadmap M5 DOD dòng 1 kèm link evidence + caveat rõ: "pilot log 0 blocker (pilot chưa bắt đầu, #67) — vacuously satisfied; E2E regression xanh tại <commit/PR>".
4. Commit plan + evidence + roadmap; ship qua `ak:ship beta` → PR → `ak:review-pr --fix --reply` → merge vào develop → watch develop đến xanh (fix loop nếu đỏ vì nguyên nhân repo-fixable).

## Todo

- [x] Evidence report viết xong, dữ liệu trỏ về run thật; **evidence primary = CI workflow runs** (PR check run + post-merge develop run), run local chỉ supporting.
- [x] Evidence nêu đích danh skip duy nhất: `profile.spec.ts` OAuth round-trip (env-gated `E2E_GOOGLE_OAUTH`).
- [x] Issue #69 update với finding + links.
- [x] Roadmap DOD tick + caveat; M5 status giữ nguyên (chỉ 1 dòng DOD thuộc scope #69).
- [x] PR merge develop + watch đủ 3 workflow trên develop commit merge: CI, E2E, Deploy Staging — thực thi trong vibe merge stage ngay sau PR này; link kết quả run ghi vào issue #69.
- [x] Evidence report + issue comment không chứa absolute path local / secret (quy tắc ghi an toàn pilot).

## Success Criteria

Người đọc DOD M5 truy được từ dòng tick → evidence report → CI run, không chỗ nào suy diễn. PR chứa toàn bộ artifacts (plan, evidence, roadmap) — không để evidence chỉ nằm local. Mọi skip E2E được nêu đích danh; nếu một gate đỏ mà nguyên nhân là external blocker thật (secret, service), ghi rõ thay vì nhạt nhòa.

## Risk Assessment

- **Risk:** tick roadmap bị đọc là "M5 xong". **Mitigation:** chỉ tick đúng 1 dòng DOD scope #69; các dòng khác (metrics, decision record) giữ nguyên unchecked; M5 status không đổi.
- **Risk:** PR docs-only vẫn phải qua E2E workflow — nếu đỏ vì flake CI, dùng fix loop của vibe (merge/watch) thay vì bỏ qua.

## Security Considerations

Không ghi secret/env vào evidence report hay issue; output E2E đã làm sạch theo quy tắc pilot log (không raw log chứa token, không absolute path local).
