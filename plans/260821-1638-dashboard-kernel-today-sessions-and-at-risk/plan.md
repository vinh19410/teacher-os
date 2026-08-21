---
title: "Dashboard kernel — buổi hôm nay + học viên rủi ro"
description: "Dashboard đọc buổi hôm nay và học viên rủi ro (vắng/miss check-in) từ kernel snapshot; bỏ KPI/con số hardcode; data sống sau hard reload."
status: completed
priority: P1
effort: "4h"
issue: 57
branch: feat/57-dashboard-kernel-today-at-risk
tags: [feature, frontend, dashboard, kernel]
blockedBy: []
blocks: []
created: 2026-08-21
---

# Dashboard kernel — buổi hôm nay + học viên rủi ro

## Overview

Issue [#57](https://github.com/vinh19410/teacher-os/issues/57) (M1): dashboard pilot view phải đọc **buổi hôm nay** và **học viên rủi ro (vắng / miss check-in)** từ kernel snapshot đã persist. Bỏ toàn bộ KPI/con số hardcode. Hard reload giữ data vì snapshot đã là source of truth — không API dashboard mới, không migration.

Route: **feature** via `/ak:cook --tdd --auto`. Ship mode: **beta**.

## Brainstorm contract

- **Outcome:** Giáo viên mở `/dashboard` thấy buổi hôm nay và học viên rủi ro từ data kernel thật; 0 con số/KPI hardcode; reload F5 không đưa mock trở lại.
- **Constraints:** Tái dùng snapshot + `useData()`; derive thuần trên client; clock injectable cho test; giữ check-in `useDirectKernelAction`; không đụng invoice/assignment create (M2); không đổi schema `lesson.day`.
- **Non-goals:** Nav tuần `/schedule` (M1 item khác); StatCard học phí; CTA invoice/assignment; `atRisk` trên class detail; generate lesson từ lịch lớp (#55).
- **Acceptance:** xem Success Criteria dưới.

## Scope Challenge

- Existing code: `apps/web/src/routes/_auth/dashboard.tsx` UI + check-in; kernel snapshot/`mapLessons`; `mapStudents` luôn `atRisk: false`; session user name ở sidebar; weekday 0–6 trên class schedule contract; `schedule.tsx` lọc `l.day === i + 1` (Mon=1).
- Requested scope: dashboard kernel-backed today + at-risk; 0 hardcoded KPI; reload consistency.
- Complexity: ~5 files, 1 helper thuần, 0 class/service mới, 2 phases.
- Selected mode: **HOLD SCOPE**. Planning depth: **fast + --tdd** (unknowns đã resolve bằng source).

## Verified Evidence

| Claim | Evidence |
| --- | --- |
| Dashboard lọc `l.day === 2` và greeting/KPI hardcode | `apps/web/src/routes/_auth/dashboard.tsx:21-27` `31-33` `95-156` |
| `atRisk` kernel luôn `false`; `tags` luôn `[]` | `apps/web/src/lib/repos/students.ts:73-76` |
| Lesson không có calendar date — chỉ `day: integer` | `packages/db/src/schema/lesson.ts:29` `packages/api/src/contracts.ts:270` |
| Class schedule days: 0=Mon…6=Sun | `packages/api/src/contracts.ts:47-48` |
| Schedule UI lọc `l.day === i + 1` (Mon=1) | `apps/web/src/routes/_auth/schedule.tsx:54-56` |
| Snapshot remap lessons.day raw | `apps/server/src/routes/snapshot.ts:239` |
| Check-in dashboard contract lock | `apps/web/src/lib/kernel-runtime.contract.test.ts:160-164` |
| Session user name sẵn trong `_auth` | `apps/web/src/components/layout/sidebar.tsx:194-204` `apps/web/src/routes/_auth/route.tsx:20` |
| Clock local-calendar pattern | `apps/web/src/lib/date-input.ts:31-47` |
| #55 (tạo buổi từ lịch) OPEN, không block đọc snapshot hiện có | GitHub issue 55 `in progress` |

## Design Decision

**Client-side selectors từ snapshot hiện có.** Không endpoint `/api/dashboard`. Không cột `at_risk`. Không calendar date trên lesson (thuộc #55 nếu cần).

1. **Today:** `lesson.day === lessonDayFromDate(now)` với Mon=1…Sun=7 — **cùng convention với `schedule.tsx`**, không phải 0–6 của class-create. Clock `now` injectable.
2. **At-risk:** học viên có ≥1 lesson `status==="absent"` **hoặc** ≥1 `status==="upcoming"` với `day < todayDay` (missed check-in trong tuần weekday-model). Cancelled/completed không tính. Không dùng tag `"nợ học phí"` / `"sắp hết buổi"` (M2, kernel không map tags).
3. **KPI hardcode:** xóa StatCard 7.5/6.2tr/2.0tr/2 và list “Cần xử lý” hardcode (Quốc Bảo/Minh Anh/INV-084). Không thay bằng tuition derive (M2). Greeting lấy `session.data.user.name`; lead lấy ngày local + số buổi hôm nay.
4. **Reload:** không thêm persistence. Snapshot query đã hydrate `useData()`. Empty org → empty states, không mock.

Load-bearing: `lesson.day` 1–7 khớp **filter cột** `schedule.tsx` (`l.day === i + 1`). Canary: list Monday === cột T2 (`i=0`, `day===1`) — **không** so highlight `todayIdx = 1` (hardcode Thứ Ba, out of scope). Signal vỡ thật: cùng `day` hiện ở schedule cột T2 nhưng dashboard Monday trống → sửa selector, không migration, không kéo helper về `day===2`.

Không blockedBy #55: org chưa có lesson writer production (`lesson.ts` "No create path yet") → empty đúng cho #57. M1 E2E "tạo lớp → thấy buổi" là evidence **chung** #55+#57, không gộp writer vào PR dashboard. Multi-week cùng weekday (12× `day=1`) hiện tất cả — weekday-model trung thực; date column là #55 nếu schema đổi, không phải #57.

`absent`: kernel **0 write path** (chỉ upcoming→completed|cancelled). Giữ nhánh helper cho status nếu xuất hiện; live at-risk = missed-check-in. Không thêm mark-absent. Thứ Hai missed=0 (không wrap `day=7`).

## Phases

| Phase | Name | Status | Dependencies |
| --- | --- | --- | --- |
| 1 | [Selectors today + at-risk (TDD)](./phase-01-start.md) | Pending | None |
| 2 | [Dashboard UI + KPI removal](./phase-02-dashboard-ui-and-hardcoded-kpi-removal.md) | Pending | Phase 1 |

Fewer than 3 phases: skip runtime task hydration.

## File Ownership

| File | Action | Owner |
| --- | --- | --- |
| `apps/web/src/lib/dashboard-from-kernel.ts` | Create | Phase 1 |
| `apps/web/src/lib/dashboard-from-kernel.test.ts` | Create | Phase 1 |
| `apps/web/src/routes/_auth/dashboard.tsx` | Modify | Phase 2 |
| `apps/web/src/lib/kernel-runtime.contract.test.ts` | Modify | Phase 2 |

No parallel writes. Không sửa `mapStudents` / schema / server routes.

## Success Criteria

- [ ] `/dashboard` “Lịch hôm nay” = lessons kernel có `day` = weekday hôm nay (Mon=1), bỏ `day === 2` cứng; cancelled ẩn; sort theo `time`.
- [ ] Check-in trên card buổi upcoming vẫn `useDirectKernelAction` + disable pending (contract hiện có giữ).
- [ ] “Học viên rủi ro” derive từ absent / missed check-in; không đọc `s.atRisk` mock hay tag học phí; không cột Nợ/invoice.
- [ ] 0 literal KPI/tên/số hardcode trong pilot view: không “cô Lan”, “Thứ Ba, 19/08”, “19–25/08”, “7.5”, “6.2tr”, “2.0tr”, “Quốc Bảo”, “Minh Anh”, “INV-084”.
- [ ] Greeting dùng tên session; lead dùng ngày local + count buổi hôm nay (kể cả 0).
- [ ] Empty states khi 0 buổi / 0 rủi ro — không fallback mock.
- [ ] Hard reload: cùng snapshot → cùng list (không local-only mock).
- [ ] Focused tests + `kernel-runtime.contract.test.ts` + `pnpm --filter web test` + `pnpm --filter web check-types`.

## Validation Matrix

| Level | Command | Covers |
| --- | --- | --- |
| Selector unit | `pnpm --filter web test -- src/lib/dashboard-from-kernel.test.ts` | today / at-risk / clock / cancelled |
| Source contract | `pnpm --filter web test -- src/lib/kernel-runtime.contract.test.ts` | no hardcoded KPI; check-in lock |
| Web suite | `pnpm --filter web test` | no mapping regression |
| Types | `pnpm --filter web check-types` | helper + route typing |

## Out of scope

- `/schedule` week nav / `todayIdx = 1` / `dayDates` mock
- Invoice/assignment “Cần xử lý”
- Persist `atRisk` lên student row
- Calendar date column trên `lesson`

## Open questions

None — day index, at-risk rule, KPI cut đã chốt từ issue + source.

## Validation Log

### Session 1 — 2026-08-21
**Trigger:** `/ak:vibe --ship --beta --advice` autonomous; `/ak:plan validate` + verification Light tier.
**Questions asked:** 0 live (autonomous pipeline; decisions = recommended options from issue + source + kongming GO).

#### Verification Results
- **Tier:** Light (2 phases, Fact Checker)
- **Claims checked:** 14
- **Verified:** 12 | **Failed:** 2 (cite range only) | **Unverified:** 0
- Failures: Phase 2 `sidebar.tsx:188-204` overlap signature; `#55` label `in progress` vs gh `state: OPEN` (issue still OPEN). Neither changes design.

#### Confirmed Decisions
- Weekday today Mon=1…Sun=7 khớp filter cột schedule, không `todayIdx`.
- At-risk live = missed-check-in; giữ nhánh `absent` nhưng kernel 0 write path.
- Xóa StatCard + Cần xử lý + SectionLabel `Tuần này · 19–25/08`; không tuition derive.
- Không blockedBy #55; empty org = đúng.
- Greeting `user.name || "Giáo viên"`; today filter = UX, không authz check-in.

#### Action Items
- [x] Canary vs cột T2, không `todayIdx`
- [x] Ban-list KPI mở rộng
- [x] Empty rủi ro = paragraph
- [x] Bỏ cột Nợ `"—"` và `onClick` no-op

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-start.md, phase-02-dashboard-ui-and-hardcoded-kpi-removal.md
- Decision deltas checked: 6
- Reconciled stale references: canary, absent write path, ban-list, layout
- Unresolved contradictions: 0

## Red Team Review

### Session — 2026-08-21
**Findings:** 16 collected, 8 unique after dedupe (5 accepted, 11 rejected)
**Severity breakdown:** 0 Critical accepted, 2 High accepted (wording/test), 3 Medium accepted
**Kongming:** GO. Reject calendar-date, blockedBy #55, cut missed-check-in, persist atRisk.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Weekday ≠ calendar "hôm nay" / block #55 | Critical | Reject | — user/issue scope; empty đúng; multi-week = weekday-model trung thực |
| 2 | Cắt reason `absent` / mark-absent API | High | Reject | document 0 write path; giữ nhánh helper |
| 3 | Cấm missed-check-in Sunday-all | High | Reject | missed **là** live signal issue yêu cầu |
| 4 | Canary vs `todayIdx=1` | High | Accept | plan Design Decision + phase 1 risk |
| 5 | Ban-list hẹp / wrapper `19–25/08` | High | Accept | phase 2 tests + steps |
| 6 | Contract leftover `atRisk`/`fmtK` | High | Accept | phase 2 `not.toMatch` |
| 7 | Today filter = authz | High | Accept (wording) | phase 1/2 security: UX only |
| 8 | Unknown coerce → risk | Medium | Reject | YAGNI; weird-status test-only |
| 9 | PII truncate name | Medium | Reject | reuse sidebar fallback, no new helper |
| 10 | `onClick` no-op + empty DataTable | Medium | Accept | phase 2 |
| 11 | Cột Nợ luôn `"—"` = fake KPI 0 | Medium | Accept | drop cột Nợ |

Evidence-free auto-reject: none (all had file:line).
Reports: `reports/red-team-security-adversary.md`, `reports/red-team-assumption-destroyer.md`.
