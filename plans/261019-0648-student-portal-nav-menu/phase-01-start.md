---
title: "Phase 1: Thanh điều hướng StudentShell, chuẩn hóa query key & StudentPageGate"
status: todo
---

# Phase 1: Thanh điều hướng StudentShell, chuẩn hóa query key & StudentPageGate

## Context Links

- [`apps/student/src/components/layout/student-shell.tsx`](../../apps/student/src/components/layout/student-shell.tsx)
- [`apps/student/src/lib/repos/student.ts`](../../apps/student/src/lib/repos/student.ts)
- [`apps/student/src/routes/_auth/index.tsx`](../../apps/student/src/routes/_auth/index.tsx)
- [`DESIGN.md`](../../DESIGN.md) — Quy tắc selection (`neu-in text-hot` + dấu `■` cam `aria-hidden="true"`)

## Overview

Xây dựng thanh điều hướng ngang (`StudentNav`) bên trong `StudentShell`, bổ sung hook `useStudentInvoices()` dưới namespace `["student", "invoices"]` để đồng bộ với `OrgSwitcher`, và tạo component `StudentPageGate` dùng chung để xử lý nhất quán trạng thái loading, lỗi `NOT_LINKED` và redirect `/onboarding`.

## Requirements

- [ ] Tạo `apps/student/src/components/layout/student-nav.tsx` xuất `STUDENT_NAV_ITEMS` và component `StudentNav`.
- [ ] Tích hợp `StudentNav` vào `apps/student/src/components/layout/student-shell.tsx` với bố cục responsive 1 `<nav>` duy nhất (`flex-wrap lg:flex-nowrap`).
- [ ] Thêm `useStudentInvoices()` vào `apps/student/src/lib/repos/student.ts` với `queryKey: ["student", "invoices"]` và cập nhật `StudentTuitionSection` trong `apps/student/src/routes/_auth/index.tsx`.
- [ ] Tạo `apps/student/src/components/layout/student-page-gate.tsx` chuẩn hóa kiểm tra `meQuery` (`NOT_LINKED`, lỗi khác, `onboardingCompletedAt == null`).

## Implementation Steps

1. **Tạo `apps/student/src/components/layout/student-nav.tsx`**:
   - Định nghĩa danh sách 5 mục điều hướng:
     - `Tổng quan` (`to: "/"`, `exact: true`, `testId: "student-nav-overview"`)
     - `Lớp học` (`to: "/classes"`, `exact: false`, `testId: "student-nav-classes"`)
     - `Bài tập` (`to: "/assignments"`, `exact: false`, `testId: "student-nav-assignments"`)
     - `Từ vựng` (`to: "/vocab"`, `exact: false`, `testId: "student-nav-vocab"`)
     - `Học phí` (`to: "/tuition"`, `exact: false`, `testId: "student-nav-tuition"`)
   - Render `<nav aria-label="Điều hướng học viên" data-testid="student-nav">`:
     - Mỗi mục là `<Link to={item.to} activeOptions={{ exact: item.exact }} data-testid={item.testId}>` với class:
       `group aria-[current=page]:neu-in inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 font-medium text-[13px] text-fg-2 transition-colors duration-150 hover:text-hot focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none aria-[current=page]:text-hot`
     - Trước nhãn có `<span aria-hidden="true" className="hidden text-[8px] text-hot leading-none group-aria-[current=page]:inline">■</span>` (theo đúng `DESIGN.md` và pattern `apps/web/src/components/layout/sidebar.tsx`).

2. **Cập nhật `apps/student/src/components/layout/student-shell.tsx`**:
   - Trong `<header className="border-line border-b">`, dùng container `mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-4 md:px-10 lg:flex-nowrap`.
   - Cột trái: giữ `<span className="truncate font-display font-extrabold text-xl tracking-[-0.01em]">{userName || "Học viên"}</span>`.
   - Giữa (trên `lg:`) / Hàng 2 (trên `< lg`): `<StudentNav className="order-3 flex w-full items-center gap-1 overflow-x-auto border-line border-t pt-2.5 lg:order-none lg:w-auto lg:border-t-0 lg:pt-0" />`.
   - Cột phải: `<div className="flex flex-none items-center gap-2.5">` chứa `OrgSwitcher`, `ThemeToggle`, `NotificationBell`, `AvatarMenu`.

3. **Chuẩn hóa `useStudentInvoices` trong `apps/student/src/lib/repos/student.ts`**:
   - Thêm:
     ```ts
     export function useStudentInvoices() {
       return useQuery({
         queryKey: ["student", "invoices"],
         queryFn: fetchStudentInvoices,
         staleTime: 30_000,
       });
     }
     ```
   - Cập nhật `StudentTuitionSection` trong `apps/student/src/routes/_auth/index.tsx` gọi `useStudentInvoices()` thay vì `useQuery({ queryKey: ["student-invoices"], ... })`.

4. **Tạo `apps/student/src/components/layout/student-page-gate.tsx`**:
   - Nhận `sessionEmail?: string` và `children: (me: StudentMe) => ReactNode`.
   - Xử lý:
     - `meQuery.isLoading`: trả về `<Loader />`.
     - `meQuery.error`: nếu `code === STUDENT_ERROR_CODES.NOT_LINKED` trả về `<StudentShell userEmail={sessionEmail}><StudentErrorView code={code} userEmail={sessionEmail} /></StudentShell>`; ngược lại trả về `<StudentErrorView code={code} userEmail={sessionEmail} />`.
     - `meQuery.data?.student.onboardingCompletedAt == null`: trả về `<Navigate to="/onboarding" />`.
     - Khi hợp lệ: bọc `<StudentShell userName={me.student.name} userEmail={me.user.email}>{children(me)}</StudentShell>`.

## Todo

- [ ] Tạo `apps/student/src/components/layout/student-nav.tsx`
- [ ] Cập nhật `apps/student/src/components/layout/student-shell.tsx`
- [ ] Thêm `useStudentInvoices` vào `apps/student/src/lib/repos/student.ts` và dùng trong `index.tsx`
- [ ] Tạo `apps/student/src/components/layout/student-page-gate.tsx`

## Success Criteria

- `StudentShell` render `<nav aria-label="Điều hướng học viên">` với 5 mục, không sinh duplicate link trong DOM, không tràn ngang ở 375px / 768px / 1440px.
- `useStudentInvoices` dùng `queryKey: ["student", "invoices"]` để tự động invalidate khi đổi tổ chức qua `OrgSwitcher`.
