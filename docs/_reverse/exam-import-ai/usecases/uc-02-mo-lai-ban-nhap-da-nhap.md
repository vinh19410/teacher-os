# UC-02 — Mở lại bản nháp đã nhập

**a) Mô tả & Actor.** Người dùng (teacher/owner; và các thành viên org khác như `ta` được xem) mở lại kết quả một lượt nhập đề trước đó qua URL `?job=<id>` để xem đối chiếu, tiếp tục chỉnh sửa (UC-05) hoặc xuất bản (UC-06). Actor chính: thành viên org.

**b) Điều kiện tiên quyết.** Job thuộc org hiện tại; người dùng đã đăng nhập (GET không gate `canImportExam` — `ta`/`class_teacher` đọc được, `exam-imports.ts:372-403`).

**c) Kích hoạt.** Dán/mở link `/assignments/tests/import?job=<id>`, bấm Back/Reload giữ URL, hoặc nút "Mở lại bản nháp cũ (0 Cr)" từ UC-03.

**d) Luồng chính.**
1. Route nạp job: GET `/api/exam-imports/:id` (org-scoped; chạy sweep lười trước khi trả). ✅ `exam-imports.ts:377-403`
2. Server trả job DTO — draft parse an toàn từ `draft_json` (JSON hỏng → draft null thay vì 500). ✅ `exam-imports.ts:59-88`
3. UI đặt `done` + hiển thị workspace; viewer tải file gốc bằng GET `/:id/file` (stream blob). ✅ `import.tsx:128-155`, `repos/exam-imports.ts:186-199`
4. Reload/Back/share giữ kết quả vì kết quả sống trong URL. ✅ `import.tsx:178-183`

**e) Luồng thay thế.**
- e1 Job không tồn tại/org khác → 404 `exam_import_not_found` → màn reset idle + ErrorNotice "Bản nháp không tồn tại hoặc đã bị xoá — hãy nhập đề mới." (`import.tsx:516-517`).
- e2 Job `failed_refunded` → ImportFailedPanel + nút retry (chuyển UC-04) (`import.tsx:271-288`).
- e3 Job `completed` nhưng draft không đọc được → cảnh báo "Bản nháp hỏng hoặc không đọc được — hãy nhập đề mới." + dropzone quay lại (`import.tsx:432-450`).
- e4 File gốc đã mất trên R2 → GET file 404 cùng mã NOT_FOUND (`exam-imports.ts:439-448`).

**f) Hậu điều kiện.** UI hiển thị đúng trạng thái job; ví badge refresh; không phát sinh credit.

**g) Quy tắc nghiệp vụ & Lỗi.** BR-012 (org-scoped); E-404; lỗi draft hỏng (FR-024).

**h) Nguồn.** `apps/web/src/routes/_auth/assignments/tests/import.tsx:126-155, 432-510`; `apps/server/src/routes/exam-imports.ts:377-453`; test: `import.test.tsx:274-289, 445-499`; `exam-imports.test.ts:396-414`.
