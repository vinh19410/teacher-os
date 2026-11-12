---
type: reverse-srs
feature: credits
status: draft
confidence_summary: "✅199 🔵18 🟡17 (trong spec; toàn bộ 17 file: ✅200 🔵20 🟡39 — đếm theo luật batch sau audit) — OQ 12"
source_commit: "develop @ d6c0f6b5"
---

# Đặc tả nghịch (Reverse SRS) — Feature Ví Credit (credits)

> Nhãn: ✅ chắc chắn (code khẳng định: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).

## Mục 0 — Provenance (nguồn nghịch đảo)

### 0.1 Bảng truy vết nguồn

| S-id | Nguồn | Loại | Vai trong đặc tả |
|---|---|---|---|
| S1 | apps/server/src/routes/credits.ts | route | Endpoint xem ví, sweep lười, tạo lười ví |
| S2 | packages/db/src/schema/credit-wallet.ts | schema | Ví + sổ cái, ràng buộc UNIQUE |
| S3 | apps/server/src/lib/credits/wallet.ts | service | reserve/settle/release/claim/revert/readOrgPlan |
| S4 | apps/server/src/lib/credits/wallet.test.ts | test | R1 cho mọi biến đổi ví |
| S5 | packages/api/src/contracts.ts | contract | Hằng số giá, mã lỗi, thông điệp nguyên văn, wire schema |
| S6 | apps/server/src/routes/exam-imports.ts | route consumer | Luồng tiêu Credit nhập đề |
| S7 | apps/server/src/routes/exam-imports.test.ts | test | R1 nhập đề + GET ví + sweep import |
| S8 | apps/server/src/lib/exam-import/run-import.ts | service | settle/release trong extract |
| S9 | apps/server/src/lib/exam-import/run-import.test.ts | test | R1 settle/release |
| S10 | apps/server/src/lib/exam-import/release-stale.ts | sweep | Giải tỏa job import treo |
| S11 | apps/server/src/lib/exam-import/release-stale.test.ts | test | R1 sweep import |
| S12 | apps/server/src/lib/ai-grading/run-grading.ts | pipeline | Tiêu Credit chấm AI + Chấm nhanh |
| S13 | apps/server/src/lib/ai-grading/run-grading.test.ts | test | R1 chấm AI + quick grade |
| S14 | apps/server/src/lib/ai-grading/release-stale.ts | sweep | Giải tỏa held chấm AI (3 nhóm) |
| S15 | apps/server/src/routes/grading.ts | route | ai-retry, demo-sample, sweep tại GET |
| S16 | apps/server/src/routes/grading.test.ts | test | R1 ai-retry |
| S17 | apps/server/src/app.ts | bootstrap | Gắn route + auth bootstrap org |
| S18 | packages/auth/src/role.ts | role gate | Allowlist vai được tiêu Credit |
| S19 | apps/web/src/lib/repos/exam-imports.ts | client | fetch ví + mapping lỗi |
| S20 | apps/web/src/components/exam-import/credit-cost-badge.tsx | UI | Huy hiệu giá + số dư |
| S21 | apps/web/src/components/exam-import/insufficient-credits-dialog.tsx | UI | Hộp thoại hết Credit |
| S22 | apps/web/src/components/exam-import/insufficient-credits-dialog.test.tsx | test UI | R1 wording E-001 |
| S23 | apps/web/src/components/grading/ai-draft-panel.tsx | UI | Banner hết Credit + Nạp thêm |
| S24 | apps/web/src/routes/_auth/assignments/tests/import.tsx | UI | Màn nhập đề, refresh ví |
| S25 | apps/web/src/components/exam-import/import-with-ai-button.tsx | UI | Nút dẫn vào, ẩn theo flag |
| S26 | apps/e2e/specs/ai-exam-import-ac-001.spec.ts | e2e | R1 ví 30 → 25 |
| S27 | apps/e2e/specs/ai-grading-ac-001.spec.ts | e2e | R1 ví giảm 1 Credit (Writing) |
| S28 | packages/db/src/migrations/0051_tan_slayback.sql | migration | Tạo credit_wallet + credit_usage_log |
| S29 | packages/db/src/migrations/0055_premium_blazing_skull.sql | migration | Thêm plan_kind, plan_status |
| S30 | packages/db/src/schema/exam-import-job.ts | schema | heldCredits, vòng đời job |
| S31 | packages/db/src/schema/ai-grading-draft.ts | schema | creditCost, gradingMode, retryCount, máy trạng thái |
| S32 | packages/api/src/vietnam-date.ts | util | Cửa sổ tháng dương lịch Asia/Ho_Chi_Minh |
| S33 | apps/server/src/routes/student-quiz.test.ts | test | R1 nộp bài không tiêu Credit khi AI tắt |
| S34 | apps/server/src/routes/student.ts | route | Điểm kích hoạt pipeline chấm AI |

### 0.2 Liên kết bằng chứng

- Toàn bộ dẫn chiếu `path:line` theo từng chủ đề: xem `_evidence.md` (cùng thư mục feature).
- Luồng: `srs/credits-reverse-flows.md`; trạng thái: `srs/credits-reverse-states.md`; ERD: `srs/credits-reverse-erd.md`; use case: `usecases/`.

### 0.3 Tài liệu tồn tại trước

Không có — `existing_doc = null` (mục này cố ý bỏ trống theo cấu hình trích xuất).

## Mục 1 — Scope

### 1.1 Trong phạm vi

- Ví Credit cấp **tổ chức** (1 org 1 ví) với hai số dư: đã chốt trừ (`balance`) và đang tạm giữ (`held`); khả dụng = `balance − held` ✅ [S2] packages/db/src/schema/credit-wallet.ts:17-23, [S1] apps/server/src/routes/credits.ts:38-44.
- Sổ cái sử dụng Credit append-only, idempotent theo khóa UNIQUE ✅ [S2] packages/db/src/schema/credit-wallet.ts:37-71.
- Ba biến đổi ví nguyên tử: reserve (giữ), settle (chốt trừ), release (hoàn) ✅ [S3] apps/server/src/lib/credits/wallet.ts:324-345.
- Hai dịch vụ tiêu Credit: Nhập đề bằng AI (5 Credit/lượt) ✅ [S5] packages/api/src/contracts.ts:4114 và Chấm nháp AI (Writing 1, Speaking 2) ✅ [S5] packages/api/src/contracts.ts:4186-4188.
- Tặng 30 Credit dùng thử khi ví tổ chức được tạo lười ✅ [S3] apps/server/src/lib/credits/wallet.ts:88-93, [S5] packages/api/src/contracts.ts:4117.
- Hạn mức "Chấm nhanh Writing" 30 lượt/tháng (0 Credit) theo tháng dương lịch Việt Nam ✅ [S3] apps/server/src/lib/credits/wallet.ts:156-195, [S5] packages/api/src/contracts.ts:4192.
- Giải tỏa tự động (sweep lười) Credit bị kẹt bởi job/draft chết ✅ [S10] apps/server/src/lib/exam-import/release-stale.ts:30-74, [S14] apps/server/src/lib/ai-grading/release-stale.ts:41-173.
- Xem số dư ví qua API và hai bề mặt UI (badge ví ở màn nhập đề, banner hết Credit ở màn chấm) ✅ [S1] apps/server/src/routes/credits.ts:23-45, [S20] apps/web/src/components/exam-import/credit-cost-badge.tsx:10-31, [S23] apps/web/src/components/grading/ai-draft-panel.tsx:191-250.

### 1.2 Ngoài phạm vi (non-goal, có dấu vết trong code)

- Mua gói tháng / Top-up Credit: không có endpoint hay writer; comment đánh dấu thuộc TOS-42/TOS-43 🟡 [S2] packages/db/src/schema/credit-wallet.ts:24, [S21] apps/web/src/components/exam-import/insufficient-credits-dialog.tsx:10-13 → OQ-1, OQ-3.
- Trần Credit cá nhân theo vai: hook giữ chỗ `assertStaffCap` hiện là no-op, cài đặt thật thuộc TOS-49 ✅ [S3] apps/server/src/lib/credits/wallet.ts:347-355, [S4] apps/server/src/lib/credits/wallet.test.ts:248-250 → OQ-2.
- Ngân hàng liên kết (bank-hub) và học phí: từ khóa "credit" trong `transferType !== "credit"` là **loại giao dịch ngân hàng**, khác hẳn domain Ví Credit — đã kiểm và loại khỏi scope (negative search, xem `reverse-gaps.md` GAP-8).
- Chấm tay của giáo viên (publish/ lưu nháp) không đụng ví ✅ [S14] apps/server/src/lib/ai-grading/release-stale.ts:26-28.

