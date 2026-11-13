---
type: reverse-usecase
feature: classes
uc: UC-03
status: draft
updated: 2026-11-11
---

# UC-03 — Cập nhật ghi chú lớp

## a) Định danh

- **ID:** UC-03 · **Tên:** Cập nhật ghi chú lớp · **Mức:** nhiệm vụ con (subfunction) · **Scope:** feature `classes` · **Trạng thái:** draft
- **Actor chính:** Giáo viên ✅
- **Nguồn chính:** S2, S6

## b) Actor & bên liên quan

| Bên | Quan tâm | Nhãn |
|-----|----------|------|
| Giáo viên | Ghi chú nội bộ về lớp (đang mở tab Ghi chú) | ✅ |

## c) Điều kiện tiên quyết

- Lớp tồn tại trong org. ✅

## d) Điều kiện hậu

- **Thành công:** cột ghi chú lớp cập nhật; toast "Đã lưu ghi chú."; chặn lưu đôi khi đang gửi. ✅ [S8 — /root/projects/teacher-os/apps/web/src/routes/_auth/classes/$classId.sessions.test.tsx:363]
- **Thất bại:** toast E-030/E-031. ✅

## e) Luồng chính

1. Mở tab Ghi chú — thấy text hiện tại. ✅ [S6 — /root/projects/teacher-os/apps/web/src/routes/_auth/classes/$classId.tsx:450-478]
2. Sửa text → lưu → POST /api/classes/:id/notes. ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1717]
3. Server cập nhật cột ghi chú (schema classNotesSchema). ✅ [S2 — /root/projects/teacher-os/packages/api/src/contracts.ts:169-172]
4. Toast xác nhận. ✅

## f) Luồng thay thế / nghiệp vụ ngoại lệ

- **A1 — Ghi lỗi:** toast "Không lưu được — dữ liệu chưa được ghi lên máy chủ." (E-030) / "Không xác định được kết quả — có thể đã lưu. Đang tải lại để kiểm tra…" (E-031). ✅ [S6 — /root/projects/teacher-os/apps/web/src/lib/kernel-outcome.ts:76 · :83]
- **A2 — Lưu đôi:** nút bị khóa trong lúc request đầu chạy. ✅ [S8 — /root/projects/teacher-os/apps/web/src/routes/_auth/classes/$classId.sessions.test.tsx:363]

## g) Yêu cầu đặc biệt

- Không có. Ghi đơn cột qua command bus. ✅

## h) Thông tin bổ sung

- **Tần suất:** ngẫu nhiên. 🔵
- **Traceability:** FR-015; E-030, E-031.
- **OQ:** không.
- **Nguồn test:** /root/projects/teacher-os/apps/web/src/routes/_auth/classes/$classId.sessions.test.tsx:363.


<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền hoangphan.blog</sub>
