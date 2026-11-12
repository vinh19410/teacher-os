# UC-03 — Ghi đè nội dung template từ file

## a. Tổng quan

| Hạng mục | Giá trị |
|----------|---------|
| ID | UC-03 |
| Tên | Import Excel/CSV ghi đè toàn bộ cây module/buổi ở màn hình chi tiết |
| Mục tiêu | Cập nhật hàng loạt nội dung template từ file thay vì sửa tay |
| Mức | User-goal |
| Kích hoạt | Nút "Nhập từ Excel/CSV" trên `/syllabus/$syllabusId` |
| Nguồn chính | apps/web/src/routes/_auth/syllabus/$syllabusId.tsx:127-137, 176-229, 418-468; apps/server/src/routes/syllabus.ts:201-277 |

## b. Actors

- **Chính:** Giáo viên — ✅
- **Phụ:** Kernel command bus; D1 batch — ✅

## c. Điều kiện tiên quyết

- Trang chi tiết đang mở cho MỘT TEMPLATE (id copy → not-found, không có nút import). ✅ [S8:62-73, 179-181][S39:80]

## d. Luồng chính

1. GV chọn file → parse client (UC-02 bước 2-7) → preview hiện ở trang. ✅ [S8:127-137, 207-229]
2. Preview ok → nút "Ghi đè nội dung". ✅ [S8:215-227]
3. Client REFRESH snapshot trước khi mở modal confirm để đếm đúng số module/buổi sẽ xóa (staleTime Infinity, đa tab). ✅ [S8:139-144][S48:95]
4. Modal: "Toàn bộ nội dung hiện tại — N module · M buổi học — sẽ bị XÓA và thay bằng ... Không thể hoàn tác. Các lớp đã nhập bản sao từ template này không bị ảnh hưởng." ✅ [S8:421-430]
5. GV bấm "Ghi đè" → command `replace-syllabus-content` → POST `/api/syllabus-templates/:id/replace-content`. ✅ [S8:444-455][S12:231-235]
6. Server `findTemplate` (id copy → 404); đếm lessons từ payload. ✅ [S1:208-215]
7. MỘT batch: xóa lessons theo subquery module → xóa modules → update `total_lessons` = lessonCount mới → chèn modules + lessons mới (position 0..n). ✅ [S1:216-275]
8. 200 `{ok}`; client chỉ clear preview khi result là refreshed/committed; else mở lại modal để sửa rồi thử lại. ✅ [S8:456-462]

## e. Luồng thay thế

- **A1 — Hủy xác nhận:** không đổi gì; preview giữ nguyên. ✅ [S8:432-439]
- **A2 — Replace bằng API trực tiếp với modules rỗng:** zod chặn `min(1)` (zod v4: "Too small: expected array to have >=1 items"). ✅ [S6:297]

## f. Ngoại lệ

| Tình huống | Phản hồi hệ thống | Nguồn | Nhãn |
|-----------|-------------------|-------|------|
| Id là copy/lạ | 404 "syllabus not found" | apps/server/src/routes/syllabus.ts:209-211 | ✅ |
| Payload > 500 node | 400 zod "Tổng số module và buổi học vượt giới hạn 500" | packages/api/src/contracts.ts:300-310 | ✅ |
| Body > 2 MiB | 413 | apps/server/src/routes/syllabus.ts:730-735 | ✅ |
| Write fail chắc chắn | giữ preview + mở lại modal (không clear) | apps/web/src/routes/_auth/syllabus/$syllabusId.tsx:456-462 | ✅ |
| Kết quả bất định (outcome-unknown) | busy-guard trả outcome-unknown, không toast giả | apps/web/src/lib/use-direct-kernel-action.ts:34-40 | ✅ |

## g. Hậu điều kiện

- Cây cũ biến mất hoàn toàn; cây mới đúng payload; `total_lessons` = số bài mới. ✅ [S1:212-246]
- Bản copy đã import ở các lớp KHÔNG đổi (deep-copy độc lập). ✅ [S8:428-430][S37:287-332]
- Template giữ `class_id = NULL`. ✅ [S3:42-55]

## h. Quy tắc nghiệp vụ & kiểm chứng

- BR-003 (copy độc lập), BR-016/017/018 (mirror + all-or-nothing). ✅
- Test: apps/e2e/specs/syllabus-detail-import-overwrite.spec.ts:21 (ghi đè sau xác nhận thay cây; hủy giữ nguyên), :80 (copy không có nút ghi đè); apps/web/src/routes/_auth/syllabus/$syllabusId.test.tsx:95 (đếm đúng số xóa sau refresh), :141 (khóa import đến khi ghi đè landed). ✅
