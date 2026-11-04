---
phase: 1
title: "Phase 1: Dynamic Student Vocab CTA & Empty-State Honesty"
status: completed
priority: P1
effort: 1.5h
dependencies: []
---

# Phase 1: Dynamic Student Vocab CTA & Empty-State Honesty

<!-- Updated: Red-Team Session 1 - parallel useVocabLibraryCourses in VocabOverviewPage, empty-library copy in VocabCoursesCatalogView, Navigate router mock, settled fetch & HTTP 500 tests -->

## Goal

Thay toàn bộ chuỗi số lượng khóa/bài cố định trên Student Portal (`/practice/vocabulary`, `/practice/vocabulary/courses`, và `/`) bằng dữ liệu thực tế từ `useVocabLibraryCourses()` (nạp song song không gây waterfall/CLS), ẩn `VocabCoursesCta` khi thư viện rỗng/lỗi/đang tải, gỡ câu tham chiếu treo ở `vocab-decks-empty`, và phân biệt rõ trạng thái thư viện chưa có nội dung với trạng thái tìm kiếm không khớp.

## Files to Create / Modify

- Modify: `apps/student/src/components/vocab/vocab-courses-cta.tsx` — thêm interface `VocabLibrarySummary`, helper thuần `deriveVocabLibrarySummary(courses)` và chuyển `VocabCoursesCta` sang nhận prop `{ summary: VocabLibrarySummary | null }`.
- Modify: `apps/student/src/routes/_auth/practice/vocabulary/index.tsx` — gọi `useVocabLibraryCourses()` song song trong `VocabOverviewPage` (kèm `libraryCoursesQuery.isLoading` trong cổng `<Loader />`), tách và export `VocabOverviewContent` nhận `librarySummary: VocabLibrarySummary | null`, điều chỉnh thông điệp `vocab-decks-empty` và truyền `summary={librarySummary}` xuống `VocabCoursesCta`.
- Modify: `apps/student/src/routes/_auth/practice/vocabulary/courses/index.tsx` — trong `VocabCoursesCatalogView`, khi `courses.length === 0` (thư viện trống hoàn toàn, kể cả khi chưa nhập từ khóa tìm kiếm) hiển thị `"Thư viện khóa học từ vựng hiện chưa có nội dung."`, giữ `"Không tìm thấy khóa học từ vựng phù hợp."` cho trường hợp `courses.length > 0 && filteredCourses.length === 0`.
- Modify: `apps/student/src/routes/_auth/index.tsx` — export `StudentVocabEntrySection` + helper thuần `deriveStudentHomeVocabSubtitle(deckCount, summary)`, gọi `useVocabLibraryCourses()` để hiển thị số khóa động hoặc ẩn quảng cáo khóa học khi thư viện rỗng/lỗi.
- Modify: `apps/student/src/components/vocab/vocab-course-catalog.test.tsx` — cập nhật mock `@tanstack/react-router` (bổ sung `Navigate: () => null`), viết bài test TDD cho `deriveVocabLibrarySummary`, `VocabCoursesCta`, `VocabOverviewContent`, `VocabCoursesCatalogView` (thư viện rỗng vs lọc rỗng), và `StudentVocabEntrySection` (bao gồm cả trường hợp `{ courses: [] }` đã settle và HTTP `500`).
- Modify: `apps/e2e/specs/vocab-library-clone.spec.ts` — bổ sung khẳng định `vocab-courses-cta` hiển thị đúng `"Thư viện từ vựng · 20 khóa · 968 bài"` từ dữ liệu seed E2E.

## Tasks & Steps

### Task 1.1 — Viết failing tests (TDD Red) cho CTA động, empty-state `/practice/vocabulary`, catalog rỗng và thẻ trang chủ `/`
- **Goal**: Thiết lập bộ unit/integration test thất bại trước khi sửa code UI, bao phủ đầy đủ trường hợp thư viện có dữ liệu, rỗng (`courses: []`), tổng `deckCount === 0`, lọc không khớp, và lỗi API HTTP `500` mà không bị pass giả ở Frame 0 (`isLoading`).
- **Target files and symbols**:
  - `apps/student/src/components/vocab/vocab-course-catalog.test.tsx` (cập nhật `vi.mock("@tanstack/react-router", ...)` và thêm imports từ `./vocab-courses-cta`, `@/routes/_auth/practice/vocabulary/index`, `@/routes/_auth/index`).
