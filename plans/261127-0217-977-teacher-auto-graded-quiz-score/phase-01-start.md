---
phase: 1
title: "Phase 1: Objective Score Helper, Server Snapshot & Mapper (TDD)"
status: completed
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Objective Score Helper, Server Snapshot & Mapper (TDD)

<!-- Updated: Red-Team Session 1 & Validation Session 1 - isSafeInteger, JSON1 object-count + skill guard, hasGradableTask + submittedAt fallback + demo-student filter, standalone describe in grading.test.ts -->

## Goal

Cung cấp hàm kiểm chuẩn điểm trắc nghiệm dùng chung (`normalizeObjectiveScore`, `formatObjectiveScore`, `hasValidGradedBand`), mở rộng wire contract + mapper `classAssignments[]` / `targets[]`, và truy vấn an toàn `correctCount`, `totalQuestions` (JSON1 đếm phần tử `'object'` chỉ cho kỹ năng tự chấm), `hasGradableTask` và `submittedAt` fallback trong `apps/server/src/routes/snapshot.ts` mà không thêm migration DB và không phát `0/0` cho bài Writing/Speaking.

## Files to Create / Modify

- Create: `packages/api/src/lib/objective-score.ts`
- Create: `packages/api/src/lib/objective-score.test.ts`
- Modify: `packages/api/src/contracts.ts`
- Modify: `apps/server/src/routes/snapshot.ts`
- Modify: `apps/server/src/kernel.test.ts`
- Modify: `apps/server/src/routes/grading.test.ts`
- Modify: `apps/web/src/lib/mock-data.ts`
- Modify: `apps/web/src/lib/repos/class-assignments.ts`
- Modify: `apps/web/src/lib/repos/class-assignments.test.ts`

## Tasks & Steps

### Task 1.1 — Viết test đỏ và cài đặt helper `objective-score` trong `@teacher-os/api` (TDD)

- **Goal:** Có nguồn chân lý duy nhất kiểm chuẩn và định dạng điểm trắc nghiệm `X/Y` (dùng `Number.isSafeInteger`) và hàm kiểm chuẩn `hasValidGradedBand` dùng chung cho server và web.
- **Target files and symbols:**
  - `packages/api/src/lib/objective-score.test.ts` (new)
  - `packages/api/src/lib/objective-score.ts` (`ObjectiveScore`, `normalizeObjectiveScore`, `formatObjectiveScore`, `hasValidGradedBand`)
- **Steps:**
  1. Tạo `packages/api/src/lib/objective-score.test.ts` kiểm thử:
     - `normalizeObjectiveScore` + `formatObjectiveScore` hợp lệ: `(3, 3)` → `{ correctCount: 3, totalQuestions: 3 }` / `"3/3"`; `(0, 3)` → `{ correctCount: 0, totalQuestions: 3 }` / `"0/3"`; `(2, 10)` → `{ correctCount: 2, totalQuestions: 10 }` / `"2/10"`.
     - `normalizeObjectiveScore` không hợp lệ (trả về `null`): `(0, 0)`, `(null, 3)`, `(3, null)`, `(undefined, 3)`, `(-1, 3)`, `(4, 3)`, `(1.5, 3)`, `(2, 3.5)`, `(Number.NaN, 3)`, `(3, Number.POSITIVE_INFINITY)`, `(Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 1)`, `(1e21, 1e21)`, `("3", "3")`.
     - `hasValidGradedBand`: chấp nhận `{ band: 0, gradedAt: "2026-11-26T08:00:00.000Z" }` và `{ band: 6.5, gradedAt: "2026-11-26T08:00:00.000Z" }`; từ chối `band: null`, `band: 9.5`, `band: -0.5`, `band: 6.3`, `band: Number.NaN`, `gradedAt: null`, `gradedAt: "   "`, `gradedAt: "not-a-date"`.
  2. Chạy test (TDD Red) để xác nhận fail vì module chưa tồn tại.
  3. Tạo `packages/api/src/lib/objective-score.ts` (chỉ import `isBandStep` từ `./ielts-band`, compile sạch cho cả workerd lẫn browser):
     - Export `interface ObjectiveScore { correctCount: number; totalQuestions: number; }`.
     - Export `normalizeObjectiveScore(correctCount: unknown, totalQuestions: unknown): ObjectiveScore | null`: chỉ trả về `{ correctCount, totalQuestions }` khi cả hai là `number`, `Number.isSafeInteger(...)`, `totalQuestions > 0`, `correctCount >= 0`, `correctCount <= totalQuestions`; ngược lại trả `null`.
     - Export `formatObjectiveScore(score: ObjectiveScore): string`: trả về `` `${score.correctCount}/${score.totalQuestions}` ``.
     - Export `hasValidGradedBand(target: { band?: number | null; gradedAt?: string | null }): target is { band: number; gradedAt: string }`: trả về `typeof target.band === "number" && isBandStep(target.band) && typeof target.gradedAt === "string" && target.gradedAt.trim().length > 0 && Number.isFinite(Date.parse(target.gradedAt))`.
  4. Chạy lại test (TDD Green).