## Mục 2 — Actors

| Actor | Vai với Ví Credit | Bằng chứng |
|---|---|---|
| Teacher / Owner (Chủ trung tâm) | Nhập đề AI (tiêu 5 Credit), retry nhập đề, xem ví; được retry chấm AI | ✅ [S18] packages/auth/src/role.ts:90-101, [S6] apps/server/src/routes/exam-imports.ts:158-162 |
| Admin hệ thống / Class teacher | Được "Thử chấm lại AI" (tiêu Credit org); không được nhập đề AI | ✅ [S18] packages/auth/src/role.ts:105-136, [S15] apps/server/src/routes/grading.ts:1237-1243, [S6] apps/server/src/routes/exam-imports.ts:158-162 |
| TA (trợ giảng) | Chỉ xem ví và kết quả; bị chặn 403 ở hai hành vi tiêu Credit | ✅ [S6] apps/server/src/routes/exam-imports.ts:158-162, [S15] apps/server/src/routes/grading.ts:1237-1243 |
| Học viên | Gián tiếp: nộp bài Writing/Speaking kích hoạt pipeline trừ Credit của tổ chức | ✅ [S34] apps/server/src/routes/student.ts:1961, [S33] apps/server/src/routes/student-quiz.test.ts:1443 |
| Hệ thống (actor kỹ thuật "system") | Toàn bộ biến đổi ví của pipeline chấm AI và sweep ghi sổ với tác nhân kỹ thuật "system" | ✅ apps/server/src/lib/ai-grading/run-grading.ts:67, apps/server/src/lib/credits/wallet.ts:178, [S14] apps/server/src/lib/ai-grading/release-stale.ts:223 |
| Chủ trung tâm (bên nạp) | 🟡 Thông điệp UI yêu cầu liên hệ "Chủ trung tâm hoặc bộ phận quản trị" để nạp Credit, nhưng chưa có luồng trong app | 🟡 [S23] apps/web/src/components/grading/ai-draft-panel.tsx:241-244 → OQ-3 |

Ghi chú: GET ví không có gate vai — mọi thành viên org đọc được ✅ [S1] apps/server/src/routes/credits.ts:14-15, [S7] apps/server/src/routes/exam-imports.test.ts:445-457.

## Mục 3 — Yêu cầu chức năng (FR)

> Cột Priority/Severity toàn bộ là 🟡 (code không nói) — xem OQ-11.

### FR-01 — Xem số dư ví của tổ chức

- Endpoint đọc số dư trả `{balance, held, available}` với `available = balance − held` ✅ [S1] apps/server/src/routes/credits.ts:38-44.
- Response được chuẩn hóa bằng wire schema strict: 3 số nguyên ≥ 0 ✅ [S5] packages/api/src/contracts.ts:4445-4452.
- Chưa đăng nhập → 401 `{"error":"unauthorized"}` ✅ [S1] apps/server/src/routes/credits.ts:24-25.
- Mọi thành viên org đọc được (không gate vai) ✅ [S1] apps/server/src/routes/credits.ts:14-15 🔵 [S7] apps/server/src/routes/exam-imports.test.ts:445-457 (test đăng nhập user "other-org" → 200).
- Kịch bản ví mới: 30/0/30 ✅ [S7] apps/server/src/routes/exam-imports.test.ts:445-457.

### FR-02 — Dọn rác Credit lười khi xem ví

- Trước khi đọc số dư, route chạy cả hai sweep: giải tỏa job import treo và draft chấm AI treo của org ✅ [S1] apps/server/src/routes/credits.ts:27-32.
- Lý do ghi trong code: "xem ví là cơ hội giải tỏa Credit bị giữ bởi job đã chết" (không có cron/Queue) ✅ [S1] apps/server/src/routes/credits.ts:27-30 🔵 [S10] apps/server/src/lib/exam-import/release-stale.ts:17-28, [S14] apps/server/src/lib/ai-grading/release-stale.ts:38-39.
- Chi tiết sweep: FR-18, FR-19.

### FR-03 — Tạo lười ví tặng 30 Credit dùng thử

- Ví tạo lười với số dư khởi tạo 30 Credit, chưa giữ Credit nào ✅ [S3] apps/server/src/lib/credits/wallet.ts:88-93, [S5] packages/api/src/contracts.ts:4117.
- 2 request song song cùng bootstrap chỉ tạo 1 dòng ví (ghi trùng được bỏ qua vô hại) ✅ [S3] apps/server/src/lib/credits/wallet.ts:83-92, [S4] apps/server/src/lib/credits/wallet.test.ts:210-219.
- Được gọi trước mọi lần tiêu: GET ví ✅ [S1] apps/server/src/routes/credits.ts:33, trước reserve nhập đề ✅ [S6] apps/server/src/routes/exam-imports.ts:277, trước reserve chấm AI ✅ [S12] apps/server/src/lib/ai-grading/run-grading.ts:400-403 🔵 (ba call-site cùng mục đích "org chưa có dòng ví → reserve UPDATE trượt 0 dòng").
- Mục tiêu nghiệp vụ của con số 30: code không nói 🟡 → OQ-4.

### FR-04 — Reserve Credit (giữ trước khi làm)

- Điều kiện nguyên tử: chỉ trừ được khi `balance − held ≥ amount`; thắng thì `held += amount` ✅ [S3] apps/server/src/lib/credits/wallet.ts:271-277.
- Ghi sổ: 1 dòng "đã giữ" trừ đúng mức Credit giữ, ghi rõ loại dịch vụ, tham chiếu job/bài gốc ✅ [S3] apps/server/src/lib/credits/wallet.ts:284-293, [S2] packages/db/src/schema/credit-wallet.ts:39-45.
- Thua điều kiện → KHÔNG sinh log, ném lỗi thiếu Credit (mã `E-selfomy-alignment-001`) ✅ [S3] apps/server/src/lib/credits/wallet.ts:311-315, [S3] apps/server/src/lib/credits/wallet.ts:15-22.
- R1: reserve đủ → held tăng, ví không đổi; reserve thiếu → lỗi + ví + log nguyên vẹn ✅ [S4] apps/server/src/lib/credits/wallet.test.ts:75-114.
- R1: 2 reserve song song khi ví chỉ đủ 1 lần → đúng 1 thành công ✅ [S4] apps/server/src/lib/credits/wallet.test.ts:179-208.

### FR-05 — Settle Credit (chốt trừ sau khi dịch vụ thành công)

- Điều kiện: `held ≥ amount`; thắng thì `balance −= amount`, `held −= amount` ✅ [S3] apps/server/src/lib/credits/wallet.ts:278-283.
- Ghi sổ: dòng "đã tính" trừ đúng số Credit đã giữ ✅ [S3] apps/server/src/lib/credits/wallet.ts:284-293.
- R1: sau reserve+settle ví 30 → 25, đúng cặp log `["reserved","settled"]` ✅ [S4] apps/server/src/lib/credits/wallet.test.ts:116-136.

### FR-06 — Release Credit (hoàn khi không còn dùng)

- Điều kiện: `held ≥ amount`; thắng thì chỉ nhả `held −= amount`, `balance` nguyên ✅ [S3] apps/server/src/lib/credits/wallet.ts:271-284.
- Ghi sổ: dòng "đã hoàn" cộng lại đúng số Credit ✅ [S3] apps/server/src/lib/credits/wallet.ts:284-293.
- R1: release sau reserve → ví về nguyên 30, log `["reserved","released"]`; double-release là no-op ✅ [S4] apps/server/src/lib/credits/wallet.test.ts:138-157, [S4] apps/server/src/lib/credits/wallet.test.ts:221-246.

### FR-07 — Nguyên tử ví + sổ cái trong một batch

- Cập nhật ví và ghi log trong 1 lệnh ghi nguyên tử (log chỉ ghi khi cập nhật ví thực sự xảy ra) — ví và sổ không bao giờ lệch nhau ✅ [S3] apps/server/src/lib/credits/wallet.ts:251-317.
- INSERT trùng khóa UNIQUE → cả batch rollback, ví nguyên vẹn ✅ [S3] apps/server/src/lib/credits/wallet.ts:303-309 🔵 [S2] packages/db/src/schema/credit-wallet.ts:44-46, [S2] packages/db/src/schema/credit-wallet.ts:66-69.
- R1 chứng minh trên SQLite thật + migration: ✅ [S4] apps/server/src/lib/credits/wallet.test.ts:31-36.

