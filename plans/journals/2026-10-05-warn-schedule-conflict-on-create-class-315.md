---
title: "Warn schedule conflict on create class (#315)"
date: 2026-10-05
summary: "findScheduleConflicts (5-condition rule, skeletonOf run-window, bỏ status filter vacuous) + warning box trong AddClassModal: realtime, không chặn, cap 3, ẩn khi saving/notice. Red-team 10 findings (9 accept) + local review 3 Important đã fix: parse total như submit chống skeletonOf freeze, window inequality độc lập, tests suppress/cap/uncheck/edge. Gates: check, check-types, web 1208/1208, e2e 127 passed."
---

# Warn schedule conflict on create class (#315)

findScheduleConflicts (5-condition rule, skeletonOf run-window, bỏ status filter vacuous) + warning box trong AddClassModal: realtime, không chặn, cap 3, ẩn khi saving/notice. Red-team 10 findings (9 accept) + local review 3 Important đã fix: parse total như submit chống skeletonOf freeze, window inequality độc lập, tests suppress/cap/uncheck/edge. Gates: check, check-types, web 1208/1208, e2e 127 passed.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
