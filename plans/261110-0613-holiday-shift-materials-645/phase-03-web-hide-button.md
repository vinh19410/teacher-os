---
phase: 3
title: "Web — ẩn nút Tài liệu trên row holiday + gates"
status: pending
priority: P1
effort: "0.5h"
dependencies: [1, 2]
---

# Phase 3: Web — ẩn nút Tài liệu trên row holiday + gates

## Goal

Nút "Tài liệu" không render trên session row `holiday`; mọi gate repo (`pnpm check`, `pnpm check-types`, test liên quan) pass.

## Files to Create / Modify

- Modify: `apps/web/src/components/class-detail/class-sessions-section.tsx` — khối nút Tài liệu (:346-364).

## Tasks & Steps

### Task 3.0 — Test đỏ web (TDD red, RT-Assumption F3)

- Goal: neo regression "nút Tài liệu không render trên row holiday" trước khi sửa UI.
- Target files: `apps/web/src/routes/_auth/classes/$classId.sessions.test.tsx` (component test cho surface này đã tồn tại).
- Steps:
  1. Thêm case theo pattern có sẵn (:466-470 mở modal qua nút `^Tài liệu buổi`, :555-570 assert absence bằng `queryAllByRole`): fixture session row `status: "holiday"` → assert số nút khớp `/^Tài liệu buổi/` = 0; row thường (upcoming/completed) vẫn = 1.
  2. Chạy test — phải FAIL (đỏ).
- Success criteria: assertion failure đúng ở assert số nút, không phải lỗi fixture.
- Verify: `pnpm --filter web test '$classId.sessions'` exit khác 0 với assertion failure — đỏ là kỳ vọng (nháy đơn bắt buộc — shell sẽ thay `$classId` bằng rỗng).

### Task 3.1 — Gate nút Tài liệu với status holiday

- Goal: footgun UI khép — giáo viên không còn đường mở modal attach trên buổi holiday vô hình.
- Target files: `apps/web/src/components/class-detail/class-sessions-section.tsx`, điều kiện `{supportsMaterials && (` tại :346 (biến `status` đã tính tại :244 qua `sessionStatus(s)`).
- Steps:
  1. Đổi điều kiện render thành `{supportsMaterials && status !== "holiday" && (` — giữ nguyên mọi logic bên trong (class `ml-3` theo `status === "completed" || dateArrived`).
  2. Không đổi nhãn/badge khác của row holiday (:371 "Nghỉ lễ — Đã dời lịch" giữ nguyên); không đụng `dateArrived` hay các nút khác.
  3. Comment tiếng Việt 1 dòng tại điều kiện: buổi holiday vô hình với học sinh, không mở được modal tài liệu.
- Success criteria: test Task 3.0 xanh; `grep -n "supportsMaterials &&" apps/web/src/components/class-detail/class-sessions-section.tsx` cho thấy điều kiện có `status !== "holiday"`.
- Verify: `pnpm --filter web test '$classId.sessions'` exit 0.

### Task 3.2 — Gates toàn repo

- Goal: chất lượng không giảm — lint/format/type/test sạch.
- Target files: không sửa file, chỉ chạy gates.
- Steps:
  1. `pnpm check:fix` (biome check --write — tự sửa lint/format; root `pnpm check` là READ-ONLY `biome check .` theo `package.json:23-24`; nếu nó đổi file, review diff rồi commit).
  2. `pnpm check` (read-only) phải exit 0 (sạch).
  3. `pnpm check-types` exit 0.
  4. Chạy test liên quan: test server `holidays.test.ts` + `materials.test.ts` exit 0; test web `$classId.sessions.test.tsx` + `materials.test.ts` (web) exit 0.
- Success criteria: cả 4 nhóm lệnh exit 0, không file nào còn diff sau `pnpm check` lần 2.
- Verify: đầu ra từng lệnh trong transcript, exit code 0.

## Verification

- `pnpm check` exit 0 (chạy lần 2 sau lần đầu tự sửa).
- `pnpm check-types` exit 0.
- Test holidays + materials exit 0.

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
