---
title: "Quiz take: ô nhập bài viết Writing + đếm từ cho học viên"
description: "Đề Writing ở trang làm bài học viên có textarea nhập bài, autosave, đếm từ theo mục tiêu Task 1/Task 2, và màn kết quả hiện lại bài đã nộp."
status: completed
priority: P1
effort: "8h"
issue: 304
branch: develop
tags: [feature, frontend, backend, database, quiz]
blockedBy: []
blocks: []
created: 2026-10-02
---

# Quiz take: ô nhập bài viết Writing + đếm từ cho học viên

## Overview

Học viên mở một đề Writing (ví dụ "Situation of marriage and age from 1960 to 2000 in Australia") thì chỉ thấy đề bài và dòng "Đề này không có câu hỏi tự chấm — liên hệ giáo viên…". Footer ghi "Đã trả lời 0/0 câu". Không có chỗ nào để viết bài, nên bấm "Nộp bài" chỉ nộp một attempt rỗng.

Nguyên nhân gốc: `QuizPaper` (`packages/ui/src/components/quiz/quiz-paper.tsx`) chỉ render input cho từng câu trong `parts`. Đề Writing có `questions: []` (contract ghi rõ Writing là "prompt-only type with no questions"), nên rơi vào nhánh empty-state ở cuối component. Phía server cũng chưa có chỗ lưu bài viết: `PATCH /attempts/:id/answer` từ chối mọi `q >= questions.length` (tức là mọi `q` khi đề có 0 câu), giới hạn mỗi value 500 ký tự (`QUIZ_ANSWER_VALUE_MAX`), và body bị cap 4096 byte.

Plan này thêm luồng làm bài Writing đầy đủ phía học viên: một textarea, autosave như các dạng khác, đếm từ có mục tiêu tối thiểu, chặn nộp nhầm bài trống, và màn kết quả hiện lại bài đã nộp.

## Key Decisions

