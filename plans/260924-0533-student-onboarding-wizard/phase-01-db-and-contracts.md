---
phase: 1
title: "DB schema + migration 0024 + contracts onboarding"
status: pending
priority: P2
effort: 2h
dependencies: []
---

# Phase 1: DB schema + migration 0024 + contracts onboarding

## Goal

Đặt nền data + contract cho wizard: 6 cột nullable mới trên bảng `student` (sinh migration **0024**) và bộ enums + `studentOnboardingPayloadSchema` trong `packages/api/src/contracts.ts`.

Điểm load-bearing (thứ tự bắt buộc): Task 1.1 (schema) phải chạy trước Task 1.2 (`pnpm db:generate` đọc schema để sinh migration). Task 1.3 chỉ **thêm exports mới** — KHÔNG sửa `studentMeSchema` ở phase này: field mới trong `studentMeSchema` là field bắt buộc của type `StudentMe`, sẽ làm `apps/server` vỡ `check-types` khi handler `/me` chưa emit (handler đó nằm ở Phase 2). Giữ nguyên ràng buộc này để mọi Verify gate của Phase 1 xanh sạch.

Quy ước cột + docblock: `docs/code-standards.md:26-35` — "mutable facts get a real column + docblock naming the user action that writes them". Docblock mẫu hiện có: cột `email` ghi rõ "Ghi bởi: bridge portal provisioning (requireStudent) khi emailVerified === true" (`packages/db/src/schema/student.ts:24-26`).

## Files to Create / Modify

- Modify: `packages/db/src/schema/student.ts` (6 cột mới trong bảng `student`)
- Create: `packages/db/src/migrations/0024_*.sql` (sinh bởi drizzle-kit — xem Task 1.2)
- Modify: `packages/db/src/migrations/meta/_journal.json` (drizzle-kit tự ghi — KHÔNG sửa tay)
- Modify: `packages/api/src/contracts.ts` (enums + payload schema, chèn vào khu student portal contracts)

## Tasks & Steps

### Task 1.1 — 6 cột onboarding trong schema `student`
- Goal: lưu trữ câu trả lời wizard như persisted facts trên row học viên, mỗi cột có docblock ghi user action ghi vào cột (quy ước repo).
- Target files: `packages/db/src/schema/student.ts` (chèn sau `parentPhone` dòng 30, trước `createdAt` dòng 31).
- Steps:
  1. Thêm 6 cột — tất cả **nullable** (không `.notNull()`, không `.default()`):
     ```ts
     /** Chứng chỉ học viên quan tâm ("ielts" | "toeic") — enum EXAM_INTERESTS ở packages/api.
      * Ghi bởi: học viên hoàn thành wizard onboarding — POST /api/student/onboarding (bước 1). */
     examInterest: text("exam_interest"),
     /** Band/điểm mục tiêu (chuỗi hiển thị, vd "6.5" IELTS hoặc "750" TOEIC).
      * Ghi bởi: POST /api/student/onboarding (bước 2, ràng buộc theo examInterest). */
     targetScore: text("target_score"),
     /** Mục tiêu học tiếng Anh — JSON array string của keys LEARNING_GOAL_OPTIONS.
      * Ghi bởi: POST /api/student/onboarding (bước 3, multi-select). */
     learningGoals: text("learning_goals"),
     /** Ghi chú tự nhiên cho bước mục tiêu (≤200 ký tự, có thể null khi bỏ trống).
      * Ghi bởi: POST /api/student/onboarding (bước 3, tùy chọn). */
     learningGoalsNote: text("learning_goals_note"),
     /** Thời gian tự học mỗi ngày (key DAILY_STUDY_HOUR_OPTIONS).
      * Ghi bởi: POST /api/student/onboarding (bước 4). */
     dailyStudyHours: text("daily_study_hours"),
     /** Thời điểm học viên hoàn thành wizard onboarding — null = chưa onboarding (gate UI đọc cột này).
      * Ghi bởi: POST /api/student/onboarding khi payload hợp lệ. */
     onboardingCompletedAt: integer("onboarding_completed_at", {
         mode: "timestamp_ms",
     }),
     ```
  2. Giữ nguyên phần còn lại của bảng (index `student_org_idx` dòng 36, unique index `student_email_uq` dòng 37-39 — không đụng).
