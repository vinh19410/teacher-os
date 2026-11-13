---
type: reverse-source-map
feature: grading
status: draft
updated: 2026-11-12
---

# Nguồn đã đọc — ánh xạ S-id

Đọc tĩnh, KHÔNG chạy gì. `confidence` của Nguồn: `high` = đọc trực tiếp toàn bộ/range chính; `medium` = đọc range chọn lọc trong tệp lớn. Encoding: mọi tệp UTF-8 text (ts/tsx/md).

| ID | Nguồn (repo-relative) | Loại | Range đọc | Confidence | Ghi chú |
|---|---|---|---|---|---|
| S1 | apps/server/src/routes/grading.ts | code server (Hono route) | 1-1471 (toàn tệp, 1471 dòng) | high | Route /grading: queue, grade, draft, retry, media, annotation, demo |
| S2 | apps/server/src/lib/ai-grading/run-grading.ts | code server (lib) | 1-574 (toàn tệp) | high | Pipeline AI + scheduleAiGrading |
| S3 | apps/server/src/lib/ai-grading/release-stale.ts | code server (lib) | 1-230 (toàn tệp) | high | Sweep 60s/batch 20 + occasion |
| S4 | apps/server/src/lib/ai-grading/grader.ts | code server (interface) | 1-56 (toàn tệp) | high | AiGrader + roundBandStep |
| S5 | apps/server/src/lib/ai-grading/workers-ai-grader.ts | code server (adapter) | 1-167 (toàn tệp) | high | Workers AI Llama 3.3 70B |
| S6 | apps/server/src/lib/ai-grading/fake-grader.ts | code test (adapter) | 1-63 (toàn tệp) | high | Grader giả e2e |
| S7 | apps/server/src/lib/ai-gate.ts | code server (gate) | 1-24 (toàn tệp) | high | AI_ENABLED === "true" |
| S8 | apps/server/src/lib/credits/wallet.ts | code server (service) | 1-355 (toàn tệp) | high | Ví Credit + chấm nhanh |
| S9 | apps/server/src/routes/student.ts | code server (route) | vùng 1900-1990 (điểm nộp bài); tệp 2410 dòng | medium | Gọi scheduleAiGrading tại L1961 |
| S10 | apps/server/src/routes/kernel.ts | code server (route) | vùng 3490-3510; tệp 3523 dòng | medium | Mount /grading (L3501) + comment-bank (L3498) |
| S11 | apps/server/src/routes/credits.ts | code server (route) | L32; tệp 48 dòng | high | Ví Credit gọi sweep |
| S12 | apps/server/src/routes/dashboard-reminders.ts | code server (route) | 255-270; tệp 300 dòng | high | overdueGrading |
| S13 | apps/server/src/lib/notifications/templates.ts | code server (lib) | 105-130; tệp 193 dòng | high | "Bài đã được chấm" |
| S14 | apps/server/src/lib/quiz-grade.ts | code server (mapper) | 1-37 (toàn tệp) | high | Grade → view + band |
| S15 | apps/server/src/app.ts | code server (app) | vùng 100-180, 460-481; tệp 481 dòng | medium | Deps runInBackground/getAiGrader |
| S16 | apps/server/src/index.ts | code server (boot) | 80-180; tệp 177 dòng | high | waitUntil + AI providers |
| S17 | packages/api/src/contracts.ts | code contract (Zod) | 2450-2730, 4110-4260; tệp 4799 dòng | high | Schema + hằng + message |
| S18 | packages/api/src/lib/ielts-band.ts | code contract (lib) | 1-152 (toàn tệp) | high | Tiêu chí + band |
| S19 | packages/api/src/lib/essay-annotations.ts | code contract (lib) | 1-140 (toàn tệp) | high | Span/overlap/render |
| S20 | packages/api/src/lib/essay-plain.ts | code contract (lib) | 1-263 (toàn tệp) | high | Plain + bản đồ offset |
| S21 | packages/auth/src/role.ts | code auth | 1-177 (toàn tệp) | high | Allowlist vai |
| S22 | packages/db/src/schema/quiz-attempt.ts | schema DB | 1-108 (toàn tệp) | high | Bài nộp |
| S23 | packages/db/src/schema/ai-grading-draft.ts | schema DB | 1-78 (toàn tệp) | high | Nháp AI + state machine |
| S24 | packages/db/src/schema/quiz-attempt-annotation.ts | schema DB | 1-40 (toàn tệp) | high | Highlight |
| S25 | packages/db/src/schema/comment-bank.ts | schema DB | 1-37 (toàn tệp) | high | Ngân hàng nhận xét |
| S26 | packages/db/src/schema/credit-wallet.ts | schema DB | 1-71 (toàn tệp) | high | Ví + sổ cái |
| S27 | apps/web/src/routes/_auth/grading/index.tsx | code web (route) | 1-647 (toàn tệp) | high | Màn hàng chờ |
| S28 | apps/web/src/routes/_auth/grading/$attemptId.tsx | code web (route) | 1-506 (toàn tệp) | high | Màn chấm |
| S29 | apps/web/src/lib/repos/grading.ts | code web (repo) | 1-269 (toàn tệp) | high | HTTP client grading |
| S30 | apps/web/src/lib/features.ts | code web (flag) | 1-15 (toàn tệp) | high | VITE_AI_ENABLED |
| S31 | apps/web/src/components/grading/ai-draft-panel.tsx | code web (component) | 1-292 (toàn tệp) | high | Panel Gợi ý từ AI |
| S32 | apps/web/src/components/grading/grade-form.tsx | code web (component) | 1-180 (toàn tệp) | high | Form 4 tiêu chí |
| S33 | apps/web/src/components/grading/band-slider.tsx | code web (component) | 1-82 (toàn tệp) | high | Slider 0-9/0.5 |
| S34 | apps/web/src/components/grading/submission-view.tsx | code web (component) | 1-142 (toàn tệp) | high | Xem bài làm |
| S35 | apps/server/src/routes/grading.test.ts | test unit | ~1900-2688 (khối draft/retry/demo) + grep toàn tệp tên test; tệp 2688 dòng | medium | ~57 test |
| S36 | apps/server/src/lib/ai-grading/run-grading.test.ts | test unit | toàn tệp 1270 dòng | high | ~34 test pipeline |
| S37 | apps/e2e/specs/ai-grading-ac-001.spec.ts | test e2e | 1-253 (toàn tệp) | high | AC-001 ẩn nháp |
| S38 | apps/e2e/specs/ai-grading-ac-003.spec.ts | test e2e | 1-277 (toàn tệp) | high | AC-003 chấm nhanh |
| S39 | apps/e2e/specs/ai-grading-ac-004.spec.ts | test e2e | 1-335 (toàn tệp) | high | AC-004 vai + E-011 |
| S40 | apps/e2e/specs/teacher-grade-submission.spec.ts | test e2e | 1-488 (toàn tệp) | high | Chấm tay + practice |
| S41 | apps/web/src/routes/_auth/grading/index.test.tsx | test web | grep tên test + khối chính; tệp 582 dòng | medium | 10 test hàng chờ |
| S42 | apps/web/src/components/grading/ai-draft-panel.test.tsx | test web | 1-290 (toàn tệp) | high | 12 test panel |
| S43 | apps/web/src/components/grading/grade-form.test.tsx | test web | 1-407 (toàn tệp) | high | 16 test form |
| S44 | apps/e2e/src/boot.ts | code test (boot) | L194; tệp 299 dòng | high | Inject fake grader |
| S45 | apps/e2e/playwright.config.ts | config test | L95; tệp 165 dòng | high | Bật cờ AI e2e |
| S46 | packages/infra/alchemy.run.ts | config hạ tầng | 115-130, 210-310; tệp 428 dòng | high | AI_ENABLED mặc định tắt |
| S47 | packages/env/src/web.ts | config env | 1-15 (toàn tệp) | high | Khai báo VITE_AI_ENABLED |
| S48 | apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx | code web học viên | L144; tệp 343 dòng | high | Nhãn chờ chấm |

Quy ước tra cứu: mọi `[S<n>]` trong bộ tài liệu này trỏ về bảng trên; S-id LIÊN TỤC S1→S48, không bỏ trống.
