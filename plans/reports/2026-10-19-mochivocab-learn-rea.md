# REA Report — MochiVocab learn.mochidemy.com/learn (course & lesson selection UX)

Ngày: 2026-10-19 · Phương pháp: static REA (curl HTML → `__NEXT_DATA__` → webpack chunk map → download + js-beautify). Không cần login; guest view render đầy đủ course list. Artifacts tại `/tmp/mochivocab-rea/`.

## Kiến trúc trang

Next.js pages-router (buildId `Aczxq0qphmt2rn3OrA7JJ`), ver 5.0.1.

| Route | Vai trò |
|---|---|
| `/learn` | Redirect sang `/learn/{courseId}` dựa trên localStorage (`learning_course` → `last_learn.course_id` → `last_course_pick`, mặc định `1`) |
| `/learn/[courseId]` | Trang chính: ribbon tên khóa + **lưới lesson card** (SSR đủ dữ liệu trong `__NEXT_DATA__`) |
| `/review` | Dashboard ôn tập (nav) |
| Lesson click | KHÔNG điều hướng — mở overlay **FlowLearningGame** (redux `isOpenGameLearning`) |

## Data model (`__NEXT_DATA__.props.pageProps`)

- **`courseData`** (lessons của khóa): `{id, course_id, sort, title (EN), description ("N.Tiêu đề VI" đánh số), en_title/en_description, image_png, image (CDN `mochien3.1-api.mochidemy.com/public/images/lesson/<CODE>_lesson_<N>.webp`), code ("TACB35"), ko/th/ja_*, checked_feet}`. Khóa 1 có 100 bài.
- **`courseList`** (22 khóa public): `{id, title, description (VI marketing, vd "Hơn 1200 từ IELTS"), en_title, image, outcome, active_language, course_group_id, public_status, sort}`. Teacher OS hiện có 20 (thiếu id 25 "TIẾNG ANH ÔN THI VÀO 10" + 26 "TỪ ĐỒNG NGHĨA TRÁI NGHĨA THPT" — ngoài scope UI).
- **`course`**: khóa hiện tại; `learnTranslation`: `{course_list: "DANH SÁCH KHÓA HỌC", suggested_itinerary_for_you: "Lộ trình gợi ý cho bạn"}`.

## UI chọn khóa (modal `modalFirstTimeLearn`, chunk 8165)

- Mở khi: lần đầu vào /learn (không có localStorage) HOẶC bấm ribbon tên khóa HOẶC bấm card "bookcase" ở cột phải.
- Header "DANH SÁCH KHÓA HỌC" + close; phụ đề **"Lộ trình gợi ý cho bạn"**.
- Sắp xếp theo lộ trình cứng: `path_basic/path_thcs/path_thpt/path_ielts/path_toeic/path_work` (mảng id khóa).
- **CourseCard**: `title` (đa ngôn ngữ) + 2 hàng icon: target icon → `outcome`; mortarboard icon → `description`. Card đầu có badge "start" (ảnh `start.png`).
- Click card → `router.push("/learn/{id}")` + ghi `last_course_pick`.

## UI danh sách bài (chunk 4095 + 7167 + 1077)

- **LessonCard** (`<button title="learn lesson {id}">`): div ảnh bìa (`next/image fill objectFit:contain`) + content `{p.title EN} {p.description "N.VI"}`. Variant `containerOrange` cho bài active.
- **Trạng thái** `handleRenderLessonStatus`:
  - `GREEN` khi `lesson.checked_feet` (hoàn thành);
  - `YELLOW` khi bài đầu tiên + user chưa học từ nào (`badge.count_word == 0`) — kèm ảnh **"start here"** mũi tên chèn TRƯỚC card;
  - `LOCK` khi user free (non-premium) và `index >= 3` (free = 3 bài đầu; icon `locked_cloud.svg`);
  - còn lại: default.
- **Click bài**: mở `changeOpenFlowLearningGame({lesson_id, course_id})` overlay; guard theo thứ tự: mobile <768px → popup tải app; chưa login → modal login; bài LOCK hoặc trial hết (`review_count >= 60`) → modal upgrade.
- **Resume**: `useLayoutEffect` scrollIntoView({behavior:"smooth", block:"center"}) tới `last_learn.lesson_id` sau 500ms.
- Layout 3 cột: trái = banner "learn tips" (click scroll tới SEO content), giữa = ribbon + lưới bài, phải = card bookcase "DANH SÁCH KHÓA HỌC" + banner premium.
- Ribbon tên khóa là **button mở modal chọn khóa** (không phải breadcrumb).
- Dưới lưới (khóa 1/6) có khối SEO `contentBottomForBasicEnglishCourseStyle` (bảng từ vựng tĩnh) — không liên quan app logic.

## FlowLearningGame (chunk 2340, module 70032)

Overlay học in-place: redux slice `flowLearningGame` (`listWordsLearning`, `isOpenGameLearning`), màn `countWordAchievementScreen` (đạt mốc số từ, ảnh level1-4), kết nối `/review` sau flow. **Không port** — Teacher OS giữ engine SRS 5 cấp (#359) và route session `/vocab/$deckId` riêng.

## CDN ảnh

`image` trong CSV lesson = `https://mochien3.1-api.mochidemy.com/public/images/lesson/...` → **301 cross-host** sang `mochien-server.mochidemy.com/images/lesson/...`, tải OK (200, `image/webp`, ~4.7KB/ảnh, tổng ~968 ảnh ≈ 4.5MB). `<img>` browser follow redirect bình thường (không cần CORS để hiển thị). Teacher OS: `vocab_library_deck.image_url` ĐÃ được seed từ cột `image` này (seed module `packages/db/src/seed/vocab-library.ts:204`), contract student deck ĐÃ expose `imageUrl` — chỉ thiếu UI dùng nó.

## Gap đối chiếu Teacher OS (#366)

| MochiVocab | Teacher OS hiện tại | Hành động |
|---|---|---|
| Trang lesson grid riêng `/learn/[courseId]` | Catalog inline cuối trang `/vocab` (text card 2 cột) | Tách route `/vocab/courses/$courseId` |
| Lesson card có ảnh bìa + "N. tên VI" | Text card, không ảnh, không mô tả VI | Dùng `imageUrl` + thêm cột `description` (migration 0040) |
| Trạng thái GREEN/YELLOW/LOCK + "start here" | Badge đếm (x từ mới, y đến hạn…) | Trạng thái Hoàn thành/Đang học/Bắt đầu tại đây |
| Ribbon mở modal chọn khóa | Nút "← Tất cả khóa học" | Dialog chọn khóa + nút quay lại |
| Auto-scroll bài cuối học | Không | scrollIntoView bài chưa hoàn thành đầu tiên |
| Overlay FlowLearningGame | Route session riêng (giữ) | Non-goal |
| Free 3 bài + premium lock | Không có lock | Non-goal |
