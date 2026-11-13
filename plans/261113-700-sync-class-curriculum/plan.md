# Plan: Đồng bộ lại giáo trình của lớp từ syllabus template đã cập nhật (#700)

- **Issue:** #700 (`ai-handle`)
- **Branch:** `feat/700-sync-class-curriculum` → `develop` (`--beta`)

## Scope

Cho phép giáo viên tại trang chi tiết lớp (`/classes/$classId`) nhận biết khi template gốc có thay đổi (hoặc đã bị xóa) và chủ động đồng bộ lại giáo trình của lớp từ template mới qua một bước xác nhận an toàn, giữ tiến độ bài học (`done`/`current`/`upcoming`) theo thứ tự `1..N` và bảo toàn lịch điểm danh + gói buổi thực tế của học viên.

### Done means

1. Endpoint `POST /api/classes/:id/curriculum/sync` cập nhật nguyên tử cây module/lesson/bank-materials trên bản sao hiện có của lớp (`copy.id` giữ nguyên), giữ `status` bài học (`done`/`current`/`upcoming`) theo thứ tự phẳng `1..N`, chỉ cập nhật `class.sessionsTotal` khi lớp chưa có buổi thực tế (`0` dòng `lesson` & `class_session`), hỗ trợ chọn `templateId` mới khi template gốc đã bị xóa, và pass toàn bộ server integration tests.
2. Trên `/classes/$classId`, cả tab **"Giáo trình"** (`CurriculumManagementSection`) và modal **"Quản lý buổi của lớp"** (`ClassSessionsManageModal`) hiển thị đúng trạng thái đồng bộ với template gốc và thực hiện sync thành công qua `SyncCurriculumModal`; pass đầy đủ unit/component tests và E2E Playwright spec liên quan.
3. UI đạt chuẩn `DESIGN.md` & `REVIEW.md` ở 3 viewport (`1440×900`, `768×1024`, `375×812`) + reflow `320×812` cho cả light & dark theme; `pnpm check`, `pnpm check-types`, `pnpm test`, `pnpm build` và `pnpm design:compare` (`t-class-detail`) đều exit 0.
4. GitHub issue #700 gắn nhãn `ai-handle` đi trọn vòng đời (`in progress` → `in review` → `done` → `shipped`), PR vào `develop` pass review độc lập + CI + được merge (`--beta --merge`), và issue có comment POT đầy đủ bằng chứng + ảnh chụp permalink theo commit SHA.

## Out of scope

- Tự động đẩy ngầm thay đổi từ template sang mọi lớp không qua xác nhận của giáo viên.
- Tự động thêm/xóa dòng điểm danh `lesson` hoặc sửa `session_package.total` trên lớp đã có buổi học thực tế.
- Trộn nội dung từng trường (3-way merge) giữa chỉnh sửa riêng của lớp và chỉnh sửa của template.
- Tạo DB migration mới.

## Phases & Checklist

- [x] Setup issue #700 và branch `feat/700-sync-class-curriculum`
- [x] Phase 1: Bổ sung `syncCurriculumSchema` tại `packages/api/src/contracts.ts`
- [x] Phase 2: Triển khai `POST /api/classes/:id/curriculum/sync` + `buildSyncBatch` / `flattenSyllabusLessons` tại `apps/server` kèm integration tests
- [x] Phase 3: Nối command bus `sync-curriculum`, `isCurriculumOutOfSync`, `useClassCurriculumSyncState`, `SyncCurriculumModal`, `CurriculumManagementSection`, `ClassSessionsManageModal` tại `apps/web` kèm unit/component tests
- [x] Phase 4: Viết và chạy E2E spec `apps/e2e/specs/class-sync-curriculum.spec.ts` (3 viewport light/dark + 320px reflow), chạy `design:compare` (`t-class-detail`) và toàn bộ local gates (`pnpm check`, `pnpm check-types`, `pnpm test`, `pnpm build`)
- [x] Phase 5: Cập nhật `CHANGELOG.md`, review cô lập (`code-reviewer` đạt `Approve`), mở PR & merge vào `develop`, verify CI xanh và đăng POT lên #700
