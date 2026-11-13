# UC-03 — Đánh dấu đã thu thủ công

> Nhãn: ✅ chắc chắn (code khẳng định: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).

**a. Mô tả**: Người tài chính xác nhận đã nhận đủ tiền mặt/ngoài hệ thống cho một hóa đơn — không ghi dòng sổ ngân hàng, chỉ đổi trạng thái.
- Actor chính: Người tài chính. Actor phụ: —.

**b. Kích hoạt & điều kiện trước**: nút "Đã nhận" trên dòng hóa đơn đang chưa đủ, ở trang Doanh thu.

**c. Luồng chính**:
1. Bấm "Đã nhận"; mọi nút hàng khóa để chặn thao tác kép; ô trạng thái đổi optimistic.
2. Gửi yêu cầu kèm nhãn phương thức (rút gọn nếu hóa đơn chưa có phương thức).
3. Máy chủ ghi trạng thái đủ; gửi lại sau lỗi mạng được coi là replay an toàn — kết quả giống lần đầu, chỉ phương thức bị ghi đè.
4. Bảng + KPI cập nhật: "Đã thu" tăng đủ số tiền, "Còn phải thu" giảm.

**d. Luồng thay thế/ngoại lệ**:
- 2a. Máy chủ từ chối → hiện báo từ chối rõ ràng, mở khóa nút ✅ [S54] apps/web/src/routes/_auth/tuition/index.test.tsx:140-152.
- 2b. Mất mạng/phản hồi mờ → toast "chưa chắc"/"chưa ghi" và nạp lại ✅ [S34] apps/web/src/lib/kernel-outcome.ts:70-85.
- 1a. Đủ quyền mới thấy thao tác; thiếu quyền → chặn từ render ✅ [S27] apps/web/src/lib/use-finance-route-guard.ts:12-30.

**e. Hậu điều kiện**: hóa đơn ở điểm kết thúc "đã đủ"; không đường nào mở lại (BR-15); nếu sau đó tiền chuyển khoản về vẫn được ghi vào sổ mà không đổi KPI (BR-11, OQ-09).

**f. Quy tắc nghiệp vụ**: BR-01, BR-09, BR-15.

**g. Yêu cầu**: FR-03, FR-13; NFR-01, NFR-06.

**h. Truy vết**:
- Flow: F4. Error: E-004, E-024.
- Test: ✅ [S54] apps/web/src/routes/_auth/tuition/index.test.tsx:103-152 (ghi đúng một lần, báo cáo và khóa mọi hàng khi đang lưu; báo từ chối thấy được); ✅ [S6] apps/e2e/specs/create-invoice.spec.ts:126-180 (KPI flip sau mark-paid và sống qua reload).
- Sources: [S7] apps/server/src/routes/kernel.ts:3113-3133; [S32] apps/web/src/lib/data-store-reducer.ts:77-87; [S33] apps/web/src/lib/use-direct-kernel-action.ts:14-31; [S65] apps/web/src/lib/data-actions.ts:118-140; [S1] apps/web/src/routes/_auth/tuition/index.tsx:329-338.
