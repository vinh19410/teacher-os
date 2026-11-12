# UC-02 — Nhập đề bằng AI (tiêu 5 Credit)

- **a. Mô tả**: teacher/owner tải file đề, hệ thống giữ 5 Credit, bóc tách bằng AI; thành công thì chốt trừ, thất bại thì hoàn đủ.
- **b. Actor chính**: Teacher/Owner (allowlist `canImportExam`) — packages/auth/src/role.ts:90-101; apps/server/src/routes/exam-imports.ts:158-162. Actor phụ: Extractor AI; Hệ thống (sweep).
- **c. Tiền điều kiện**: đăng nhập; vai trong allowlist; binding AI + kho file đã cấu hình (không thì 503 `EXAM_IMPORT_DISABLED` — apps/server/src/routes/exam-imports.ts:164-170); file hợp lệ (MIME pdf/png/jpeg, ≤15 MB, ≤20 trang, không mật khẩu).
- **d. Hậu điều kiện**:
  - Thành công: ví −5 (cặp log reserved→settled); job `completed` kèm draft.
  - Thất bại sau reserve: ví nguyên (log released); job `failed_refunded` E-004.
  - Thiếu Credit: không còn job/file/log nào.
- **e. Luồng chính**: kiểm file → sweep → kiểm trùng → `ensureWallet` + `assertStaffCap` → INSERT job `processing` → reserve 5 → extract (timeout 120s) → validate ≥1 nhóm câu → `settleCredits` → mark `completed` → 200 job DTO (apps/server/src/routes/exam-imports.ts:121-130, 262-330; apps/server/src/lib/exam-import/run-import.ts:186-216).
- **f. Nhánh thay thế/lỗi**:
  - A1 file lỗi → 400 E-003, 0 Credit (apps/server/src/routes/exam-imports.test.ts:459-522).
  - A2 trùng fingerprint → UC-09 (0 Credit).
  - A3 thiếu Credit → UC-03 (402).
  - A4 extractor lỗi/timeout/0 câu → release + `failed_refunded` + 502 E-004 (apps/server/src/lib/exam-import/run-import.ts:245-278; R1 apps/server/src/routes/exam-imports.test.ts:338-394).
  - A5 settle xong mới lỗi → 502 `EXAM_IMPORT_FAILED`, KHÔNG hoàn (apps/server/src/lib/exam-import/run-import.ts:226-243).
  - A6 release trượt do sweep → nuốt `InsufficientCreditsError`, giữ `processing` cho sweep sau (apps/server/src/lib/exam-import/run-import.ts:268-277).
- **g. Ràng buộc chất lượng**: timeout extract 120s; held không tồn tại quá 150s (sweep); batch ví nguyên tử; idempotency theo jobId.
- **h. Truy vết**: FR-04..FR-08, FR-10, FR-12, FR-21; BR-04, BR-05, BR-06, BR-09, BR-11; Error 400 E-003 / 402 E-001 / 502 E-004 / 502 EXAM_IMPORT_FAILED; Flow F2, F4; Test: apps/server/src/routes/exam-imports.test.ts:265-293, 317-394; apps/server/src/lib/exam-import/run-import.test.ts:135-174, 220-232, 285-305; e2e apps/e2e/specs/ai-exam-import-ac-001.spec.ts:13-54.
