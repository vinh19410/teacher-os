# Bằng chứng nghịch đảo — feature credits (toàn bộ cite `path:line` đầy đủ)

## §Endpoints

- GET /api/credits/wallet (đọc ví, mọi thành viên org, 401 khi thiếu phiên): apps/server/src/routes/credits.ts:23-45; 401 tại :25; sweep tại :31-32; ensureWallet :33; readWallet :34-37; parse+available :38-44. Gắn vào app: apps/server/src/app.ts:476 (`app.route("/api", creditRoutes(deps))`).
- POST /api/exam-imports (tiêu 5 Credit): apps/server/src/routes/exam-imports.ts:156-344; gate vai :158-162; dedupe :265-274; ensureWallet+staffCap :277-278; INSERT job :280-292; reserve :295-304; nhánh 402 :305-321.
- GET /api/exam-imports/:id (xem kết quả + sweep): apps/server/src/routes/exam-imports.ts:377-404 (sweep :381).
- POST /api/exam-imports/:id/retry (reserve lại): apps/server/src/routes/exam-imports.ts:458-570; guard 409 :500-506; guard 410 :511-517; ensure+cap :523-524; reserve :546-552; 402 :553-570.
- GET /api/exam-imports/lookup (tra trùng, 0 Credit): apps/server/src/routes/exam-imports.ts:348-374.
- POST /api/grading/:attemptId/ai-retry (tiêu Credit lượt r<n>): apps/server/src/routes/grading.ts:1235-1339; 403 :1237-1243; 409 :1264-1272, 1310-1316; releaseUnsettledOccasions :1285-1293; CAS+schedule :1295-1327.
- POST /api/grading/demo-sample + DELETE (0 Credit): apps/server/src/routes/grading.ts:732-882 (creditCost: 0 tại :857, :872).
- Điểm kích hoạt chấm AI (phía học viên): apps/server/src/routes/student.ts:1961 (`void scheduleAiGrading(deps, attemptId)`).

## §Validation

- Wire schema ví (strict, int ≥ 0): packages/api/src/contracts.ts:4445-4452.
- Lỗi ví có cấu trúc (balance/available nullish int): packages/api/src/contracts.ts:4284-4291.
- Guard UPDATE có điều kiện: apps/server/src/lib/credits/wallet.ts:271-274 (`balance - held >= amount` cho reserve; `held >= amount` cho settle/release).
- Bắt lỗi thiếu Credit theo instance class: apps/server/src/routes/exam-imports.ts:307, 553; apps/server/src/lib/ai-grading/run-grading.ts:405.
- Class lỗi nghiệp vụ + mã: apps/server/src/lib/credits/wallet.ts:15-22 (`E-selfomy-alignment-001`).
- Validate file TRƯỚC khi giữ Credit (MIME/size/pages/password): packages/api/src/contracts.ts:4121-4134, 4170-4175; test apps/server/src/routes/exam-imports.test.ts:459-522.

## §Errors

- 402 thiếu Credit (nhập đề): apps/server/src/routes/exam-imports.ts:305-321 — body `error: "insufficient credits"`, `code: E-selfomy-alignment-001`, `balance`, `available` (kẹp ≥0 :316-317).
- 401 chưa đăng nhập: apps/server/src/routes/credits.ts:25; apps/server/src/routes/exam-imports.ts:158.
- 403 vai: apps/server/src/routes/exam-imports.ts:158-162 (`forbidden`); apps/server/src/routes/grading.ts:1237-1243 (`AI_RETRY_FORBIDDEN`).
- 409 retry không hợp lệ: apps/server/src/routes/exam-imports.ts:500-506; apps/server/src/routes/grading.ts:1264-1277.
- 410 file mất: apps/server/src/routes/exam-imports.ts:511-517.
- 502 E-004 (đã hoàn Credit): apps/server/src/routes/exam-imports.ts:109-118 (helper map); packages/api/src/contracts.ts:4142-4143, 4279-4280.
- 502 EXAM_IMPORT_FAILED (KHÔNG hoàn, cố ý không có message E-004): apps/server/src/lib/exam-import/run-import.ts:226-243; packages/api/src/contracts.ts:4263-4267.
- E-001/E-002 trên draft chấm AI: apps/server/src/lib/ai-grading/run-grading.ts:419-438; message: packages/api/src/contracts.ts:4251-4260; UI map: apps/web/src/components/grading/ai-draft-panel.tsx:73-81, 136-141.
- E-011 xung đột: apps/server/src/routes/grading.ts:1310-1316; message: packages/api/src/contracts.ts:4242-4245.

## §Business Rules

