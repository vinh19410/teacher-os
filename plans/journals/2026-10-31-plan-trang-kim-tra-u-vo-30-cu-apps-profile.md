---
title: Plan trang kiểm tra đầu vào 30 câu apps/profile
date: 2026-10-31
summary: "Lập plan #511 thay quiz 5 câu bằng trang riêng 15 câu Vocab + Grammar và 15 câu Listening"
---

# Plan trang kiểm tra đầu vào 30 câu apps/profile

## What happened
Lập plan #511 tại plans/261031-0736-511-profile-placement-test/. Mọi CTA làm test trên trang profile đang cuộn tới quiz nhúng 5 câu; repo chưa có đề hay audio kiểm tra đầu vào.

## Decision
- AI soạn đề gốc, audio bằng TTS hoặc cô Mỹ tự thu, cô Mỹ duyệt trước khi phát hành.
- Trang tĩnh, chấm phía client, không đổi API hay schema lead; kết quả về form qua query một lần.
- Không giới hạn giờ, mỗi đoạn audio nghe tối đa 2 lần.
- Gỡ quiz 5 câu, giữ id section để link cũ vẫn sống.
- Cổng phát hành là trường status của questions.json, không phải ghi chú quy trình.

## Next steps
Cô Mỹ duyệt plan và nội dung đề. Cần công cụ TTS hoặc bản thu của cô Mỹ. Xác định host production của msmy.io.vn trước smoke test.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
