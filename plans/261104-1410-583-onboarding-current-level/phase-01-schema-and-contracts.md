# Phase 1: Schema, Migration và API Contracts

## Goal
Bổ sung định nghĩa `CURRENT_LEVEL_OPTIONS` vào contract API, mở rộng schema Drizzle `student` với cột `current_level` text nullable, và sinh migration SQL an toàn.

## Target files and symbols
- `packages/api/src/contracts.ts`:
  - Thêm `CURRENT_LEVEL_OPTIONS`, `CurrentLevelOption`
  - Cập nhật `onboardingPayloadBase` với `currentLevel: z.enum(CURRENT_LEVEL_OPTIONS)`
  - Cập nhật `studentMeSchema.student` với `currentLevel: z.string().nullable().catch(null)`
- `packages/db/src/schema/student.ts`:
  - Thêm `currentLevel: text("current_level")` vào định nghĩa bảng `student`
- `packages/db/src/migrations/`:
  - File migration mới `0064_*.sql` và `meta/_journal.json`

## Tasks & Steps

### Task 1.1 — Bổ sung hằng số và schema trong contracts
- Goal: Định nghĩa kiểu dữ liệu và schema cho `currentLevel` ở cấp độ contract dùng chung giữa client và server.
- Target files: `packages/api/src/contracts.ts`
- Steps:
  1. Thêm hằng số `CURRENT_LEVEL_OPTIONS`:
     ```ts
     export const CURRENT_LEVEL_OPTIONS = [
       "beginner",
       "basic",
       "intermediate",
       "upper-intermediate",
       "advanced",
       "unsure",
     ] as const;
     export type CurrentLevelOption = (typeof CURRENT_LEVEL_OPTIONS)[number];
     ```
  2. Trong `onboardingPayloadBase`, thêm trường `currentLevel: z.enum(CURRENT_LEVEL_OPTIONS)`.
  3. Trong `studentMeSchema.student`, thêm trường `currentLevel: z.string().nullable().catch(null)`.
  4. Cập nhật comment mô tả từ "wizard 4 bước" thành "wizard 5 bước".
- Success criteria: `pnpm --filter @teacher-os/api build` hoặc `check-types` thành công không lỗi cú pháp.
- Verify: `pnpm --filter @teacher-os/api check-types` exits 0.

### Task 1.2 — Bổ sung cột current_level vào schema và sinh migration
- Goal: Cột `current_level` có mặt trong schema Drizzle và file migration được tạo tự động.
- Target files: `packages/db/src/schema/student.ts`, `packages/db/src/migrations/*`
- Steps:
  1. Trong `packages/db/src/schema/student.ts`, thêm:
     ```ts
     /** Trình độ hiện tại tự khai ("beginner" | "basic" | "intermediate" | "upper-intermediate" | "advanced" | "unsure").
      * Ghi bởi: POST /api/student/onboarding (bước 2). Null với học viên cũ chưa có dữ liệu. */
     currentLevel: text("current_level"),
     ```
  2. Chạy lệnh sinh migration:
     `pnpm --filter @teacher-os/db db:generate`
  3. Kiểm tra file migration `packages/db/src/migrations/0064_*.sql` được tạo ra có chứa lệnh:
     `ALTER TABLE \`student\` ADD \`current_level\` text;`
- Success criteria: File migration `0064_*.sql` tồn tại và chứa câu lệnh thêm cột `current_level`.
- Verify: `git status --porcelain packages/db/src/migrations/` hiển thị file migration mới và `pnpm --filter @teacher-os/db check-types` exits 0.

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
