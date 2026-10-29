# Phase 2 — Student Routes: /vocab/courses Catalog + Lesson Grid kiểu MochiVocab

> Mục tiêu: chuyển trải nghiệm chọn khóa + bài học từ inline catalog cuối `/vocab` sang mô hình mochivocab — trang lưới bài học riêng, lesson card có ảnh bìa, trạng thái học, "Bắt đầu tại đây", Dialog đổi khóa, auto-scroll resume.

## 2.1 Cấu trúc route mới (TanStack Router flat routes)

| File | Route | Vai trò (mô hình mochivocab tương ứng) |
|---|---|---|
| `apps/student/src/routes/_auth/vocab/courses/index.tsx` | `/vocab/courses` | Catalog 20 khóa ("DANH SÁCH KHÓA HỌC" + tìm kiếm) |
| `apps/student/src/routes/_auth/vocab/courses/$courseId.tsx` | `/vocab/courses/$courseId` | Trang lưới bài học (`/learn/[courseId]`) |

- **Route precedence**: static segment `courses` thắng dynamic `$deckId` trong TanStack Router `^1.170` (comparator `isFrameMoreSpecific` ưu tiên frame nhiều static segment hơn — đã verify source router-core 1.171.24; red-team C1). Mọi deck id đều dạng `libdeck-*`/UUID nên không xung đột ngữ nghĩa. `$deckId.session.tsx` khác depth, không dính. Giữ 1 smoke check điều hướng `/vocab/courses` không match thành `deckId="courses"` (E2E Phase 3 cover).
- `validateSearch` trên 2 route: `/vocab/courses` nhận `q?` (search khóa); `/vocab/courses/$courseId` nhận `q?` (search bài trong khóa) — debounce ~300ms trước khi đẩy lên URL (quy ước `chip-filter.tsx` / `/assignments`).
- **Breaking change chấp nhận**: bỏ `courseId`/`q` search params trên `/vocab` (route `index.tsx` hiện dòng 20–32) — #366 chỉ có trên `develop`, chưa promote lên `main`, không có user production.

## 2.2 Trang `/vocab/courses` (catalog)

Tái sử dụng markup course card từ `VocabCourseCatalog` (nhánh `!activeCourseId`, dòng 90–201) — chuyển thành page component:

