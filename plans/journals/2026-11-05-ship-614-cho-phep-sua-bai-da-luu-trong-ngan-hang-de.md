---
title: "Ship #614: Cho phép sửa bài đã lưu trong ngân hàng đề"
date: 2026-11-05
author: agent
tags: [assignments, web, composer, prompt-bank, patch]
---

# Ship #614: Cho phép sửa bài đã lưu trong ngân hàng đề

## Bối cảnh & Vấn đề

Bài tập đã lưu trong ngân hàng đề (`/assignments`) trước đây không có cách nào sửa lại trên giao diện web (ví dụ: giáo viên không đổi được dạng đề Writing, không sửa được tiêu đề, đoạn đọc hay câu hỏi/đáp án). Giáo viên buộc phải tạo một bài mới hoàn toàn.

Mặc dù backend đã cung cấp `PATCH /api/assignments/prompts/:id` và client repo đã có action `update-assignment-prompt`, nhưng trang `/assignments/new` trước đây chỉ chấp nhận search param `classId` và chưa hỗ trợ nạp đề theo `promptId`. Khung xem trước (`PromptPreviewAside`) và trang xem trước (`/assignments/preview`) cũng chỉ có nút "Xem trước" hoặc "Quay lại danh sách", thiếu nút "Chỉnh sửa".

## Các thay đổi chính

1. **Route Search Params & Remounting:**
   - Cập nhật `validateSearch` tại `apps/web/src/routes/_auth/assignments/new.tsx` hỗ trợ `promptId?: string`.
   - Bọc render trong `NewAssignmentPage` với `key={promptId ?? "new"}` để React remount sạch state khi chuyển đổi giữa các đề hoặc từ tạo mới sang sửa.

2. **Chế độ Edit Mode trong Composer:**
   - Khi có `promptId`, form nạp dữ liệu từ `data.assignmentPrompts`. Nếu không tìm thấy, hiển thị card thông báo thân thiện "Không tìm thấy đề này." kèm nút quay lại danh sách.
   - Khóa kỹ năng và phần thi (`lockPart={isEditing}`) bằng static chip, nhưng vẫn cho phép sửa dạng đề (`type`), tiêu đề, đoạn đọc, câu hỏi, đáp án, band, nguồn.
   - Thêm cờ `allowWriting={true}` vào `PromptComposer` để đề gộp kỹ năng (Reading/Listening + Writing) không bị ẩn mất phần Writing khi đang ở edit mode.

3. **Cách ly Draft Store:**
   - Khi ở edit mode, bỏ qua hoàn toàn việc đọc/ghi `assignment-draft` trong `localStorage`, ngăn chặn việc ghi đè bản nháp tạo mới của giáo viên trên máy.

4. **Diff Payload an toàn & Action `update-assignment-prompt`:**
   - Loại bỏ `skill` và `part` khỏi payload theo đúng `.strict()` của `assignmentPromptUpdateSchema`.
   - Chuẩn hóa so sánh phần `writing` với `restoreRich` để tránh tạo false-positive diff đối với các đề cũ có line breaks plain text, ngăn chặn lỗi 409 `WRITING_SECTION_LOCKED` đối với các đề đã được giao lớp hoặc đưa vào bài thi.

5. **Đường vào trực quan & Hỗ trợ Xem trước vòng tròn:**
   - Thêm nút **Chỉnh sửa** vào `PromptPreviewAside` ở `/assignments` bên cạnh nút "Xem trước".
   - Thêm nút **Chỉnh sửa** vào `/assignments/preview?id=...` bên cạnh nút "Quay lại danh sách".
   - Bổ sung `promptId?: string` vào `PreviewDraft` để khi xem trước từ màn hình sửa rồi quay lại, form vẫn giữ nguyên ngữ cảnh đề đang sửa cùng các chỉnh sửa chưa lưu.

## Kiểm thử & Verification

- 97 tests trong Vitest cho `apps/web/src/routes/_auth/assignments/` đều pass 100%.
- Kiểm tra toàn bộ types (`pnpm check-types` - 12/12 packages successful).
- Kiểm tra Biome linter & formatter sạch không có lỗi (`pnpm exec biome check` 100% clean).
