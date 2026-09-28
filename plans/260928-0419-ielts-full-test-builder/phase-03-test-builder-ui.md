---
phase: 3
title: "Test Builder UI"
status: pending
priority: P1
effort: "7h"
dependencies: [2]
---

# Phase 3: Test Builder UI

## Goal
Route Test Builder mới (`/assignments/tests/new` + edit) theo bố cục Selfomy: form header (title/description/timeLimit/preset/collection/group), outline trái, 3 slot part (chọn từ ngân hàng hoặc soạn mới bằng composer nhúng khóa skill/part), autosave draft riêng — với `computeTestRanges` là hàm đánh số duy nhất, được unit test 4 case trước khi UI dùng.

## Key Insights
- **Tuyệt đối không dùng `qStartOf`/preset qStart tĩnh (1/14/27 — `apps/web/src/components/assignments/assignment-presets.ts:178-206`) làm đánh số của test.** Part thật có thể 12 câu; số cứng làm lệch toàn bộ answers panel. Nguồn số duy nhất: `computeTestRanges`.
- Composer nhúng phải **khóa skill/part**: `PromptComposer` có ChipFilter đổi skill/part (`prompt-composer.tsx:65-118` area) — nhúng nguyên bản cho giáo viên đổi skill giữa chừng làm part lệch preset của test. Thêm prop khóa, KHÔNG deep-link `/assignments/new` (autosave single-part draft-store ở đó sẽ xung đột máy trạng thái).
- Draft store test-level cần **schemaVersion mới** (`apps/web/src/lib/assignment-draft-store.ts` đang `schemaVersion: 1`) — không tái dùng shape single-part; trần ~200KB (3 passage × 20KB vẫn ổn).
- UI dùng TanStack Query + repo từ phase 2; state form cục bộ theo pattern `useState` của composer hiện tại.

## Files to Create / Modify

- Create: `apps/web/src/lib/test-ranges.ts` + `test-ranges.test.ts` (hàm thuần, không React)
- Create: `apps/web/src/routes/_auth/assignments/tests/new.tsx` (+ `tests/$id.tsx` edit)
- Create: `apps/web/src/components/assignment-tests/test-builder-shell.tsx`
- Create: `apps/web/src/components/assignment-tests/test-header-form.tsx`
- Create: `apps/web/src/components/assignment-tests/test-part-slot.tsx`
- Create: `apps/web/src/components/assignment-tests/prompt-picker-dialog.tsx`
- Create: `apps/web/src/lib/assignment-test-draft-store.ts` + test
- Modify: `apps/web/src/components/assignments/prompt-composer.tsx` (prop khóa skill/part)
- Modify: `apps/web/src/lib/repos/assignment-tests.ts` (nếu cần helper view-model)

## Tasks & Steps

### Task 3.1 — `computeTestRanges` (hàm thuần + 4 case test)
- Goal: hàm đánh số liên tục duy nhất cho toàn bộ test-builder, viết và test TRƯỚC mọi UI.
- Target files: `apps/web/src/lib/test-ranges.ts` (mới), `test-ranges.test.ts` (mới).
- Steps:
  1. Export `computeTestRanges(test: { parts: { part: string; qStartOverride: number | null; promptQuestions: { stem: string }[] }[] }): { part: string; qStart: number; count: number }[]` — qStart của part đầu = 1 (hoặc qStartOverride nếu có); qStart phần sau = qStart phần trước + count phần trước, trừ khi phần đó có qStartOverride.
  2. Viết vitest 4 case: (a) 13/13/14 → qStart 1/14/27; (b) **12/14/14 → qStart 1/13/27**; (c) qStartOverride giữa chặng đè số; (d) part chưa có prompt (count 0) không làm lệch các part sau.
  3. Case (b) là regression then chốt — comment trong test ghi rõ nguồn: part thật không luôn 13 câu.
- Success criteria: 4 case pass; hàm không import gì từ React.
- Verify: `pnpm -F web test -- test-ranges` exit 0 với 4 test pass.

### Task 3.2 — Composer prop khóa skill/part
- Goal: nhúng `PromptComposer` vào test-builder mà giáo viên không đổi được skill/part của slot.
- Target files: `apps/web/src/components/assignments/prompt-composer.tsx`.
- Steps:
  1. Thêm prop optional `lockPart?: boolean` (mặc định false — hành vi route `/assignments/new` hiện tại không đổi).
  2. Khi `lockPart` true: ẩn 2 ChipFilter "Kỹ năng" và part (vùng `prompt-composer.tsx` ~65-118), hiện label tĩnh skill/part từ value.
  3. Chạy lại toàn bộ test hiện có của composer.
- Success criteria: composer render với lockPart không có chip đổi skill/part; e2e cũ vẫn qua.
- Verify: `pnpm -F web test` exit 0.

### Task 3.3 — Routes + shell 2 cột
- Goal: route mới boot được, đọc snapshot qua repo, layout outline trái + editor phải.
- Target files: `apps/web/src/routes/_auth/assignments/tests/new.tsx`, `tests/$id.tsx`, `components/assignment-tests/test-builder-shell.tsx`.
- Steps:
  1. Route `new.tsx`: state test mới mặc định skill=reading. Select Preset bật **cả 4 skill** (mỗi skill hiển thị đúng số slot của nó từ `ASSIGNMENT_TEST_PRESETS` — Reading 3, Listening 4, Writing 2, Speaking 3; phase 6 có unit test riêng cho từng preset).
  2. Route `$id.tsx`: load test theo id từ repo snapshot, chỉnh sửa.
  3. Shell: cột trái outline "Test → [slot p1/p2/p3 → question count qua computeTestRanges]" + meta "N parts, N questions" theo mẫu Selfomy ("3 groups, 13 questions"); cột phải là header form + slots.
  4. Cập nhật `routes-matcher.ts` nếu có route động cần thêm (matcher là exact-routes; chỉ thêm exact đã định ở phase 2).