- Root section giữ `data-testid="vocab-courses-section"` (E2E cũ #366 tham chiếu — tránh đổi tên không lý do).
- Header: kicker "Thư viện từ vựng" + h1 "Khóa học từ vựng" + input search (giữ nguyên `data-testid="vocab-course-search"`).
- Grid course card (`vocab-course-card-*`): `target` chip, `name`, `description`, `deckCount` bài / `wordCount` từ, progress "Đã học x/y từ" / "z thành thạo" / "n đến hạn" — giữ nguyên testid.
- Card click → `navigate({ to: "/vocab/courses/$courseId" })`.
- Loading/error/empty states giữ testid `vocab-courses-loading|error|empty`.
- Nút "← Từ vựng" về `/vocab`.

## 2.3 Trang `/vocab/courses/$courseId` (lesson grid — trái tim phase)

### Header kiểu ribbon mochivocab

- Hàng trên: nút "← Tất cả khóa học" (`vocab-course-back-btn` — giữ testid) về `/vocab/courses`.
- **Ribbon tên khóa**: khối `neu` lớn hiển thị `course.name` + `course.description`; **cả khối là button mở Dialog đổi khóa** (`data-testid="vocab-course-switcher"`). Mochivocab: ribbon click → modal course list.
- Input search bài trong khóa (`vocab-course-deck-search`).

### Dialog đổi khóa (component mới `vocab-course-switcher-dialog.tsx`)

- **Tự viết overlay theo pattern `apps/student/src/components/quiz/quiz-lifecycle-dialogs.tsx`** (packages/ui KHÔNG có dialog primitive — red-team C3): `role="dialog"` + `aria-modal`, Esc đóng, Tab focus-trap, backdrop click đóng; danh sách 20 khóa `overflow-y-auto` + `max-h` để không tràn viewport.
- Nội dung: input search nhanh + danh sách 20 khóa (dùng `useVocabLibraryCourses`), mỗi item: `name`, `deckCount` bài, progress rút gọn; khóa hiện tại đánh dấu "Đang xem" + `aria-current`.
- Click item → `navigate({ to: "/vocab/courses/$courseId", params, search: { q: undefined } })` + đóng dialog.

### Lesson card grid (component mới `vocab-lesson-card.tsx` + section trong route)

- Data: `useVocabLibraryCourseDecks(courseId)` — đã có `imageUrl`, `wordCount`, `newCount`, `reviewCount`, `dueCount`, `learnedCount`, `sortOrder`, và từ Phase 1 có `description`.
- **Card** (`<Link to="/vocab/$deckId" params search={{ course: courseId }}>`), giữ testid `vocab-course-deck-{id}`:
  - Ảnh bìa: `<img src={deck.imageUrl} alt="" loading="lazy" decoding="async" className="aspect-square w-full object-contain">` — CDN mochidemy follow redirect tự nhiên; **fallback**: state `imgFailed` qua `onError` → render placeholder `neu-in` (không break layout khi CDN chết).
  - Content: `<p class="title">{deck.title}</p>` (EN, đậm) + subtitle qua helper thuần `deriveLessonSubtitle(deck)`:
    - render **nguyên văn `{deck.description}`** (chuỗi CSV đã chứa prefix số "N." như mochivocab — KHÔNG thêm prefix `sortOrder.` để tránh "84. 84.Nhận thức…" — red-team B1);
    - nếu `description` null HOẶC match pattern rác `^\d+\s*từ vựng$` (47 deck CSV có description "10 từ vựng" vô nghĩa — red-team B4) → trả `null`, card chỉ hiện title.
  - Trạng thái (helper thuần `deriveLessonStatus(deck)` để unit test):
    - `completed`: `wordCount > 0 && learnedCount >= wordCount` → chip "Hoàn thành" (token `ok`);
    - `in-progress`: `reviewCount > 0 && chưa completed` → chip "Đang học {reviewCount}/{wordCount}";
    - còn lại `new` (không chip).
  - "Bắt đầu tại đây": bài **đầu tiên chưa completed** trong danh sách (không lọc theo search) → render badge/mũi tên "Bắt đầu tại đây" trên card (`data-testid="vocab-lesson-start-here"`); sau khi data load xong lần đầu, `scrollIntoView({ behavior: "smooth", block: "center" })` tới card đó (mochivocab auto-scroll tới `last_learn`).
- **Grid responsive**: `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3` (mochivocab ~5–6 cột desktop); card compact hơn deck card hiện tại.
- Search trong khóa filter theo `title` + `description` (thêm `description` so với hiện tại chỉ `title`).
- Empty/loading/error states giữ testid `vocab-course-decks-*`; tiêu đề khóa giữ testid `vocab-selected-course-title` (E2E cũ tham chiếu).

## 2.4 Dashboard `/vocab` (`routes/_auth/vocab/index.tsx`)

- Bỏ: `validateSearch` courseId/q, `handleSelectCourse`, `handleSearchChange`, render `<VocabCourseCatalog>`.
- Bỏ component `vocab-course-catalog.tsx` + test của nó (markup course card đã chuyển sang `/vocab/courses`; markup deck card cũ không dùng nữa — thay bằng lesson card).
- Thêm section "Khóa học từ vựng" (component mới `vocab-courses-cta.tsx`): card CTA "Khóa học từ vựng — 20 khóa · 968 bài" link → `/vocab/courses` (`data-testid="vocab-courses-cta"`). **Chỉ CTA thuần** — KHÔNG làm shortcut dashboard→course bằng className name-matching (overview deck item không có courseId, `className` chỉ là tên khóa không unique — red-team C2/D1 đã cắt).
- Cập nhật copy empty-state "Bộ từ đang học" (dòng ~248–251 "Chọn một khóa học từ vựng bên dưới…") → trỏ về CTA "Khóa học từ vựng" (red-team B5).

## 2.5 Chuỗi `?course=` xuyên suột session (`$deckId.tsx` + `$deckId.session.tsx`)

Red-team B2: param `course` phải sống sót qua cả session route, nếu không thoát session sẽ rơi về `/vocab`.

- `$deckId.tsx`: `validateSearch` thêm `course?: string`; nút "← Danh sách bộ từ" (~85–90) khi có `course` → `<Link to="/vocab/courses/$courseId" params={{ courseId: course }}>← Bài học trong khóa</Link>`, không có thì giữ nguyên về `/vocab`.
- `$deckId.tsx` CTA "Học từ mới" (~108–115) sang `/vocab/$deckId/session`: truyền `search={{ course }}` (dùng functional search updater để preserve).
- `$deckId.session.tsx`: `validateSearch` thêm `course?: string`; `handleExit` (~42) navigate về `/vocab/$deckId` **giữ `course`** (`search: (prev) => ({ ...prev })` pattern).
- Link điều hướng từ lesson card đã mang `search={{ course: courseId }}` (2.3).

## 2.6 Repo hooks (`apps/student/src/lib/repos/vocab.ts`)

- `useVocabLibraryCourses` / `useVocabLibraryCourseDecks` giữ nguyên query key + endpoint (URL đổi, data source không đổi). Kiểm tra không còn tham chiếu `?courseId=` trên `/vocab` ở bất kỳ hook/navigation nào khác (grep `/vocab", {` toàn app).

## Success Criteria

- [x] `/vocab/courses` render 20 khóa + search URL param hoạt động; `/vocab/courses/libcourse-1` render 100 lesson card có ảnh + dòng VI đánh số nguyên văn từ CSV (không nhân đôi số).
- [x] Bấm ribbon mở Dialog đổi khóa, chọn khóa khác điều hướng đúng; Esc đóng được; keyboard focus không thoát ra ngoài dialog.
- [x] Bài chưa hoàn thành đầu tiên có "Bắt đầu tại đây" + auto-scroll 1 lần sau load (không lặp lại khi search/filter đổi).
- [x] Ảnh CDN lỗi (block 1 URL thử bằng test) → card render placeholder không vỡ layout.
- [x] Vào session từ lesson card rồi thoát bằng "← Danh sách bộ từ" lẫn `handleExit` sau học — URL vẫn giữ `?course=` và back-link trỏ đúng course page.
- [x] `pnpm --filter student test` pass với unit test mới: `deriveLessonStatus`, `deriveLessonSubtitle` (gồm case description rác "10 từ vựng" → null), switcher dialog (open/select/close), lesson card render (completed/in-progress/new + fallback ảnh), dashboard CTA.
- [x] `pnpm check-types` pass (route tree regenerate — chạy dev 1 lần hoặc codegen route).

## Files Owned

- `apps/student/src/routes/_auth/vocab/courses/index.tsx` (mới)
- `apps/student/src/routes/_auth/vocab/courses/$courseId.tsx` (mới)
- `apps/student/src/routes/_auth/vocab/index.tsx` (sửa)
- `apps/student/src/routes/_auth/vocab/$deckId.tsx` (sửa — search param + back-link + CTA session truyền search)
- `apps/student/src/routes/_auth/vocab/$deckId.session.tsx` (sửa — validateSearch + handleExit giữ course)
- `apps/student/src/components/vocab/vocab-lesson-card.tsx` (mới)
- `apps/student/src/components/vocab/vocab-course-switcher-dialog.tsx` (mới)
- `apps/student/src/components/vocab/vocab-courses-cta.tsx` (mới)
- `apps/student/src/components/vocab/vocab-course-catalog.tsx` (xóa) + `vocab-course-catalog.test.tsx` (xóa/thay)
- `apps/student/src/routeTree.gen.ts` (regenerate)
- Test files mới trong `apps/student`