- Success criteria: file compile; 6 cột đều nullable; `onboardingCompletedAt` dùng cùng `mode: "timestamp_ms"` như `createdAt` (dòng 31-33) nhưng KHÔNG có default/sql shell.
- Verify: `pnpm check-types` (root) → exit 0.

### Task 1.2 — Sinh migration 0024
- Goal: migration SQL cho 6 cột mới, đánh số nối tiếp journal hiện có (idx 23 = `0023_special_inertia`). **Plan #260 cũng claim số 0024** — quy trình dưới đây xử lý va chạm số.
- Target files: `packages/db/src/migrations/0024_*.sql` + `meta/_journal.json` (đều sinh tự động).
- Steps:
  1. **Trước khi generate (bắt buộc):** `git pull --rebase origin develop` rồi đọc `packages/db/src/migrations/meta/_journal.json` MỚI NHẤT (entry cuối) — không dựa memory/plan doc. Xác nhận idx cuối thực tế để biết số sẽ sinh.
  2. Chạy từ root: `pnpm db:generate` (root `package.json:18` → `turbo run db:generate -F @teacher-os/db` → `drizzle-kit generate`, config `packages/db/drizzle.config.ts:8-15`: schema `./src/schema`, out `./src/migrations`). Lưu ý: drizzle.config dotenv đọc `apps/server/.env` — file này đã tồn tại vì 0023 sinh được; KHÔNG đặt biến mới.
  3. Kiểm tra file sinh ra có số nối tiếp đúng journal vừa đọc (kỳ vọng 0024). Nếu ra số khác (vd 0025) nghĩa là đã có migration mới hơn chưa biết → STOP theo Failure Protocol, không tự rename.
  4. Mở file SQL kiểm tra nội dung: đúng 6 lệnh `ALTER TABLE "student" ADD COLUMN ...` (SQLite thêm cột nullable không cần default), không có thay đổi bảng khác. Tên file do drizzle-kit sinh (random suffix) — giữ nguyên; KHÔNG rename tay kèm sửa journal.
  5. KHÔNG chạy `db:migrate:deploy` — Alchemy apply khi deploy, còn test/e2e tự `migrate()` từ thư mục migrations (`apps/server/src/student.test.ts:19-22`, `apps/e2e/src/boot.ts:54-57`).
  6. **Trước khi mở PR (bắt buộc):** re-check develop lần nữa. Nếu develop đã có 0024 của plan #260 → xoá file migration local + revert entry journal/meta tương ứng, chạy lại `pnpm db:generate` để sinh 0025, cập nhật mọi tham chiếu số "0024" trong các phase file. KHÔNG giữ cả hai — journal trùng idx hỏng deploy D1.
- Success criteria: tồn tại đúng 1 migration mới với 6 cột trên bảng `student` và chỉ bảng `student`; `meta/_journal.json` có entry mới nối tiếp idx cuối của develop.
- Verify: `ls packages/db/src/migrations/ | grep "^0024"` → đúng 1 file (hoặc số re-generate); `grep -c 'ALTER TABLE "student" ADD COLUMN' packages/db/src/migrations/0024_*.sql` → 6; `grep -c "ALTER TABLE" packages/db/src/migrations/0024_*.sql` → 6 (không ALTER bảng khác); `grep -o '"tag": "0024[^"]*"' packages/db/src/migrations/meta/_journal.json` → 1 hit.

