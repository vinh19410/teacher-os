# UC-07 — Nhập giáo trình từ template vào lớp

## a. Tổng quan

| Hạng mục | Giá trị |
|----------|---------|
| ID | UC-07 |
| Tên | Nhập (deep-copy) một template thành giáo trình riêng của lớp |
| Mục tiêu | Lớp có chương trình + tổng buổi + lịch/gói buổi cho học viên tự động |
| Mức | User-goal (điểm chạm feature classes) |
| Kích hoạt | Tab "Giáo trình" trong chi tiết lớp — "Nhập từ template"; hoặc chọn template lúc tạo lớp |
| Nguồn chính | apps/server/src/routes/syllabus.ts:341-622; apps/web/src/components/modals/import-syllabus-modal.tsx; apps/server/src/lib/syllabus-curriculum.ts:133-215 |

## b. Actors

- **Chính:** Giáo viên — ✅
- **Phụ:** Feature classes (class/enrollment/session_package); enrollment-activation (backfill) — ✅ [S1:94-133]

## c. Điều kiện tiên quyết

- Lớp tồn tại cùng org; template hợp lệ (`class_id IS NULL`); lớp chưa có copy (hoặc đang kẹt — A-heal).

## d. Luồng chính

1. GV mở modal "Nhập giáo trình từ template" (chỉ liệt kê template; lớp chưa có copy thì mới thấy nút). ✅ [S15:31-36][S24:61-75]
2. Modal mô tả: 'Lớp "..." nhận một bản sao riêng — chỉnh sửa trên lớp không ảnh hưởng template hay lớp khác.' ✅ [S15:101-104]
3. GV chọn template (TemplatePicker preview số buổi + kỹ năng + cây) và bấm "Nhập giáo trình". ✅ [S15:107-114][S17:61-101]
4. POST `/api/classes/:id/curriculum/import` `{templateId}`. ✅ [S12:96-100][S6:157-160]
5. Server kiểm lớp (404), template (404 trước mọi side effect). ✅ [S1:352-361]
6. Kiểm copy đã tồn tại theo `syllabus.class_id` (BR-005: không đọc pointer). ✅ [S1:363-367][S3:25-40]
7. Kiểm trần: 500 node tổng (422 TEMPLATE_TOO_LARGE); lớp có class_session → 409 MANUAL_SESSIONS_EXIST; lớp trống: >52 bài → 422 TOO_MANY_LESSONS; 0 bài vào lớp trống manual 0 buổi → 422 EMPTY_TEMPLATE. ✅ [S1:446-516]
8. `buildImportBatch`: copy sinh UUID mới toàn bộ, giữ name/level/type/skills/description/createdAt/kind/position, status reset "upcoming", copy links remap lessonId giữ materialId; gán `class_id` + `source_template_id`. ✅ [S3:133-215]
9. Cùng batch: update lớp — `syllabus_id` = copyId, `sessions_total` = số bài (khi lớp không có lesson thật), `scheduling_mode` = 'auto' (phòng thủ giữ NULL nếu đã có class_session). ✅ [S1:518-538]
10. Backfill: sinh bù lịch + gói buổi cho enrollment active kẹt 0 dòng khi tổng buổi > 0 (tuần tự từng học viên). ✅ [S1:614-620, 88-133]
11. 201 `{id: copyId}`; snapshot refresh; modal đóng; tab Giáo trình hiện tên + tổng buổi; tab buổi học chiếu các buổi dự kiến. ✅ [S1:621][S37:180-246]

## e. Luồng thay thế

- **A1 — Tạo lớp kèm template:** POST `/api/classes` với `templateId` — resolve template trước, copy + class trong cùng batch (class insert CUỐI vì FK NO ACTION), server ép `schedulingMode='auto'`. ✅ [S25:1641-1715]
- **A2 — Tự-heal (nhập lần 2 vào lớp kẹt):** copy tồn tại mà lớp manual 0 buổi + 0 class_session + 0 lesson + cây 1..52 bài → update lớp về copy/auto + backfill → 201; hoặc lớp auto còn buổi kẹt → backfill → 201. ✅ [S1:363-436][S42:1130]
- **A3 — FK fail do tài liệu template đã bị xóa giữa chừng:** re-check → 422 `CURRICULUM_MATERIAL_NOT_FOUND`. ✅ [S1:545-566]
- **A4 — Lost-ACK sau khi D1 đã commit copy:** nhận diện copy đã tồn tại → đi tiếp backfill + 201. ✅ [S1:539-545]

## f. Ngoại lệ

| Tình huống | Phản hồi hệ thống | Nguồn | Nhãn |
|-----------|-------------------|-------|------|
| Lớp lạ | 404 "class not found" | apps/server/src/routes/syllabus.ts:348-355 | ✅ |
| Template lạ/là copy/khác org | 404 "syllabus not found" | apps/server/src/routes/syllabus.ts:358-361 | ✅ |
| Đã có copy (không heal được) | 409 `CURRICULUM_ALREADY_EXISTS` "Lớp đã có giáo trình" | apps/server/src/routes/syllabus.ts:437-443 | ✅ |
| Lớp có buổi thủ công | 409 `MANUAL_SESSIONS_EXIST` | apps/server/src/routes/syllabus.ts:477-487 | ✅ |
| Template quá lớn / quá 52 bài / rỗng | 422 (tương ứng 3 mã) | apps/server/src/routes/syllabus.ts:446-516 | ✅ |
| materialId template đã mất | 422 `CURRICULUM_MATERIAL_NOT_FOUND` | apps/server/src/routes/syllabus.ts:557-566 | ✅ |
| Batch fail khác | 500 "import-syllabus batch failed" | apps/server/src/routes/syllabus.ts:611 | ✅ |
| Client: mã lỗi không nằm trong allowlist | không setError (thông báo chung) | apps/web/src/components/modals/import-syllabus-modal.tsx:84-87 | ✅ |

## g. Hậu điều kiện

- Lớp có đúng 1 copy (unique `class_id`); pointer `class.syllabus_id` đồng bộ trong cùng batch. ✅ [S4:46-49][S3:57-61]
- Học viên active nhận đủ dòng lesson + gói buổi = tổng buổi. ✅ [S1:88-133][S42:1036]
- Thêm/xóa buổi thủ công bị chặn từ đây (409 class-has-syllabus). ✅ [S25:2425-2433]

## h. Quy tắc nghiệp vụ & kiểm chứng

- BR-001, 002, 004, 005, 006, 007, 008, 009, 010, 013. ✅
- Test: apps/server/src/manual-sessions.test.ts:995 (670-1), :1036 (670-2 backfill + holiday), :1130 (670-3 self-heal: 404 template lạ, 201 heal, rồi 409), :1232 (670-4 hybrid race), :1340 (670-5 biên 0/52 bài), :1421 (670-6 remove reset); e2e apps/e2e/specs/syllabus-class-curriculum.spec.ts:89 (A tạo lớp kèm template), :128 (B gán sau + API lần 2 = 409), :284 (expect 409). ✅
