# UC-08 — Dọn lượt nhập treo (lazy sweep — system)

**a) Mô tả & Actor.** Hệ thống (không có actor người): ở các request chạm ví/job của cùng org, quét job `processing` đã khởi tạo quá 150 giây, hoàn Credit đang giữ và mark `failed_refunded` (reason `timeout`); riêng job đã settle mà chưa kịp mark (crash-sau-settle) được chốt `completed`. Actor: hệ thống.

**b) Điều kiện tiên quyết.** Có request mới gọi `releaseStaleImports` (POST `/exam-imports`, GET `/exam-imports/:id`, POST retry, GET `/credits/wallet`); tồn tại job `processing` với `started_at` < now − 150s.

**c) Kích hoạt.** Bất kỳ request trên (thiết kế "mọi lần chạm ví/job đều có cơ hội dọn rác" — `release-stale.ts:27-29`).

**d) Luồng chính.**
1. Chọn tối đa 20 job `processing` quá hạn của org (`release-stale.ts:34-45`).
2. Với mỗi job: kiểm sổ cái có `exam_import:<jobId>:settle` chưa (`release-stale.ts:46-56`).
3a. Có settle (crash-sau-settle) → mark `completed` (không hoàn — tiền đã trừ thật) (`release-stale.ts:53-56`).
3b. Chưa settle → `releaseCredits` theo `job.heldCredits` (idempotency key chặn hoàn 2 lần) → mark `failed_refunded` E-004 reason `timeout`, chỉ khi job còn `processing` (`release-stale.ts:58-72, 76-99`).
4. Request chính tiếp tục như thường.

**e) Luồng thay thế.**
- e1 Release ném `InsufficientCreditsError` (held đã nhả do luồng khác/sweep khác) → bỏ qua job đó, luồng đang xử lý tự chốt (`release-stale.test.ts:85`).
- e2 Luồng extract gốc về muộn sau khi sweep can thiệp → không settle; nhận kết quả của sweep (`run-import.ts:199-235, 264-303`).
- e3 Không ai gọi API nữa → job treo tiếp tục `processing` (không có cron — chấp nhận theo plan TOS-27 D3).

**f) Hậu điều kiện.** Không còn held credit "ma"; job treo có trạng thái cuối + errorCode/errorReason; sổ cái idempotent.

**g) Quy tắc nghiệp vụ & Lỗi.** BR-002, BR-006, BR-007 (nhánh crash-sau-settle không hoàn).

**h) Nguồn.** `apps/server/src/lib/exam-import/release-stale.ts`; `apps/server/src/lib/exam-import/run-import.ts:236-303`; điểm gọi: `exam-imports.ts:262,381,479`, `credits.ts:31-33`; test: `release-stale.test.ts:68-99`; `exam-imports.test.ts:640-743`.
