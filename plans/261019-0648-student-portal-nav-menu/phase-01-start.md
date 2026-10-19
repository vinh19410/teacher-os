---
title: "Phase 1: Thanh điều hướng StudentShell, chuẩn hóa query key & StudentPageGate"
status: completed
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

- [x] Tạo `apps/student/src/components/layout/student-nav.tsx` xuất `STUDENT_NAV_ITEMS` và component `StudentNav`.
- [x] Tích hợp `StudentNav` vào `apps/student/src/components/layout/student-shell.tsx` với bố cục responsive 1 `<nav>` duy nhất (`flex-wrap lg:flex-nowrap`).
- [x] Thêm `useStudentInvoices()` vào `apps/student/src/lib/repos/student.ts` với `queryKey: ["student", "invoices"]` và cập nhật `StudentTuitionSection` trong `apps/student/src/routes/_auth/index.tsx`.
- [x] Tạo `apps/student/src/components/layout/student-page-gate.tsx` chuẩn hóa kiểm tra `meQuery` (`NOT_LINKED`, lỗi khác, `onboardingCompletedAt == null`).

## Tasks & Steps (Handover Contract `--advice`)

### Task 1.1 — Tạo component `StudentNav` với 5 mục điều hướng
- **Goal:** Kết xuất `<nav aria-label="Điều hướng học viên" data-testid="student-nav">` gồm 5 liên kết (`Tổng quan`, `Lớp học`, `Bài tập`, `Từ vựng`, `Học phí`) theo đúng quy tắc selection của `DESIGN.md` (`neu-in text-hot` + dấu `■` cam `aria-hidden="true"`).
- **Target files and symbols:** `apps/student/src/components/layout/student-nav.tsx` (`STUDENT_NAV_ITEMS`, `StudentNav`).
- **Steps:**
  1. Tạo `apps/student/src/components/layout/student-nav.tsx`.
  2. Xuất hằng `STUDENT_NAV_ITEMS` gồm 5 phần tử:
     - `{ to: "/", label: "Tổng quan", exact: true, testId: "student-nav-overview" }`
     - `{ to: "/classes", label: "Lớp học", exact: false, testId: "student-nav-classes" }`
     - `{ to: "/assignments", label: "Bài tập", exact: false, testId: "student-nav-assignments" }`
     - `{ to: "/vocab", label: "Từ vựng", exact: false, testId: "student-nav-vocab" }`
     - `{ to: "/tuition", label: "Học phí", exact: false, testId: "student-nav-tuition" }`
  3. Trong `StudentNav({ className }: { className?: string })`, render `<nav aria-label="Điều hướng học viên" data-testid="student-nav" className={className}>` chứa các `<Link to={item.to} activeOptions={{ exact: item.exact }} data-testid={item.testId}>` với class `group aria-[current=page]:neu-in inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 font-medium text-[13px] text-fg-2 transition-colors duration-150 hover:text-hot focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none aria-[current=page]:text-hot` và `<span aria-hidden="true" className="hidden text-[8px] text-hot leading-none group-aria-[current=page]:inline">■</span>` đặt trước `{item.label}`.
- **Success criteria:** File `apps/student/src/components/layout/student-nav.tsx` tồn tại, xuất `STUDENT_NAV_ITEMS` và `StudentNav` không dùng `useLocation`/`useRouterState` trực tiếp.
- **Verify:** `no verification needed` (được kiểm tra ở Task 1.4 qua `pnpm --filter student check-types`).

### Task 1.2 — Tích hợp `StudentNav` vào `StudentShell`
- **Goal:** Hiển thị `StudentNav` ngay trên header của `StudentShell` theo bố cục 1 `<nav>` duy nhất, 1 hàng trên desktop (`lg:flex-nowrap`) và xuống hàng 2 gọn gàng trên tablet/mobile (`flex-wrap`).
- **Target files and symbols:** `apps/student/src/components/layout/student-shell.tsx` (`StudentShell`).
- **Steps:**
  1. Import `StudentNav` từ `@/components/layout/student-nav`.
  2. Cập nhật container trong `<header className="border-line border-b">` thành `mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-4 md:px-10 lg:flex-nowrap`.
  3. Đặt `<StudentNav className="order-3 flex w-full items-center gap-1 overflow-x-auto border-line border-t pt-2.5 lg:order-none lg:w-auto lg:border-t-0 lg:pt-0" />` giữa `<span>` tên học viên và cụm công cụ bên phải (`OrgSwitcher`, `ThemeToggle`, `NotificationBell`, `AvatarMenu`).
