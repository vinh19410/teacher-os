# _evidence.md — exam-import-ai

Mọi cite `path:line` repo-relative, working tree develop @ d6c0f6b5. R2: mã lỗi có CẢ throw-site và catalog.

## §1 Endpoints (cột Nguồn — không sinh api-reference)

| Endpoint | Hành vi | Throw-site | Contract/DTO | Test |
|----------|---------|-----------|--------------|------|
| POST `/api/exam-imports` | Upload raw-body; role gate; 503 disabled; kiểm MIME/size/name/byte; inspect PDF; sweep; dedupe; ensureWallet + staffCap; INSERT job `processing`; reserve; runImport | `apps/server/src/routes/exam-imports.ts:156-341` | `examImportCreateResponseSchema` = union job | `{duplicateOf}` — `packages/api/src/contracts.ts:4439-4442` | T1:265,317,338,373,415,427,435,440,459,480,511,523,1106,1152,1195,1204,1214 |
| GET `/api/exam-imports/lookup` | Tra trùng theo fingerprint; role gate như POST; fingerprint sai format → 400 E-003; đăng ký TRƯỚC `/:id` | `apps/server/src/routes/exam-imports.ts:348-370` | `examImportLookupResponseSchema` — contracts:4433-4435 | T1:1084,1094,1106 |
| GET `/api/exam-imports/:id` | Job DTO org-scoped; 404 đồng nhất; sweep lười; KHÔNG gate `canImportExam` | `apps/server/src/routes/exam-imports.ts:377-403` | `examImportJobSchema` — contracts:4393-4413 | T1:396 |
| GET `/api/exam-imports/:id/file` | Stream file gốc (org-scoped); 503 disabled; 404 job/file | `apps/server/src/routes/exam-imports.ts:406-453` | binary + header `mediaObjectResponse` | T1:396 (org khác 404 cùng mã) |
| POST `/api/exam-imports/:id/retry` | Chỉ job `failed_refunded` (409); file R2 còn (410); job mới tái dùng fileKey/fingerprint; reserve lại; `putFile:false` | `apps/server/src/routes/exam-imports.ts:459-583` | `examImportJobSchema` | T1:548,577,590,598,613 |
| PATCH `/api/exam-imports/:id/draft` | 0 Credit; chỉ `completed` (409); CSRF JSON; merge bảo toàn needsReview/confidence | `apps/server/src/routes/exam-imports.ts:590-678` | `examImportDraftUpdateSchema` — contracts:4365-4370 | T1:744,889 |
| POST `/api/exam-imports/:id/publish` | Cổng xác nhận 2 lớp; batch nguyên tử; idempotent; 422 theo mã | `apps/server/src/routes/exam-imports.ts:685-776`; `apps/server/src/lib/exam-import/publish-to-bank.ts:164-564` | `examImportPublishSchema`/`examImportPublishResponseSchema` — contracts:4373-4390 | T1:800,889; T6:130,152,176,219,289,313,330 |
| GET `/api/credits/wallet` | Ví + available = balance − held; sweep + lazy wallet; mọi member org | `apps/server/src/routes/credits.ts:23-44` | `creditWalletSchema` — contracts:4445-4452 | T1:445 |
| Mount | `/api` mount trước kernelRoutes | `apps/server/src/app.ts:473-477` | — | — |

## §2 Validation (validators/guards thật)

