---
title: "M5 #69: Pilot blocker triage + regression E2E xanh (DOD-honest evidence)"
description: "Triage pilot log blockers cho issue #69, fix những gì có thật, và chứng minh regression E2E xanh bằng evidence liên kết được."
status: completed
priority: P1
effort: 4h
issue: 69
branch: vinh19410/issue-69-pilot-blockers-e2e
tags: [bugfix, docs, e2e, verification]
blockedBy: []
blocks: []
created: 2026-09-21
---

# M5 #69: Pilot blocker triage + regression E2E xanh (DOD-honest evidence)

## Overview

Issue #69 đòi 2 việc: fix toàn bộ pilot blocker ghi trong pilot log, và regression E2E (class operations + money loop) chạy xanh. Việc này đi qua `ak-vibe --ship beta`: triage thật → fix những gì tồn tại thật → ghi evidence → ship PR merge vào develop và theo dõi CI.

**Ràng buộc trung tâm (từ issue #69 dispatch):** không bịa pilot evidence. Nếu pilot log không có blocker, ghi nhận finding đó vào issue và làm thay đổi trung thực nhỏ nhất thỏa DOD (evidence regression E2E) thay vì chế tác việc.

## Key Facts (triage đã thực hiện 2026-09-21)

- Pilot log `plans/260917-1215-m4-pilot-operations/pilot-log.md` (merge qua PR #215) ở trạng thái **template rỗng** — mọi bảng ghi "_Chưa có dòng — pilot chưa bắt đầu_", 0 entry `PL-NNN`, 0 blocker. M4 pilot (#67) vẫn `in progress`, chưa onboard.
- Không có issue mở nào mang label `[QC]` hay `[Dev]` trong repo (đã list 2026-09-21).
- CI trên develop: workflow E2E + CI xanh tại `e41c0a3` (2026-09-21T04:53Z); các run mới hơn trên docs-only commits.

→ Kết luận triage: **0 pilot blocker tồn tại để fix**. Route thực thi là verification + documentation, không phải code fix.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Triage pilot blockers](./phase-01-triage-pilot-blockers.md) | Completed |
| 2 | [Regression verification E2E](./phase-02-regression-verification-e2e.md) | Completed |
| 3 | [Evidence record + ship beta](./phase-03-evidence-record-and-ship-beta.md) | Completed |

## Red Team Review

### Session — 2026-09-21

**Execution mode:** inline (controller-executed 3 lenses: Security Adversary/Fact Checker, Failure Mode Analyst/Flow Tracer, Assumption Destroyer/Scope Auditor). Subagent runtime unavailable trong environment này ("No model selected" — cả 3 spawn task/agent đều fail 1s), nên 3 persona chạy inline với grep/glob evidence; được ghi rõ ở đây thay vì giấu.

**Findings:** 7 (5 accepted, 2 rejected) · Severity: 0 Critical, 2 High, 3 Medium, 2 Low

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Phase 2 ghi tên spec "class-create" không tồn tại; spec thật là `class-operations.spec.ts`, `create-class-validation.spec.ts` | High | Accept | Phase 2 |
| 2 | Evidence "regression E2E xanh" theo convention repo phải dẫn CI workflow run (roadmap evidence dẫn CI, không phải run local) — local chỉ là supporting | High | Accept | Phase 3 |
| 3 | Watch post-merge phải gồm cả Deploy Staging (chạy trên push develop, kể cả docs-only), không chỉ CI+E2E | Medium | Accept | Phase 3 |
| 4 | 1 test E2E bị skip có chủ đích (OAuth round-trip, env-gated `profile.spec.ts:143`) — evidence phải nêu đích danh, nếu không "E2E xanh" là nói quá | Medium | Accept | Phase 2, 3 |
| 5 | Triage cần ghi rõ các nguồn phụ đã kiểm: weekly-check-in (template), triage-convention, comments #67/#53, QC issues đã đóng (#176, #200) | Medium | Accept | Phase 1 |
| 6 | Evidence report/issue không chứa absolute path local theo quy tắc ghi an toàn pilot | Low | Accept | Phase 3 |
| 7 | "Plan không fix gì cả" — bỏ qua, vì 0 blocker tồn tại và constraint issue cấm bịa việc | Low | Reject | — |

### Adjudication highlights

- **F2 (Accept):** `docs/project-roadmap.md:44,49,59` — mọi dòng DOD E2E xanh dẫn evidence là CI workflow run trên develop; evidence report phải link PR check run + develop run làm primary, run local làm supporting.
- **F3 (Accept):** `.github/workflows/deploy-staging.yml:23-25` — trigger `push: develop`; docs-only commit `8a11996` deploy success (đối chứng qua `gh run list`). Watch scope = CI + E2E + Deploy Staging.
- **F5 (Accept):** `weekly-check-in.md` chỉ có template ("Template tuần — không điền vào đây"), comments #67/#53 chỉ ghi prep docs + "pilot not started", #176/#200 đã CLOSE → không nguồn phụ nào chứa blocker mở.
- **F7 (Reject):** issue #69 constraint: "không bịa pilot evidence… smallest truthful change" — verification-only là đúng route, không phải thiếu việc.

### Whole-Plan Consistency Sweep

Đã áp F1–F6 vào phase files; quét lại toàn bộ plan.md + 3 phase: không còn tham chiếu spec sai tên, evidence yêu cầu nhất quán (CI primary/local supporting), watch scope nhất quán (CI+E2E+Staging), skip test được nêu ở Phase 2 và 3. Không contradiction chưa giải.

## Success Criteria

- [x] Inventory pilot blocker từ pilot log + issue [QC]/[Dev] mở: mỗi mục có kết luận fix hoặc lý do không actionable. *(5 nguồn kiểm — 0 blocker)*
- [x] Regression E2E full suite (`apps/e2e`, class operations + money loop + toàn bộ specs) xanh local tại đúng commit; `pnpm check`, `pnpm check-types`, `pnpm test` xanh. *(66 pass / 0 fail / 1 skip đích danh tại `beda711`)*
- [x] Evidence report file trong plan dir, link từ issue #69; roadmap M5 DOD dòng "Toàn bộ pilot blocker fix; regression E2E xanh" được tick kèm evidence + caveat pilot-chưa-chạy.
- [x] PR merge vào develop (beta), CI develop xanh post-merge. *(thực thi trong vibe merge stage — link run vào issue #69)*

## Non-Goals

- Không bịa entry pilot log, không tạo dòng mẫu, không "mô phỏng" pilot blocker.
- Không mở rộng scope sang M5 DOD khác (metrics tổng hợp, decision record — thuộc #70).
- Không refactor/sửa code app khi E2E đã xanh — không có evidence đòi hỏi thay đổi code.

## Dependencies

- Pilot log rỗng là prerequisite fact của plan này; nếu pilot bắt đầu chạy giữa chừng và ghi blocker, dừng và chuyển hướng theo blocker thật.
