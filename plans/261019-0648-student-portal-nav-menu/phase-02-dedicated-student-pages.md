---
title: "Phase 2: Các trang chuyên biệt (/classes, /assignments, /tuition) & bọc StudentShell cho /tuition/$invoiceId"
status: completed
---

# Phase 2: Các trang chuyên biệt (/classes, /assignments, /tuition) & bọc StudentShell cho /tuition/$invoiceId

## Context Links

- [`apps/student/src/routes/_auth/index.tsx`](../../apps/student/src/routes/_auth/index.tsx)
- [`apps/student/src/components/overview/assignment-list.tsx`](../../apps/student/src/components/overview/assignment-list.tsx)
- [`apps/student/src/components/overview/tuition-list.tsx`](../../apps/student/src/components/overview/tuition-list.tsx)
- [`apps/student/src/routes/_auth/tuition/$invoiceId.tsx`](../../apps/student/src/routes/_auth/tuition/$invoiceId.tsx)
- [`AGENTS.md`](../../AGENTS.md) — Quy ước trang list có bộ lọc sống trong URL

## Overview

Tạo 3 route danh sách độc lập cho học viên (`/classes`, `/assignments`, `/tuition`) và nâng cấp `/tuition/$invoiceId` để nằm trong `StudentShell` kèm liên kết quay về `/tuition`.

## Requirements

- [x] Tạo route `/classes` (`apps/student/src/routes/_auth/classes/index.tsx`).
- [x] Mở rộng `AssignmentList` hỗ trợ controlled tab + `aria-hidden="true"` trên số đếm, và tạo route `/assignments` (`apps/student/src/routes/_auth/assignments/index.tsx`) đồng bộ bộ lọc trạng thái với URL (`?status=`).
- [x] Tạo route `/tuition` (`apps/student/src/routes/_auth/tuition/index.tsx`) có empty state khi chưa có hóa đơn.
- [x] Cập nhật `apps/student/src/routes/_auth/tuition/$invoiceId.tsx` bọc trong `StudentShell`, dùng `useStudentMe()` và thêm link `← Học phí` về `/tuition`.

## Tasks & Steps (Handover Contract `--advice`)

### Task 2.1 — Tạo route `/classes` (`apps/student/src/routes/_auth/classes/index.tsx`)
- **Goal:** Hiển thị trang danh sách lớp học độc lập tại `/classes` với lưới `ClassCard`, xác nhận tham gia lớp mời, và empty state khi chưa có lớp.
- **Target files and symbols:** `apps/student/src/routes/_auth/classes/index.tsx` (`Route`, `StudentClassesPage`).
- **Steps:**
  1. Tạo `apps/student/src/routes/_auth/classes/index.tsx` với `createFileRoute("/_auth/classes/")`.
  2. Bọc nội dung trong `<StudentPageGate sessionEmail={sessionEmail}>{(me) => ...}</StudentPageGate>`.
  3. Sử dụng `useStudentOverview()` và `useAcceptClassEnrollment()` (hiển thị `<Loader />` khi đang tải và `<StudentErrorView />` khi lỗi `overviewQuery.error`).
  4. Render header với kicker mono cam `Lớp học · ${overview.classes.length} lớp` và `h1` `Lớp học của tôi`.
  5. Khi `overview.classes.length === 0`, render `OverviewEmptyState` (`icon="calendar"`, `title="Bạn chưa tham gia lớp học nào"`). Khi có lớp, render lưới `grid grid-cols-1 gap-5 md:grid-cols-2` chứa `ClassCard`.
- **Success criteria:** File `apps/student/src/routes/_auth/classes/index.tsx` tồn tại và định nghĩa route `/_auth/classes/`.
- **Verify:** `no verification needed` (được kiểm tra ở Task 2.4 khi regenerate route tree và typecheck).

### Task 2.2 — Nâng cấp `AssignmentList` và tạo route `/assignments` (`apps/student/src/routes/_auth/assignments/index.tsx`)
- **Goal:** Hỗ trợ controlled tab + `aria-hidden="true"` trên số đếm trong `AssignmentList` và tạo trang `/assignments` đồng bộ bộ lọc trạng thái với URL (`?status=all|due-soon|overdue|submitted`).
- **Target files and symbols:** `apps/student/src/components/overview/assignment-list.tsx` (`FilterTab`, `ASSIGNMENT_FILTER_TABS`, `AssignmentList`), `apps/student/src/routes/_auth/assignments/index.tsx` (`Route`, `StudentAssignmentsPage`).
- **Steps:**
  1. Trong `apps/student/src/components/overview/assignment-list.tsx`:
     - Xuất `export type FilterTab = "all" | "due-soon" | "overdue" | "submitted"` và `export const ASSIGNMENT_FILTER_TABS: readonly FilterTab[] = ["all", "due-soon", "overdue", "submitted"]`.
     - Mở rộng props của `AssignmentList`: `activeTab?: FilterTab`, `onTabChange?: (tab: FilterTab) => void`, `hideHeading?: boolean`, `className?: string`. Khi `activeTab` không truyền vào, dùng state nội bộ `internalTab`.
     - Thêm `aria-hidden="true"` vào `<span className="rounded-full ...">{count}</span>` trong mỗi tab.
  2. Tạo `apps/student/src/routes/_auth/assignments/index.tsx` với `createFileRoute("/_auth/assignments/")` và `validateSearch` chuẩn hóa `status?: FilterTab`.
  3. Bọc trong `StudentPageGate`, render header (`Bài tập · ${overview.assignments.length} bài`, `h1`: `Bài tập của tôi`) và `<AssignmentList assignments={overview.assignments} activeTab={status ?? "all"} onTabChange={(next) => void navigate({ to: "/assignments", search: next === "all" ? {} : { status: next }, replace: true })} hideHeading className="mt-6" />`.
