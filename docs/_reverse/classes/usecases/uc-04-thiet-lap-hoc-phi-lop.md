---
type: reverse-usecase
feature: classes
uc: UC-04
status: draft
updated: 2026-11-11
---

# UC-04 — Thiết lập / sửa / xóa học phí lớp

## a) Định danh

- **ID:** UC-04 · **Tên:** Thiết lập / sửa / xóa học phí lớp · **Mức:** nhiệm vụ người dùng (user task) · **Scope:** feature `classes` · **Trạng thái:** draft
- **Actor chính:** Giáo viên ✅
- **Nguồn chính:** S2, S3, S6, S7

## b) Actor & bên liên quan

| Bên | Quan tâm | Nhãn |
|-----|----------|------|
| Giáo viên | Đặt giá khóa theo học viên; xóa khi chưa chốt giá | ✅ |
| Học phí (feature tuition) | Đọc giá này làm tham chiếu; KHÔNG derive từ hóa đơn | ✅ [S3 — /root/projects/teacher-os/packages/db/src/schema/class.ts:31-34] |

## c) Điều kiện tiên quyết

- Lớp tồn tại. ✅

## d) Điều kiện hậu

- **Thành công:** học phí = số nguyên dương VND, hoặc null khi xóa trắng; tab Học viên hiển thị "Học phí: {giá}đ / học viên" hoặc "—". ✅ [S7 — /root/projects/teacher-os/apps/e2e/specs/class-tuition-fee.spec.ts:4-5 · :76]

## e) Luồng chính

1. Tab Học viên → bấm Sửa học phí → modal mở với giá hiện tại (prefill). ✅ [S6 — /root/projects/teacher-os/apps/web/src/components/modals/edit-class-fee-modal.tsx:33-51]
2. Nhập giá mới (hoặc xóa trắng để xóa; help "Để trống để xóa học phí") → Lưu. ✅ [S6 — /root/projects/teacher-os/apps/web/src/components/modals/edit-class-fee-modal.tsx:62-64]
3. Client kiểm nguyên dương; sai thì chặn với "Học phí phải là số nguyên dương." ✅ [S6 — /root/projects/teacher-os/apps/web/src/components/modals/edit-class-fee-modal.tsx:39]
4. POST /api/classes/:id/tuition-fee → server cập nhật học phí lớp. ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1738]
5. Tải lại — ô Học phí trên roster cập nhật (giá, "Chưa lập phiếu", hoặc "—" khi xóa). ✅ [S6 — /root/projects/teacher-os/apps/web/src/components/class-detail/class-roster-tab.tsx:37-71]

## f) Luồng thay thế / nghiệp vụ ngoại lệ

- **A1 — Giá 0 / âm / quá 12 chữ số:** chặn client (E-009); e2e phủ cả modal tạo và modal sửa. ✅ [S7 — /root/projects/teacher-os/apps/e2e/specs/class-tuition-fee.spec.ts:110]
- **A2 — Xóa học phí:** lưu rỗng → null → hiển thị "—". ✅ [S7 — /root/projects/teacher-os/apps/e2e/specs/class-tuition-fee.spec.ts:76]
- **A3 — Ghi lỗi:** E-030/E-031. ✅

## g) Yêu cầu đặc biệt

- Học phí là GIÁ THEO HỌC VIÊN cho toàn khóa, không phải tổng lớp (BR-008). ✅ [S3 — /root/projects/teacher-os/packages/db/src/schema/class.ts:31-34]

## h) Thông tin bổ sung

- **Tần suất:** mỗi lần mở khóa/chốt giá. 🔵
- **Traceability:** FR-009, FR-016; E-009; BR-008; SC-04.
- **OQ:** OQ-10 (không có lớp miễn phí 0đ).
- **Nguồn test:** /root/projects/teacher-os/apps/e2e/specs/class-tuition-fee.spec.ts:4 · :5 · :76 · :110.


<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền hoangphan.blog</sub>
