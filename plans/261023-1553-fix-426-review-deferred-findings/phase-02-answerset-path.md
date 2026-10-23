---
phase: 2
title: "Thống nhất path lỗi answerSet giữa superRefine và partIssues"
status: pending
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Path lỗi answerSet nhất quán 2 luật

## Goal

Rule "answer set must stay inside one group" emit path `["groups", gi]` (đúng nhóm) trong superRefine — cùng ngữ nghĩa với `partIssues` — và GroupCard hiển thị lỗi cấp nhóm để draft-save chỉ đúng nhóm thay vì message chung chung.

## Files to Create / Modify

- Modify: `packages/api/src/library-contracts.ts` (superRefine của `libraryPartUpsertSchema`)
- Modify: `packages/api/src/library-contracts.test.ts` (test path)
- Modify: `apps/admin/src/components/library/group-card.tsx` (banner lỗi cấp nhóm)
- Modify: `apps/admin/src/components/library/part-form.test.tsx` (assert key + hiển thị)

## Tasks & Steps

### Task 2.1 — Test contract viết TRƯỚC (red)
- Goal: khóa path mới của superRefine.
- Target files: `packages/api/src/library-contracts.test.ts`.
- Steps:
  1. Đọc test sẵn có của superRefine answerSet trong file để copy fixture (tìm "answer set").
  2. Thêm test: part reading có 2 nhóm thật (3+2 câu, `startIndex` 0/3), câu index 2 và 3 cùng `answerSet` (vắt nhóm) → `libraryPartUpsertSchema.safeParse` fail với issue path ĐÚNG `["groups", 0]` — quy ước PARITY với `partIssues`: `gi` tính bằng `findIndex` nhóm chứa câu ĐẦU TIÊN của khóa (index 2 → nhóm 0). Chú thích rõ quy ước này trong test.
  3. Case phụ: khóa 1 câu → path giữ `["questions", firstIndex]` (đã đúng, thêm assert để khóa hành vi).
- Success criteria: test mới fail vì path hiện tại là `["groups"]` thiếu index.
- Verify: `pnpm --filter @teacher-os/api test` — test mới fail đúng assertion path, không fail vì lỗi khác.

### Task 2.2 — Sửa superRefine emit path indexed
- Goal: superRefine tính `gi` như partIssues đang làm.
- Target files: `packages/api/src/library-contracts.ts` (khối superRefine, vòng `answerSetIndexes`).
- Steps:
  1. Trong nhánh `indexes.length < 2` bị vắt nhóm (`value.groups.length > 0 && !inside`): tính `const gi = value.groups.findIndex((g) => firstIndex >= g.startIndex && firstIndex < g.startIndex + g.count);`
  2. `gi >= 0` → `addIssue(["groups", gi], "answer set must stay inside one group")`; `gi < 0` (first index không thuộc nhóm nào — coverage hỏng) → giữ `addIssue(["groups"], ...)` (rule coverage riêng đã chặn trường hợp này).
  3. Không đổi message, không đổi rule khác.
- Success criteria: test Task 2.1 xanh; toàn bộ suite `@teacher-os/api` xanh.
- Verify: chạy lại `pnpm --filter @teacher-os/api test` — exit 0.

### Task 2.3 — Test UI: key lỗi draft-save indexed
- Goal: `partInputFromValue` trả key `groups.{gi}` (GroupCard tra được) thay vì `groups` chung chung.
- Target files: `apps/admin/src/components/library/part-form.test.tsx`.
- Steps:
  1. Tìm test sẵn có của `partInputFromValue` với superRefine (chú thích "RS-F2" trong code chỉ chỗ liên quan).
  2. Thêm assert: fixture vắt nhóm như Task 2.1 → `built.errors` có key `"groups.0"`, value là bản dịch Việt ("Các câu cùng khóa tập đáp án phải nằm trong một nhóm." — qua `messageLabel`), KHÔNG còn key `"groups"` đơn lẻ cho rule này.
- Success criteria: test pass NGAY SAU Task 2.2 (hành vi derive từ contract — nếu đỏ nghĩa có mapping message khác chặn đường, điều tra trước khi sửa).
- Verify: `pnpm --filter @teacher-os/admin test -- part-form` exit 0.

### Task 2.4 — GroupCard hiển thị lỗi cấp nhóm
- Goal: lỗi key `groups.{gi}` (không có field) hiện banner trong đúng thẻ nhóm.
- Target files: `apps/admin/src/components/library/group-card.tsx` (khu đọc `errorFor` :125-134).
- Steps:
  1. Thêm `const groupError = errorFor(\`groups.${index}\`);`
  2. Render khi có giá trị: một dòng `text-destructive text-sm` đặt ở header thẻ nhóm (gần label "nhóm câu N"), `role="alert"` — KHÔNG thay thế các lỗi field có sẵn.
  3. Test ở part-form.test.tsx: render form chứa fixture vắt nhóm với `showErrors` → banner text "Các câu cùng khóa tập đáp án phải nằm trong một nhóm." xuất hiện đúng 1 lần trong thẻ nhóm 1.
- Success criteria: banner hiện đúng thẻ; suite part-form xanh.
- Verify: `pnpm --filter @teacher-os/admin test -- part-form` exit 0.

### Task 2.5 — Focus plan cho key nhóm KHÔNG có field (kongming gate #1)
- Goal: bấm "Lưu" khi lỗi `groups.{gi}` (không field) mở đúng tab Câu hỏi của đúng nhóm, không nhảy tab Nội dung hay cuộn tới id không tồn tại.
- Target files: `apps/admin/src/components/library/part-view-state.ts` (`firstIssueFocusPlan`, regex tại :89), `apps/admin/src/components/library/part-form.test.tsx` (thêm test cạnh test "kongming F2: focusRowId" ~:1115).
- Steps:
  1. Regex hiện tại `/^groups\.(\d+)\.([a-z]+)$/i` không khớp key `groups.0` (thiếu field) → code rơi xuống nhánh part-level `{ partTab: "content", fieldKey: "groups.0" }` — sai tab + id không tồn tại.
  2. Đổi thành `/^groups\.(\d+)(?:\.([a-z]+))?$/i`; khi `field === undefined` → trả `{ partTab: "questions", group: gi, groupTab: "questions" }` (không set fieldKey).
  3. Test: `firstIssueFocusPlan({"groups.0": "…"}, value)` → `{ partTab: "questions", group: 0, groupTab: "questions" }`; và key `groups.0.optionBank` giữ hành vi cũ.
- Success criteria: 2 case mới pass; suite part-form + part-view-state xanh.
- Verify: `pnpm --filter @teacher-os/admin test -- part-form` và `-- part-view-state` exit 0.

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
