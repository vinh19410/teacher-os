# UC-06 — Xóa template giáo trình

## a. Tổng quan

| Hạng mục | Giá trị |
|----------|---------|
| ID | UC-06 |
| Tên | Xóa template giáo trình (hard delete) |
| Mục tiêu | Dọn template không còn dùng; lớp đã import không bị ảnh hưởng |
| Mức | User-goal |
| Kích hoạt | Nút "Xóa" trên card template ở `/syllabus` |
| Nguồn chính | apps/server/src/routes/syllabus.ts:283-339; apps/web/src/components/syllabus/delete-syllabus-button.tsx:32-74 |

## b. Actors

- **Chính:** Giáo viên — ✅

## c. Điều kiện tiên quyết

- Id là template (`class_id IS NULL`); kernel ctx hợp lệ.

## d. Luồng chính

1. GV bấm "Xóa" trên card → modal xác nhận: nếu đang dùng, hiện "N lớp đang dùng template ... sẽ KHÔNG bị ảnh hưởng — mỗi lớp đã nhập giữ nguyên bản sao giáo trình của riêng mình (cả tiến độ buổi học)."; nếu không, "Chưa có lớp nào đang dùng...". ✅ [S16:40-48]
2. Modal nói rõ lớp mới không chọn được template này nữa; không thể hoàn tác. ✅ [S16:45-48]
3. GV bấm "Xóa template" → command `delete-syllabus` → POST `/api/syllabus-templates/:id/remove` (body rỗng strict). ✅ [S16:62-69][S6:167]
4. Server `findTemplate` — copy/lạ → 404 che tồn tại. ✅ [S1:292-295]
5. MỘT batch theo thứ tự FK: null `class.syllabus_id` của các lớp đang trỏ tới (`clearPointersTo`) → detach `source_template_id` của các copy → xóa lessons (subquery module) → xóa modules → xóa template. ✅ [S1:297-337]
6. 200 `{ok}`; snapshot refresh; card biến mất. ✅ [S1:338]

## e. Luồng thay thế

- **A1 — Nút Xóa nằm trong card điều hướng:** wrapper chặn click/keydown để không navigate sang detail. ✅ [S16:18-31]

## f. Ngoại lệ

| Tình huống | Phản hồi hệ thống | Nguồn | Nhãn |
|-----------|-------------------|-------|------|
| Id là copy/lạ | 404 "syllabus not found" (che tồn tại) | apps/server/src/routes/syllabus.ts:290, 295 | ✅ |
| Thiếu ctx | 401 | apps/server/src/routes/syllabus.ts:284-285 | ✅ |
| Body không rỗng | 400 invalid body (strict schema) | packages/api/src/contracts.ts:167 | ✅ |

## g. Hậu điều kiện

- Template + cây biến mất; copy của lớp giữ nguyên cây + tiến độ (deep-copy độc lập). ✅ [S43:233][S16:40-44]
- `source_template_id` của copy về NULL → đếm "Đang dùng N lớp" của template đã xóa không còn ý nghĩa (template không còn ở danh sách). ✅ [S1:303-308]

## h. Quy tắc nghiệp vụ & kiểm chứng

- BR-003, BR-019. ✅
- Test: apps/server/src/syllabus-template-migration.test.ts:233 (scenario 6: template intact, copy giữ), migration 0009 set null; UI apps/web/src/components/syllabus/delete-syllabus-button.tsx. ✅
- Ghi chú: không có undo/thùng rác — Gap-4. 🟡
