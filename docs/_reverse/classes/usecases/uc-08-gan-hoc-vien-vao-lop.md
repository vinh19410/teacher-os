---
type: reverse-usecase
feature: classes
uc: UC-08
status: draft
updated: 2026-11-11
---

# UC-08 — Gán học viên vào lớp (tóm tắt)

> **Ranh giới:** UC này chốt tới khi đăng ký trạng thái "invited" được tạo. Vòng đời sau đó (kích hoạt → sinh gói + chuỗi buổi, hủy mời, chấp nhận từ portal, tạo hóa đơn) thuộc feature `enrollment-lifecycle` (/root/projects/teacher-os/docs/project-overview-pdr.md:24).

## a) Định danh

- **ID:** UC-08 · **Tên:** Gán học viên vào lớp · **Mức:** mục tiêu cấp người dùng (summary) · **Scope:** feature `classes` (phần ranh giới) · **Trạng thái:** draft
- **Actor chính:** Giáo viên ✅
- **Nguồn chính:** S4, S6, S7, S8

## b) Actor & bên liên quan

| Bên | Quan tâm | Nhãn |
|-----|----------|------|
| Giáo viên | Thêm học viên có sẵn hoặc tạo nhanh học viên mới vào lớp | ✅ |
| Học viên | Xuất hiện trong roster; (nếu tạo mới + kích hoạt ngay) vào lớp ngay | ✅ |
| Portal học viên | Gửi email lời mời khi tạo mới (lỗi email chỉ cảnh báo, không chặn) | ✅ [S6 — /root/projects/teacher-os/apps/web/src/components/modals/enroll-student-modal.tsx:174] |

## c) Điều kiện tiên quyết

- Lớp tồn tại; học viên nguồn (nếu chọn có sẵn) thuộc org. ✅

## d) Điều kiện hậu

- **Thành công:** đăng ký trạng thái "invited" cho cặp (học viên, lớp) — duy nhất; chưa có gói/buổi; KPI roster tăng. ✅ [S7 — /root/projects/teacher-os/apps/e2e/specs/enroll-existing-student.spec.ts:174]

## e) Luồng chính

1. Tab Học viên → "+ Thêm học viên vào lớp". ✅ [S8 — /root/projects/teacher-os/apps/web/src/routes/_auth/classes/$classId.test.tsx:66]
2. Picker liệt kê CHỈ học viên chưa trong lớp này (loại cả đang học lẫn đang mời). ✅ [S6 — /root/projects/teacher-os/apps/web/src/components/modals/enroll-student-modal.tsx:63-71]
3. Chọn học viên có sẵn (hoặc chuyển tab tạo mới + tùy chọn "kích hoạt ngay"). ✅ [S8 — /root/projects/teacher-os/apps/web/src/components/modals/enroll-student-modal.test.tsx:48 · :111]
4. POST /api/classes/:id/enroll → tạo đăng ký "invited". ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1385-1443]
5. Toast "Đã thêm {tên} vào lớp" (fallback "Đã thêm học viên vào lớp" khi tên trắng) + roster tải lại. ✅ [S6 — /root/projects/teacher-os/apps/web/src/components/modals/enroll-student-modal.tsx:117-118; S8 — /root/projects/teacher-os/apps/web/src/components/modals/enroll-student-modal.test.tsx:180]

## f) Luồng thay thế / nghiệp vụ ngoại lệ

- **A1 — Hết ứng viên:** hiển thị "Tất cả học viên đã được thêm vào lớp.". ✅ [S7 — /root/projects/teacher-os/apps/e2e/specs/enroll-existing-student.spec.ts:295]
- **A2 — Trùng đăng ký (race 2 tab):** 409 "student already enrolled" — modal giữ mở với lỗi (E-029); toast success KHÔNG phát khi server từ chối. ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1407-1418; S8 — /root/projects/teacher-os/apps/web/src/routes/_auth/classes/$classId.test.tsx:113 · /root/projects/teacher-os/apps/web/src/components/modals/enroll-student-modal.test.tsx:202]
- **A3 — Snapshot refresh hỏng sau khi ghi thành công:** không toast success vội; tự đối chiếu rồi toast đúng một lần (truthfulness). ✅ [S8 — /root/projects/teacher-os/apps/web/src/components/modals/enroll-student-modal.test.tsx:226 · :260]
- **A4 — Chọn nhầm lớp khi đổi route:** drop lựa chọn đã chọn của lớp khác. ✅ [S8 — /root/projects/teacher-os/apps/web/src/routes/_auth/classes/$classId.test.tsx:126]

## g) Yêu cầu đặc biệt

- Chỉ đăng ký active nhận dòng bài khi thêm buổi sau này (BR-020); học viên đang mời không được tạo hóa đơn (ranh giới enrollment/invoice — PDR). ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2512 · /root/projects/teacher-os/docs/project-overview-pdr.md:24]

## h) Thông tin bổ sung

- **Tần suất:** đầu khóa và khi nhận thêm học viên. 🔵
- **Traceability:** FR-027; E-029; BR-020, BR-023.
- **OQ:** OQ-5 (gói gắn đăng ký parked).
- **Nguồn test:** /root/projects/teacher-os/apps/e2e/specs/enroll-existing-student.spec.ts:174 · :302 · /root/projects/teacher-os/apps/web/src/routes/_auth/classes/$classId.test.tsx:66-136.


<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền hoangphan.blog</sub>
