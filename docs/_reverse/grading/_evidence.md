---
type: reverse-evidence
feature: grading
status: draft
updated: 2026-11-12
---

# Bằng chứng trích code — grading

Mọi trích dẫn dạng `đường/dẫn/tệp:dòng`. Quy ước nhãn xem phần đầu spec.

## §1 Endpoints (route /grading — mount tại apps/server/src/routes/kernel.ts:3501)

| Endpoint | Hành vi | Vai gate | Nguồn |
|---|---|---|---|
| GET /api/grading | Hàng chờ; chạy sweep trước khi trả | mọi staff (kernelCtx) | apps/server/src/routes/grading.ts:720-730 (sweep L726) |
| POST /api/grading/demo-sample | Tạo bài nộp mẫu | canPublishGrade | apps/server/src/routes/grading.ts:732-746 |
| DELETE /api/grading/demo-sample | Xoá bài nộp mẫu theo org | canPublishGrade | apps/server/src/routes/grading.ts:883-944 |
| GET /api/grading/:attemptId | Chi tiết bài nộp + nháp AI; chạy sweep | mọi staff | apps/server/src/routes/grading.ts:946-968 (sweep L951) |
| GET /api/grading/:attemptId/media | Phát media speaking (blob) | mọi staff | apps/server/src/routes/grading.ts:975-996 |
| POST /api/grading/:attemptId/grade | Chốt trả bài | canPublishGrade | apps/server/src/routes/grading.ts:998-1132 (gate 1003-1008) |
| PATCH /api/grading/:attemptId/draft | Lưu bản nháp rà soát | canReviewGrade | apps/server/src/routes/grading.ts:1142-1221 (gate 1149) |
| POST /api/grading/:attemptId/ai-retry | Thử chấm lại AI | canPublishGrade | apps/server/src/routes/grading.ts:1235-1334 (gate 1238-1243) |
| POST /api/grading/:attemptId/annotations | Tạo highlight | mọi staff (validate riêng) | apps/server/src/routes/grading.ts:1342-1407 |
| PATCH /api/grading/:attemptId/annotations/:id | Sửa note | mọi staff | apps/server/src/routes/grading.ts:1412-1441 |
| DELETE /api/grading/:attemptId/annotations/:id | Xoá highlight | mọi staff | apps/server/src/routes/grading.ts:1444-1468 |
| (điểm vào) POST submit bài nộp (student) | Kích hoạt scheduleAiGrading | học viên | apps/server/src/routes/student.ts:1934-1961 |
| GET /api/credits/wallet | Ví Credit; chạy sweep | staff | apps/server/src/routes/credits.ts:32 |

## §2 Validation (điểm dữ liệu bắt buộc)

| Luật | Giá trị | Nguồn |
|---|---|---|
| Band mỗi tiêu chí | 0–9, bước 0.5 | packages/api/src/contracts.ts:2459-2461; packages/api/src/lib/ielts-band.ts:129-136 |
| Đủ 4 tiêu chí theo skill | writing: task_response_achievement/coherence_lexical_grammar | packages/api/src/lib/ielts-band.ts:7-18 |
| — writing | task, coherence, lexical, grammar | packages/api/src/lib/ielts-band.ts:7-12 |
| — speaking | fluency, lexical, grammar, pronunciation | packages/api/src/lib/ielts-band.ts:13-18 |
| Nhãn tiêu chí task | task1 → "Task Achievement"; task2 → "Task Response" | packages/api/src/lib/ielts-band.ts:117-126 |
| Nhận xét (grade & AI) | ≤ 5000 ký tự (QUIZ_FEEDBACK_MAX) | packages/api/src/contracts.ts:2457; cắt AI tại apps/server/src/lib/ai-grading/workers-ai-grader.ts:164 |
| version | int ≥ 1, mặc định 1 khi không gửi | apps/server/src/routes/grading.ts:1065; packages/api/src/contracts.ts:2516-2522, 2542-2551 (L2549 version optional) |
| Kỹ năng chấm được | writing, speaking (isGradableSkill) | packages/api/src/lib/ielts-band.ts:20-25 |
| Highlight span | end > start; ≤ 1000 ký tự (QUIZ_ANNOTATION_SPAN_MAX); không toàn whitespace; snap to words | packages/api/src/lib/essay-annotations.ts:21-62; packages/api/src/contracts.ts:2567-2569, 2580-2587 |
| Số highlight | ≤ 200/bài nộp (QUIZ_ANNOTATIONS_MAX) | packages/api/src/contracts.ts:2569 |
| Note highlight | ≤ 1000 ký tự (QUIZ_ANNOTATION_NOTE_MAX) | packages/api/src/contracts.ts:2567 |
| Từ tối thiểu essay (nộp bài, đối chiếu) | task1 150, task2 250 từ | packages/api/src/contracts.ts:2723-2726 |
| Schema nháp trả về | strict: không thừa field (BR-01 tài liệu này; bình luận code gọi BR-001) | packages/api/src/contracts.ts:2493-2510 |
| Điểm đề hybrid | trắc nghiệm chấm tự động, chỉ essay mới qua teacher | apps/server/src/routes/grading.ts:641-646; packages/api/src/lib/ielts-band.ts:61-85 (essayTaskOf) |