### FR-08 — Idempotency theo khóa biến đổi

- Khóa: `<actionType>:<refId>:<op>` (lượt gốc) và `<actionType>:<refId>:r<n>:<op>` (chấm lại n ≥ 1) ✅ [S3] apps/server/src/lib/credits/wallet.ts:69-81.
- Khóa uniqueness chống ghi trùng trên sổ cái ✅ [S2] packages/db/src/schema/credit-wallet.ts:65-69, [S28] packages/db/src/migrations/0051_tan_slayback.sql:13.
- Gọi lại cùng khóa → trả đúng kết quả cũ, không giữ thêm ✅ [S3] apps/server/src/lib/credits/wallet.ts:303-309 🔵 [S4] apps/server/src/lib/credits/wallet.test.ts:159-177, [S4] apps/server/src/lib/credits/wallet.test.ts:221-246.
- `retryCount` bị bỏ qua với `exam_import` (giữ khóa cũ) ✅ [S3] apps/server/src/lib/credits/wallet.ts:73-80, [S4] apps/server/src/lib/credits/wallet.test.ts:352-361.

### FR-09 — Phân tách dịch vụ tiêu Credit

- Loại dịch vụ (nhập đề / chấm AI) quyết định cả khóa chống trùng lẫn cột phân loại trong sổ cái ✅ [S3] apps/server/src/lib/credits/wallet.ts:24-26, [S3] apps/server/src/lib/credits/wallet.ts:289-293.
- Cùng `refId` nhưng khác dịch vụ là 2 khóa độc lập ✅ [S4] apps/server/src/lib/credits/wallet.test.ts:253-297.
- Mục đích báo cáo theo loại dịch vụ được ghi trong comment ✅ [S3] apps/server/src/lib/credits/wallet.ts:33-36; API tổng hợp theo loại chưa tồn tại 🟡 → OQ-5.

### FR-10 — Nhập đề bằng AI tiêu 5 Credit

- Giá dịch vụ nhập đề 5 Credit ✅ [S5] packages/api/src/contracts.ts:4114, job ghi giữ 5 Credit ✅ [S30] packages/db/src/schema/exam-import-job.ts:29-30.
- Trình tự: kiểm file → fingerprint → sweep → kiểm trùng → tạo ví + hook trần → INSERT job `processing` → reserve 5 → extract (timeout 120s) → settle → mark `completed` ✅ [S6] apps/server/src/routes/exam-imports.ts:121-130, [S6] apps/server/src/routes/exam-imports.ts:262-330.
- Chỉ vai trong allowlist nhập đề được gọi POST ✅ [S6] apps/server/src/routes/exam-imports.ts:158-162, [S18] packages/auth/src/role.ts:90-101.
- R1 e2e: upload PDF 2 trang, ví 30 → 25, đúng 1 reserved + 1 settled ✅ [S7] apps/server/src/routes/exam-imports.test.ts:265-293, [S26] apps/e2e/specs/ai-exam-import-ac-001.spec.ts:13-54.

### FR-11 — Chặn khi tổ chức thiếu Credit (402)

- Reserve thua → XOÁ job vừa tạo + file R2 (không để job mồ côi), trả 402 với `error: "insufficient credits"`, mã `E-selfomy-alignment-001`, kèm `balance` và `available` hiện tại ✅ [S6] apps/server/src/routes/exam-imports.ts:305-321.
- `available` (không phải `balance`) là số quyết định, kẹp ≥ 0 ✅ [S6] apps/server/src/routes/exam-imports.ts:310-318.
- Không sinh log sổ cái trong nhánh thiếu ✅ [S6] apps/server/src/routes/exam-imports.ts:305-321 🔵 [S7] apps/server/src/routes/exam-imports.test.ts:317-337.
- R1: 402 + job/file/log đều 0 ✅ [S7] apps/server/src/routes/exam-imports.test.ts:317-337.

### FR-12 — Lỗi sau reserve thì hoàn Credit (release)

- Mọi lỗi extract/sau reserve → hoàn Credit (release) + mark job `failed_refunded` (mã E-004, reason timeout/ai_error/empty_result) + 502 ✅ [S6] apps/server/src/routes/exam-imports.ts:121-130, [S8] apps/server/src/lib/exam-import/run-import.ts:245-278.
- Nhóm lỗi được phân loại: `timeout` > `empty_result` > `ai_error` ✅ [S8] apps/server/src/lib/exam-import/run-import.ts (classifyImportError, test tại [S9] apps/server/src/lib/exam-import/run-import.test.ts:127-133), danh sách reason ✅ [S5] packages/api/src/contracts.ts:4180-4185.
- Nhánh hiếm "settle xong mới lỗi": Credit ĐÃ trừ, KHÔNG release, trả `EXAM_IMPORT_FAILED` (có ý tránh nói sai "đã hoàn") ✅ [S8] apps/server/src/lib/exam-import/run-import.ts:226-243 🔵 [S5] packages/api/src/contracts.ts:4263-4267.
- Nuốt đúng `InsufficientCreditsError` khi release trượt (held đã nhả do sweep) để job giữ `processing` cho lần sweep sau ✅ [S8] apps/server/src/lib/exam-import/run-import.ts:268-277.
- R1: extractor lỗi → `failed_refunded`, log released, ví nguyên 30 ✅ [S7] apps/server/src/routes/exam-imports.test.ts:338-394, [S9] apps/server/src/lib/exam-import/run-import.test.ts:135-174, [S9] apps/server/src/lib/exam-import/run-import.test.ts:220-232.

### FR-13 — Trùng đề (fingerprint) thì không mất Credit

- POST kiểm trùng fingerprint trong org TRƯỚC khi tạo ví/INSERT job/giữ Credit → trùng thì trả `{duplicateOf}` 200, không gọi AI, không giữ/trừ Credit ✅ [S6] apps/server/src/routes/exam-imports.ts:265-274.
- R1: upload lại cùng tệp → ví và log không đổi (vẫn ["reserved","settled"] của lần đầu) ✅ [S7] apps/server/src/routes/exam-imports.test.ts:1152-1193.

### FR-14 — Retry nhập đề giữ đúng luật ví

- Chỉ job `failed_refunded` được retry, ngược lại 409 `exam_import_not_retryable` ✅ [S6] apps/server/src/routes/exam-imports.ts:500-506.
- File gốc trên R2 đã mất → 410 `exam_import_file_missing`, không tạo job ảo ✅ [S6] apps/server/src/routes/exam-imports.ts:511-517.
- Retry tạo JOB MỚI, reserve như POST; thiếu Credit → chỉ xoá job mới, GIỮ file cũ ✅ [S6] apps/server/src/routes/exam-imports.ts:519-570.
- R1: retry settle bình thường ✅ [S7] apps/server/src/routes/exam-imports.test.ts:548-576; retry thiếu Credit giữ file cũ, không log mới ✅ [S7] apps/server/src/routes/exam-imports.test.ts:613-639.

### FR-15 — Chấm nháp AI tiêu Credit theo kỹ năng

- Giá: Writing 1, Speaking 2 (Speaking đắt hơn vì chấm phát âm — theo comment) ✅ [S5] packages/api/src/contracts.ts:4184-4189.
- Draft ghi `creditCost` đúng đơn giá ngay khi tạo ✅ [S12] apps/server/src/lib/ai-grading/run-grading.ts:341, [S31] packages/db/src/schema/ai-grading-draft.ts:54-55.
- Pipeline: ensureWallet → reserve → gọi AI (có ngân sách/timeout) → CAS draft sang `ai_drafted` → settle; thua CAS → release (tuyệt đối không settle bằng held của job khác) ✅ [S12] apps/server/src/lib/ai-grading/run-grading.ts:400-440, [S12] apps/server/src/lib/ai-grading/run-grading.ts:528-551.
- Speaking chưa có transcript → `manual_pending` `AI_GRADING_NO_TRANSCRIPT`, KHÔNG reserve ✅ [S12] apps/server/src/lib/ai-grading/run-grading.ts:370-382.
- Bài gộp có phần Writing bỏ trống → chuyển thẳng `manual_pending`, 0 Credit, không reserve/settle ✅ [S12] apps/server/src/lib/ai-grading/run-grading.ts:384-397.
- Kích hoạt: học viên nộp bài xong hẹn chạy nền sau phản hồi ✅ [S34] apps/server/src/routes/student.ts:1961, [S12] apps/server/src/lib/ai-grading/run-grading.ts:553-574.
- R1: thiếu Credit → `manual_pending` E-001, không gọi AI, không log ✅ [S13] apps/server/src/lib/ai-grading/run-grading.test.ts:218-247; org chưa có ví → ensureWallet tạo lười rồi vẫn chấm ✅ [S13] apps/server/src/lib/ai-grading/run-grading.test.ts:387-397; R1 e2e ví giảm đúng 1 Credit sau chấm Writing ✅ [S27] apps/e2e/specs/ai-grading-ac-001.spec.ts:184-208; AI tắt thì nộp bài không sinh log ví ✅ [S33] apps/server/src/routes/student-quiz.test.ts:1443-1500.

