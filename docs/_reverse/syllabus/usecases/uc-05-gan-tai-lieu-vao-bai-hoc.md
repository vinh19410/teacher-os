# UC-05 — Gắn tài liệu ngân hàng vào bài học (#655)

## a. Tổng quan

| Hạng mục | Giá trị |
|----------|---------|
| ID | UC-05 |
| Tên | Chọn tài liệu từ ngân hàng của org gắn vào một bài học giáo trình |
| Mục tiêu | Buổi dạy sau đó tự hiện đúng tài liệu của bài N mà không cần gắn lại |
| Mức | User-goal |
| Kích hoạt | Modal Thêm/Sửa buổi học — khu chọn tài liệu |
| Nguồn chính | apps/server/src/routes/syllabus-content-routes.ts:62-115, 312-356, 466-505; apps/web/src/components/modals/syllabus-content-modals.test.tsx:257-411 |

## b. Actors

- **Chính:** Giáo viên — ✅
- **Phụ:** Ngân hàng tài liệu (feature materials — sở hữu bảng `material`) — ✅ [S5:39-77]

## c. Điều kiện tiên quyết

- Bài học thuộc module thuộc syllabus hợp lệ; tài liệu chọn thuộc cùng org.

## d. Luồng chính

1. GV mở modal thêm/sửa buổi; chọn tối đa 20 tài liệu (`MATERIAL_LINKS_MAX = 20`, nguồn chung server + picker). ✅ [S6:254-256, 271]
2. Thêm bài: materialIds gắn kèm trong cùng batch nguyên tử với insert bài; position 0..n-1 theo thứ tự gửi lên. ✅ [S2:336-356]
3. Sửa bài: body CÓ `materialIds` → replace-all (xóa links theo lessonId + chèn lại trong cùng batch với update bài); body VẮNG → không đụng links hiện có. ✅ [S2:466-505]
4. Server dedupe id giữ thứ tự, kiểm org bằng MỘT câu select inArray; id lạ → 422 với id đầu tiên thiếu. ✅ [S2:67-87][S3:273-289]
5. UI badge đếm tài liệu trên dòng bài học (`LessonBankMaterialsBadge`, ẩn khi 0). ✅ [S22:9-16][S8:304-307]
6. Snapshot chiếu `bankMaterials` teacher-safe (không objectKey/createdBy). ✅ [S26:591-625]

## e. Luồng thay thế

- **A1 — Copy template sang lớp:** links copy kèm, remap `syllabusLessonId`, giữ `materialId` + position; link mồ côi (bài không còn trong cây) bỏ qua. ✅ [S3:200-212][S41:415]
- **A2 — Tài liệu bị xóa giữa lúc validate và batch:** FK NO ACTION fail → re-check → 422 nghiệp vụ thay vì 500. ✅ [S2:89-115]
- **A3 — Chưa chạm chọn tài liệu:** client không gửi key `materialIds` (tránh ghi đè vô tình). ✅ [S13:231-234][S50:391]

## f. Ngoại lệ

| Tình huống | Phản hồi hệ thống | Nguồn | Nhãn |
|-----------|-------------------|-------|------|
| materialId lạ | 422 `{error:"material-not-found", materialId}` | apps/server/src/routes/syllabus-content-routes.ts:76-86 | ✅ |
| Tài liệu xóa giữa chừng (FK) | 422 sau re-check | apps/server/src/routes/syllabus-content-routes.ts:99-114 | ✅ |
| Gắn trùng tài liệu cùng bài | PK kép chặn (không xảy ra do dedupe giữ thứ tự) | packages/db/src/schema/material.ts:156-160 | ✅ |
| > 20 tài liệu | 400 zod (max MATERIAL_LINKS_MAX) | packages/api/src/contracts.ts:271 | ✅ |

## g. Hậu điều kiện

- Links `syllabus_lesson_material` đúng thứ tự; tài liệu đang gắn không xóa được ở feature materials (FK NO ACTION). ✅ [S5:130-137]
- Buổi dạy N của lớp có copy sẽ resolve ra tài liệu của bài N (F8). ✅ [S28:124-174]

## h. Quy tắc nghiệp vụ & kiểm chứng

- BR-013, BR-014. ✅
- Test: apps/server/src/syllabus-material-links.test.ts:241 (thêm N links đúng position), :273 (id lạ 422 không dở dang), :311 (update replace-all vs giữ nguyên), :366 (cascade dọn links), :415 (import remap), :508 (projection teacher-safe), :579 (template không links → như cũ); apps/web/src/components/modals/syllabus-content-modals.test.tsx:257, 304, 373, 391, 411. ✅
