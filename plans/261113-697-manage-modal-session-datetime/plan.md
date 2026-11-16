# Plan: Hiển thị ngày giờ buổi học trong popup Quản lý buổi của lớp (#697)

- **Issue:** #697 (`ai-handle`)
- **Branch:** `feat/697-manage-modal-session-datetime` → `develop` (`--beta`)

## Scope

Hiển thị mốc thứ tự và ngày giờ thực tế của buổi học (`Buổi N · <Thứ, dd/MM> · <HH:mm–HH:mm>`) ngay trên từng dòng bài học trong popup **"Quản lý buổi của lớp"** (`ClassSessionsManageModal`) để giáo viên dễ căn lịch khi sắp xếp thứ tự bài/module.

### Done means

1. Mỗi dòng bài học trong `ClassSessionsManageModal` hiển thị `Buổi N · <Thứ, dd/MM> · <HH:mm–HH:mm>` ngay trên tiêu đề bài theo thứ tự toàn cục `1..K` xuyên các module, đồng bộ nguồn `buildClassSessions` với `ClassSessionsSection` (phản ánh đúng lịch dự kiến, buổi dời ngày/giờ, bỏ qua buổi `holiday` `index = 0` sang buổi bù, thêm `· Đã hủy` khi buổi bị hủy, và hiện `Buổi N · Chưa có lịch` khi vượt số buổi lịch lớp hoặc lịch legacy không suy được ngày); bấm `↑`/`↓` cập nhật ngay bài học vào mốc ngày giờ tương ứng.
2. Giữ nguyên grid selector `div[class*='grid-cols-[20px_1fr_auto']` và accessible name của các nút `Sửa` / `Đưa <bài> lên` / `Đưa <bài> xuống` / `Xóa <bài>`.
3. Pass toàn bộ cổng kiểm tra local: `pnpm exec biome check .`, `pnpm check-types`, `pnpm --filter web test` & `pnpm test`, `pnpm build`, `pnpm --filter e2e e2e specs/class-sessions-manage-modal.spec.ts specs/syllabus-test-session-mark.spec.ts` (cổng `8100–8105`), `node scripts/design-compare/capture.mjs --screens t-class-detail --force` + `pnpm test:design-compare`, và kiểm tra giao diện 3 viewport (`1440×900`, `768×1024`, `375×812`) + reflow `320×812` ở cả light & dark theme theo `REVIEW.md`.
4. Hoàn tất quy trình GitHub & `ak-ship --beta --merge`: tạo issue gắn nhãn `ai-handle`, chuyển nhãn đúng vòng đời (`in progress` → `in review` → `done` → `shipped`), review cô lập trong sub-session `code-reviewer` mới đạt `Approve`, mở và merge PR vào `develop` với CI xanh, đăng comment POT kèm ảnh permalink SHA lên #697 theo `AGENTS.md`, và dọn sạch tiến trình/worktree tạm.

## Out of scope

- Sửa ngày/giờ buổi học trực tiếp bên trong popup Quản lý buổi của lớp.
- Kéo-thả hoặc chuyển lẻ bài học sang module khác.
- Thay đổi schema DB/API hoặc giao diện trang `/syllabus/$id`.

## Phases & Checklist

- [x] Setup issue #697 và branch `feat/697-manage-modal-session-datetime`
- [x] Phase 1: Bổ sung `resolveClassSessions` + `formatCurriculumLessonSlot` trong `class-sessions.ts` kèm unit tests
- [x] Phase 2: Tích hợp vào `ClassSessionsSection`, `ClassSessionsManageModal`, `$classId.tsx`, component tests & E2E spec
- [x] Phase 3: Chụp screenshot 3 viewport Light/Dark (+ 320px reflow), chạy `design:compare` và toàn bộ local gates (`biome check`, `check-types`, `test`, `build`, E2E)
- [x] Phase 4: Cập nhật `CHANGELOG.md`, review cô lập (`code-reviewer` đạt `Approve`), mở PR & merge vào `develop`, verify CI xanh và đăng POT lên #697
