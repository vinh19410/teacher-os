---
phase: 1
title: "Selectors today + at-risk (TDD)"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Selectors today + at-risk (TDD)

## Overview

Pure helper `dashboard-from-kernel.ts`: weekday hôm nay + lessons today + at-risk (absent / missed check-in). Clock injectable. Không React, không fetch.

## Context Links

- Plan: [plan.md](./plan.md)
- Lesson display shape: `apps/web/src/lib/mock-data.ts` (`Lesson.day`, `LessonStatus`)
- Schedule filter convention: `apps/web/src/routes/_auth/schedule.tsx` (`l.day === i + 1`)
- Clock pattern: `apps/web/src/lib/date-input.ts`

## Requirements

- Functional: `lessonDayFromDate(now)` → Mon=1 … Sun=7.
- Functional: `lessonsToday(lessons, now)` lọc `day === today`, drop `cancelled`, sort `time`.
- Functional: `atRiskRows(students, lessons, now)` — student có ≥1 `absent` hoặc ≥1 `upcoming` với `day < todayDay`.
- Non-functional: pure; `now` default `new Date()`; unit-testable không provider.

## Architecture

```
Date (inject) → lessonDayFromDate → lessonsToday / atRiskRows
                     ↓
              Lesson[] + Student[] from useData()  (phase 2 wires)
```

Missed check-in dùng weekday-model (không calendar date trên row). Thứ Hai: không có `day < 1` → 0 missed tuần mới — đúng với model tuần. Sunday today=7: upcoming day 1–6 là missed.

1:2 = hai lesson rows / hai enrollment → hai student có thể cùng at-risk độc lập.

## Related Code Files

- Create: `apps/web/src/lib/dashboard-from-kernel.ts`
- Create: `apps/web/src/lib/dashboard-from-kernel.test.ts`
- Modify: none

## Tests Before

Write `dashboard-from-kernel.test.ts` trước implementation:

1. `lessonDayFromDate`: Monday 2026-08-17 → 1; Sunday 2026-08-23 → 7; Wednesday 2026-08-19 → 3. Construct `Date` bằng local y/m/d (không `toISOString()` cho local weekday).
2. `lessonsToday`: chỉ rows `day === today`; cancelled loại; upcoming+completed+absent cùng ngày giữ; sort time; empty → `[]`.
3. `atRiskRows`: absent → reason `absent`; upcoming day < today → `missed-check-in`; upcoming day === today không missed; completed không risk; cancelled không risk; student không lesson không risk; student vừa absent vừa missed gộp reasons, không duplicate student.
4. Không đọc `student.atRisk` hay `tags`. Fixture `atRisk: true` + tags nợ vẫn **không** vào list nếu không có absent/missed.

## Implementation Steps

1. Viết test file đỏ (import symbols sẽ có).
2. Implement helper:
   - `lessonDayFromDate(now = new Date())`: `const d = now.getDay(); return d === 0 ? 7 : d;`
   - `lessonsToday`: filter + sort.
   - `atRiskRows`: group lessons by `sid`; collect reasons; map student ids giữ thứ tự `students` array.
3. Export types `DashboardRiskReason = "absent" | "missed-check-in"` và `DashboardRiskRow = { student: Student; reasons: DashboardRiskReason[] }`.
4. Chạy focused test đến xanh.

## Tests After

Không behavior mới ngoài 4 nhóm trên. Nếu helper format date/greeting, để phase 2 (UI). Phase 1 không format tiếng Việt.

## Todo

- [x] Test weekday Mon=1 / Sun=7 với Date local
- [x] Test lessonsToday filter/sort/cancel
- [x] Test at-risk absent + missed + negatives
- [x] Implement `dashboard-from-kernel.ts`
- [x] Focused test xanh

## Success Criteria

- [x] Test file không import React/router/provider
- [x] Mọi case trên pass
- [x] Không sửa schema, snapshot, `mapStudents`

## Regression Gate

```bash
pnpm --filter web test -- src/lib/dashboard-from-kernel.test.ts
```

## Risk Assessment

- **Day 0 vs 1:** source mixed. Canary: dashboard Monday === schedule **cột T2** (`i=0`, `l.day===1`), không highlight `todayIdx=1`. Response: sửa selector, **cấm** kéo về `day===2`.
- **Week wrap:** Monday missed=0. Accept — không wrap Sunday. Revisit nếu #55 thêm date.
- **`absent`:** kernel 0 write path (`kernel.ts` chỉ completed/cancelled). Test absent vẫn có; live list = missed-check-in.
- **Multi-week same weekday:** 12× `day=1` upcoming → 12 today cards. Documented weekday-model, không date filter.

## Security Considerations

Helper thuần read-only. Check-in mutation ở phase 2: today filter **không** phải authz — server vẫn nhận mọi upcoming cùng org (pre-existing). Không leak cross-org (snapshot đã org-scoped).
