---
phase: 2
title: "Phase 2: Giao diện hàng chờ chấm giáo viên (/grading) & điều hướng"
status: completed
priority: P1
effort: "2.5h"
dependencies: [1]
---

# Phase 2: Giao diện hàng chờ chấm giáo viên (`/grading`) & điều hướng

<!-- Updated: Validation & Red-Team Session 1 - routes-matcher.ts exact route, grading.test.ts repo test, aria-label on row links, validateSearch normalization -->

## Goal

Bổ sung hàm fetch/query cho hàng chờ chấm ở `apps/web` (kèm unit test), bật mục nav `Chấm bài` trong nhóm `IELTS` trên sidebar kèm breadcrumb và allowlist SPA route `/grading` trong `routes-matcher.ts`, xây dựng trang danh sách `/grading` với bộ lọc URL (`?q=&mode=&skill=&status=`) theo chuẩn `DESIGN.md` v2 & `REVIEW.md`, và cập nhật `/grading/$attemptId` hỗ trợ điều hướng quay lại hàng chờ chấm cho bài tự luyện.

## Files to Create / Modify

- Modify: `apps/web/src/lib/repos/grading.ts`
- Modify: `apps/web/src/lib/repos/grading.test.ts`
- Modify: `apps/web/src/components/layout/sidebar.tsx`
- Modify: `apps/web/src/components/layout/sidebar.test.tsx`
- Modify: `apps/web/src/components/layout/app-shell.tsx`
- Modify: `apps/web/src/routes-matcher.ts`
- Modify: `apps/web/src/routes-matcher.test.ts`
- Modify: `apps/web/src/routes/_auth/grading/$attemptId.tsx`
- Create: `apps/web/src/routes/_auth/grading/index.tsx`
- Create: `apps/web/src/routes/_auth/grading/index.test.tsx`

## Tasks & Steps

### Task 2.1 — Mở rộng repo `grading.ts`, bật nav `Chấm bài` trong `sidebar.tsx` + `app-shell.tsx`, và thêm `/grading` vào `routes-matcher.ts`
- **Goal:** Cung cấp `gradingQueueQueryKey`, `fetchGradingQueue`, `gradingQueueQueryOptions`, bật mục điều hướng `Chấm bài` (`/grading`) trong nhóm `IELTS`, và cho phép `/grading` đi qua SPA route matcher.
- **Target files and symbols:**
  - `apps/web/src/lib/repos/grading.ts`: thêm `gradingQueueQueryKey`, `fetchGradingQueue`, `gradingQueueQueryOptions`.
  - `apps/web/src/lib/repos/grading.test.ts`: thêm unit test cho `fetchGradingQueue` và `gradingQueueQueryOptions`.
  - `apps/web/src/components/layout/sidebar.tsx`: thêm mục `{ key: "grading", label: "Chấm bài", icon: PenLine, href: "/grading" }` vào nhóm `"IELTS"` của `TEACHER_NAV`, thêm `"/grading": "grading"` vào `ACTIVE_KEY_BY_PREFIX`, và cập nhật cả 2 comment ở dòng 21–25 và 116–120.
  - `apps/web/src/components/layout/app-shell.tsx`: thêm `"/_auth/grading/": ["Chấm bài"]`, `"/_auth/grading": ["Chấm bài"]`, `"/_auth/grading/$attemptId": ["Chấm bài"]` vào `ROUTE_CRUMBS`, và cập nhật comment ở dòng 27–30.
  - `apps/web/src/routes-matcher.ts`: thêm `"/grading": true` vào `VALID_EXACT_ROUTES`.
  - `apps/web/src/routes-matcher.test.ts`: thêm `"/grading"` vào `validStaticRoutes` và bỏ dòng `expect(isValidAppRoute("/grading")).toBe(false)`.
  - `apps/web/src/components/layout/sidebar.test.tsx`: cập nhật kỳ vọng cho `TEACHER_NAV` (`/grading` → `"Chấm bài"` trong nhóm `"IELTS"`) và `teacherActiveKey("/grading")` / `teacherActiveKey("/grading/a-1")` trả `"grading"`.
