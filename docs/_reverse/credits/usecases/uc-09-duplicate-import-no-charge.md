# UC-09 — Xử lý trùng đề không mất Credit

- **a. Mô tả**: file trùng vân tay nội dung với job `completed` trong cùng org → trả thông tin bản cũ, tuyệt đối không gọi AI, không tạo job, không giữ/trừ Credit — kể cả khi client đã bỏ qua bước lookup.
- **b. Actor chính**: Teacher/Owner.
- **c. Tiền điều kiện**: tồn tại job `completed` cùng org có `content_fingerprint` trùng và draft đọc được.
- **d. Hậu điều kiện**: không đổi gì trong ví/R2/job; response 200 `{duplicateOf: {jobId, title, completedAt}}`.
- **e. Luồng chính**: POST → (sau kiểm file + sweep) `findCompletedImportByFingerprint` → trùng → 200 `{duplicateOf}` — kiểm tra chạy TRƯỚC `ensureWallet`/INSERT/reserve (apps/server/src/routes/exam-imports.ts:265-274).
- **f. Nhánh thay thế/lỗi**:
  - A1 cùng byte ở org khác → không trùng, bóc tách bình thường (org-scoped, R1 :1195-1203).
  - A2 job `failed_refunded` không chặn re-import (:1204-1213); job `completed` thiếu draft không khoá vĩnh viễn (:1214-1238).
  - A3 lookup trước POST: `GET /exam-imports/lookup?...` cùng dữ liệu duplicate (:348-374).
- **g. Ràng buộc chất lượng**: "0 Credit tuyệt đối" ghi trong comment; title lấy từ draft (fallback fileName).
- **h. Truy vết**: FR-13; BR-10; Flow F12; Test: apps/server/src/routes/exam-imports.test.ts:1084-1238.
