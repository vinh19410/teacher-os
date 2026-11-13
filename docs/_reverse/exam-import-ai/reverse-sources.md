# reverse-sources.md — exam-import-ai

Working tree: `develop` @ d6c0f6b5 (nguyên thân chính: feature exam-import-ai, plan TOS-24/25/26/27 — issues #470/#471/#472/#473).

| ID | Nguồn | Vai trò | Ghi chú |
|----|-------|---------|---------|
| S1 | `apps/server/src/routes/exam-imports.ts` | Route chính: POST create, GET lookup, GET job, GET file, POST retry, PATCH draft, POST publish | 778 dòng |
| S2 | `packages/db/src/schema/exam-import-job.ts` | Schema `exam_import_job` + lifecycle comment | |
| S3 | `packages/db/src/schema/credit-wallet.ts` | Schema `credit_wallet` + `credit_usage_log` | |
| S4 | `packages/api/src/contracts.ts` (dòng 4109–4452) | Hằng + zod contract + thông điệp lỗi (một nguồn chữ) | CREDIT_COSTS, EXAM_IMPORT_LIMITS/MIME/ERROR_CODES/ERROR_MESSAGES, schemas |
| S5 | `apps/server/src/lib/exam-import/run-import.ts` | Pipeline extract: put file → AI → settle/release → mark status | timeout kép, phân loại lỗi |
| S6 | `apps/server/src/lib/exam-import/release-stale.ts` | Sweep lười job treo >150s | |
| S7 | `apps/server/src/lib/exam-import/dedupe.ts` | `findCompletedImportByFingerprint` | |
| S8 | `apps/server/src/lib/exam-import/validate-file.ts` | Kiểm sâu PDF (unpdf): trang/mật khẩu/hỏng | |
| S9 | `apps/server/src/lib/exam-import/extractor.ts` | Extractor Workers AI: toMarkdown + run json_schema | `EXAM_EXTRACT_MODEL` |
| S10 | `apps/server/src/lib/exam-import/fingerprint.ts` | sha256Hex + countPdfPages | |
| S11 | `apps/server/src/lib/exam-import/publish-to-bank.ts` | mergeReviewedDraft + publishExamImportToBank (batch) | |
| S12 | `apps/server/src/lib/exam-import/fake-extractor.ts` | Fake extractor cho test/e2e (đề cố định, `ai-fail` ném lỗi) | |
| S13 | `apps/server/src/lib/credits/wallet.ts` | reserve/settle/release + InsufficientCreditsError + ensureWallet + assertStaffCap | |
| S14 | `apps/server/src/routes/credits.ts` | GET `/api/credits/wallet` (+ sweep + lazy wallet) | |
| S15 | `packages/auth/src/role.ts` | `EXAM_IMPORT_ROLES` + `canImportExam` | |
| S16 | `apps/server/src/lib/ai-gate.ts` | `createAiProviders` — fail-closed theo `AI_ENABLED` | |
| S17 | `apps/server/src/index.ts` | Wiring production: `getExamImportStore` (R2 MEDIA), `createAiProviders(env)` | |
| S18 | `apps/server/src/app.ts` | Mount route `/api` trước kernelRoutes; gate student 403 | |
| S19 | `packages/infra/alchemy.run.ts` | Binding AI + `AI_ENABLED` default "false"; web env `VITE_AI_ENABLED` | |
| S20 | `apps/web/src/routes/_auth/assignments/tests/import.tsx` | Màn [6]: máy trạng thái idle/uploading/done/error + mọi handler | |
| S21 | `apps/web/src/routes/_auth/assignments/tests/new.tsx` | Điểm chạm CTA | |
| S22 | `apps/web/src/lib/repos/exam-imports.ts` | Repos client: POST raw-body, lookup, job, file, retry, draft, publish, ví; map lỗi | |
| S23 | `apps/web/src/lib/features.ts` | `AI_ENABLED = VITE_AI_ENABLED === "true"` | |
| S24 | `apps/web/src/lib/file-fingerprint.ts` | SHA-256 client (fail khi non-secure context) | |
| S25 | `apps/web/src/lib/exam-file-check.ts` | Kiểm tệp client (pdfjs): MIME/size/pages/password + chuỗi lý do nguyên văn | |
| S26 | `apps/web/src/components/exam-import/*.tsx` | Component UI (dropzone, panels, banner, dialog, badge, viewer, review card) | Cite từng file cụ thể trong evidence |
| S27 | `plans/261027-0434-tos-24..27-*/plan.md` | 4 plan gốc (AC, quyết định, non-goal) — chỉ dùng làm bối cảnh, KHÔNG nâng nhãn ✅ | TOS-24/25/26/27 |
| S28 | `docs/project-overview-pdr.md` | PDR — xác nhận feature KHÔNG được nhắc | grep 0 kết quả |
| S29 | `apps/web/src/components/exam-import/review-confirmation.tsx` + `exam-import-actions.tsx` + `question-review-card.tsx` | Cổng xác nhận UI + khóa nút + nhãn vàng | |
| S30 | `apps/web/src/components/exam-import/import-failed-panel.tsx` | Panel E-004 + nhãn lý do nguyên văn | |
| S31 | `apps/web/src/components/exam-import/insufficient-credits-dialog.tsx` | Hộp thoại E-001 | |
| S32 | `apps/web/src/components/exam-import/duplicate-exam-banner.tsx` | Banner trùng + nút "Mở lại bản nháp cũ (0 Cr)" | FR-013, UC-03 |
| S33 | `apps/web/src/components/exam-import/credit-cost-badge.tsx` | Huy hiệu đơn giá 5 Credit + số dư ví | FR-021, BR-001 |
| S34 | `apps/web/src/components/exam-import/import-with-ai-button.tsx` | CTA trên màn soạn đề; gate cờ `VITE_AI_ENABLED` (:11) | FR-001, FR-002 |
| S35 | `apps/web/src/components/exam-import/source-document-viewer.tsx` | Viewer tài liệu gốc (pdf.js canvas + zoom, ảnh) | FR-009, FR-022 |
| S36 | `apps/web/src/components/exam-import/question-review-card.tsx` | Thẻ câu hỏi + nhãn vàng "Cần rà soát lại" | FR-008 |
| S37 | `apps/web/src/routes/_auth/assignments/tests/import.test.tsx` | Test màn import (= T9) | FR-024, BR-007 |
| S38 | `apps/server/src/routes/exam-imports.test.ts` | Test route chính (= T1) | FR-002/003/012/016/017/019/020/023, BR-003, SC-01..06 |
| S39 | `apps/server/src/lib/exam-import/run-import.test.ts` | Test pipeline extract + timeout kép (= T2) | NFR-001, SC-02 |
| S40 | `apps/server/src/lib/credits/wallet.test.ts` | Test ví song song/idempotent (= T8) | NFR-002, SC-07 |
| S41 | `apps/e2e/specs/ai-exam-import-ac-001..004.spec.ts` | 4 spec e2e AC-001..004 (= T12) | FR-009, FR-010, NFR-008, SC-09 |
| S42 | `apps/e2e/playwright.config.ts` | Cấu hình e2e: cờ `VITE_AI_ENABLED=true` (:95) | FR-002, OQ-2 |
| S43 | `packages/db/src/migrations/0051_tan_slayback.sql` + `0052_exam_import_published_test.sql` + `0053_purple_gorgon.sql` | Migration: ví + sổ cái + job, `published_test_id`, `error_reason` | Mục 8 |
| S44 | `packages/db/src/schema/assignment-test.ts` | Schema bộ đề + part đích xuất bản | Mục 8, FR-019 |

**Nguồn kiểm chứng (R1 — test active, không .skip/.only/.todo):**

| ID | Test file | Phạm vi |
|----|-----------|---------|
| T1 | `apps/server/src/routes/exam-imports.test.ts` | 31 test route (happy/402/400/502/403/503/sweep/dedupe/publish/retry) |
| T2 | `apps/server/src/lib/exam-import/run-import.test.ts` | 6 test pipeline + timeout |
| T3 | `apps/server/src/lib/exam-import/dedupe.test.ts` | 10 test dedupe |
| T4 | `apps/server/src/lib/exam-import/release-stale.test.ts` | 2 test sweep |
| T5 | `apps/server/src/lib/exam-import/validate-file.test.ts` | 6 test kiểm sâu |
| T6 | `apps/server/src/lib/exam-import/publish-to-bank.test.ts` | 7 test merge + publish |
| T7 | `apps/server/src/lib/exam-import/fingerprint.test.ts` | 3 test hash/đếm trang |
| T8 | `apps/server/src/lib/credits/wallet.test.ts` | 19 test ví |
| T9 | `apps/web/src/routes/_auth/assignments/tests/import.test.tsx` | 17 test màn import |
| T10 | `apps/web/src/lib/repos/exam-imports.test.ts` | 5 test repos |
| T11 | `apps/web/src/components/exam-import/*.test.tsx` | 16 test / 7 file component (dropzone, failed panel, dialog, review) |
| T12 | `apps/e2e/specs/ai-exam-import-ac-001..004.spec.ts` | 4 spec / 5 test e2e AC-001..004 (fake extractor qua `apps/e2e/src/boot.ts:190`, cờ `VITE_AI_ENABLED=true` qua `apps/e2e/playwright.config.ts:95`) |
| T13 | `apps/server/src/lib/ai-gate.test.ts` | 3 test fail-closed cờ AI |

**Nguồn phụ (migration):** `packages/db/src/migrations/0051_tan_slayback.sql` (credit_wallet + credit_usage_log + exam_import_job + 2 index), `0052_exam_import_published_test.sql` (published_test_id), `0053_purple_gorgon.sql` (error_reason), `0055_premium_blazing_skull.sql` (plan_kind/plan_status).
