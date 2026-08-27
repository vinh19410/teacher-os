---
title: "Plan collapsible sidebar icon-rail (issue #97)"
date: 2026-08-27
summary: "Planned desktop-only collapsible icon-rail sidebar for teacher-os; 2 kongming advisory checkpoints, published as issue #97 ready to review"
---

# Plan collapsible sidebar icon-rail (issue #97)

# Plan: collapsible-sidebar (issue #97)

## Context

User yêu cầu ak:plan --github --advice: "sidebar có thể thu gọn lại thay vì chỉ fixed như hiện tại". Layout là CSS Grid track cố định `248px_1fr` trong app-shell.tsx:68; sidebar.tsx vừa được fix padding-top thủ công (pt-8).

## What happened

- Mode auto-detect → **fast** (scout Explore chạy thay research; fast bỏ red-team/validation nhưng bù bằng checkpoint --advice).
- Thiết kế chọn: icon-rail 64px desktop (≥921px), toggle ở Topbar, persist localStorage, mobile drawer giữ nguyên.
- Kongming checkpoint #1 (same-model — host ZCode/GLM không pin Fable/Sol): **GO** với 2 điều chỉnh bắt buộc: rail 64px + `app:px-2` khi collapsed (Avatar md 40px), invariant mọi class collapsed prefix `app:`. Phát hiện tooltip.tsx đã tồn tại trong kit (nghĩ là chưa có).
- Kongming checkpoint #2 (review plan hoàn chỉnh vs code thật): Conditional GO với 4 fix văn bản F1–F4 (snippet vi phạm chính invariant D10; ambiguity px-4 base thay vì append; e2e assert sidebar-avatar sẽ đỏ vì img chỉ render khi có ảnh; sai path avatar + tên gate check-types). Tất cả fix đã áp dụng + bổ sung risk prefers-reduced-motion và seed localStorage phải dùng page.addInitScript.
- Đăng issue #97 label `ready to review`; plan linked vào store (`teacher-os/260827-0650`, dir `plans/260827-1350-collapsible-sidebar`).

## Decisions & rationale

- Icon-rail thay vì off-canvas: giữ navigation context, tránh overlay logic desktop thêm.
- Không jsdom cho unit test hook: tách pure localStorage fns (readCollapsedPref/writeCollapsedPref) test bằng vitest node env hiện có — codebase cố tình không có testing-library.
- D10 invariant "mọi class collapsed prefix app:" là hàng rào chống leak CSS sang mobile drawer — risk lớn nhất của thiết kế.
- Transition grid-template-columns: exit-criteria định trước — jank dashboard thì bỏ animation giữ snap, không cứu bằng FLIP.

## Reflection

Hai checkpoint kongming đều bắt lỗi thật mà self-review bỏ lỡ (đặc biệt F3 avatar-img-conditional-render và chi tiết addInitScript vs evaluate). Chi phí ~4 phút mỗi checkpoint đổi ra các e2e spec sẽ đỏ ngay khi viết — đáng giá.

## Next

- Human review issue #97 → `/ak:cook plans/260827-1350-collapsible-sidebar/plan.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
