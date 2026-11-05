---
title: "Sửa 3 lỗi của tính năng sửa đề trong ngân hàng (#614)"
description: "Khóa nội dung đề khi đã có bài làm, báo đúng lỗi khóa và đối soát trung thực ở edit mode, để PR #629 có thể promote lên staging."
status: pending
priority: P1
effort: 5h
issue: 630
branch: develop
tags: [bugfix, frontend, backend, api]
blockedBy: []
blocks: []
created: 2026-11-05
---

# Sửa 3 lỗi của tính năng sửa đề trong ngân hàng (#614)

## Overview

#614 mở nút Chỉnh sửa cho mọi đề trong ngân hàng. Review PR #629 (promote `develop` lên `staging`) tìm thấy ba lỗi ở mức Important nên PR chưa được merge. Các lỗi suy từ đọc code, chưa tái hiện trên trình duyệt.

1. Sửa đề đã có bài làm làm nội dung lệch với bài làm. `quiz_attempt` chỉ snapshot câu hỏi, còn `prompt`, `passage`, `optionBank` và các trường nội dung khác đọc từ đề hiện tại.
2. Đối soát ở edit mode báo thành công dù server có thể chưa ghi.
3. Lỗi 409 khóa đề không có thông báo riêng ở web, nên thử lại vẫn fail.

## Quyết định đã chốt

- **Khóa khi đã có bài làm** (người dùng chọn 2026-11-05). Server từ chối đổi nội dung khi đề đã có ít nhất một `quiz_attempt`. Vẫn sửa được tiêu đề, band, nguồn và trạng thái. Đề đã giao nhưng chưa ai làm vẫn sửa được nội dung.
- Khóa `WRITING_SECTION_LOCKED` hiện có giữ nguyên hành vi: phần writing vẫn khóa từ lúc giao lớp hoặc đưa vào test, study pack.

## Non-goals

- Không snapshot thêm nội dung đề và không thêm migration.
- Không thêm chức năng nhân bản đề. Muốn đổi nội dung đề đã có bài làm thì tạo đề mới.
- Không xử lý các mục informational khác của review #629 (`MAIL_FROM`, polling #618, tab lời mời #616, e2e của #614).

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Khóa nội dung đề ở server](./phase-01-lock-prompt-content-on-server.md) | Pending |
| 2 | [Thông báo lỗi khóa ở web](./phase-02-surface-lock-errors-in-web.md) | Pending |
| 3 | [Đối soát trung thực ở edit mode](./phase-03-honest-reconcile-in-edit-mode.md) | Pending |

Phase 2 phụ thuộc phase 1 vì dùng mã lỗi mới. Phase 3 độc lập.

## Success Criteria

- [ ] PATCH đổi trường nội dung của đề đã có bài làm trả 409 `PROMPT_CONTENT_LOCKED`, cả bài giao lớp lẫn bài luyện tập theo test.
- [ ] Lưu lại form không đổi nội dung, hoặc chỉ đổi tiêu đề, band, nguồn, trạng thái, vẫn thành công trên đề đã có bài làm.
- [ ] Đề đã giao nhưng chưa có bài làm vẫn sửa được nội dung, trừ phần writing đang bị khóa.
- [ ] Web hiện thông báo riêng cho `PROMPT_CONTENT_LOCKED` và `WRITING_SECTION_LOCKED`, ở cả composer và test builder.
- [ ] Đối soát chỉ báo thành công khi dữ liệu mới từ server khớp nội dung đã gửi; nếu không khớp thì giữ nguyên form và báo lỗi.
- [ ] `pnpm exec biome check .`, `pnpm check-types`, `pnpm test` đều đạt trên code được track.
- [ ] Sau khi merge vào `develop`, chạy lại promote PR #629.

## Risks

- **Khóa nhầm khi form không đổi gì.** Composer luôn gửi đủ mọi trường và đã `trim()`, nên dữ liệu cũ có thể khác dữ liệu gửi lên dù giáo viên không sửa. Phase 1 so sánh sau chuẩn hóa và có test round-trip.
- **Attempt demo cũng khóa đề.** `grading.ts` tạo attempt mẫu cho bài chấm demo. Đề mẫu vì vậy bị khóa nội dung, đúng theo định nghĩa đã chốt.

## Rollback

Revert commit. Không có thay đổi schema hay dữ liệu.

## Validation Log

### Session 1 (2026-11-05)

- Q: Hướng xử lý sửa đề đã giao? A: Khóa khi có bài làm. Đã áp dụng vào toàn bộ plan.

### Verification Results

- Tier: Standard. `ak plan validate` đạt.
- Đã kiểm chứng trên code: các file cần sửa, `handleReconcile` ở `new.tsx:831`, nhánh `definite-failure` ở `use-kernel-form-submit.ts:40`, tên package `server` và `web`, `submit.error` hiển thị ở composer và test builder.
- Chưa kiểm chứng: `HttpError.code` có được điền cho `update-assignment-prompt` hay không. Phase 2 bước 4 kiểm tra việc này.
- Failed: 0.

<!-- slug: fix-614-prompt-edit-gaps -->