1. **Cột `essay` riêng trên `quiz_attempt`** (`text NOT NULL DEFAULT ''`, migration 0031), cùng endpoint `PATCH /api/student/attempts/:attemptId/essay` với body `{ text }`. Không nhét bài viết vào map `answers`: map đó gắn với index câu hỏi, cap 500 ký tự và đi vào `gradeQuiz`.
2. **Giới hạn độ dài:** `QUIZ_ESSAY_MAX = 10000` ký tự. Bài Task 2 thường 250–400 từ, khoảng 2.500 ký tự, nên 10.000 là dư 4 lần. Riêng route `/essay` có body cap `QUIZ_ESSAY_BODY_MAX = 48 * 1024` byte (đủ cho 10.000 ký tự tiếng Việt UTF-8 3 byte cộng escape JSON). Route này vẫn dưới giới hạn 64KB của `fetch keepalive`. Các route quiz khác giữ cap 4096.
3. **Chỉ đề Writing mới ghi được essay.** Server join `class_assignment → assignment_prompt` và trả 400 khi `skill !== "writing"`. Ownership dùng đúng predicate org + student như PATCH answer (IDOR guard). Attempt đã submitted thì trả 409. Ghi bằng UPDATE có điều kiện `status = 'in_progress'` (D1 không có transaction, cùng precedent với PATCH answer).
4. **Tái dùng nguyên `createQuizAttemptStore` phía client**, không viết store thứ hai. Với đề Writing, route khởi tạo store với key `q = 0`, `send = patchQuizEssay`, và option mới `valueMax = QUIZ_ESSAY_MAX`. Debounce, mirror localStorage, resume dialog, keepalive flush khi `pagehide`, guard `beforeunload`, drain-before-submit và halt 401/409 đều có sẵn. Store chỉ được tạo khi `detail` đã load (isWriting xác định) — tránh cửa sổ store tạo với sender/clamp sai (RT AD-6). Sau flush lúc unmount, route invalidate query detail để SPA-return trong 60s thấy essay mới từ server (RT FMA-6). Mỗi attempt chỉ có một skill nên mirror key `quiz-attempt:{id}` không bị đụng.
5. **`QuizPaper` không đổi API.** Đề Writing render `QuizEssayInput` bind vào `answers[0]` / `onAnswer(0, …)`. Vì essay dùng chung namespace `answers` với câu hỏi, nhánh essay chỉ render khi `skill === "writing" && questions.length === 0` — fail-safe về empty-state nếu dữ liệu vi phạm invariant (RT AD-3). Ở review mode thì `readOnly`; trang review-detail của học viên inject `detail.essay` vào answers (Phase 3.5, RT A). Textarea tắt `spellCheck`, giống thi IELTS thật. Empty-state "không có câu hỏi tự chấm" bị ẩn với Writing.
6. **Đếm từ dùng hàm thuần chung** `countWords` (`packages/api/src/lib/word-count.ts`): trim rồi tách theo whitespace (`/\s+/u`). Từ có gạch nối và số đều tính là 1 từ, đúng quy ước IELTS. `wordCount` bản copy trong `apps/web/src/components/assignments/assignment-presets.ts` được xoá, re-export từ `@teacher-os/api` để teacher preview và student đếm cùng một cách (RT Sec-2). Mục tiêu tối thiểu lấy từ `WRITING_MIN_WORDS` theo `detail.part`: `task1 = 150`, `task2 = 250`; part lạ thì không hiện mục tiêu.
7. **Thiếu từ chỉ cảnh báo, không chặn nộp** (user chốt ngày 2026-10-02). Footer sticky thay cho `QuizNavigator`, hiện "N từ · tối thiểu 150". Dưới mức tối thiểu thì đổi màu cảnh báo. Bấm Nộp khi bài trống hoặc dưới mức tối thiểu sẽ mở guard dialog với copy riêng cho Writing. Học viên vẫn nộp được.
8. **Màn kết quả Writing** (user chốt): `quizAttemptSummarySchema` thêm `essay: z.string().nullable().optional()` (null/undefined = đề không phải Writing; `.optional()` bảo vệ chiều client mới + server cũ — bundle cũ parse payload mới vẫn throw trên schema strict, xem Risks; client normalize `essay ?? null`). Khi `essay ?? null !== null`, summary ẩn `AttemptScoreCard`, `AttemptCompactList` và nút "Xem giải thích chi tiết". Thay vào đó hiện bài đã nộp (read-only, giữ xuống dòng), số từ, và dòng "Giáo viên sẽ chấm bài viết của bạn." Logic render được extract thành component export được để unit test cả hai nhánh (RT AD-4).

## Non-Goals

- Giáo viên đọc/chấm bài viết đã nộp: hiện phía teacher chưa có màn nào đọc `quiz_attempt`. Phần này làm ở issue follow-up (user chốt).
- Speaking (ghi âm), chấm điểm tự động bài viết, timer.
- Rich text trong bài viết: chỉ plain text, đúng format bài thi.
- Tab "Làm thử & Soi bài" của giáo viên: simulation chỉ dựng cho đề auto-graded (`apps/web/src/lib/assignment-quiz-sim.ts`), Writing không đi vào đó.
- Không đổi grading, `answers`, hay luồng của Reading/Listening.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Contract + DB + endpoint essay](./phase-01-contract-db-essay-endpoint.md) | Pending |
| 2 | [UI làm bài Writing: textarea, đếm từ, autosave, guard](./phase-02-take-essay-ui.md) | Pending |
| 3 | [Màn kết quả Writing + e2e + gate cuối](./phase-03-summary-e2e-gates.md) | Pending |

Chạy tuần tự 1 → 2 → 3.

## Success Criteria

