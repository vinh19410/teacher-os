---
type: reverse-usecase
feature: grading
uc: UC-03
status: draft
updated: 2026-11-12
---

# UC-03 — Tạo nháp chấm AI tự động sau nộp bài

**a. Mục tiêu** — Khi học viên nộp bài, hệ thống tự tạo bản nháp chấm AI (ẩn với học viên) để giáo viên rà nhanh thay vì chấm từ đầu.

**b. Actor** — Chính: hệ thống (pipeline nền, actor "system"). Kích hoạt bởi: học viên nộp bài.

**c. Điều kiện tiên quyết** — Cổng AI bật (AI_ENABLED = "true") và có grader; bài nộp kỹ năng writing/speaking có phần chấm AI được; ví tổ chức còn khả dụng Credit hoặc còn lượt chấm nhanh.

**d. Luồng chính** —
1. Học viên nộp bài → CAS sang "submitted" (F1).
2. Kích hoạt pipeline nền, không chặn phản hồi nộp [FR-34].
3. Tạo nháp "ai_processing" (bỏ qua nếu đã có) [FR-36].
4. Speaking thiếu transcript → "manual_pending" + NO_TRANSCRIPT, không giữ Credit [FR-37]; essay hybrid rỗng → "manual_pending" không mã lỗi [FR-38].
5. Tạo ví nếu thiếu; giữ Credit Writing 1 / Speaking 2 [FR-39].
6. Gọi LLM tối đa 3 lượt (backoff 1s/2s, ≤20s/lượt, ngân sách 30s) [FR-42]; prompt tiếng Việt JSON-only [FR-43].
7. Kết quả hợp lệ → CAS "ai_drafted" TRƯỚC rồi chốt trừ Credit [FR-44, FR-45].
8. GV mở màn chấm thấy "AI đã chấm nháp" + 4 điểm; poll 1s khi đang chấm [FR-51, FR-52].

**e. Luồng thay thế & lỗi** —
- E1: cổng AI tắt → thoát trước khi tạo nháp (không có dòng nháp) [FR-35].
- E2: hết khả dụng Credit → Writing + gói tháng active/grace: giành lượt chấm nhanh ≤30/tháng, nháp "quick" 0 Credit; thua → E-002; không phải Writing → E-001 [FR-40, FR-41] (chi tiết UC-06).
- E3: AI lỗi/quá hạn sau 3 lượt → "manual_pending" + mã lỗi, hoàn Credit đầy đủ [FR-46].
- E4: process chết giữa chừng → sweep hoàn Credit, nháp về "manual_pending" TIMEOUT (UC-08).

**f. Hậu điều kiện** — Nháp tồn tại với status ∈ {ai_drafted, manual_pending}; ví đã settle (đúng), hoặc đã release/revert (lỗi); học viên KHÔNG thấy bất kỳ dữ liệu nháp nào [FR-48].

**g. Quy tắc nghiệp vụ** — BR-01 (nháp ẩn), BR-02 (AI không tự chốt), BR-03 (AI lỗi không chặn chấm tay), BR-04/05 (Credit & vai), BR-06 (chấm nhanh), BR-10/11 (occasion + sổ cái).

**h. Truy vết** — FR-34…FR-50; BR-01…BR-06, BR-10/11; F1, F2; Error AI_GRADING_TIMEOUT/FAILED/DISABLED/NO_TRANSCRIPT, E-001, E-002; Test: run-grading.test.ts (34 test), ai-grading-ac-001.spec.ts, ai-grading-ac-003.spec.ts.