- **Steps**:
  1. Trong `apps/student/src/components/vocab/vocab-course-catalog.test.tsx`, bổ sung `Navigate: () => null` vào object trả về của `vi.mock("@tanstack/react-router", ...)` để import `@/routes/_auth/index` không nổ lỗi thiếu export trên Vitest 4 ESM.
  2. Import `deriveVocabLibrarySummary` từ `./vocab-courses-cta`, `VocabOverviewContent` từ `@/routes/_auth/practice/vocabulary/index`, và `deriveStudentHomeVocabSubtitle`, `StudentVocabEntrySection` từ `@/routes/_auth/index`.
  3. Cập nhật test `"VocabCoursesCta renders dashboard link to /practice/vocabulary/courses"`:
     - `<VocabCoursesCta summary={null} />` không render `vocab-courses-cta`.
     - `<VocabCoursesCta summary={{ courseCount: 2, lessonCount: 90 }} />` render link `/practice/vocabulary/courses` có text `"Thư viện từ vựng · 2 khóa · 90 bài"`.
  4. Thêm test cho `deriveVocabLibrarySummary` và `deriveStudentHomeVocabSubtitle`:
     - `deriveVocabLibrarySummary`: trả `null` với `undefined`, `null`, `[]`, hoặc `[{ deckCount: 0 }, { deckCount: 0 }]`; trả `{ courseCount: 2, lessonCount: 90 }` với `[{ deckCount: 50 }, { deckCount: 40 }]`.
     - `deriveStudentHomeVocabSubtitle`: kiểm tra đủ 4 tổ hợp (`deckCount = 0 | 3` × `summary = null | { courseCount: 20, lessonCount: 968 }`).
  5. Thêm test cho `VocabOverviewContent` với fixture `VocabOverview` hợp lệ:
     - Khi `librarySummary={null}` và `decks: []`: `vocab-courses-cta` không tồn tại trên DOM, và `vocab-decks-empty` có text `"Đợi giáo viên giao bộ từ cho lớp của bạn."` (không chứa `"bên dưới"`).
     - Khi `librarySummary={{ courseCount: 2, lessonCount: 90 }}` và `decks: []`: `vocab-courses-cta` hiển thị `"Thư viện từ vựng · 2 khóa · 90 bài"` và `vocab-decks-empty` chứa `"Mở mục Khóa học từ vựng bên dưới"`.
  6. Thêm integration test cho `VocabCoursesCatalogView` khi API `/api/student/vocab/library/courses` trả `{ courses: [] }` (chờ `vocab-courses-loading` biến mất trước khi assert!): `vocab-courses-empty` hiển thị `"Thư viện khóa học từ vựng hiện chưa có nội dung."`; còn khi API trả 2 khóa nhưng search `"ZZZZ"` không khớp (sau debounce 350ms) thì `vocab-courses-empty` hiển thị `"Không tìm thấy khóa học từ vựng phù hợp."`.
  7. Thêm integration test cho `StudentVocabEntrySection` với fixture `VocabOverview` đầy đủ 11 trường `.strict()` (`dueCount`, `nextDueAt`, `upcomingCount`, `learnedCount`, `matureCount`, `levelDistribution` 5 phần tử, `streak`, `retention`, `forecast` 7 phần tử, `decks`, `suggestions`):
     - Kịch bản thư viện có 2 khóa + 1 bộ đang học: chờ text chuyển sang `"1 bộ từ đang học · 2 khóa học từ vựng có sẵn"`.
     - Kịch bản thư viện rỗng (`{ courses: [] }`) và kịch bản lỗi API (`HTTP 500` trên `/api/student/vocab/library/courses`) với `1` bộ đang học (`decks: [oneDeck]`): chờ text chuyển từ trạng thái ban đầu (`deckCount = 0`) sang `"1 bộ từ đang học"` và sau khi `fetchMock` cho `/api/student/vocab/library/courses` đã được gọi + flush microtasks, khẳng định text **chính xác là** `"1 bộ từ đang học"` (không chứa `"khóa học từ vựng"` hay `"20"` — dùng `deckCount = 1` để chứng minh chắc chắn query đã settle, không thể pass giả ở Frame 0!).
