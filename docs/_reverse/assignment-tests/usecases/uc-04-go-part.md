# UC-04 — Gỡ part khỏi slot

a) **Actor & mục tiêu:** Giáo viên bỏ một part khỏi bộ đề mà không xóa đề khỏi ngân hàng.

b) **Tiền điều kiện:** Slot đang có prompt.

c) **Trigger:** Bấm nút ✕ ("Gỡ khỏi test", hover cam — không destructive). `test-part-slot.tsx:110-120`

d) **Kịch bản chính:**
1. assigned[part] = null; overrides[part] = null. `test-builder-shell.tsx:354-362`
2. Edit mode: PUT replace-all (slot rơi khỏi mảng). `repos/assignment-tests.ts:50-68` (filter slot đã gán)
3. Thất bại chắc chắn → rollback cả promptId lẫn override cũ. `test-builder-shell.tsx:314-328`

e) **Nhánh mở rộng:**
- 2a. Test có attempt → 409 TEST_PARTS_LOCKED, DB không đổi. `tests.ts:264-281`; test `tests.test.ts:515-526`
- 2b. Gỡ hết (payload rỗng `[]`) vẫn hợp lệ — replace-all về bộ trống khi chưa khóa. `tests.test.ts:517` (biến thể 409), `tests.test.ts:622-648` (bình thường)

f) **Nghiệp vụ/quy tắc:** FR-011, FR-004; BR-007, BR-008.

g) **Hậu điều kiện:** Slot trống; số câu các part sau dồn lên (slot trống không dịch mốc — BR-009).

h) **Nguồn & nhãn:** S3 `test-builder-shell.tsx:354-369`; test `test-builder-shell.test.tsx:427-485`. Nhãn ✅.
