---
title: "Phase 1: Format Helper, Class Roster Integration & Tests"
status: in_progress
priority: P1
effort: 30m
---

# Phase 1: Format Helper, Class Roster Integration & Tests

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

## Overview
Phase này hoàn thành toàn bộ giải pháp cho issue #625:
1. Viết test thất bại trước (TDD Red) cho `formatTargetBand` trong `format-student-target.test.ts` và component cell `RosterTargetBandCell` trong `class-roster-tab.test.tsx`.
2. Trích xuất helper nội bộ `normalizeTargetBand` và export `formatTargetBand` trong `apps/web/src/lib/format-student-target.ts`.
3. Export và tích hợp component `RosterTargetBandCell` vào `apps/web/src/components/class-detail/class-roster-tab.tsx:143`.
4. Xác nhận mọi bài test chuyển xanh (TDD Green), chạy kiểm tra hồi quy `formatStudentTarget` và toàn bộ suite `apps/web`.

## Target Files and Symbols
- `apps/web/src/lib/format-student-target.ts`:
  - Thêm helper nội bộ `normalizeTargetBand(targetBand?: string | number | null): string | null`
  - Export `formatTargetBand(targetBand?: string | number | null): string`
  - Cập nhật `formatStudentTarget` tái sử dụng `normalizeTargetBand`
- `apps/web/src/lib/format-student-target.test.ts`:
  - Bổ sung `describe("formatTargetBand")` bao quát:
    - `"6.5"` -> `"Band 6.5"`
    - `7` -> `"Band 7"`
    - `"band 7"` -> `"Band 7"`
    - `"Band 6.5"` -> `"Band 6.5"`
    - `"Band —"` -> `"—"`
    - `"Band  —"` -> `"—"`
    - `"Band"` / `"band"` -> `"—"`
    - `"—"` -> `"—"`
    - `"  —  "` -> `"—"`
    - `""` và whitespace -> `"—"`
    - `NaN` / `Infinity` -> `"—"`
    - `null` và `undefined` -> `"—"`
  - Bổ sung test case hồi quy cho `formatStudentTarget` với input `{ targetBand: "Band 6.5" }`.
- `apps/web/src/components/class-detail/class-roster-tab.tsx`:
  - Import `formatTargetBand` từ `@/lib/format-student-target`
  - Export `RosterTargetBandCell({ targetBand }: { targetBand?: string | number | null })`
  - Thay thế chuỗi render thô ở dòng 143 bằng `<RosterTargetBandCell key="b" targetBand={s.targetBand} />`
- `apps/web/src/components/class-detail/class-roster-tab.test.tsx`:
  - Import `RosterTargetBandCell` từ `./class-roster-tab`
  - Bổ sung `describe("RosterTargetBandCell (#625)")`:
    - `targetBand="6.5"` renders `Band 6.5`
    - `targetBand="—"` renders `—` và `not.toContain("Band —")`
    - `targetBand=""` renders `—` và `not.toContain("Band")`

## Tasks & Steps

### Task 1.1 — TDD Red: Bổ sung test cho formatTargetBand và RosterTargetBandCell
- Goal: Tạo bài test thất bại mô tả đúng hành vi mong muốn trước khi sửa mã nguồn.
- Target files:
  - `apps/web/src/lib/format-student-target.test.ts`
  - `apps/web/src/components/class-detail/class-roster-tab.test.tsx`
- Steps:
  1. Thêm test suite `describe("formatTargetBand")` và regression test `describe("formatStudentTarget")` cho `Band 6.5` vào `apps/web/src/lib/format-student-target.test.ts` (import `formatTargetBand`).
  2. Thêm test suite `describe("RosterTargetBandCell (#625)")` vào `apps/web/src/components/class-detail/class-roster-tab.test.tsx` (import `RosterTargetBandCell`).
