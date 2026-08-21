# Code Review — pending — issue 57 dashboard kernel today + at-risk

**Date:** 2026-08-21
**Mode:** pending (unstaged + untracked product code)
**Worktree:** `feat/57-dashboard-kernel-today-at-risk` @ `2b5de5a` (origin/develop, includes #71/#55)
**Plan:** `plans/260821-1638-dashboard-kernel-today-sessions-and-at-risk/`
**Gates (CWD = worktree, session này):**
- `pnpm --filter web exec vitest run src/lib/dashboard-from-kernel.test.ts src/lib/kernel-runtime.contract.test.ts` → **33/33 PASS**
- `biome check` 4 file product → clean
- `apps/web` `tsc --noEmit` → 0 err
- `pnpm --filter web test` / `check-types` (vite build): không re-run session này; tester trước **197/197** + check-types PASS

## Code Review Summary

### Scope
- Files:
  - `apps/web/src/lib/dashboard-from-kernel.ts` (untracked, 74 LOC)
  - `apps/web/src/lib/dashboard-from-kernel.test.ts` (untracked, 183 LOC)
  - `apps/web/src/routes/_auth/dashboard.tsx` (unstaged, 139 LOC, net −62 vs HEAD)
  - `apps/web/src/lib/kernel-runtime.contract.test.ts` (unstaged, +25)
- LOC: tracked `+129 / −166`; untracked helper+test `+257`.
- Focus: pending product only. `plans/` đọc để spec-check, không audit docs.
- Scout findings: helper chỉ dashboard consume; `#55` generate `day = scheduleDay + 1` (Mon=1) khớp selector; `mapLessons` drop enrollment thiếu; check-in body `{}` + WHERE `status=upcoming` không đụng. Prior Important (hooks sau throw) **đã fix**.

### Overall Assessment
Spec **PASS**. Selector Mon=1 khớp cột schedule T2 (`l.day === i + 1`). At-risk chỉ `absent` / `upcoming && day < today`. KPI/tên mock cắt sạch. Check-in lock nguyên. Empty states không mock.

Prior Important (`useData` / `useDirectKernelAction` sau `throw redirect`) **verified fixed** tại `dashboard.tsx:33-38`: cả hai hook chạy trước guard. Happy-path + session-drop-while-mounted không còn lệch số hook.

Không Critical/Important mới. Residual weekday-model (12× `day=1` = 12 card; mid-week mọi upcoming weekday trước = missed) là hành vi plan + kongming đã chốt — **không** demand calendar date / blockedBy #55.

**Score: 8.5/10**

### Mandatory checks

| # | Check | Verdict | Evidence |
|---|-------|---------|----------|
| (a) | Every AC met | **PASS** | bảng spec dưới |
| (b) | No check-in / kernel mapping regression | **PASS** | `dashboard.tsx:87-96` cùng `void run(l.id, { type: "check-in", lessonId: l.id }, "Đã điểm danh.")` + `disabled={busy \|\| isPending(l.id)}`. `repos/kernel.ts:80-83` body `{}`. Server `kernel.ts:431-451` WHERE `status=upcoming` không đụng. |
| (c) | No public contract break | **PASS** | 0 file `packages/api`, `packages/db`, server routes. Helper nội bộ web. |
| (d) | Matches existing patterns | **PASS** | helper thuần + clock inject như `date-input.ts`; contract source-parse như enroll lock; greeting `user.name \|\| "Giáo viên"` copy sidebar. |
| (e) | No new lint/type issues | **PASS** | biome 4 file clean; `tsc --noEmit` 0. Không `any` / ts-ignore mới. |

### Spec compliance (plan.md Success Criteria)

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| 1 | Lịch hôm nay = `day` weekday hôm nay Mon=1; cancelled ẩn; sort `time` | PASS | `dashboard-from-kernel.ts:12-17`; test Wed keep early/absent/late, drop cancel+tue |
| 2 | Check-in `useDirectKernelAction` + disable pending | PASS | `dashboard.tsx:35,87-99`; contract `kernel-runtime.contract.test.ts:165-167,185-189` |
| 3 | At-risk = absent / missed-check-in; không `s.atRisk` / tag / invoice | PASS | `dashboard-from-kernel.ts:43-47`; test ignore `atRisk:true` + tags nợ; UI không `fmtK`/`data.invoices` |
| 4 | 0 literal KPI/tên hardcode ban-list | PASS | grep dashboard source 0 match; contract 15 `not.toMatch` |
| 5 | Greeting session name; lead ngày local + count (kể cả 0) | PASS | `dashboard.tsx:40,47-49`; `formatDashboardLead` `getDate`/`getMonth` local; test `17/08` + `Hôm nay có 0 buổi học` |
| 6 | Empty 0 buổi / 0 rủi ro, không mock names | PASS | `dashboard.tsx:61-64,107-110` |
| 7 | Hard reload = snapshot, không local mock | PASS | không localStorage; `useData()` snapshot; StatCard/Cần xử lý xóa |
| 8 | Focused tests + contract + types | PASS | 33 focused session này; tester 197 web. tsc 0 |
| 9 | Không schema/API | PASS | 4 file web only |
| 10 | Clock injectable; helper không React | PASS | test file 0 import React/router/provider |

Extras vs plan: `formatDashboardLead` trong helper — phase 2 cho phép. `throw redirect` session missing — plan yêu cầu invariant sidebar. Không scope creep invoice/assignment/`mapStudents`/schedule nav.

Plan.md YAML `status: pending` + AC checkbox `[ ]` dù phase todo `[x]`. Lead/planner tick — reviewer không sửa plan.

### Critical Issues
Không.

Không endpoint mới, không secret, không đổi schema/authz. Today filter = UX (plan Security). Check-in body vẫn `{}`. `user.name` vào text node — React escape, cùng sidebar PII.

Pre-Landing checklist Pass 1 (injection / race / authz / XSS / CSRF): không finding.

**Prior Important — verified fixed**

`dashboard.tsx:33-38` — `useRouteContext` → `useData()` → `useDirectKernelAction()` → **rồi mới** `if (!session?.data?.user) throw redirect`. Offset: `useData` 1024 < `useDirectKernelAction` 1069 < `throw redirect` 1125. Re-render mất session: 3 hook rồi throw, số hook ổn định. Sidebar (`sidebar.tsx:194-201`) cùng thứ tự (hooks rồi throw). Không regress React "Rendered fewer hooks than expected".

Contract **không** khóa thứ tự này — xem Suggestion 3.

### High Priority
Không.

### Medium Priority
Không blocker. Test-lock gaps dưới Suggestion — không làm sai behavior hiện tại.

### Low Priority / Suggestions

1. **Suggestion — `dashboard.tsx:42-68`** `today.length` đếm cả lesson `studentById` miss. Lead "Hôm nay có N" có thể > số card (`return null`). Snapshot bình thường không xảy ra: `mapLessons` drop enrollment thiếu (`lessons.ts:46-49`); student delete cascade enrollment+lesson. Defense-in-depth: derive `visible` rồi lead từ `visible.length`. Nếu **mọi** sid miss, empty copy cũng không hiện (`today.length === 0` false, map toàn `null`).

2. **Suggestion — `dashboard-from-kernel.test.ts:176-182`** `formatDashboardLead` không khóa weekday. Node ICU hiện `"Thứ Hai, 17/08 · Hôm nay có 0 buổi học"`. Test chỉ `17/08` + count. Hardcode `"Thứ Hai"` trong helper (sai clock) vẫn xanh nếu giữ `17/08`. Siết `toBe("Thứ Hai, 17/08 · Hôm nay có 0 buổi học")`.

3. **Suggestion — `kernel-runtime.contract.test.ts:160-183`** Ban-list chặn string cũ; **không** khóa `formatDashboardLead(` / `session.data.user` / hook-before-throw. Greeting inline `"Chào buổi sáng, ${…}"` không qua helper, hoặc kéo `useData` xuống dưới throw, vẫn xanh nếu tránh ban-list. Siết:
   ```ts
   expect(dashboard).toMatch(/formatDashboardLead\(/);
   expect(dashboard).toMatch(/session\.data\.user/);
   expect(dashboard).toMatch(
     /useData\(\)[\s\S]*useDirectKernelAction\(\)[\s\S]*throw redirect/,
   );
   expect(dashboard).not.toMatch(/StatCard|Cần xử lý/);
   ```

4. **Suggestion — không render test `dashboard.tsx`.** Empty copy, skip missing student, greeting fallback `"Giáo viên"` chỉ covered bằng source-parse. Pattern repo (contract lock) chấp nhận được cho PR này; regress UI copy không đụng ban-list sẽ lọt.

### Edge Cases Found by Scout

- **Hooks-after-throw:** prior Important. **Fixed.** Verified `dashboard.tsx:33-38`.
- **Canary Mon=1 === schedule cột T2:** `dayNames[0]="T2"` (`mock-data.ts:156`); schedule `l.day === i + 1` (`schedule.tsx:55`). Helper `getDay()===0 ? 7 : getDay()` khớp. **Không** dùng `todayIdx = 1`.
- **#55 rebase (không demand date column):** `generateScheduleLessons` ghi `day: (parsed.days[i] ?? 0) + 1` (`kernel.ts:77-96`); edit schema `day` 1–7 (`contracts.ts:158-167`). Selector và writer cùng convention. Monday dashboard === cột T2, không trống vì off-by-one.
- **Weekday-model (accepted, không block):** 12 upcoming `day=1` → 12 card Monday (test khóa). Wed: mọi upcoming Mon/Tue = missed, gồm occurrence "tương lai" vì không có calendar date. Plan + kongming GO. Sau #55 sinh series, UX này **là** hành vi đã chốt.
- **Absent + Điểm danh:** today giữ absent (test); button hiện vì `status !== "completed"`. Server 409 nếu không upcoming (`kernel.ts:431-432`). Plan: keep parity. 409 path `heal-409` toast + refresh (`kernel-outcome.ts:31-37`) — không crash, không false "không lưu được".
- **Monday wrap:** `day < today` không wrap CN. Test khóa. Đúng plan.
- **`mapLessons` coerce unknown status → `upcoming`:** status lạ + `day < today` → missed. Plan red-team reject (YAGNI). Pre-existing coerce.
- **Check-in concurrency:** server WHERE `status=upcoming`. Client `busy` global disable. Không race mới.
- **Orphan sid:** helper at-risk chỉ student trong mảng; UI skip card. FK cascade.
- **Dependents helper:** chỉ `dashboard.tsx` + 2 test. Không leak sang schedule/class-detail `s.atRisk` (M2 / non-goal).
- **DataTable index keys / no onClick:** pre-existing component; bỏ `onClick` no-op đúng red-team — row không còn fake-interactive.
- **TIME_REGEX HH:MM:** `localeCompare` sort an toàn (zero-padded). `#55` create/edit bắt `TIME_REGEX`.

Verified: check-in mapping, emptyKernel collections, `useDirectKernelAction` signature, không mutation input (`.slice().sort` / filter copy).

### Positive Observations
Chỉ để calibrate risk, không phải khen:
- `now` một lần/render, truyền cả `lessonsToday` và `atRiskRows` — tránh lệch ngày lúc nửa đêm.
- `.slice()` trước `sort` — không mutate snapshot array.
- At-risk iterate `students` (ổn định thứ tự), reasons `Set` rồi emit `absent` trước `missed-check-in`.
- Cắt cột Nợ + `onClick` no-op đúng red-team accept.
- Hook order giờ khớp sidebar.

### Recommended Actions
1. (Optional, trước merge) Siết contract: `formatDashboardLead`, `session.data.user`, hook-before-throw, `StatCard|Cần xử lý`.
2. (Optional) Siết `formatDashboardLead` test khóa weekday vi-VN.
3. Lead: tick plan.md AC `[ ]` → `[x]`; status YAML `pending` → done. Reviewer không sửa plan.
4. Không block ship vì weekday-model / #55 series — đã reject ở plan gate.

### Metrics
- Type Coverage: `tsc --noEmit` 0 err; 0 `any` mới
- Test Coverage: +10 selector unit + 1 contract; focused 33/33 session này; web suite 197/197 (tester, không re-run)
- Linting Issues: 0 (`biome check` 4 files)

### Pre-Landing Review: 0 critical, 0 important, 4 informational

**CRITICAL** (blocking):
Không.

**Issues** (non-blocking):
- [`apps/web/src/routes/_auth/dashboard.tsx:42`](apps/web/src/routes/_auth/dashboard.tsx) Lead count từ `today.length` trước filter `studentById`
  Fix: count sau khi drop missing student
- [`apps/web/src/lib/dashboard-from-kernel.test.ts:176`](apps/web/src/lib/dashboard-from-kernel.test.ts) Lead test không khóa weekday
  Fix: `toBe("Thứ Hai, 17/08 · Hôm nay có 0 buổi học")`
- [`apps/web/src/lib/kernel-runtime.contract.test.ts:160`](apps/web/src/lib/kernel-runtime.contract.test.ts) Contract không khóa helper/session/hook order / StatCard
  Fix: thêm `toMatch` / `not.toMatch` như Suggestion 3
- Không RTL cho empty copy / greeting fallback — gap test, không defect runtime

Suppressions: weekday-model flood / absent button 409 / no calendar date / no blockedBy #55 — plan + user gate, không reverse. Style/format: biome clean, bỏ.

### Plan follow-ups
- Phase 1 todos: complete (helper + unit).
- Phase 2 todos: complete (UI rewire + contract + KPI cut).
- plan.md Success Criteria vẫn `[ ]` + `status: pending` — planner tick.
- Recommended next: optional test locks, rồi ship beta. Không phase mới.

### Unresolved Questions
Không. `pnpm --filter web test` full suite không re-run session này; dựa tester 197/197 + focused 33/33 tươi.

---

Status: DONE
Summary: AC issue 57 đạt. Prior Important hooks-after-throw verified fixed (`useData` + `useDirectKernelAction` trước `throw redirect`). 0 Critical/Important mới. Score 8.5/10. Còn test-lock Suggestions, không block merge.
Concerns/Blockers: none
