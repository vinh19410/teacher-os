---
title: "Phase 1: Branded 404 UI Component & TanStack Router Integration"
status: done
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Branded 404 UI Component & TanStack Router Integration

## Overview

Design and implement a responsive, accessible, branded TeacherOS 404 error page. Connect it to TanStack Router at the root route (`__root.tsx`) and as `defaultNotFoundComponent` in `main.tsx`. Ensure existing sub-route entity 404 cards (like `$studentId.tsx` "Không tìm thấy học viên") remain unaffected.

## Requirements

- [x] Create `apps/web/src/components/not-found.tsx` containing the `NotFoundPage` component.
- [x] Header includes TeacherOS SVG logo and "Teacher OS" text, linking to `/`.
- [x] Prominent 404 indicator and Vietnamese heading: "Không tìm thấy trang".
- [x] Clear explanatory copy: "Đường dẫn bạn truy cập không tồn tại hoặc đã được chuyển sang địa chỉ khác. Vui lòng kiểm tra lại URL."
- [x] Navigation CTA buttons: "Về bảng điều khiển" (`/dashboard`) and "Đăng nhập" (`/login`).
- [x] Footer with copyright notice matching the calm brand aesthetic.
- [x] Responsive layout with mobile and desktop styling.
- [x] Wire `notFoundComponent: NotFoundPage` into `apps/web/src/routes/__root.tsx`.
- [x] Wire `defaultNotFoundComponent: NotFoundPage` into `apps/web/src/main.tsx`.
- [x] Verify sub-routes with their own `notFoundComponent` (`$studentId.tsx`, `$classId.tsx`, `$syllabusId.tsx`, `$assignmentId.tsx`) continue rendering their own entity cards.
- [x] Write unit tests in `apps/web/src/components/not-found.test.tsx` verifying component render, logo, heading, and navigation links.

## Implementation Steps

1. Create `apps/web/src/components/not-found.test.tsx` (TDD first) testing:
   - Renders TeacherOS logo and title.
   - Renders 404 heading and Vietnamese description.
   - Contains links to `/dashboard` and `/login`.
2. Implement `apps/web/src/components/not-found.tsx` with semantic HTML, Tailwind tokens, and TanStack Router `Link` components.
3. Update `apps/web/src/routes/__root.tsx` to set `notFoundComponent: NotFoundPage`.
4. Update `apps/web/src/main.tsx` to set `defaultNotFoundComponent: NotFoundPage`.
5. Run `pnpm --filter web test` to verify unit tests pass.

## Todo

- [x] Write `apps/web/src/components/not-found.test.tsx`
- [x] Implement `apps/web/src/components/not-found.tsx`
- [x] Wire `NotFoundPage` into `apps/web/src/routes/__root.tsx`
- [x] Wire `defaultNotFoundComponent` into `apps/web/src/main.tsx`
- [x] Run unit test suite and confirm green

## Verification Commands

```bash
cd apps/web && pnpm vitest run src/components/not-found.test.tsx
```
