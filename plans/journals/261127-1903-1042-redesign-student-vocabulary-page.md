# Journal: Redesign trang Từ vựng học viên (`/student/practice/vocabulary`) (#1042)

- **Date:** 2026-11-27 19:03 (Europe/London · business TZ `Asia/Ho_Chi_Minh`)
- **Issue:** [#1042](https://github.com/vinh19410/teacher-os/issues/1042)
- **Branch:** `vinh19410/redesign-student-vocabulary-page`
- **Plan:** `plans/261127-1735-redesign-student-vocabulary-page/plan.md`
- **Component:** Student Vocabulary Overview (`packages/api`, `packages/ui`, `apps/server`, `apps/student`, `DESIGN.md`)
- **Status:** Resolved

## Bối cảnh & Thay đổi đã giao

Redesign trang tổng quan từ vựng học viên (`/practice/vocabulary`) theo bản thiết kế `open-design/vocabulary.html` trên hệ thống token design v2 (Light + Dark), mở rộng tối thiểu API `GET /api/student/vocab/overview` không phát sinh DB migration hay SQL query mới, đồng thời bảo toàn toàn bộ E2E selectors và luồng SRS thật.

- **API & Contract (`packages/api/src/contracts.ts`, `apps/server/src/routes/vocab.ts`):** Bổ sung `streakDays` (7 boolean `[today-6 .. today]` theo giờ Việt Nam) và `decks[].levelDistribution` (5-tuple `[L1..L5]` cho thẻ `state === "review"`). Dùng factory `.catch(() => [...])` trong khi vẫn giữ `.strict()` và bổ sung test raw JSON trước khi parse trong `apps/server/src/routes/vocab.test.ts` để đảm bảo `.catch` không che giấu lỗi server thật.
- **Design Tokens & Helpers (`packages/ui/src/styles/globals.css`, `apps/student/src/components/vocab/vocab-overview-helpers.ts`):** Thêm `--vocab-lv-1..5` (Light `0.76 -> 0.145`, Dark đảo chiều `0.42 -> 0.985`, map qua `@theme inline`); viết pure helpers bằng TDD cho URL search `?f=&lv=&q=`, bộ lọc không dấu tiếng Việt, `resolveVocabHeroState` (5 trạng thái), `buildStreakWeekDays` theo UTC ngày VN (`T00:00:00Z`), và kiểm tra dữ liệu bảng trí nhớ.
- **UI & Route (`vocab-today-hero.tsx`, `vocab-memory-card.tsx`, `vocab-deck-card.tsx`, `vocab-countdown.tsx`, `vocab-suggestion-list.tsx`, `vocab-courses-cta.tsx`, `routes/_auth/practice/vocabulary/index.tsx`):** Dựng 5 khối trang theo ưu tiên học SRS, sync URL bằng `replace: true, resetScroll: false`, xử lý midnight rollover sau 60s + `visibilitychange`, single-fire `onExpired` cho `VocabCountdown`, stretched-link card an toàn (focus ring chỉ nằm trên `::after`, CTA session nằm `relative z-10`), `timeZone: "Asia/Ho_Chi_Minh"` khi hiển thị ngày gợi ý, và `busySuggestionRef` chặn double-click.
- **Tài liệu & Đối chiếu (`open-design/vocabulary.html`, `DESIGN.md`, `plans/reports/1042-student-vocab-*.png`):** Cập nhật `DESIGN.md` và chụp 4 ảnh POT ở 3 viewport Light/Dark trên dữ liệu mẫu đầy đủ.

## Quyết định kỹ thuật & Đánh đổi

1. **Mở rộng `GET /api/student/vocab/overview` trong đơn PR `--ship --beta` với `.catch(() => [...])` + `.strict()`:**
   - *Bác bỏ:* Tách 2 PR nối tiếp (server trước, client sau) hoặc bỏ `.strict()`.
   - *Đánh đổi:* `packages/infra/alchemy.run.ts` deploy `server` trước `lms`, nên trong cửa sổ chuyển tiếp ~2 phút trên staging nếu tab cũ của học viên chạy bundle trước đó gọi API mới sẽ bị `.strict()` cũ từ chối cho tới khi tải lại trang. Chấp nhận rõ ràng cho kênh beta và đã ghi trong `DESIGN.md`, PR và `vocab-contracts.test.ts`.
2. **CTA điều hướng thẳng vào SRS thật (`/practice/vocabulary/$deckId/session?mode=review|learn`), không dựng modal flashcard mẫu hay nút Undo giả:**
   - *Lý do:* Bản thiết kế HTML có demo modal 5 thẻ tĩnh và undo giả trên mảng client; ứng dụng thật có sẵn SRS session đầy đủ và API `dismissVocabSuggestion` ghi thẳng DB.
3. **Giữ chuỗi `"tỉ lệ nhớ"` toàn thời gian và các test-locked labels (`VocabCoursesCta`, `vocab-decks-empty`):**
   - *Lý do:* Server tính `retention` all-time (nếu ghi `"30 ngày"` sẽ sai sự thật); `vocab-library-clone.spec.ts` và `vocab-course-catalog.test.tsx` khóa sẵn các chuỗi nhận diện này.

## Sự cố, Điểm vướng & Cách xử lý

- **`SQLITE_BUSY` khi gọi `ak plan update`:** Hai task chạy nền `ak plan reindex` từ phiên trước còn treo và giữ khóa `~/.agentkit/plans.db`. *Xử lý:* Dừng sạch 2 task nền bằng `manage_task` rồi mới cập nhật plan store.
- **Biểu ngữ `role="group"` bị Biome `a11y/useSemanticElements` chặn & lỗi min-width trên Chromium 320px:** *Xử lý:* Chuyển sang `<fieldset className="min-w-0 border-0 ..."><legend className="sr-only">...</legend></fieldset>` cho cả nhóm 5 cấp trí nhớ lẫn dải segmented filter.
- **Load timeout 5000ms khi chạy song song `pnpm test` và `pnpm design:compare` lạnh:** `apps/web/src/routes/_auth/classes/$classId.test.tsx:2108` bị 1 timeout lúc CPU cao (rerun `pnpm test` pass sạch 15/15 packages); `design:compare` lần `--force` đầu bị blank check ở `s-vocab/desktop-light` và `tablet-light` do cold hydration (rerun không `--force` pass sạch 0 lỗi). Ngoài ra đã kiểm `apps/e2e` trên dải cổng `8200..8205` vì `8100/8101/8105` đang có tiến trình khác sử dụng, và khôi phục ảnh lịch sử của các plan cũ bị E2E ghi đè ngoài phạm vi (`plans/261019-*`, `plans/261020-*`).
- **Playwright `waitForURL` trên điều hướng SPA:** Center-click vào deck card dùng TanStack Router `history.pushState` không bắn event `load`; dùng `{ waitUntil: "commit" }` + chờ `vocab-deck-detail` xác nhận chuyển trang và focus ring trên `::after` hoạt động chuẩn.
- **Phát hiện từ `code-reviewer` & `kongming`:** Bắt kịp thiếu `timeZone: "Asia/Ho_Chi_Minh"` ở ngày tạo `VocabSuggestionList`, thiếu `[&::-webkit-search-cancel-button]:appearance-none` trên `#vocab-deck-search`, `busySuggestionRef`, và 2 tên sai (`empty-words` → `empty-decks`, `toast.info` → `toast.success`) trong `DESIGN.md`.

## Bài học rút ra

1. Khi kiểm tra stretched-link card trong Playwright, luôn dùng `waitUntil: "commit"` hoặc assert testid trang đích thay vì `waitForURL` mặc định chờ `load`.
2. Mọi lệnh chạy E2E/`design:compare` trên máy chia sẻ cần kiểm tra cổng trống trước (`ss -ltnp`), không bao giờ kill tiến trình không rõ chủ sở hữu, và chạy `git checkout --` dọn lại ảnh của các thư mục plan cũ nếu spec E2E vô tình ghi vào.
3. Formatter ngày tiếng Việt trong client luôn phải kèm `{ timeZone: "Asia/Ho_Chi_Minh" }` tường minh để tránh lệch ngày ở múi giờ runner/trình duyệt UTC.
