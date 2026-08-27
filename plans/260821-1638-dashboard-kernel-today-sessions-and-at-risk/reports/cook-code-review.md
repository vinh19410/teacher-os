# Code Review — issue 57 dashboard kernel today + at-risk

**Date:** 2026-08-21
**Mode:** pending worktree `feat/57-dashboard-kernel-today-at-risk` @ `771efac` (implement chưa commit)
**Plan:** `plans/260821-1638-dashboard-kernel-today-sessions-and-at-risk/`
**Gates (CWD = worktree):**
- `pnpm --filter web test` → 20 files / **197 passed** (gồm `dashboard-from-kernel.test.ts` 10 + `kernel-runtime.contract.test.ts` 23)
- `apps/web` `tsc --noEmit` → 0 err
- `biome check` 4 file source → clean
- `pnpm --filter web check-types` (`vite build`) **không** chạy session này; type gate = `tsc --noEmit`

## Code Review Summary

### Scope
- Files:
  - `apps/web/src/lib/dashboard-from-kernel.ts` (create, 74 LOC)
  - `apps/web/src/lib/dashboard-from-kernel.test.ts` (create, 183 LOC)
  - `apps/web/src/routes/_auth/dashboard.tsx` (`+` UI rewire, net `-62` vs HEAD)
  - `apps/web/src/lib/kernel-runtime.contract.test.ts` (`+25` ban-list + helper lock)
- LOC: tracked diff `+130 / -167`; untracked helper+test `+257`. Net ~+220.
- Focus: client selectors today/at-risk + KPI hardcode cut. Không schema/API.
- Scout findings: helper chỉ dashboard consume; `mapLessons` passthrough `day`; check-in bus/body không đụng; `mapStudents.atRisk` vẫn `false` nhưng UI không còn đọc.

### Overall Assessment
Spec **PASS**. Selector Mon=1 khớp cột schedule T2 (`l.day === i + 1`), không class-create 0–6. At-risk chỉ `absent` / `upcoming && day < today`. Check-in lock nguyên. 0 KPI/tên mock trong dashboard source. Empty states không mock.

1 defect mới: hooks sau `throw redirect` — sidebar an toàn (hooks trước throw), dashboard không. Happy-path `_auth` beforeLoad không kích; 401/session drop khi route còn mount → React hooks error thay vì redirect sạch.

Weekday-model (12× `day=1` = 12 card hôm nay; Wed = mọi upcoming Mon/Tue là missed) **không** phải bug implement — plan + kongming GO + test khóa hành vi này. Residual khi #55 sinh series.

**Score: 8.0/10**

### Mandatory checks

| # | Check | Verdict | Evidence |
|---|-------|---------|----------|
| (a) | Every AC met | **PASS** | bảng spec dưới |
| (b) | No check-in / kernel mapping regression | **PASS** | `dashboard.tsx:87-99` cùng `void run(l.id, { type: "check-in", lessonId: l.id }, "Đã điểm danh.")` + `disabled={busy \|\| isPending(l.id)}`. `kernel.ts:80-83` body `{}` không đổi. Server matrix upcoming→completed (`kernel.ts:307-355`) không đụng. |
| (c) | No public contract break | **PASS** | 0 file `packages/api`, `packages/db`, server routes. Helper nội bộ web. UI KPI cut = scope issue. |
| (d) | Matches existing patterns | **PASS** | helper thuần + clock inject như `date-input.ts`; contract source-parse như enroll lock; greeting fallback `user.name \|\| "Giáo viên"` copy sidebar. |
| (e) | No new lint/type issues | **PASS** | biome 4 file clean; `tsc --noEmit` 0. Không `any` / ts-ignore mới. |

