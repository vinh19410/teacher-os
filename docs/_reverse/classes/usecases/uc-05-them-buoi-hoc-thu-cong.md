---
type: reverse-usecase
feature: classes
uc: UC-05
status: draft
updated: 2026-11-11
---

# UC-05 — Thêm buổi học thủ công

## a) Định danh

- **ID:** UC-05 · **Tên:** Thêm buổi học thủ công (lớp không giáo trình) · **Mức:** mục tiêu cấp người dùng (summary) · **Scope:** feature `classes` · **Trạng thái:** draft
- **Actor chính:** Giáo viên ✅
- **Nguồn chính:** S2, S4, S6, S8

## b) Actor & bên liên quan

| Bên | Quan tâm | Nhãn |
|-----|----------|------|
| Giáo viên | Xếp từng buổi cho lớp tự do (không theo giáo trình) | ✅ |
| Học viên active | Nhận dòng bài cho buổi mới (nền tảng điểm danh/bài tập) | ✅ |
| Kernel | Một batch — buổi + bài + tài liệu + tổng buổi + tổng gói | ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2512-2599] |

## c) Điều kiện tiên quyết

- Lớp ở chế độ thủ công: KHÔNG có bản copy giáo trình VÀ (chế độ manual HOẶC đã có >= 1 dòng buổi). ✅ [S5 — /root/projects/teacher-os/apps/server/src/lib/class-mode.ts:19-41]

## d) Điều kiện hậu

- **Thành công:** 1 dòng buổi vật lý mới (duy nhất lớp+ngày) + 1 dòng bài "sắp tới" cho MỖI đăng ký active + tài liệu gắn (nếu có) + tổng buổi lớp = đếm SQL + tổng gói từng đăng ký active được đồng bộ. ✅ [S8 — /root/projects/teacher-os/apps/server/src/manual-sessions.test.ts:216 · :761]
- **Thất bại giữa batch:** cả buổi biến mất (không dở dang). ✅ [S8 — /root/projects/teacher-os/apps/server/src/manual-sessions.test.ts:826]

## e) Luồng chính

1. Lớp manual hiển thị nút "+ Thêm buổi học". ✅ [S6 — /root/projects/teacher-os/apps/web/src/routes/_auth/classes/$classId.tsx:190-199]
2. Mở modal — hệ thống gợi ý ngày học kế tiếp: giờ theo lịch lớp, ngày bỏ qua các ngày đã có buổi, neo từ ngày buổi cuối +1 nếu mốc bắt đầu đã trôi; không parse được lịch thì gợi ý ngày mai. ✅ [S6 — /root/projects/teacher-os/apps/web/src/components/modals/add-class-session-modal.tsx:20-80; S8 — /root/projects/teacher-os/apps/web/src/components/modals/add-class-session-modal.test.tsx:44 · :56 · :68]
3. Nhập ngày/giờ/thời lượng (mặc định 90)/chủ đề/Zoom (tùy chọn)/tài liệu ngân hàng (tùy chọn). ✅ [S2 — /root/projects/teacher-os/packages/api/src/contracts.ts:1748-1766]
4. Client chặn trùng ngày đã có buổi: "Lớp đã có buổi học vào ngày này." ✅ [S6 — /root/projects/teacher-os/apps/web/src/components/modals/add-class-session-modal.tsx:150]
5. POST /api/classes/:id/sessions — server validate (chủ đề bắt buộc <= 500, Zoom https hoặc rỗng, tài liệu tồn tại trong org — 422 trước batch). ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2425-2509 · :2604-2621]
6. Server ghi một batch (E-015..E-018 nếu vi phạm điều kiện). ✅
7. Tải lại — buổi mới hiện trên lịch lớp. ✅

## f) Luồng thay thế / nghiệp vụ ngoại lệ

- **A1 — Ngày trùng (race):** 409 "date already has a session" (E-015). ✅ [S8 — /root/projects/teacher-os/apps/server/src/manual-sessions.test.ts:177]
- **A2 — Lớp có giáo trình:** 409 class-has-syllabus (E-016). ✅ [S8 — /root/projects/teacher-os/apps/server/src/manual-sessions.test.ts:393]
- **A3 — Lớp có dòng buổi legacy nhưng không manual:** 409 not-manual-class (E-017). ✅ [S8 — /root/projects/teacher-os/apps/server/src/manual-sessions.test.ts:345]
- **A4 — Tài liệu lạ (validate hoặc giữa validate→ghi):** 422 material-not-found (E-018), map về nghiệp vụ thay vì lỗi batch. ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2604-2621]
- **A5 — Lớp 0 học viên:** vẫn tạo được buổi (E — FR-028). ✅ [S8 — /root/projects/teacher-os/apps/server/src/manual-sessions.test.ts:110]

## g) Yêu cầu đặc biệt

- Batch nguyên tử (NFR-001); VN timezone cho gợi ý ngày (NFR-007); 1 buổi/ngày/lớp (BR-006). ✅

## h) Thông tin bổ sung

- **Tần suất:** hằng tuần với lớp tự do. 🔵
- **Traceability:** FR-017, FR-018, FR-019, FR-028; E-015..018, E-033..035; BR-005, BR-006, BR-020, BR-021, BR-022.
- **OQ:** OQ-9 (thêm buổi không phát thông báo).
- **Nguồn test:** /root/projects/teacher-os/apps/server/src/manual-sessions.test.ts:110 · :177 · :216 · :393 · :619 · :761 · :826.


<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền hoangphan.blog</sub>