## §3 Errors (map lỗi → mã → chữ)

- Chuẩn hoá: errorResponse 404 "attempt not found" / 409 "attempt not yet submitted" (NOT_SUBMITTED) / 400 "skill not gradable" (SKILL_NOT_GRADABLE) — apps/server/src/routes/grading.ts:665-679.
- 403 publish: GRADE_PUBLISH_FORBIDDEN — apps/server/src/routes/grading.ts:1003-1008; 403 review: GRADE_REVIEW_FORBIDDEN — :1149; 403 retry: AI_RETRY_FORBIDDEN — :1238-1243.
- 409 xung đột: E-selfomy-alignment-011 (AI_GRADING_CONFLICT_CODE) — apps/server/src/routes/grading.ts:1094-1100, 1179-1190; guard `(SELECT changes() = 1)` — :1076; `ne(status,'published')` — :1076, :1208.
- Nháp: 404 DRAFT_NOT_FOUND — :1177; 409 DRAFT_NOT_EDITABLE — :1179-1190; 409 DRAFT_NOT_RETRYABLE — :1273-1278; 409 khi chưa manual_pending — :1264-1272.
- Media: 503 "media storage unavailable" — :980; 404 — :989, :993.
- Body: 400 "invalid json" / "invalid body" — :394-416.
- Pipeline: AI_GRADING_ERROR_CODES {TIMEOUT:"AI_GRADING_TIMEOUT", FAILED:"AI_GRADING_FAILED", DISABLED:"AI_GRADING_DISABLED", NO_TRANSCRIPT:"AI_GRADING_NO_TRANSCRIPT", INSUFFICIENT_CREDITS:"E-selfomy-alignment-001", QUOTA_EXHAUSTED:"E-selfomy-alignment-002"} — packages/api/src/contracts.ts:4196-4209; retryable chỉ TIMEOUT+FAILED — :4219-4230.
- AnnOtation: SKILL_NOT_ANNOTATABLE — apps/server/src/routes/grading.ts:1353-1358; INVALID_SPAN — :1361-1373; TOO_MANY_ANNOTATIONS (400) — :1376-1381; OVERLAP (409) — :1382-1387.

## §4 Business Rules (và chỗ code hậu thuẫn)

| Rule | Nơi nói | Nơi thực thi |
|---|---|---|
| "Nháp trước, ví sau" | apps/server/src/routes/grading.ts? — chính: packages/db/src/schema/ai-grading-draft.ts:7-23 (bình luận); apps/server/src/lib/ai-grading/run-grading.ts:530-551 (thứ tự CAS → settle/revert) | run-grading.ts:530-551 |
| Credit lượt gốc `ai_grading:<attemptId>:<op>`; retry `ai_grading:<attemptId>:r<n>:<op>` | apps/server/src/lib/credits/wallet.ts:71-72 | apps/server/src/lib/ai-grading/release-stale.ts:180-230 |
| Chấm nhanh ≤ 30/tháng, giờ VN, idempotent theo attemptId | apps/server/src/lib/credits/wallet.ts:155-202 (INSERT..SELECT..WHERE count<30) | run-grading.test.ts (AC khớp) |
| Ẩn nháp với học viên | packages/db/src/schema/ai-grading-draft.ts:7-23; packages/api/src/contracts.ts:2493-2510 | apps/server/src/routes/grading.test.ts:2136; apps/e2e/specs/ai-grading-ac-001.spec.ts:163-180 |
| Vai publish/review | packages/auth/src/role.ts:105-142 | apps/server/src/routes/grading.ts:1003-1008, 1149, 1238-1243 |
| Thứ tự queue | apps/server/src/routes/grading.ts:133, 321-328 | — |
| Không retake v1 | packages/db/src/schema/quiz-attempt.ts:86-89 | — |
| Sweep 60s > budget 30s | apps/server/src/lib/ai-grading/release-stale.ts:14 + run-grading.ts:55 | apps/server/src/lib/ai-grading/run-grading.test.ts:954 |

