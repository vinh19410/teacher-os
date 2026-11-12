# dashboard — Nguồn truy vết (reverse)

| ID | Đường dẫn (repo-relative) | Vai trò | Ghi chú độ tin cậy |
|----|---------------------------|---------|--------------------|
| S1 | docs/project-overview-pdr.md | Tài liệu chính (PDR) — bối cảnh org-scoped kernel, auth gate | KHÔNG mô tả dashboard (grep "dashboard" = 0 hit) → GAP-1 |
| S2 | packages/api/src/contracts.ts | Hợp đồng `dashboardRemindersResponseSchema` (2680-2719) + `ACCOUNT_ERROR_CODES` (1975-1996) | ✅ nguồn hợp đồng |
| S3 | apps/web/src/routes/_auth/dashboard.tsx | UI trang tổng quan (route, reminders query, KPI, lịch, risk) | ✅ nguồn chính UI |
| S4 | apps/server/src/routes/dashboard-reminders.ts | Route + `computeReminders` + `resolveReminderScope` + hằng số | ✅ nguồn chính server |
| S5 | apps/server/src/routes/kernel.ts | Mount `/dashboard` (3508-3509); tái dùng `resolveReminderScope` (2916-2919) | ✅ |
| S6 | apps/server/src/app.ts | Middleware bootstrap: gate student/admin/teacher-emails + set kernelCtx | ✅ |
| S7 | apps/web/src/components/dashboard/reminder-cards.tsx | 3 thẻ nhắc việc + tiêu đề section | ✅ |
| S8 | apps/web/src/lib/dashboard-from-kernel.ts | lessonsToday / group / upcoming / atRisk / greeting | ✅ |
| S9 | apps/web/src/lib/repos/dashboard-reminders.ts | Query key gắn dataUpdatedAt + fetch + zod client | ✅ |
| S10 | apps/e2e/specs/dashboard-reminders.spec.ts | E2E AC-001: đếm khớp seed, ≤2s, 1 cú bấm; screenshots 3 viewport | ✅ test active (không skip/only) |
| S11 | apps/server/src/routes/dashboard-reminders.test.ts | Unit/integration: attendance, grading, tuition, scope, múi giờ, 401/403/200, perf | ✅ test active |
| S12 | apps/web/src/routes/_auth/dashboard.test.tsx | Test UI: lịch hôm nay, risk, org rỗng trung thực, reminders hiển thị, refetch | ✅ test active |
| S13 | apps/web/src/components/dashboard/reminder-cards.test.tsx | Test component thẻ: render, href, thiếu tuition, zero-inbox, preview 3 dòng | ✅ test active |
| S14 | packages/auth/src/role.ts | `FINANCE_ROLES`, `FINANCE_ROLE_MAP`, `canAccessFinance` (63-87) | ✅ |
| S15 | packages/api/src/vietnam-date.ts | `vietnamTodayISO`, `addDaysISO` (20-39) | ✅ |
| S16 | apps/server/src/lib/assignment-visibility.ts | `visibleAssignmentFilter` (available_at) trong truy vấn thẻ 2 | ✅ |
| S17 | packages/api/src/lib/ielts-band.ts | `essayTaskOf` — đề hybrid Writing tính là writing (61-85) | ✅ |
| S18 | apps/web/src/lib/tuition-from-kernel.ts | `invoiceReceived` clamp + `tuitionTotals` (14-48) | ✅ |
| S19 | apps/web/src/lib/use-finance-route-guard.ts | Guard tài chính điều hướng về /dashboard (12-28) | ✅ |
| S20 | apps/web/src/routes/index.tsx | Route `/` redirect `/dashboard` (3-7) | ✅ |
| S21 | apps/web/src/components/layout/sidebar.tsx | Nav "Tổng quan" /dashboard (34-40, 189, 209) | ✅ |
| S22 | apps/web/src/components/layout/app-shell.tsx | Breadcrumb "/_auth/dashboard": "Tổng quan" (33) | ✅ |
| S23 | apps/e2e/specs/account-role-separation.spec.ts | Blocked view trên /dashboard cho session student (137-145) | ✅ test active |
| S24 | apps/e2e/specs/login.smoke.spec.ts | Sign-up dẫn tới dashboard với org bootstrap (10-18) | ✅ test active |
| S25 | apps/server/src/routes/daily-attendance.ts | Tái dùng `ReminderScope` + `resolveReminderScope()` (22-23, 186, 325) | ✅ |
| S26 | apps/web/src/routes/_auth/route.tsx | beforeLoad session guard → /login (6-37) | ✅ |
| S27 | apps/web/src/lib/repos/kernel.ts | `kernelQueryOptions`/key ["kernel"] (669-677), snapshot shape guard (601-662) | ✅ |
| S28 | apps/web/src/lib/week-grid.ts | `todayISOVietnam`, tuần Mon-first (1-60) | ✅ |
| S29 | apps/web/src/lib/kernel-load-state.ts | `HttpError` (22-40) | ✅ |
| S30 | apps/web/src/lib/format-schedule.ts | `lessonDayLabel` (23-25) | ✅ |

Quy ước kiểm chứng: mọi cite đã grep/đọc đúng dòng theo working tree develop @ d6c0f6b5; test đều active (không .skip/.todo/.only — đã soát 4 file test của feature).