### FR-16 — Hết Credit khi chấm AI: hạ cấp "Chấm nhanh Writing"

- Điều kiện hạ cấp: bài Writing + org gói tháng `monthly` còn `active` hoặc `grace_period` ✅ [S12] apps/server/src/lib/ai-grading/run-grading.ts:405-414.
- Hạ cấp: claim 1 lượt Chấm nhanh 0 Credit → draft chuyển sang chế độ Chấm nhanh với chi phí 0 Credit ✅ [S12] apps/server/src/lib/ai-grading/run-grading.ts:414-427.
- Claim thất bại (hết 30 lượt/tháng) → `manual_pending` `E-selfomy-alignment-002` ✅ [S12] apps/server/src/lib/ai-grading/run-grading.ts:419-425.
- Không đúng điều kiện (Speaking, hoặc gói không phải monthly active/grace) → `manual_pending` `E-selfomy-alignment-001` ✅ [S12] apps/server/src/lib/ai-grading/run-grading.ts:429-438.
- R1: gói monthly + ví 0 + đã dùng 29 lượt → bài 30 được chấm quick, ví vẫn 0 ✅ [S13] apps/server/src/lib/ai-grading/run-grading.test.ts:492-537; grace_period vẫn được quick ✅ [S13] apps/server/src/lib/ai-grading/run-grading.test.ts:538-558; đủ 30/30 → E-002, grader không gọi ✅ [S13] apps/server/src/lib/ai-grading/run-grading.test.ts:559-587; expired/Speaking → E-001 ✅ [S13] apps/server/src/lib/ai-grading/run-grading.test.ts:588-614.
- ⚠️ Cảnh báo khả năng kích hoạt: không có bất kỳ writer nào đặt `plan_kind = "monthly"` trong runtime (chỉ test tự UPDATE) — nhánh này hiện không thể tự kích hoạt, xem GAP-1/OQ-1 🟡.

### FR-17 — Hạn mức Chấm nhanh Writing 30 lượt/tháng

- Tối đa 30 lượt dùng Chấm nhanh đã tính trong tháng dương lịch theo múi giờ Việt Nam ✅ [S3] apps/server/src/lib/credits/wallet.ts:156-186, [S5] packages/api/src/contracts.ts:4191-4192, [S32] packages/api/src/vietnam-date.ts:83-93.
- Kiểm hạn mức + ghi sổ trong MỘT câu `INSERT ... SELECT ... WHERE count < 30` nguyên tử — 2 bài nộp đồng thời không vượt 30 ✅ [S3] apps/server/src/lib/credits/wallet.ts:158-195 🔵 [S4] apps/server/src/lib/credits/wallet.test.ts:446-469.
- Idempotent theo `attemptId`: gọi lặp trả `true`, không đếm thêm ✅ [S3] apps/server/src/lib/credits/wallet.ts:171-174, [S4] apps/server/src/lib/credits/wallet.test.ts:400-444.
- Đổi tháng → hạn mức hồi 30 ✅ [S3] apps/server/src/lib/credits/wallet.ts:176-177, [S4] apps/server/src/lib/credits/wallet.test.ts:471-497.
- Hoàn lượt (revert) khi AI lỗi/treo: ghi dòng bù hoàn với mốc thời gian copy từ dòng claim gốc (cặp dòng tính/hoàn triệt tiêu trong cùng tháng kể cả qua giao thừa) ✅ [S3] apps/server/src/lib/credits/wallet.ts:197-233.
- Revert là idempotent; revert attempt chưa từng claim → false, không tặng lượt ✅ [S4] apps/server/src/lib/credits/wallet.test.ts:499-552.

### FR-18 — Sweep job nhập đề treo (>150s)

- Ngưỡng 150s (120s timeout + biên), batch tối đa 20 job/lần ✅ [S10] apps/server/src/lib/exam-import/release-stale.ts:11-15.
- Chọn job `processing` quá hạn của org; nếu có log `settle` (crash sau settle) → mark `completed`, KHÔNG hoàn ✅ [S10] apps/server/src/lib/exam-import/release-stale.ts:35-57.
- Còn lại → hoàn Credit bằng số đang giữ của job + mark `failed_refunded` reason `timeout` ✅ [S10] apps/server/src/lib/exam-import/release-stale.ts:58-73.
- Idempotent nhờ khóa release UNIQUE: sweep nhiều lần/lượt gọi song song chỉ hoàn 1 lần ✅ [S10] apps/server/src/lib/exam-import/release-stale.ts:20-23 🔵 [S7] apps/server/src/routes/exam-imports.test.ts:640-692, [S11] apps/server/src/lib/exam-import/release-stale.test.ts:85-105.
- Gọi tại: POST /exam-imports ✅ [S6] apps/server/src/routes/exam-imports.ts:262, GET /exam-imports/:id ✅ [S6] apps/server/src/routes/exam-imports.ts:381, route retry ✅ [S6] apps/server/src/routes/exam-imports.ts:479, GET /credits/wallet ✅ [S1] apps/server/src/routes/credits.ts:31.

### FR-19 — Sweep draft chấm AI treo (>60s, 3 nhóm)

- Ngưỡng 60s PHẢI lớn hơn toàn bộ ngân sách nền của pipeline (20s/lần gọi, retry 30s) ✅ [S14] apps/server/src/lib/ai-grading/release-stale.ts:8-14.
- Nhóm 1: draft kẹt `ai_processing` → CAS về `manual_pending` TIMEOUT TRƯỚC, rồi release đúng lượt còn `reserved` (per-occasion); kèm revert lượt Chấm nhanh nếu đã claim ✅ [S14] apps/server/src/lib/ai-grading/release-stale.ts:47-96.
- Nhóm 2: draft đã rời `ai_processing` (`ai_drafted`/`manual_pending`) nhưng còn lượt `reserved` chưa giải tỏa (đếm SQL reserved > settled+released) → release giữ nguyên trạng thái draft ✅ [S14] apps/server/src/lib/ai-grading/release-stale.ts:98-135.
- Nhóm 3: draft `manual_pending`/`published` chưa điểm có claim Chấm nhanh chưa revert → revert ✅ [S14] apps/server/src/lib/ai-grading/release-stale.ts:137-172.
- Nguyên tắc "draft trước, ví sau": thua CAS nghĩa là runner còn sống, sweep tuyệt đối không release ✅ [S14] apps/server/src/lib/ai-grading/release-stale.ts:22-25 🔵 [S12] apps/server/src/lib/ai-grading/run-grading.ts:528-551.
- Per-occasion: mỗi lượt (0..retryCount) một bộ khóa; lượt đã settled/released bỏ qua; release lặp là no-op an toàn ✅ [S14] apps/server/src/lib/ai-grading/release-stale.ts:175-230.
- R1: draft quick kẹt >60s → sweep manual_pending + revert lượt ✅ [S13] apps/server/src/lib/ai-grading/run-grading.test.ts:856-878; crash giữa claim và UPDATE grading_mode → sweep vẫn revert ✅ [S13] apps/server/src/lib/ai-grading/run-grading.test.ts:879-905.

### FR-20 — "Thử chấm lại AI" tiêu thêm Credit

