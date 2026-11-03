---
title: "#533: Bộ đề tự học (study pack) gán vào lớp, hiển thị theo lịch không cần cron"
description: "Thay cron giao bài của #526 bằng bộ đề (pack) gồm các ngày → bài; gán vào lớp sinh class_assignment kèm available_at, học viên chỉ thấy bài khi available_at <= now (lọc lúc đọc). Bộ đề thư viện hệ thống + bộ đề org; chỉ Reading, Listening, Grammar, Vocabulary (tự chấm, không tốn credit AI)."
status: completed
priority: P1
effort: 18h
issue: 533
branch: feat/533-study-pack
tags: [feature, database, api, backend, frontend]
blockedBy: []
blocks: []
created: 2026-11-01
---

# Plan: #533 — Bộ đề tự học gán vào lớp, hiển thị theo lịch

## Outcome

Giáo viên chọn một **bộ đề** (thư viện hệ thống hoặc do org tự tạo), gán vào lớp với ngày bắt đầu + giờ mở/hạn nộp. Từ đó học viên tự thấy bài của từng ngày đúng lịch mà **không có job định kỳ nào**: mọi bài đã được tạo sẵn lúc gán, và truy vấn phía học viên lọc `available_at <= now`.

## Quyết định đã chốt

| Quyết định | Chọn |
|---|---|
| Grammar & Vocabulary | Thêm hai kỹ năng `grammar` (`g1`: `mcq`, `gap`, `transform`) và `vocabulary` (`v1`: `mcq`, `match`, `gap`) vào `assignment_prompt` (tái dùng engine quiz tự chấm `gradeQuiz`, không liên kết `vocab_deck`/SRS) |
| "Bộ đề có sẵn" | Thư viện hệ thống (admin quản lý, `org_id IS NULL`) + bộ đề org tự tạo; **thay** cron/plan #526 |
| Thông báo bài mới | Bỏ thông báo chủ động (`self_study_released`); học viên thấy bài khi mở app |
| Kỹ năng được phép | `STUDY_PACK_SKILLS = ["reading", "listening", "grammar", "vocabulary"]` — không `writing`/`speaking` (tốn credit AI) |
| Trần giới hạn | `MAX_PACK_DAYS = 366`, `MAX_PACK_ITEMS_PER_DAY = 10`, `MAX_PACK_TOTAL_ITEMS = 200` |
| Dữ liệu #526 trên staging | #526 chỉ mới có trên `develop` (chưa lên `main`/production); gỡ bằng migration `0060_study_pack.sql` kèm hướng dẫn backup D1 trước khi migrate |

## Advisor Scope Lock (`--advice`)

- **Locked Scope:**
  - Migration `0060_study_pack.sql` + schema `study_pack`, `study_pack_item`, `class_study_pack`, `study_pack_exercise` (`libraryExercise`), thêm `class_assignment.available_at` & `class_assignment.class_study_pack_id`, thêm `assignment_prompt.library_ref`, gỡ `self_study_plan*` và `class_assignment.plan_item_id` đồng bộ với `/readyz`.
  - Mở rộng `ASSIGNMENT_SKILLS` thêm `"grammar"` và `"vocabulary"` (giữ `PRACTICE_SKILLS` và `assignmentTestCreateSchema` cố định 4 kỹ năng IELTS, giữ `HISTORY_SKILLS` 5 kỹ năng và lọc `inArray(assignmentPrompt.skill, [...HISTORY_SKILLS])` trong `student-history.ts`), cập nhật `assignment-presets.ts`, `quiz-paper.tsx`, `cloze-stem.tsx`, `question-key-editor.tsx`.
  - API CRUD bộ đề org (`/api/study-packs*`), API thư viện hệ thống admin (`/api/admin/library/packs*`, `/api/admin/library/exercises*`), nhân bản (`POST /api/study-packs/:id/clone`) và `materializePrompts` idempotent.
  - API gán/xem/huỷ bộ đề trên lớp (`GET/POST/DELETE /api/classes/:classId/study-packs*`), lọc `visibleAssignmentFilter(now)` trên toàn bộ đường đọc/làm bài của học viên, hook backfill học viên vào lớp muộn trong `activateEnrollment`, cô lập `snapshot.ts` + trần 200 bài, và gỡ sạch cron `*/5` + module `#526`.
  - UI quản lý bộ đề (`/assignments/packs`) + khu vực `"Bộ đề tự học"` trong `/classes/$classId` + E2E spec `study-pack.spec.ts`.