- **Steps:**
  1. Trong `apps/web/src/lib/repos/grading.ts`, import `GradingQueueResponse`, `gradingQueueResponseSchema` từ `@teacher-os/api/contracts`. Thêm:
     - `export const gradingQueueQueryKey = ["kernel", "grading", "queue"] as const;`
     - `export async function fetchGradingQueue(baseUrl: string = getApiBaseUrl(), signal?: AbortSignal): Promise<GradingQueueResponse>` gọi `gradingFetch("", { signal }, "load grading queue", baseUrl)` và parse bằng `gradingQueueResponseSchema.parse(await res.json())`.
     - `export function gradingQueueQueryOptions(baseUrl = getApiBaseUrl())` trả `queryOptions({ queryKey: gradingQueueQueryKey, queryFn: ({ signal }) => fetchGradingQueue(baseUrl, signal) })`.
  2. Trong `apps/web/src/lib/repos/grading.test.ts`, thêm test kiểm tra `fetchGradingQueue` gọi `GET ${BASE}/api/grading` với `credentials: "include"` và parse `items`, cũng như ném `HttpError` khi lỗi.
  3. Trong `apps/web/src/components/layout/sidebar.tsx`, import `PenLine` từ `lucide-react`, thêm mục `grading` (`label: "Chấm bài"`, `href: "/grading"`, `icon: PenLine`) vào nhóm `"IELTS"` (ngay sau `"assignments"`), thêm `"/grading": "grading"` vào `ACTIVE_KEY_BY_PREFIX`, và cập nhật comment ở dòng 21–25 và 116–120.
  4. Trong `apps/web/src/components/layout/app-shell.tsx`, thêm các khóa `/_auth/grading`, `/_auth/grading/`, `/_auth/grading/$attemptId` vào `ROUTE_CRUMBS` với giá trị `["Chấm bài"]` và cập nhật comment ở dòng 27–30.
  5. Trong `apps/web/src/routes-matcher.ts`, thêm `"/grading": true` vào `VALID_EXACT_ROUTES`; cập nhật `apps/web/src/routes-matcher.test.ts` và `apps/web/src/components/layout/sidebar.test.tsx`.
- **Success criteria:** Unit tests `grading.test.ts`, `sidebar.test.tsx`, và `routes-matcher.test.ts` đều xanh.
- **Verify:** `pnpm --filter web test -- src/lib/repos/grading.test.ts src/components/layout/sidebar.test.tsx src/routes-matcher.test.ts` thoát với exit code `0` và in `passed`.

### Task 2.2 — Viết unit tests cho trang `/grading` và `/grading/$attemptId` (TDD Red Phase)
- **Goal:** Viết unit test kiểm chứng bộ lọc URL, `validateSearch`, đếm chip chéo nhóm, hiển thị nhãn `Luyện tập`, trạng thái `Chờ chấm` / `Đã chấm · Band X.X`, `aria-label` trên link từng dòng ở `/grading`, cũng như link quay lại `/grading` và ẩn `· Hạn ...` trên `/grading/$attemptId` khi bài nộp là `practice`.
- **Target files and symbols:**
  - `apps/web/src/routes/_auth/grading/index.test.tsx`: tạo file test mới cho `GradingQueueRoute`, `validateSearch`, và hành vi của `GradingRoute` (`$attemptId.tsx`) với bài nộp `practice`.
