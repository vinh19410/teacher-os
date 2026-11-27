# Journal — Redesign `/teacher/assignments` theo `open-design/assignments.html` (#1043)

- **Ngày:** 2026-11-27
- **Issue liên quan:** `#1043` (chính), `#979` (lịch sử giao từ ngân hàng), `#983` (giao 1 đề cho nhiều lớp trực tiếp từ `/assignments`)
- **Branch:** `vinh19410/feat-redesign-teacher-assignments` → `develop` (beta)

## Bối cảnh & Mục tiêu

Trang `/teacher/assignments` trước đây hiển thị lưới thẻ rời rạc và panel xem trước tĩnh, thiếu tương tác giao đề nhiều lớp, chưa hiện lịch sử giao theo lớp (`#979`), chưa có xóa bản nháp thật và chưa tối ưu bề rộng `1110px` của `AppShell` trên màn hình `1440px`.

## Các quyết định kiến trúc & điểm bẫy đã xử lý

1. **Bảo vệ dữ liệu học viên trước `ON DELETE CASCADE` (`DELETE /api/assignments/prompts/:id`):**
   - `class_assignment.prompt_id` có `ON DELETE CASCADE`, trong khi `PATCH /prompts/:id` cho phép chuyển ngược `ready → draft`.
   - `deleteAssignmentPrompt` khóa bằng một câu `DELETE ... WHERE status = 'draft' AND org_id = ? AND library_ref IS NULL AND id NOT LIKE 'demo-prompt:%' AND NOT EXISTS (...)` kiểm tra cả 3 bảng (`class_assignment`, `assignment_test_part`, `study_pack_item`), trả mã `409` phân biệt (`PROMPT_DELETE_NOT_DRAFT` vs `PROMPT_DELETE_REFERENCED`) và giữ 403 cho `ta`.
2. **Tránh Top Layer của `<dialog>` gốc trong `AssignPromptToClassesModal`:**
   - Dùng `@/components/ui/modal` (`z-100`) thay cho `<dialog>.showModal()` để popover lịch `DatePickerInput` (`z-[110]`) tương tác được, đồng thời khóa gửi lặp với cờ `outcomeUnknown?: boolean` khi `refresh()` thất bại ngay cả khi `succeededIds.length === 0`.
3. **Bố cục master-detail trong `AppShell` (`1110px` inner width):**
   - Dùng preview `w-[360px] 2xl:w-[392px]` ở `min-[1360px]` và lưới bảng 5 cột `minmax(0,1fr) 128px 48px 136px 80px`, chuyển thành drawer `role="dialog"` có focus trap `Tab` ở `< 1360px`.
   - Thay `role="group"` bị Biome a11y cảnh báo bằng `<fieldset className="m-0 min-w-0 border-0 ...">` và xác nhận trên 4 viewport (`1440×900`, `768×1024`, `375×812`, `320×568`) đều không tràn ngang.
4. **Ranh giới bảo mật tờ đề học viên (`#847`):**
   - `Band` hiển thị ở bảng & header giáo viên, còn `PromptStudentPaper` chỉ render đề sạch (`PinOverlay` và `<img>` loại trừ lẫn nhau qua `isValidPin`, cloze không rò rỉ đáp án hay `alts`).

## Findings sau Code Review & Kiểm chứng

- `code-reviewer` phát hiện class không tồn tại `hover:bg-muted-strong` trên 3 nút quick-action (đổi sang `hover:bg-foreground/10`), lỗi rò focus khi xóa bản nháp trong drawer `< 1360px`, `nowMs` không thuần trong `useMemo` `historyItems`, render trùng `<img>` + `PinOverlay` trong `PromptStudentPaper`, và lỗ hổng guard `outcome-unknown` khi `succeededIds.length === 0`.
- Tất cả đã được sửa, bổ sung test unit (32/32 tests trên 4 file mới/sửa) và E2E `#847` trong `assignment-bank.spec.ts` (3/3 passed).