- Success criteria: vào `/assignments/tests/new` render shell; chọn test có sẵn load đủ data; không route nào 404 do matcher.
- Verify: `pnpm -F web test` exit 0; `pnpm check-types` exit 0; `pnpm dev:web` tay truy cập `/assignments/tests/new` trả 200 (curl `http://localhost:5173/assignments/tests/new` — dev server SPA, kiểm HTTP 200).

### Task 3.4 — Header form
- Goal: form metadata bộ đề đúng hành vi Selfomy.
- Target files: `components/assignment-tests/test-header-form.tsx`.
- Steps:
  1. Trường: Title* (≤200), Description (textarea ≤2000), Time Limit* (input MM:SS hoặc HH:MM:SS; hiển thị "60:00" cho 3600s; lưu `timeLimitSeconds`), Preset (select 4 skill — hiển thị "Academic IELTS Reading"…), Collection (input + `<datalist>` distinct từ `snapshot.assignmentTests.map(t => t.collection)` — gõ giá trị mới = tạo mới inline như Selfomy Create), Group (input + datalist tương tự).
  2. Validate client theo cùng rule zod `assignmentTestCreateSchema` (import từ packages/api, không copy rule).
  3. Nút Save gọi action create/update test; sau save chuyển `/assignments/tests/$id`.
- Success criteria: điền form + save → test xuất hiện trong snapshot (`useQuery` refetch); timeLimit "60:00" lưu 3600.
- Verify: `pnpm -F web test` exit 0 (test component: submit gọi action với payload đúng `timeLimitSeconds: 3600`).

### Task 3.5 — Part slots + picker
- Goal: mỗi slot (theo preset) gán được 1 part từ ngân hàng hoặc soạn mới; outline cập nhật số câu.
- Target files: `components/assignment-tests/test-part-slot.tsx`, `prompt-picker-dialog.tsx`.
- Steps:
  1. Slot trống: nút "Chọn từ ngân hàng" (dialog list prompts filter `skill === test.skill && part === slot.part` — hiển thị title, type, số câu, status) và nút "Soạn mới" (mở `PromptComposer` prop `lockPart` với giá trị skill/part khóa theo slot; save xong gọi create prompt rồi set vào slot).
  2. Slot đã gán: thẻ hiển thị title + type + số câu (từ questions length) + qStart (computeTestRanges) + nút gỡ khỏi slot (chỉ gỡ khỏi test, KHÔNG xóa prompt khỏi ngân hàng) + nút chỉnh (mở composer lockPart với giá trị hiện tại).
  3. Thao tác slot gọi action set parts (PUT đã có từ phase 2).
  4. Dialog picker chỉ list prompt status bất kỳ (draft/ready) nhưng hiển thị badge status.
- Success criteria: gán 3 part vào 3 slot; outline hiển thị "3 parts, 40 questions" với 13/13/14; gỡ part khỏi slot không mất prompt trong ngân hàng.
- Verify: `pnpm -F web test` exit 0 (test interaction: gán slot gọi action set parts payload đúng thứ tự position 0,1,2).

### Task 3.6 — Draft store test-level
- Goal: autosave draft bộ đề (localStorage TTL 7 ngày theo pattern hiện tại), shape riêng, không đụng draft single-part.
- Target files: `apps/web/src/lib/assignment-test-draft-store.ts` (mới + test).
- Steps:
  1. Shape: `{ schemaVersion: 2, savedAt, test: { title, description, skill, timeLimitSeconds, collection, testGroup }, slotDrafts: Record<part, promptDraft | null> }` — promptDraft là ComposerValue nhúng.
  2. Validator shape kiểu `composerValueShape` hiện có; từ chối (bỏ draft) khi parse lỗi hoặc > 200KB.
  3. KHÔNG đổi `assignment-draft-store.ts` (schemaVersion 1 giữ nguyên cho single-part).
- Success criteria: refresh trang giữa chừng soạn 2 slot → restore đủ state; draft hỏng bị bỏ không crash.
- Verify: `pnpm -F web test -- assignment-test-draft-store` exit 0.

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
- **Dùng qStart tĩnh** — đã chặn bằng Task 3.1 viết trước + phase 6 thêm source-parse test cấm `qStartOf` trong `components/assignment-tests/**` và `lib/test-ranges.ts` là nguồn duy nhất.
- **Xung đột autosave 2 draft store** — key localStorage khác nhau (`teacher-os:test-draft:*`), schemaVersion riêng.
- **Slot UI hard-code reading** — mọi render slot lấy từ `ASSIGNMENT_TEST_PRESETS[skill].slots`, không hard-code p1/p2/p3 trong component.

## Security Considerations
- Draft localStorage chỉ chứa nội dung đề (không có token/auth) — như draft store hiện tại.
- Prompt picker chỉ hiện prompts cùng org (đã lọc bởi snapshot org-scoped).

## Todo

- [ ] Task 3.1 — computeTestRanges + 4 case (viết TRƯỚC)
- [ ] Task 3.2 — Composer prop lockPart
- [ ] Task 3.3 — Routes + shell 2 cột
- [ ] Task 3.4 — Header form + datalist collection/group
- [ ] Task 3.5 — Part slots + picker + composer nhúng
- [ ] Task 3.6 — Draft store schemaVersion 2
- [ ] `pnpm -F web test` + `pnpm check-types` exit 0