- Điều kiện vào: draft `manual_pending` với mã lỗi retryable (`AI_GRADING_TIMEOUT`/`AI_GRADING_FAILED`) ✅ [S15] apps/server/src/routes/grading.ts:1261-1277, [S5] packages/api/src/contracts.ts:4216-4231.
- Chỉ vai `canPublishGrade` (teacher/owner/admin/class_teacher); TA → 403 `AI_RETRY_FORBIDDEN` ✅ [S15] apps/server/src/routes/grading.ts:1237-1243, [S18] packages/auth/src/role.ts:117-135.
- Trước khi reserve lượt mới: giải tỏa mọi lượt cũ còn `reserved` bằng hàm chuyên [S14] (tránh 500 khi sweep đã lấy held) ✅ [S15] apps/server/src/routes/grading.ts:1279-1294.
- CAS `manual_pending → ai_processing` thắng mới hẹn pipeline với `retryCount = cũ + 1`; thua → 409 `E-selfomy-alignment-011`, không reserve ✅ [S15] apps/server/src/routes/grading.ts:1295-1327.
- Đang `ai_processing` → 409; mã không retryable → 409 `DRAFT_NOT_RETRYABLE` ✅ [S15] apps/server/src/routes/grading.ts:1264-1277.
- R1: ai-retry hợp lệ → CAS + `retry_count` 1 + settle bộ r1 ✅ [S16] apps/server/src/routes/grading.test.ts:2507-2539; bấm trùng song song → chỉ 1 pipeline reserve ✅ [S16] apps/server/src/routes/grading.test.ts:2540-2563; draft bị sweep TIMEOUT trước khi kịp reserve → vẫn 200, không 500 ✅ [S16] apps/server/src/routes/grading.test.ts:2564-2587; TA 403 ✅ [S16] apps/server/src/routes/grading.test.ts:2463-2473.

### FR-21 — Trần Credit cá nhân (hook no-op)

- Trần Credit cá nhân theo vai (hook giữ chỗ chờ TOS-49) được gọi trước reserve nhập đề nhưng hiện không làm gì ✅ [S3] apps/server/src/lib/credits/wallet.ts:347-355, [S6] apps/server/src/routes/exam-imports.ts:277-278.
- R1 khẳng định no-op ✅ [S4] apps/server/src/lib/credits/wallet.test.ts:248-250.
- Quy tắc trần thật chưa tồn tại trong code 🟡 → OQ-2.

### FR-22 — UI hiển thị ví và hết Credit

- Badge ở màn nhập đề: "Chi phí: 5 Credit (Tạm giữ)" + "Ví: <balance> Cr"; số dư do route load và fetch lại sau khi job xong, component không tự fetch ✅ [S20] apps/web/src/components/exam-import/credit-cost-badge.tsx:5-31, [S24] apps/web/src/routes/_auth/assignments/tests/import.tsx:114-124, [S24] apps/web/src/routes/_auth/assignments/tests/import.tsx:176-177.
- Nút dẫn vào "Nhập đề bằng AI (5 Credit)" ẩn khi cờ tính năng AI tắt ✅ [S25] apps/web/src/components/exam-import/import-with-ai-button.tsx:9-19, [S25] apps/web/src/components/exam-import/import-with-ai-button.tsx:17.
- POST trả 402 → hộp thoại "Không đủ Credit" hiển thị NGUYÊN VĂN thông điệp E-001, nút "Đóng" + "Soạn đề thủ công" (về `/assignments/tests/new`) ✅ [S21] apps/web/src/components/exam-import/insufficient-credits-dialog.tsx:14-56.
- Màn chấm: draft `manual_pending` với E-001/E-002 → banner lỗi + nút/link "Nạp thêm Credit"; khi chưa có `topUpHref` mở hộp thoại hướng dẫn liên hệ nạp "gói 100 Credit (149.000đ)" ✅ [S23] apps/web/src/components/grading/ai-draft-panel.tsx:136-141, [S23] apps/web/src/components/grading/ai-draft-panel.tsx:191-250.
- Nút "Thử chấm lại AI" chỉ bật cho `manual_pending` TIMEOUT/FAILED (đã hoàn 100% Credit) và vai được retry ✅ [S23] apps/web/src/components/grading/ai-draft-panel.tsx:127-137.
- R1 UI: dialog hiển thị đúng nguyên văn E-001 + điều hướng "Soạn đề thủ công" ✅ [S22] apps/web/src/components/exam-import/insufficient-credits-dialog.test.tsx:32-45.
- Đường dẫn trang nạp Credit chưa được cấu hình ở mọi call-site 🟡 → OQ-3.

### FR-23 — Các thao tác 0 Credit trong cùng feature

- Lưu nháp chỉnh sửa tay (PATCH draft) với chi phí 0 Credit, không ghi thêm log ví ✅ [S19] apps/web/src/lib/repos/exam-imports.ts:256-278, [S7] apps/server/src/routes/exam-imports.test.ts:744-752.
- Publish đề không đổi ví (chỉ job + test) — thấy được qua việc publish không import hàm ví ✅ [S19] apps/web/src/lib/repos/exam-imports.ts:243-254 (kiểu lỗi publish không có nhánh credit).
- Demo sample của giáo viên: draft chèn sẵn với `creditCost: 0`, không chạy pipeline ✅ [S15] apps/server/src/routes/grading.ts:855-879.
## Mục 4 — Yêu cầu phi chức năng (NFR)

> Cột Priority/Severity toàn bộ là 🟡 — xem OQ-11.

### NFR-01 — Toàn vẹn: ví và sổ cái không bao giờ lệch nhau

- Biến đổi ví = 1 lệnh ghi nguyên tử (cập nhật ví có điều kiện + log chỉ ghi khi cập nhật xảy ra); các lệnh chạy tuần tự trong 1 transaction ✅ [S3] apps/server/src/lib/credits/wallet.ts:251-302.
- Trùng khóa idempotency → rollback toàn batch, ví nguyên vẹn ✅ [S3] apps/server/src/lib/credits/wallet.ts:303-309.
- Schema yêu cầu mọi biến đổi đi qua wallet service, không đụng bảng trực tiếp từ route ✅ [S2] packages/db/src/schema/credit-wallet.ts:12-16 🔵 [S3] apps/server/src/lib/credits/wallet.ts:251-262.

### NFR-02 — Sổ cái append-only, truy được nguồn

- KHÔNG update/xoá row sổ cái; mỗi mutation là 1 dòng mới; mỗi dòng gồm org, actor, loại dịch vụ, delta, trạng thái, ref, khóa, thời điểm ✅ [S2] packages/db/src/schema/credit-wallet.ts:37-64.
- Index (org_id, created_at) phục vụ truy vấn lịch sử theo tổ chức ✅ [S2] packages/db/src/schema/credit-wallet.ts:69-70, [S28] packages/db/src/migrations/0051_tan_slayback.sql:11.

### NFR-03 — Bất biến "ví không âm"

- `available = balance − held` luôn ≥ 0 vì mọi biến đổi có guard `balance − held ≥ amount` / `held ≥ amount` ✅ [S1] apps/server/src/routes/credits.ts:14-19 🔵 [S3] apps/server/src/lib/credits/wallet.ts:271-274, [S2] packages/db/src/schema/credit-wallet.ts:12-13.
- Lớp kiểm tra đầu vào từ chối số âm ✅ [S5] packages/api/src/contracts.ts:4445-4452.
- R1: reserve thiếu → giữ nguyên `{balance: 4, held: 0}` ✅ [S4] apps/server/src/lib/credits/wallet.test.ts:97-114.

### NFR-04 — Hiệu năng/độ trễ: sweep giới hạn batch

- Mỗi lần sweep lấy tối đa 20 job/draft "bảo vệ độ trễ của request gọi sweep" ✅ [S10] apps/server/src/lib/exam-import/release-stale.ts:14-15 🔵 [S14] apps/server/src/lib/ai-grading/release-stale.ts:16-17.
- Nhóm 2 sweep chấm AI lọc số học trong SQL để org có >20 draft cũ không làm nghẽn batch ✅ [S14] apps/server/src/lib/ai-grading/release-stale.ts:98-126.

### NFR-05 — Bảo mật/ủy quyền

- Mọi tác vụ chạm ví yêu cầu phiên đăng nhập; thiếu → 401 ✅ [S1] apps/server/src/routes/credits.ts:24-25 🔵 [S6] apps/server/src/routes/exam-imports.ts:157-162, [S15] apps/server/src/routes/grading.ts:721-723.
- Hai allowlist vai tách bạch cho hai hành vi tiêu Credit (import: teacher+owner; retry chấm: teacher/owner/admin/class_teacher) ✅ [S18] packages/auth/src/role.ts:90-101, [S18] packages/auth/src/role.ts:117-135.
- Sweep và đọc ví giới hạn trong org (`orgId` từ phiên) ✅ [S10] apps/server/src/lib/exam-import/release-stale.ts:38-44, [S14] apps/server/src/lib/ai-grading/release-stale.ts:55-61.
- Học viên không chạm kernel API (403 trước khi set context) ✅ [S17] apps/server/src/app.ts:218-235.