| Validation | Site | Chi tiết |
|-----------|------|----------|
| MIME allowlist server | `exam-imports.ts:179-189` + `normalizeMediaType` `packages/api/src/lib/quiz-media.ts:19` | `EXAM_IMPORT_MIME` contracts:4128-4132 |
| Content-Length khai báo | `exam-imports.ts:190-208` | số nguyên dương ≤ maxBytes |
| Tên file header | `exam-imports.ts:209-226` + `sanitizeMediaFileName` `quiz-media.ts:68` | decodeURIComponent + sanitize; hỏng → null → 400 reason "type" |
| Byte thật khớp khai báo | `exam-imports.ts:229-242` | chống giả mạo Content-Length |
| Kiểm sâu PDF | `validate-file.ts:28-52` | unpdf `getDocumentProxy` trên bản copy buffer (:42); >20 trang → "pages" (:44-46); PasswordException → "password" (:49); hỏng → "type" (:50); ảnh → 1 trang (:32-36) |
| Fingerprint format (lookup) | `exam-imports.ts:354-363` + `fingerprintSchema` contracts:4418 | `^[a-f0-9]{64}$` |
| Kiểm tệp client | `apps/web/src/lib/exam-file-check.ts:28-83` | pdfjs: MIME (:36-39), size (:41-45), pages (:59-63), password (:73-76), hỏng (:78-81); `task.destroy()` (:83) |
| Draft schema | `extractedExamDraftSchema` contracts:4349-4362 (base `extractedExamSchema` :4338-4346; question :4309-4319; part :4329-4335; reviewedQuestion :4322-4326) | strict; needsReview boolean bắt buộc |
| Draft/publish body | `exam-imports.ts:629-658` (draft), `:724-745` (publish) | JSON hỏng 400; schema fail 422 |
| Publish domain | `publish-to-bank.ts:179-190` (review gate), `:193-200` (mixed), `:202-211` + `:260-267` (slots), `:293-306` + `:343-353` (câu hỏi) | 422 kèm chỉ mục |
| needsReview server | `run-import.ts:60-81` (sau extract) + `publish-to-bank.ts:27-45` (`computeQuestionNeedsReview`) + merge `:77-124` | ngưỡng `EXAM_IMPORT_LIMITS.reviewConfidence` contracts:4124 |
| CSRF JSON | `exam-imports.ts:141-154` | Origin allowlist + `application/json` |
| Cờ AI server | `ai-gate.ts:14-24` | `AI_ENABLED === "true"` mới dùng binding |
| Cờ AI web | `features.ts:9`; route gate `import.tsx:41-46`; CTA gate `import-with-ai-button.tsx:11` | `VITE_AI_ENABLED === "true"` |
| Role | `role.ts:94-103` (`EXAM_IMPORT_ROLES`, `EXAM_IMPORT_ROLE_MAP`, `canImportExam`) | teacher/owner |
| Student gate | `app.ts:227-234` | 403 STUDENT_ON_TEACHER_APP |

## §3 Errors (R2: throw-site + catalog, nguyên văn)

