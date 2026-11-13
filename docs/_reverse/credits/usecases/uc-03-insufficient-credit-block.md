# UC-03 — Bị chặn khi tổ chức thiếu Credit (nhập đề)

- **a. Mô tả**: org không đủ 5 Credit khả dụng → từ chối nhập đề, dọn sạch vết (job + file), trả 402 kèm số dư để UI mở hộp thoại.
- **b. Actor chính**: Teacher/Owner (người bị chặn). Actor phụ: UI (dialog).
- **c. Tiền điều kiện**: `balance − held < 5` tại thời điểm reserve (ví tồn tại hoặc vừa được tạo).
- **d. Hậu điều kiện**: không có job row, không có file R2, không có log sổ cái; số dư không đổi; UI hiển thị thông điệp E-001 nguyên văn + nút "Soạn đề thủ công".
- **e. Luồng chính**: reserve ném `InsufficientCreditsError` → xoá job → xoá file → `readWallet` → 402 `{error: "insufficient credits", code: E-selfomy-alignment-001, balance, available}` (apps/server/src/routes/exam-imports.ts:305-321).
- **f. Nhánh thay thế/lỗi**:
  - A1: retry thiếu Credit → chỉ xoá job mới, giữ file cũ (apps/server/src/routes/exam-imports.ts:553-570; R1 :613-639).
  - A2 🟡: `available` kẹp `Math.max(0, x)` — trường hợp âm chỉ xảy ra khi dữ liệu lệch (OQ-9).
- **g. Ràng buộc chất lượng**: 402 phải kèm cả `balance` lẫn `available` (available mới là số quyết định — comment tại apps/server/src/routes/exam-imports.ts:310-318).
- **h. Truy vết**: FR-11, FR-03; BR-02, BR-03; Error 402 E-001; Flow F3; Test: apps/server/src/routes/exam-imports.test.ts:317-337, 613-639; UI: apps/web/src/components/exam-import/insufficient-credits-dialog.tsx:14-56 + test apps/web/src/components/exam-import/insufficient-credits-dialog.test.tsx:32-45.
