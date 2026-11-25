---
phase: 3
title: "Phase 3: Student UI Badge Alignment & Full Verification Gates"
status: completed
priority: P1
effort: "30m"
dependencies: [1, 2]
---

# Phase 3: Student UI Badge Alignment & Full Verification Gates

<!-- Updated: Red-Team Session 1 - scoped within(cards[i]) assertions, added max-w-[calc(100%-1.25rem)] truncate on TestCard badge, added study-pack-migration.test.ts and 3-viewport Light/Dark visual verification for POT -->

## Goal

Đồng bộ cách hiển thị badge nguồn trên `TestCard` của `apps/student/src/components/practice/skill-catalog.tsx` với `PracticeIntroScreen` (trim, join `[item.collection, item.testGroup]`, kèm chống tràn `truncate`), bổ sung regression tests trong `practice-catalog.test.tsx`, và vượt toàn bộ local quality gates (lint, typecheck, test suites liên quan, và kiểm chứng giao diện 3 viewport Light/Dark).

## Files to Create / Modify

- Modify: `apps/student/src/components/practice/skill-catalog.tsx`
- Modify: `apps/student/src/components/practice/practice-catalog.test.tsx`

## Tasks & Steps

### Task 3.1 — Write TDD Red UI tests for TestCard source badge consistency
- **Goal:** Bổ sung unit tests cho `TestCard` trong `practice-catalog.test.tsx` xác minh cách hiển thị badge nguồn theo từng card (`within(cards[i])`) với mọi tổ hợp `collection` / `testGroup` (đủ cả hai, chỉ có `testGroup` khi `collection` null/rỗng/whitespace, và ẩn badge khi cả hai rỗng/whitespace) và chứng minh test FAIL (Red phase).
- **Target files and symbols:**
  - `apps/student/src/components/practice/practice-catalog.test.tsx` (`SkillCatalog` describe block, line 42)
- **Steps:**
  1. Import `within` từ `@testing-library/react` (nếu chưa có) và thêm test case trong `practice-catalog.test.tsx` render `<SkillCatalog skill="listening" ... />` với 4 items:
     - `t-full`: `collection: "Other sources"`, `testGroup: "Section 4"` → `within(cards[0]).getByTestId("practice-card-source-badge")` có text `"Other sources · Section 4"` và class chứa `"truncate"`.
     - `t-blank-col`: `collection: "   "`, `testGroup: "Section 2"` → `within(cards[1]).getByTestId("practice-card-source-badge")` có text `"Section 2"`.
     - `t-null-col`: `collection: null`, `testGroup: "Section 3"` → `within(cards[2]).getByTestId("practice-card-source-badge")` có text `"Section 3"`.
     - `t-none`: `collection: "  "`, `testGroup: "  "` → `within(cards[3]).queryByTestId("practice-card-source-badge")` bằng `null`.
  2. Chạy Vitest trên `practice-catalog.test.tsx` để xác nhận Red phase.
- **Success criteria:** Test mới FAIL do `TestCard` hiện tại chưa trim `collection`, bỏ sót `testGroup` khi `collection` null, và chưa có `data-testid="practice-card-source-badge"` / `truncate`.
- **Verify:** `pnpm --filter student test src/components/practice/practice-catalog.test.tsx` exits non-zero with assertion failure (Red phase; passing test here is a failure).

### Task 3.2 — Align TestCard badge formatting and truncation in skill-catalog.tsx (Green phase)
- **Goal:** Cập nhật `TestCard` dùng chung quy ước trim & join `[item.collection, item.testGroup]` với `PracticeIntroScreen` và bổ sung `max-w-[calc(100%-1.25rem)] truncate` chống tràn badge trên card hẹp.
- **Target files and symbols:**
  - `apps/student/src/components/practice/skill-catalog.tsx` (`TestCard`, lines 54–127)
- **Steps:**
  1. Trong `TestCard`, tính:
     ```tsx
     const collectionMeta = [item.collection, item.testGroup]
     	.map((value) => value?.trim())
     	.filter((value): value is string => Boolean(value))
     	.join(" · ");
     ```
  2. Thay khối `{item.collection && (...)}` tại dòng 83–88 bằng:
     ```tsx
     {collectionMeta && (
     	<span
     		data-testid="practice-card-source-badge"
     		className="absolute bottom-2.5 left-2.5 max-w-[calc(100%-1.25rem)] truncate rounded-md bg-background/95 px-2 py-0.5 font-medium text-foreground text-xs shadow-sm"
     	>
     		{collectionMeta}
     	</span>
     )}
     ```
  3. Chạy lại `practice-catalog.test.tsx` và `practice-intro-screen.test.tsx` để xác nhận Green phase.
