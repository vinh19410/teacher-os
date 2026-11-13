# UC-06 — Ghi nhận phiếu thu từng phần

> Nhãn: ✅ chắc chắn (code khẳng định: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).

**a. Mô tả**: Người tài chính ghi một phiếu thu tiền mặt/chuyển khoản ngoài hệ thống vào đúng khoản đang nợ của học viên, có thể một phần số tiền.
- Actor chính: Người tài chính. Actor phụ: —.

**b. Kích hoạt & điều trước**: nút "Thu" trên dòng học viên còn nợ ở Sổ công nợ; học viên có ≥1 khoản còn nợ.

**c. Luồng chính**:
1. Modal mở: mặc định khoản **hạn sớm nhất**; tóm tắt phải đóng/đã thu/còn nợ.
2. Nhập số tiền (nút "Thu toàn bộ" điền phần còn thiếu), chọn phương thức, ghi chú; xem dự báo sau ghi khi gõ.
3. Gửi kèm khóa chống trùng của phiên; máy chủ ghi một dòng sổ thủ công và tính lại số đã thu **trong cùng một lô**, guard chống vượt nợ nằm trong lô.
4. Kết quả: một phần (còn lại cập nhật) hoặc đủ (trạng thái đổi, nhãn phương thức tất toán ghi vào hóa đơn).

**d. Luồng thay thế/ngoại lệ**:
- 2a. Số tiền ≤0 hoặc vượt còn nợ → lỗi inline, khóa nút lưu; đổi khoản thì kiểm lại ✅ [S59] apps/web/src/components/modals/record-payment-modal.test.tsx:319-429.
- 3a. Hóa đơn đã đủ theo sổ → 422 kèm giải thích, nạp lại, giữ modal ✅ [S24] apps/web/src/components/modals/record-payment-modal.tsx:160-163.
- 3b. Vượt nợ (máy chủ) → 422 kèm số nợ mới cập nhật vào form ✅ [S24] apps/web/src/components/modals/record-payment-modal.tsx:166-173.
- 3c. Trùng khóa (máy chủ) → 409, **giữ** khóa cũ qua lần thử lại bị từ chối, cháy khóa mới sinh ✅ [S59] apps/web/src/components/modals/record-payment-modal.test.tsx:214-243, 298-318.
- 3d. Hai phiếu đua cùng lúc → đúng một phiếu ghi được, không vượt nợ ✅ [S49] apps/server/src/lib/payments/manual-payment.test.ts:315-344.
- 3e. Org khác → 404 không phân biệt ✅ [S49] apps/server/src/lib/payments/manual-payment.test.ts:345-351.

**e. Hậu điều kiện**: sổ có dòng thủ công mang phương thức + người lập; số đã thu và trạng thái tính lại; KPI nợ cập nhật.

**f. Quy tắc nghiệp vụ**: BR-01 (một phần), BR-03 (còn lại ≥0), BR-10 (nhãn phương thức đầy đủ), BR-14 (chống trùng theo org/whole-cục).

**g. Yêu cầu**: FR-07, FR-13; NFR-02.

**h. Truy vết**:
- Flow: F5. Error: E-010..E-012, E-019..E-022, E-024.
- Test: ✅ [S49] apps/server/src/lib/payments/manual-payment.test.ts:170-408 (13 test: một phần; tiền mặt tất toán; replay; khóa khác số tiền 409; vượt nợ DB nguyên vẹn; dòng chưa-khớp không tính; đã đủ 422; mark-paid trước đó; đua; org; body; danh sách; giữ phương thức lịch sử); ✅ [S59] apps/web/src/components/modals/record-payment-modal.test.tsx:131-429 (10 test UI); ✅ [S56] apps/web/src/routes/_auth/debts/index.test.tsx:400-466 (mở modal từ dòng nợ).
- Sources: [S12] apps/server/src/lib/payments/record-manual-payment.ts:42-196; [S24] apps/web/src/components/modals/record-payment-modal.tsx:33-191.