### NFR-06 — Phục hồi sau crash (không để Credit kẹt)

- Hai cửa sổ crash của import được xử lý: crash sau settle → completed; crash giữa reserve và settle → sweep hoàn ✅ [S10] apps/server/src/lib/exam-import/release-stale.ts:23-28, [S10] apps/server/src/lib/exam-import/release-stale.ts:53-57.
- Ba cửa sổ crash của chấm AI được liệt kê và xử lý trong sweep ✅ [S14] apps/server/src/lib/ai-grading/release-stale.ts:20-36.
- R1: job treo 151s → GET ví tự hoàn đúng 1 lần; gọi lần 2 không hoàn thêm ✅ [S7] apps/server/src/routes/exam-imports.test.ts:640-692.

### NFR-07 — Thời gian nghiệp vụ theo múi giờ Việt Nam

- Hạn mức tháng tính theo `Asia/Ho_Chi_Minh` (UTC+7), biên 00:00+07:00 ✅ [S3] apps/server/src/lib/credits/wallet.ts:157-162, [S32] packages/api/src/vietnam-date.ts:83-93.
- R1 biên giao thừa: 23:59:59.999+07 và 00:00:00+07 ✅ [S4] apps/server/src/lib/credits/wallet.test.ts:365-378.

### NFR-08 — Thông điệp lỗi "một nguồn chữ"

- Toàn bộ wording lỗi Credit định nghĩa 1 lần trong contracts, web + test cùng đọc ✅ [S5] packages/api/src/contracts.ts:4249-4281 🔵 [S21] apps/web/src/components/exam-import/insufficient-credits-dialog.tsx:47-52, [S23] apps/web/src/components/grading/ai-draft-panel.tsx:73-81, [S22] apps/web/src/components/exam-import/insufficient-credits-dialog.test.tsx:35-38.
- Repo không dùng thư viện i18n (không có catalog JSON/locale trong apps/web — negative search `find apps/web/src -name "*.json" -path "*locale*"` rỗng); "catalog" thực tế là các hằng message này 🟡 → OQ-10.

### NFR-09 — Giới hạn thời gian giữ Credit (held)

- Credit chỉ được giữ trong thời gian có giới hạn: extract tối đa 120s rồi sweep 150s ✅ [S6] apps/server/src/routes/exam-imports.ts:121-130, [S10] apps/server/src/lib/exam-import/release-stale.ts:11-12; chấm AI 20s/lần gọi, sweep 60s ✅ [S14] apps/server/src/lib/ai-grading/release-stale.ts:8-14.
- Mục tiêu nghiệp vụ của trần thời gian này (SLA hiển thị cho user) không được nêu 🟡 → OQ-6.

## Mục 5 — Quy tắc nghiệp vụ (BR)

| BR | Quy tắc | Loại | Bằng chứng |
|---|---|---|---|
| BR-01 | 1 tổ chức có đúng 1 ví (`org_id` là PK) | ✅ | [S2] packages/db/src/schema/credit-wallet.ts:18-19 |
| BR-02 | Khả dụng = `balance − held`, luôn ≥ 0; không cho ví âm | 🔵 | [S1] apps/server/src/routes/credits.ts:16-18; [S3] apps/server/src/lib/credits/wallet.ts:271-274; [S2] packages/db/src/schema/credit-wallet.ts:12-13 |
| BR-03 | Tổ chức mới được tặng 30 Credit dùng thử khi ví được tạo lười | ✅ | [S5] packages/api/src/contracts.ts:4117; [S3] apps/server/src/lib/credits/wallet.ts:88-93; [S7] apps/server/src/routes/exam-imports.test.ts:445-457 |
| BR-04 | Đơn giá tiêu: Nhập đề AI 5; Chấm Writing 1; Chấm Speaking 2 (Speaking đắt hơn vì chấm phát âm) | ✅ | [S5] packages/api/src/contracts.ts:4114; [S5] packages/api/src/contracts.ts:4184-4189 |
| BR-05 | Ví chỉ biến đổi qua wallet service bằng UPDATE có điều kiện trong 1 batch, không đụng bảng trực tiếp từ route | ✅ | [S2] packages/db/src/schema/credit-wallet.ts:12-16; [S3] apps/server/src/lib/credits/wallet.ts:251-317 |
| BR-06 | Sổ cái append-only: mỗi biến đổi 1 dòng mới; reserve −amount, settle −amount, released +amount; không update/xoá | ✅ | [S2] packages/db/src/schema/credit-wallet.ts:38-45; [S3] apps/server/src/lib/credits/wallet.ts:259-261 |
| BR-07 | Khi gói tháng còn hiệu lực mà hết Credit chính, bài Writing được hạ cấp "Chấm nhanh" 0 Credit, tối đa 30 lượt/tháng (tháng dương lịch VN) | ✅ | [S5] packages/api/src/contracts.ts:4191-4192; [S3] apps/server/src/lib/credits/wallet.ts:156-195; [S12] apps/server/src/lib/ai-grading/run-grading.ts:405-427 (⚠️ khả năng kích hoạt: GAP-1/OQ-1) |
| BR-08 | Credit bị giữ bởi job/draft đã chết phải được giải tỏa tự động tại mọi lần chạm ví/hàng chờ (lazy sweep, không cron) | 🔵 | [S10] apps/server/src/lib/exam-import/release-stale.ts:17-28; [S14] apps/server/src/lib/ai-grading/release-stale.ts:38-39; [S1] apps/server/src/routes/credits.ts:27-32; [S6] apps/server/src/routes/exam-imports.ts:260-262 |
| BR-09 | Chỉ teacher/owner được tiêu Credit nhập đề; chỉ teacher/owner/admin/class_teacher được retry chấm AI; TA chỉ xem | ✅ | [S18] packages/auth/src/role.ts:90-141; [S6] apps/server/src/routes/exam-imports.ts:158-162; [S15] apps/server/src/routes/grading.ts:1237-1243 |
| BR-10 | Đề trùng fingerprint trong org → xử lý 0 Credit tuyệt đối (không tạo job, không reserve, kể cả khi client bỏ qua lookup) | ✅ | [S6] apps/server/src/routes/exam-imports.ts:265-274; [S7] apps/server/src/routes/exam-imports.test.ts:1152-1193 |
| BR-11 | Credit ĐÃ settle là sự thật sổ cái: job crash sau settle phải `completed`, tuyệt đối không hoàn | 🔵 | [S10] apps/server/src/lib/exam-import/release-stale.ts:23-28; [S8] apps/server/src/lib/exam-import/run-import.ts:226-243; [S7] apps/server/src/routes/exam-imports.test.ts:693-743 |
| BR-12 | Thông điệp lỗi Credit lấy nguyên văn từ một nguồn chữ dùng chung web + test | ✅ | [S5] packages/api/src/contracts.ts:4249-4281; [S21] apps/web/src/components/exam-import/insufficient-credits-dialog.tsx:47-52 |
| BR-13 | Gói tổ chức (kind/status) được đọc từ ví và chuẩn hóa an toàn: giá trị lạ → `none`/`null` | ✅ | [S3] apps/server/src/lib/credits/wallet.ts:108-146 |
| BR-14 | Nghiệp vụ mua/nạp gói (trial/monthly, Top-up FEFO) ngoài phạm vi hiện tại, đánh dấu cho TOS-42/TOS-49 | 🟡 | [S2] packages/db/src/schema/credit-wallet.ts:24-27; [S3] apps/server/src/lib/credits/wallet.ts:347-355 → OQ-1, OQ-2 |

## Mục 6 — Ma trận lỗi (wording nguyên văn đã resolve)

> R2: repo KHÔNG dùng i18n catalog; câu chữ lỗi nằm trong hằng số `packages/api/src/contracts.ts` ("một nguồn chữ cho web + test"). Mỗi dòng dưới đây trích NGUYÊN VĂN từ catalog và cite cả throw-site lẫn catalog.

