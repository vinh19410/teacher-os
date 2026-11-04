# Phase 1: API Contracts và Admin Library Alignment

## Goal
Định nghĩa hằng số tập trung `ASSIGNMENT_BANDS`, `DEFAULT_ASSIGNMENT_BAND` và kiểu `AssignmentBand` trong contracts; cập nhật schema Zod ở `packages/api`, server regression test ở `apps/server`, và component part-form ở `apps/admin` để chấp nhận dải band từ 5.0 đến 8.0.

## Target files and symbols
- `packages/api/src/contracts.ts`:
  - Thêm `ASSIGNMENT_BANDS`, `DEFAULT_ASSIGNMENT_BAND`, `AssignmentBand`
  - Cập nhật `assignmentPromptBaseSchema.band: z.enum(ASSIGNMENT_BANDS)`
  - Cập nhật `libraryExerciseBaseSchema.band: z.enum(ASSIGNMENT_BANDS).default(DEFAULT_ASSIGNMENT_BAND)`
- `packages/api/src/library-contracts.ts`:
  - Cập nhật `libraryPartUpsertSchema.band: z.enum(ASSIGNMENT_BANDS)`
- `packages/api/src/contracts.test.ts` (hoặc test tương ứng trong packages/api):
  - Kiểm tra `assignmentPromptBaseSchema` / `assignmentPromptCreateSchema` chấp nhận "5.0", "5.5", "6.0", "6.5", "7.0", "7.5", "8.0" và từ chối "4.0", "8.5"
- `apps/server/src/kernel.test.ts`:
  - Cập nhật dòng 5119 trong `test("POST rejects invalid bodies with 400")` từ `{ ...validBody, band: "8.0" }` sang `{ ...validBody, band: "8.5" }` (vì "8.0" nay đã là band hợp lệ)
- `apps/admin/src/components/library/part-form.tsx`:
  - `export const BAND_OPTIONS = ASSIGNMENT_BANDS;`
- `apps/admin/src/components/library/part-form.test.tsx`:
  - Cập nhật assertion kiểm tra `BAND_OPTIONS` gồm 7 giá trị

## Tasks & Steps

### Task 1.1 — Khai báo ASSIGNMENT_BANDS và cập nhật schema trong packages/api
- Goal: `packages/api/src/contracts.ts` xuất `ASSIGNMENT_BANDS` và các schema Zod sử dụng hằng số này.
- Target files: `packages/api/src/contracts.ts`, `packages/api/src/library-contracts.ts`
- Steps:
  1. Trong `packages/api/src/contracts.ts`:
     ```ts
     export const ASSIGNMENT_BANDS = [
       "5.0",
       "5.5",
       "6.0",
       "6.5",
       "7.0",
       "7.5",
       "8.0",
     ] as const;
     export type AssignmentBand = (typeof ASSIGNMENT_BANDS)[number];
     export const DEFAULT_ASSIGNMENT_BAND: AssignmentBand = "7.0";
     ```
  2. Tại `assignmentPromptBaseSchema` (dòng ~804):
     Thay `band: z.enum(["6.0", "6.5", "7.0", "7.5"]),` bằng:
     `band: z.enum(ASSIGNMENT_BANDS),`
  3. Tại `libraryExerciseBaseSchema` (dòng ~4426):
     Thay `band: z.enum(["6.0", "6.5", "7.0", "7.5"]).default("7.0"),` bằng:
     `band: z.enum(ASSIGNMENT_BANDS).default(DEFAULT_ASSIGNMENT_BAND),`
  4. Trong `packages/api/src/library-contracts.ts` (dòng ~147):
     Import `ASSIGNMENT_BANDS` từ `./contracts` và thay:
     `band: z.enum(ASSIGNMENT_BANDS),`
- Success criteria: Schema validate thành công với "5.0" và "5.5".
- Verify: `pnpm --filter @teacher-os/api check-types` exits 0.

### Task 1.2 — Viết contract test xác nhận dải band mới & cập nhật server test
- Goal: Đảm bảo kiểm chứng cơ học rằng schema chấp nhận 5.5 và từ chối các giá trị ngoài dải, đồng thời cập nhật test server tránh hồi quy.
- Target files: `packages/api/src/contracts.test.ts` (hoặc test tương ứng), `apps/server/src/kernel.test.ts`
- Steps:
  1. Thêm test case xác nhận `assignmentPromptCreateSchema` parse thành công payload có `band: "5.5"` và `band: "5.0"`.
  2. Xác nhận `assignmentPromptCreateSchema` ném lỗi khi parse `band: "4.0"` hoặc `band: "8.5"`.
  3. Trong `apps/server/src/kernel.test.ts` (dòng 5119):
     Thay:
     `{ ...validBody, band: "8.0" }, // enum`
     Bằng:
     `{ ...validBody, band: "8.5" }, // enum`
- Success criteria: Vitest chạy test contract và test server pass hoàn toàn.
- Verify: `pnpm --filter @teacher-os/api test && pnpm --filter server test src/kernel.test.ts` exits 0.

### Task 1.3 — Cập nhật BAND_OPTIONS trong apps/admin và admin test
- Goal: Admin part form nhận dải band mới từ contract và test admin pass.
- Target files: `apps/admin/src/components/library/part-form.tsx`, `apps/admin/src/components/library/part-form.test.tsx`
- Steps:
  1. Trong `apps/admin/src/components/library/part-form.tsx`:
     Import `ASSIGNMENT_BANDS` từ `@teacher-os/api/contracts`.
     Khai báo `export const BAND_OPTIONS = ASSIGNMENT_BANDS;`
  2. Trong `apps/admin/src/components/library/part-form.test.tsx`:
     Cập nhật assertion `expect(BAND_OPTIONS).toEqual(["5.0", "5.5", "6.0", "6.5", "7.0", "7.5", "8.0"]);`.
- Success criteria: Toàn bộ suite test của `apps/admin` pass.
- Verify: `pnpm --filter admin test` exits 0.

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