- **Success criteria**: Chạy Vitest cho `vocab-course-catalog.test.tsx` thất bại (exit code khác `0`) do các export/logic mới chưa được cài đặt.
- **Verify**: `pnpm --filter student exec vitest run src/components/vocab/vocab-course-catalog.test.tsx` thoát mã khác `0` (Red phase — passing test ở bước này bị coi là thất bại).

### Task 1.2 — Cài đặt `deriveVocabLibrarySummary` và cập nhật `VocabCoursesCta`
- **Goal**: Biến `VocabCoursesCta` thành pure component nhận `summary` từ dữ liệu API và tự ẩn khi `summary === null`.
- **Target files and symbols**:
  - `apps/student/src/components/vocab/vocab-courses-cta.tsx` (`VocabLibrarySummary`, `deriveVocabLibrarySummary`, `VocabCoursesCta`).
- **Steps**:
  1. Khai báo và export `export interface VocabLibrarySummary { courseCount: number; lessonCount: number }`.
  2. Viết và export `export function deriveVocabLibrarySummary(courses: readonly { deckCount: number }[] | null | undefined): VocabLibrarySummary | null`:
     - Nếu `!courses || courses.length === 0` → trả `null`.
     - Tính `const lessonCount = courses.reduce((sum, c) => sum + c.deckCount, 0);`.
     - Nếu `lessonCount <= 0` → trả `null`.
     - Trả `{ courseCount: courses.length, lessonCount }`.
  3. Cập nhật `export function VocabCoursesCta({ summary }: { summary: VocabLibrarySummary | null })`:
     - Nếu `!summary` → `return null;`.
     - Thay dòng chữ cứng `"Thư viện từ vựng · 20 khóa · 968 bài"` bằng `Thư viện từ vựng · ${summary.courseCount} khóa · ${summary.lessonCount} bài`.
- **Success criteria**: `VocabCoursesCta` không còn bất kỳ con số cố định nào và trả `null` khi `summary` là `null`.
- **Verify**: no verification needed (sẽ được kiểm chứng toàn bộ ở Task 1.3 ngay kế tiếp).

### Task 1.3 — Nối `useVocabLibraryCourses()` song song trên `/practice/vocabulary`, `/practice/vocabulary/courses` và `/` (TDD Green)
- **Goal**: Đồng bộ trạng thái thư viện từ API trên cả 3 route học viên mà không gây waterfall hay giật bố cục, làm xanh toàn bộ unit/integration tests.
- **Target files and symbols**:
  - `apps/student/src/routes/_auth/practice/vocabulary/index.tsx` (`VocabOverviewContent`, `VocabOverviewPage`).
  - `apps/student/src/routes/_auth/practice/vocabulary/courses/index.tsx` (`VocabCoursesCatalogView`).
  - `apps/student/src/routes/_auth/index.tsx` (`deriveStudentHomeVocabSubtitle`, `StudentVocabEntrySection`).
