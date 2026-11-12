# UC-01 — Tạo bộ đề full test

a) **Actor & mục tiêu:** Giáo viên muốn tạo một bộ đề trọn vẹn một kỹ năng từ các part trong ngân hàng; kết quả là row `assignment_test` trạng thái `draft` kèm các slot đã ghép.

b) **Tiền điều kiện:** Đã đăng nhập (kernelCtx có orgId); ngân hàng prompt có sẵn part nếu muốn gán ngay. Nguồn: `apps/server/src/routes/assignments/tests.ts:64-65`.

c) **Trigger:** Vào `/assignments/tests/new`, điền header và bấm "Tạo bộ đề". Nguồn: `apps/web/src/routes/_auth/assignments/tests/new.tsx:6-34`.

d) **Kịch bản chính:**
1. GV điền tiêu đề, mô tả, time limit, preset (mặc định Reading, 60:00), collection/group (datalist). `test-header-form.tsx:26-35,216-253`
2. Bấm "Tạo bộ đề" — client build payload đúng rule zod; thời gian trống = null. `test-header-form.tsx:85-121`
3. POST `/api/assignments/tests` → insert status "draft" → 201 `{id}`. `tests.ts:63-86`
4. Nếu phiên có part đã gán: PUT `/:id/parts` replace-all → 200. `test-builder-shell.tsx:523-530`
5. Draft localStorage bị xóa (kể cả outcome-unknown — write có thể đã lưu). `test-builder-shell.tsx:502-510`
6. Điều hướng `/assignments/tests/:id`. `test-builder-shell.tsx:531`

e) **Nhánh mở rộng:**
- 2a. Payload lỗi → hiện lỗi field, không gọi API (E-016/E-017).
- 3a. 500 `test write conflict` (E-013, OQ-5).
- 4a. PUT parts bị 409 khóa (hiếm ngay sau tạo — chỉ khi attempt tồn tại lạ; xem F5).
- 4b. Server 200 nhưng không xác nhận được id → thông báo "Đã tạo bộ đề nhưng chưa xác nhận được id — tìm bộ đề trong danh sách để tiếp tục." `test-builder-shell.tsx:516-521`
- 5a. Reconcile sau committed/unknown: đối chiếu snapshot theo title+skill để tìm id. `test-builder-shell.tsx:534-551`

f) **Nghiệp vụ/quy tắc:** FR-001, FR-017, FR-004; BR-003 (4 kỹ năng), BR-004 (thời lượng), BR-015 (parts không nằm ở create). Nguồn: `contracts.ts:1194-1213,1230-1267`.

g) **Hậu điều kiện:** Bộ đề draft tồn tại trong kernel snapshot; GV ở trang edit; draft local đã clear.

h) **Nguồn & nhãn:** S1 `tests.ts:63-86`; S3 `test-builder-shell.tsx:489-551`; test `tests.test.ts:242-270`; e2e `assignment-test-create.spec.ts:167-223`. Nhãn ✅.
