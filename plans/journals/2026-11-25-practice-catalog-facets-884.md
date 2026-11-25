# Journal: Sửa bộ lọc Bộ đề toàn catalog và thêm lọc Phần thi, Dạng bài, Band cho tự luyện (#884)

- **Date:** 2026-11-25
- **Issue:** #884
- **Branch:** `vinh19410/fix-practice-b-l-c-b-ch-l-y-ngu-n-c-a-trang-hi-n` (target: `develop`)

## Bối cảnh
- Trên trang `/student/practice/$skill`, dropdown **"Bộ đề"** (`collection`) trước đây tổng hợp danh sách lựa chọn từ `catalog.items` (tối đa 12 đề của trang hiện tại), khiến danh sách nguồn thay đổi theo trang (ví dụ Listening trang 1 chỉ có `"Other sources"` / `"Unknown"`, trang 42 chỉ có `"Actual Test"`) và khóa người dùng vào đúng 1 nguồn sau khi lọc. Ngoài ra, catalog chưa có bộ lọc theo **Phần thi** (`part`), **Dạng bài** (`type`) và **Band** (`band`), thiếu nút `Xóa bộ lọc` và dùng chung thông báo trống với trường hợp tổ chức chưa có đề.

## Thay đổi & Quyết định kỹ thuật
- **Hợp đồng tương thích ngược và danh mục chuẩn hoá dạng bài dùng chung (`packages/api`, `packages/ui`):**
  - Thêm `practiceCatalogFacetsSchema` (optional trên `practiceCatalogResponseSchema` giữ `.strict()` để không làm vỡ các tab SPA cũ trong cửa sổ rolling deploy), `PRACTICE_FILTER_MAX_LENGTH = 200`, `PRACTICE_CATALOG_MAX_PAGE = 100_000`, `parsePracticePageParam` và chặn truy xuất khóa `Object.prototype` trong `quizTypeDisplay` bằng `Object.hasOwn`.
  - Tạo `packages/api/src/lib/practice-type-catalog.ts` dùng `ReadonlyMap` (an toàn tuyệt đối trước `toString`/`constructor`/`valueOf`/`__proto__`) để gộp alias trùng nhãn trên Reading/Listening (`mcq`/`mcq1`/`mcq3` → `mcq`, `note`/`notes` → `notes`, `sent`/`sent4` → `sent`, `flow`/`flowchart` → `flow`, `match`/`match2`/`matching` → `matching`), tách nhãn `map` giữa Listening (`"Map labelling"`) và Writing (`"Bản đồ"`), đồng thời pin đồng bộ nhãn Writing/Speaking với `packages/ui/src/components/assignments/editor/assignment-presets.test.ts`.
- **Facets toàn catalog & bộ lọc SQLite JSON1 an toàn trên server (`apps/server`):**
  - Mở rộng `GET /api/student/practice` với `?facets=1` (opt-in) trả `facets: { collections, types, parts, bands }` tổng hợp trên toàn bộ đề `ready` (có ít nhất 1 part hợp lệ) của `(orgId, skill)`, độc lập `page`, `q` và các bộ lọc đang chọn, kèm header `Cache-Control: no-store` và `Vary: Cookie, x-student-org-id`.
  - Gộp điều kiện lọc `part`, `type` (mở rộng alias, khớp `prompt.type`, `groups[*].type` và fallback `questions[*].type` khi `groups` rỗng) và `band` vào **một `EXISTS` tương quan duy nhất** trên `(assignment_test_part, assignment_prompt)` trong cùng một `db.batch([...])`. Bảo vệ truy vấn SQLite JSON1 bằng guard lồng nhau (`json_valid`, `json_type = 'array'`, `g.type = 'object'`, `json_type(g.value, '$.type') = 'text'`) kết hợp fast-path `IN ('', '[]')` để không bao giờ crash HTTP 500 trên JSON hỏng hoặc mảng scalar (`["corrupt"]`).
  - Không tự bịa/backfill band cho 849 đề thư viện import sẵn (đồng loạt `band = "7.0"`): dùng **Phần thi** (`Passage 1–3` / `Section 1–4` / `Task 1–2` / `Part 1–3`) làm chiều phân tầng chính và hiển thị **Band** có điều kiện khi có `>= 2` mức khác nhau (hoặc khi URL đang chỉ định `band`).
- **Bộ lọc đồng bộ URL, chống race và tối ưu UX/A11y phía học viên (`apps/student`, `apps/e2e`):**
  - `parsePracticeSearch` (`practice-filters.tsx`, re-export qua `$skill.tsx`) xử lý ép kiểu số mặc định của TanStack Router (`?band=6.0` → `"6.0"`, `?q=18` → `"18"`), bỏ tham số rỗng và `page <= 1`, cắt chiều dài tối đa `200`.
  - `usePracticeCatalog` luôn truyền `facets=1` và giữ `placeholderData` trong phạm vi cùng `skill` để dropdown không unmount/mất focus khi đổi trang hoặc lọc mà không rò dữ liệu sang kỹ năng khác.
  - `SkillCatalog` & `PracticeFilters` dùng `latestFiltersRef` (chặn mất bộ lọc khi chọn liên tiếp nhiều dropdown qua async `beforeLoad` của `/_auth`), `onSearchRef`, `key={skill}`, `resetSignal` (nút `Xóa bộ lọc` ở thanh lọc lẫn empty state xoá sạch ô search đồng bộ không bị debounce hồi sinh), `aria-live="polite"`, auto-clamp trang vượt biên kể cả khi `total === 0`, và chống tràn ngang trên cả 4 viewport (`1440`, `768`, `375`, `320px`) ở chế độ Light/Dark.
- **Hợp nhất sạch với `origin/develop` (#883 `2b2f9edf`):** Đồng bộ gỡ `usePracticeOpenLock` / `openingTestId` sau khi #883 chuyển bấm thẻ sang màn hình giới thiệu inline, giữ nguyên `Math.max(1, Math.round(normalizedLimit / 60))` và xác minh lại toàn bộ spec `student-practice.spec.ts` (7/7 pass).

## Xác minh
- Lint & kiểu: `pnpm exec biome check .` (0 errors), `pnpm check-types` (pass toàn workspace).
- Unit/integration tests: `@teacher-os/api` 41/41 (575 passed, 1 skipped), `@teacher-os/ui` 24/24 (375 passed), `apps/student` 68/68 (694 passed), `apps/lms` 6/6 (50 passed), `apps/admin` 26/26 (246 passed), `apps/server` targeted (`student-practice.test.ts`, `student-practice-library-sync.test.ts`, `student-quiz.test.ts`) 3/3 (57 passed), và `apps/web` (`$classId.test.tsx`) 47/47 passed.
- Targeted E2E (cổng `8100–8105`, theo quy ước `AGENTS.md` không chạy full E2E local): `apps/e2e/specs/student-practice.spec.ts` — 7/7 passed (gồm cả bộ test #883 và bộ test #884 cô lập org riêng, 2 trang, 4 viewport Light/Dark).
- Ảnh POT: 4 ảnh `plans/reports/884-practice-filters-{desktop-1440x900,desktop-dark,tablet-768x1024,mobile-375x812}.png` đã kiểm tra trực quan.