- [ ] Đề Writing ở take screen có textarea "Bài viết của bạn". Gõ bài thì header chuyển "Đang lưu…" rồi "Đã lưu". Reload trang thì có resume dialog, bấm tiếp tục thì bài viết còn nguyên.
- [ ] Footer hiện số từ trực tiếp, kèm mục tiêu 150 (Task 1) hoặc 250 (Task 2). Dưới mức thì đổi màu cảnh báo.
- [ ] Nộp khi bài trống hoặc thiếu từ thì có guard dialog. Xác nhận thì vẫn nộp được.
- [ ] Sau nộp, summary hiện bài đã viết và số từ, không còn score card 0/0. Trang detail (`/learn/quizzes/attempt/:id/detail`) của Writing cũng hiện bài đã nộp, không textarea trống.
- [ ] PATCH essay: 200 khi đúng chủ, 404 khi khác học viên/org, 409 khi đã nộp, 400 khi đề không phải Writing hoặc vượt `QUIZ_ESSAY_MAX`, 413 khi body vượt cap. PATCH answer vẫn giữ cap 4096.
- [ ] Reading/Listening không hồi quy: các test e2e cũ trong `student-quiz-take-review.spec.ts` vẫn xanh.
- [ ] `pnpm check`, `pnpm check-types`, `pnpm --filter server test`, `pnpm --filter student test`, `pnpm --filter web test`, e2e `student-quiz-take-review` (ports 8100/8101/8103) xanh.

## Risks

- **Cửa sổ deploy server/student** (đã red-team RT Sec-1 + FMA-2, viết lại cho đúng thực tế; code-review F2 bổ sung): schema summary/detail là `.strict()` nên bundle student CŨ (chưa có key `essay`) parse payload mới vẫn **throw Unrecognized key** trên màn summary/detail cho tới khi reload lấy bundle mới — error boundary, không mất dữ liệu; take screen không bị vì object `attempt` con không strict (strip field lạ). `essay` optional chỉ bảo vệ chiều client mới + server cũ. Các cửa sổ lệch version còn lại: client mới + server cũ thì PATCH `/essay` 404/413 → store giữ pending không retry, `drain()` throw khi nộp → học viên không nộp được (header stuck "Lỗi lưu"); client cũ + server mới thì take screen strip `essay` im lặng → không có resume dialog, màn summary/detail throw tới khi reload, và học viên vẫn nộp được bài Writing rỗng — đây **không phải regression** vì status quo trước feature đã cho nộp rỗng (chính là bug của issue này), nhưng attempt là duy nhất nên nộp rỗng là burn vĩnh viễn. Mitigation: deploy server và student trong cùng một release, server đi trước; ghi rõ thứ tự này trong PR body. Error boundary màn review (`AttemptReviewError`) chỉ có link về trang chủ, không có nút thử lại.
- **Migration:** chỉ `ALTER TABLE ADD COLUMN` có default, không đụng dữ liệu cũ. Vẫn backup D1 trước khi apply ở môi trường thật (theo rule dự án).

## Dependencies

