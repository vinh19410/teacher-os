---
phase: 2
title: "Server Routes & Snapshot"
status: pending
priority: P1
effort: "5h"
dependencies: [1]
---

# Phase 2: Server Routes & Snapshot

## Goal
Test CRUD + set parts hoạt động end-to-end qua API (org-scoped, mount trong kernel router), snapshot trả kèm `assignmentTests`, và web có repo mapper + KernelAction dùng được — chứng minh bằng route test round-trip từng field.

## Key Insights
- Routes assignment được mount **bên trong** kernel tree qua `kernel.route("/assignments", assignmentRoutes(deps))` tại `apps/server/src/routes/kernel.ts:2119` — thêm route con vào `assignments/index.ts` là tự được Origin/CSRF guard. **KHÔNG mount standalone** (docblock `apps/server/src/routes/assignments/index.ts:17-21` cảnh báo trực tiếp).
- Mapping field trả về phải tường minh từng cột — comment tại `assignments/index.ts:65-93` nói thẳng "a missing entry here silently drops the field". Round-trip test từng field là bắt buộc.
- Hiện **chưa có endpoint update prompt** (chỉ `GET /` , `POST /prompts` :60, `POST /:id/grade` :102) — Answers Checking (phase 5) cần `PATCH /prompts/:id`, thêm ngay phase này cho gọn server work.
- Snapshot loader chạy `Promise.all` các select org-scoped rồi group in-memory (`apps/server/src/routes/snapshot.ts:166-263`, pattern `targetsByAssignment`) — thêm 2 query rồi group parts theo testId.

## Files to Create / Modify

- Create: `apps/server/src/routes/assignments/tests.ts` (test routes)
- Modify: `apps/server/src/routes/assignments/index.ts` (export + mount tests routes, thêm PATCH prompt)
- Modify: `apps/server/src/routes/snapshot.ts` (load + map `assignmentTests`)
- Modify: `apps/web/src/lib/data-actions.ts` (`KernelAction` union, dòng 8)
- Create: `apps/web/src/lib/repos/assignment-tests.ts` + `assignment-tests.test.ts`
- Modify: `apps/web/src/routes-matcher.ts` (thêm route mới của phase 3 ngay từ bây giờ để sync-test không đỏ đột xuất sau)

## Tasks & Steps

### Task 2.1 — Test routes CRUD + set parts
- Goal: API tạo/sửa/xóa test và gán parts vào slot, validate slot theo preset.
- Target files: `apps/server/src/routes/assignments/tests.ts` (mới), `apps/server/src/routes/assignments/index.ts`.
- Steps:
  1. Viết `testsRoutes(deps)` theo đúng factory pattern của file hiện tại: `POST /tests` (create từ `assignmentTestCreateSchema`), `PATCH /tests/:id` (update meta/status), `DELETE /tests/:id`, `PUT /tests/:id/parts` (nhận `assignmentTestPartsSetSchema` — replace toàn bộ: delete parts cũ + insert mới trong transaction; validate mỗi `part` thuộc `ASSIGNMENT_TEST_PRESETS[test.skill].slots`, mỗi `promptId` tồn tại trong org và `prompt.skill === test.skill`, `prompt.part` khớp slot).
  2. Mọi handler lấy `kernelCtx` như các route hiện tại (org scoping). Trả về DTO map field tường minh theo mẫu `assignments/index.ts:65-93`.
  3. Mount trong `index.ts`: `routes.route("/tests", testsRoutes(deps))` (con của assignmentRoutes → tự nằm trong kernel mount :2119, không sửa kernel.ts).
- Success criteria: 4 verb hoạt động; request gán 2 part cùng slot bị 400; gán prompt sai skill bị 400; request thiếu auth bị 401.
- Verify: `pnpm -F server test` exit 0 (nếu app server có vitest; nếu không có, verify bằng e2e spec phase 6 và bằng `pnpm check-types`). Bổ sung: curl thủ công khi dev không tính là verify chính.

