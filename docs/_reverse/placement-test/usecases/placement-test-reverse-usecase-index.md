---
type: reverse-usecase-index
feature: placement-test
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# Danh mục UC — feature `placement-test`

> Quy ước nhãn: ✅ = có code minh họa kèm path:line; 🔵 = suy luận từ ≥2 bằng chứng (liệt kê đầy đủ ở reverse-sources.md / _evidence.md); 🟡 = chưa rõ, phải có OQ tương ứng trong reverse-gaps.md. Mỗi mệnh đề mang nhãn riêng; không nâng 🟡 lên ✅ nếu không có code.

| UC | Tên | FR | BR | E |
|----|-----|----|----|---|
| UC-01 | Nạp màn soạn đề và khởi tạo bộ đề | FR-01, FR-02, FR-03, FR-04, FR-05, FR-45, FR-46, FR-47 | BR-01, BR-03, BR-04, BR-15 | E-01, E-02, E-03, E-36, E-37 |
| UC-02 | Soạn và lưu bản nháp bộ đề | FR-06, FR-07, FR-08, FR-09, FR-10, FR-11, FR-12, FR-47, FR-48, FR-49 | BR-02, BR-03, BR-07 | E-01, E-02, E-03, E-04, E-06, E-07, E-08, E-30 |
| UC-03 | Tải lên và nghe thử audio đoạn nghe | FR-13, FR-14, FR-15, FR-16 | BR-06 | E-21, E-22, E-23, E-24, E-38 |
| UC-04 | Phát hành bộ đề | FR-17, FR-18, FR-19, FR-20, FR-21, FR-22, FR-23, FR-24 | BR-02, BR-05, BR-06, BR-07 | E-04, E-05, E-09, E-10, E-11, E-12, E-13, E-14, E-15, E-16, E-17, E-18, E-19, E-20, E-31 |
| UC-05 | Điền thông tin cá nhân để vào bài (cổng lead) | FR-25, FR-32, FR-33, FR-34, FR-44 | BR-04, BR-09, BR-11 | E-27, E-32, E-33, E-34, E-35 |
| UC-06 | Làm bài kiểm tra hai phần với giới hạn lượt nghe | FR-26, FR-27, FR-28, FR-29, FR-30, FR-31, FR-35, FR-36, FR-37, FR-38, FR-39 | BR-10, BR-12 | E-25, E-26, E-28, E-29 |
| UC-07 | Nộp bài, xem kết quả và đồng bộ điểm vào lead | FR-40, FR-41, FR-42, FR-43, FR-50 | BR-08, BR-13, BR-14 | — |

Đủ vết: FR-01..FR-50 (50/50), BR-01..BR-15 (15/15), E-01..E-38 (38/38) đều xuất hiện ít nhất một lần trong ma trận. ✅

Điểm kiểm thử chính mỗi UC (R1): UC-01 (index.test.tsx seed-empty; e2e editor bước bảo trì), UC-02 (CAS test 5 case 409; index.test.tsx 409), UC-03 (e2e editor thay audio + nghe thử blob), UC-04 (index.test.tsx 422 + banner; e2e sửa ngưỡng rồi phát hành v1/v2), UC-05 (profile e2e luồng lead-gate + lỗi), UC-06 (profile e2e viewport/keyboard/hoàn lượt nghe; placement-test.test.mjs grading), UC-07 (profile e2e đồng bộ lead; placement-test.test.mjs buildLeadPayload/leadErrorMessage). ✅
