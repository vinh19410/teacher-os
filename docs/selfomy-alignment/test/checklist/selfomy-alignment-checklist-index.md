---
type: test-checklist-index
feature: selfomy-alignment
status: draft
updated: 2026-10-27
next_chk_id: 81
links:
  - docs/selfomy-alignment/userstories/us-001.md
  - docs/selfomy-alignment/srs/selfomy-alignment-spec.md
  - docs/selfomy-alignment/usecases/uc-daily-attendance-and-holiday.md
  - docs/selfomy-alignment/ascii-wireframe/daily-ops-and-holiday-flow.md
  - docs/selfomy-alignment/test/test-strategy.md
---

# Test Checklists — selfomy-alignment

## Checklists

| Scope | Target | File | Items | P1 | P2 | P3 | P4 | Auto | Status | Updated |
|-------|--------|------|-------|----|----|----|----|------|--------|---------|
| story | us-001 | [checklist-us-001.md](checklist-us-001.md) | 80 | 28 | 35 | 16 | 1 | 62/18 | draft | 2026-10-27 |

## Coverage

| Source ID | Nghĩa vụ (obligation) | Scope | CHK-ID | Tầng | Trạng thái | Lý do (nếu excluded) |
|-----------|----------------------|-------|--------|------|-----------|----------------------|
| FR-selfomy-alignment-004 | happy: hiển thị thẻ nhắc việc và bộ đếm | us-001 | CHK-selfomy-alignment-001, CHK-selfomy-alignment-002, CHK-selfomy-alignment-003, CHK-selfomy-alignment-004, CHK-selfomy-alignment-005, CHK-selfomy-alignment-006, CHK-selfomy-alignment-059 | UI | covered | — |
| FR-selfomy-alignment-004 | happy: điều hướng 1 chạm sang màn xử lý đã lọc sẵn | us-001 | CHK-selfomy-alignment-008, CHK-selfomy-alignment-009, CHK-selfomy-alignment-010 | UI | covered | — |
| FR-selfomy-alignment-004 | alternate: bộ đếm cập nhật sau điểm danh / làm mới | us-001 | CHK-selfomy-alignment-007, CHK-selfomy-alignment-043, CHK-selfomy-alignment-046, CHK-selfomy-alignment-078 | UI | covered | — |
| FR-selfomy-alignment-004 | alternate: trạng thái hoàn tất khi bộ đếm 0 | us-001 | CHK-selfomy-alignment-012, CHK-selfomy-alignment-013 | UI | covered | — |
| FR-selfomy-alignment-005 | happy: liệt kê ca học theo ngày đã chọn | us-001 | CHK-selfomy-alignment-014, CHK-selfomy-alignment-015, CHK-selfomy-alignment-016, CHK-selfomy-alignment-017, CHK-selfomy-alignment-080 | UI | covered | — |
| FR-selfomy-alignment-005 | business rule: loại trừ buổi rơi vào Lịch nghỉ chung | us-001 | CHK-selfomy-alignment-018, CHK-selfomy-alignment-019 | UI | covered | — |
| FR-selfomy-alignment-005 | happy: lọc Chưa điểm danh / tìm kiếm / lọc giáo viên | us-001 | CHK-selfomy-alignment-020, CHK-selfomy-alignment-021, CHK-selfomy-alignment-022, CHK-selfomy-alignment-023, CHK-selfomy-alignment-024, CHK-selfomy-alignment-025, CHK-selfomy-alignment-026, CHK-selfomy-alignment-027, CHK-selfomy-alignment-028, CHK-selfomy-alignment-070 | UI | covered | — |
| FR-selfomy-alignment-005 | happy: điểm danh inline 4 trạng thái kèm ghi chú | us-001 | CHK-selfomy-alignment-029, CHK-selfomy-alignment-030, CHK-selfomy-alignment-031, CHK-selfomy-alignment-032, CHK-selfomy-alignment-033, CHK-selfomy-alignment-034, CHK-selfomy-alignment-047, CHK-selfomy-alignment-048 | UI | covered | — |
| FR-selfomy-alignment-005 | alternate: Đánh dấu tất cả Có mặt | us-001 | CHK-selfomy-alignment-035, CHK-selfomy-alignment-036, CHK-selfomy-alignment-037, CHK-selfomy-alignment-038 | UI | covered | — |
| FR-selfomy-alignment-005 | happy: lưu hàng loạt và cập nhật trạng thái ca học | us-001 | CHK-selfomy-alignment-039, CHK-selfomy-alignment-040, CHK-selfomy-alignment-041, CHK-selfomy-alignment-042, CHK-selfomy-alignment-044, CHK-selfomy-alignment-045, CHK-selfomy-alignment-076, CHK-selfomy-alignment-077 | UI | covered | — |
| FR-selfomy-alignment-005 | validation: lưu khi còn học viên chưa chọn trạng thái | us-001 | — | — | tbd | — |
| FR-selfomy-alignment-005 | validation: ghi chú vượt 255 ký tự | us-001 | — | — | tbd | — |
| FR-selfomy-alignment-005 | error: lưu thất bại (mất mạng / lỗi máy chủ) | us-001 | — | — | blocked | — |
| FR-selfomy-alignment-005 | edge: hai nhân sự cùng lưu một ca học | us-001 | — | — | blocked | — |
| FR-selfomy-alignment-005 | edge: sửa lại ca học đã lưu | us-001 | — | — | blocked | — |
| FR-selfomy-alignment-029 | security: Trợ giảng chỉ thấy lớp được phân công | us-001 | CHK-selfomy-alignment-049, CHK-selfomy-alignment-050, CHK-selfomy-alignment-053, CHK-selfomy-alignment-054 | UI | covered | — |
| FR-selfomy-alignment-029 | security: Trợ giảng bị ẩn thẻ Học phí | us-001 | CHK-selfomy-alignment-051 | UI | covered | — |
| FR-selfomy-alignment-029 | security: Giáo viên đứng lớp chỉ thấy lớp được phân công | us-001 | CHK-selfomy-alignment-055, CHK-selfomy-alignment-056 | UI | covered | — |
| NFR-selfomy-alignment-001 | loading định tính | us-001 | CHK-selfomy-alignment-060, CHK-selfomy-alignment-061 | UI | covered | — |
| NFR-selfomy-alignment-001 | threshold: phản hồi ≤ 2 giây | us-001 | CHK-selfomy-alignment-062, CHK-selfomy-alignment-063, CHK-selfomy-alignment-064 | UI | covered | — |
| NFR-selfomy-alignment-005 | security: không trả dữ liệu ngoài phạm vi cho Trợ giảng | us-001 | CHK-selfomy-alignment-052, CHK-selfomy-alignment-057 | UI | covered | — |
| NFR-selfomy-alignment-008 | threshold: ≥ 5 lớp trong ≤ 2 phút | us-001 | CHK-selfomy-alignment-065 | UI | covered | — |
| NFR-selfomy-alignment-008 | a11y cơ bản: điều hướng bàn phím | us-001 | CHK-selfomy-alignment-066, CHK-selfomy-alignment-067, CHK-selfomy-alignment-068, CHK-selfomy-alignment-069 | UI | covered | — |
| NFR-selfomy-alignment-008 | responsive: 3 viewport | us-001 | CHK-selfomy-alignment-071, CHK-selfomy-alignment-072, CHK-selfomy-alignment-073, CHK-selfomy-alignment-074, CHK-selfomy-alignment-075 | UI | covered | — |

## Retired CHK-IDs

| CHK-ID | Retired date | Lý do |
|--------|--------------|-------|
