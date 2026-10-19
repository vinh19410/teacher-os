---
title: "Phase 2: Các trang chuyên biệt (/classes, /assignments, /tuition) & bọc StudentShell cho /tuition/$invoiceId"
status: todo
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

- [ ] Tạo route `/classes` (`apps/student/src/routes/_auth/classes/index.tsx`).
- [ ] Mở rộng `AssignmentList` hỗ trợ controlled tab + `aria-hidden="true"` trên số đếm, và tạo route `/assignments` (`apps/student/src/routes/_auth/assignments/index.tsx`) đồng bộ bộ lọc trạng thái với URL (`?status=`).
- [ ] Tạo route `/tuition` (`apps/student/src/routes/_auth/tuition/index.tsx`) có empty state khi chưa có hóa đơn.
- [ ] Cập nhật `apps/student/src/routes/_auth/tuition/$invoiceId.tsx` bọc trong `StudentShell`, dùng `useStudentMe()` và thêm link `← Học phí` về `/tuition`.

## Implementation Steps

1. **Tạo `apps/student/src/routes/_auth/classes/index.tsx` (`/_auth/classes/`)**:
   - Sử dụng `StudentPageGate`, `useStudentOverview()`, và `useAcceptClassEnrollment()`.
   - Hiển thị header chuẩn `DESIGN.md`:
     - Kicker mono cam: `Lớp học · ${overview.classes.length} lớp`
     - `h1`: `Lớp học của tôi` (`font-display font-extrabold text-3xl text-fg leading-[0.95] tracking-[-0.045em]`)
   - Khi `overview.classes.length === 0`: hiển thị `OverviewEmptyState` (`icon="calendar"`, `title="Bạn chưa tham gia lớp học nào"`).
   - Khi có lớp: render lưới `grid grid-cols-1 gap-5 md:grid-cols-2` với `ClassCard` (hỗ trợ cả lớp active dẫn tới `/classes/$classId` và lớp `invited` xác nhận tham gia).

2. **Nâng cấp `AssignmentList` (`apps/student/src/components/overview/assignment-list.tsx`) & tạo `apps/student/src/routes/_auth/assignments/index.tsx` (`/_auth/assignments/`)**:
   - Trong `AssignmentList`:
     - Bổ sung props tuỳ chọn: `activeTab?: FilterTab`, `onTabChange?: (tab: FilterTab) => void`, `hideHeading?: boolean`, `className?: string`. Khi không truyền `activeTab`, giữ state nội bộ như cũ để `/` và `/classes/$classId` không thay đổi hành vi.
     - Thêm `aria-hidden="true"` vào `<span className="rounded-full ...">{count}</span>` trong từng tab (theo quy tắc `DESIGN.md`: không để badge đếm trong accessible name).
     - Xuất kiểu `FilterTab` và mảng hằng `ASSIGNMENT_FILTER_TABS` (`["all", "due-soon", "overdue", "submitted"]`).
   - Trong `apps/student/src/routes/_auth/assignments/index.tsx`:
     - Khai báo `validateSearch` nhận `status?: FilterTab` (mặc định `"all"` khi vắng mặt hoặc không hợp lệ).
     - Render trong `StudentPageGate`:
       - Header: kicker mono cam `Bài tập · ${overview.assignments.length} bài`, `h1`: `Bài tập của tôi`.
       - `<AssignmentList assignments={overview.assignments} activeTab={status} onTabChange={(next) => void navigate({ to: "/assignments", search: next === "all" ? {} : { status: next }, replace: true })} hideHeading className="mt-6" />`.

3. **Tạo `apps/student/src/routes/_auth/tuition/index.tsx` (`/_auth/tuition/`)**:
   - Sử dụng `StudentPageGate` và `useStudentInvoices()`.
   - Header: kicker mono cam `Học phí`, `h1`: `Học phí của tôi`.
   - Khi `invoices.length === 0`: render `OverviewEmptyState` (`icon="calendar"`, `title="Chưa có hóa đơn học phí"`, `description="Khi giáo viên tạo phiếu thu học phí cho lớp của bạn, thông tin thanh toán và mã QR sẽ hiển thị tại đây."`).
   - Khi `invoices.length > 0`: render `<div className="mt-6 max-w-2xl"><TuitionList invoices={invoices} /></div>`.

4. **Cập nhật `apps/student/src/routes/_auth/tuition/$invoiceId.tsx`**:
   - Thay `useQuery({ queryKey: ["student-me"], queryFn: fetchStudentMe })` bằng `useStudentMe()` và đổi query key chi tiết thanh toán sang `["student", "invoice-payment", invoiceId, reload]`.
   - Bọc các trạng thái (loading, error, detail) trong `<StudentShell userName={me.data?.student.name} userEmail={me.data?.user.email}>`.
   - Thêm link điều hướng `<Link to="/tuition" className="font-mono text-[11px] text-meta uppercase tracking-[0.15em] hover:text-hot">← Học phí</Link>` phía trên mã hóa đơn.

5. **Tạo lại route tree (`routeTree.gen.ts`)**:
   - Chạy `pnpm --filter student check-types` (hoặc `vite build`) để TanStack Router plugin tự động cập nhật `apps/student/src/routeTree.gen.ts` với 3 route mới `/_auth/classes/`, `/_auth/assignments/`, `/_auth/tuition/`.

## Todo

- [ ] Tạo `apps/student/src/routes/_auth/classes/index.tsx`
- [ ] Cập nhật `apps/student/src/components/overview/assignment-list.tsx` và tạo `apps/student/src/routes/_auth/assignments/index.tsx`
- [ ] Tạo `apps/student/src/routes/_auth/tuition/index.tsx`
- [ ] Cập nhật `apps/student/src/routes/_auth/tuition/$invoiceId.tsx` bọc trong `StudentShell`
- [ ] Regenerate `apps/student/src/routeTree.gen.ts` và kiểm tra typecheck

## Success Criteria

- Học viên truy cập trực tiếp hoặc bấm từ menu vào `/classes`, `/assignments`, `/tuition` đều hiển thị đúng dữ liệu và trạng thái active trên menu.
- Bộ lọc trạng thái trên `/assignments` lưu trên URL (`?status=`) và giữ nguyên khi reload.
- Trang `/tuition` có empty state khi không có hóa đơn; `/tuition/$invoiceId` hiển thị đầy đủ `StudentShell` và link quay về `/tuition`.
