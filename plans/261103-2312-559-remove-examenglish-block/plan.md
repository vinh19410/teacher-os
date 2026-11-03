---
title: "#559: Bỏ khối \"Đã làm test examenglish\" khỏi form đăng ký profile"
description: "Xoá khối tuỳ chọn nhập kết quả ExamEnglish (HTML, CSS, JS, draft) khỏi apps/profile; placement chỉ còn lấy từ quiz."
status: pending
priority: P3
effort: 0.5h
issue: 559
branch: fix/559-remove-examenglish-block
tags: [frontend, profile]
blockedBy: []
blocks: []
created: 2026-11-03
---

# Plan: #559 — Bỏ khối "Đã làm test examenglish"

## Outcome

Form đăng ký ở `apps/profile` không còn khối `<details>` "Đã làm test examenglish?", 2 link ExamEnglish và ô nhập kết quả. `placement` gửi lên server chỉ gồm kết quả quiz.

## Non-goals

- Không đổi API/schema lead; không sửa quiz placement; không sửa plan cũ #506 (bản ghi lịch sử).

## Phạm vi đã scout

Tất cả nằm trong `apps/profile/public/index.html` (thư mục output build không sửa tay). Test trong `apps/profile/tests/` không tham chiếu examenglish.

## Phases

| # | Phase | Trạng thái |
|---|---|---|
| 1 | [Xoá khối ExamEnglish](phase-01-remove-examenglish-block.md) | pending |

## Acceptance criteria

- `grep -i examenglish apps/profile/public/index.html` không còn kết quả.
- Gửi form vẫn tạo lead; `placement` giữ giá trị quiz.
- `pnpm --filter profile test` và `pnpm exec biome check .` xanh; không lỗi console.
