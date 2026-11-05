---
title: "Khóa thay đổi part của test đã có bài làm (#633)"
description: "Khóa PUT /api/assignments/tests/:id/parts trả 409 TEST_PARTS_LOCKED khi test có quiz_attempt, web hiển thị thông báo riêng và rollback state tránh lệch UI."
status: in_progress
priority: P1
effort: 3h
issue: 633
branch: vinh19410/ai-handle-issue-633
tags: [bugfix, server, web, api]
blockedBy: []
blocks: []
created: 2026-11-05
---

# Khóa thay đổi part của test đã có bài làm (#633)

## Overview

Theo ghi nhận từ PR #631 (kế thừa sau khi hoàn thành #630):
`PUT /api/assignments/tests/:id/parts` cho phép thay hoặc gỡ đề (prompt) trong một bộ đề (assignment test) đã có bài luyện tập (`quiz_attempt`) mà không kiểm tra attempt.
Do bài làm của học viên chỉ snapshot câu hỏi (`questions_snapshot`), còn các màn xem lại bài, giải thích câu hỏi và chấm thi đọc nội dung bài làm theo các part hiện tại trong `assignment_test_part`, việc thay đổi hoặc gỡ part sẽ khiến nội dung câu hỏi và đề thi không còn khớp nhau.

Mục tiêu của kế hoạch này là đóng lỗ hổng trên bằng cách từ chối mọi yêu cầu thay hoặc gỡ part của test đã có bài làm bằng mã lỗi riêng (HTTP 409 `TEST_PARTS_LOCKED`), đồng thời hiển thị thông báo rõ ràng trên giao diện web và giữ UI đồng bộ trung thực.

## Quyết định đã chốt (Advisory Supervision - Kongming)

1. **Khóa trên mọi trạng thái attempt (`in_progress` lẫn `submitted`):**
   - Không lọc theo `status`: Cả học viên đang làm bài lẫn học viên đã nộp đều cần nội dung part không bị thay đổi.
   - Truy vấn xác định: `quiz_attempt` có `org_id = ctx.orgId` và `test_id = :id` (LIMIT 1), không lọc theo `mode`, không join `class_assignment` (lượt giao lớp chỉ gắn với `promptId`, không có `testId`).
2. **So khớp hai map `part -> (promptId, qStartOverride)`:**
   - Không so theo thứ tự mảng hay `position` (vì client có thể gửi part theo thứ tự bất kỳ và position do server sinh từ preset).
   - Chuẩn hóa `qStartOverride ?? null` ở cả hai phía (DB và payload).
   - Nếu hai map giống hệt nhau (không đổi slot, không đổi promptId, không đổi qStartOverride): bỏ qua thao tác ghi, trả về 200 ngay (idempotent, giữ nguyên ID của rows cũ).
   - Nếu có bất kỳ sự khác biệt nào (thêm part, gỡ part, đổi promptId, đổi qStartOverride) VÀ tồn tại `quiz_attempt` gắn với test: trả 409 `{ error: "test parts locked", code: "TEST_PARTS_LOCKED" }`.
3. **Mã lỗi và hợp đồng API:**
   - Thêm hằng `ASSIGNMENT_TEST_ERROR_CODES` với mã `PARTS_LOCKED: "TEST_PARTS_LOCKED"` vào `packages/api/src/contracts.ts` (ngang hàng `ASSIGNMENT_PROMPT_ERROR_CODES`).
4. **Hiển thị lỗi và Rollback trên Web:**
   - Bổ sung ánh xạ trong `use-kernel-form-submit.ts`:
     `"Bộ đề đã có học viên làm bài nên không thể thay đổi hoặc gỡ part. Bạn vẫn có thể đổi tên, thời gian và trạng thái bộ đề. Muốn thay đổi đề, hãy tạo bộ đề mới."`
   - Trong `apps/web/src/components/assignment-tests/test-builder-shell.tsx`:
     Chụp bản sao trước khi gán/gỡ (`prevPromptId`, `prevOverride`). Nếu `persistParts` trả về `result === null` hoặc `result.kind === "definite-failure"`, rollback state theo từng part bằng functional updater để UI không bị lệch so với máy chủ. Không rollback khi `committed` hoặc `outcome-unknown`.
## Non-goals

- Không thay đổi schema DB, không chạy migration.
- Không thêm cờ `hasAttempts` vào DTO test list.
- Không khóa việc chỉnh sửa metadata của test (tên, thời gian làm bài, trạng thái vẫn sửa được qua PATCH).
- Không xử lý `DELETE /api/assignments/tests/:id` (nằm ngoài phạm vi issue #633).

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Khóa thay đổi part ở server](./phase-01-lock-test-parts-on-server.md) | Pending |
| 2 | [Thông báo lỗi và rollback state ở web](./phase-02-surface-lock-errors-and-rollback-on-web.md) | Pending |
| 3 | [Kiểm thử tổng thể và Quality Gates](./phase-03-verify-quality-gates.md) | Pending |

## Success Criteria

- [ ] `PUT /api/assignments/tests/:id/parts` từ chối với 409 `TEST_PARTS_LOCKED` khi test có `quiz_attempt` và có thay đổi part (thêm/gỡ/đổi prompt/đổi override).
- [ ] Test chưa có bài làm vẫn thay đổi, gỡ hoặc thêm part bình thường (HTTP 200).
- [ ] Gửi lại danh sách part giống hệt trên test đã có bài làm trả về 200 và không làm xáo trộn part rows trong DB.
- [ ] Attempt của tổ chức (org) khác không gây khóa test của tổ chức hiện tại.
- [ ] Web hiển thị câu thông báo lỗi cụ thể cho mã `TEST_PARTS_LOCKED` thay vì thông báo chung.
- [ ] Giao diện TestBuilderShell khôi phục lại slot/override cũ khi hành động gán/gỡ bị server từ chối.
- [ ] Mọi kiểm tra tự động `pnpm check`, `pnpm check-types`, `pnpm test` đều vượt qua không có lỗi.

## Risks

- **Race condition giữa lúc kiểm tra attempt và ghi DB:** Giống như tiền lệ #630 ở prompt, D1 không hỗ trợ multi-table transaction; cửa sổ race rất nhỏ và được chấp nhận.
- **Test demo có bài làm mẫu bị khóa:** Test demo của org (nếu có attempt mẫu trong grading) sẽ bị khóa part theo đúng quy tắc bảo vệ tính toàn vẹn dữ liệu.

## Rollback

Revert git commit. Không có thay đổi schema database.

<!-- slug: 633-lock-test-parts-with-attempts -->
