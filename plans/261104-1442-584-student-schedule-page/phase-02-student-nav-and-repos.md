# Phase 2: Student Nav và Data Repository

## Goal
Tích hợp client repo functions và React Query hooks cho endpoint lịch học trong `apps/student/src/lib/repos/student.ts`, đồng thời cập nhật thanh điều hướng học viên trong `apps/student/src/components/layout/student-nav.tsx` để có mục "Lịch học" hoàn chỉnh với nhãn, icon và URL matching.

## Target files and symbols
- `apps/student/src/lib/repos/student.ts`:
  - `fetchStudentSchedule`
  - `useStudentSchedule`
- `apps/student/src/components/layout/student-nav.tsx`:
  - `STUDENT_NAV`: thêm item `{ key: "schedule", label: "Lịch học", icon: CalendarDays, href: "/schedule" }`
  - `ACTIVE_KEY_BY_PREFIX`: thêm `"/schedule": "schedule"`
  - `STUDENT_PAGE_LABEL`: thêm `schedule: "Lịch học"`
- `apps/student/src/components/layout/student-nav.test.tsx`:
  - Kiểm thử render navigation item "Lịch học" và active key behavior.

## Tasks & Steps

### Task 2.1 — Bổ sung API client repository và React Query Hook
- Goal: Cung cấp hàm fetch và hook React Query `useStudentSchedule` trong student portal.
- Target files: `apps/student/src/lib/repos/student.ts`
- Steps:
  1. Import `type StudentScheduleResponse` và `studentScheduleResponseSchema` từ `@teacher-os/api/contracts`.
  2. Viết hàm `fetchStudentSchedule`:
     ```ts
     export async function fetchStudentSchedule(): Promise<StudentScheduleResponse> {
       const res = await fetch(`${getApiBaseUrl()}/api/student/schedule`, {
         method: "GET",
         headers: getStudentHeaders(),
         credentials: "include",
       });
       if (!res.ok) {
         let code: string | undefined;
         try {
           const body = (await res.json()) as { code?: string; error?: string };
           code = body.code ?? body.error;
         } catch {
           // Non-JSON body
         }
         throw new HttpError(res.status, `Request failed with status ${res.status}`, { code });
       }
       const data = (await res.json()) as unknown;
       return studentScheduleResponseSchema.parse(data);
     }
     ```
  3. Viết hook `useStudentSchedule`:
     ```ts
     export function useStudentSchedule(options?: {
       refetchOnMount?: boolean | "always";
       refetchOnWindowFocus?: boolean | "always";
     }) {
       const activeOrgId = getActiveStudentOrgId();
       return useQuery({
         queryKey: ["student", "schedule", activeOrgId],
         queryFn: fetchStudentSchedule,
         ...options,
       });
     }
     ```
- Success criteria: `pnpm --filter student check-types` exits 0.
- Verify: `pnpm --filter student check-types` exits 0.

### Task 2.2 — Cập nhật Menu Điều hướng Học viên và Active Keys
- Goal: Hiển thị mục "Lịch học" trên sidebar / drawer của học viên và hỗ trợ breadcrumb đúng nhãn.
- Target files: `apps/student/src/components/layout/student-nav.tsx`
- Steps:
  1. Trong `apps/student/src/components/layout/student-nav.tsx`, import `CalendarDays` từ `lucide-react`.
  2. Cập nhật `STUDENT_NAV`:
     ```ts
     export const STUDENT_NAV: NavGroup[] = [
       {
         group: "Học tập",
         items: [
           { key: "overview", label: "Tổng quan", icon: LayoutDashboard, href: "/" },
           { key: "classes", label: "Lớp học", icon: School, href: "/classes" },
           { key: "schedule", label: "Lịch học", icon: CalendarDays, href: "/schedule" },
           {
             key: "assignments",
             label: "Bài tập",
             icon: ClipboardList,
             href: "/assignments",
           },
           ...(PRACTICE_ROUTES_LIVE ? PRACTICE_HISTORY_ITEMS : []),
           { key: "tuition", label: "Học phí", icon: Wallet, href: "/tuition" },
         ],
       },
     ];
     ```
  3. Cập nhật `ACTIVE_KEY_BY_PREFIX`:
     Thêm `"/schedule": "schedule"`.
  4. Cập nhật `STUDENT_PAGE_LABEL`:
     Thêm `schedule: "Lịch học"`.
- Success criteria: Menu học viên có mục "Lịch học" dẫn tới `/schedule`.
- Verify: `pnpm --filter student check-types` exits 0.

### Task 2.3 — Viết Unit Tests cho Navigation
- Goal: Xác minh mục menu "Lịch học" xuất hiện với đầy đủ thuộc tính và breadcrumb mapping.
- Target files: `apps/student/src/components/layout/student-nav.test.tsx`
- Steps:
  1. Tạo hoặc cập nhật file test `student-nav.test.tsx`.
  2. Viết kiểm thử xác nhận `STUDENT_NAV` chứa item có `key: "schedule"`, `href: "/schedule"`, `label: "Lịch học"`.
  3. Viết kiểm thử xác nhận `STUDENT_PAGE_LABEL["schedule"] === "Lịch học"`.
  4. Viết kiểm thử xác nhận `ACTIVE_KEY_BY_PREFIX["/schedule"] === "schedule"`.
- Success criteria: Test suite chạy thành công.
- Verify: `pnpm --filter student test src/components/layout/student-nav.test.tsx` exits 0.

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
