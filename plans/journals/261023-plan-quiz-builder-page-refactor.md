---
title: "Plan quiz-builder-page-refactor: trang soạn đề admin theo bố cục Selfomy"
date: 2026-10-23
summary: "Lập plan 261023-0713 (issue #424): trang sửa đề thư viện chuyển từ tab part sang cây Part → Nhóm → Câu + thẻ lồng có tab, thay phase 4–5 của #420"
---

# Plan quiz-builder-page-refactor: trang soạn đề admin theo bố cục Selfomy

## What happened
Lập plan qua `ak-plan --github` từ report `rea-261023-1420-selfomy-quiz-builder-ui-structure.md`,
mở GitHub Issue #424 (`ai-handle`, `enhancement`, `ready to review`) và comment liên kết trên #420.

Scout cho thấy trang `$testId.tsx` là một cột `max-w-4xl` với `PartTabs` và một `PartForm` dài.
Plan #420 phase 4 đã định làm editor nhóm kiểu Selfomy nhưng chỉ bên trong từng tab part;
PR2 của #420 (phase 2–5) chưa bắt đầu. E2E admin chọn part bằng `getByRole("tab")`.

## Decision
- User chọn: plan mới thay phase 4–5 của #420 (phụ thuộc #420 phase 2–3), giữ lưu từng part,
  giữ slot cố định. Phase 4–5 của #420 được đánh dấu superseded trong `plan.md` của nó.
- Không chép màu phân cấp của Selfomy vì `DESIGN.md` cấm thêm màu ngoài trạng thái;
  phân cấp bằng thụt lề + kiểu badge, ghi vào mục "Lệch có chủ đích".
- "Kiểm tra đáp án" là panel chỉ đọc; dán đáp án hàng loạt vẫn theo nhóm.
- Prop mới ở `packages/ui` đều optional để web composer không đổi hành vi.

## Next steps
- Review `plans/261023-0713-quiz-builder-page-refactor/plan.md` hoặc Issue #424.
- Thực thi sau #420 phase 2–3: `/ak:cook plans/261023-0713-quiz-builder-page-refactor/plan.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
