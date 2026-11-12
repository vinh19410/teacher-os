---
type: reverse-usecase-index
feature: classes
status: draft
updated: 2026-11-11
links:
  - docs/_reverse/classes/classes-reverse-spec.md
---

# classes — Use Case Index (reverse)

## Use cases

| Slug | Title | Primary Actor | Related FR | Screens | Errors | OQ | Nguồn | Nhãn |
|------|-------|---------------|-----------|---------|--------|-----|-------|------|
| [uc-01](./uc-01-tao-lop-hoc.md) | Tạo lớp học (kèm cảnh báo trùng lịch) | Giáo viên | FR-classes-001..011 | Modal "Tạo lớp mới"; Danh sách lớp | E-001..011, E-014, E-030..033 | OQ-1..3, OQ-7, OQ-8, OQ-10 | S2, S4, S6, S7, S8 | ✅ |
| [uc-02](./uc-02-xem-danh-sach-chi-tiet-lop.md) | Xem danh sách lớp & chi tiết lớp | Giáo viên | FR-classes-012..014 | /classes; /classes/:classId | E-012, E-013 | OQ-1 | S6, S8 | ✅ |
| [uc-03](./uc-03-cap-nhat-ghi-chu-lop.md) | Cập nhật ghi chú lớp | Giáo viên | FR-classes-015 | Tab Ghi chú | E-030, E-031 | — | S2, S6 | ✅ |
| [uc-04](./uc-04-thiet-lap-hoc-phi-lop.md) | Thiết lập / sửa / xóa học phí lớp | Giáo viên | FR-classes-009, FR-classes-016 | Modal "Sửa học phí lớp"; Tab Học viên | E-009, E-030, E-031 | OQ-10 | S2, S6, S7 | ✅ |
| [uc-05](./uc-05-them-buoi-hoc-thu-cong.md) | Thêm buổi học thủ công | Giáo viên | FR-classes-017..019, FR-classes-028 | Modal "+ Thêm buổi học" | E-015..018, E-030..031, E-033..035 | OQ-9 | S2, S4, S6, S8 | ✅ |
| [uc-06](./uc-06-dieu-chinh-buoi-hoc.md) | Điều chỉnh buổi học (sửa / dời / xóa) | Giáo viên | FR-classes-020..022, FR-classes-025 | Modal "Điều chỉnh buổi" | E-019..021, E-023..024, E-027..028, E-030..031, E-033 | — | S2, S4, S6, S8 | ✅ |
| [uc-07](./uc-07-doi-trang-thai-buoi.md) | Hoàn thành / hủy buổi + điểm danh cả ca | Giáo viên | FR-classes-023, FR-classes-024, FR-classes-026 | Modal "Quản lý buổi"; surface điểm danh | E-022, E-025..026, E-030..031 | OQ-4 | S2, S4, S6, S7, S8 | ✅ |
| [uc-08](./uc-08-gan-hoc-vien-vao-lop.md) | Gán học viên vào lớp (tóm tắt) | Giáo viên | FR-classes-027 | Tab Học viên; Modal "+ Thêm học viên vào lớp" | E-029, E-030..031 | OQ-5 (sau kích hoạt) | S4, S6, S7, S8 | ✅ |

## Actors

| Actor | Loại | Nguồn |
|-------|------|-------|
| Giáo viên (chủ org) | người | S4 — /root/projects/teacher-os/apps/server/src/app.ts:286 |
| Hệ thống kernel | hệ thống | S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1641 |
| Học viên | người (nhận thông báo, ngoài scope) | S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2889-2907 |
| Trợ giảng (tương lai) | người (chưa kích hoạt) | S4 — /root/projects/teacher-os/apps/server/src/routes/dashboard-reminders.ts:275-279 |

## Ma trận UC ↔ FR ↔ Error

| UC | FR liên quan | Error liên quan | Ghi chú phủ |
|----|--------------|-----------------|-------------|
| UC-01 Tạo lớp | FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-010, FR-011 | E-001, E-002, E-003, E-004, E-005, E-006, E-007, E-008, E-009 (tạo), E-010, E-011, E-014, E-030, E-031, E-032, E-033, E-036 | Cảnh báo trùng lịch là nhánh phụ (E-014, không chặn) |
| UC-02 Xem danh sách & chi tiết | FR-012, FR-013, FR-014 | E-012, E-013 | Chỉ đọc; badge "Tạm dừng" dead state (OQ-1) |
| UC-03 Ghi chú | FR-015 | E-030, E-031 | Ghi đơn cột |
| UC-04 Học phí | FR-009, FR-016 | E-009, E-030, E-031 | Xóa = lưu rỗng → null |
| UC-05 Thêm buổi | FR-017, FR-018, FR-019, FR-028, BR-005, BR-006 | E-015, E-016, E-017, E-018, E-030, E-031, E-033, E-034, E-035 | Materialize + đồng bộ tổng trong một batch |
| UC-06 Điều chỉnh buổi | FR-020, FR-021, FR-022, FR-025, BR-017, BR-018 | E-019, E-020, E-021, E-023, E-024, E-027, E-028, E-030, E-031, E-033 | Bao gồm cả Xóa buổi |
| UC-07 Trạng thái + điểm danh | FR-023, FR-024, FR-026, BR-013, BR-014 | E-022, E-025, E-026, E-030, E-031 | Điểm danh chi tiết = ranh giới feature `attendance` |
| UC-08 Gán học viên | FR-027 | E-029, E-030, E-031 | Chỉ tới khi tạo "invited"; lifecycle sau đó thuộc `enrollment-lifecycle` |

## Ghi chú

* Use case **tái lập chưa duyệt** từ nguồn — mỗi mệnh đề mang nhãn ✅/🔵/🟡. Chạy `/usecase classes` (downstream mode) sau khi có SRS chính thức để điền traceability đầy đủ.
* Nguồn chỉ đủ cho 8 use case nêu trên; các năng lệ không có nguồn (sửa lớp, xóa lớp, gán giáo viên) KHÔNG bịa use case — ghi Gap ở `reverse-gaps.md`.
* FR-classes-029 (chuyển chế độ thủ công ↔ tự động) và FR-classes-030 (không có sửa/xóa lớp) không có UC riêng: cái đầu thuộc ranh giới feature `syllabus`, cái sau là hiện trạng phủ định.


<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền hoangphan.blog</sub>
