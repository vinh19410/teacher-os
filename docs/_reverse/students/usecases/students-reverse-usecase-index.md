---
type: reverse-usecase-index
feature: students
status: draft
updated: 2026-11-11
links:
  - ./students-reverse-spec.md
---

# students — Use Case Index (reverse)

## Use cases

| Slug | Title | Primary Actor | Related FR | Screens | Errors | OQ | Nguồn | Nhãn |
|------|-------|---------------|-----------|---------|--------|-----|-------|------|
| [uc-xem-danh-sach-hoc-vien](./uc-xem-danh-sach-hoc-vien.md) | Xem danh sách học viên + lọc | Giáo viên | FR-001..005, FR-023 | /students | E-016, E-017, E-019, E-020 | OQ-3, OQ-8 | S1-S3, S7 | ✅ (+🟡 OQ-3) |
| [uc-xem-chi-tiet-hoc-vien](./uc-xem-chi-tiet-hoc-vien.md) | Xem chi tiết hồ sơ học viên | Giáo viên | FR-006..011, FR-019, FR-020, FR-022 | /students/$studentId | E-018 | OQ-2, OQ-4, OQ-5 | S2, S3, S8 | ✅ |
| [uc-them-hoc-vien-thu-cong](./uc-them-hoc-vien-thu-cong.md) | Thêm học viên thủ công | Giáo viên | FR-012..017, FR-023 | Modal "Thêm học viên mới" trên /students | E-001..008, E-015, E-016, E-017 | OQ-1, OQ-6, OQ-7 | S1, S2, S6, S7 | ✅ (+🟡 OQ-1) |
| [uc-gui-lai-loi-moi-portal](./uc-gui-lai-loi-moi-portal.md) | Gửi lại lời mời portal cho học viên chưa liên kết | Giáo viên (role teacher/owner/admin/class_teacher) | FR-002, FR-018, FR-021 | /students (row) + /students/$studentId (header) | E-008..014, E-021, E-022 | OQ-2 | S1, S2, S7 | ✅ |

## Actors

| Actor | Loại | Nguồn |
|-------|------|-------|
| Giáo viên (membership teacher/owner/class_teacher) | người | `apps/server/src/app.ts:279-296` |
| Trợ giảng (membership ta) — bị chặn resend | người | `apps/server/src/routes/kernel.ts:219-231` |
| Mailer | hệ thống | `apps/server/src/routes/kernel.ts:575-615` |
| Học viên (portal) | người — boundary, chỉ tác động gián tiếp qua onboarding | `apps/server/src/routes/student.ts:1241-1289` |

## Ma trận UC ↔ FR ↔ Error

| UC | FR liên quan | Error liên quan | BR liên quan |
|----|--------------|-----------------|--------------|
| UC-01 Xem danh sách | FR-001, FR-002, FR-003, FR-004, FR-005, FR-023 | E-016, E-017, E-019, E-020 | BR-003, BR-006, BR-007, BR-008, BR-009, BR-016 |
| UC-02 Xem chi tiết | FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-019, FR-020, FR-022 | E-018 | BR-004, BR-009, BR-016 |
| UC-03 Thêm thủ công | FR-012, FR-013, FR-014, FR-015, FR-016, FR-017, FR-023 | E-001..008, E-015, E-016, E-017, E-023 | BR-001, BR-002, BR-004, BR-010, BR-011, BR-014, BR-015 |
| UC-04 Gửi lại lời mời | FR-002, FR-018, FR-021 | E-008, E-009, E-010, E-011, E-012, E-013, E-014, E-021, E-022 | BR-011, BR-012, BR-013 |

## Ghi chú

* Use case **tái lập chưa duyệt** từ nguồn — mỗi mệnh đề mang nhãn ✅/🔵/🟡. Chạy `/usecase students` (downstream mode) sau khi có SRS chính thức để điền traceability đầy đủ.
* Không viết UC "Cập nhật thông tin học viên" / "Xóa học viên" / "Mời học viên vào tổ chức" / "Ghi danh vào lớp": 2 cái đầu không tồn tại trong code (G-2 — không bịa UC), 2 cái sau thuộc feature `student-invitations` / `enrollment-lifecycle` (ranh giới Mục 1 spec).
