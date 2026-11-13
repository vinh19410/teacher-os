# UC-04 — Thử bóc tách lại AI (retry)

**a) Mô tả & Actor.** Sau khi một lượt nhập thất bại vì AI (E-004), người dùng bấm "Thử bóc tách lại AI": server tạo một JOB MỚI dùng lại file đã lưu trên R2 (không upload lại) và chạy lại toàn bộ reserve → extract → settle/release. Actor chính: teacher/owner.

**b) Điều kiện tiên quyết.** Job cũ `failed_refunded` cùng org; file gốc còn trên R2; người dùng có role nhập đề; binding AI/store sẵn sàng.

**c) Kích hoạt.** Nút "Thử bóc tách lại AI" trên ImportFailedPanel (xuất hiện khi POST trả 502 E-004 hoặc mở `?job=` job failed) → POST `/api/exam-imports/:id/retry` (`import.tsx:199-225, 386-394`).

**d) Luồng chính.**
1. UI gọi retry, khóa nút với nhãn chờ "Đang tạo lượt thử lại…" (`import-failed-panel.tsx:43-52`).
2. Server gate role + 503 nếu thiếu binding; sweep lười trước (`exam-imports.ts:459-479`).
3. Tìm job cũ org-scoped; không thấy → 404; không phải `failed_refunded` → 409 NOT_RETRYABLE; file R2 mất → 410 FILE_MISSING (`exam-imports.ts:481-519`).
4. Đọc lại byte file từ R2; tạo job mới tái dùng `file_key`/`fileName`/`mimeType`/`sizeBytes`/`contentFingerprint` (2 row cùng fileKey là chủ ý) (`exam-imports.ts:520-541`).
5. ensureWallet + staffCap + reserve 5 Credit; thua → xóa job mới (giữ file cũ), 402 E-001 (`exam-imports.ts:522-567`).
6. runImport với `putFile:false` → kết quả như UC-01 bước 8-11 (`exam-imports.ts:569-582`).

**e) Luồng thay thế.**
- e1 Retry thành công → 200 job mới; UI chuyển `done` + đẩy `?job=<job mới>` (`import.tsx:199-211`).
- e2 Retry thất bại AI lần nữa → 502 E-004, panel lỗi tiếp tục (`import.tsx:211-219`).
- e3 Retry thiếu Credit → 402 (job mới bị xóa, job cũ giữ nguyên `failed_refunded`) (`exam-imports.ts:552-567`).

**f) Hậu điều kiện.** Job cũ giữ nguyên làm lịch sử; job mới mang trạng thái theo kết quả chạy; sổ cái có bộ key riêng cho job mới (`exam_import:<newJobId>:<op>`).

**g) Quy tắc nghiệp vụ & Lỗi.** BR-002, BR-006, BR-009; E-004, E-409-retry, E-410, E-001.

**h) Nguồn.** `apps/server/src/routes/exam-imports.ts:455-583`; `apps/web/src/lib/repos/exam-imports.ts:202-219`; test: `exam-imports.test.ts:548-639`; `import.test.tsx:243-289`.