| Mã | Bề mặt | HTTP/hiển thị | Điều kiện | Thông điệp nguyên văn | Bằng chứng |
|---|---|---|---|---|---|
| E-selfomy-alignment-001 | Nhập đề AI | 402 | Reserve thua (thiếu Credit) | `error: "insufficient credits"` trên wire; UI hiển thị: "Tổ chức của bạn đã dùng hết Credit AI trong kỳ. Vui lòng mua thêm gói 100 Credit (149.000đ) hoặc nâng cấp gói tháng để tiếp tục sử dụng tính năng này." | ✅ [S6] apps/server/src/routes/exam-imports.ts:305-321; [S5] packages/api/src/contracts.ts:4136-4138; [S5] packages/api/src/contracts.ts:4274-4276 |
| E-selfomy-alignment-001 | Draft chấm AI | banner màn chấm | Reserve thua, không đủ điều kiện Chấm nhanh | "Tổ chức của bạn đã dùng hết Credit AI trong kỳ. Vui lòng mua thêm gói 100 Credit (149.000đ) hoặc nâng cấp gói tháng để tiếp tục sử dụng tính năng này." | ✅ [S12] apps/server/src/lib/ai-grading/run-grading.ts:429-438; [S5] packages/api/src/contracts.ts:4206-4207; [S5] packages/api/src/contracts.ts:4256-4257; [S23] apps/web/src/components/grading/ai-draft-panel.tsx:73-81 |
| E-selfomy-alignment-002 | Draft chấm AI | banner màn chấm | Hết cả Credit chính lẫn 30 lượt Chấm nhanh trong tháng | "Bạn đã sử dụng hết hạn mức Credit AI và 30 lượt chấm nhanh Writing hỗ trợ thêm trong tháng này. Vui lòng nạp thêm Credit để tiếp tục chấm tự động." | ✅ [S12] apps/server/src/lib/ai-grading/run-grading.ts:419-425; [S5] packages/api/src/contracts.ts:4208-4209; [S5] packages/api/src/contracts.ts:4258-4259 |
| E-selfomy-alignment-003 | Nhập đề AI | 400 | File sai MIME / quá 15 MB / quá 20 trang / có mật khẩu — trước khi giữ Credit | "Tệp tải lên vượt quá giới hạn cho phép (tối đa 20 trang, 15 MB, định dạng PDF/PNG/JPG không khóa mật khẩu). Vui lòng tách nhỏ hoặc đổi tệp khác." | ✅ [S5] packages/api/src/contracts.ts:4139-4140; [S5] packages/api/src/contracts.ts:4277-4278; [S7] apps/server/src/routes/exam-imports.test.ts:459-522 |
| E-selfomy-alignment-004 | Nhập đề AI | 502 | AI lỗi/timeout/0 nhóm câu hỏi hợp lệ — Credit ĐÃ hoàn | "Hệ thống AI đang phản hồi chậm hoặc không đọc được cấu trúc tệp này. Số Credit tạm giữ đã được hoàn lại đầy đủ vào ví của bạn. Vui lòng thử lại sau." | ✅ [S6] apps/server/src/routes/exam-imports.ts:109-118; [S5] packages/api/src/contracts.ts:4142-4143; [S5] packages/api/src/contracts.ts:4279-4280 |
| E-selfomy-alignment-004 | Draft chấm AI | banner + nút retry | AI lỗi đủ 2 lần tự thử lại (TIMEOUT/FAILED) — Credit đã hoàn 100% | "Hệ thống AI đang phản hồi chậm hoặc không đọc được cấu trúc tệp này. Số Credit tạm giữ đã được hoàn lại đầy đủ vào ví của bạn. Vui lòng thử lại sau." | ✅ [S5] packages/api/src/contracts.ts:4237-4241; [S23] apps/web/src/components/grading/ai-draft-panel.tsx:127-135 |
| EXAM_IMPORT_FAILED | Nhập đề AI | 502 | Settle xong mới lỗi ghi job — Credit ĐÃ trừ, KHÔNG hoàn | Cố ý KHÔNG có thông điệp E-004 "vì sẽ nói sai sự thật" (không mục từ điển cho mã này) | ✅ [S8] apps/server/src/lib/exam-import/run-import.ts:226-243; [S5] packages/api/src/contracts.ts:4145-4146; [S5] packages/api/src/contracts.ts:4263-4267 |
| (không mã) | Xem ví / mọi route kernel | 401 | Chưa đăng nhập | `{"error":"unauthorized"}` | ✅ [S1] apps/server/src/routes/credits.ts:24-25 |
| exam_import_not_retryable | Retry nhập đề | 409 | Job không ở `failed_refunded` | `error: "exam import job is not retryable"` | ✅ [S6] apps/server/src/routes/exam-imports.ts:500-506; [S5] packages/api/src/contracts.ts:4149 |
| exam_import_file_missing | Retry nhập đề | 410 | File gốc trên R2 đã mất | `error: "exam import file missing"` | ✅ [S6] apps/server/src/routes/exam-imports.ts:511-517; [S5] packages/api/src/contracts.ts:4151 |
| AI_RETRY_FORBIDDEN | Retry chấm AI | 403 | Vai không trong allowlist publish (vd TA) | `error: "ai retry forbidden"` | ✅ [S15] apps/server/src/routes/grading.ts:1237-1243; [S16] apps/server/src/routes/grading.test.ts:2463-2473 |
| E-selfomy-alignment-011 | Retry chấm AI / PATCH draft | 409 | Xung đột CAS (đang xử lý / lưu đè) | "Bài làm này vừa được cập nhật bởi một nhân sự khác hoặc đang trong tiến trình chấm AI. Vui lòng tải lại dữ liệu mới nhất trước khi lưu." | ✅ [S15] apps/server/src/routes/grading.ts:1264-1272, 1310-1316; [S5] packages/api/src/contracts.ts:4242-4245 |
| AI_GRADING_TIMEOUT / AI_GRADING_FAILED / AI_GRADING_DISABLED / AI_GRADING_NO_TRANSCRIPT | Draft chấm AI | trạng thái draft | Timeout 20s / kết quả sai / binding tắt / Speaking không transcript — Timeout/FAILED: Credit đã hoàn | (mã kỹ thuật trên draft, UI map qua `aiDraftErrorLabel`) | ✅ [S5] packages/api/src/contracts.ts:4196-4209; [S12] apps/server/src/lib/ai-grading/run-grading.ts:368-382, 520-526 |

Lỗi ánh xạ 402 kèm dữ liệu ví có cấu trúc: `examImportErrorSchema` (`error`, `code`, `reason?`, `jobId?`, `balance?`, `available?`) ✅ [S5] packages/api/src/contracts.ts:4284-4291.

## Mục 7 — Chỉ số thành công (Success Metrics)

- Code không định nghĩa KPI/metric nghiệp vụ cho ví (không có bảng metric, dashboard, hay counter) 🟡 → OQ-7.
- Kết quả đo được từ test/e2e (chỉ là kỳ vọng hành vi, không phải mục tiêu KPI): ví tổ chức mới = 30/0/30 ✅ [S7] apps/server/src/routes/exam-imports.test.ts:445-457; sau 1 import thành công = 25/0/25 ✅ [S7] apps/server/src/routes/exam-imports.test.ts:278-286; sau 1 chấm Writing = 29 ✅ [S27] apps/e2e/specs/ai-grading-ac-001.spec.ts:184-208; job treo được hoàn đúng 1 lần ✅ [S7] apps/server/src/routes/exam-imports.test.ts:640-692.
- Sổ cái đủ dữ liệu để tự tính báo cáo theo loại dịch vụ (nhập đề/chấm AI/chấm nhanh writing) ✅ [S2] packages/db/src/schema/credit-wallet.ts:53-54 — nhưng chưa có API/tính năng báo cáo nào đọc nó 🟡 → OQ-5.

## Mục 8 — Thực thể nghiệp vụ (business-level)

