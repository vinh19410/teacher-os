---
title: "Gộp trang /assignments và /assignments/bank (issue #267)"
date: 2026-09-25
summary: "Lập plan gộp 2 route trùng tính năng của teacher-os: /assignments sẽ chỉ hiển thị danh sách bài tập đã tạo (assignment prompts), xoá /assignments/bank"
---

# Gộp trang /assignments và /assignments/bank (issue #267)

## What happened

Người dùng yêu cầu gộp `/assignments` và `/assignments/bank` vì 2 path trùng tính năng; trang gộp chỉ hiển thị danh sách bài tập đã được tạo.

Scout codebase (apps/web, TanStack Router) cho thấy:
- `/assignments` (index.tsx) là bảng tracking per-học viên đọc `data.assignments` (luồng server-fed, có `averageBand` từ mock-data.ts) — gần như legacy.
- `/assignments/bank` (bank.tsx) mới là nơi hiển thị "bài tập đã được tạo" thật: `data.assignmentPrompts` tạo qua `/assignments/new` → `POST /api/assignments/prompts`.
- `assignment_prompt` là entity riêng (packages/db/src/schema/assignment-prompt.ts), không có FK class/student; giao đề tạo `class_assignment` ở trang Lớp học.
- `/assignments/bank` không có nav item trên sidebar, chỉ vào được qua nút "Ngân hàng đề".

Đã lập plan 3 phase tại `plans/260925-0337-merge-assignments-bank/`:
1. Ghi đè index.tsx bằng UI danh sách prompts (port từ bank.tsx), xoá bank.tsx + 4 tham chiếu (routes-matcher.ts:16, app-shell.tsx:21, create-success-card.tsx:95, new.tsx breadcrumb :349)
2. Viết lại index.test.tsx (port 4 case từ bank.test.tsx gồm case answer-key không lộ), xoá bank.test.tsx, cập nhật routes-matcher.test.ts
3. Cập nhật 3 e2e specs (assignment-bank, assignment-prompt-create, class-assign) + full verify

## Decision

- "Bài tập đã được tạo" = assignment prompts (dữ liệu thật duy nhất); bảng tracking per-học viên cũ bị bỏ hoàn toàn theo đúng chữ "chỉ hiển thị danh sách bài tập đã được tạo" — không giữ dưới dạng tab. Theo dõi tiến độ làm bài vẫn ở trang Lớp học (class-assignments-tab).
- Giữ nguyên UX bank (filter kỹ năng/phần thi, search, preview aside, StatusTag) vì phục vụ trực tiếp việc duyệt danh sách; label nút `+ Tạo bài tập` giữ nguyên vì e2e đang click theo label này.
- Non-goals: không đổi backend/contracts; giữ field `assignments` trong snapshot (data-provider.assignmentById + trang học viên $studentId vẫn dùng); không redirect từ path cũ.

## Next steps

- Chạy `/ak:cook plans/260925-0337-merge-assignments-bank/plan.md` để thực thi.
- Verify chain: `pnpm --filter web check-types` → `pnpm --filter web test` → `pnpm --filter e2e e2e`; sweep grep `assignments/bank` phải = 0 (ngoài routeTree.gen.ts).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