| Mã (catalog) | HTTP | Throw-site (route/service) | Catalog + message nguyên văn | Test khóa |
|--------------|------|----------------------------|------------------------------|-----------|
| `E-selfomy-alignment-001` INSUFFICIENT_CREDITS | 402 | `exam-imports.ts:306-325` (POST: xóa job + file R2 rồi trả), `:552-567` (retry: chỉ xóa job mới); nguồn `InsufficientCreditsError` `wallet.ts:15-22`, ném tại `wallet.ts:312-315` | catalog `contracts.ts:4136-4137`; message: "Tổ chức của bạn đã dùng hết Credit AI trong kỳ. Vui lòng mua thêm gói 100 Credit (149.000đ) hoặc nâng cấp gói tháng để tiếp tục sử dụng tính năng này." (`contracts.ts:4275-4276`) | T1:317,613; T11(dialog):32 |
| `E-selfomy-alignment-003` INVALID_FILE | 400 | `exam-imports.ts:180-208` (type/size), `:217-226` (name→reason "type"), `:230-242` (size byte), `:249-259` (inspect: pages/password/type) | catalog `contracts.ts:4138-4139`, reasons `contracts.ts:4167-4172`; message: "Tệp tải lên vượt quá giới hạn cho phép (tối đa 20 trang, 15 MB, định dạng PDF/PNG/JPG không khóa mật khẩu). Vui lòng tách nhỏ hoặc đổi tệp khác." (`contracts.ts:4277-4278`); client chi tiết tại `exam-file-check.ts:36-81` | T1:415,459,480,511; T5:8-64; T11(dropzone):38 |
| `E-selfomy-alignment-004` EXAM_FAILED | 502 | `importFailureOrJob` `exam-imports.ts:109-117`; mark `run-import.ts:282-296`; sweep mark `release-stale.ts:76-99`; phân loại `run-import.ts:46-53` (timeout/empty_result/ai_error), EmptyResultError `:24-29` | catalog `contracts.ts:4142-4143`, reasons `contracts.ts:4177-4182`; message: "Hệ thống AI đang phản hồi chậm hoặc không đọc được cấu trúc tệp này. Số Credit tạm giữ đã được hoàn lại đầy đủ vào ví của bạn. Vui lòng thử lại sau." (`contracts.ts:4279-4280`); nhãn reason `import-failed-panel.tsx:8-12` | T1:338,523,640; T2:135,174; T11(failed):16 |
| `EXAM_IMPORT_FAILED` (hard) | 502 | `importFailureOrJob` nhánh `kind==="hard"` `exam-imports.ts:96-108`; sinh tại `run-import.ts:236-259` (settled rồi lỗi) | catalog `contracts.ts:4144-4145`; CỐ Ý không message E-004 — comment `contracts.ts:4262-4268`; UI fallback "Có lỗi xảy ra khi nhập đề. Vui lòng thử lại." `import.tsx:533-534`, map `repos/exam-imports.ts:140-144` | T1 (hard path qua T2:220 sau-muộn); T9:312 |
| `EXAM_IMPORT_DISABLED` | 503 | `exam-imports.ts:163-173` (POST), `:465-475` (retry), `:409-418` (file); nguồn binding `ai-gate.ts:18-24`, store `index.ts:134-138` | catalog `contracts.ts:4140-4141`; UI "Tính năng chưa cấu hình — liên hệ quản trị để bật Nhập đề AI." `import.tsx:530-531` | T1:427; T13:12-26 |
| `exam_import_not_found` | 404 | `exam-imports.ts:393-401` (GET), `:430-437` (file), `:491-499` (retry), `:610-618` (draft), `:705-713` (publish) | catalog `contracts.ts:4146-4147`; UI "Bản nháp không tồn tại hoặc đã bị xoá — hãy nhập đề mới." `import.tsx:516-517` | T1:396,590 |
| `exam_import_not_retryable` | 409 | `exam-imports.ts:500-508` | catalog `contracts.ts:4148-4149`; UI "Lượt nhập đề này đã hoàn tất, không thể thử lại." `import.tsx:523-524` | T1:577 |
| `exam_import_file_missing` | 410 | `exam-imports.ts:509-519` | catalog `contracts.ts:4150-4151`; UI "Tệp đề gốc không còn trên kho lưu trữ — vui lòng tải lên lại tệp." `import.tsx:519-521` | T1:598 |
| `EXAM_IMPORT_INVALID_STATE` | 409 | `exam-imports.ts:619-627` (draft), `:714-722` (publish) | catalog `contracts.ts:4160-4161`; UI map theo status: `import.tsx:301,557` | T1 (trong test publish/draft guard) |
| `REVIEW_CONFIRMATION_REQUIRED` | 422 | `publish-to-bank.ts:183-190` | catalog `contracts.ts:4152-4153`; UI "Vui lòng tích xác nhận các câu gắn nhãn Cần rà soát lại trước khi lưu vào Ngân hàng đề." `import.tsx:548-549` | T6:152; T1:800 |
| `TOO_MANY_PARTS` | 422 | `publish-to-bank.ts:202-211`, `:260-267` | catalog `contracts.ts:4154-4155`; UI "Số lượng part vượt quá giới hạn của kỹ năng đã chọn. Vui lòng gộp hoặc bớt part." `import.tsx:550-551` | T6:289; T1:889 |
| `SKILL_MIXED_NOT_ALLOWED` | 422 | `publish-to-bank.ts:193-200` | catalog `contracts.ts:4156-4157`; UI "Vui lòng chọn kỹ năng cụ thể (Reading, Listening, Writing hoặc Speaking) trước khi lưu vào Ngân hàng đề." `import.tsx:552-553` | T6:313 |
| `INVALID_DRAFT` | 400/422 | `exam-imports.ts:633-639,650-658` (draft 400/422), `:729-744` (publish 422); `publish-to-bank.ts:270-277,293-305,343-352` | catalog `contracts.ts:4158-4159`; UI "Một số câu hỏi chưa có nội dung hoặc đáp án hợp lệ. Vui lòng kiểm tra lại." `import.tsx:554-555` | (chưa có test khóa riêng — T1:889 khóa TOO_MANY_PARTS/404/403/415; T6:176 khóa happy publish) |
| 401 unauthorized | 401 | `exam-imports.ts:157-158,349-352,377-379,407-409,460-462,590-594,686-690` | `{error:"unauthorized"}` | T1:440 |
| 403 forbidden | 403 | role: `exam-imports.ts:160-162,351-353,462-464,593-595,688-690`; Origin lạ: `:146-148` | `{error:"forbidden"}` / `{error:"origin not allowed"}` | T1:435,889 |
| 415 content-type | 415 | `exam-imports.ts:149-152` | `{error:"content-type must be application/json"}` | T1:889 |

## §4 Rules + hằng số

