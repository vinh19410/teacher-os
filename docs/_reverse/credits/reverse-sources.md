# Nguồn nghịch đảo — feature credits (repo @ d6c0f6b5, nhánh develop)

> S-id liên tục S1..S34. Mọi `[S<n>]` trong `credits-reverse-spec.md` và `_evidence.md` resolve về bảng này. Độ tin cậy tính theo mức code xác nhận trực tiếp hành vi được đặc tả.

| S-id | path | loại | range (dòng) | confidence | encoding | ghi chú |
|---|---|---|---|---|---|---|
| S1 | apps/server/src/routes/credits.ts | route (Hono) | 1-48 (48 dòng) | cao | utf-8, tab | GET /api/credits/wallet; gắn tại /api trong app.ts:476 |
| S2 | packages/db/src/schema/credit-wallet.ts | schema Drizzle | 1-71 (71 dòng) | cao | utf-8, tab | credit_wallet + credit_usage_log; UNIQUE idempotency |
| S3 | apps/server/src/lib/credits/wallet.ts | service | 1-355 (355 dòng) | cao | utf-8, tab | Toàn bộ biến đổi ví; quick grade; readOrgPlan; assertStaffCap |
| S4 | apps/server/src/lib/credits/wallet.test.ts | test unit (vitest) | 1-553 (553 dòng) | cao | utf-8, tab | SQLite in-memory + migration thật (R1) |
| S5 | packages/api/src/contracts.ts | contract + hằng số + messages | 4109-4292, 4443-4452 (file 4799 dòng) | cao | utf-8, tab | Nguồn chữ lỗi (thay i18n catalog); creditWalletSchema |
| S6 | apps/server/src/routes/exam-imports.ts | route consumer | 1-778 (778 dòng) | cao | utf-8, tab | Đoạn credit: 121-130, 155-344, 458-570 |
| S7 | apps/server/src/routes/exam-imports.test.ts | test tích hợp | 1-1238 (1238 dòng) | cao | utf-8, tab | R1: happy path, 402, sweep qua GET ví, dedupe |
| S8 | apps/server/src/lib/exam-import/run-import.ts | service extract | 150-305 (305 dòng) | cao | utf-8, tab | settle trước mark completed; release trong catch |
| S9 | apps/server/src/lib/exam-import/run-import.test.ts | test unit | 1-319 (319 dòng) | cao | utf-8, tab | R1: timeout release, muộn không settle, settle+mark |
| S10 | apps/server/src/lib/exam-import/release-stale.ts | sweep | 1-99 (99 dòng) | cao | utf-8, tab | Ngưỡng 150s, batch 20, crash-sau-settle |
| S11 | apps/server/src/lib/exam-import/release-stale.test.ts | test unit | 1-106 (106 dòng) | cao | utf-8, tab | R1 sweep import |
| S12 | apps/server/src/lib/ai-grading/run-grading.ts | pipeline nền | 1-574 (574 dòng) | cao | utf-8, tab | reserve/quick-claim/settle/CAS/release |
| S13 | apps/server/src/lib/ai-grading/run-grading.test.ts | test unit | 1-1270 (1270 dòng) | cao | utf-8, tab | R1: E-001, quick grade, sweep quick |
| S14 | apps/server/src/lib/ai-grading/release-stale.ts | sweep | 1-230 (230 dòng) | cao | utf-8, tab | 3 nhóm + releaseUnsettledOccasions |
| S15 | apps/server/src/routes/grading.ts | route | 1-1471 (1471 dòng) | cao | utf-8, tab | ai-retry 1235-1339; sweep tại GET 720-730, 946-956 |
| S16 | apps/server/src/routes/grading.test.ts | test tích hợp | 1-2688 (2688 dòng) | cao | utf-8, tab | R1 ai-retry + demo-sample |
| S17 | apps/server/src/app.ts | bootstrap app | 190-310, 476 (481 dòng) | cao | utf-8, tab | bootstrapMiddleware (org/role), gắn creditRoutes |
| S18 | packages/auth/src/role.ts | role gate | 90-141 (177 dòng) | cao | utf-8, tab | canImportExam / canPublishGrade / canReviewGrade |
| S19 | apps/web/src/lib/repos/exam-imports.ts | API client (web) | 200-260 (347 dòng) | cao | utf-8 | fetchCreditWallet; retry; draft 0 Credit |
| S20 | apps/web/src/components/exam-import/credit-cost-badge.tsx | UI component | 1-31 (31 dòng) | cao | utf-8 | Badge giá + ví |
| S21 | apps/web/src/components/exam-import/insufficient-credits-dialog.tsx | UI component | 1-56 (56 dòng) | cao | utf-8 | Dialog E-001 |
| S22 | apps/web/src/components/exam-import/insufficient-credits-dialog.test.tsx | test UI (RTL) | 1-46 (46 dòng) | cao | utf-8 | R1 wording E-001 + điều hướng |
| S23 | apps/web/src/components/grading/ai-draft-panel.tsx | UI component | 1-292 (292 dòng) | cao | utf-8 | Banner E-001/E-002, Nạp thêm Credit, retry E-004 |
| S24 | apps/web/src/routes/_auth/assignments/tests/import.tsx | UI route | 1-559 (559 dòng) | cao | utf-8 | Màn nhập đề, refreshWallet |
| S25 | apps/web/src/components/exam-import/import-with-ai-button.tsx | UI component | 1-20 (20 dòng) | cao | utf-8 | Nút entry theo VITE_AI_ENABLED |
| S26 | apps/e2e/specs/ai-exam-import-ac-001.spec.ts | e2e (Playwright) | 1-64 (64 dòng) | cao | utf-8 | R1 e2e ví 30 → 25 |
| S27 | apps/e2e/specs/ai-grading-ac-001.spec.ts | e2e (Playwright) | 1-253 (253 dòng) | cao | utf-8 | R1 e2e ví −1 Credit (Writing) |
| S28 | packages/db/src/migrations/0051_tan_slayback.sql | migration | 1-43 (43 dòng) | cao | utf-8 | Tạo 2 bảng credit + index + exam_import_job |
| S29 | packages/db/src/migrations/0055_premium_blazing_skull.sql | migration | 1 (1 dòng; 2 ALTER ngăn bởi statement-breakpoint) | cao | utf-8 | ALTER credit_wallet thêm plan_kind, plan_status |
| S30 | packages/db/src/schema/exam-import-job.ts | schema | 1-61 (61 dòng) | cao | utf-8, tab | heldCredits default 5; import_status |
| S31 | packages/db/src/schema/ai-grading-draft.ts | schema | 1-78 (78 dòng) | cao | utf-8, tab | creditCost, gradingMode, retryCount; FK thật tới organization/quiz_attempt |
| S32 | packages/api/src/vietnam-date.ts | util | 83-93 (316 dòng) | cao | utf-8, tab | monthWindowVietnamMs |
| S33 | apps/server/src/routes/student-quiz.test.ts | test tích hợp | 1443-1500 (1571 dòng) | cao | utf-8, tab | R1: AI tắt → không dòng credit_usage_log |
| S34 | apps/server/src/routes/student.ts | route (học viên) | 1955-1965 (2410 dòng) | cao | utf-8, tab | scheduleAiGrading sau nộp bài |
