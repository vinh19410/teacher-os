# Plan #851: Master data khóa học 2 cấp & Chọn khóa đề xuất khi chấm bài đầu vào

- **Issue:** #851
- **Status:** completed
- **Branch:** `vinh19410/GV-Chọn-khóa-khi-chấm-điểm-đầu-vào` → PR target `develop` (`--merge --beta`)

## Acceptance Criteria (Done means)

1. Migration DB tạo bảng `course_catalog_seed`, `course_category`, `course` và cột `placement_test_submission.final_course_id` (`onDelete: "set null"`); tự seed idempotent 2 nhóm / 7 khóa mặc định theo `orgId`:
   - **Giao Tiếp**: `Communication English Level 1`, `Communication English Level 2`, `Communication English Level 3`
   - **IELTS**: `Foundation`, `First Step`, `Pre IELTS`, `Advanced`
2. API `/api/courses` hỗ trợ đọc danh sách active cho giáo viên chấm bài và CRUD 2 cấp + sắp xếp (`↑`/`↓`) + ẩn/hiện cho quyền `canAccessFinance`, có unit/integration test pass.
3. Trang `/courses` trên `apps/web` (mục **Khóa học** trong sidebar nhóm Giảng dạy, quyền `canAccessFinance`) thực hiện đủ CRUD 2 cấp, tìm kiếm & lọc trạng thái trong URL, đạt chuẩn `DESIGN.md` và hiển thị sạch trên 3 viewport (`1440x900`, `768x1024`, `375x812`).
4. `PlacementSubmissionPanel` (trên `/leads` và `/students/$studentId`) có dropdown gom nhóm `<optgroup>` bắt buộc chọn 1 khóa trước khi chốt; server xác thực `courseId`, lưu `finalCourseId` + snapshot `finalDisplayCourse` (`<Tên nhóm> - <Tên khóa>`), đồng bộ ra Zalo, Email, trang kết quả công khai, cổng học viên và bảng `/leads`; ẩn/xóa khóa không làm hỏng lịch sử bài đã chấm cũ.
5. Gate local pass (`pnpm exec biome check .`, `pnpm check-types`, `pnpm test`), review độc lập sạch, PR vào `develop` xanh CI, merge (`--merge --beta`) và đăng comment POT kèm ảnh 3 viewport lên issue #851.

## Phases & File Ownership

| Phase | Owner | Files | Dependencies |
|---|---|---|---|
| Phase 1: DB Schema, Migration & API Contracts | Orchestrator | `packages/db/src/schema/course-catalog.ts`, `packages/db/src/schema/index.ts`, `packages/db/src/schema/placement-test.ts`, `packages/db/src/migrations/0083_*`, `packages/api/src/course-contracts.ts`, `packages/api/src/course-contracts.test.ts`, `packages/api/src/placement-test-contracts.ts`, `packages/api/src/placement-test-contracts.test.ts` | None |
| Phase 2: Server API & Grading Service | Subagent A (`fullstack-developer`) | `apps/server/src/lib/course-catalog.ts`, `apps/server/src/routes/courses.ts`, `apps/server/src/routes/courses.test.ts`, `apps/server/src/routes/kernel.ts`, `apps/server/src/lib/placement-submission-service.ts`, `apps/server/src/routes/leads-placement-submission.test.ts`, `apps/server/src/routes/placement-ai-grading.test.ts`, `apps/server/src/routes/student-placement-test.test.ts` | Phase 1 |
| Phase 3: Web UI `/courses` & Placement Dropdown | Subagent B (`fullstack-developer`) | `apps/web/src/lib/repos/courses.ts`, `apps/web/src/components/layout/sidebar.tsx`, `apps/web/src/components/layout/sidebar.test.tsx`, `apps/web/src/components/layout/app-shell.tsx`, `apps/web/src/components/courses/*`, `apps/web/src/routes/_auth/courses/*`, `apps/web/src/components/leads/placement-submission-panel.tsx`, `apps/web/src/components/leads/placement-submission-panel.test.tsx` | Phase 1 |
| Phase 4: E2E Spec Updates, POT Screenshots, Isolated Review & Beta Merge | Orchestrator + `code-reviewer` | `apps/e2e/specs/*placement*.spec.ts`, `plans/reports/851-*.png` | Phase 2 + Phase 3 |