- **Success criteria:** Tất cả ca biên (`0/3`, `3/3`, `0/0`, `MAX_SAFE_INTEGER + 1`, âm, lớn hơn tổng, số thực, `NaN`, `null`, và các ca `hasValidGradedBand`) pass.
- **Verify:**
  - Red (trước bước 3): `pnpm --filter @teacher-os/api test src/lib/objective-score.test.ts` exits non-zero (missing module error; pass là lỗi).
  - Green (sau bước 3): `pnpm --filter @teacher-os/api test src/lib/objective-score.test.ts` exits 0 và báo toàn bộ tests passed.

### Task 1.2 — Mở rộng wire contract và server snapshot `loadSnapshot` với JSON1 object-count có lọc skill, `hasGradableTask`, `submittedAt` fallback và lọc `demo-student:%` (TDD)

- **Goal:** `GET /api/kernel` trả về `hasGradableTask` trên mỗi `classAssignment` (vá khe hở `libraryRef`), lọc `demo-student:%`, fallback `submittedAt` từ `quizAttempt.submittedAt` (vá flip-first), và trả `correctCount` + `totalQuestions` khớp 100% `parseQuizQuestions` chỉ cho kỹ năng tự chấm mà không đọc blob JSON của Writing/Speaking và không cần migration DB.
- **Target files and symbols:**
  - `packages/api/src/contracts.ts` (`KernelClassAssignmentRow`, dòng `2266-2290`)
  - `apps/server/src/routes/snapshot.ts` (`loadSnapshot`, `classAssignmentRows`, `classAssignmentTargetRows`, `submittedAttemptRows`, `targetsByAssignment`, dòng `60`, `523-612`, và projection `classAssignments` ở cuối `loadSnapshot`)
  - `apps/server/src/kernel.test.ts` (exact `.toEqual` ở dòng `6650-6667`)
  - `apps/server/src/routes/grading.test.ts` (thêm block `describe("Snapshot objective score (#977)")` độc lập có in-memory DB riêng theo tiền lệ dòng `594-605`)