### Spec compliance (plan.md Success Criteria)

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| 1 | Lịch hôm nay = `day` weekday hôm nay Mon=1; cancelled ẩn; sort `time` | PASS | `dashboard-from-kernel.ts:12-17`; test Wed keep early/absent/late, drop cancel+tue |
| 2 | Check-in `useDirectKernelAction` + disable pending | PASS | `dashboard.tsx:40,87-99`; contract `kernel-runtime.contract.test.ts:165-167,185-189` |
| 3 | At-risk = absent / missed-check-in; không `s.atRisk` / tag / invoice | PASS | `dashboard-from-kernel.ts:43-47`; test ignore `atRisk:true` + tags nợ; UI không `fmtK`/`data.invoices` |
| 4 | 0 literal KPI/tên hardcode ban-list | PASS | grep dashboard source; contract `not.toMatch` cô Lan / Thứ Ba, 19/08 / 19–25/08 / Tuần này / 7.5 / 6.2tr / 2.0tr / Quốc Bảo / Minh Anh / INV-084 / `l.day === 2` / `s.atRisk` / nợ học phí / `fmtK` / `data.invoices` |
| 5 | Greeting session name; lead ngày local + count (kể cả 0) | PASS | `dashboard.tsx:38,47-49`; `formatDashboardLead` `getDate`/`getMonth` local; test `17/08` + `Hôm nay có 0 buổi học` |
| 6 | Empty 0 buổi / 0 rủi ro, không mock names | PASS | `dashboard.tsx:61-64,107-110` |
| 7 | Hard reload = snapshot, không local mock | PASS | không localStorage; `useData()` snapshot; StatCard/Cần xử lý xóa |
| 8 | Focused tests + contract + web test + types | PASS | 197 web tests; tsc 0. `check-types` vite build không chạy session này |
| 9 | Không schema/API | PASS | 4 file web only |
| 10 | Clock injectable; helper không React | PASS | test file 0 import React/router/provider |

Extras vs plan: `formatDashboardLead` trong helper — phase 2 cho phép. `throw redirect` session missing — plan yêu cầu invariant sidebar. Không scope creep invoice/assignment/`mapStudents`/schedule nav.

Plan.md YAML/status + AC checkbox vẫn `pending`/`[ ]` trong khi phase todo `[x]`. Lead/planner đánh dấu — reviewer không sửa plan.

### Critical Issues
Không.

Không endpoint mới, không secret, không đổi schema/authz. Today filter = UX (plan Security). Check-in body vẫn `{}`. `user.name` vào text node — React escape, cùng sidebar PII.

Pre-Landing checklist Pass 1 (injection / race / authz / XSS / CSRF): không finding.

### Important
1. **`dashboard.tsx:34-40` — hooks sau conditional `throw redirect`.** `useRouteContext` rồi throw nếu thiếu user, **sau đó** `useData` + `useDirectKernelAction`. Sidebar (`sidebar.tsx:194-201`) gọi hết hook **trước** throw → số hook ổn định. Dashboard: first paint có session = 4 hook; re-render session mất (401/sign-out mà `_auth` layout chưa unmount) = 1 hook rồi throw → React "Rendered fewer hooks than expected", chặn redirect.

   First paint an toàn vì `_auth/route.tsx:7-20` beforeLoad đã redirect khi `!session.data`. Lỗi chỉ khi context user biến mất **trên route đang mount**.

   Fix:
   ```tsx
   function DashboardRoute() {
     const { session } = useRouteContext({ from: "/_auth" });
     const { data, studentById } = useData();
     const { run, isPending, busy } = useDirectKernelAction();
     if (!session?.data?.user) {
       throw redirect({ to: "/login" });
     }
     const displayName = session.data.user.name || "Giáo viên";
     // ...
   }
   ```

### Suggestions
1. **`dashboard.tsx:42-68` — `today.length` đếm cả lesson `studentById` miss.** Lead "Hôm nay có N" có thể > số card (return `null`). Snapshot bình thường không xảy ra: `mapLessons` drop enrollment thiếu (`lessons.ts:46-49`); student delete cascade enrollment+lesson. Defense-in-depth: count sau filter student, hoặc derive `visible` rồi lead từ `visible.length`.

2. **`dashboard-from-kernel.test.ts:176-182` — `formatDashboardLead` không khóa weekday.** Node ICU hiện `"Thứ Hai, 17/08 · Hôm nay có 0 buổi học"`. Test chỉ `17/08` + count. Hardcode `"Thứ Hai"` trong helper (sai clock) vẫn xanh nếu giữ `17/08`. Siết `toBe("Thứ Hai, 17/08 · Hôm nay có 0 buổi học")`.

3. **Contract không khóa `formatDashboardLead` / `session.data.user`.** Ban-list chặn string cũ; greeting `"Chào buổi sáng, cô Hoa"` hoặc lead inline không qua helper vẫn xanh nếu tránh ban-list. Implementation đúng. Siết: `toMatch(/formatDashboardLead\(/)` + `session\.data\.user`.