- **Ví Credit của tổ chức** — 1 org 1 ví; số dư đã chốt trừ; số đang tạm giữ; khả dụng = trừ; gói hiện tại + trạng thái gói ✅ [S2] packages/db/src/schema/credit-wallet.ts:17-35.
- **Sổ cái sử dụng Credit** — dòng append-only của mỗi biến đổi: ai (actor), dịch vụ nào (loại), bao nhiêu (delta có dấu), trạng thái giao dịch, gắn với job/attempt nào, khóa chống chạy đúp ✅ [S2] packages/db/src/schema/credit-wallet.ts:47-71.
- **Giao dịch 3 pha** (reserve → settle | release) — vòng đời biến đổi của một lượt tiêu Credit, nhận diện bằng khóa `<dịch vụ>:<ref>:<bước>` ✅ [S3] apps/server/src/lib/credits/wallet.ts:69-81, 251-317.
- **Lượt Chấm nhanh Writing** — đối tượng hạn mức 30/tháng, ghi sổ với delta 0 và cặp settled/reverted ✅ [S3] apps/server/src/lib/credits/wallet.ts:148-233.
- **Job nhập đề** (thực thể liên quan) — mang 5 Credit giữ chỗ, vòng đời processing/completed/failed_refunded ✅ [S30] packages/db/src/schema/exam-import-job.ts:29-32.
- **Bản nháp chấm AI** (thực thể liên quan) — mang chi phí (1/2/0), chế độ standard/quick, số lần thử cho khóa sổ cái ✅ [S31] packages/db/src/schema/ai-grading-draft.ts:41-67.
- **Gói tổ chức** — kind "none" | "trial" | "monthly", status "active" | "grace_period" | "expired"; hiện chỉ có reader, không có writer 🟡 [S3] apps/server/src/lib/credits/wallet.ts:57-65, 129-146; [S29] packages/db/src/migrations/0055_premium_blazing_skull.sql:1 → OQ-1.

## Mục 9 — Danh sách luồng (xem `srs/credits-reverse-flows.md`)

| F-id | Tên luồng | Trigger | Kết quả |
|---|---|---|---|
| F1 | Xem ví + dọn rác lười | Thành viên mở số dư | 200 {balance, held, available}; ví tạo lười 30 |
| F2 | Nhập đề AI — thành công (trừ 5 Credit) | Teacher POST file | Job completed; ví −5; [reserved, settled] |
| F3 | Nhập đề AI — thiếu Credit | Teacher POST khi ví không đủ | 402 E-001; job + file bị xóa; không log |
| F4 | Nhập đề AI — lỗi sau reserve | AI lỗi/timeout/0 câu | 502 E-004; Credit hoàn; job failed_refunded |
| F5 | Retry nhập đề | Teacher bấm thử lại | Job mới + reserve lại; guard 409/410 |
| F6 | Sweep job import treo | Bất kỳ request chạm ví/job | Job >150s: hoàn Credit + failed_refunded(timeout), hoặc completed nếu đã settle |
| F7 | Chấm AI — đủ Credit | Học viên nộp Writing/Speaking | Draft ai_drafted; settle −cost |
| F8 | Chấm AI — hết Credit → Chấm nhanh Writing | Org gói tháng hết Credit | Claim ≤30/tháng 0 Credit; hết quota → E-002; không đủ điều kiện → E-001 |
| F9 | Chấm AI — AI lỗi | AI timeout/kết quả sai | Release/revert lượt; draft manual_pending |
| F10 | Sweep draft chấm AI treo | Request chạm ví/hàng chờ | 3 nhóm: CAS manual_pending + release per-occasion + revert quick |
| F11 | Thử chấm lại AI | Vai được publish bấm retry | Release lượt cũ còn treo → reserve bộ r<n> |
| F12 | Trùng đề — 0 Credit | POST file trùng fingerprint | 200 {duplicateOf}; không gọi AI, không đụng ví |

## Mục 10 — Màn hình (Screens)

- **Màn "Nhập đề bằng AI"** (`/assignments/tests/import`): PageHead kèm `CreditCostBadge` (giá 5 Credit + số dư ví); nộp file; hộp thoại "Không đủ Credit" khi 402; refresh ví sau khi job xong ✅ [S24] apps/web/src/routes/_auth/assignments/tests/import.tsx:363, [S24] apps/web/src/routes/_auth/assignments/tests/import.tsx:379-382, [S20] apps/web/src/components/exam-import/credit-cost-badge.tsx:10-31.
- **PageHead "Full test mới"**: nút "Nhập đề bằng AI (5 Credit)" dẫn sang màn import; ẩn khi flag AI tắt ✅ [S25] apps/web/src/components/exam-import/import-with-ai-button.tsx:9-19.
- **Màn chấm bài (panel nháp AI)**: banner lỗi hết Credit (E-001/E-002) + nút "Nạp thêm Credit" + hộp thoại hướng dẫn nạp; khối E-004 với nút "Thử chấm lại AI" ✅ [S23] apps/web/src/components/grading/ai-draft-panel.tsx:191-260.
- Không có màn hình quản trị ví/nạp Credit trong web 🟡 → OQ-3 (negative search: `grep -rln "credit" apps/web/src` trả 7 file — 6 hiển thị nêu trên + import.test.tsx).

## Mục 11 — Ràng buộc (Constraints)

- Nền tảng Cloudflare Workers + D1; KHÔNG có cron/Queue → mọi dọn rác phải là sweep lười gắn vào request ✅ [S10] apps/server/src/lib/exam-import/release-stale.ts:17-19, [S14] apps/server/src/lib/ai-grading/release-stale.ts:38-39.
- D1 batch chạy tuần tự trong 1 transaction — exploited cho nguyên tử ví+log ✅ [S3] apps/server/src/lib/credits/wallet.ts:251-262.
- Sổ cái append-only + UNIQUE idempotency key là ràng buộc thiết kế cứng ✅ [S2] packages/db/src/schema/credit-wallet.ts:37-46, 65-69.
- POST nhập đề nhận RAW BODY (không multipart), MIME qua Content-Type, tên file qua header `X-File-Name` ✅ [S6] apps/server/src/routes/exam-imports.ts:121-124.
- Wire contract strict (Zod `.strict()`), mọi response parse lại ở client ✅ [S5] packages/api/src/contracts.ts:4445-4452, [S19] apps/web/src/lib/repos/exam-imports.ts:221-231.
- Múi giờ nghiệp vụ VN (`Asia/Ho_Chi_Minh`) cho hạn mức tháng ✅ [S32] packages/api/src/vietnam-date.ts:83-93.
- UI điều kiện theo cờ tính năng AI (biến môi trường build) ✅ [S25] apps/web/src/components/exam-import/import-with-ai-button.tsx:11, apps/web/src/lib/features.ts:9.

## Mục 12 — Câu hỏi mở (OQ)

1. OQ-1: Ai/luồng nào sẽ ghi `plan_kind = "monthly"/"trial"` và `plan_status`? Hiện không có writer trong repo (negative search — xem GAP-1). Liệu Chấm nhanh Writing (BR-07, FR-16) có phải tính năng "chờ gói tháng" chưa ship?
2. OQ-2: Trần Credit cá nhân (US-010/TOS-49) — ngưỡng, theo vai, hành vi khi chạm trần là gì? Code chỉ có hook no-op.
3. OQ-3: Luồng nạp Credit thật (mua gói 100 Credit 149.000đ / Top-up) nằm ở đâu — ngoài app, hay chưa xây? Mọi wording UI đều hướng người dùng đi nạp nhưng không có đường dẫn (`topUpHref` không có call-site cấu hình).
4. OQ-4: Con số 30 Credit dùng thử (và hạn mức 30 lượt Chấm nhanh) dựa trên mục tiêu nghiệp vụ gì?
5. OQ-5: Báo cáo tiêu Credit theo `action_type` (exam_import vs ai_grading) — ai là consumer? Comment ghi "TOS-42 báo cáo theo loại" nhưng chưa thấy tính năng.
6. OQ-6: SLA mong muốn cho thời gian giữ Credit (held) — 150s/60s hiện là biên kỹ thuật; business có yêu cầu hiển thị "đang tạm giữ" cho user?
7. OQ-7: KPI của feature ví (tỷ lệ chuyển đổi dùng thử → nạp, tiêu trung bình/org/tháng) là gì? Code không đo.
8. OQ-8: Có cần log/monitoring riêng cho hoạt động sweep (hiện chỉ console.error ở một vài nhánh pipeline)?
9. OQ-9: Hành vi mong muốn khi dữ liệu ví bị sửa tay ra ngoài bất biến (held > balance): hiện route GET sẽ nổ Zod parse (available âm → 500). Có cần tự vệ thêm không?
10. OQ-10: Wording E-001 dùng chung cho nhập đề và chấm AI đều nói "Credit AI trong kỳ" và "nâng cấp gói tháng" — có chủ ý khi gói tháng chưa có luồng mua không?
11. OQ-11: Priority/Severity của từng FR/NFR — code không mang thông tin này, cần chủ sản phẩm xác nhận.
12. OQ-12: "Trial" là giá trị kind hợp lệ nhưng không có logic nào gắn/khai thác nó ngoài việc nằm trong allowlist đọc — trial có phải luồng riêng tương lai?