- **Success criteria:** `StudentShell` render `<StudentNav />` trong `<header>` mà không nhân đôi `<nav>`.
- **Verify:** `no verification needed` (được kiểm tra ở Task 1.4).

### Task 1.3 — Chuẩn hóa `useStudentInvoices` dưới `["student", "invoices"]`
- **Goal:** Đảm bảo danh sách hóa đơn học viên nằm dưới prefix query key `["student", "invoices"]` để `OrgSwitcher` tự động invalidate khi đổi tổ chức.
- **Target files and symbols:** `apps/student/src/lib/repos/student.ts` (`useStudentInvoices`), `apps/student/src/routes/_auth/index.tsx` (`StudentTuitionSection`).
- **Steps:**
  1. Trong `apps/student/src/lib/repos/student.ts`, thêm hook `export function useStudentInvoices()` gọi `useQuery({ queryKey: ["student", "invoices"], queryFn: fetchStudentInvoices, staleTime: 30_000 })`.
  2. Trong `apps/student/src/routes/_auth/index.tsx`, thay `useQuery({ queryKey: ["student-invoices"], queryFn: fetchStudentInvoices, staleTime: 30_000 })` trong `StudentTuitionSection` bằng `useStudentInvoices()`.
- **Success criteria:** `useStudentInvoices` được xuất từ `@/lib/repos/student` và được dùng trong `apps/student/src/routes/_auth/index.tsx`.
- **Verify:** `no verification needed` (được kiểm tra ở Task 1.4).

### Task 1.4 — Tạo `StudentPageGate` dùng chung cho các trang chuyên biệt
- **Goal:** Cung cấp component `StudentPageGate` chuẩn hóa xử lý trạng thái loading, lỗi `NOT_LINKED`, lỗi HTTP khác, và redirect `/onboarding` trước khi render nội dung trong `StudentShell`.
- **Target files and symbols:** `apps/student/src/components/layout/student-page-gate.tsx` (`StudentPageGate`).
- **Steps:**
  1. Tạo `apps/student/src/components/layout/student-page-gate.tsx` nhận `{ sessionEmail?: string; children: (me: StudentMe) => ReactNode }`.
  2. Gọi `const meQuery = useStudentMe()`.
  3. Nếu `meQuery.isLoading`, trả về `<Loader />`.
  4. Nếu `meQuery.error`, lấy `code = isHttpError(meQuery.error) ? meQuery.error.code : undefined`; nếu `code === STUDENT_ERROR_CODES.NOT_LINKED` trả về `<StudentShell userEmail={sessionEmail}><StudentErrorView code={code} userEmail={sessionEmail} /></StudentShell>`, ngược lại trả về `<StudentErrorView code={code} userEmail={sessionEmail} />`.
  5. Nếu `meQuery.data?.student.onboardingCompletedAt == null`, trả về `<Navigate to="/onboarding" />`.
  6. Nếu `!meQuery.data`, trả về `<Loader />`; ngược lại trả về `<StudentShell userName={meQuery.data.student.name} userEmail={meQuery.data.user.email}>{children(meQuery.data)}</StudentShell>`.
- **Success criteria:** `pnpm --filter student check-types` chạy thành công với mã thoát 0.
- **Verify:** `pnpm --filter student check-types` exits 0.
## Todo

- [x] Tạo `apps/student/src/components/layout/student-nav.tsx`
- [x] Cập nhật `apps/student/src/components/layout/student-shell.tsx`
- [x] Thêm `useStudentInvoices` vào `apps/student/src/lib/repos/student.ts` và dùng trong `index.tsx`
- [x] Tạo `apps/student/src/components/layout/student-page-gate.tsx`

## Success Criteria

- `StudentShell` render `<nav aria-label="Điều hướng học viên">` với 5 mục, không sinh duplicate link trong DOM, không tràn ngang ở 375px / 768px / 1440px.
- `useStudentInvoices` dùng `queryKey: ["student", "invoices"]` để tự động invalidate khi đổi tổ chức qua `OrgSwitcher`.

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
