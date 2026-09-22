---
title: Hiển thị kỹ năng syllabus trong modal tạo lớp
date: 2026-09-22
summary: "Issue 229: option đếm kỹ năng và Tag dưới dropdown, không đổi payload lớp."
---

# Hiển thị kỹ năng syllabus trong modal tạo lớp

## What happened
Ship beta cho issue #229 trên nhánh `vinh19410/feat/class-modal-syllabus-skills`. Modal tạo lớp hiện `Tên · N kỹ năng` trên option và hàng Tag "Kỹ năng giáo trình" khi đã chọn syllabus.

## Decision
Hint nằm ngoài `Field` vì `Field` chỉ gắn `htmlFor` khi có một child. E2E lấy id template từ URL `/syllabus/:id`, không dùng id bản copy. Không copy skill giáo trình vào payload `skills`. Câu "Syllabus chưa khai báo kỹ năng" giữ cho mọi syllabus rỗng skill, kể cả Giao tiếp.

## Next steps
PR vào `develop`. Chưa merge (vibe không có `--ship`).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