- **Steps**:
  1. Trong `apps/student/src/routes/_auth/practice/vocabulary/index.tsx`:
     - Import `useVocabLibraryCourses` từ `@/lib/repos/vocab` và `deriveVocabLibrarySummary`, `type VocabLibrarySummary` từ `@/components/vocab/vocab-courses-cta`.
     - Trong `VocabOverviewPage`, gọi `const libraryCoursesQuery = useVocabLibraryCourses();` ngay cạnh `useStudentMe()` và `useVocabOverview()` để cả 3 request chạy song song; cập nhật điều kiện loading thành `if (meQuery.isLoading || overviewQuery.isLoading || libraryCoursesQuery.isLoading) { return <Loader />; }` (nếu `libraryCoursesQuery` lỗi mạng, `isLoading` là `false` và `librarySummary` là `null`, trang vẫn hiển thị bình thường không chặn học viên ôn bộ từ lớp).
     - Tính `const librarySummary = libraryCoursesQuery.isSuccess ? deriveVocabLibrarySummary(libraryCoursesQuery.data.courses) : null;`.
     - Tách phần nội dung bên trong `<StudentShell>` thành `export function VocabOverviewContent({ data, librarySummary, busySuggestionId, suggestionError, onAcceptSuggestion, onDismissSuggestion, onExpired }: VocabOverviewContentProps)`.
     - Ở khối `vocab-decks-empty` (`data.decks.length === 0`), nếu `librarySummary !== null` hiển thị `"Mở mục Khóa học từ vựng bên dưới để bắt đầu học ngay, hoặc đợi giáo viên giao bộ từ cho lớp của bạn."`; nếu `librarySummary === null` hiển thị `"Đợi giáo viên giao bộ từ cho lớp của bạn."`.
     - Cuối `VocabOverviewContent`, render `<VocabCoursesCta summary={librarySummary} />`.
  2. Trong `apps/student/src/routes/_auth/practice/vocabulary/courses/index.tsx`:
     - Ở nhánh `filteredCourses.length === 0` (`:103-109`), giữ nguyên `data-testid="vocab-courses-empty"` và đổi nội dung thành `{courses.length === 0 ? "Thư viện khóa học từ vựng hiện chưa có nội dung." : "Không tìm thấy khóa học từ vựng phù hợp."}`.
  3. Trong `apps/student/src/routes/_auth/index.tsx`:
     - Import `useVocabLibraryCourses` từ `@/lib/repos/vocab` và `deriveVocabLibrarySummary`, `type VocabLibrarySummary` từ `@/components/vocab/vocab-courses-cta`.
     - Viết và export `export function deriveStudentHomeVocabSubtitle(deckCount: number, summary: VocabLibrarySummary | null): string`:
       - Khi `summary !== null`: `deckCount > 0 ? \`${deckCount} bộ từ đang học · ${summary.courseCount} khóa học từ vựng có sẵn\` : \`Khám phá ${summary.courseCount} khóa học từ vựng theo 5 cấp độ trí nhớ\``.
       - Khi `summary === null`: `deckCount > 0 ? \`${deckCount} bộ từ đang học\` : "Ôn tập từ vựng theo 5 cấp độ trí nhớ"`.
     - Export `export function StudentVocabEntrySection()`, gọi `const libraryCourses = useVocabLibraryCourses();`, tính `const librarySummary = libraryCourses.isSuccess ? deriveVocabLibrarySummary(libraryCourses.data.courses) : null;`, và render `{deriveStudentHomeVocabSubtitle(deckCount, librarySummary)}`.
- **Success criteria**: Toàn bộ test trong `apps/student` và `check-types` của `student` đều pass.
- **Verify**: `pnpm --filter student test && pnpm --filter student check-types` thoát mã `0`.

### Task 1.4 — Khẳng định số liệu động trong E2E spec `vocab-library-clone.spec.ts`
- **Goal**: Khóa hồi quy E2E đảm bảo `vocab-courses-cta` hiển thị đúng chuỗi tổng hợp `"Thư viện từ vựng · 20 khóa · 968 bài"` từ DB thật của E2E trước khi điều hướng sang `/practice/vocabulary/courses`.
- **Target files and symbols**:
  - `apps/e2e/specs/vocab-library-clone.spec.ts` (quanh dòng 346 `vocab-courses-cta`).
- **Steps**:
  1. Tại `apps/e2e/specs/vocab-library-clone.spec.ts:346`, ngay sau `await expect(page.getByTestId("vocab-courses-cta")).toBeVisible();`, thêm `await expect(page.getByTestId("vocab-courses-cta")).toContainText(\`Thư viện từ vựng · \${EXPECTED_COUNTS.course} khóa · \${EXPECTED_COUNTS.deck} bài\`);`.
- **Success criteria**: Spec E2E biên dịch sạch kiểu (`check-types`) và sẵn sàng chạy gate E2E tổng thể ở cuối Phase 2.
- **Verify**: `pnpm --filter e2e check-types` thoát mã `0`.

## Todo

- [x] Task 1.1: Viết failing tests (TDD Red) trong `vocab-course-catalog.test.tsx` (kèm mock `Navigate`, HTTP `500` và catalog rỗng)
- [x] Task 1.2: Cài đặt `deriveVocabLibrarySummary` và `VocabCoursesCta` nhận prop `summary`
- [x] Task 1.3: Nối `useVocabLibraryCourses()` song song trên `/practice/vocabulary`, `/practice/vocabulary/courses` và `/` (TDD Green)
- [x] Task 1.4: Bổ sung khẳng định text động vào `apps/e2e/specs/vocab-library-clone.spec.ts`

## Verification

- `pnpm --filter student test` exits `0`
- `pnpm --filter student check-types` exits `0`
- `pnpm --filter e2e check-types` exits `0`

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