| Hằng | Giá trị | Site | Ý nghĩa |
|------|---------|------|---------|
| `CREDIT_COSTS.examImport` | 5 | `contracts.ts:4114` | Đơn giá/lượt import |
| `TRIAL_CREDITS` | 30 | `contracts.ts:4117` | Ví lười khởi tạo |
| `EXAM_IMPORT_LIMITS.maxBytes` | 15 * 1024 * 1024 | `contracts.ts:4121` | Giới hạn tệp |
| `EXAM_IMPORT_LIMITS.maxPages` | 20 | `contracts.ts:4122` | PDF tối đa |
| `EXAM_IMPORT_LIMITS.timeoutMs` | 120_000 | `contracts.ts:4123` | Timeout extract |
| `EXAM_IMPORT_LIMITS.reviewConfidence` | 0.8 | `contracts.ts:4124` | Ngưỡng gắn nhãn |
| `STALE_IMPORT_AFTER_MS` | 150_000 | `release-stale.ts:12` | Ngưỡng treo (120s + biên) |
| `STALE_SWEEP_BATCH` | 20 | `release-stale.ts:15` | Giới hạn sweep |
| `EXAM_EXTRACT_MODEL` | "@cf/meta/llama-4-scout-17b-16e-instruct" | `extractor.ts:56` | Model LLM |
| Idempotency key | `exam_import:<jobId>:<reserve|settle|release>` | `wallet.ts:73-81` | UNIQUE `credit_usage_log_idempotency_key_idx` `credit-wallet.ts:66-68` |
| Dấu credit_delta | reserved −amount / settled −amount / released +amount | `credit-wallet.ts:37-46`, `wallet.ts:284` | Quy ước sổ cái |
| Id xuất bản tất định | `test-import-<jobId>`, `prompt-import-<jobId>-<part>`, `test-part-import-<jobId>-<part>` | `publish-to-bank.ts:376-378,399-403,494-497` | Chống TOCTOU/nhân bản |
| `QUESTION_TYPE_ALIASES` | short_answer→shortans, gap_fill→sent, true_false_not_given→tfng, yes_no_not_given→ynng | `publish-to-bank.ts:70-75` | Chuẩn hóa type sang catalog slot |
| Prompt hệ thống extract | rules giữ nguyên stem/opts/answer/type/confidence + ví dụ IELTS | `extractor.ts:126-131` | Đầu ra LLM |
| json_schema LLM | khớp `extractedExamSchema` (title/skill/timeLimitMinutes/parts/questions) | `extractor.ts:72-124` | Ép format AI.run |
| FileKey R2 | `exam-imports/<orgId>/<jobId>` | `exam-imports.ts:280-281` | Prefix org chống ghép key chéo (`exam-import-job.ts:19-21`) |

## §5 Entities

- `exam_import_job` — `packages/db/src/schema/exam-import-job.ts:13-61` (migration `0051_tan_slayback.sql:23-44`; `published_test_id` `0052_exam_import_published_test.sql:1`; `error_reason` `0053_purple_gorgon.sql:1`).
- `credit_wallet` — `packages/db/src/schema/credit-wallet.ts:14-38` (migration `0051:15-22`; plan_kind/status `0055_premium_blazing_skull.sql:1-2`).
- `credit_usage_log` — `packages/db/src/schema/credit-wallet.ts:47-71` (migration `0051:1-14`).
- `assignment_test` / `assignment_test_part` — `packages/db/src/schema/assignment-test.ts:18-75` (part không có orgId, org-scoping qua testId — comment :51).
- `assignment_prompt` — `packages/db/src/schema/assignment-prompt.ts` (đích publish; ghi promptValues tại `publish-to-bank.ts:410-438`).
- `organization` — `packages/db/src/schema/organization.ts:4-10` (id, name).
- `user` — `packages/db/src/schema/auth.ts:4-27` (id, role teacher/student...).
- Draft value object — `contracts.ts:4338-4362` (lưu `draft_json` `exam-import-job.ts:33-34`).

## §6 Cross-repo hops (liên kết ngoài feature)

