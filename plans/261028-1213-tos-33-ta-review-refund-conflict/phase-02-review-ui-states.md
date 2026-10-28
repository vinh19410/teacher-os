---
phase: 2
title: "UI: khóa nút TA, E-004, E-011"
status: completed
effort: 0.5d
---

# Phase 2 — UI: khóa nút TA, E-004, E-011

## Files

- Sửa `apps/web/src/routes/_auth/grading/$attemptId.tsx` + `apps/web/src/components/grading/ai-draft-panel.tsx`:
  - Vai trò từ `viewer.role` (kernel snapshot) → `canPublishGrade` false ⇒ nút "Chốt trả bài" disabled + tooltip "Chỉ Giáo viên đứng lớp được chốt trả bài".
  - `errorCode ∈ {AI_GRADING_TIMEOUT, AI_GRADING_FAILED}` ⇒ ánh xạ thông điệp E-004 + nút "Thử chấm lại AI" (disabled khi `ai_processing`, poll trạng thái tới khi xong; TA: nút disabled + tooltip "Chỉ Giáo viên đứng lớp được chấm lại AI" — hiển thị, không ẩn).
  - Mutation nhận 409 E-011 ⇒ hộp thoại thông điệp spec + "Tải lại bản mới nhất"; nội dung đang gõ giữ ở vùng "Bản bạn đang sửa" để chép lại.
  - Gửi `version` hiện tại trong mọi PATCH / publish (publish có draft: bắt buộc gửi).

## Tests

- Test component: TA thấy nút disabled; E-004 hiện nút retry; 409 mở hộp thoại và giữ nội dung.

## Verify

- `pnpm --filter web test -- grading`; screenshot 3 viewport + keyboard focus theo `REVIEW.md`.
