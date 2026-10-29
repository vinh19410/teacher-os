---
title: "Plan vocab-lesson-detail-two-ctas: bỏ thẻ thống kê theo bài, chỉ giữ Ôn tập / Bắt đầu học"
date: 2026-10-20
summary: "Lập plan 261020-1058 (issue #372): trang /vocab/$deckId bỏ 3 thẻ thống kê, thay CTA tự-chọn bằng 2 nút; thẻ Từ mới tổng lên dashboard /vocab"
---

# Plan vocab-lesson-detail-two-ctas

## What happened
Lập plan qua `ak-plan --github` cho yêu cầu bỏ hàng 3 thẻ Từ mới / Đến hạn ôn / Đã thuộc ở trang chi tiết bài học, chỉ giữ 2 hành động Ôn tập và Bắt đầu học, và đưa thống kê về mức tổng. Đã mở issue #372 (`ai-handle`, `ready to review`).

Khi scout thấy chế độ học/ôn đang được chọn ngầm trong `VocabSessionView` (`hasNewCards ? "learn" : "review"`), nên 2 nút riêng biệt cần một tín hiệu chế độ đi vào session.

## Decision
- Session route nhận search param `mode=learn|review`; không có `mode` thì giữ hành vi cũ; `mode=learn` khi hết từ mới thì fallback sang ôn.
- Ôn tập vẫn cho ôn khi chưa có từ đến hạn (dùng `allowAllWhenNoneDue` như nhánh "Ôn lại bộ từ" cũ); chỉ disabled khi bài chưa có từ nào đã học.
- Dashboard `/vocab` đã có Đến hạn ôn / Đã thuộc / Thành thạo tổng; chỉ thêm thẻ Từ mới tổng, tính client-side từ `decks[].newCount` nên không đổi contract API.
- 4 spec E2E dùng testid cũ được liệt kê cụ thể theo luồng học hay ôn.

## Next steps
- Review `plans/261020-1058-vocab-lesson-detail-two-ctas/plan.md` hoặc issue #372.
- Thực thi: `/ak:cook plans/261020-1058-vocab-lesson-detail-two-ctas/plan.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
