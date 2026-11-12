# UC-02 — Ghép part vào slot

a) **Actor & mục tiêu:** Giáo viên lấp một slot của bộ đề bằng prompt có sẵn hoặc soạn ngay tại chỗ.

b) **Tiền điều kiện:** Đang ở builder (create hoặc edit); biết slot cần ghép; prompt mục tiêu cùng skill+part và không hybrid.

c) **Trigger:** Bấm "Chọn từ ngân hàng" hoặc "Soạn mới" trên slot trống. `test-part-slot.tsx:62-75`

d) **Kịch bản chính:**
1. Dialog liệt kê prompt lọc skill+part, loại hybrid, mới nhất trước, badge Sẵn sàng/Bản nháp. `test-builder-shell.tsx:603-613`; `prompt-picker-dialog.tsx:29-65`
2. GV chọn prompt → slot hiển thị số câu bắt đầu, dải câu, loại đề. `test-part-slot.tsx:78-123`
3. Outline trái cập nhật "n/… parts · N questions". `test-builder-shell.tsx:626-630`
4. Create mode: giữ state, gửi khi "Tạo bộ đề". Edit mode: PUT replace-all ngay, thành công thì snapshot cập nhật. `test-builder-shell.tsx:302-328,341-352`
5. Soạn mới: composer lockPart; lưu xong tự gán vào slot. `test-builder-shell.tsx:371-401,452-487`

e) **Nhánh mở rộng:**
- 1a. Ngân hàng trống cho slot → "Ngân hàng chưa có đề nào cho {slot} — đóng và bấm Soạn mới…". `prompt-picker-dialog.tsx:32-36`
- 4a. definite-failure → rollback slot về prompt cũ / trống. `test-builder-shell.tsx:314-328`; test `test-builder-shell.test.tsx:427-485`
- 4b. outcome-unknown → không rollback, chờ reconcile. `test-builder-shell.test.tsx:472-485` (test)
- 5a. Lỗi lưu composer → hiển thị lỗi field; không gán.
- Server chặn: slot lạ/trùng/over-4 (E-003/E-007), prompt ngoài org (E-008), sai skill/part (E-009/E-010), hybrid (E-011), có attempt (E-012). `tests.ts:180-281`

f) **Nghiệp vụ/quy tắc:** FR-004, FR-008, FR-009; BR-002, BR-005, BR-007, BR-008, BR-010, BR-014.

g) **Hậu điều kiện:** Slot có đúng 1 prompt; parts trong DB khớp payload (position theo preset).

h) **Nguồn & nhãn:** S1 `tests.ts:166-302`; S3 shell + picker + slot; test `tests.test.ts:272-378,557-620`; e2e `assignment-test-create.spec.ts:178-223`. Nhãn ✅.