## §5 Entities (schema thật)

- `quiz_attempt` (packages/db/src/schema/quiz-attempt.ts): mode :61; status "in_progress"|"submitted" :62; essay :65; media_* :66-70; gradeScores/gradeFeedback/gradedAt :74-79; UNIQUE(assignment_id, student_id) :86-89; CHECK :103-108; test_id SET NULL :57-59.
- `ai_grading_draft` (packages/db/src/schema/ai-grading-draft.ts): PK attempt_id cascade :29-31; status mặc định ai_processing :38; gradingMode "standard" :53; creditCost :55; transcript :57; errorCode :58-60; version mặc định 1 :62; retryCount :63-67; index (org_id,status) :76.
- `quiz_attempt_annotation` (packages/db/src/schema/quiz-attempt-annotation.ts): comment luật :6-15; startOffset/endOffset :26-27.
- `credit_wallet` (packages/db/src/schema/credit-wallet.ts): org_id PK :19; balance :21; held :23; plan_kind :25; plan_status :27.
- `credit_usage_log`: id :50; org :51; action_type :54; credit_delta :55; tx_status reserved|settled|released :57; ref_id :58; idempotency_key UNIQUE :60, :66-68.
- `comment_bank` (packages/db/src/schema/comment-bank.ts): tag mặc định "chung" :20; UNIQUE(org,operation) :27-30.

## §6 Cross-repo hops (nhảy giữa packages/apps)

| Từ | Đến | Bằng chứng |
|---|---|---|
| apps/server (submit) | apps/server/lib (pipeline) | apps/server/src/routes/student.ts:1961 `void scheduleAiGrading(deps, attemptId)` |
| apps/server | packages/api (band/contract) | import criteriaForSkill/ieltsOverallBand — apps/server/src/lib/quiz-grade.ts; band slider web dùng cùng lib — apps/web/src/components/grading/grade-form.tsx:6-12 |
| apps/server | packages/auth | canPublishGrade/canReviewGrade — apps/server/src/routes/grading.ts:1003-1008, 1149, 1238-1243 |
| apps/web | packages/api (message hằng) | AI_GRADING_CONFLICT_CODE + AI_GRADING_E011_MESSAGE — apps/web/src/routes/_auth/grading/$attemptId.tsx:5, 266, 290, 491; AI_GRADING_E004_MESSAGE — apps/web/src/components/grading/ai-draft-panel.tsx:2, 258 |
| apps/e2e | apps/server (boot shim) | getAiGrader → createFakeAiGrader — apps/e2e/src/boot.ts:194; cờ AI — apps/e2e/playwright.config.ts:95 |
| apps/web | apps/student (đối chiếu) | học viên thấy "Đã nộp — Đang chờ giáo viên chấm" — apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx:144 |
| packages/infra | apps/web/server (cờ) | AI_ENABLED mặc định "false" — packages/infra/alchemy.run.ts:121-123; VITE_AI_ENABLED truyền từ aiEnabled — :306; binding AI :214 |

## §7 Gaps tóm tắt (chi tiết tại reverse-gaps.md)

- G-1 spec doc được trích trong code không tồn tại — packages/api/src/contracts.ts:4248.
- G-2 getTranscriber chưa inject — apps/server/src/lib/ai-grading/run-grading.ts:83; apps/e2e/src/boot.ts:194 chỉ inject grader.
- G-3 không có catalogue i18n — negative search toàn repo.
- G-4 assertStaffCap no-op — apps/server/src/lib/credits/wallet.ts:352-355.
