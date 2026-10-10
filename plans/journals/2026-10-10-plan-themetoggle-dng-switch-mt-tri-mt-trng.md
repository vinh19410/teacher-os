---
title: Plan ThemeToggle dạng switch mặt trời/mặt trăng
date: 2026-10-10
summary: "Lập plan 1 phase đổi ThemeToggle từ nút pill sang switch icon, issue #356"
---

# Plan ThemeToggle dạng switch mặt trời/mặt trăng

## What happened
Lập plan `plans/261010-1511-theme-switch-toggle/` (fast mode, 1 phase) và issue
vinh19410/teacher-os#356. `ThemeToggle` (`packages/ui/src/components/theme-toggle.tsx`) dùng chung
ở 7 chỗ (topbar web, login web, shell student, 4 trang auth student), nên chỉ cần sửa một file.

## Decision
- User chọn: núm tròn màu mực (`bg-fg`) trượt và mang icon của theme hiện tại, hai icon mờ trên
  track, bỏ chữ "Tối"/"Sáng".
- ARIA đổi từ action button sang `role="switch"`, `aria-checked` = đang tối, label cố định
  "Giao diện tối", vì hình thức giờ là switch.
- Không đụng `useTheme`, persistence, đồng bộ giữa tab.

## Next steps
`/ak:cook plans/261010-1511-theme-switch-toggle/plan.md`, thêm test `ThemeToggle` vào
`apps/web/src/lib/theme.test.tsx`, screenshot 3 viewport, full e2e trước merge.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
