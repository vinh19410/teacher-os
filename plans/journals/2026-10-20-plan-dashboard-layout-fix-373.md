---
title: "Plan dashboard-layout-fix: giờ học đè tên lớp ở /dashboard"
date: 2026-10-20
summary: "Lập plan 261020-1103 (issue #373): sửa hàng lịch dashboard vỡ do token --text-2xl 40px sau redesign #350"
---

# Plan dashboard-layout-fix: giờ học đè tên lớp ở /dashboard

## What happened
Người dùng báo dashboard giáo viên bị vỡ (kèm screenshot): giờ `19:00` chồng lên tên lớp và dòng meta trong "Lịch hôm nay" / "Lịch sắp tới". Lập plan qua `ak-plan --github` và mở issue #373 (`ai-handle`, `bug`, `ready to review`).

Nguyên nhân đã kiểm chứng: hàng lịch là `grid-cols-[80px_1fr]` với giờ `font-mono text-2xl`. Redesign #350 đặt `--text-2xl: 40px`, còn design gốc `teacheros-design@fcf60a5` dùng `text-2xl` mặc định của Tailwind (~22.5px). DM Mono 40px rộng ~120px nên tràn cột 80px. Ngoài ra dòng meta ghép cứng làm dư dấu `·` khi topic rỗng.

## Decision
- Sửa ở chỗ dashboard dùng token, không đổi `--text-2xl` toàn cục vì khoảng 20 file khác dùng cỡ 40px có chủ đích.
- Giờ `text-lg tabular-nums whitespace-nowrap`, cột giờ `auto` + `min-w-[5ch]`, tên lớp `min-w-0 break-words`. Tiêu đề section đổi sang `text-xl`.
- Gộp 2 khối hàng lịch lặp thành `ScheduleRow`; thêm helper `formatClassSessionMeta` lọc phần rỗng.

## Next steps
- Review `plans/261020-1103-dashboard-layout-fix/plan.md` hoặc issue #373.
- Thực thi: `/ak:cook plans/261020-1103-dashboard-layout-fix/plan.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