- **Steps:**
  1. Trong `packages/api/src/contracts.ts` tại `KernelClassAssignmentRow` (dòng `2266-2290`):
     - Thêm trường optional trên header: `/** Server-derived: đề có phần Writing/Speaking cần giáo viên chấm (an toàn cả với prompt libraryRef != null). */ hasGradableTask?: boolean;`.
     - Thêm hai trường optional nullable trên `targets[]`:
       - `correctCount?: number | null;`
       - `totalQuestions?: number | null;`
  2. Viết test đỏ trước trong `apps/server/src/routes/grading.test.ts` trong một block `describe("Snapshot objective score (#977)")` **hoàn toàn độc lập** với `beforeAll` tạo `createClient({ url: "file::memory:" })`, `migrate`, và `buildApp` riêng (theo mẫu `grading.test.ts:594-605`, không đụng `org-1` dùng chung), kiểm thử:
     - (a) Bài Grammar MCQ 3 câu đã nộp với `correctCount = 3` → snapshot trả `hasGradableTask: false`, `{ correctCount: 3, totalQuestions: 3, band: null, gradedAt: null }`.
     - (b) Bài Reading MCQ 3 câu đã nộp với `correctCount = 0` → snapshot trả `{ correctCount: 0, totalQuestions: 3 }`.
     - (c) Bài Writing thuần đã nộp có `correctCount = 0` và `questionsSnapshot = "[]"` (và cả ca Writing có `questionsSnapshot` legacy rác) → snapshot trả `hasGradableTask: true`, `{ correctCount: null, totalQuestions: null }` (tuyệt đối không `0/0`).
     - (d) Bài Hybrid (Grammar 2 câu + Writing Task 2) đã nộp với `correctCount = 1`, `gradeScores: { task: 6, coherence: 6.5, lexical: 6, grammar: 6.5 }` và `gradedAt: new Date(...)` (lưu ý: bảng `quiz_attempt` KHÔNG có cột `band`, band tổng suy từ `gradeScores`) → snapshot trả `hasGradableTask: true` và đồng thời `{ correctCount: 1, totalQuestions: 2, band: 6.5 }` + `gradedAt` truthy.
     - (e) Bản ghi `quiz_attempt` có `questionsSnapshot = "{bad-json"` hoặc `"{\"a\":1}"` hoặc `"[null, 123]"` (mảng non-object) và `correctCount = 0`/`1` → snapshot không crash 500 mà trả `{ correctCount: null, totalQuestions: null }`; bản ghi `[{"stem":"Q1","opts":["A"],"answer":"A","alts":""}, null]` với `correctCount = 1` → trả `{ correctCount: 1, totalQuestions: 1 }` (khớp `parseQuizQuestions`).
     - (f) Bản ghi `quiz_attempt` có `correctCount = 5` trên mảng 3 câu object (`correctCount > totalQuestions`) → trả `{ correctCount: null, totalQuestions: null }`.
     - (g) Ca flip-first (`class_assignment_target.submitted_at = NULL` nhưng `quiz_attempt.status = "submitted"`, `submittedAt = new Date(...)`, `correctCount = 2` trên 3 câu) → snapshot fallback `submittedAt` thành chuỗi ISO từ `quizAttempt.submittedAt` và trả `{ correctCount: 2, totalQuestions: 3 }`.
     - (h) Bài giao trỏ tới `assignment_prompt` có `libraryRef = "lib-1"` (không có trong `snapshot.assignmentPrompts`) với `skill = "writing"` → `classAssignment.hasGradableTask === true`; và target của `demo-student:<orgId>` không xuất hiện trong `classAssignments[].targets[]`.
     - Đồng thời trong `apps/server/src/kernel.test.ts` dòng `6650-6667`, cập nhật 2 object trong `expect(assigned?.targets).toEqual(...)` thêm `correctCount: null, totalQuestions: null`.
  3. Chạy test đỏ xác nhận fail trên block độc lập `Snapshot objective score (#977)`.
  4. Trong `apps/server/src/routes/snapshot.ts`:
     - Import `hasGradableTask` từ `"@teacher-os/api/lib/ielts-band"`, `normalizeObjectiveScore` từ `"@teacher-os/api/lib/objective-score"`, và bổ sung `sql` vào import từ `"drizzle-orm"` (dòng `60`).
     - Trên `classAssignmentRows` (dòng `523-532`): `leftJoin(assignmentPrompt, and(eq(assignmentPrompt.id, classAssignment.promptId), eq(assignmentPrompt.orgId, orgId)))` lấy thêm `promptSkill: assignmentPrompt.skill`, `promptWritingPart: assignmentPrompt.writingPart` để tính `hasGradableTask: hasGradableTask({ skill: row.promptSkill, writingPart: row.promptWritingPart })` khi serialize `classAssignments` ở cuối `loadSnapshot`.
     - Trên `classAssignmentTargetRows` (dòng `533-550`): thêm `notLike(classAssignmentTarget.studentId, "demo-student:%")` vào `.where(...)`.
     - Trên `submittedAttemptRows` (dòng `556-579`):
       - `innerJoin(assignmentPrompt, and(eq(assignmentPrompt.id, classAssignment.promptId), eq(assignmentPrompt.orgId, orgId)))`
       - Thêm `notLike(quizAttempt.studentId, "demo-student:%")` vào `.where(...)`.
       - Select thêm `submittedAt: quizAttempt.submittedAt`, `correctCount: quizAttempt.correctCount`, và `totalQuestions` dùng nested-`CASE` JSON1 có lọc skill + đếm đúng phần tử `'object'`:
         ```ts
         totalQuestions: sql<number>`CASE
           WHEN ${assignmentPrompt.skill} NOT IN ('reading', 'listening', 'grammar', 'vocabulary') THEN 0
           WHEN ${quizAttempt.questionsSnapshot} IN ('', '[]') THEN 0
           WHEN json_valid(${quizAttempt.questionsSnapshot}) = 1 THEN
             CASE
               WHEN json_type(${quizAttempt.questionsSnapshot}) = 'array' THEN
                 (SELECT COUNT(*) FROM json_each(${quizAttempt.questionsSnapshot}) WHERE type = 'object')
               ELSE 0
             END
           ELSE 0
         END`
           .mapWith(Number)
           .as("total_questions"),
         ```
     - Khi push vào `list` (dòng `604-610`):
       - Tính `const objective = attempt ? normalizeObjectiveScore(attempt.correctCount, attempt.totalQuestions) : null;`.
       - Fallback `submittedAt: target.submittedAt ?? (attempt?.submittedAt ? attempt.submittedAt.toISOString() : null)`.
       - Thêm `correctCount: objective?.correctCount ?? null`, `totalQuestions: objective?.totalQuestions ?? null`.
  5. Chạy lại test server để xác nhận xanh.
