---
type: reverse-usecase
feature: grading
uc: UC-05
status: draft
updated: 2026-11-12
---

# UC-05 — Thử chấm lại AI

**a. Mục tiêu** — Chạy lại pipeline AI cho nháp lỗi có thể thử lại (TIMEOUT/FAILED), không tạo thêm dòng nháp và không mất kiểm soát Credit.

**b. Actor** — Chính: teacher/owner/admin/class_teacher (`canPublishGrade`). Bị chặn: ta.

**c. Điều kiện tiên quyết** — Nháp đang "manual_pending" với errorCode ∈ {AI_GRADING_TIMEOUT, AI_GRADING_FAILED}.

**d. Luồng chính** —
1. GV thấy khối lỗi trên panel (E-004 style) → bấm "Thử chấm lại AI" [FR-60] (F7).
2. Hệ thống kiểm vai publish [FR-56].
3. Dọn các lần giữ Credit chưa kết thúc của bài nộp theo retryCount [FR-57].
4. CAS "manual_pending" → "ai_processing", retryCount + 1, xoá errorCode, mốc thời gian mới [FR-56].
5. Kích hoạt lại pipeline với lượt thử mới; khoá idempotent riêng "ai_grading:<id>:r<n>:<op>" [FR-58].
6. Nháp quay lại "AI đang chấm…", UI poll 1s [FR-52].

**e. Luồng thay thế & lỗi** —
- E1: thiếu vai → 403 AI_RETRY_FORBIDDEN; nút khoá kèm "Chỉ Giáo viên đứng lớp được chấm lại AI" [FR-59].
- E2: nháp chưa "manual_pending" → 409 [FR-56].
- E3: mã lỗi không retryable (DISABLED/NO_TRANSCRIPT/E-001/E-002) → 409 DRAFT_NOT_RETRYABLE [FR-47].
- E4: AI lại lỗi → trở lại "manual_pending" (chu kỳ UC-05 → UC-03/E3); không có trần số lượt (OQ-07).

**f. Hậu điều kiện** — Nháp "ai_processing" hoặc lại "manual_pending"; sổ cái sạch (không giữ mồ côi).

**g. Quy tắc nghiệp vụ** — BR-04 (hành vi tiêu Credit chỉ vai publish), BR-10 (occasion riêng theo lượt).

**h. Truy vết** — FR-56…FR-60; BR-04, BR-10; F7; Error AI_RETRY_FORBIDDEN, DRAFT_NOT_RETRYABLE; Test: grading.test.ts:2463-2588 (ai-retry), ai-grading-ac-004.spec.ts:236 ("ai-fail hoàn 100% + retry 200 + ví giữ nguyên").
