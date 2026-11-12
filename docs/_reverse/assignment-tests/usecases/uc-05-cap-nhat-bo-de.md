# UC-05 — Cập nhật thông tin bộ đề

a) **Actor & mục tiêu:** Giáo viên sửa metadata bộ đề (tên, mô tả, thời lượng, collection, group, trạng thái).

b) **Tiền điều kiện:** Bộ đề tồn tại trong org (404 nếu không). `tests.ts:97-103`

c) **Trigger:** Trang edit, bấm "Lưu thông tin". `test-builder-shell.tsx:824-833`

d) **Kịch bản chính:**
1. PATCH partial các field có mặt; skill chọn bị khóa khi edit (UI) và bị chặn server (400 `skill is immutable`). `tests.ts:104-105`; `test-header-form.tsx:143-145`
2. Không field nào → no-op 200 `{id}` không UPDATE. `tests.ts:120-121`
3. Thành công → "Đã lưu thông tin bộ đề." `test-builder-shell.tsx:512-514`

e) **Nhánh mở rộng:**
- 1a. PATCH kèm status draft|ready — hợp lệ theo contract nhưng UI không có control (G-1/OQ-1). `contracts.ts:1217-1221`
- 1b. testId sai org → 404 + web 404 component. `$id.tsx:8-20`
- Thời lượng sai dạng → chặn client trước (E-016).

f) **Nghiệp vụ/quy tắc:** FR-002; BR-001, BR-004.

g) **Hậu điều kiện:** Metadata mới trong snapshot; parts không đổi (PATCH meta không đụng parts — test `tests.test.ts:313-314`).

h) **Nguồn & nhãn:** S1 `tests.ts:88-131`; test `tests.test.ts:301-314`. Nhãn ✅.
