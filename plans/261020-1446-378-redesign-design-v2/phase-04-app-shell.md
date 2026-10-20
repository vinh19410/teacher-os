---
phase: 4
title: "App shell sidebar-07 dùng chung web + student"
status: pending
priority: P1
effort: "6h"
dependencies: [3]
---

# Phase 4: App shell sidebar-07 dùng chung

## Goal

Một `AppShell` duy nhất trong `@teacher-os/ui` theo `design-v2/src/lib/shell.tsx`, dùng cho cả
`apps/web` và `apps/student`, giữ toàn bộ hành vi shell hiện có (notif, org switcher, avatar
menu, version badge, collapse).

## Files to Create / Modify

- Create: `packages/ui/src/components/app-shell/{app-shell,sidebar,team-switcher,nav-group,breadcrumbs,user-footer}.tsx`
  — props `nav: NavGroup[]`, `activeKey`, `team`, `user`, `crumbs`, `actions`, `children`;
  link điều hướng truyền qua render-prop/`LinkComponent` để giữ TanStack Router `<Link>`
  (không `window.location.hash`).
- Modify: `apps/web/src/components/layout/app-shell.tsx`, `sidebar.tsx`, `topbar.tsx` — dùng shell
  chung. Nav giáo viên theo nhóm v2, nhãn tiếng Việt:
  **Giảng dạy** (Tổng quan, Lớp học, Học viên, Lịch dạy, Giáo trình), **IELTS** (Bài tập, Chấm bài,
  Từ vựng), **Kinh doanh** (Học phí, Báo cáo, Hồ sơ) — giữ đúng route hiện có; mục nào app đã
  có nhãn khác thì giữ nhãn app (accessible name e2e).
- Modify: `notif-panel.tsx`, `version-badge.tsx` — đặt vào `actions` header / user footer.
- Modify: `apps/student/src/components/layout/student-shell.tsx`, `student-nav.tsx`,
  `org-switcher.tsx` (→ `TeamSwitcher` có `orgs`), `notification-bell.tsx` (popover v2 + badge
  đếm), `avatar-menu.tsx` (→ user footer). Nav học viên nhóm **Học tập**: Tổng quan, Lớp học,
  Bài tập, Luyện tập (có con theo skill — route thêm ở phase 10), Lịch sử (phase 11), Từ vựng,
  Học phí. Mục Luyện tập/Lịch sử chỉ hiện khi route tồn tại (feature flag theo phase).
- Keep hook: `<aside className="sidebar …">` (e2e `aside.sidebar` ×3, `sidebar-collapse`
  spec) — nếu collapse desktop không có trong v2, giữ nút collapse nhưng style v2.
- Modify: `app-shell.test.tsx`, `sidebar.test.tsx`, `topbar.test.tsx`, test shell student.

## Tasks & Steps

1. Port shell v2 thành component không phụ thuộc router; viết test render nav group,
   aria-current, mobile drawer (Esc/click overlay đóng, focus trả về nút mở).
2. Thay shell web; breadcrumb sinh từ route match (tên tổ chức › mục › chi tiết).
3. Thay shell student; org switcher dùng `TeamSwitcher` (`orgs` + `onOrg` giữ logic
   `useStudentOrgs`).
4. Header actions web: (chỗ dành cho ô ⌘K — phase 8), chuông thông báo, ThemeToggle.
5. Chạy e2e shell: `sidebar-collapse`, các spec điều hướng nav.

## Verification

- `pnpm --filter @teacher-os/ui check-types && pnpm --filter web test -- layout && pnpm --filter student test`
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e -- sidebar navigation`
- `pnpm design:compare --screens t-dashboard,s-dashboard --side app --label new` — mục 1
  (Shell) của checklist PASS ở 6 tổ hợp.
