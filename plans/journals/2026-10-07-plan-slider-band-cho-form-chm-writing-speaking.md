---
title: Plan slider band cho form chấm Writing/Speaking
date: 2026-10-07
summary: "Lập plan thay 4 ô select điểm tiêu chí IELTS bằng slider 0–9 bước 0.5 (issue #331)"
---

# Plan slider band cho form chấm Writing/Speaking

## What happened
- Lập plan `plans/261007-0830-grade-form-band-slider/` (2 phase, ~3h) và issue #331.
- Form chấm hiện tại (`apps/web/src/components/grading/grade-form.tsx`) dùng 4 `<select>` 19 mức; repo chưa có component slider nào.
- Server đã validate bước 0.5 (`quizGradeInputSchema` trong `packages/api/src/contracts.ts`), nên chỉ đổi web + test/e2e.

## Decision
- User chốt: slider ở trạng thái "chưa chọn" (`—`, mờ, `aria-valuetext="Chưa chấm"`) cho tới khi giáo viên tương tác; nút Lưu khoá tới khi đủ 4 tiêu chí.
- Chỉ slider + số hiển thị, không thêm nút −/+. Dùng `<input type="range">` native.
- Bẫy cần nhớ: bấm đúng vị trí placeholder không bắn `change`, nên commit ở `onPointerUp` khi giá trị đang `null`.

## Next steps
- Commit plan lên `develop` để link trong issue #331 hoạt động.
- `/ak:cook plans/261007-0830-grade-form-band-slider/plan.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