- 1 org 1 ví: packages/db/src/schema/credit-wallet.ts:18-19.
- Khả dụng = balance − held ≥ 0: apps/server/src/routes/credits.ts:16-18; guard apps/server/src/lib/credits/wallet.ts:271-274.
- Tặng 30 Credit dùng thử: packages/api/src/contracts.ts:4117; apps/server/src/lib/credits/wallet.ts:88-93.
- Đơn giá 5 / 1 / 2: packages/api/src/contracts.ts:4114, 4186-4188.
- Ví chỉ đổi qua service: packages/db/src/schema/credit-wallet.ts:12-16.
- Sổ cái append-only + quy ước dấu: packages/db/src/schema/credit-wallet.ts:38-45; apps/server/src/lib/credits/wallet.ts:259-261.
- Idempotency key format + retry suffix: apps/server/src/lib/credits/wallet.ts:69-81.
- Chấm nhanh 30/tháng theo giờ VN: packages/api/src/contracts.ts:4191-4192; apps/server/src/lib/credits/wallet.ts:156-195; packages/api/src/vietnam-date.ts:83-93.
- Revert copy `created_at` từ claim (triệt tiêu trong tháng): apps/server/src/lib/credits/wallet.ts:197-233.
- Sweep import 150s/batch 20: apps/server/src/lib/exam-import/release-stale.ts:11-15.
- Sweep grading 60s, "draft trước ví sau", per-occasion: apps/server/src/lib/ai-grading/release-stale.ts:8-39, 175-230.
- Crash-sau-settle import → completed, không hoàn: apps/server/src/lib/exam-import/release-stale.ts:53-57; apps/server/src/lib/exam-import/run-import.ts:226-243.
- Trùng fingerprint 0 Credit: apps/server/src/routes/exam-imports.ts:265-274.
- Allowlist vai: packages/auth/src/role.ts:90-141.
- Trần cá nhân no-op: apps/server/src/lib/credits/wallet.ts:347-355.

## §Entities

- credit_wallet (org_id PK, balance, held, plan_kind, plan_status, created_at, updated_at): packages/db/src/schema/credit-wallet.ts:17-35; migration 0051: packages/db/src/migrations/0051_tan_slayback.sql:15-21; migration 0055 (plan_kind/plan_status): packages/db/src/migrations/0055_premium_blazing_skull.sql:1.
- credit_usage_log (id PK, org_id, actor_user_id, action_type, credit_delta, tx_status, ref_id, idempotency_key UNIQUE, created_at): packages/db/src/schema/credit-wallet.ts:47-71; migration 0051:1-11.
- exam_import_job (held_credits default 5, import_status processing|completed|failed_refunded): packages/db/src/schema/exam-import-job.ts:29-32.
- ai_grading_draft (credit_cost, grading_mode standard|quick, retry_count, status 5 trạng thái): packages/db/src/schema/ai-grading-draft.ts:16-67.
- Liên kết app-level: credit_wallet.org_id và credit_usage_log.org_id KHÔNG có FK DB (chỉ text) — packages/db/src/schema/credit-wallet.ts:19, 51; ngược lại ai_grading_draft có FK thật tới organization/quiz_attempt — packages/db/src/schema/ai-grading-draft.ts:24-29.

## §Cross-repo hops

- packages/api (contracts) → apps/server (routes/libs dùng hằng + schema parse) → packages/db (schema/migrations) → apps/web (client đọc cùng hằng) — ví dụ hằng giá: packages/api/src/contracts.ts:4114 dùng tại apps/server/src/routes/exam-imports.ts:278 và apps/web/src/components/exam-import/credit-cost-badge.tsx:17.
- packages/auth/role.ts → gate tiêu Credit tại 2 route: apps/server/src/routes/exam-imports.ts:160; apps/server/src/routes/grading.ts:1238.
- packages/api/vietnam-date.ts → hạn mức tháng: apps/server/src/lib/credits/wallet.ts:5, 177.
- apps/web repos → GET ví: apps/web/src/lib/repos/exam-imports.ts:221-231.
- e2e gọi API thật: apps/e2e/specs/ai-grading-ac-001.spec.ts:204-208 (GET /api/credits/wallet).

## §Gaps (tóm tắt — chi tiết ở reverse-gaps.md)

- Không writer cho plan_kind/plan_status (dead-path Chấm nhanh): duy nhất default "none" packages/db/src/schema/credit-wallet.ts:25 và ALTER 0055; test tự UPDATE apps/server/src/lib/credits/wallet.test.ts:390-393.
- assertStaffCap rỗng: apps/server/src/lib/credits/wallet.ts:352-355.
- Không trang/i18n/monitoring: negative-search ghi trong reverse-gaps.md (GAP-3, GAP-4, GAP-6, OQ-7/8).
- "credit" của bank-hub là transferType ngân hàng: apps/server/src/lib/payments/ingest-transaction.ts:58 — khác domain.
