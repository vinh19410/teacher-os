---
phase: 5
title: "Core module screens"
status: pending
priority: P1
effort: "10h"
dependencies: [4]
---

# Phase 5: Core module screens

## Overview
Implement the six highest-traffic views as file-based routes: Dashboard, Students (+detail), Schedule, Tuition, Assignments (+detail). Every table row, badge, stat and modal ported 1:1 from the export with real Vietnamese copy.

## Requirements
- Functional — Dashboard (`/dashboard`): greeting "Chào buổi sáng, cô Lan" + date lead; "Lịch hôm nay" list (avatar, time · dur · type · topic, Điểm danh button → completed badge); "Cần xử lý" alert card (5 alerts with dot colors); "Tuần này" 4 stat cards (7.5 giờ dạy / 6.2tr đã thu / 2.0tr còn nợ / 2 sắp hết gói); "Học viên rủi ro" table with issue badges, remaining, debt (`fmtK`).
- Functional — Students (`/students`): filter chips (Tất cả / Sắp hết buổi / Nợ học phí / Writing / Speaking) filtering by tags; table (name+phone+avatar, pkg total · mode, remaining/total, tag pills, price `fmtVND`); "+ Thêm học viên" modal with required-name validation (export `ns-error`), saves to store, list re-renders.
- Functional — Student detail (`/students/$studentId`): back link; header card (avatar lg, name, phone · Zalo · target band · exam date, tags, Nhắn Zalo button `https://zalo.me/{zalo}`, Tạo báo cáo button); 4 tabs — Hồ sơ (pkg rows + progress bar low-variant when remaining ≤3, parent info, internal notes), Lịch sử buổi (lesson table with status badges), Học phí (invoice table), Bài tập (assignments with band column linking to detail).
- Functional — Schedule (`/schedule`): week header (← Trước / Tuần này / Sau → chips — static per export), GCal "Đã bật" badge; 7-column week calendar (day heads with today accent underline, lesson blocks typed: 1:1 accent / 1:2 success / trial warn / mock fg / review meta; completed = 60% opacity + strikethrough, cancelled = 35%, absent would be danger); lesson click → detail modal (time, topic, status, zoom link; Điểm danh / Hủy buổi actions for upcoming); legend row.
- Functional — Tuition (`/tuition`): 3 stat cards; package balance table (done/total, remaining red when ≤3, progress fill low/warn thresholds ≤2/≤4, expiry, status badge Sắp hết danger/warn vs Đang học); invoice table (id, student, type tag, amount, date, status, "Đã nhận" action → markPaid → badge + method swap).
- Functional — Assignments (`/assignments`): filter chips (Tất cả/Chưa nộp/Trễ/Đã chấm) mapping to status values not-submitted/late/graded; table with band average or —.
- Functional — Assignment detail (`/assignments/$assignmentId`): header card (avatar, title, student · type · due, band 36px accent or Chấm bài button); graded → rubric grid (4 criteria cards); "Nhận xét" textarea + Gửi cho học viên / Lưu nháp; "Ngân hàng nhận xét" 8 chips appending to textarea; grade modal (4 number inputs step 0.5, validation) → saveGrade → status graded + re-render with rubric.
- Non-functional: check-in from dashboard or schedule updates student package counts consistently across dashboard/students/tuition (single store source).
- Non-functional: empty states "Không có buổi học nào hôm nay." etc. ported verbatim.

## Architecture
```
apps/web/src/routes/_auth/
├── dashboard.tsx
├── students/index.tsx        # + components/modals/add-student-modal.tsx
├── students/$studentId.tsx   # tabs via local state (export uses same-page tabs)
├── schedule.tsx              # + components/schedule/lesson-modal.tsx
├── tuition.tsx               # + components/modals/add-invoice-modal.tsx
├── assignments/index.tsx
└── assignments/$assignmentId.tsx  # + components/modals/grade-modal.tsx
```
Data via `useData()`; derived values with small pure helpers in `lib/mock-data.ts` (e.g. `isAtRisk(s)`, `debtOf(studentId)`, `lessonEndColor(type)`). Detail tabs = local `useState` (matches export's tab mechanism; no sub-routes needed).

## Related Code Files
- Create: `apps/web/src/routes/_auth/dashboard.tsx` (replacing Phase 1 placeholder)
- Create: `apps/web/src/routes/_auth/students/index.tsx`, `_auth/students/$studentId.tsx`
- Create: `apps/web/src/routes/_auth/schedule.tsx`
- Create: `apps/web/src/routes/_auth/tuition.tsx`
- Create: `apps/web/src/routes/_auth/assignments/index.tsx`, `_auth/assignments/$assignmentId.tsx`
- Create: `apps/web/src/components/modals/{add-student,add-invoice,grade}-modal.tsx`, `apps/web/src/components/schedule/lesson-modal.tsx`
- Reference: export lines 316–425 (dashboard/students/schedule/tuition/assignments markup), 734–1030 (render functions), 1259–1310 (modals)

## Implementation Steps
1. **Dashboard first — this is the tracer-bullet gate:** build the complete dashboard screen alone (today lessons + check-in modal flow, alerts, week stats, risk table), then screenshot-diff against `teacher-os.html` at 390×844, 919/920/921 boundary, and 1440×900. STOP the line if tokens, typography, radii, or spacing drift — fix the kit/theme before building any other screen. The dashboard exercises every foundation layer (kit cards/badges/tables/stat-cards, shell sidebar/topbar/drawer, store actions + derived data) at hour ~12 instead of discovering foundation errors at hour ~30.
2. Students list + chips + add-student modal (name required, defaults total 10 / price 400000 / Online; new student shape from export `saveStudent`).
3. Student detail with 4 tabs; each tab a small subcomponent in the route file; navigate cross-links (`Link to` to assignment detail).
4. Schedule: build `week-cal` grid; mobile switch (≤920px single column with left-border day heads) via the Phase 2 `app:` breakpoint replicating export media query; lesson modal with check-in/cancel.
5. Tuition: two tables + markPaid action; stat cards derived (đã thu T8 = sum paid invoices; còn nợ = sum overdue+unpaid; gói sắp hết count remaining ≤4… port export's exact display values).
6. Assignments list + filters; detail with rubric, comment bank (append logic), grade modal writing `scores` + `status:'graded'`.
7. Cross-check every screen against export HTML side-by-side at 1440px; fix visual deltas. Commit after each screen lands.

## Success Criteria
- [ ] Tracer gate passed: dashboard pixel-close to export at 390/920-boundary/1440 BEFORE any other screen is built
- [ ] All 6 routes render complete content with zero placeholder text
- [ ] Filter chips on students/assignments produce identical row sets as export
- [ ] Check-in flow: click Điểm danh on dashboard → badge flips, student remaining decreases in /students and /tuition
- [ ] Grade flow: grade a2 → status Đã chấm, band 6.3 shows in list + detail rubric
- [ ] Add student flow: create "Test HV" → appears in students table and tuition package table
- [ ] Lesson modal shows correct zoom link; legend matches export colors
- [ ] Mark-paid flips invoice row to Đã thu + method

## Risk Assessment
- **Risk: stat values drift from export** (dashboard week stats and tuition stats are hardcoded strings like "6.2tr"). Port them as literal strings/numbers first; converting to derived sums is only done where export derives (risk table debt). Signal: screenshot mismatch vs export.
- **Risk: schedule mobile layout complexity.** The export reflows 7-col grid to stacked rows with left borders — replicate with `md:` prefixed classes; verify at 390px early, not in Phase 8.
- **Risk: tab state loss on detail navigation** — acceptable, matches export (tabs reset to first on reopen).
