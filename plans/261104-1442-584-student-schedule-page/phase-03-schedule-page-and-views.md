# Phase 3: Giao diện Trang Lịch học và Tests

## Goal
Tạo giao diện trang lịch học `StudentScheduleView` theo đúng `DESIGN.md`, thiết lập route `/_auth/schedule.tsx` bọc trong `StudentPageGate`, cập nhật `routeTree.gen.ts`, và viết component tests kiểm thử toàn diện trạng thái lọc, hiển thị danh sách bài học gộp, và empty states với `now` inject xác định.

## Target files and symbols
- `apps/student/src/components/schedule/student-schedule-view.tsx`:
  - `StudentScheduleView` component với prop `now?: Date`
  - Segmented tabs: `upcoming` (Sắp tới), `completed` (Đã học), `all` (Tất cả)
  - Bộ lọc chọn lớp học (fallback an toàn khi `classId` không khớp)
  - Khối hiển thị lịch định kỳ của từng lớp
  - Thẻ buổi học với trạng thái, ngày giờ VN, topic, và nút chuyển sang chi tiết lớp
- `apps/student/src/routes/_auth/schedule.tsx`:
  - Route component `SchedulePage`
  - Bọc bởi `StudentPageGate`
  - Tải dữ liệu bằng `useStudentSchedule`
  - Xử lý Loader và StudentErrorView
- `apps/student/src/routeTree.gen.ts`:
  - Cập nhật route tree tự động bằng build/dev tool
- `apps/student/src/components/schedule/student-schedule-view.test.tsx`:
  - Component tests cho giao diện trang lịch học với `now` cố định

## Tasks & Steps

### Task 3.1 — Xây dựng Component StudentScheduleView
- Goal: Tạo component giao diện hiển thị lịch học của học viên tuân thủ tiêu chuẩn DESIGN.md và hỗ trợ inject `now`.
- Target files: `apps/student/src/components/schedule/student-schedule-view.tsx`
- Steps:
  1. Khai báo props:
     ```ts
     export interface StudentScheduleViewProps {
       classes: StudentClass[];
       lessons: StudentScheduleLesson[];
       now?: Date;
       selectedTab?: "upcoming" | "completed" | "all";
       onTabChange?: (tab: "upcoming" | "completed" | "all") => void;
       selectedClassId?: string;
       onClassChange?: (classId: string) => void;
     }
     ```
  2. Xử lý logic lọc thời gian:
     - Dùng `const currentNow = now ?? new Date();` và `const todayISO = vietnamTodayISO(currentNow);`.
     - Phân loại trạng thái buổi học:
       - Buổi có ngày (`date != null`):
         - Buổi `upcoming` có `!isLessonEnded(lesson, currentNow)` và `date >= todayISO`: thuộc nhóm Sắp tới.
         - Buổi `cancelled` hoặc `holiday` có `date >= todayISO`: hiển thị trong tab Sắp tới kèm badge riêng cảnh báo để học viên biết buổi này không học.
         - Buổi có `isLessonEnded(lesson, currentNow)` hoặc `status === "completed"` hoặc `status === "absent"` hoặc (`cancelled`/`holiday` đã qua ngày): thuộc nhóm Đã học.
       - Buổi legacy (`date == null`):
         - Hiển thị theo thứ tự heuristic của từng lớp; trong tab Sắp tới chỉ hiện các buổi có `status === "upcoming"`.
     - Buổi kế tiếp (Next session highlight):
       - Tìm buổi học đầu tiên có `date != null`, `status === "upcoming"`, `date >= todayISO`, `!isLessonEnded(lesson, currentNow)` trong danh sách đã sắp xếp. Đánh dấu `isNext = true` với viền `ring-[3px] ring-ring/30`.
  3. Header & Giao diện:
     - Kicker: `font-mono text-[11px] text-primary uppercase tracking-[0.2em]`: "Lịch học · {classes.length} lớp"
     - Title: `text-2xl md:text-3xl font-semibold tracking-tight text-foreground`: "Lịch học của tôi"
     - Subtitle: `text-sm text-muted-foreground`: "Lịch các buổi học từ tất cả các lớp bạn đang tham gia."
  4. Section 1: "Lịch định kỳ các lớp":
     - Hiển thị danh sách card dạng lưới các lớp đang học:
       - Tên lớp (`cls.name`), level, mode.
       - Lịch học tuần: `formatSchedule(cls.schedule)` kèm icon `Clock`.
       - Giáo viên: `cls.teacher?.name ?? "Chưa phân công"` kèm icon `UserRound`.
       - Link tới `/classes/$classId`.
  5. Section 2: "Danh sách buổi học":
     - Segmented Tabs: "Sắp tới" (mặc định), "Đã học", "Tất cả".
     - Chip filter chọn lớp (khi `classes.length >= 2`): "Tất cả lớp" và các chip tên lớp. Nếu `selectedClassId` không tồn tại trong `classes`, tự động fallback về "Tất cả lớp".
     - Thẻ buổi học:
       - Ngày giờ VN (`formatVietnamDateFromISO`), `HH:mm`, `{lesson.dur} phút`.
       - Badge tên lớp kèm link tới `/classes/$classId`.
       - Topic của buổi học.
       - Badge trạng thái (`upcoming`, `completed`, `absent`, `cancelled`, `holiday`, `ended`).
  6. Empty States bằng `OverviewEmptyState`:
     - Khi `classes.length === 0`: "Bạn chưa tham gia lớp học nào"
     - Khi tab "Sắp tới" rỗng: "Không có buổi học sắp tới"
     - Khi bộ lọc không có buổi nào: "Không tìm thấy buổi học phù hợp"
