# Ship Beta: Đồng bộ trang chi tiết lớp học viên (`/classes/$classId`) theo Design v2 (#389)

- **Ngày:** 2026-10-21
- **Issue:** #389
- **Nhánh:** `ai-handle-issue-389` → `develop`
- **Plan:** `plans/261021-1401-student-class-detail-design-fidelity/plan.md`

## Tóm tắt kỹ thuật
1. **Primitives & Ring (`Phase 1`):**
   - Bổ sung `Tabs`, `Badge`, `AvatarInitials` chuẩn design v2 tại `apps/student/src/components/ui/`.
   - Sửa `RingStat` từ token v1 không tồn tại (`stroke-surface`, `stroke-hot`) sang `stroke-muted` / `stroke-primary`; dọn class bo góc xung đột (`rounded-lg rounded-xl`, `rounded-full rounded-md`).
2. **Header, Todo Banner & Thẻ thông tin lớp (`Phase 2`):**
   - Chuyển `BackHomeLink` sang kiểu nút ghost v2 kèm icon `ArrowLeft` (`aria-hidden="true"`), giữ nguyên đích `/` và accessible name `"Trang chủ"`.
   - Thêm `TodoBanner` khi lớp còn bài `class_assignment` chưa nộp, ưu tiên theo `deriveAssignmentStatus`.
   - Thay card giáo viên rời bằng `ClassInfoCard` (`<dl>` 2→4 cột + footer tổng hợp thời lượng tháng, khung giờ, và buổi tới đồng nhất với `findNextLessonId`).
3. **4 Tabs (`Phase 3`):**
   - `ClassLessonList`: chuyển sang timeline dọc 32px, highlight thẻ `Buổi tới`, làm mờ buổi `upcoming` sau buổi tới.
   - `ClassAssignmentTable`: thay danh sách thẻ bằng bảng `Table` v2 cuộn ngang an toàn ở 375px, giữ nguyên `aria-label` `"Làm bài: …"` / `"Xem lại kết quả: …"`.
   - `SyllabusTab` & `ClassmatesTab`: dùng icon tròn `Check`/`CircleDashed` và `AvatarInitials`.
4. **Kiểm chứng (`Phase 4`):**
   - Unit test `apps/student`: 38 files, 344 tests pass.
   - Visual regression `capture.mjs --screens s-class-detail --side both --label new`: 18 ảnh (3 viewport × 2 theme), 0 lỗi.
   - Playwright E2E: 172/172 pass.
