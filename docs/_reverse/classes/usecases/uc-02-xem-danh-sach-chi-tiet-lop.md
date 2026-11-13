---
type: reverse-usecase
feature: classes
uc: UC-02
status: draft
updated: 2026-11-11
---

# UC-02 — Xem danh sách lớp & chi tiết lớp

## a) Định danh

- **ID:** UC-02 · **Tên:** Xem danh sách lớp & chi tiết lớp · **Mức:** mục tiêu cấp người dùng (summary) · **Scope:** feature `classes` · **Trạng thái:** draft
- **Actor chính:** Giáo viên ✅
- **Nguồn chính:** S6, S8

## b) Actor & bên liên quan

| Bên | Quan tâm | Nhãn |
|-----|----------|------|
| Giáo viên | Nhìn tổng quan các lớp, vào lớp để vận hành | ✅ |
| Kernel | Đọc-only snapshot, org-scoped | ✅ |

## c) Điều kiện tiên quyết

- Đăng nhập + bootstrap org. ✅

## d) Điều kiện hậu

- **Thành công:** danh sách hiển thị thẻ lớp (loại, lịch, số học viên, giáo trình, tiến độ, badge) + đếm "N lớp đang hoạt động"; vào chi tiết thấy 4 KPI + 5 tab; số buổi đã học = max hoàn thành theo đăng ký. ✅ [S6 — /root/projects/teacher-os/apps/web/src/lib/repos/classes.ts:39-55]
- **Thất bại (lớp lạ):** trang "Không tìm thấy lớp". ✅ [S6 — /root/projects/teacher-os/apps/web/src/routes/_auth/classes/$classId.tsx:75-88]

## e) Luồng chính

1. Mở /classes — hệ thống đọc snapshot danh sách lớp. ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1628]
2. Hiển thị thẻ lớp + activeCount + bộ lọc chip (Tất cả/Trực tuyến/Trực tiếp/Đang học). ✅ [S6 — /root/projects/teacher-os/apps/web/src/routes/_auth/classes/index.tsx:20-24 · :36]
3. (Org rỗng) hiện empty-state "Chưa có lớp học nào" + hướng dẫn bấm "+ Tạo lớp". ✅ [S6 — /root/projects/teacher-os/apps/web/src/routes/_auth/classes/index.tsx:57-76]
4. Bấm thẻ lớp → /classes/:classId — hiển thị 4 KPI (học viên + "N chờ xác nhận", buổi đã học/tổng + %, số bài syllabus, bài chờ nộp). ✅ [S6 — /root/projects/teacher-os/apps/web/src/routes/_auth/classes/$classId.tsx:284-308]
5. Chuyển tab: Buổi học & luyện tập / Học viên / Giáo trình / Từ vựng / Ghi chú; URL `?tab=sessions|assignments` cũ map về tab gộp. ✅ [S6 — /root/projects/teacher-os/apps/web/src/routes/_auth/classes/$classId.tsx:38-44; S8 — /root/projects/teacher-os/apps/web/src/routes/_auth/classes/$classId.test.tsx:164 · :206]

## f) Luồng thay thế / nghiệp vụ ngoại lệ

- **A1 — Lớp không tồn tại/khác org:** 404 indistinguishable; UI "Không tìm thấy lớp" + copy E-012. ✅
- **A2 — Lớp legacy lịch chữ tự do:** hiển thị bảng thứ dự phòng thay projection. ✅ [S8 — /root/projects/teacher-os/apps/web/src/routes/_auth/classes/$classId.test.tsx:299]
- **A3 — Lớp manual 0 học viên:** vẫn quản lý được buổi (badge/testid ổn định). ✅ [S8 — /root/projects/teacher-os/apps/web/src/routes/_auth/classes/$classId.test.tsx:427]

## g) Yêu cầu đặc biệt

- Chỉ đọc qua snapshot; không mock state (Constraint PDR). ✅ [S1 — /root/projects/teacher-os/docs/project-overview-pdr.md:36]

## h) Thông tin bổ sung

- **Tần suất:** hằng ngày. 🔵
- **Traceability:** FR-012..014; E-012, E-013; SC-01.
- **OQ:** OQ-1 (badge "Tạm dừng" dead state).
- **Nguồn test:** /root/projects/teacher-os/apps/web/src/routes/_auth/classes/index.test.tsx:62 · :85 · /root/projects/teacher-os/apps/web/src/routes/_auth/classes/$classId.test.tsx:164.


<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền hoangphan.blog</sub>