- Xây trên quiz take/review (#283), split-pane (#286) và intro theo cụm (#301), tất cả đã merge.
- Issue theo dõi: [vinh19410/teacher-os#304](https://github.com/vinh19410/teacher-os/issues/304).
- PR đích: `develop`. CI chỉ chạy cho `main`, nên gate là bộ lệnh local ở Phase 3.

## Red Team Review

### Session — 2026-10-02 (ak:vibe controller, 3 reviewer song song: Security Adversary/Fact Checker, Failure Mode Analyst/Flow Tracer, Assumption Destroyer/Contract Verifier; tier Standard)

**Findings:** 17 thô → 12 sau dedupe (7 accepted, 5 rejected/partial)
**Severity breakdown:** 0 Critical, 3 High, 9 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| A | Route review-detail render textarea essay TRỐNG cho bài đã nộp (consumer `QuizPaper` bị bỏ sót; 3 reviewer cùng chỉ) | High | Accept | Phase 3.5 |
| B | Deploy window: plan claim sai (error boundary không có nút thử lại; nộp rỗng burn attempt vĩnh viễn trong cửa sổ) + `essay` required trên schema strict tạo ràng buộc co-deploy không cần thiết khi precedent `.optional()` có sẵn trong file | High | Accept (modified) | Key Decision 8, Risks, Phase 1.1 |
| C | `QuizEssayFooter` thiếu `data-testid="navigator-progress"` → e2e helper `openPaper` sẽ timeout | High | Accept | Phase 2.5 |
| D | Không test nào assert `detail.essay` (quên set ở handler detail thì mọi gate vẫn xanh) | Medium | Accept | Phase 1.6 |
| E | Join `assignmentPrompt` trong `loadAttemptForReview` thiếu predicate `orgId` — mâu thuẫn chuẩn IDOR plan tự đặt ở 1.4 | Medium | Accept | Phase 1.5 |
| F | `aria-live="polite"` trên số từ đổi mỗi keystroke → SR spam hàng trăm thông báo | Medium | Accept (modified) | Phase 2.5 |
| G | SPA-return trong staleTime 60s thấy textarea trống dù server có bài (loader cache cũ + dispose clear mirror) | Medium | Accept (modified) | Key Decision 4, Phase 2.6, 3.3 |
| H | Nhánh essay phân biệt bằng `skill` thôi — lệch invariant `questions: []` thì đè lẫn answers; cần fail-safe + test dữ liệu vi phạm | Medium | Accept | Key Decision 5, Phase 2.4 |
| I | Hedge test 3.1 sai cấu trúc (`AttemptSummaryPage` không export; test file compose thủ công) → cần extract component có khai báo | Medium | Accept | Key Decision 8, Phase 3.1 |
| J | Đường resume từ localStorage mirror (chưa flush) không có test nào | Medium | Accept | Phase 2.1 |
| K | Hook hardcode 5 option khi tạo store; valueMax wiring phải sửa cả `UseQuizAttemptStoreOptions` + body; store tạo trước khi biết skill là race | Medium | Accept (modified) | Key Decision 4, Phase 2.1, 2.6 |
| L | `countWords` song song với `wordCount` đã tồn tại ở web (4 surface teacher dùng) → lệch số đếm về sau | Medium | Accept | Key Decision 6, Phase 1.2 |
| M | Skill gate đọc prompt LIVE, phụ thuộc invariant skill immutable | Medium | Reject (partial) | Phase 1.4 JSDoc only — invariant đã có test pin sẵn (`assignments/tests.test.ts`), thêm JSDoc tham chiếu |
| N | Cap ký tự không khống chế byte (control char paste → 413 wedge không nộp được) | Medium | Accept (modified) | Phase 2.3 — strip C0 controls ở client, bỏ nhánh UI error riêng |
| O | Test CSRF (b) không mở rộng cho `/essay` dù guard bị sửa | Medium | Accept | Phase 1.6 |

**Rejected:** fallback `essay != ""` khi header miss (E) — corrupt-data edge, YAGNI; test mới pin skill-immutability (M) — đã tồn tại; hook test đổi attemptId nhận valueMax mới (K) — store keyed by attemptId, valueMax bất biến theo attempt, guard detail-before-store đủ.

Fact-check tổng: gần như mọi đường dẫn/symbol/line number trong plan VERIFIED đúng (`quizWriteGuard`:565, PATCH answer:1014, `QUIZ_ANSWER_VALUE_MAX`:1657, summary strict:1765, migration 0030, `text-warn` globals.css:151, part domain task1/task2, seed prompt cứng `""`, precedent test `packages/api` ở `apps/student/test`). Sai lệch duy nhất: `CHANGELOG.md` mới nhất là `## 2026-10-01` — Phase 3.4 tạo mục mới `## 2026-10-02`.

### Whole-Plan Consistency Sweep

Sau khi apply findings, rà lại toàn bộ plan.md + phase files:
- Key Decision 5/8 cập nhật đồng bộ với Phase 2.4/3.1/3.5 (điều kiện render, extract component, detail route). Không còn claim "essay: string | null" dạng required ở đâu khác.
- Risks viết lại khớp Key Decision 8 (optional-nullable, không co-deploy strict-parse; mô tả đúng 2 cửa sổ lệch version).
- Phase 2.5 đồng bộ Key Decision 7 (footer) + testid navigator-progress + milestone aria.
- Phase 3 Files list bổ sung `$attemptId.detail.tsx`; Success criteria thêm bullet detail page.
- Không tìm thấy contradiction còn lại.