### Task 1.3 — Enums + `studentOnboardingPayloadSchema` trong contracts
- Goal: nguồn chân lý duy nhất cho các lựa chọn wizard + schema validate payload POST (D4), theo pattern enum nghiệp vụ hiện có.
- Target files: `packages/api/src/contracts.ts` — chèn vào khu Student Portal contracts, sau khối `STUDENT_ERROR_CODES`/`StudentErrorCode` (dòng 911-917) và trước `studentMeSchema` (dòng 919).
- Steps:
  1. Thêm 5 enum theo pattern `CLASS_TYPES` (dòng 19-20, kèm type alias):
     ```ts
     export const EXAM_INTERESTS = ["ielts", "toeic"] as const;
     export type ExamInterest = (typeof EXAM_INTERESTS)[number];

     export const IELTS_TARGET_BANDS = ["5.0", "5.5", "6.0", "6.5", "7.0", "7.5", "8.0+"] as const;
     export const TOEIC_TARGET_SCORES = ["450", "550", "650", "750", "850", "990"] as const;

     export const LEARNING_GOAL_OPTIONS = [
         "study-abroad",
         "career",
         "certification",
         "communication",
         "academic",
         "other",
     ] as const;
     export type LearningGoalOption = (typeof LEARNING_GOAL_OPTIONS)[number];

     export const DAILY_STUDY_HOUR_OPTIONS = ["under-1", "1-2", "2-3", "3-plus"] as const;
     export type DailyStudyHourOption = (typeof DAILY_STUDY_HOUR_OPTIONS)[number];
     ```
  2. Thêm payload schema (zod v4, import `z` đã có ở dòng 1):
     ```ts
     /** Payload POST /api/student/onboarding — wizard 4 bước (D4/D7: đầy đủ, không skip). */
     const onboardingPayloadBase = z.object({
         examInterest: z.enum(EXAM_INTERESTS),
         /** Chuỗi hiển thị; hợp lệ phải nằm trong mảng tương ứng examInterest (superRefine). */
         targetScore: z.string().min(1),
         learningGoals: z
             .array(z.enum(LEARNING_GOAL_OPTIONS))
             .min(1)
             .refine((goals) => new Set(goals).size === goals.length),
         learningGoalsNote: z.string().trim().max(200).optional(),
         dailyStudyHours: z.enum(DAILY_STUDY_HOUR_OPTIONS),
     });
     export const studentOnboardingPayloadSchema = onboardingPayloadBase.superRefine(
         (value, ctx) => {
             const allowed =
                 value.examInterest === "ielts"
                     ? IELTS_TARGET_BANDS
                     : TOEIC_TARGET_SCORES;
             if (!(allowed as readonly string[]).includes(value.targetScore)) {
                 ctx.addIssue({
                     code: "custom",
                     path: ["targetScore"],
                     message: `targetScore must be one of ${allowed.join(", ")}`,
                 });
             }
         },
     );
     export type StudentOnboardingPayload = z.infer<
         typeof studentOnboardingPayloadSchema
     >;
     ```
     Ghi chú: không export `onboardingPayloadBase` (chỉ schema hoàn chỉnh mới là contract); step components ở Phase 3 tự dựng zod schema con từ các enum trên.
  3. KHÔNG sửa `studentMeSchema` (dòng 919-931) hay bất kỳ export nào đang có — phase này chỉ thêm (xem sequencing ở Goal).
- Success criteria: exports mới compile; `zod` là dependency duy nhất dùng thêm (đã có trong packages/api — không thêm package).
- Verify: `pnpm --filter @teacher-os/api check-types` → exit 0; `pnpm check` (root, biome) → exit 0.

## Verification (cả phase)

- `pnpm db:generate` đã chạy xong và sinh đúng 1 migration 0024 (6 ADD COLUMN).
- `pnpm check-types` (root) → exit 0 (chứng minh server chưa vỡ vì studentMeSchema chưa đổi).
- `pnpm check` → exit 0.
- `pnpm --filter server test` → exit 0 (migration mới được `migrate()` trong test — chứng minh SQL chạy được trên libsql; các test hiện có không đổi kỳ vọng ở phase này).

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
