# UC-04 — Quản trị nội dung template (module, buổi học, đổi thứ tự)

## a. Tổng quan

| Hạng mục | Giá trị |
|----------|---------|
| ID | UC-04 |
| Tên | Thêm/sửa/xóa module và buổi học, đổi thứ tự trên template |
| Mục tiêu | GV xây dựng và chỉnh cây giáo trình theo ý |
| Mức | User-goal |
| Kích hoạt | Trang chi tiết template: "+ Thêm module", "Sửa", "↑/↓/Xóa" |
| Nguồn chính | apps/server/src/routes/syllabus-content-routes.ts:117-546; apps/web/src/components/syllabus/syllabus-mutations.tsx:90-146; apps/web/src/routes/_auth/syllabus/$syllabusId.tsx:240-348 |

## b. Actors

- **Chính:** Giáo viên — ✅
- **Phụ:** Kernel command bus — ✅

## c. Điều kiện tiên quyết

- Template tồn tại (`findTemplate`); module thao tác phải thuộc syllabus + org (`findModule`). ✅ [S3:42-55, 88-106]

## d. Luồng chính

1. **Thêm module:** POST `{base}/modules` → position = max+1 → 201 `{id}`. ✅ [S2:130-149]
2. **Sửa module:** POST `{base}/modules/:mid` → update title/description → 200. ✅ [S2:207-232]
3. **Thêm buổi học:** POST `{base}/modules/:mid/lessons` → position = max+1; kind/status default khi vắng ("lesson"/"upcoming"); màn syllabus gửi kind (showKind). → 201. ✅ [S2:302-331, 328-329][S23:66-69]
4. **Sửa buổi học:** POST `{base}/modules/:mid/lessons/:lid` → update; body vắng kind/status → GIỮ giá trị hiện có. ✅ [S2:452-464]
5. **Xóa module:** POST `{base}/modules/:mid/remove` → batch xóa lessons của module (subquery) rồi xóa module (child-first, không dựa FK cascade). ✅ [S2:250-278]
6. **Xóa buổi học:** POST `{base}/modules/:mid/lessons/:lid/remove` → 200. ✅ [S2:536-545]
7. **Đổi thứ tự:** nút ↑/↓ client tính mảng mới rồi POST reorder với ĐỦ tập id (moduleIds/lessonIds). Server kiểm duplicate (400), guard 500 siblings (422), mismatch tập (409), rồi batch update position theo index. ✅ [S18:90-119][S2:152-205, 359-416]
8. Mọi thao tác xong → snapshot refresh. ✅ [S26:314-326]

## e. Luồng thay thế

- **A1 — Cùng bộ route cho giáo trình của lớp** (base `/classes/:id/curriculum`): resolve qua `findClassCurriculum`; handler không bao giờ đọc `:id` raw. ✅ [S1:751-777][S2:35-44]
- **A2 — Reorder khi danh sách rỗng** (không có statement đầu) → 409 set-mismatch. ✅ [S2:199-202, 410-413]
- **A3 — Xóa module có buổi thi/progress trên bản copy:** confirm text khác nhau giữa template và copy (isClassCopy). ✅ [S18:148-155]

## f. Ngoại lệ

| Tình huống | Phản hồi hệ thống | Nguồn | Nhãn |
|-----------|-------------------|-------|------|
| Syllabus không tìm thấy (module route) | 404 "syllabus not found" | apps/server/src/routes/syllabus-content-routes.ts:126 | ✅ |
| Syllabus không tìm thấy (lesson route) | 404 "lesson not found" (contract cũ giữ mức lesson) | apps/server/src/routes/syllabus-content-routes.ts:293-296, 429-431 | ✅ |
| Module lạ | 404 "module not found" | apps/server/src/routes/syllabus-content-routes.ts:222, 248, 299, 376 | ✅ |
| Lesson lạ | 404 "lesson not found" | apps/server/src/routes/syllabus-content-routes.ts:449, 534 | ✅ |
| Reorder id trùng | 400 "duplicate ids" | apps/server/src/routes/syllabus-content-routes.ts:158-160 | ✅ |
| Reorder thiếu/thừa id | 409 "set-mismatch" | apps/server/src/routes/syllabus-content-routes.ts:179-186, 390-397 | ✅ |
| Siblings > 500 | 422 "too many modules/lessons to reorder" | apps/server/src/routes/syllabus-content-routes.ts:176-178, 387-389 | ✅ |
| Copy đi qua route template | 404 (findTemplate isNull classId) | apps/server/src/lib/syllabus-curriculum.ts:42-55 | ✅ |

## g. Hậu điều kiện

- Cây template cập nhật; positions liên tục theo thao tác; snapshot mới về client. ✅ [S2:117-546][S26:314-326]

## h. Quy tắc nghiệp vụ & kiểm chứng

- BR-002, BR-019 (copy không sửa được qua route template — trừ khi dùng đúng base lớp). ✅
- Test: apps/e2e/specs/syllabus-delete-reorder.spec.ts:25 (mũi tên đổi thứ tự rồi xóa module); apps/web/src/components/modals/syllabus-content-modals.test.tsx:142 (module phải có tên), :179 (sửa prefill), :239 (chọn kind trên syllabus), :249 (lớp không gửi kind), :352 (sửa buổi thi từ lớp giữ kind); apps/server/src/syllabus-material-links.test.ts (guard #154 liên quan status preserve). ✅
- Ghi chú: không có thao tác "sửa metadata syllabus" (tên/level/...) — xem Gap-1/OQ-2. 🟡
