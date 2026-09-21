---
title: "Issue #69 — M5 pilot blocker triage (0 blocker) + regression E2E xanh (beta develop)"
date: 2026-09-21
summary: "Triage 5 nguồn pilot blocker: 0 blocker tồn tại (pilot chưa bắt đầu) → verification-only theo constraint no-fabrication; regression E2E 66 pass/0 fail local + CI xanh; tick DOD-1 M5 dạng vacuous kèm điều kiện mở lại"
---

# Issue #69 — M5 pilot blocker triage (0 blocker) + regression E2E xanh (beta develop)

## What happened
- Issue #69 (M5 DOD-1) qua vibe pipeline `--ship beta`: plan mới `plans/260921-0505-issue69-m5-pilot-blockers-regression-e2e/` (3 phase, red-team inline 3 persona — 5 accept/2 reject, subagent runtime không có model nên chạy inline có ghi rõ).
- Triage 5 nguồn: pilot log (template rỗng, 0 entry `PL-NNN`), issue mở label QC/Dev (0; #176/#200 đã đóng), roadmap docs (không ref blocker), weekly-check-in + triage-convention (template/định nghĩa), comments #67/#53 (chỉ prep docs) → **0 pilot blocker tồn tại**.
- Verification 4 gate tại `beda711`: `pnpm check` xanh (362 files), `pnpm check-types` 6/6, `pnpm test` xanh (turbo + ci-workflow 2/2 + topology-drift 6/6), E2E full suite **66 passed / 1 skipped (đích danh `profile.spec.ts:143` OAuth round-trip env-gated — manual checklist M3) / 0 failed** @ 1.6m (ports 8100/8101 override vì dev server chiếm 8000/8001).
- Evidence report: `plans/260921-0505-issue69-m5-pilot-blockers-regression-e2e/reports/evidence-regression-e2e.md`; roadmap M5 DOD-1 tick kèm caveat, M5 status → Đang thực hiện.

## Decision
- **Không fix gì cả là đúng route:** constraint issue #69 cấm bịa pilot evidence; với 0 blocker, "smallest truthful change" = evidence verification + documentation, không phát minh việc.
- **DOD-1 đóng dạng vacuous, có điều kiện mở lại:** pilot log 0 blocker ⇒ "toàn bộ blocker fix" thỏa rỗng; dòng tick ghi rõ "nếu pilot (#67) bắt đầu và ghi blocker, dòng này mở lại" — tránh đọc nhầm là M5 xong hay pilot đã chạy.
- **Evidence primary = CI workflow run** (convention roadmap M1/M2), local run chỉ supporting — red-team finding F2.
- **Watch post-merge đủ 3 workflow** (CI, E2E, Deploy Staging — staging deploy trigger trên mọi push develop, docs-only `8a11996` đã success làm baseline) — red-team finding F3.

## Next steps
- PR vào `develop` (beta stage); sau merge theo dõi CI + E2E + Deploy Staging trên commit merge, link 3 run vào issue #69.
- Khi pilot (#67) thực chạy: mọi blocker ghi vào pilot log theo triage-convention; DOD-1 M5 mở lại nếu có blocker thật.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
