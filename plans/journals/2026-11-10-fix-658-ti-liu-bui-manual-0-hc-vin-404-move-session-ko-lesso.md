---
title: "Fix #658: tài liệu buổi manual 0 học viên 404 + move-session kéo lesson_material"
date: 2026-11-10
summary: "Root cause: resolveSession mặc định đòi dòng lesson; buổi manual 0 học viên chỉ có class_session -> 404 SESSION_NOT_FOUND ở GET/attach/upload tài liệu buổi. Fix: resolveSession chấp nhận lesson OR class_session (orgId+classId+date), negative control giữ 404 ngày trống; kongming phát hiện thêm move-session không kéo lesson_material cho bucket class_session-only -> nới bucketMoved OR class_session ở đích + đẩy update(classSession) lên vị trí [1] trong batch nguyên tử (giữ [0] occurrenceUpdate cho updatedRows). TDD: 2 test mới đỏ (expected 404 to be) -> xanh 36/36; full server suite 1355 passed; pnpm check/check-types sạch = baseline. Review: 2 code-reviewer fresh-context APPROVE (0 Critical/0 Important); kongming GO ở 2 checkpoint. Follow-up: #659 holiday-shift mồ côi lesson_material."
---

# Fix #658: tài liệu buổi manual 0 học viên 404 + move-session kéo lesson_material

Root cause: resolveSession mặc định đòi dòng lesson; buổi manual 0 học viên chỉ có class_session -> 404 SESSION_NOT_FOUND ở GET/attach/upload tài liệu buổi. Fix: resolveSession chấp nhận lesson OR class_session (orgId+classId+date), negative control giữ 404 ngày trống; kongming phát hiện thêm move-session không kéo lesson_material cho bucket class_session-only -> nới bucketMoved OR class_session ở đích + đẩy update(classSession) lên vị trí [1] trong batch nguyên tử (giữ [0] occurrenceUpdate cho updatedRows). TDD: 2 test mới đỏ (expected 404 to be) -> xanh 36/36; full server suite 1355 passed; pnpm check/check-types sạch = baseline. Review: 2 code-reviewer fresh-context APPROVE (0 Critical/0 Important); kongming GO ở 2 checkpoint. Follow-up: #659 holiday-shift mồ côi lesson_material.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