### Task 2.2 — PATCH /prompts/:id (update questions cho Apply)
- Goal: cập nhật được `questions` (và `title/note/status`) của 1 prompt đã có — nguyên liệu cho nút Apply ở phase 5.
- Target files: `apps/server/src/routes/assignments/index.ts`, `packages/api/src/contracts.ts` (thêm `assignmentPromptUpdateSchema` = partial create schema, cùng superRefine question rules).
- Steps:
  1. Thêm `assignmentPromptUpdateSchema` vào contracts (partial của `assignmentPromptCreateSchema`, giữ validate từng question như cũ).
  2. Thêm `routes.patch("/prompts/:id", ...)` vào assignments/index.ts: load prompt theo org, apply patch, lưu, trả DTO map tường minh.
- Success criteria: PATCH đổi answer của question 1 round-trip đúng qua GET; PATCH body sai shape bị 400.
- Verify: `pnpm check-types` exit 0 + (nếu có) `pnpm -F server test` exit 0.

### Task 2.3 — Snapshot enrich
- Goal: `GET /kernel` trả thêm `assignmentTests` (kèm parts đã group).
- Target files: `apps/server/src/routes/snapshot.ts`.
- Steps:
  1. Thêm 2 select org-scoped vào `Promise.all` của `loadSnapshot` (~dòng 166-263): `assignmentTests` + `assignmentTestParts` (join lấy prompt chỉ để lấy `skill/part/questions.length` khi cần — KHÔNG nhúng passage vào DTO test).
  2. Group parts theo `testId` in-memory (mẫu `targetsByAssignment`), sắp xếp theo `position`.
  3. Map field tường minh sang `KernelAssignmentTestRow` (test DTO có `parts: []` mặc định khi chưa có part nào).
- Success criteria: sau khi tạo test + 2 parts (qua API), `GET /kernel` trả 1 row test với `parts.length === 2` đúng thứ tự position.
- Verify: e2e/spec hiện hữu snapshot vẫn xanh: `pnpm --filter e2e e2e --grep "snapshot"` nếu spec tồn tại, nếu không thì `pnpm check-types` exit 0 và để phase 6 e2e phủ.

### Task 2.4 — Web wiring: KernelAction + repo mapper + routes-matcher
- Goal: web gọi được action test và đọc tests từ snapshot.
- Target files: `apps/web/src/lib/data-actions.ts`, `apps/web/src/lib/repos/assignment-tests.ts` (mới + test), `apps/web/src/routes-matcher.ts`.
- Steps:
  1. Thêm vào `KernelAction` union (data-actions.ts:8): create/update/delete test + set parts + update prompt (cho phase 5). Map vào command bus theo pattern action hiện có.
  2. Viết `repos/assignment-tests.ts` theo style `repos/assignment-prompts.ts`: read defensive `?? []`, mapper DTO → view model, và mutation helpers gọi action.
  3. Thêm `"/assignments/tests/new": true, "/assignments/tests/preview": true` vào `VALID_EXACT_ROUTES` (routes-matcher.ts:13) — route file tạo ở phase 3, matcher cập nhật trước để drift-test không đỏ đột xuất.
  4. Viết `assignment-tests.test.ts`: mapper với snapshot thiếu key (`undefined` → `[]`), action payload đúng shape.
- Success criteria: typecheck xanh; repo test xanh; routes-matcher test xanh.
- Verify: `pnpm -F web test` exit 0; `pnpm check-types` exit 0.

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
- **Mount sai chỗ mất CSRF/Origin guard** — nghiêm cấm tạo route mới ngoài kernel mount; docblock :17-21 là lý do.
- **Round-trip thiếu field** (silent drop) — mọi DTO map phải copy từng field rõ ràng, test round-trip từng field.
- **Replace parts không transaction** — PUT /tests/:id/parts phải delete+insert nguyên tử, tránh test bị mất parts nếu 1 insert lỗi.

## Security Considerations
- Mọi handler đọc org từ `kernelCtx` — không bao giờ nhận orgId từ body.
- Validate `promptId` thuộc org trước khi insert vào test_part (chặn IDOR chèn prompt org khác).

## Todo

- [ ] Task 2.1 — Routes CRUD + set parts + validate slot
- [ ] Task 2.2 — PATCH /prompts/:id + update schema
- [ ] Task 2.3 — Snapshot enrich assignmentTests
- [ ] Task 2.4 — KernelAction + repo mapper + routes-matcher + vitest
- [ ] `pnpm check-types` + `pnpm -F web test` exit 0
