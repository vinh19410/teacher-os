---
type: reverse-usecase
feature: classes
uc: UC-06
status: draft
updated: 2026-11-11
---

# UC-06 — Điều chỉnh buổi học (sửa / dời / xóa)

## a) Định danh

- **ID:** UC-06 · **Tên:** Điều chỉnh buổi học (sửa/dời/xóa cả ca) · **Mức:** mục tiêu cấp người dùng (summary) · **Scope:** feature `classes` · **Trạng thái:** draft
- **Actor chính:** Giáo viên ✅
- **Nguồn chính:** S2, S4, S6, S8

## b) Actor & bên liên quan

| Bên | Quan tâm | Nhãn |
|-----|----------|------|
| Giáo viên | Sửa nội dung/dời lịch/xóa buổi chưa diễn ra cho TOÀN ca (mọi học viên cùng lúc) | ✅ |
| Học viên | Nhận thông báo khi dời/hủy (fail-open) | ✅ |
| Lịch nghỉ (feature holidays) | Bucket nghỉ lễ bị khóa; cặp gốc→bù đi theo khi dời | ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1762-1799 · :2263] |

## c) Điều kiện tiên quyết

- Buổi (bucket lớp+ngày) có ít nhất 1 dòng bài hoặc dòng buổi vật lý. ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2174-2181]
- Xóa: lớp manual, không giáo trình. ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2651-2675]

## d) Điều kiện hậu

- **Thành công (sửa):** chủ đề/giờ/thời lượng/zoom áp cho mọi dòng bài của buổi, kể cả dòng đã chốt; ngày mới kèm thứ tuần derive. ✅ [S8 — /root/projects/teacher-os/apps/server/src/kernel-occurrence.test.ts:217 · :233]
- **Thành công (dời):** nguyên khối bucket chuyển ngày đích + tài liệu gắn buổi + cặp bù lịch nghỉ; thông báo phát sau ghi. ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2218-2291 · :2372]
- **Thành công (xóa):** dòng buổi + dòng bài + tài liệu bị xóa; tổng buổi + tổng gói cập nhật. ✅ [S8 — /root/projects/teacher-os/apps/server/src/manual-sessions.test.ts:457]
- **Kết quả:** server trả `{updated, skipped}`; toast trung thực. ✅ [S6 — /root/projects/teacher-os/apps/web/src/lib/kernel-outcome.ts:120-172]

## e) Luồng chính

1. Chọn buổi → "Điều chỉnh buổi" (modal tổng). ✅ [S6 — /root/projects/teacher-os/apps/web/src/components/class-detail/session-actions-modal.tsx:162]
2. **Sửa:** đổi chủ đề/giờ/thời lượng/zoom → POST sessions/:date/edit → guarded UPDATE (org + cặp lớp↔đăng ký + trạng thái trong WHERE) áp cả bucket. ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1840-1874 · :2110-2415]
3. **Dời:** nhập ngày mới (ISO nghiêm ngặt) → pre-check đích (409 nếu có buổi — E-020) → khóa nếu nghỉ lễ (E-021) → batch di chuyển khối → re-check sau ghi chặn race → notify. ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2122-2149 · :2204-2212 · :2354-2412 · :2372]
4. **Xóa:** xác nhận → DELETE sessions/:date → chặn nếu có dòng hoàn thành/điểm danh (E-023) hoặc lớp còn giáo trình (E-024) → xóa + đồng bộ tổng. ✅ [S4 — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2651-2719 · :2770-2794]
5. Toast trung thực: "Đã cập nhật buổi." / "Đã dời buổi." / "Đã xóa buổi học." ✅ [S6 — /root/projects/teacher-os/apps/web/src/routes/_auth/classes/$classId.tsx:125-149]

## f) Luồng thay thế / nghiệp vụ ngoại lệ

- **A1 — Bucket rỗng (bị tab khác dời/xóa trước):** 404 "occurrence not found" → toast "Buổi không còn tồn tại — đã tải lại." (E-019). ✅ [S8 — /root/projects/teacher-os/apps/server/src/kernel-occurrence.test.ts:364]
- **A2 — Ngày đích bị chiếm trong race:** re-check sau ghi → 409 date-occupied (E-020). ✅ [S8 — /root/projects/teacher-os/apps/server/src/kernel-occurrence.test.ts:263]
- **A3 — Buổi nghỉ lễ:** 409 holiday-locked (E-021), không phát thông báo. ✅
- **A4 — Buổi đã hoàn thành/điểm danh:** 409 cannot-delete-completed (E-023); client copy "Không thể xóa buổi học đã điểm danh hoặc hoàn thành." ✅ [S6 — /root/projects/teacher-os/apps/web/src/components/class-detail/session-actions-modal.tsx:136]
- **A5 — Sửa từng dòng bài có ngày mà đổi thứ:** 409 use-occurrence-endpoint (E-027) — phải dùng điều chỉnh cả ca. ✅ [S8 — /root/projects/teacher-os/apps/server/src/kernel-occurrence.test.ts:425]
- **A6 — Dòng bài lệch lớp với đăng ký:** 409 lesson enrollment mismatch (E-028). ✅
- **A7 — Không đổi gì:** client báo "không có gì thay đổi" và không gửi lệnh. ✅ [S8 — /root/projects/teacher-os/apps/web/src/routes/_auth/classes/$classId.sessions.test.tsx:348]

## g) Yêu cầu đặc biệt

- Guarded UPDATE chống TOCTOU (NFR-003) ✅; thông báo fail-open (NFR-004) ✅; toast theo phản hồi server (NFR-005) ✅.

## h) Thông tin bổ sung

- **Tần suất:** khi dạy học thực tế phát sinh (nhiễm lịch, nghỉ đột xuất). 🔵
- **Traceability:** FR-020..022, FR-025; E-019..021, E-023, E-024, E-027, E-028; BR-011, BR-015, BR-017, BR-018.
- **OQ:** không.
- **Nguồn test:** /root/projects/teacher-os/apps/server/src/kernel-occurrence.test.ts:217 · :233 · :263 · :364 · :410 · :425 · /root/projects/teacher-os/apps/server/src/manual-sessions.test.ts:457 · :519 · :697.


<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền hoangphan.blog</sub>