- Success criteria: Test files fail do hàm và component chưa được export/định nghĩa.
- Verify:
  - `pnpm --filter web test src/lib/format-student-target.test.ts` exit code != 0 và fail vì `formatTargetBand`.
  - `pnpm --filter web test src/components/class-detail/class-roster-tab.test.tsx` exit code != 0 và fail vì `RosterTargetBandCell`.

### Task 1.2 — Implementation: Helper normalizeTargetBand và export formatTargetBand
- Goal: Hoàn thiện logic chuẩn hoá và định dạng band mục tiêu trong `format-student-target.ts`.
- Target files:
  - `apps/web/src/lib/format-student-target.ts`
- Steps:
  1. Xây dựng hàm nội bộ `normalizeTargetBand(targetBand?: string | number | null): string | null`:
     - Kiểm tra nếu là number: `typeof targetBand === "number" ? (Number.isFinite(targetBand) ? String(targetBand).trim() : "") : ...`
     - Nếu là string: `.trim()`
     - Nếu chuỗi rỗng: return `null`.
     - Nếu `toLowerCase() === "band"`: return `null`.
     - Strip tiền tố `Band ` không phân biệt hoa thường: `clean = raw.replace(/^band\s+/i, "").trim()`.
     - Nếu `clean === ""` hoặc `clean === EMPTY_BAND_TOKEN` ("—") hoặc `clean.toLowerCase() === "band"`: return `null`.
     - Ngược lại: return `clean`.
  2. Cập nhật `formatStudentTarget`:
     - Thay logic chuẩn hoá rawBand ở dòng 19-25 bằng `const band = normalizeTargetBand(student?.targetBand);`
  3. Xây dựng và export `formatTargetBand(targetBand?: string | number | null): string`:
     - `const band = normalizeTargetBand(targetBand);`
     - `return band ? \`Band ${band}\` : EMPTY_BAND_TOKEN;`
- Success criteria: `format-student-target.test.ts` pass 100%, 0 failed.
- Verify: `pnpm --filter web test src/lib/format-student-target.test.ts` exit code 0.

### Task 1.3 — Implementation: Component RosterTargetBandCell và tích hợp vào ClassRosterTab
- Goal: Tạo component `RosterTargetBandCell` và sử dụng trong `class-roster-tab.tsx`.
- Target files:
  - `apps/web/src/components/class-detail/class-roster-tab.tsx`
- Steps:
  1. Import `formatTargetBand` từ `@/lib/format-student-target`.
  2. Định nghĩa và export component:
     ```tsx
     export function RosterTargetBandCell({
       targetBand,
     }: {
       targetBand?: string | number | null;
     }) {
       return (
         <span className="text-sm tabular-nums">
           {formatTargetBand(targetBand)}
         </span>
       );
     }
     ```
  3. Tại dòng 142-144, thay bằng:
     `<RosterTargetBandCell key="b" targetBand={s.targetBand} />,`
- Success criteria: `class-roster-tab.test.tsx` pass 100%, 0 failed.
- Verify: `pnpm --filter web test src/components/class-detail/class-roster-tab.test.tsx` exit code 0.

### Task 1.4 — Full Verification: Typecheck, Lint, and Regression Suite
- Goal: Đảm bảo toàn bộ workspace pass sạch, không có lỗi type hay lint.
- Target files: toàn bộ workspace.
- Steps:
  1. Chạy `pnpm check-types`
  2. Chạy `pnpm exec biome check apps/web/src/lib/format-student-target.ts apps/web/src/lib/format-student-target.test.ts apps/web/src/components/class-detail/class-roster-tab.tsx apps/web/src/components/class-detail/class-roster-tab.test.tsx`
  3. Chạy `pnpm --filter web test`
- Success criteria: Exit code 0 cho tất cả lệnh, 0 failed.
- Verify:
  - `pnpm check-types` exit code 0.
  - `pnpm exec biome check apps/web/src/lib/format-student-target.ts apps/web/src/lib/format-student-target.test.ts apps/web/src/components/class-detail/class-roster-tab.tsx apps/web/src/components/class-detail/class-roster-tab.test.tsx` exit code 0.
