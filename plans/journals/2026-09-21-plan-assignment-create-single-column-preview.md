---
title: Plan assignment-create-single-column-preview
date: 2026-09-21
summary: Lập kế hoạch gỡ cột phải trang tạo bài tập + tách Xem trước thành trang riêng mô phỏng học viên làm bài
---

# Plan assignment-create-single-column-preview

## What happened

User yêu cầu thay đổi trang tạo bài tập `/assignments/new`: (1) gỡ cột phải (card "Ngân hàng" + paper "Xem trước phía học viên") vì không giao bài tại màn này; (2) "Xem trước" thành nút redirect sang trang riêng review đề đúng trạng thái làm bài thực của học viên. Chạy `/ak:plan` fast mode: tái dùng scout evidence từ plan pending `260921-0351`, scaffold qua `ak plan` CLI, planner subagent viết nội dung, validation Standard tier 14/14 claims verified (0 failed) — các claim đều khớp code thật (new.tsx:194 grid 2 cột, 3 spec E2E click chip "Bản nháp", main.tsx không StrictMode, precedent Button+navigate bank.tsx:159-181, storage-guard sidebar-prefs.ts).

## Decision

- Plan mới `plans/260921-0400-assignment-create-single-column-preview/` (P2, 4h, 3 phase): create page một cột `max-w-3xl` + xóa `bank-context-card.tsx`; chips Trạng thái dời vào sticky action bar (giữ nguyên nhãn "Bản nháp"/"Sẵn sàng giao" — E2E dependency); nút "Xem trước" ghi snapshot draft vào sessionStorage (`teacher-os:assignment-preview-draft`, module thuần `assignment-preview-draft.ts` guard SSR/parse) rồi navigate `/assignments/preview` (flat route, không nested dưới new để tránh Outlet); trang preview tái dùng `StudentPreviewPaper` + card "Bài làm của học viên (mô phỏng)" + empty state trung thực; restore một lần khi mount create page (kèm set dirtyTitle/dirtyPrompt=true — chống compositionDefaults new.tsx:80-89 ghi đè nội dung khôi phục).
- Sửa E2E vỡ (assignment-prompt-create.spec.ts:36-39,42-43,60-62 assert list "Đề đã có" trên trang tạo) đưa vào Phase 1 thay vì Phase 3 để mỗi phase shippable.
- Layout decision này override §1/§3/§4 design-spec plan redesign `260921-0351` — đã append addendum vào `research/design-spec.md` của plan đó.

## Next steps

- Triển khai qua `/ak:cook /Users/vinhtran/Documents/project/personal/teacher-os/plans/260921-0400-assignment-create-single-column-preview/plan.md` (khuyến nghị /clear trước).
- Future (ngoài phạm vi): preview đề đã lưu `/assignments/preview?id=…`; đồng bộ quyết định layout khi triển khai redesign 4-skill của plan 260921-0351.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
