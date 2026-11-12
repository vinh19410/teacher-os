# UC-04 — Thử bóc tách lại AI (retry nhập đề)

- **a. Mô tả**: với job thất bại (đã hoàn Credit), teacher/owner tạo job mới dùng lại file trên R2 và đi lại đúng luật ví (reserve → extract → settle/release).
- **b. Actor chính**: Teacher/Owner (`canImportExam`) — apps/server/src/routes/exam-imports.ts:458-462.
- **c. Tiền điều kiện**: job cũ thuộc org và `import_status = "failed_refunded"`; file gốc còn trên R2.
- **d. Hậu điều kiện**: job mới được tạo và xử lý như UC-02; file R2 không upload lại (dùng lại fileKey); job cũ giữ nguyên làm lịch sử.
- **e. Luồng chính**: sweep → load job cũ (404 nếu không thuộc org) → kiểm trạng thái → kiểm file → `ensureWallet` + `assertStaffCap` → INSERT job mới → reserve 5 → `runImport` (apps/server/src/routes/exam-imports.ts:458-570).
- **f. Nhánh thay thế/lỗi**:
  - A1 job không `failed_refunded` → 409 `exam_import_not_retryable` (:500-506; R1 :577-589).
  - A2 job không tồn tại/org khác → 404 (:590-597).
  - A3 file mất → 410 `exam_import_file_missing`, không tạo job ảo (:511-517; R1 :598-612).
  - A4 thiếu Credit → xoá job mới, GIỮ file cũ, 402 (:553-570; R1 :613-639).
- **g. Ràng buộc chất lượng**: 2 row cùng fileKey là chủ ý (file thuộc job cũ — comment :531-532); không xoá lịch sử.
- **h. Truy vết**: FR-10, FR-12, FR-14; BR-05, BR-09; Error 409/410/402 E-001; Flow F5; Test: apps/server/src/routes/exam-imports.test.ts:548-639.