| Hop | Từ | Đến | Bằng chứng |
|-----|----|----|-----------|
| Web → contracts | `apps/web/src/lib/repos/exam-imports.ts:1-17` | `@teacher-os/api/contracts` | parse zod 2 đầu |
| Server route → auth role | `exam-imports.ts:18` | `@teacher-os/auth/role` (`role.ts:94-103`) | canImportExam |
| Route/db → schema | `exam-imports.ts:19` | `@teacher-os/db/schema/exam-import-job` | drizzle |
| Infra → runtime env | `packages/infra/alchemy.run.ts:210-214` | binding `AI`, `AI_ENABLED` → `index.ts:139` (`createAiProviders(env)`) | fail-closed |
| Web build flag | `packages/env/src/web.ts:8` (`VITE_AI_ENABLED` optional) | `features.ts:9` | cờ build |
| Publish → ngân hàng đề | `publish-to-bank.ts:13-17` | `assignment-prompt`, `assignment-test`, `assignment-test_part` | batch D1/libsql |
| e2e boot fake | `apps/e2e/src/boot.ts:189-190` | `createFakeExamExtractor` + FS store | không đụng Workers AI |
| Snapshot test boundary | `publish-to-bank.test.ts:176` (forward explanation) | route snapshot đọc lại đề | round-trip |

## §7 Gaps negative-search (R3 — dead-code/flag)

**Cờ AI (bắt buộc kiểm `apps/web/src/lib/features.ts`):**
- `AI_ENABLED = env.VITE_AI_ENABLED === "true"` — `apps/web/src/lib/features.ts:9`. KHÔNG phải hằng tắt cố định (khác `PARENT_REPORTS_ENABLED = false` :7) — cờ phụ thuộc biến build.
- Điều khiển: (a) ẩn CTA `import-with-ai-button.tsx:11`; (b) redirect route `import.tsx:42-46`. Khi cờ TẮT: người dùng không thấy đường vào màn import; route trực tiếp bị chuyển về `tests/new`.
- Server phía: `AI_ENABLED` (biến Workers env, default "false" — `alchemy.run.ts:121-123`) + binding `AI` (`alchemy.run.ts:213`); vắng → `getExamExtractor` trả undefined → POST/lookup-file/retry 503 `EXAM_IMPORT_DISABLED` (`ai-gate.ts:18-24`, `exam-imports.ts:163-173`). Fail-closed, không phải dead-code.
- Trạng thái cờ hiện hành: KHÔNG tìm thấy cấu hình env thật trong repo (không có `.env` được commit — đúng nguyên tắc secret); e2e bật riêng `VITE_AI_ENABLED: "true"` (`apps/e2e/playwright.config.ts:95`). → OQ-2.

**Negative-search 1 — endpoint DELETE/list job:**
- Pattern: `router.delete|router.get("/exam-imports"` trong `apps/server/src/routes/exam-imports.ts`.
- Scope grep: toàn bộ file route chỉ có POST `/exam-imports` (:156), GET `/exam-imports/lookup` (:348), GET `/:id` (:377), GET `/:id/file` (:406), POST `/:id/retry` (:459), PATCH `/:id/draft` (:590), POST `/:id/publish` (:685). Không DELETE, không list.
- Web routes tham chiếu: `apps/web/src/routes/_auth/assignments/tests/import.tsx`, `new.tsx` — không có trang lịch sử job.
- Kết luận: không có xóa/danh sách job → Gap G-2/OQ-3/OQ-4.

**Negative-search 2 — xóa file R2:**
- Pattern: `store.delete(` trong `apps/server/src`.
- Kết quả: chỉ `exam-imports.ts:309` (nhánh reserve-thua POST). `release-stale.ts` KHÔNG xóa file; retry KHÔNG xóa file cũ (`exam-imports.ts:543-544` comment giữ làm lịch sử).
- Kết luận: file sống vô thời hạn trừ một nhánh → OQ-4.

**Negative-search 3 — cron/queue cho sweep:**
- Pattern: `cron|queue|scheduled` trong `apps/server/src` + `packages/infra/alchemy.run.ts`.
- Kết quả: không có handler scheduled nào cho exam import; sweep chỉ chạy lười tại `exam-imports.ts:262,381,479` + `credits.ts:31-33` (comment `release-stale.ts:27-29`).
- Kết luận: đúng thiết kế "lazy release" — nếu không ai chạm API, job treo không được dọn (chấp nhận theo plan TOS-27 D3).

**Dead-code check khác:**
- `assertStaffCap` no-op — không phải dead-code (được gọi `exam-imports.ts:278,524`; test khóa no-op `wallet.test.ts:248`).
- `QUESTION_TYPE_ALIASES` được dùng tại `publish-to-bank.ts:282-284,307-311`.
- `countPdfPages` dùng tại `run-import.ts:184-187` (fallback pageCount khi extractor trả null).
- Không tìm thấy code chết trong phạm vi feature.