- **Success criteria:** `AssignmentList` giữ nguyên hành vi ở `/` và `/classes/$classId`, đồng thời hoạt động ở chế độ controlled trên `/assignments`.
- **Verify:** `no verification needed` (được kiểm tra ở Task 2.4).

### Task 2.3 — Tạo route `/tuition` và bọc `StudentShell` cho `/tuition/$invoiceId`
- **Goal:** Tạo trang danh sách học phí `/tuition` (có empty state khi chưa có hóa đơn) và bọc trang chi tiết `/tuition/$invoiceId` trong `StudentShell` kèm liên kết `← Học phí`.
- **Target files and symbols:** `apps/student/src/routes/_auth/tuition/index.tsx` (`Route`, `StudentTuitionPage`), `apps/student/src/routes/_auth/tuition/$invoiceId.tsx` (`Route`, `StudentTuitionDetailRoute`).
- **Steps:**
  1. Tạo `apps/student/src/routes/_auth/tuition/index.tsx` với `createFileRoute("/_auth/tuition/")`, dùng `StudentPageGate` và `useStudentInvoices()`.
  2. Render header (`Học phí`, `h1`: `Học phí của tôi`); khi `invoices.length === 0` hiển thị `OverviewEmptyState` (`icon="calendar"`, `title="Chưa có hóa đơn học phí"`), khi có hóa đơn hiển thị `<div className="mt-6 max-w-2xl"><TuitionList invoices={invoices} /></div>`.
  3. Trong `apps/student/src/routes/_auth/tuition/$invoiceId.tsx`:
     - Dùng `StudentPageGate` (hoặc `useStudentMe()` + `StudentShell`) và đổi query key chi tiết thanh toán sang `["student", "invoice-payment", invoiceId, reload]`.
     - Thêm `<Link to="/tuition" className="inline-flex items-center gap-1 font-mono text-[11px] text-meta uppercase tracking-[0.15em] hover:text-hot">← Học phí</Link>` phía trên mã hóa đơn.
- **Success criteria:** Cả `/tuition` và `/tuition/$invoiceId` đều hiển thị trong `StudentShell` và dùng query key dưới prefix `["student", ...]`.
- **Verify:** `no verification needed` (được kiểm tra ở Task 2.4).

### Task 2.4 — Cập nhật `routeTree.gen.ts` và kiểm tra typecheck
- **Goal:** Cập nhật cây route tự động của TanStack Router cho 3 route mới và đảm bảo toàn bộ workspace không có lỗi kiểu.
- **Target files and symbols:** `apps/student/src/routeTree.gen.ts`.
- **Steps:**
  1. Chạy генератор route tree của `@tanstack/router-plugin` (qua `pnpm --filter student build` hoặc `tsr generate`) và kiểm tra `apps/student/src/routeTree.gen.ts` có `/_auth/classes/`, `/_auth/assignments/`, `/_auth/tuition/`.
  2. Chạy `pnpm check-types`.
- **Success criteria:** `apps/student/src/routeTree.gen.ts` chứa 3 route mới và `pnpm check-types` pass.
- **Verify:** `pnpm check-types` exits 0.

## Todo

- [x] Tạo `apps/student/src/routes/_auth/classes/index.tsx`
- [x] Cập nhật `apps/student/src/components/overview/assignment-list.tsx` và tạo `apps/student/src/routes/_auth/assignments/index.tsx`
- [x] Tạo `apps/student/src/routes/_auth/tuition/index.tsx`
- [x] Cập nhật `apps/student/src/routes/_auth/tuition/$invoiceId.tsx` bọc trong `StudentShell`
- [x] Regenerate `apps/student/src/routeTree.gen.ts` và kiểm tra typecheck

## Success Criteria

- Học viên truy cập trực tiếp hoặc bấm từ menu vào `/classes`, `/assignments`, `/tuition` đều hiển thị đúng dữ liệu và trạng thái active trên menu.
- Bộ lọc trạng thái trên `/assignments` lưu trên URL (`?status=`) và giữ nguyên khi reload.
- Trang `/tuition` có empty state khi không có hóa đơn; `/tuition/$invoiceId` hiển thị đầy đủ `StudentShell` và link quay về `/tuition`.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