- **Steps:**
  1. Tạo `apps/web/src/routes/_auth/grading/index.test.tsx` kiểm tra:
     - `Route.options.validateSearch` chuẩn hóa giá trị lạ (ví dụ `?mode=xyz&skill=reading&status=foo`) về `undefined` (để UI rơi về `"all"`), giữ nguyên giá trị hợp lệ (`mode: "assignment" | "practice"`, `skill: "writing" | "speaking"`, `status: "awaiting" | "graded"`, `q`).
     - Hiển thị danh sách bài nộp từ `GET /api/grading`, phân biệt dòng bài tập lớp (hiển thị tên lớp + hạn nộp) và dòng tự luyện (hiển thị tag `Luyện tập`, không có hạn nộp).
     - Hiển thị trạng thái `Chờ chấm` (link `Chấm bài` có `aria-label="Chấm bài của <tên học viên>"`) cho bài chưa chấm và `Đã chấm · Band 6.5` (link `Xem / sửa điểm` có `aria-label="Xem / sửa điểm của <tên học viên>"`) cho bài đã chấm.
     - Bộ lọc theo nguồn bài (`Tất cả`, `Bài tập lớp`, `Luyện tập` ↔ `?mode=assignment|practice`), kỹ năng (`Tất cả`, `Writing`, `Speaking` ↔ `?skill=writing|speaking`), trạng thái (`Tất cả`, `Chờ chấm`, `Đã chấm` ↔ `?status=awaiting|graded`), và ô tìm kiếm debounce 300ms đẩy `?q=` lên URL (không đẩy tham số mặc định `"all"` hay `q=""` lên URL).
     - Số đếm trên từng chip (`counts`) phản ánh đúng số bài khớp với các bộ lọc của nhóm **khác**; nút `Xóa bộ lọc` xuất hiện khi có filter đang bật và xóa sạch về mặc định.
     - Empty state khi tổ chức chưa có bài nộp nào và khi không có bài khớp bộ lọc.
     - Trên `/grading/$attemptId` (`GradingRoute`): khi submission có `practice: true` (`classId: ""`, `due: ""`), hiển thị link `← Về hàng chờ chấm` (trỏ tới `/grading`) thay vì `← Về lớp`, không hiển thị chữ `Hạn` trên kicker, và khi lưu điểm thành công thì invalidate `gradingQueueQueryKey`.
- **Success criteria:** Chạy test báo lỗi thiếu module `./index` (Red phase).
- **Verify:** `pnpm --filter web test -- src/routes/_auth/grading/index.test.tsx` thoát với exit code khác `0` (Red phase).

### Task 2.3 — Triển khai trang `/grading` (`apps/web/src/routes/_auth/grading/index.tsx`) và cập nhật `/grading/$attemptId.tsx` (TDD Green Phase)
- **Goal:** Tạo trang hàng chờ chấm `/grading` đạt chuẩn `DESIGN.md` v2 & `REVIEW.md` và cập nhật `/grading/$attemptId.tsx` cho bài tự luyện.
- **Target files and symbols:**
  - `apps/web/src/routes/_auth/grading/index.tsx`: tạo route `/_auth/grading/` (`GradingQueueRoute`).
  - `apps/web/src/routes/_auth/grading/$attemptId.tsx`: cập nhật `GradingRoute`.
