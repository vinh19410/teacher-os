---
type: reverse-usecase
feature: classes
uc: UC-01
status: draft
updated: 2026-11-11
---

# UC-01 — Tạo lớp học (kèm cảnh báo trùng lịch)

## a) Định danh

- **ID:** UC-01 · **Tên:** Tạo lớp học · **Mức:** mục tiêu cấp người dùng (summary) · **Scope:** feature `classes` · **Trạng thái:** draft (tái lập)
- **Actor chính:** Giáo viên (chủ org) ✅ [S4 — /root/projects/teacher-os/apps/server/src/app.ts:286]
- **Nguồn chính:** S2, S4, S6, S7, S8

## b) Actor & bên liên quan

| Bên | Quan tâm | Nhãn |
|-----|----------|------|
| Giáo viên | Xếp lịch khóa học mới đúng, không trùng lịch dạy song song ngoài ý muốn | ✅ |
| Học viên (sau này) | Lớp đủ dữ liệu để nhận chuỗi buổi khi được gán | ✅ |
| Hệ thống kernel | Batch ghi nguyên tử lớp + giáo trình; cap 52 buổi chống batch phồng | ✅ [S2 — /root/projects/teacher-os/packages/api/src/contracts.ts:121] |

## c) Điều kiện tiên quyết

- Giáo viên đăng nhập thành công, đã bootstrap org (role teacher). ✅ [S4 — /root/projects/teacher-os/apps/server/src/app.ts:200-305]
- (Nếu chọn template) org có ít nhất 1 template giáo trình với <= 500 nút. ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1663-1671]

## d) Điều kiện hậu

- **Thành công:** dòng lớp mới tồn tại với trạng thái "active"; nếu có template thì bản copy giáo trình + kỹ năng/tổng buổi từ template; nếu không thì chế độ thủ công 0 buổi; ngày bắt đầu >= hôm nay (client chặn); học phí (nếu nhập) là số nguyên dương. ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1682-1709]
- **Thất bại (giữa batch):** không để lại lớp dở dang hay giáo trình dở dang. ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1649-1713]

## e) Luồng chính

1. Giáo viên mở modal "Tạo lớp mới"; mặc định: hình thức Online, 90 phút, 19:00-20:30, ngày bắt đầu = ngày mai, tổng buổi 12. ✅ [S6 — /root/projects/teacher-os/apps/web/src/components/modals/add-class-modal.tsx:55-57 · :79-80]
2. Nhập tên, chọn loại lớp, (IELTS) kỹ năng, lịch tuần + giờ, tổng buổi, ngày bắt đầu, học phí, template (tùy chọn). ✅ [S2 — /root/projects/teacher-os/packages/api/src/contracts.ts:98-127]
3. Hệ thống client kiểm tra trùng lịch realtime theo 3 điều kiện (thứ chung + hai khung giờ giao nhau với mép chạm không tính + hai khoảng ngày khóa giao nhau); trùng thì hiện cảnh báo kèm tối đa 3 lớp + "+N lớp khác", nút Tạo vẫn bật. ✅ [S6 — /root/projects/teacher-os/apps/web/src/lib/schedule-conflicts.ts:2-19 · :63-110; /root/projects/teacher-os/apps/web/src/components/modals/add-class-modal.tsx:321-350; S8 — /root/projects/teacher-os/apps/web/src/components/modals/add-class-modal.conflict.test.tsx:91 · :110 · :152]
4. Giáo viên bấm Tạo; client tự kiểm validation (E-001..E-009) và gửi POST /api/classes. ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1641]
5. Server xác thực schema; nếu có template: tra template cùng org (404 nếu không thấy — E-010), kiểm <= 500 nút (422 — E-011). ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1649-1673]
6. Server chốt chế độ lịch (template → tự động; không → thủ công, tổng buổi = 0), sắp lại thứ học tăng dần bỏ trùng. ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1682-1701]
7. Server ghi trong một batch: copy giáo trình (nếu có) + dòng lớp (trạng thái "active"). ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1649-1713]
8. Client tải lại snapshot; lớp mới hiện ở danh sách với badge "Đang học". ✅ [S6 — /root/projects/teacher-os/apps/web/src/routes/_auth/classes/index.tsx:123-129]

## f) Luồng thay thế / nghiệp vụ ngoại lệ

- **A1 — Lỗi validation client** (tên rỗng, IELTS thiếu kỹ năng, thiếu thứ, thiếu/sai giờ, giờ kết thúc <= bắt đầu, ngày <= hôm nay, tổng buổi ngoài 1-52, học phí sai): hiện alert tương ứng, giữ nguyên form. ✅ [S6 — /root/projects/teacher-os/apps/web/src/components/modals/add-class-modal.tsx:172-211]
- **A2 — Template không hợp lệ:** 404 "syllabus not found" — E-classes-010; không tạo lớp dở dang. ✅
- **A3 — Template quá lớn:** 422 "Template quá lớn để import" — E-classes-011. ✅
- **A4 — Ghi lỗi mạng/không xác định:** toast E-030/E-031 kèm tự tải lại đối chiếu. ✅ [S6 — /root/projects/teacher-os/apps/web/src/lib/kernel-outcome.ts:76 · :83 · :164 · :170]
- **A5 — Template có skills/tổng buổi:** client điền và khóa 2 trường này theo template. ✅ [S8 — /root/projects/teacher-os/apps/web/src/components/modals/add-class-modal.form.test.tsx:114]

## g) Yêu cầu đặc biệt

- Batch ghi nguyên tử (NFR-classes-001) ✅; org-scoped (NFR-002) ✅; cảnh báo trùng lịch là region trạng thái, tên lớp render text thường (NFR-006) ✅ [S8 — /root/projects/teacher-os/apps/web/src/components/modals/add-class-modal.conflict.test.tsx:182].

## h) Thông tin bổ sung

- **Tần suất:** vài lần/tuần theo mùa khai giảng. 🔵 (ước lượng nghiệp vụ, không có nguồn)
- **Traceability:** FR-001..011; E-001..011, E-014; BR-001..010; SC-01..03.
- **OQ liên quan:** OQ-1 (trạng thái), OQ-2 (không có sửa lớp), OQ-3 (server không chặn ngày quá khứ), OQ-7 (server không chặn trùng lịch), OQ-8 (lịch legacy), OQ-10 (học phí 0).
- **Nguồn test:** /root/projects/teacher-os/apps/e2e/specs/create-class-validation.spec.ts:19 · /root/projects/teacher-os/apps/e2e/specs/create-class-schedule-conflict.spec.ts:15 · /root/projects/teacher-os/apps/server/src/kernel.test.ts:456-590.


<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền hoangphan.blog</sub>
