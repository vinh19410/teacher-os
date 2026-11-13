---
type: reverse-usecase-index
feature: enrollment-lifecycle
status: draft
updated: 2026-11-11
links:
  - ../enrollment-lifecycle-reverse-spec.md
---

# enrollment-lifecycle — Use Case Index (reverse)

## Use cases

| Slug | Title | Primary Actor | Related FR | Screens | Errors | OQ | Nguồn | Nhãn |
|------|-------|---------------|-----------|---------|--------|-----|-------|------|
| [uc-them-hoc-vien-vao-lop](./uc-them-hoc-vien-vao-lop.md) | Thêm học viên vào lớp (tạo invited) | Giáo viên | FR-EL-001,002,003,014 | Modal "Thêm học viên vào lớp"; roster | E-EL-001..004,013,016 | OQ-1,9 | S3,S8,S15,S19 | ✅ |
| [uc-kich-hoat-enrollment-giao-vien](./uc-kich-hoat-enrollment-giao-vien.md) | Kích hoạt enrollment (giáo viên) | Giáo viên | FR-EL-004,006,007,008,016 | Roster lớp + modal xác nhận | E-EL-001,004,005,011 | OQ-4,6 | S3,S4,S7,S15,S19 | ✅ |
| [uc-hoc-vien-chap-nhan-lop](./uc-hoc-vien-chap-nhan-lop.md) | Học viên chấp nhận tham gia lớp (portal) | Học viên (portal) | FR-EL-005,008,013,017 | Portal thẻ lớp "Chờ kích hoạt" | E-EL-005,009,010 | — | S5,S12,S13,S14,S20 | ✅ |
| [uc-huy-loi-moi-enrollment](./uc-huy-loi-moi-enrollment.md) | Hủy lời mời enrollment (chỉ invited) | Giáo viên | FR-EL-009 | Roster lớp + modal xác nhận | E-EL-005,006 | OQ-3,7 | S3,S7,S15,S19 | ✅ |
| [uc-chan-hoa-don-bai-tap-khi-chua-active](./uc-chan-hoa-don-bai-tap-khi-chua-active.md) | Chặn hóa đơn / bài tập khi enrollment chưa active | Giáo viên (được hệ thống chặn) | FR-EL-010,011 | /tuition "Tạo hóa đơn"; "Giao bài tập" | E-EL-007,008 | OQ-4 | S3,S16,S19 | ✅ |

## Actors

| Actor | Loại | Nguồn |
|-------|------|-------|
| Giáo viên (teacher role, chủ org) | người | S22 `pdr.md:14`; S3 |
| Học viên (student role, portal) | người | S5; S12 |
| Hệ thống thông báo/mailer | hệ thống | S26 |
| Hệ thống phân quyền (kernel ctx, requireFinanceRole, requireStudent) | hệ thống | S3 `kernel.ts:209-211`; S5 `student.ts:722` |

## Ma trận UC ↔ FR ↔ Error

| UC | FR | Error | BR | Nguồn chính |
|----|----|-------|----|-------------|
| UC-1 Thêm học viên vào lớp | FR-EL-001, FR-EL-002, FR-EL-003, FR-EL-014 | E-EL-001, E-EL-002, E-EL-003, E-EL-004, E-EL-013, E-EL-016 | BR-EL-002, BR-EL-004, BR-EL-012 | S3 `kernel.ts:463-694,1385-1443` |
| UC-2 Kích hoạt (giáo viên) | FR-EL-004, FR-EL-006, FR-EL-007, FR-EL-008, FR-EL-016 | E-EL-001, E-EL-004, E-EL-005, E-EL-011 | BR-EL-003, BR-EL-008, BR-EL-013 | S4 `enrollment-activation.ts:656-776` |
| UC-3 Chấp nhận portal | FR-EL-005, FR-EL-008, FR-EL-013, FR-EL-017 | E-EL-005, E-EL-009, E-EL-010 | BR-EL-003, BR-EL-009, BR-EL-010, BR-EL-013 | S5 `student.ts:1291-1324`; S20 |
| UC-4 Hủy lời mời | FR-EL-009 | E-EL-005, E-EL-006 | BR-EL-005 | S3 `kernel.ts:1472-1505` |
| UC-5 Chặn khi chưa active | FR-EL-010, FR-EL-011 | E-EL-007, E-EL-008 | BR-EL-006, BR-EL-007, BR-EL-011 | S3 `kernel.ts:1564-1577,3069-3071` |

## Ghi chú

* Use case **tái lập chưa duyệt** từ nguồn — mỗi mệnh đề mang nhãn ✅/🔵/🟡. Nguồn đủ cho cả 5 UC (đều có code + ít nhất 1 test/e2e), không có UC bịa.
* UC-2 và UC-3 chia sẻ một hàm server (`activateEnrollment`) nên kết cục giống nhau — khác mỗi scoping đầu vào (org của giáo viên vs ownership của học viên).