- **Steps:**
  1. Tạo `apps/web/src/routes/_auth/grading/index.tsx`:
     - Khai báo `Route = createFileRoute("/_auth/grading/")` với `validateSearch`: nhận input tùy chọn `{ q?: string; mode?: string; skill?: string; status?: string }`, chỉ giữ `mode` nếu là `"assignment"` hoặc `"practice"`, `skill` nếu là `"writing"` hoặc `"speaking"`, `status` nếu là `"awaiting"` hoặc `"graded"`, và `q` nếu là chuỗi không rỗng; giá trị khác trả `undefined`.
     - Dùng `useQuery(gradingQueueQueryOptions())` để tải danh sách hàng chờ chấm; xử lý `401` bằng `reauth()`, trạng thái đang tải và lỗi tải dữ liệu.
     - Chuẩn hóa bộ lọc từ URL:
       - `modeFilter`: `"all" | "assignment" | "practice"` (nhãn chip: `"Tất cả"`, `"Bài tập lớp"`, `"Luyện tập"`).
       - `skillFilter`: `"all" | "writing" | "speaking"` (nhãn chip: `"Tất cả"`, `"Writing"`, `"Speaking"`).
       - `statusFilter`: `"all" | "awaiting" | "graded"` (nhãn chip: `"Tất cả"`, `"Chờ chấm"`, `"Đã chấm"`).
       - `query`: state local đồng bộ 2 chiều với `searchParams.q`, debounce 300ms mới gọi `navigate({ to: "/grading", search: filtersToSearch(...), replace: true })` (trong đó `filtersToSearch` lược bỏ các giá trị mặc định `"all"` và `q` rỗng); so khớp không dấu qua `normalizeVi` trên `student.name`, `title`, `className`.
     - Tính `counts` cho từng nhóm `ChipFilter` dựa trên tập dữ liệu đã áp dụng các bộ lọc của nhóm **khác** (cross-faceted counts):
       - `modeChipCounts`: lọc theo `q`, `skillFilter`, `statusFilter` rồi đếm `"Bài tập lớp"` (`mode === "assignment"`) và `"Luyện tập"` (`mode === "practice"`).
       - `skillChipCounts`: lọc theo `q`, `modeFilter`, `statusFilter` rồi đếm `"Writing"` và `"Speaking"`.
       - `statusChipCounts`: lọc theo `q`, `modeFilter`, `skillFilter` rồi đếm `"Chờ chấm"` (`grade === null`) và `"Đã chấm"` (`grade !== null`).
     - Dưới `lg`: card bộ lọc có nút gập/mở (`Bộ lọc`, `aria-expanded`, `aria-controls="grading-filters-body"`, badge số filter đang bật).
     - Một vùng `aria-live="polite"` duy nhất hiển thị số kết quả (`Đang hiển thị X / Y bài nộp` hoặc `X bài nộp`) kèm nút `Xóa bộ lọc` khi `hasActiveFilter`.
     - Bảng `DataTable` bọc trong khối `min-w-0` với các cột `["Học viên", "Đề bài", "Nguồn / Lớp", "Nộp lúc", "Trạng thái", ""]`:
       - Học viên: `Avatar` (`initialsFromName(item.student.name)`) + tên học viên.
       - Đề bài: `item.title` + dòng phụ kỹ năng & phần thi (`partOf(item.skill, item.part).label`).
       - Nguồn / Lớp: nếu `item.mode === "practice"` hiện `<Tag>Luyện tập</Tag>`; nếu `item.mode === "assignment"` hiện tên lớp + `Hạn ${fmtDue(item.due)}` (khi có `due`).
       - Nộp lúc: `fmtWhen(item.submittedAt)`.
       - Trạng thái: nếu `item.grade` hiện `<StatusTag tone="ok">{`Đã chấm · Band ${formatBand(item.grade.band)}`}</StatusTag>`, ngược lại `<StatusTag tone="warn">Chờ chấm</StatusTag>`.
       - Hành động: `<Link to="/grading/$attemptId" params={{ attemptId: item.attemptId }} aria-label={item.grade ? `Xem / sửa điểm của ${item.student.name}` : `Chấm bài của ${item.student.name}`} ...>` với nhãn `"Chấm bài"` (khi chưa chấm) hoặc `"Xem / sửa điểm"` (khi đã chấm).
  2. Cập nhật `apps/web/src/routes/_auth/grading/$attemptId.tsx`:
     - Trong `mutation.onSuccess(grade)`, invalidate thêm `gradingQueueQueryKey` (`void queryClient.invalidateQueries({ queryKey: gradingQueueQueryKey })`).
     - Ở link quay lại phía trên `PageHead` (khi đã có `data`; giữ nguyên link `/classes` trong card lỗi khi không có `data`): nếu `data.practice || !data.classId`, render `<Link to="/grading" search={{ mode: "practice" }} ...>← Về hàng chờ chấm</Link>`; nếu có `data.classId`, giữ nguyên `<Link to="/classes/$classId" params={{ classId: data.classId }} search={{ tab: "assignments" }}>← Về lớp</Link>`.
     - Ở `PageHead.kicker`: chỉ hiển thị ` · Hạn {fmtDue(data.due)}` khi `Boolean(data.due)`.
- **Success criteria:** Unit test `apps/web/src/routes/_auth/grading/index.test.tsx` và toàn bộ test liên quan của `apps/web` vượt qua, typecheck sạch.
- **Verify:** `pnpm --filter web test -- src/routes/_auth/grading/index.test.tsx src/lib/repos/grading.test.ts src/components/layout/sidebar.test.tsx src/routes-matcher.test.ts` và `pnpm --filter web check-types` đều thoát với exit code `0`.

## Verification

- `pnpm --filter web test -- src/routes/_auth/grading/index.test.tsx src/lib/repos/grading.test.ts src/components/layout/sidebar.test.tsx src/routes-matcher.test.ts src/components/command-search/search-index.test.ts`
- `pnpm --filter web check-types`

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