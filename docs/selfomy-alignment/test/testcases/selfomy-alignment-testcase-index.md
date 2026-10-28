---
type: test-cases-index
feature: selfomy-alignment
status: draft
updated: 2026-10-27
links:
  - docs/selfomy-alignment/test/checklist/checklist-us-001.md
  - docs/selfomy-alignment/srs/selfomy-alignment-spec.md
  - docs/selfomy-alignment/userstories/us-001.md
  - docs/selfomy-alignment/usecases/uc-daily-attendance-and-holiday.md
  - docs/selfomy-alignment/ascii-wireframe/daily-ops-and-holiday-flow.md
  - docs/selfomy-alignment/test/test-strategy.md
---

# Test Cases — selfomy-alignment

## TestCases

| Scope | Target | File | TC | Steps | P1 | P2 | P3 | P4 | Auto | Source checklist | Status | Updated |
|-------|--------|------|----|-------|----|----|----|----|------|------------------|--------|---------|
| story | us-001 | [testcases-us-001.md](testcases-us-001.md) | 80 | 108 | 28 | 35 | 16 | 1 | 62/18 | [checklist-us-001.md](../checklist/checklist-us-001.md) | draft | 2026-10-27 |

## Cần bổ sung (Not-ready)

| File/Scope | CHK-ID | Field/Step | Loại | Thiếu gì | Cấp vào đâu |
|------------|--------|-----------|------|----------|-------------|
| testcases-us-001.md (mọi TC có "dựng:") | — | Preconditions | test-data | Tài khoản test cho 5 vai trò (Giáo viên độc lập, Chủ trung tâm, Giáo vụ, Giáo viên đứng lớp, Trợ giảng) và fixture dữ liệu lớp/ca học mẫu | test-strategy.md (tài khoản + fixture) |
| testcases-us-001.md | CHK-selfomy-alignment-004 | Preconditions, Step 1 Test Data | state | Cách dựng bài nộp Writing/Speaking ở 3 trạng thái đã quá 24 giờ kể từ lúc nộp (điều khiển thời gian) + số lượng mẫu | test-strategy.md (fixture time-control) |
| testcases-us-001.md | CHK-selfomy-alignment-005 | Preconditions | state | Cách dựng bài nộp đúng 23 giờ 59 phút (điều khiển thời gian) | test-strategy.md (fixture time-control) |
| testcases-us-001.md | CHK-selfomy-alignment-006 | Preconditions, Step 1 Test Data | state | Bài đã "Chốt trả bài" có thời điểm nộp quá 24 giờ | test-strategy.md (fixture time-control) |
| testcases-us-001.md | CHK-selfomy-alignment-010 | Preconditions, Step 1 Expected | wording | Nhãn/tham số URL của bộ lọc quá hạn > 24h trên Không gian chấm + dữ liệu bài quá hạn | wireframe ai-grading-review-workspace / SRS |
| testcases-us-001.md | CHK-selfomy-alignment-041 | Step 1 Expected | wording | Nội dung Toast khi lưu điểm danh thành công | wireframe daily-attendance (nút "Lưu điểm danh ca học") |
| testcases-us-001.md | CHK-selfomy-alignment-050 | Preconditions, Step 1 Test Data | state | Bài nộp quá 24 giờ ở lớp được phân công và lớp không phân công của Trợ giảng | test-strategy.md (fixture time-control) |
| testcases-us-001.md | CHK-selfomy-alignment-057 | Step 1 Expected, Test Data | wording | Đường dẫn trực tiếp tới 1 ca học + cách hệ thống báo bị chặn (thông báo/điều hướng) | SRS (NFR-selfomy-alignment-005 / Error Matrix) |
| testcases-us-001.md | CHK-selfomy-alignment-058 | Step 1 Test Data | test-data | Đường dẫn màn Điểm danh tổng theo ngày | wireframe daily-attendance / test-strategy.md |
| testcases-us-001.md | CHK-selfomy-alignment-060 | Step 1 Expected | wording | Dạng chỉ báo đang tải của khu vực "Việc cần làm hôm nay" | wireframe dashboard-reminders |
| testcases-us-001.md | CHK-selfomy-alignment-061 | Step 1 Expected | wording | Dạng chỉ báo đang tải của danh sách ca học | wireframe daily-attendance |
| testcases-us-001.md | CHK-selfomy-alignment-062 | Preconditions, Step 1 Test Data | test-data | Bộ dữ liệu 50 lớp / 1.000 học viên + số lượt đo | test-strategy.md (fixture hiệu năng) |
| testcases-us-001.md | CHK-selfomy-alignment-063 | Preconditions, Step 1 Test Data | test-data | Bộ dữ liệu 50 lớp / 1.000 học viên + số lượt đo | test-strategy.md (fixture hiệu năng) |
| testcases-us-001.md | CHK-selfomy-alignment-079 | Preconditions | threshold | Thời hạn phiên đăng nhập (hoặc fixture điều khiển thời gian) | SRS NFR (cập nhật rồi regen) |
