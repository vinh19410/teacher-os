---
type: reverse-usecase
feature: grading
uc: UC-07
status: draft
updated: 2026-11-12
---

# UC-07 — Highlight nhận xét trên bài viết

**a. Mục tiêu** — Giáo viên bôi đen từng đoạn essay Writing và gắn ghi chú, để học viên sau khi nhận điểm biết chỗ nào cần sửa.

**b. Actor** — Chính: nhân sự trung tâm (staff).

**c. Điều kiện tiên quyết** — Bài nộp là Writing (đề hybrid chỉ chấm phần essay); essay đã "đóng băng" sau nộp.

**d. Luồng chính** —
1. GV bôi đen đoạn văn trong bài làm (F9).
2. Hệ thống kiểm kỹ năng là Writing [FR-68].
3. Kiểm span: kết thúc > bắt đầu, ≤ 1000 ký tự, không toàn khoảng trắng; tự căn về ranh giới từ [FR-69].
4. Kiểm số lượng < 200/bài và không chồng highlight sẵn có [FR-70].
5. Lưu dòng riêng (lưu ngay từng dòng, không gắn nút lưu điểm) [FR-72]; note ≤ 1000 ký tự [FR-71].
6. GV sửa note (PATCH) hoặc xoá highlight (DELETE) khi cần [FR-71].

**e. Luồng thay thế & lỗi** —
- E1: không phải Writing → 400 SKILL_NOT_ANNOTATABLE [FR-68].
- E2: span sai → 400 INVALID_SPAN [FR-69].
- E3: vượt 200 → 400 TOO_MANY_ANNOTATIONS; UI "Đã đạt tối đa 200 highlight." [FR-70, FR-73].
- E4: chồng nhau → 409 OVERLAP; UI "Đoạn này trùng với highlight khác." [FR-70, FR-73].
- E5: highlight đã bị xoá nơi khác → UI "Highlight không còn tồn tại — tải lại trang." [FR-73].

**f. Hậu điều kiện** — Annotation tồn tại theo offset UTF-16; render luôn bỏ qua annotation sai/overlap để không vỡ UI [FR-72].

**g. Quy tắc nghiệp vụ** — offset trên essay gốc "đóng băng" sau nộp (không retake nên offset ổn định).

**h. Truy vết** — FR-68…FR-73; F9; Error SKILL_NOT_ANNOTATABLE, INVALID_SPAN, TOO_MANY_ANNOTATIONS, OVERLAP; Test: apps/server/src/routes/grading.test.ts (annotations), apps/web/src/routes/_auth/grading/$attemptId.tsx:47-52.
