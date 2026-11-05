---
title: "Dung promote staging de sua loi sua de #614"
date: 2026-11-05
summary: "PR #629 không merge vì 3 lỗi Important của #614; lập plan #630 khóa nội dung đề khi đã có bài làm."
---

# Dung promote staging de sua loi sua de #614

## What happened

Chạy `ak-ship staging --merge` để promote `develop` (`8ba2747d`) lên `staging`. Local gate đạt: 4659 test pass, typecheck pass, Biome sạch trên file được track. E2E không chạy theo lựa chọn của người dùng. Không có xung đột, migration hay secret mới.

Review tìm thấy 3 lỗi Important của #614, suy từ đọc code và chưa tái hiện trên trình duyệt:

- Sửa đề đã có bài làm làm lệch nội dung: `quiz_attempt` chỉ snapshot câu hỏi, còn `prompt`, `passage`, `optionBank` đọc từ đề hiện tại.
- `handleReconcile` ở edit mode báo thành công dù server có thể chưa ghi.
- Lỗi 409 `WRITING_SECTION_LOCKED` không có thông báo riêng ở web.

## Decision

PR #629 giữ mở, không merge. Người dùng chọn khóa nội dung khi đã có bài làm, không snapshot thêm và không cần migration. Tiêu đề, band, nguồn, trạng thái vẫn sửa được.

## Notes

- `ak-ship` không có mode `staging`; đã hỏi người dùng thay vì đoán.
- GitHub không cho tự request changes PR của chính mình, nên review được đăng dạng comment.
- `pnpm exec biome check .` báo lỗi ở `.claude/settings.local.json` bị gitignore; Biome không bật VCS ignore mặc định.

## Next steps

Thực hiện plan `plans/261105-0750-fix-614-prompt-edit-gaps/plan.md` (#630), merge vào `develop`, rồi chạy lại promote PR #629.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