### Edge Cases Found by Scout
- **Canary Mon=1 === schedule cột T2:** `dayNames[0]="T2"` (`mock-data.ts:156`); schedule `l.day === i + 1` (`schedule.tsx:55`); class/lesson-modal `T{l.day + 1}` với day=1 → T2. Helper `getDay()===0 ? 7 : getDay()` khớp. **Không** dùng `todayIdx = 1` (hardcode Thứ Ba, out of scope).
- **Class-create `days` 0=Mon** (`contracts.ts:47-48`) ≠ lesson display 1–7. Snapshot `day: row.day` raw (`snapshot.ts:239`, `lessons.ts:53`). #55 phải persist `scheduleDay + 1` (plan #55 đã ghi). Nếu copy 0–6: schedule+dashboard today trống, at-risk `day=0 < today` nhầm trên Tue+.
- **Weekday-model (accepted, không block):** 12 upcoming `day=1` → 12 card Monday (test khóa). Wed: mọi upcoming Mon/Tue = missed, gồm occurrence tương lai. Không calendar date trên wire (`lesson.ts:29`, snapshot không `createdAt`). Plan reject blockedBy #55 / date column. Khi #55 sinh series, UX này là hành vi đã chốt — không phải regress selector về `day===2`.
- **Absent + Điểm danh:** today giữ absent (test); button hiện vì `status !== "completed"`. Server 409 nếu không upcoming (`kernel.ts:330-332`). Plan: keep parity, không status UX mới. Live at-risk = missed-check-in (0 write path absent).
- **Monday wrap:** `day < today` không wrap CN. Test khóa. Đúng plan.
- **`mapLessons` coerce unknown status → `upcoming`:** status lạ + `day < today` → missed. Plan red-team reject (YAGNI). Pre-existing coerce, không đổi PR này.
- **Check-in concurrency:** server WHERE `status=upcoming` (`kernel.ts:337-347`). Client `busy` global disable. Không race mới.
- **Orphan sid:** helper at-risk chỉ student trong mảng; UI skip card. FK cascade student→enrollment→lesson.
- Dependents helper: chỉ `dashboard.tsx` + 2 test. Không leak sang schedule/class-detail `s.atRisk` (M2 / non-goal).

Verified: check-in mapping, emptyKernel collections, `useDirectKernelAction` signature, DataTable index keys (pre-existing), không mutation input (`.slice().sort`).

### Positive Observations
- `now` một lần/render, truyền cả `lessonsToday` và `atRiskRows` — tránh lệch ngày lúc nửa đêm.
- `.slice()` trước `sort` — không mutate snapshot array.
- At-risk iterate `students` (ổn định thứ tự), reasons `Set` rồi emit `absent` trước `missed-check-in`.
- Cắt cột Nợ + `onClick` no-op đúng red-team accept.

### Recommended Actions
1. Đưa `useData` / `useDirectKernelAction` lên trên session throw (`dashboard.tsx:34-40`).
2. (Optional) Siết `formatDashboardLead` + contract lock helper/session.
3. Lead: tick plan.md AC; #55 phải ghi `day` Mon=1 cùng convention này.

### Metrics
- Type Coverage: `tsc --noEmit` 0 err; 0 `any` mới
- Test Coverage: +10 selector unit + 1 contract; web suite 197/197 pass
- Linting Issues: 0 (`biome check` 4 files)

### Pre-Landing Review: 1 issue (0 critical, 1 informational)

**CRITICAL** (blocking):
Không.

**Issues** (non-blocking):
- [`apps/web/src/routes/_auth/dashboard.tsx:34`](apps/web/src/routes/_auth/dashboard.tsx) Hooks sau `if (!session?.data?.user) throw redirect`
  Fix: gọi `useData` + `useDirectKernelAction` trước guard, copy thứ tự an toàn của sidebar

Suppressions applied: weekday-model flood / #55 empty org / absent button 409 — plan + kongming đã chốt, không reverse. Style/format: biome clean, bỏ.

### Unresolved Questions
- `pnpm --filter web check-types` (vite build) chưa chạy session này — `tsc --noEmit` xanh; CI vẫn cần `VITE_SERVER_URL`.
- Plan.md status/AC checkbox chưa tick dù phase todo `[x]`.

---

Status: DONE_WITH_CONCERNS
Summary: AC issue 57 đạt; selector Mon=1 + at-risk kernel + KPI cut + check-in lock đúng. Một latent hooks-after-throw trên dashboard; weekday-model series là risk đã accept, không block PR này.
Concerns/Blockers: `dashboard.tsx:34-40` hook order. Không blocker merge nếu chấp nhận invariant beforeLoad là đủ.
