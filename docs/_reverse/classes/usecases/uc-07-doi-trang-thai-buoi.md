---
type: reverse-usecase
feature: classes
uc: UC-07
status: draft
updated: 2026-11-11
---

# UC-07 — Hoàn thành / hủy buổi + điểm danh cả ca

## a) Định danh

- **ID:** UC-07 · **Tên:** Hoàn thành (check-in) / hủy buổi cả ca + lưu điểm danh chi tiết · **Mức:** mục tiêu cấp người dùng (summary) · **Scope:** feature `classes` (điểm danh chi tiết = ranh giới với feature `attendance`) · **Trạng thái:** draft
- **Actor chính:** Giáo viên ✅
- **Nguồn chính:** S2, S4, S6, S7, S8

## b) Actor & bên liên quan

| Bên | Quan tâm | Nhãn |
|-----|----------|------|
| Giáo viên | Chốt buổi đã dạy; hủy buổi dở; ghi nhận đi học chi tiết | ✅ |
| Học viên | Nhận thông báo khi buổi bị hủy | ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2889-2907] |
| Học phí/buổi (attendance) | Vắng không phép trừ buổi (hằng số true) | ✅ [S2 — /root/projects/teacher-os/packages/api/src/contracts.ts:1333] |

## c) Điều kiện tiên quyết

- Bucket (lớp+ngày) tồn tại; ngày buổi <= hôm nay (giờ VN) cho check-in/điểm danh. ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2832-2834 · :2925-2928]
- Buổi không ở trạng thái nghỉ lễ bị khóa. ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2204-2212]

## d) Điều kiện hậu

- **Check-in:** mọi dòng "sắp tới" của bucket → "hoàn thành"; dòng đã chốt đếm `skipped`; trả `{updated, skipped}`. ✅ [S8 — /root/projects/teacher-os/apps/server/src/kernel-occurrence.test.ts:275]
- **Hủy:** mọi dòng → "đã hủy" + thông báo schedule_changed cho học viên có dòng bài trong buổi; replay không phát lại. ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2835-2859 · :2889-2907]
- **Điểm danh:** trạng thái bài theo mapping (excused→absent, còn lại→completed); thiếu người/thừa người id → 422; roster đổi → 409 cả batch về 0 dòng. ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2909-3040]

## e) Luồng chính

1. Buổi hôm nay hiển thị nút hành động; buổi tương lai ẩn và gắn chú "Buổi diễn ra sau hôm nay — Hoàn thành mở khi đến buổi." ✅ [S6 — /root/projects/teacher-os/apps/web/src/components/class-detail/session-actions-modal.tsx:236; S7 — /root/projects/teacher-os/apps/e2e/specs/class-operations.spec.ts:80-83]
2. **Check-in cả ca:** xác nhận → POST sessions/:date/check-in (thân rỗng `{}`) → guarded UPDATE mọi dòng sắp tới → trả `{updated, skipped}` → toast "Đã hoàn thành buổi." (kèm "(x/y học viên — z đã chốt)" nếu có skipped). ✅ [S2 — /root/projects/teacher-os/packages/api/src/contracts.ts:1322; S6 — /root/projects/teacher-os/apps/web/src/lib/kernel-outcome.ts:126-130]
3. **Hủy cả ca:** xác nhận nêu tên người bị ảnh hưởng → POST sessions/:date/cancel → trạng thái "đã hủy" + notify (fail-open). ✅ [S8 — /root/projects/teacher-os/apps/web/src/routes/_auth/classes/$classId.sessions.test.tsx:283]
4. **Điểm danh chi tiết:** đánh dấu từng học viên (4 trạng thái + ghi chú <= 255) → PUT sessions/:date/attendance → server kiểm đủ roster + lessonId + guard sĩ số trong SQL → ghi batch. ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2987-3037]
5. Tải lại — trạng thái buổi và KPI cập nhật; dữ liệu bền qua reload. ✅ [S7 — /root/projects/teacher-os/apps/e2e/specs/class-operations.spec.ts:149]

## f) Luồng thay thế / nghiệp vụ ngoại lệ

- **A1 — Buổi tương lai:** 422 future-session; toast "Chưa tới ngày học — chưa thể điểm danh." (E-022). ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:331-333]
- **A2 — Thiếu học viên trong lượt gửi:** 422 incomplete-roster kèm danh sách thiếu (E-025). ✅
- **A3 — lessonId lạ/trùng:** 422 unknown-lesson / "lessonId trùng" (E-025). ✅ [S2 — /root/projects/teacher-os/packages/api/src/contracts.ts:1380]
- **A4 — Đăng ký mới kích hoạt giữa đọc và ghi:** 409 roster-changed, cả batch về 0 dòng (E-026) — tải lại rồi lưu lại. ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2987-3037]
- **A5 — Replay check-in trên buổi đã chốt:** không lỗi; đếm skipped và báo trung thực. ✅ [S8 — /root/projects/teacher-os/apps/server/src/kernel-occurrence.test.ts:275]

## g) Yêu cầu đặc biệt

- Guarded UPDATE + roster count guard trong cùng batch (NFR-003); ngày VN (NFR-007); thông báo fail-open (NFR-004). ✅

## h) Thông tin bổ sung

- **Tần suất:** mỗi buổi dạy. 🔵
- **Traceability:** FR-023, FR-024, FR-026; E-022, E-025, E-026; BR-011, BR-012, BR-013, BR-014, BR-016; SC-05.
- **OQ:** OQ-4 (nhánh scope trợ giảng chết).
- **Nguồn test:** /root/projects/teacher-os/apps/server/src/kernel-occurrence.test.ts:275 · :306 · /root/projects/teacher-os/apps/server/src/kernel-occurrence.test.ts:521 · /root/projects/teacher-os/apps/web/src/routes/_auth/classes/$classId.sessions.test.tsx:138 · :156 · :269 · :283.


<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền hoangphan.blog</sub>
