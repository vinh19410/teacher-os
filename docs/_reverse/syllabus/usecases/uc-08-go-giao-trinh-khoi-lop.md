# UC-08 — Gỡ giáo trình khỏi lớp

## a. Tổng quan

| Hạng mục | Giá trị |
|----------|---------|
| ID | UC-08 |
| Tên | Gỡ (xóa) bản copy giáo trình của lớp |
| Mục tiêu | Lớp trở về trạng thái không giáo trình (manual) hoặc giữ dữ liệu buổi đã dạy |
| Mức | User-goal (điểm chạm feature classes) |
| Kích hoạt | Tab "Giáo trình" của lớp — nút "Gỡ giáo trình" |
| Nguồn chính | apps/server/src/routes/syllabus.ts:624-718; apps/web/src/components/class-detail/curriculum-management-section.tsx:83-118 |

## b. Actors

- **Chính:** Giáo viên — ✅

## c. Điều kiện tiên quyết

- Lớp tồn tại cùng org.

## d. Luồng chính

1. GV bấm "Gỡ giáo trình" → modal: "Toàn bộ cây giáo trình của lớp (kèm tiến độ buổi học) sẽ bị xoá. Template gốc và các lớp khác không bị ảnh hưởng. Không thể hoàn tác." ✅ [S24:83-92]
2. GV xác nhận → command `remove-curriculum` → POST `/api/classes/:id/curriculum/remove` (body rỗng strict). ✅ [S24:106-113][S6:163]
3. Server tìm copy theo `syllabus.class_id` — KHÔNG rẽ theo pointer (stale/foreign pointer = chưa có). ✅ [S1:639-643]
4. Nếu KHÔNG có copy: heal con trỏ lệch về null (idempotent) → 200. ✅ [S1:643-648]
5. Nếu có copy: MỘT batch — update lớp (syllabus_id null; schedulingMode + sessionsTotal giữ nguyên nếu còn buổi thật, ngược lại 'manual'/0); update session_package.total về 0 khi 0 buổi thật; xóa lessons → modules → copy. ✅ [S1:650-716]
6. 200 `{ok}`; snapshot refresh; tab về empty state; page head quay lại "Sắp xếp buổi"/"+ Thêm buổi học". ✅ [S37:333-375]

## e. Luồng thay thế

- **A1 — Lớp còn buổi thật:** giữ nguyên schedulingMode + sessionsTotal (không reset) — chỉ mất cây giáo trình. ✅ [S1:652-662][S42:1421]

## f. Ngoại lệ

| Tình huống | Phản hồi hệ thống | Nguồn | Nhãn |
|-----------|-------------------|-------|------|
| Lớp lạ | 404 "class not found" | apps/server/src/routes/syllabus.ts:631-637 | ✅ |
| Thiếu ctx | 401 | apps/server/src/routes/syllabus.ts:625-626 | ✅ |

## g. Hậu điều kiện

- Copy + cây + liên kết links biến mất (cascade); lớp về manual/0 nếu trống buổi; gói buổi học viên về 0 khi trống. ✅ [S1:650-687]
- Template gốc và lớp khác không đổi. ✅ [S24:89-91]

## h. Quy tắc nghiệp vụ & kiểm chứng

- BR-005, BR-010 (sau gỡ được thêm buổi manual lại), BR-011. ✅
- Test: apps/server/src/manual-sessions.test.ts:1421 (670-6: reset 0-lesson class về manual/0, giữ auto khi còn lessons); e2e apps/e2e/specs/syllabus-class-curriculum.spec.ts:333 (D: tab về trống, template còn). ✅
