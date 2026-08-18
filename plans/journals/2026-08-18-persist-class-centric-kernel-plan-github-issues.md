---
title: Persist class-centric kernel plan + GitHub issues
date: 2026-08-18
summary: Plan 9 wave + 10 GitHub issue từ advise 2026-08-17
---

# Persist class-centric kernel plan + GitHub issues

## What happened

Follow advise `plans/reports/advise-2026-08-17-feature-rollup-roadmap.md`. Mode hard + `--github` + `--advice`.

Scout + 2 researcher xác nhận: domain `useReducer`+`seedData`; D1 chỉ 4 bảng auth; server `/` + `/api/auth/*`; CORS GET/POST/OPTIONS; không `packages/api`.

Tạo plan `plans/260818-1101-persist-class-centric-domain-kernel/` (9 phase = wave 0–8).

Kongming: GO 1 parent + 9 issue; W0 atomic; seed = fixture từ W0; W1–3 không block lẫn nhau.

Red-team 4 lens. Accept: loading gate, command bus, W1 không đổi write modal, bootstrap mọi `/api/*` trừ auth, `enrollmentId`, Origin check, serial 6→7, cắt X-Org-Id/`/api/me`.

## Decision

- Không persist MockData 1:1.
- Package trên enrollment. Org trống. Role teacher.
- POST-only. `packages/api` tay. Không đổi `bts.jsonc` `api`.
- Runtime W0: collection chưa peel = `[]`.

## Next steps

Chỉ Wave 0 unblocked: `/ak:cook plans/260818-1101-persist-class-centric-domain-kernel/plan.md` hoặc cook issue #10.

## Issues

#9 tracker. #10–#18 waves. Label `ready to review` + `enhancement`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
