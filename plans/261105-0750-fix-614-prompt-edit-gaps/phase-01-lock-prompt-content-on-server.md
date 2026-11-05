---
phase: 1
title: "Khóa nội dung đề ở server"
status: pending
priority: P1
effort: "2.5h"
dependencies: []
---

# Phase 1: Khóa nội dung đề ở server

## Goal

`PATCH /api/assignments/prompts/:id` từ chối đổi nội dung của đề đã có bài làm, và vẫn chấp nhận payload không đổi nội dung.

## Files to Create / Modify

- Modify: `apps/server/src/routes/assignments/index.ts` — thêm kiểm tra khóa trong PATCH.
- Modify: `apps/server/src/routes/hybrid-assignment.test.ts` hoặc test route assignments cạnh đó — thêm test.

## Định nghĩa

**Đề đã có bài làm:** tồn tại `quiz_attempt` cùng `orgId` thỏa một trong hai:

- `assignmentId` trỏ tới `class_assignment` có `promptId` bằng đề này.
- `testId` trỏ tới test có `assignment_test_part.promptId` bằng đề này. Nhánh này gồm bài luyện tập (`mode = "practice"`, `assignmentId` null).

**Trường nội dung bị khóa:** `type`, `prompt`, `intro`, `passage`, `transcript`, `cueTopic`, `cuePoints`, `audioName`, `imageUrl`, `note`, `questions`, `optionBank`, `writing`.

**Trường vẫn sửa được:** `title`, `band`, `source`, `status`.

## Tasks & Steps

1. Viết test trước, các trường hợp:
   - Đề có attempt giao lớp, đổi `passage` → 409, `code: "PROMPT_CONTENT_LOCKED"`, dữ liệu không đổi.
   - Đề có attempt giao lớp, đổi `optionBank` hoặc `questions` → 409.
   - Đề thuộc test có attempt luyện tập, đổi `prompt` → 409.
   - Đề có attempt, chỉ đổi `title`, `band`, `source`, `status` → 200.
   - Đề có attempt, gửi lại đủ các trường với giá trị như đọc từ snapshot, kèm khoảng trắng đầu cuối ở trường text → 200.
   - Đề đã giao nhưng chưa có attempt, đổi `passage` → 200.
   - Đề của org khác không bị khóa bởi attempt ngoài org.
   - Đề hybrid đã giao, đổi `writing` → vẫn trả `WRITING_SECTION_LOCKED`.
2. Trong handler PATCH, sau các bước validate và sau khối kiểm tra `writing` hiện có, xác định trường nội dung nào thực sự đổi:
   - So sánh từng trường có mặt trong payload với giá trị của `row`.
   - Trường text: coi `null` như `""` và `trim()` hai phía.
   - `questions`, `optionBank`: parse giá trị đang lưu bằng đúng hàm parse đang dùng khi đọc, rồi so sánh JSON của hai bên.
   - `writing`: dùng lại kết quả `writingChanged` nếu có thể.
3. Chỉ khi có trường nội dung đổi mới query attempt, để lưu tiêu đề không tốn thêm truy vấn.
4. Nếu có attempt, trả `c.json({ error: "prompt content locked", code: "PROMPT_CONTENT_LOCKED" }, 409)` trước khi ghi.
5. Giữ logic trong file route hiện có. Chỉ tách helper cục bộ nếu handler khó đọc.

## Verification

- `pnpm --filter server test -- assignments` và `pnpm --filter server test -- hybrid-assignment`.
- `pnpm check-types`.

## Risks

- Race: học viên bắt đầu làm ngay sau khi kiểm tra và trước khi ghi. Cửa sổ rất nhỏ và không gây hỏng dữ liệu, nên chấp nhận và không thêm transaction.
