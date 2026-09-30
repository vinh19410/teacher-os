---
title: "Plan: nút Xem trước đề đã lưu tại /assignments"
date: 2026-09-30
summary: "Lập plan #282: mở rộng /assignments/preview bằng bank mode ?id= + nút Xem trước trong aside"
---

# Plan: nút Xem trước đề đã lưu tại /assignments

## What happened
- User yêu cầu: tại /assignments, chọn đề (vd. "The Influence of the Crime Writer Agatha Christie") → có nút "Xem trước" → sang trang riêng y như giao diện học viên nhìn thấy.
- Scout phát hiện: /assignments/preview đã render StudentPreviewPaper (góc học viên đầy đủ) nhưng chỉ đọc draft sessionStorage từ trang soạn đề; PromptPreviewAside chỉ là bản gọn. Đề Agatha Christie là dữ liệu runtime, không có trong seed.
- Tạo plan `plans/260930-0229-assignment-prompt-preview-page/` qua `ak plan create` (2 phase, validate PASS), GitHub issue #282 (label `ready to review`), hydrate 8 work items vào task management.

## Decision
- Mở rộng route `/assignments/preview` hiện có bằng search param `?id=<promptId>` (bank mode) thay vì tạo route mới — tái dụng page shell + StudentPreviewPaper; tiền lệ resolve-theo-id đã có ở `tests/preview.tsx` (resolveRefDraft). `?id=` ưu tiên cao hơn draft stale trong sessionStorage; unknown id → empty state trung thực về bank.
- Nút "Xem trước" đặt trong PromptPreviewAside (aside chỉ render khi có đề chọn; row listbox là <button> nên lồng button là invalid HTML). Button + useNavigate theo pattern "+ Tạo bài tập" trên cùng trang — Button của repo không hỗ trợ asChild (đã verify button.tsx).
- Fact-check trong lúc lập plan đã bắt 2 lỗi nháp: assert heading cho title giấy bài (thực tế là <p>) và giả định Button asChild.

## Next steps
- Cook plan: `/ak:cook plans/260930-0229-assignment-prompt-preview-page/plan.md`.
- Gate: vitest preview/aside, `pnpm --filter web run check-types` (regen routeTree), e2e assignment-bank.spec.ts.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