- **Explicit Non-Goals:**
  - Writing/Speaking/AI grading và mọi thao tác tốn credit.
  - Sửa giờ/lịch của pack đang chạy (V1: huỷ rồi gán lại).
  - Thông báo email/in-app chủ động khi mở bài.
  - Giao full test (`assignment_test`) hoặc SRS vocab (`vocab_deck`) qua pack.

## Kiến trúc

```
study_pack (org_id NULL = thư viện hệ thống)
  └─ study_pack_item (day_index, position, source_kind, source_id)
       source_kind: org_prompt | library_test_part | library_exercise

Gán vào lớp  ──►  class_study_pack (class, pack, start_date, release_time, due_time)
   (chunked db.batch <= 50 statements, idempotent bằng id tất định + onConflictDoNothing)
   ├─ clone nguồn thư viện → assignment_prompt(ready) của org (1 lần, dedupe theo library_ref)
   ├─ class_assignment × item   (available_at, due_at, class_study_pack_id)
   └─ class_assignment_target × học viên active

Đọc phía học viên:  WHERE available_at IS NULL OR available_at <= :now
Học viên vào lớp sau: hook trong activateEnrollment (enrollment-activation.ts) tạo target cho các bài có due_at > now
```

Lịch: ngày thứ `d` (`1..maxDay`) dùng con trỏ ngày bắt đầu từ `start_date`, tiến từng ngày và **bỏ qua ngày nghỉ** (`organization_holiday` phạm vi org/lớp từ `loadExistingHolidayDates`) — tính một lần lúc gán, không cần job nền.

## Phases

