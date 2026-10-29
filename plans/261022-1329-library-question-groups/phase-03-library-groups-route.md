---
phase: 3
title: "Route admin lưu/đọc nhóm (PR2)"
status: completed
priority: P1
effort: "3h"
dependencies: [2]
---

# Phase 3: Route admin lưu/đọc nhóm (PR2)

## Goal

`PUT /api/admin/library/tests/:id/parts/:part` lưu `groups`; mọi response part (DTO) trả `groups`; validate ready (từng part và cả đề) nhìn thấy `groups`.

## Files to Create / Modify

- Modify: `apps/server/src/routes/admin-library.ts` (functions `toPartInput`, `toPartDto`, handler `router.put("/tests/:id/parts/:part", ...)`)
- Modify: `apps/server/src/routes/admin-library.test.ts`

## Tasks & Steps

### Task 3.1 — Đọc cột `groups` từ row

- Goal: row → input/DTO có `groups`; JSON hỏng → `[]` (giống cách xử lý `questions`).
- Target: `toPartInput`, `toPartDto` trong `admin-library.ts`.
- Steps:
  1. Viết helper riêng cho groups (red-team S5/F8 — không cast mù): `parseGroups(raw: string): LibraryQuestionGroup[]` — `parseJsonArray(raw)` rồi `z.array(libraryQuestionGroupSchema).max(LIBRARY_GROUP_MAX).safeParse`; parse thất bại (JSON hỏng HOẶC phần tử sai shape) → trả `[]` (fail-soft như `questions`; nhóm ngầm là fallback an toàn vì upsert đã chặn dữ liệu sai từ lúc lưu).
  2. Trong `toPartInput`, thêm `groups: parseGroups(row.groups),`.
  3. Trong `toPartDto`, thêm `groups: parseGroups(row.groups),` ngay sau `questions`.
- Verify: `pnpm --filter server check-types` exits 0.

### Task 3.2 — Lưu `groups` khi upsert

- Goal: payload `groups` được ghi vào DB.
- Target: object `content` trong handler PUT part.
- Steps:
  1. Thêm `groups: JSON.stringify(body.data.groups),` ngay sau dòng `optionBank: JSON.stringify(...)`.
  2. Không đổi nhánh validate ready (nó đã dùng `body.data`, nay đã có `groups`).
- Verify: no verification needed (Task 3.3 kiểm).

### Task 3.3 — Test route

- Goal: test HTTP chứng minh lưu/đọc nhóm và 400 cho dải sai.
- Target: `apps/server/src/routes/admin-library.test.ts`. Đọc các test PUT part hiện có trong file và tái dùng đúng helper tạo test/đăng nhập admin của file đó.
- Steps: (red-team A7) file này KHÔNG có literal nào annotate `LibraryPartInput` — payload PUT là literal không annotate và `groups` là input optional nhờ `.default([])` ở schema, nên KHÔNG cần thêm `groups: []` vào fixture nào ở đây (fixture bắt buộc đã xử lý ở Task 2.7 và 2.7 bước 1b). Thêm `describe("PUT part — question groups", ...)`:
  1. PUT part `p1` reading với 5 câu + 2 nhóm hợp lệ (`tfng` 0..2, `note` 3..4, nhóm 2 `answersInline: true` với stem câu 4–5 dạng `"Growers ____ the bogs."`, `type` part = `"tfng"`) → 200; response `part.groups` có độ dài 2 và `part.groups[1].count === 2`.
  2. GET chi tiết đề → part `p1` có `groups` y hệt payload.
  3. PUT với dải hở → 400 `{ error: "invalid body" }`.
  4. PUT part không có field `groups` (payload cũ) → 200 và `part.groups` là `[]`.
  5. Đề đã ready: PUT nhóm inline có câu 4 (index 3) thiếu `____` → 400 với `code: "NOT_READY"` và `issues` chứa path `questions.3.stem`. (Dựng đề ready bằng đúng cách các test ready hiện có trong file làm.)
- Verify: `pnpm --filter server test admin-library --reporter=verbose` exits 0, output không có `FAIL`.

### Task 3.4 — Gate server

- Verify: `pnpm --filter server check-types && pnpm --filter server test` exit 0.

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
