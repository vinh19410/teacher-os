# Journal: Ship #533 — Bộ đề tự học (study pack) gán vào lớp, hiển thị theo lịch không cần cron

- **Date:** 2026-11-01
- **Issue:** [#533](https://github.com/vinh19410/teacher-os/issues/533)
- **Branch:** `feat/533-study-pack`
- **Plan:** `plans/261101-1357-533-study-pack-scheduled-release/plan.md`

## Tóm tắt kỹ thuật

1. **Migration `0060_study_pack.sql` & Schema (`packages/db`):**
   - Dùng `ALTER TABLE` tại chỗ (không rebuild `class_assignment`) để xoá index `class_assignment_plan_item_idx`, bỏ cột `plan_item_id`, thêm `available_at` (`timestamp_ms`) và `class_study_pack_id` (`text`), thêm `assignment_prompt.library_ref` kèm unique `(org_id, library_ref)`, xoá 3 bảng `self_study_plan*` và tạo 4 bảng mới `study_pack_exercise`, `study_pack`, `study_pack_item`, `class_study_pack` (có partial unique index `class_study_pack_class_pack_active_uq`).
   - Đặt tên bảng vật lý của `libraryExercise` là `study_pack_exercise` để không va chạm truy vấn `LIKE 'library%'` trong `library-test-migration.test.ts` và khớp tuyệt đối với kiểm tra `/readyz`.
2. **Kỹ năng Grammar & Vocabulary tự chấm (`packages/api`, `packages/ui`, `apps/server`, `apps/web`, `apps/student`):**
   - Mở rộng `ASSIGNMENT_SKILLS` thêm `"grammar"` (`g1`: `mcq`, `gap`, `transform`) và `"vocabulary"` (`v1`: `mcq`, `match`, `gap`) chấm tự động qua `gradeQuiz`; giữ `PRACTICE_SKILLS` (4 kỹ năng IELTS) và `HISTORY_SKILLS` (5 kỹ năng) nguyên vẹn để bảo toàn hợp đồng `student-history`.
   - Hỗ trợ câu hỏi không có `____` (`transform`) hiển thị ô `<input>` trong `ClozeStemText` và bật click-to-blank editor cho `gap` trong `question-key-editor.tsx`.
3. **API Bộ đề, Gán vào lớp & Lọc lúc đọc (`apps/server`):**
   - Cài đặt `validateStudyPackItems`, `materializePrompts` (chunk 4 dòng/câu lệnh $\le 88$ binds, flatten `groups`/`optionBank` của `library_test_part`, `SELECT` lại `id` sau `onConflictDoNothing`), `computeStudyPackSchedule` (bỏ qua ngày nghỉ từ `loadExistingHolidayDates`), `assignStudyPackToClass` (chunked `db.batch <= 50` statements, idempotent), `cancelClassStudyPack` (giữ bài đã mở, xoá bài chưa mở chưa có attempt), và `backfillStudyPackTargetsForStudent` gắn trong `activateEnrollment`.
   - Áp dụng `visibleAssignmentFilter(now)` trên toàn bộ đường đọc và làm bài của học viên (`student-class.ts`, `student.ts`, `student-history.ts`, `dashboard-reminders.ts`) và cô lập bài của bộ đề khỏi `loadSnapshot` + trần 200 bài giao tay.
4. **Giao diện & E2E (`apps/web`, `apps/admin`, `apps/e2e`):**
   - Xây dựng `/assignments/packs`, `ClassStudyPackSection` trong `/classes/$classId`, `/library/packs` trong `apps/admin`, và E2E spec `apps/e2e/specs/study-pack.spec.ts` kèm ảnh chụp 3 viewport (`1440×900`, `768×1024`, `375×812`).