| # | Phase | Status | Effort | Dependencies |
|---|---|---|---|---|
| 1 | [Schema, migration 0060, gỡ #526 & contracts](./phase-01-schema-migration-contracts.md) | Completed | 3.5h | — |
| 2 | [Dạng bài Grammar & Vocabulary tự chấm](./phase-02-grammar-vocabulary-exercises.md) | Completed | 4h | Phase 1 |
| 3 | [Bộ đề: API org + thư viện hệ thống](./phase-03-pack-library-and-org-api.md) | Completed | 4h | Phase 1, 2 |
| 4 | [Gán vào lớp, lọc lúc đọc & hook enrollment](./phase-04-assign-to-class-and-read-time-gate.md) | Completed | 3.5h | Phase 1, 3 |
| 5 | [UI giáo viên, kiểm chứng học viên & E2E](./phase-05-ui-and-e2e.md) | Completed | 3h | Phase 2, 3, 4 |

## Extension trace

- **Boundary:** `class_assignment.available_at` + helper `visibleAssignmentFilter(now)` (`apps/server/src/lib/assignment-visibility.ts`) và `materializePrompts` (`apps/server/src/lib/study-pack-clone.ts`).
- **Credible next variant:** Thêm một nguồn học liệu mới vào bộ đề.
- **Stable contract:** `class_assignment` giữ nguyên thời điểm tuyệt đối `available_at` / `due_at` (`timestamp_ms`) và mọi đường đọc học viên lọc qua `visibleAssignmentFilter(now)` mà không cần biết nguồn gốc của đề.
- **Pieces that would change:** Chỉ thêm giá trị vào `source_kind` và một nhánh materialize trong `study-pack-clone.ts`; cơ chế lịch, lọc lúc đọc và backfill học viên không đổi.

## Red Team Review

| # | Lens | Severity | Finding | Evidence | Disposition |
|---|---|---|---|---|---|
| RT-1 | Security Adversary & Assumption Destroyer | Critical | Đường làm bài của học viên (`PATCH /answer`, `POST /submit`, `loadOwnedAttemptWithSkill`, `loadAttemptForReview`, `GET /media`) bỏ sót hoặc đặt sai vị trí lọc `available_at <= now` | `apps/server/src/routes/student.ts:793-844,1173,1295,1396,1724,1762,1924-1957`, `student-class.ts:144-224`, `student-history.ts:242`, `dashboard-reminders.ts:164` | **Accept** — Tạo `visibleAssignmentFilter(now)` và kiểm tra `availableAt <= now` ở cả `loadClassAssignmentItems`, `GET quiz`, `POST quiz/start`, `loadOwnedAttemptWithSkill` (gọi trước `PATCH /answer`, `GET /media`, `POST /submit`), `loadAttemptForReview`, `student-history.ts`, `dashboard-reminders.ts` trong Phase 4. |
| RT-2 | Assumption Destroyer | Critical | Thêm `grammar`/`vocabulary` làm vỡ `HISTORY_SKILLS`/`student-history.ts`, thiếu `packages/ui` (`assignment-presets.ts`, `quiz-paper.tsx`), thiếu ô `<input>` khi `transform`/`gap` không có `____` trong `ClozeStemText`, và thiếu đăng ký `match` cho `optionBank` | `packages/api/src/contracts.ts:313-445,749-866,990,2024`, `packages/ui/src/components/assignments/editor/assignment-presets.ts:44-69,336`, `packages/ui/src/components/quiz/quiz-paper.tsx:44,78`, `packages/ui/src/components/assignments/cloze-stem.tsx:148`, `apps/server/src/routes/student-history.ts:240,311,413` | **Accept** — Cập nhật đầy đủ các map `Record<AssignmentSkill, ...>`, giữ `assignmentTestCreateSchema` ở `PRACTICE_SKILLS`, thêm `"grammar"` vào `HISTORY_SKILLS` + `student-history.ts`, cập nhật `assignment-presets.ts` + `quiz-paper.tsx`, và hiển thị `<input>` fallback trong `ClozeStemText` cho câu hỏi không có `____` trong Phase 2. |
| RT-3 | Assumption Destroyer & Failure Mode Analyst | Critical | Tách việc drop bảng `#526` ở Phase 1 với xoá export `schema/index.ts` ở Phase 4 làm hỏng `/readyz` (503) và `check-types`; rebuild bảng `class_assignment` trên D1 gây cascade xoá sạch `quiz_attempt`; xoá `study_pack` sau khi `cancelled` gây mất dữ liệu hoặc lộ vào snapshot | `apps/server/src/routes/readiness.ts:24-88`, `packages/db/src/migrations/0041_known_ink.sql:3-8`, `packages/db/src/schema/quiz-attempt.ts:46-48` | **Accept** — Dùng `ALTER TABLE` tại chỗ trong `0060_study_pack.sql` (kèm dọn `notification_record` type `self_study_released`), gỡ đồng bộ `self-study-plan` khỏi `schema/index.ts` + code `#526` ngay trong Phase 1 để `/readyz` và `check-types` luôn xanh; giữ `class_study_pack_id` không cascade xoá `class_assignment` và chặn xoá `study_pack` khi đã từng được gán vào lớp. |
| RT-4 | Failure Mode Analyst | Critical | Vượt trần 100 biến bind / giới hạn batch của D1 khi tạo pack, clone `assignment_prompt` (22 cột) và gán pack; hỏng idempotency hoặc kẹt "huỷ rồi gán lại" nếu `class_study_pack` thiếu partial unique index | `packages/db/src/schema/assignment-prompt.ts:13-43`, `packages/db/src/schema/class-assignment.ts:19-68`, `apps/server/src/routes/holidays.ts:35-38` | **Accept** — Đặt `MAX_PACK_TOTAL_ITEMS = 200`, chunk `D1_PROMPT_CLONE_INSERT_CHUNK = 4`, `D1_PACK_ITEM_INSERT_CHUNK = 10`, `D1_ASSIGNMENT_INSERT_CHUNK = 8`, `D1_TARGET_INSERT_CHUNK = 15`, `D1_IN_ARRAY_CHUNK = 50`, `D1_BATCH_STATEMENT_LIMIT = 50`; thêm `uniqueIndex("class_study_pack_class_pack_active_uq").on(classId, packId).where(status = 'active')` và xoá tường minh `class_assignment_target` trước `class_assignment` khi huỷ. |
| RT-5 | Security Adversary & Failure Mode Analyst | Critical | `materializePrompts` mất `groups`/`optionBank` khi clone `library_test_part`, lỗi FK khi `onConflictDoNothing` không trả `id`, lộ `draft` system pack, làm phình `snapshot.assignmentPrompts`, và thiếu audio player cho `listening` hệ thống | `packages/db/src/schema/library-test.ts:69,75`, `packages/api/src/library-contracts.ts:207-220`, `apps/server/src/routes/snapshot.ts:276-286` | **Accept** — Thêm bảng `library_exercise` cho đề hệ thống (Reading/Grammar/Vocabulary), chặn `listening` `library_test_part` ở V1 với lỗi 422 rõ ràng, flatten `groups` khi clone `library_test_part`, luôn `SELECT id, library_ref` sau `onConflictDoNothing`, lọc `isNull(assignmentPrompt.libraryRef)` trong `snapshot.ts`, và kiểm tra chặt `status = 'ready'` cho system pack trong Phase 3 & Phase 4. |
| RT-6 | Assumption Destroyer | Critical | Phase 4 chỉ sai chỗ hook enrollment (`activateEnrollment` trong `enrollment-activation.ts` mới là hàm duy nhất), yêu cầu gỡ nhầm `holidays.ts`, thiếu `GET /api/classes/:classId/study-packs`, và thiếu đăng ký `/assignments/packs` trong `routes-matcher.ts` | `apps/server/src/routes/enrollment-activation.ts:272-557`, `apps/server/src/routes/holidays.ts:165-196`, `apps/web/src/routes-matcher.ts:39-53`, `apps/web/src/routes-matcher.test.ts:127-153` | **Accept** — Gắn hook backfill vào `activateEnrollment` (cả nhánh idempotent `status === "active"`), giữ nguyên `loadExistingHolidayDates` trong `holidays.ts`, bổ sung `GET /api/classes/:classId/study-packs` (kèm lịch nghỉ của lớp), đăng ký `/assignments/packs` vào `routes-matcher.ts`, và thêm `/__e2e/study-pack-shift` trong `apps/e2e/src/boot.ts`. |

### Whole-Plan Consistency Sweep (Red-Team)
- Đã đồng bộ toàn bộ 6 quyết định RT-1..RT-6 xuyên suốt `plan.md` và `phase-01`..`phase-05.md`. Không còn mâu thuẫn giữa thứ tự gỡ `#526`, tên file (`grade-quiz.ts`, `assignment-prompt.ts`, `enrollment-activation.ts`, `holidays.ts`), schema/index (`/readyz`), và các lệnh `Verify`.

## Validation Log

### Verification Results
- Claims checked: 82
- Verified: 82 | Failed: 0 | Unverified: 0 (all 10 initial discrepancies and 1 unverified audio item resolved via RT-1..RT-6 propagation)
- Tier: Full (5 phases — Fact Checker, Contract Verifier, Assumption Destroyer, Security/Failure Reviewer)
- Failures: None remaining after updating Phase 1–5 target files, contracts, and verify commands.

### Whole-Plan Consistency Sweep (Validation)
- Mọi tên bảng (`study_pack`, `study_pack_item`, `class_study_pack`, `study_pack_exercise`), cột mới (`available_at`, `class_study_pack_id`, `library_ref`), hằng số (`STUDY_PACK_SKILLS`, `MAX_PACK_DAYS = 366`, `MAX_PACK_ITEMS_PER_DAY = 10`, `MAX_PACK_TOTAL_ITEMS = 200`), endpoint (`/api/study-packs*`, `/api/admin/library/packs*`, `/api/classes/:classId/study-packs*`), và khối `## Failure Protocol` đã nhất quán ở cả 5 phase.

## Success criteria

- [x] Gán pack vào lớp; trước `available_at` học viên không thấy bài (list, mở quiz, bắt đầu, lưu đáp án, nộp, xem kết quả), sau đó thấy ngay mà không có tiến trình nền.
- [x] `packages/infra` không còn `crons`; `scheduled` handler và `runSelfStudyPlanTick` đã gỡ sạch.
- [x] Pack chỉ chứa `reading`, `listening`, `grammar`, `vocabulary`; item `writing`/`speaking` bị từ chối ở API.
- [x] Bộ đề thư viện clone/gán được vào org; chạy lại không tạo trùng prompt hay bài.
- [x] Bài từ pack và prompt thư viện materialize ngầm không tính vào trần 200 bài và không làm phình `KernelSnapshot`.
- [x] Học viên vào lớp giữa chừng qua `activateEnrollment` nhận các bài còn hạn (`due_at > now`).
- [x] `pnpm exec biome check .`, `pnpm check-types`, `pnpm test` xanh; E2E spec `study-pack.spec.ts` xanh.