- **Success criteria:** Toàn bộ test trong `practice-catalog.test.tsx` và `practice-intro-screen.test.tsx` pass 100%.
- **Verify:** `pnpm --filter student test src/components/practice/practice-catalog.test.tsx test/practice-intro-screen.test.tsx` exits 0 and prints `passed`.

### Task 3.3 — Run full local quality gates & 3-viewport Light/Dark UI verification
- **Goal:** Xác minh toàn bộ repo sạch lỗi format/lint, typecheck pass trên tất cả packages, mọi test liên quan pass 100%, và có bằng chứng kiểm chứng giao diện 3 viewport (1440×900, 768×1024, 375×812) Light/Dark cho POT (không chạy full E2E local theo `AGENTS.md`).
- **Target files and symbols:** Toàn workspace bị ảnh hưởng.
- **Steps:**
  1. Chạy `pnpm exec biome check .` (nếu có lỗi format do file mới tạo, sửa bằng `pnpm check:fix` rồi chạy lại `pnpm exec biome check .`).
  2. Chạy `pnpm check-types`.
  3. Chạy đầy đủ các test suites liên quan:
     - `pnpm --filter @teacher-os/db test`
     - `pnpm --filter @teacher-os/infra test src/flat-migrations.test.ts`
     - `pnpm --filter server test src/listening-bikes-dedup-unknown-source-migration.test.ts src/listening-bikes-q5-migration.test.ts src/study-pack-migration.test.ts src/listening-library-import.test.ts src/routes/student-practice-library-sync.test.ts src/routes/student-practice.test.ts src/routes/student-history.test.ts`
     - `pnpm --filter student test src/components/practice/practice-catalog.test.tsx test/practice-intro-screen.test.tsx`
     - `node --test scripts/ci-workflow.test.mjs`
  4. Kiểm chứng UI 3 viewport (1440×900, 768×1024, 375×812) Light/Dark cho màn `/student/practice/listening` (chạy `pnpm design:compare` nếu áp dụng hoặc chụp screenshot qua Playwright nhắm đúng màn `s-practice-listening` với dữ liệu seed Bikes `"Other sources · Section 4"` + badge dài + badge chỉ có `testGroup`, lưu vào `plans/reports/887-*.png` để đính kèm POT).
- **Success criteria:** 0 lỗi Biome, 0 lỗi TypeScript, 100% test suites pass, và không có lỗi tràn/lệch UI ở 3 viewport Light/Dark.
- **Verify:** `pnpm exec biome check . && pnpm check-types && pnpm --filter @teacher-os/db test && pnpm --filter @teacher-os/infra test src/flat-migrations.test.ts && pnpm --filter server test src/listening-bikes-dedup-unknown-source-migration.test.ts src/listening-bikes-q5-migration.test.ts src/study-pack-migration.test.ts src/listening-library-import.test.ts src/routes/student-practice-library-sync.test.ts src/routes/student-practice.test.ts src/routes/student-history.test.ts && pnpm --filter student test src/components/practice/practice-catalog.test.tsx test/practice-intro-screen.test.tsx && node --test scripts/ci-workflow.test.mjs` exits 0.

## Verification

- `pnpm exec biome check .`
- `pnpm check-types`
- `pnpm --filter @teacher-os/db test`
- `pnpm --filter @teacher-os/infra test src/flat-migrations.test.ts`
- `pnpm --filter server test src/listening-bikes-dedup-unknown-source-migration.test.ts src/listening-bikes-q5-migration.test.ts src/study-pack-migration.test.ts src/listening-library-import.test.ts src/routes/student-practice-library-sync.test.ts src/routes/student-practice.test.ts src/routes/student-history.test.ts`
- `pnpm --filter student test src/components/practice/practice-catalog.test.tsx test/practice-intro-screen.test.tsx`
- `node --test scripts/ci-workflow.test.mjs`
- Visual check 3 viewport (1440×900, 768×1024, 375×812) Light/Dark cho `/student/practice/listening`

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
