---
title: "Giáo viên xem và chấm bài Writing/Speaking học viên đã nộp"
description: "Giáo viên mở bài Writing (essay) hoặc Speaking (file audio/video) học viên đã nộp từ tab Bài tập của lớp, chấm 4 tiêu chí IELTS + nhận xét; học viên thấy band và nhận xét ngay trên màn kết quả."
status: completed
priority: P1
effort: "16h"
issue: 319
branch: develop
tags: [feature, frontend, backend, database, quiz, grading]
blockedBy: [261005-1523-remove-settings-route]
blocks: []
created: 2026-10-05
---

# Giáo viên xem và chấm bài Writing/Speaking học viên đã nộp

> **⚠️ CHỜ REBASE — plan #321 (`chore/remove-settings-route`) gỡ `apps/web/src/lib/repos/settings.ts` và dịch các dòng trong `apps/server/src/routes/kernel.ts` (~135 dòng).** Phase 03 của plan này đã được cập nhật sẵn trong nhánh #321 (`getApiBaseUrl` từ `./api-base-url`, cite kernel.ts đổi sang symbol anchor). Rebase lên `develop` sau khi #321 merge rồi mới thực thi. <!-- Updated: settings route removed 2026-10-05 -->

## Overview

Học viên đã nộp được bài Writing (cột `quiz_attempt.essay`, #304) và bài Speaking (file trên R2, cột `quiz_attempt.media_*`, #305). Phía giáo viên hiện chưa có đường nào đọc `quiz_attempt`:

- Tab "Bài tập" trong trang chi tiết lớp ([class-assignments-tab.tsx:716-748](../../apps/web/src/components/classes/class-assignments-tab.tsx)) chỉ hiện "Đã nộp" + thời điểm nộp cho từng học viên. Không có link xem bài.
- Màn kết quả của học viên ghi cứng "Giáo viên sẽ chấm bài viết/nói của bạn." ([`$attemptId.tsx:143,168`](../../apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx)). Không có chỗ nào hiện điểm.
- Màn `/assignments/$assignmentId` + `GradeModal` đang có là luồng **legacy**: chạy trên bảng `assignment` cũ ([assignment.ts](../../packages/db/src/schema/assignment.ts)), không nối với `quiz_attempt`. Ô nhận xét ở màn đó cũng không được lưu. Plan này **không** dùng lại luồng đó.

Plan này làm trọn vòng chấm bài:

1. Giáo viên vào lớp, mở tab Bài tập. Mỗi học viên **đã nộp** một đề Writing/Speaking có nút "Chấm bài", hoặc tag "Đã chấm · Band X" kèm link "Xem / sửa điểm".
2. Trang chấm `/grading/$attemptId` hiện:
   - đề bài (đề rich-text, ảnh Task 1, cue card),
   - bài làm: essay kèm số từ, hoặc player nghe/xem file nói,
   - form chấm 4 tiêu chí IELTS (0–9, bước 0.5), band tổng tự tính, ô nhận xét.
3. Bấm "Lưu điểm" thì học viên thấy band, điểm 4 tiêu chí và nhận xét ngay trên màn kết quả. Giáo viên sửa lại được bất cứ lúc nào.

## Key Decisions (user chốt 2026-10-05)

1. **Học viên thấy kết quả ngay khi giáo viên lưu.** Không có trạng thái nháp hay nút "Trả bài". Giáo viên sửa điểm thì ghi đè: `graded_at` cập nhật, học viên thấy bản mới nhất.
2. **4 tiêu chí IELTS + band tổng tự tính, kèm nhận xét chữ.**
   - Writing dùng key `task`, `coherence`, `lexical`, `grammar`. Nhãn của `task` theo part: `task1` là "Task Achievement", `task2` là "Task Response".
   - Speaking dùng key `fluency`, `lexical`, `grammar`, `pronunciation`.
   - Mỗi tiêu chí 0–9, bước 0.5 (`v*2` phải là số nguyên).
   - Band tổng = trung bình 4 tiêu chí, làm tròn theo quy ước IELTS (`.25` lên `.5`, `.75` lên số nguyên kế): `Math.round(avg * 2) / 2`. Hàm thuần `ieltsOverallBand` dùng chung cho server, web và student. Band **không lưu DB**, luôn derive từ scores, nên không lệch.
   - Nhận xét là plain text, tối đa `QUIZ_FEEDBACK_MAX = 5000` ký tự, được phép rỗng. Render bằng `whitespace-pre-wrap`, không dùng HTML, nên không có bề mặt XSS.
3. **Lối vào là tab Bài tập trong lớp.** Không đụng `apps/web/src/routes/_auth/assignments/index.tsx` vì file này thuộc việc lọc trang Bài tập (ngoài phạm vi). Không làm hàng đợi "Cần chấm" toàn org.
4. **Lưu điểm trên chính `quiz_attempt`** (migration 0033), cùng precedent #304/#305 "1 attempt mỗi lượt giao, không tạo bảng mới". Thêm 3 cột:
   - `grade_scores text` (JSON, nullable, null = chưa chấm),
   - `grade_feedback text NOT NULL DEFAULT ''`,
   - `graded_at integer` (timestamp_ms, nullable).
5. **API giáo viên keyed theo `attemptId`.** Router mới `apps/server/src/routes/grading.ts` mount trong kernel (`kernel.route("/grading", …)`), nên có sẵn Origin guard, guard JSON content-type cho POST và role gate teacher. Tenancy là `quiz_attempt.org_id = ctx.orgId`.
   - `GET /api/grading/:attemptId`: trả bài nộp kèm đề và điểm hiện tại.
   - `GET /api/grading/:attemptId/media`: stream file Speaking, header giống route học viên.
   - `POST /api/grading/:attemptId/grade`: body `{ scores, feedback }`, ghi đè điểm.

   Mã lỗi: 401 khi không có session (mọi route kiểm `kernelCtx` trước tiên); 404 khi attempt không thuộc org; 409 `NOT_SUBMITTED` khi attempt còn `in_progress` (chỉ chấm sau khi nộp); 400 `SKILL_NOT_GRADABLE` khi đề không phải writing/speaking; 400 `invalid body` / `invalid scores` khi body sai.
6. **Snapshot kernel mang trạng thái chấm theo từng target.** `KernelClassAssignmentRow.targets[]` thêm 3 field:
   - `attemptId: string | null`: chỉ attempt đã `submitted`,
   - `gradedAt: string | null`,
   - `band: number | null`.

   Tab Bài tập dùng 3 field này để chọn nút "Chấm bài" hay tag "Đã chấm · Band X". Phía web, type `ClassAssignment.targets` khai **optional** cho 3 field này để fixture test cũ (kể cả `assignments/index.test.tsx` và tab Bài tập ở trang học viên của #318) vẫn compile.
7. **Media cho giáo viên phát bằng blob fetch** (`credentials: "include"`), cùng lý do và precedent `QuizMediaPlayer` của #305. Route GET media của giáo viên dùng chung helper dựng `Response` với route học viên: tách ra `apps/server/src/lib/media-response.ts` (DRY) và giữ nguyên header `nosniff` + CSP sandbox + `no-store`. Middleware CORP `same-site` ở `app.ts` mở rộng thêm path giáo viên.
8. **Summary học viên thêm `grade` và `part` optional** (`quizAttemptGradeSchema.nullable().optional()`, `z.string().optional()`). `part` cần để nhãn tiêu chí Writing đúng Task Achievement/Response. Server **chỉ thêm 2 key này khi đã chấm**. Như vậy bundle học viên cũ (schema `.strict()`) chỉ lỗi parse ở attempt đã được chấm, thay vì mọi attempt. Đây là cửa sổ lệch version hẹp hơn precedent #304/#305; reload là hết. Route detail không trả `grade`.
9. **Trang chấm là route riêng `/grading/$attemptId`** (một segment động, thêm prefix `/grading/` vào `routes-matcher.ts`). Không lồng dưới `/classes/$classId` vì `$classId.tsx` là leaf route không có `<Outlet/>`. Nút "← Về lớp" dẫn tới `/classes/$classId?tab=assignments`. Route lớp thêm `validateSearch` cho `tab` optional, mở đúng tab Bài tập.

## Non-Goals

- Chấm Reading/Listening: đã tự chấm.
- Hàng đợi "Cần chấm" toàn org, badge đếm bài chưa chấm ở sidebar hay dashboard.
- Nháp điểm, nút "Trả bài", thông báo (notif/email) cho học viên khi có điểm.
- Chú thích inline trên essay (highlight, sửa lỗi từng câu) và ngân hàng nhận xét trong trang chấm.
- Lịch sử các lần sửa điểm, cột `graded_by` (ai chấm).
- Đổi hoặc xoá luồng legacy `assignment` / `GradeModal` / `/assignments/$assignmentId`.
- Hiện điểm ở overview hoặc danh sách bài của học viên. Chỉ màn kết quả attempt hiện điểm.
- Hiện band hoặc link chấm ở tab Bài tập trong trang chi tiết học viên phía giáo viên (thêm ở #318). User chốt giữ phạm vi ngày 2026-10-05; để làm follow-up.
- Cho học viên nộp lại sau khi bị chấm (không có retake v1).

## Phases

| # | Phase | Status | Effort |
|---|-------|--------|--------|
| 1 | [Contract + DB + hàm band dùng chung](./phase-01-contract-db-band.md) | Done | 2.5h |
| 2 | [Server: API chấm bài + snapshot + summary học viên](./phase-02-server-grading-api.md) | Done | 4.5h |
| 3 | [Web giáo viên: trang chấm + nút ở tab Bài tập](./phase-03-web-grading-ui.md) | Done | 5h |
| 4 | [Student: hiện band + nhận xét ở màn kết quả](./phase-04-student-grade-display.md) | Done | 1.5h |
| 5 | [E2E + docs + gate cuối](./phase-05-e2e-docs-gates.md) | Done | 2.5h |

Chạy tuần tự 1 → 2 → 3 → 4 → 5. Phase 3 và 4 chỉ phụ thuộc Phase 1–2 nên có thể đảo thứ tự, nhưng không chạy song song (cùng sửa `CHANGELOG.md` ở Phase 5).

## Success Criteria

- [x] Ở tab Bài tập của lớp, học viên đã nộp đề Writing/Speaking chưa chấm có nút "Chấm bài". Đề Reading/Listening và học viên chưa nộp không có nút.
- [x] Trang `/grading/$attemptId` với Writing hiện đề (kể cả ảnh Task 1), essay giữ xuống dòng, số từ và mục tiêu tối thiểu theo part. Với Speaking, trang hiện cue card/câu hỏi, tên file, dung lượng và nút "Nghe bài nói"/"Xem bài nói"; bấm vào thì phát đúng file.
- [x] Form chấm có 4 select tiêu chí đúng theo skill. Band tổng cập nhật ngay khi đổi. Nút "Lưu điểm" disable tới khi đủ 4 tiêu chí. Lưu xong hiện "Đã lưu", tag ở tab Bài tập đổi thành "Đã chấm · Band X".
- [x] Mở lại trang chấm của bài đã chấm thì form điền sẵn điểm và nhận xét cũ. Sửa rồi lưu thì ghi đè.
- [x] Màn kết quả học viên của bài đã chấm hiện band tổng, 4 tiêu chí (nhãn tiếng Anh IELTS) và nhận xét, thay cho dòng "Giáo viên sẽ chấm…". Bài chưa chấm giữ nguyên dòng cũ.
- [x] API: giáo viên org khác nhận 404 (IDOR). Attempt `in_progress` trả 409. Đề reading trả 400. Thiếu tiêu chí, thừa key, điểm lẻ 0.25 hoặc > 9 trả 400. Nhận xét > 5000 ký tự trả 400. Origin lạ trả 403. Session học viên trả 403 (role gate có sẵn). Không có session trả 401.
- [x] Reading/Listening, luồng nộp Writing/Speaking của học viên và luồng legacy `/assignments/$assignmentId` không hồi quy.
- [x] `pnpm check`, `pnpm check-types`, `pnpm --filter @teacher-os/api test`, `pnpm --filter server test`, `pnpm --filter web test`, `pnpm --filter student test` và e2e `teacher-grade-submission`, `student-quiz-take-review`, `student-class-detail`, `class-assign` (ports 8100/8101/8103) đều xanh.

## Risks

- **Cửa sổ lệch version (student):** bundle cũ + server mới chỉ lỗi parse summary của attempt **đã chấm**, vì key `grade` chỉ xuất hiện khi có điểm. Error boundary `AttemptReviewError` không có nút thử lại; reload là lấy bundle mới. Giảm thiểu: deploy server và student trong cùng release, server đi trước.
- **Hai giáo viên cùng org chấm một bài:** ghi sau thắng (last-write-wins), không có khoá. Chấp nhận ở v1 vì org hiện là 1 giáo viên.
- **Kích thước snapshot:** `loadSnapshot` thêm một query `quiz_attempt` theo `org_id`, có index `quiz_attempt_org_idx`, chỉ select 5 cột nhẹ (không lấy essay/answers/snapshot). Không đáng kể ở quy mô pilot.
- **Thứ tự deploy migration:** worker mới select cột `grade_*` ở `loadSnapshot` (mọi trang giáo viên) và ở `db.select().from(quizAttempt)` (màn làm bài/kết quả học viên). Nếu worker lên trước migration 0033 thì các trang đó trả 500, trong khi `/readyz` vẫn xanh vì probe không kiểm cột. Giảm thiểu: header DEPLOY ORDER trong file 0033 (precedent 0028) và ghi vào runbook.
- **Cache màn kết quả học viên:** `staleTime` 60s (`apps/student/src/lib/repos/quiz.ts:177`). Học viên đã mở summary trước khi được chấm có thể thấy bản cũ tối đa khoảng 60 giây khi điều hướng trong SPA; reload thì thấy ngay. Chấp nhận.
- **Migration:** chỉ `ALTER TABLE ADD COLUMN` (nullable hoặc có default), không đụng dữ liệu cũ. Vẫn backup D1 trước khi apply ở môi trường thật (theo rule dự án) và ghi 0033 vào `docs/production-release-runbook.md`.
- **Bài Speaking nộp rỗng trước #305** (`media = null`): trang chấm hiện "Bài này được nộp khi chưa có file bài nói." và vẫn cho chấm.

## Dependencies

- Xây trên #283 (quiz attempt), #304 (essay) và #305 (media + `MediaStore`), tất cả đã merge vào `develop`.
- PR đích: `develop`. CI chỉ chạy cho `main`, nên gate là bộ lệnh local ở Phase 5 (theo `AGENTS.md`).
- Thực thi dưới `--advice`: mỗi phase có Failure Protocol riêng. Verify fail thì STOP và hỏi `kongming`, không tự suy luận để đi tiếp.

## Red Team Review

### Session — 2026-10-05 (checkpoint `--advice`, 1 reviewer `kongming` phủ 4 lens: Security Adversary, Assumption Destroyer/Fact Checker, Failure Mode Analyst, Scope & Complexity Critic)

Agent `kongming` được spawn với kit tier `fable`, nhưng runtime báo phiên chạy trên Opus 5.5, không phải Fable. Quy trình review giữ nguyên.

**Findings:** 12 (0 Critical, 5 High, 7 Medium). Mọi finding đều có evidence file:line; user chọn áp dụng cả 12.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| H1 | Biến `grade` khai báo trùng trong handler summary (`student.ts:1705` đã destructure `grade` của `gradeQuiz`) | High | Accept | Phase 2 Task 2.5 |
| H2 | `kernel.test.ts:5785-5790` assert `targets` bằng equality đầy đủ, sẽ đỏ khi thêm 3 field | High | Accept | Phase 2 Files + Task 2.5 bước 4 |
| H3 | Task 3.8 typecheck `search={{ tab }}` trước khi route lớp có `validateSearch` (Task 3.10) | High | Accept | Phase 3 Task 3.8 bước 0, Task 3.10 |
| H4 | E2E dùng lại context học viên sau signup, `signIn` không thấy form (redirect + tab lưu localStorage) | High | Accept | Phase 5 Task 5.2 |
| H5 | `orgIdForTeacherEmail` truy vấn một lần, race với bootstrap org (precedent `seedStudent` có retry) | High | Accept | Phase 5 Task 5.1 |
| M1 | Route media/POST thiếu kiểm `kernelCtx`, không session ra 500/503 thay vì 401 | Medium | Accept | Phase 2 Task 2.3, case 17 |
| M2 | Thứ tự deploy migration 0033: blast radius toàn app giáo viên, `/readyz` không phát hiện | Medium | Accept | Phase 1 Task 1.4 bước 5, Phase 5 Task 5.4, Risks |
| M3 | Snapshot tự tính band riêng, trùng logic `toQuizAttemptGrade` | Medium | Accept | Phase 2 Task 2.5 bước 2 |
| M4 | Ảnh đề Task 1 thiếu kiểm `ASSIGNMENT_IMAGE_SRC_PATTERN` và `referrerPolicy` | Medium | Accept | Phase 3 Task 3.6 |
| M5 | Nội dung testid band mơ hồ; textarea thiếu label; link "Chấm bài" thiếu tên học viên cho AT | Medium | Accept | Phase 3 Task 3.4, 3.9 |
| M6 | `type` của prompt e2e mơ hồ (spec cũ là task1/chart); `issue: TBD` sẽ ra `(#TBD)` | Medium | Accept | Phase 5 Task 5.2, 5.4 |
| M7 | Hồi quy e2e bỏ sót `student-class-detail` (cũng dùng `seedQuizFixture`) | Medium | Accept | Phase 5 Task 5.3, 5.5 |

### Whole-Plan Consistency Sweep

- `grep` toàn plan cho `chưa commit`: 3 file của việc lọc trang Bài tập đã được commit (`e5b4114`), nên lý do "không đụng" đổi thành "ngoài phạm vi"; checksum ở Task 5.0/5.5 giữ nguyên làm hàng rào formatter.
- `grep` cho `studentContext`, `const grade =` ở server, `ieltsOverallBand` ở snapshot: không còn bản cũ. Task 3.10 chỉ còn matcher; `validateSearch` chỉ mô tả ở Task 3.8 bước 0.
- Key Decision 5 có thêm 401; Success Criteria thêm 401 và đủ 4 spec e2e; Risks thêm thứ tự deploy và cache 60s.
- Commit #318 (tab Bài tập trang học viên) chỉ đọc `studentId`/`submittedAt`; field mới optional phía web nên không xung đột. Ghi vào Non-Goals theo lựa chọn của user.
- Không còn mâu thuẫn chưa giải quyết.

## Validation Log

### Session 1 — 2026-10-05

User chốt 5 quyết định qua phỏng vấn (3 trước khi soạn plan, 2 sau red-team):
1. Học viên thấy kết quả ngay khi giáo viên lưu (không nháp/trả bài).
2. Chấm 4 tiêu chí IELTS + band tự tính + nhận xét.
3. Lối vào là tab Bài tập trong lớp, không làm hàng đợi toàn org.
4. Áp dụng cả 12 finding red-team.
5. Không thêm lối chấm ở tab Bài tập trang học viên (#318); để follow-up.

### Verification Results
- Tier: Full (5 phase), do `kongming` kiểm chứng bằng đọc code thật.
- Claims checked: khoảng 40 | Verified: tất cả claim còn lại sau khi sửa | Failed: 5 (H1–H5, đã sửa trong plan) | Unverified: 0.
- Các claim đã xác minh gồm: Hono nested route thừa hưởng Origin guard (anchor theo symbol: `kernel.use("*")` guard đầu `kernelRoutes`, mount `kernel.route("/assignments", …)` — cite theo số dòng (`kernel.ts:91-109`, `:2120-2123`) đã lệch sau khi issue #321 gỡ handler settings, ~135 dòng); role gate (`app.ts:86`); CORP override (`app.ts:136-139`); mốc dòng contracts (1342, 1732–1741, 1851–1882); `loadAttemptForReview` select full row (`student.ts:1650`); `validateSearch` key optional không bắt buộc `search` ở Link (precedent `profile.tsx:26-28`, `login.tsx:20` — precedent cũ `settings.tsx:39-52` đã xoá cùng trang `/settings`); `routeTree.gen.ts` bị gitignore; `kernelQueryKey` được observe nên invalidate sẽ refetch; testid `media-dropzone-input`; zod 4 `.refine` trong `.strict()`; drizzle `text(mode:"json").$type`. <!-- Updated: settings route removed 2026-10-05 -->

### Whole-Plan Consistency Sweep
Đã chạy chung với sweep của Red Team Review ở trên. Không còn mâu thuẫn.
