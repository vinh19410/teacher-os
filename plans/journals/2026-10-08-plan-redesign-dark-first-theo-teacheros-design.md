---
title: Plan redesign dark-first theo teacheros-design
date: 2026-10-08
summary: "Lập plan 7 phase redesign apps/web + apps/student theo design Figma Make mới (dark mặc định, accent cam, Inter Tight/DM Mono), issue #349"
---

# Plan redesign dark-first theo teacheros-design

## What happened

- Đọc design repo private `vinh19410/teacheros-design@fcf60a5` (Figma Make, React 19 + Tailwind v4, mock data, "Band/Room"). Cấu trúc trang khớp gần 1-1 với route của `apps/web` và `apps/student`.
- Chốt với user: dark mặc định + toggle Light; giữ thương hiệu Teacher OS; phạm vi web + student (không landing); trạng thái đơn sắc + cam, đỏ chỉ cho hành động phá hủy.
- Viết plan `plans/261008-1555-redesign-dark-design-system/` (7 phase, ~36h) và tạo issue #349 (labels `enhancement`, `ready to review`).

## Findings

- CSP web có `script-src 'self'` và `font-src 'self' data:` (`apps/web/src/security-headers.ts:15`). Vì vậy không dùng được Google Fonts như design hay script theme inline: phải self-host bằng `@fontsource` và dùng file tĩnh `/theme-init.js`.
- `next-themes` (đang dùng trong `sonner.tsx`) chèn script inline → thay bằng hook riêng.
- Light accent `#e8490f` của design có contrast 3.90 → trượt AA; plan dùng `#c93d0b` (5.05). Viền `#262626` trên nền `#0a0a0a` chỉ đạt 1.31 → thêm `--line-strong` cho ranh giới input.
- Token tập trung ở `packages/ui/src/styles/globals.css` → chiến lược giữ tên token, đổi giá trị; đổi tên `accent-blue` → `hot` (68 file, codemod, commit riêng).
- Red-team tự soát lật một giả định sai: e2e không assert màu nhưng **có selector bám utility class** (`.grid.grid-cols-3 > div`, `div.mt-8`, `div.overflow-hidden`, `opacity-60`) và class móc (`aside.sidebar`, `lesson-block`, `assign-item`). Đã thêm bảng "E2E bám class" vào plan và gắn từng mục vào phase 3–5.

## Decision

Redesign chỉ đổi giao diện: không thêm tính năng chỉ có trong mock, không đổi API/route/copy tiếng Việt. Một nhánh `feat/redesign-dark-design-system`, commit theo phase, một PR vào `develop`.

## Next steps

- `/ak:cook plans/261008-1555-redesign-dark-design-system/plan.md`, bắt đầu từ phase 1 (token/font/theme).
- Ở phase 1 cần xác nhận worker student serve `public/theme-init.js` (student chưa có thư mục `public/`).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