- **Success criteria:** Block `Snapshot objective score (#977)`, toàn bộ `grading.test.ts` và `kernel.test.ts` đều pass; Writing/Speaking không bao giờ ra `0/0`; mảng non-object `[null, 123]` không ra `0/2`; flip-first fallback đúng `submittedAt`; `libraryRef` vẫn có `hasGradableTask` đúng và `demo-student:%` bị lọc sạch.
- **Verify:**
  - Red (trước bước 4): `pnpm --filter server test src/routes/grading.test.ts -t "Snapshot objective score"` exits non-zero với assertion failure (pass là lỗi).
  - Green (sau bước 4): `pnpm --filter server test src/routes/grading.test.ts src/kernel.test.ts` exits 0 và báo toàn bộ tests passed.

### Task 1.3 — Cập nhật `ClassAssignment` type và mapper `mapClassAssignments` phía web (TDD)

- **Goal:** `mapClassAssignments` truyền tiếp optional `hasGradableTask` (khi snapshot có gửi) và `correctCount` / `totalQuestions` (`?? null` cho deploy skew / fixture cũ) vào `data.classAssignments`.
- **Target files and symbols:**
  - `apps/web/src/lib/mock-data.ts` (`ClassAssignment`, dòng `120-139`)
  - `apps/web/src/lib/repos/class-assignments.ts` (`mapClassAssignments`, dòng `9-27`)
  - `apps/web/src/lib/repos/class-assignments.test.ts` (dòng `26-90` và thêm test mới cho `correctCount`/`totalQuestions`/`hasGradableTask`)
- **Steps:**
  1. Trong `apps/web/src/lib/mock-data.ts` tại `ClassAssignment`:
     - Thêm optional `hasGradableTask?: boolean;` trên header (cùng vị trí với `targetScope?`).
     - Thêm optional `correctCount?: number | null;` và `totalQuestions?: number | null;` trên `targets[]`.
  2. Trong `apps/web/src/lib/repos/class-assignments.test.ts`:
     - Cập nhật 2 exact `.toEqual` hiện có (`projects snapshot rows field-for-field` và `maps grading state`) để kỳ vọng `correctCount: null, totalQuestions: null` khi snapshot không gửi.
     - Thêm test `"maps objective auto-graded score (including 0/N) and optional hasGradableTask (#977)"` kiểm tra `{ correctCount: 3, totalQuestions: 3 }`, `{ correctCount: 0, totalQuestions: 5 }`, thiếu field → `{ correctCount: null, totalQuestions: null }`, và `hasGradableTask: true/false` (giữ nguyên khi có mặt, bỏ qua khi vắng mặt).
  3. Chạy test đỏ xác nhận fail.
  4. Trong `apps/web/src/lib/repos/class-assignments.ts`:
     - Trên object `ClassAssignment`, thêm `...(typeof row.hasGradableTask === "boolean" ? { hasGradableTask: row.hasGradableTask } : {}),`.
     - Trong `targets.map(...)` (dòng `20-26`), thêm:
       - `correctCount: target.correctCount ?? null,`
       - `totalQuestions: target.totalQuestions ?? null,`
  5. Chạy lại test xác nhận xanh.
- **Success criteria:** `mapClassAssignments` bảo toàn `0` (`0 ?? null === 0`), bảo toàn `hasGradableTask` khi server gửi, và chuẩn hóa thiếu field thành `null`.
- **Verify:**
  - Red (trước bước 4): `CI=1 pnpm --filter web test src/lib/repos/class-assignments.test.ts` exits non-zero với assertion failure (pass là lỗi).
  - Green (sau bước 4): `CI=1 pnpm --filter web test src/lib/repos/class-assignments.test.ts` exits 0 và báo toàn bộ tests passed.

## Verification

- `pnpm --filter @teacher-os/api test` exits 0.
- `pnpm --filter server test src/routes/grading.test.ts src/kernel.test.ts` exits 0.
- `CI=1 pnpm --filter web test src/lib/repos/class-assignments.test.ts` exits 0.
- `VITE_SERVER_URL=http://localhost:8000 pnpm check-types` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
