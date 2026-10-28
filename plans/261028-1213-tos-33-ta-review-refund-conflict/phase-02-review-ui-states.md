---
phase: 2
title: "UI: khóa nút TA, E-004, E-011"
status: pending
effort: 0.5d
---

# Phase 2 — UI: khóa nút TA, E-004, E-011

## Files

- Sửa `apps/web/src/routes/_auth/grading/$attemptId.tsx` + `apps/web/src/components/grading/ai-draft-panel.tsx`:
  - Vai trò từ snapshot/session → `canPublishGrade` false ⇒ nút "Chốt trả bài" disabled + tooltip.
  - `errorCode = E-004` ⇒ thông điệp spec + nút "Thử chấm lại AI" (disabled khi `ai_processing`, poll trạng thái tới khi xong).
  - Mutation nhận 409 E-011 ⇒ hộp thoại thông điệp spec + "Tải lại bản mới nhất"; nội dung đang gõ giữ ở vùng "Bản bạn đang sửa" để chép lại.
  - Gửi `version` hiện tại trong mọi PATCH / publish.

## Tests

- Test component: TA thấy nút disabled; E-004 hiện nút retry; 409 mở hộp thoại và giữ nội dung.

## Verify

- `pnpm --filter web test -- grading`; screenshot 3 viewport + keyboard focus theo `REVIEW.md`.
