---
type: reverse-usecase-index
feature: grading
status: draft
updated: 2026-11-12
---

# Danh mục use case — grading

| UC | Tên | Actor chính | Mô tả 1 dòng |
|---|---|---|---|
| UC-01 | Xem hàng chờ chấm và lọc | Nhân sự trung tâm | Xem bài đã nộp chờ chấm, lọc theo kỹ năng/trạng thái AI, thấy số đếm |
| UC-02 | Chốt trả bài cho học viên | Giáo viên đứng lớp (hoặc owner/admin) | Ghi điểm chính thức, học viên nhận điểm + thông báo |
| UC-03 | Tạo nháp chấm AI tự động sau nộp bài | Hệ thống | Nộp bài → giữ Credit → LLM chấm nháp ẩn với học viên |
| UC-04 | Lưu bản nháp rà soát | Giáo viên + Trợ giảng | Sửa/duyệt nháp AI thành điểm rà soát |
| UC-05 | Thử chấm lại AI | Giáo viên đứng lớp (hoặc owner/admin) | Chạy lại pipeline cho nháp lỗi có thể thử lại |
| UC-06 | Xử lý hết Credit hoặc hết hạn mức | Giáo viên (hệ thống hỗ trợ) | Rơi vào chấm nhanh 0 Credit hoặc chặn kèm chỉ dẫn nạp Credit |
| UC-07 | Highlight nhận xét trên bài viết | Nhân sự trung tâm | Bôi đen + note từng đoạn essay Writing |
| UC-08 | Dọn lượt chấm treo và hoàn Credit | Hệ thống | Sweep 60s hoàn Credit kẹt, trả nháp về chờ chấm tay |
| UC-09 | Quản lý bài nộp mẫu demo | Giáo viên đứng lớp (hoặc owner/admin) | Tạo/xoá bài nộp mẫu để dùng thử màn chấm |

## Ma trận UC ↔ FR ↔ BR ↔ Error ↔ Flow

| UC | FR chính | BR | Error | Flow | Test |
|---|---|---|---|---|---|
| UC-01 | FR-01…FR-12 | BR-13 | 400 "invalid json" | F3 | S41 (10 test), S1 |
| UC-02 | FR-22…FR-33 | BR-01, BR-02, BR-08, BR-09 | GRADE_PUBLISH_FORBIDDEN; E-selfomy-alignment-011 | F6 | S35:2382-2435; S37:235-253; S39:296; S40:202-276 |
| UC-03 | FR-34…FR-50 | BR-01…BR-06, BR-10 | AI_GRADING_TIMEOUT/FAILED/DISABLED/NO_TRANSCRIPT; E-001; E-002 | F1, F2 | S36; S37; S38; S40:278-341 |
| UC-04 | FR-51…FR-55, FR-63 | BR-02, BR-05 | GRADE_REVIEW_FORBIDDEN; DRAFT_NOT_FOUND; DRAFT_NOT_EDITABLE; E-011 | F5 | S35:1944, 2136, 2341; S39:185, 296; S43 |
| UC-05 | FR-56…FR-60 | BR-04, BR-10 | AI_RETRY_FORBIDDEN; DRAFT_NOT_RETRYABLE | F7 | S35:2463-2588; S39:236 |
| UC-06 | FR-40, FR-41, FR-61 | BR-06, BR-11, BR-12 | E-001; E-002 | F2 (alt) | S36; S38:185-222 |
| UC-07 | FR-68…FR-73 | (thang offset UTF-16) | SKILL_NOT_ANNOTATABLE; INVALID_SPAN; TOO_MANY_ANNOTATIONS; OVERLAP | F9 | S1 unit coverage qua route test |
| UC-08 | FR-64…FR-67 | BR-10, BR-11 | (mã TIMEOUT do sweep đặt) | F8 | S36:954 (bất biến 60s>30s) |
| UC-09 | FR-74…FR-76 | BR-09 | (chặn vai) | F10 | S35:2463-2588 (demo-sample) |
