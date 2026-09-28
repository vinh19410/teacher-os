---
phase: 6
title: "E2E & Extensibility"
status: done
priority: P1
effort: "4h"
dependencies: [5]
---

# Phase 6: E2E & Extensibility

## Goal
Chứng minh full-flow bằng Playwright (tạo bộ Reading 3 part/40 câu, paste key, compare, apply, preview 1–40), khoá các failure mode bằng source-parse contract test, xác nhận extensibility 3 skill còn lại chỉ là config, và cập nhật docs.

## Key Insights
- E2e boot app thật + D1 local (pattern `apps/e2e/specs/assignment-prompt-create.spec.ts`); timezone pin Asia/Ho_Chi_Minh.
- Source-parse contract test là vũ khí sẵn có của repo (mẫu `apps/web/src/lib/kernel-runtime.contract.test.ts` assert `emptyKernelData` ở dòng 42) — dùng để cấm `qStartOf` trong code test-builder.
- Extensibility Listening/Writing/Speaking phải **không cần PR code mới**: slot render từ `ASSIGNMENT_TEST_PRESETS`, composer hiện đã hỗ trợ types của 3 skill kia.

## Files to Create / Modify

- Create: `apps/e2e/specs/assignment-test-create.spec.ts`
- Modify: `apps/web/src/lib/kernel-runtime.contract.test.ts` (thêm assert source-parse)
- Modify: `docs/codebase-summary.md` (mục "Where to look first" thêm entry test builder)
- Modify: `CHANGELOG.md`

## Tasks & Steps

### Task 6.1 — E2E full-flow Reading
- Goal: 1 spec chạy trọn luồng soạn bộ đề Reading.
- Target files: `apps/e2e/specs/assignment-test-create.spec.ts`.
- Steps:
  1. Đăng nhập giáo viên (helper theo spec hiện có) → vào `/assignments/tests/new`.
  2. Điền header: title "Reading - Test E2E - Trainer 2", time 60:00, collection "IELTS Trainer 2 Academic", group "TEST 5".
  3. Soạn 2 part reading qua UI composer (`/assignments/new`, theo pattern spec `assignment-prompt-create.spec.ts` — **boot.ts wipe DB mỗi lần chạy, không có seed/fixture nào sẵn**) rồi tạo 1 part mới inline trong builder (composer lockPart, 12 câu tfng) → tổng 40 câu ở 3 slot.
  4. Mở Answers Checking → paste key 40 dòng (2 dòng cố tình sai) → Compare thấy đúng 2 mismatch → sửa 2 dòng → Apply → grid toàn match.
  5. Vào Preview → assert text "Questions 1-40" và passage 3 part hiện diện, KHÔNG thấy đáp án.
  6. Save → reload trang edit → slots + key còn nguyên (snapshot persist).
- Success criteria: spec xanh end-to-end trên D1 local.
- Verify: `pnpm --filter e2e e2e assignment-test-create` exit 0 (filter tên file là positional arg của playwright, KHÔNG có `--`). Sau đó full suite: `pnpm --filter e2e e2e` exit 0 (kể cả 3 spec cũ assignment — chứng minh không phá luồng single-part).

### Task 6.2 — Source-parse contract tests (khoá failure modes)
- Goal: 3 regression tường cấm lỗi tái diễn.
- Target files: `apps/web/src/lib/kernel-runtime.contract.test.ts`.
- Steps:
  1. Assert source `apps/web/src/components/assignment-tests/**` và `apps/web/src/lib/test-ranges.ts` KHÔNG chứa chuỗi `qStartOf` (theo mẫu source-parse test hiện có trong file này).
  2. Assert `emptyKernelData` chứa `assignmentTests` (rồi — thêm assertion giá trị `[]`).
  3. Assert `apps/web/src/routes-matcher.ts` chứa `/assignments/tests/new` và `/assignments/tests/preview`.
- Success criteria: cả 3 assert pass; thử thêm tạm chuỗi `qStartOf` vào 1 file test-builder ( tay ) làm test ĐỎ rồi undo — chứng minh test có răng (bước thủ công này không commit).
- Verify: `pnpm -F web test -- kernel-runtime.contract` exit 0.

### Task 6.3 — Xác nhận extensibility 3 skill (không code mới)
- Goal: chọn preset Listening/Writing/Speaking trong builder hoạt động đúng slot.
- Target files: không file **logic** mới — chỉ chạy kiểm tra và tạo file test `apps/web/src/components/assignment-tests/test-builder-shell.test.tsx` (4 case preset). Nếu thiếu mới được phép sửa config.
- Steps:
  1. Mở `/assignments/tests/new` → đổi Preset sang Listening → shell hiển thị 4 slot s1–s4; Writing → 2 slot task1/task2; Speaking → 3 slot part1–3 (unit test component shell với 3 preset này).
  2. Time limit Speaking mặc định mở (nullable — để trống được); Writing hiển thị 2 slot đúng.
  3. Nếu phát hiện hard-code reading: sửa tại chỗ theo risk note phase 3 (slots luôn từ preset), thêm case test.
- Success criteria: 3 unit test shell (mỗi skill 1 case) pass; không file logic mới cho 3 skill.
- Verify: `pnpm -F web test -- test-builder-shell` exit 0 với 4 case preset (reading/listening/writing/speaking).

### Task 6.4 — Docs
- Goal: người sau tìm đúng cửa vào.
- Target files: `docs/codebase-summary.md`, `CHANGELOG.md`.
- Steps:
  1. codebase-summary.md "Where to look first": thêm đoạn — đổi test builder thì bắt đầu `apps/web/src/routes/_auth/assignments/tests/new.tsx`, catalog slot `ASSIGNMENT_TEST_PRESETS` trong `packages/api/src/contracts.ts`, đánh số `apps/web/src/lib/test-ranges.ts`.
  2. CHANGELOG.md: mục mới mô tả IELTS Full Test Builder (entity test, answers checking, preview, extensibility).
- Success criteria: 2 file có nội dung mới, link path tồn tại.
- Verify: `grep -c "assignment-test" docs/codebase-summary.md` ≥ 1.

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

## Risk Assessment
- **E2e flaky do seed prompt thiếu** — spec tự seed 2 prompt reading trước khi bắt đầu (xem cách spec hiện có setup dữ liệu), không phụ thuộc DB để sẵn.
- **Giờ CI dài thêm** — 1 spec mới, chấp nhận được; giữ spec gọn bằng data-driven loop khi có thể.

## Security Considerations
- Spec dùng tài khoản test của e2e env hiện có, không credentials thật.

## Todo

- [x] Task 6.1 — E2E full-flow + full suite xanh
- [x] Task 6.2 — 3 source-parse contract test
- [x] Task 6.3 — Extensibility 3 skill (unit 4 preset)
- [x] Task 6.4 — Docs + CHANGELOG
- [x] `pnpm test` (workspace) + `pnpm --filter e2e e2e` exit 0