- Success criteria: `pnpm --filter student check-types` exits 0.
- Verify: `pnpm --filter student check-types` exits 0.

### Task 3.2 — Tạo Route apps/student/src/routes/_auth/schedule.tsx và cập nhật routeTree.gen.ts
- Goal: Định nghĩa file route cho `/schedule` trong cổng học viên và tái sinh routeTree.
- Target files: `apps/student/src/routes/_auth/schedule.tsx`, `apps/student/src/routeTree.gen.ts`
- Steps:
  1. Tạo file `apps/student/src/routes/_auth/schedule.tsx`:
     ```ts
     import { createFileRoute } from "@tanstack/react-router";
     import { StudentPageGate } from "@/components/layout/student-page-gate";
     import Loader from "@/components/loader";
     import { StudentErrorView } from "@/components/overview/student-error-view";
     import { StudentScheduleView } from "@/components/schedule/student-schedule-view";
     import { isHttpError } from "@/lib/query-client";
     import { useStudentSchedule } from "@/lib/repos/student";

     export const Route = createFileRoute("/_auth/schedule")({
       validateSearch: (search: Record<string, unknown>): { tab?: string; classId?: string } => ({
         tab: typeof search.tab === "string" ? search.tab : undefined,
         classId: typeof search.classId === "string" ? search.classId : undefined,
       }),
       component: StudentSchedulePage,
     });
     ```
  2. Component `StudentSchedulePage`:
     - Bọc bởi `StudentPageGate`.
     - Sử dụng `useStudentSchedule({ refetchOnMount: "always", refetchOnWindowFocus: "always" })`.
     - Render `Loader` khi loading.
     - Render `StudentErrorView` khi lỗi.
     - Render `StudentScheduleView` với `classes` và `lessons` khi thành công.
  3. Chạy `pnpm --filter student build` để router plugin tự động cập nhật `apps/student/src/routeTree.gen.ts`.
- Success criteria: `routeTree.gen.ts` nhận diện route `/_auth/schedule` và `pnpm --filter student check-types` exits 0.
- Verify: `pnpm --filter student check-types` exits 0.

### Task 3.3 — Viết Component Tests cho StudentScheduleView
- Goal: Viết bộ test trong `apps/student/src/components/schedule/student-schedule-view.test.tsx` kiểm tra các tương tác giao diện và bộ lọc.
- Target files: `apps/student/src/components/schedule/student-schedule-view.test.tsx`
- Steps:
  1. Tạo file test với mock dữ liệu gồm 2 lớp (1 lớp thường, 1 lớp legacy) và các buổi học (sắp tới, đã học, vắng, hủy, legacy).
  2. Test 1: Khối lịch định kỳ hiển thị đủ các lớp và lịch tuần (`formatSchedule`).
  3. Test 2: Tab "Sắp tới" chỉ hiển thị các buổi học trong tương lai (dựa trên `now` cố định) và đánh dấu đúng buổi kế tiếp.
  4. Test 3: Tab "Đã học" hiển thị các buổi trong quá khứ và buổi đã hoàn thành.
  5. Test 4: Tab "Tất cả" hiển thị đầy đủ mọi buổi học.
  6. Test 5: Chip lọc lớp hoạt động chính xác khi bấm chọn một lớp cụ thể.
  7. Test 6: Empty states hiển thị đúng thông điệp khi không có lớp hoặc không có buổi học.
- Success criteria: Toàn bộ tests chạy pass 100%.
- Verify: `pnpm --filter student test src/components/schedule/student-schedule-view.test.tsx` exits 0.

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
