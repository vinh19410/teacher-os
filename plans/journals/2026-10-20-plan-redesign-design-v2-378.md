---
title: "Plan redesign-design-v2: refactor web + student theo design v2, kèm Practice/History/Classmates/⌘K"
date: 2026-10-20
summary: "Lập plan 261020-1446-378 (issue #378): 12 phase, ~78h; base mới là teacheros-design-v2@7a53fc0 (shadcn neutral, Geist, light mặc định); DoD là ảnh đối chiếu design ↔ app từng màn PASS"
---

# Plan redesign-design-v2

## What happened
Lập plan qua `ak-plan --github` cho yêu cầu lấy design v2 làm base và dựng lại toàn bộ giao diện. Design v2 là export Figma Make (React 19, Tailwind v4, router hash, mock data), đổi hẳn ngôn ngữ thị giác so với v1 (dark + cam): shadcn neutral oklch, Geist, light mặc định, shell sidebar-07. Đã mở issue #378 (`ai-handle`, `ready to review`, `enhancement`).

Scout cho thấy org switcher, chuông lời mời, điểm danh, giao dịch chưa khớp đã có trong app; thực sự mới chỉ là Practice catalog, History, tab Bạn cùng lớp và ô ⌘K.

## Decision
- User chốt: light mặc định, giữ tên Teacher OS, **gồm tính năng mới**, DoD đối chiếu cấu trúc (không pixel-diff), Practice lấy mọi đề `ready` của tổ chức, **không làm Dictation**, Bạn cùng lớp chỉ tên + chữ tắt.
- Harness `scripts/design-compare/` clone design ở SHA ghim (repo private, chạy local port 8200), chụp design | app cũ | app mới theo 3 viewport × 2 theme; `verdict.md` 100% PASS là điều kiện hoàn thành.
- Token v1 được alias sang token v2 ở phase 2 để app đổi theo ngay, xóa alias ở phase 12.
- Practice cần migration `quiz_attempt`: `assignment_id` nullable + `test_id` + `mode`; mọi query giáo viên lọc `mode='assignment'`; backup DB trước migration.

## Next steps
- Review `plans/261020-1446-378-redesign-design-v2/plan.md` hoặc issue #378.
- Thực thi: `/ak:cook plans/261020-1446-378-redesign-design-v2/plan.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
