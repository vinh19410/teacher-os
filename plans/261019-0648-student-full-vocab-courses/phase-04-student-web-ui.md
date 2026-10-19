---
title: "Phase 4: Student Portal Courses UI & Teacher Progress Badge"
status: done
---

# Phase 4: Student Portal Courses UI & Teacher Progress Badge

## Context Links

- Student vocab repo: [`apps/student/src/lib/repos/vocab.ts`](file:///Users/vinhtran/Documents/project/personal/teacher-os/apps/student/src/lib/repos/vocab.ts)
- Student vocab overview page: [`apps/student/src/routes/_auth/vocab/index.tsx`](file:///Users/vinhtran/Documents/project/personal/teacher-os/apps/student/src/routes/_auth/vocab/index.tsx)
- Student vocab deck detail page: [`apps/student/src/routes/_auth/vocab/$deckId.tsx`](file:///Users/vinhtran/Documents/project/personal/teacher-os/apps/student/src/routes/_auth/vocab/$deckId.tsx)
- Student vocab session route: [`apps/student/src/routes/_auth/vocab/$deckId.session.tsx`](file:///Users/vinhtran/Documents/project/personal/teacher-os/apps/student/src/routes/_auth/vocab/$deckId.session.tsx)
- Student home overview: [`apps/student/src/routes/_auth/index.tsx`](file:///Users/vinhtran/Documents/project/personal/teacher-os/apps/student/src/routes/_auth/index.tsx) (lines 162–204)
- Teacher progress tab: [`apps/web/src/components/vocab/vocab-progress-tab.tsx`](file:///Users/vinhtran/Documents/project/personal/teacher-os/apps/web/src/components/vocab/vocab-progress-tab.tsx) (lines 32–42, 160)
- Design guidelines: [`DESIGN.md`](file:///Users/vinhtran/Documents/project/personal/teacher-os/DESIGN.md)

## Overview

Cập nhật giao diện Student Portal (`/vocab` và `/`) để học viên duyệt trực tiếp toàn bộ 20 khóa học từ vựng (`VocabCourseCatalog`), lưu trạng thái khóa học đang chọn (`courseId`) và từ khóa tìm kiếm đã debounce (~300ms) trên URL search params theo quy ước `AGENTS.md`/`DESIGN.md`, xem tiến độ (`reviewWordCount`/`reviewCount`, `learnedWordCount`/`learnedCount`, `dueWordCount`/`dueCount`), và bấm vào bất kỳ bài nào để mở thẳng `/vocab/$deckId` và vào phiên học SRS. Đồng thời invalidate cache React Query đúng thời điểm và cập nhật nhãn nguồn (`source === "library"`) kèm tên khóa học trên cả Student Portal lẫn tab "Tiến độ" của giáo viên (`apps/web`).

## Key Insights

- **Tuân thủ `DESIGN.md` và `AGENTS.md` (RT-F10)**:
  - Trạng thái khóa học đang chọn (`courseId`) và từ khóa tìm kiếm (`q`) trên `/vocab` phải sống trong URL search params (`validateSearch` của TanStack Router trên `/_auth/vocab/`), trong đó ô tìm kiếm giữ local input state để gõ mượt và chỉ đẩy lên URL sau khi debounce ~300ms (`navigate({ search, replace: true })`). Nhờ đó khi học viên bấm vào `/vocab/$deckId` rồi Back (hoặc quay lại), khóa học đang chọn vẫn được giữ nguyên.
  - Ô tìm kiếm khóa học / bài học phải dùng `bg-surface border border-line-strong` (tương phản viền ≥ 3:1 theo WCAG 1.4.11, không dùng `.neu-in` trần cho input) + `focus-visible:ring-2 ring-hot/40`.
  - Badge đếm số lượng bên trong phần tử tương tác (`Link` / `button`) phải đặt `aria-hidden="true"` để accessible name sạch.
- **Luồng trải nghiệm trên `/vocab` (`apps/student/src/routes/_auth/vocab/index.tsx`)**:
  - Khu vực **"Bộ từ đang học"** (đổi tiêu đề từ *"Bộ từ theo lớp học"* thành *"Bộ từ đang học"*):
    - Hiển thị `data.decks` (gồm `source: "class"`, `source: "suggested"`, và các bài từ khóa học mà học viên đã mở/đang học `source: "library"`).
    - Badge nguồn trên thẻ deck (`vocab-deck-source-${deck.deckId}`):
      - `deck.source === "suggested"` → `"Gợi ý"`
      - `deck.source === "library"` → `deck.className ? \`Khóa \${deck.className}\` : "Khóa học"`
      - `deck.source === "class"` → `deck.className ? \`Lớp \${deck.className}\` : "Lớp học"`
    - Khi `data.decks.length === 0`: thông điệp empty state hướng dẫn học viên chọn ngay một khóa học từ vựng bên dưới để bắt đầu học mà không cần đợi giáo viên giao.
  - Khu vực mới **"Khóa học từ vựng"** (`VocabCourseCatalog` — `data-testid="vocab-courses-section"`):
    - **Chế độ danh sách khóa học (khi chưa có `courseId` trên URL)**:
      - Hiển thị 20 khóa học từ `useVocabLibraryCourses()`, có ô tìm kiếm debounce 300ms (`data-testid="vocab-course-search"`).
      - Mỗi thẻ khóa học (`data-testid="vocab-course-card-${course.id}"`) hiển thị tên khóa (`course.name`), mô tả & mục tiêu (`course.description`, `course.target`), `{course.deckCount} bài`, `{course.wordCount} từ`, cùng tiến độ (`Đã học ${course.reviewWordCount}/${course.wordCount} từ` khi `reviewWordCount > 0`, `${course.learnedWordCount} thành thạo` khi `learnedWordCount > 0`, `${course.dueWordCount} đến hạn` khi `dueWordCount > 0`).
    - **Chế độ danh sách bài học trong khóa (khi `courseId` có trên URL)**:
      - Hiển thị nút `"← Tất cả khóa học"` (`data-testid="vocab-course-back-btn"` — xóa `courseId` & `q` khỏi URL), tiêu đề khóa đang chọn, và ô tìm kiếm bài học debounce 300ms (`data-testid="vocab-course-deck-search"`).
      - Render danh sách bài học từ `useVocabLibraryCourseDecks(selectedCourseId)`. Mỗi bài là một `<Link to="/vocab/$deckId" params={{ deckId: deck.id }} data-testid={\`vocab-course-deck-\${deck.id}\`}>` hiển thị tiêu đề bài, `{deck.wordCount} từ`, `{deck.newCount} từ mới`, `{deck.reviewCount} đã học` (khi `> 0`), `{deck.learnedCount} thành thạo` (khi `> 0`), `{deck.dueCount} đến hạn` (khi `> 0`).
- **Invalidate cache React Query chống stale 60s (`apps/student/src/lib/repos/vocab.ts` & `$deckId.session.tsx` — RT-F3)**:
  - Vì `createStudentQueryClient()` đặt `staleTime: 60_000`, khi `useVocabSessionData(deckId)` fetch thành công (đặc biệt với `libdeck-*` vừa được server lazy-provision `vocab_card`), gọi `queryClient.invalidateQueries({ queryKey: ["student", "vocab-overview"] })` và `queryClient.invalidateQueries({ queryKey: ["student", "vocab-library"] })`.
  - Đồng thời trong `handleExit` của `apps/student/src/routes/_auth/vocab/$deckId.session.tsx`, invalidate thêm `["student", "vocab-library"]` bên cạnh `["student", "vocab-overview"]` và `["student", "vocab-session", deckId]`.
- **Trang chủ học viên (`apps/student/src/routes/_auth/index.tsx`)**:
  - Trong `StudentVocabEntrySection`, cập nhật dòng mô tả phụ: khi `deckCount > 0` hiển thị `${deckCount} bộ từ đang học · 20 khóa học từ vựng có sẵn`, khi `deckCount === 0` hiển thị `"Khám phá 20 khóa học từ vựng theo 5 cấp độ trí nhớ"`.
- **Tab "Tiến độ" của giáo viên (`apps/web/src/components/vocab/vocab-progress-tab.tsx` — RT-F9)**:
  - Tại dòng 160, thay `(await res.json()) as VocabStudentProgressResponse` bằng `vocabStudentProgressResponseSchema.parse(await res.json())` để đảm bảo Zod `.catch(...)` thực sự chạy tại biên API.
  - Trong `DeckProgressRow`, cập nhật nhãn badge `vocab-progress-deck-source-${deck.deckId}`: khi `deck.source === "library"` hiển thị `deck.className ? \`Khóa \${deck.className}\` : "Thư viện"`.

## Requirements

- [ ] Trong `apps/student/src/lib/repos/vocab.ts`, thêm `fetchVocabLibraryCourses`, `fetchVocabLibraryCourseDecks`, `useVocabLibraryCourses`, `useVocabLibraryCourseDecks`, và invalidate `["student", "vocab-overview"]` + `["student", "vocab-library"]` khi `useVocabSessionData` hoàn tất.
- [ ] Tạo component `apps/student/src/components/vocab/vocab-course-catalog.tsx` duyệt 20 khóa học → drill-down bài học trong khóa với trạng thái `courseId` + tìm kiếm debounce 300ms đồng bộ qua URL search params, đúng chuẩn `DESIGN.md`.
- [ ] Tích hợp `VocabCourseCatalog` và `validateSearch` vào `apps/student/src/routes/_auth/vocab/index.tsx`, cập nhật badge nguồn `source === "library"` + empty state.
- [ ] Cập nhật `apps/student/src/routes/_auth/vocab/$deckId.session.tsx` invalidate query `["student", "vocab-library"]` khi thoát phiên học.
- [ ] Cập nhật `apps/student/src/routes/_auth/index.tsx` (`StudentVocabEntrySection`) và `apps/web/src/components/vocab/vocab-progress-tab.tsx` (gọi `vocabStudentProgressResponseSchema.parse(...)` và hiển thị `Khóa ${deck.className}` / `"Thư viện"`).

## Related Code Files

- Modify: `apps/student/src/lib/repos/vocab.ts`
- Create: `apps/student/src/components/vocab/vocab-course-catalog.tsx`
- Modify: `apps/student/src/routes/_auth/vocab/index.tsx`
- Modify: `apps/student/src/routes/_auth/vocab/$deckId.session.tsx`
- Modify: `apps/student/src/routes/_auth/index.tsx`
- Modify: `apps/web/src/components/vocab/vocab-progress-tab.tsx`

## Implementation Steps

1. Thêm các hàm fetch và React Query hooks (`useVocabLibraryCourses`, `useVocabLibraryCourseDecks`) vào `apps/student/src/lib/repos/vocab.ts`, và bổ sung invalidation `["student", "vocab-overview"]` + `["student", "vocab-library"]` khi `useVocabSessionData` nạp xong.
2. Tạo `apps/student/src/components/vocab/vocab-course-catalog.tsx`:
   - Nhận `selectedCourseId`, `searchQuery`, và callback `onSelectCourse` / `onSearchChange` nối với URL search params của `/_auth/vocab/` (debounce 300ms trước khi đẩy `q` lên URL).
   - Render lưới khóa học (`grid-cols-1 md:grid-cols-2`) và lưới bài học khi chọn khóa, hiển thị `reviewWordCount`/`reviewCount`, `learnedWordCount`/`learnedCount`, `dueWordCount`/`dueCount`, đảm bảo không tràn ngang ở 375px/768px/1440px, input có `bg-surface border border-line-strong`, badge đếm có `aria-hidden="true"`.
3. Cập nhật `apps/student/src/routes/_auth/vocab/index.tsx`:
   - Khai báo `validateSearch` cho `{ courseId?: string; q?: string }`.
   - Hiển thị badge `Khóa ${deck.className}` khi `deck.source === "library"`.
   - Render `<VocabCourseCatalog />` bên dưới khu vực "Bộ từ đang học".
4. Cập nhật `apps/student/src/routes/_auth/vocab/$deckId.session.tsx` và `apps/student/src/routes/_auth/index.tsx`.
5. Cập nhật `apps/web/src/components/vocab/vocab-progress-tab.tsx` gọi `vocabStudentProgressResponseSchema.parse(...)` và hiển thị `deck.className ? \`Khóa \${deck.className}\` : "Thư viện"` khi `deck.source === "library"`.

## Todo

- [ ] Thêm repo functions, hooks & cache invalidation trong `apps/student/src/lib/repos/vocab.ts`
- [ ] Tạo `apps/student/src/components/vocab/vocab-course-catalog.tsx`
- [ ] Cập nhật `/vocab` (`index.tsx` với `validateSearch`, `$deckId.session.tsx`) và `/` (`index.tsx`) trong `apps/student`
- [ ] Cập nhật Zod parse & badge `source === "library"` trong `apps/web/src/components/vocab/vocab-progress-tab.tsx`

## Success Criteria

- Học viên vào `/vocab` thấy ngay 20 khóa học, tìm kiếm được khóa học (URL cập nhật sau debounce 300ms), bấm vào khóa thấy danh sách bài học, bấm vào bài mở `/vocab/libdeck-*`, học xong hoặc quay lại thấy ngay bài trong "Bộ từ đang học" và số từ đã học tăng tức thì mà không bị kẹt stale cache 60s.
- Không tràn ngang ở 3 viewport (`1440×900`, `768×1024`, `375×812`).

## Risk Assessment

- **Mất trạng thái khóa học khi chuyển trang hoặc stale cache 60s**: Đã giải quyết bằng URL search params (`courseId`, `q`) và invalidation `["student", "vocab-overview"]` + `["student", "vocab-library"]` ngay khi provision/exit session.

## Security Considerations

- Không render HTML thô (`dangerouslySetInnerHTML`); validate search params an toàn và parse response bằng Zod tại biên API.

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
