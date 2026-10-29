# Phase 01 — Helper seedIsolatedEnvironment + restructure test 3

> Handover contract (`--advice`): mỗi task có Goal / Target files / Steps /
> Success criteria / Verify cơ học. Executor không được tự suy bước thiếu.

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

## Files to Create or Modify

- `apps/e2e/specs/vocab-srs.spec.ts` — **file duy nhất** được phép sửa trong
  phase này. Không file nào khác.

## Task 1.1 — Thêm helper `seedIsolatedEnvironment` (trong `describe.serial`, cạnh closure vars)

- **Goal:** helper tái tạo đủ tiền đề mà test 1–2 để lại cho test 3, chỉ chạy
  khi `studentId === ""`.
- **Target files:** `apps/e2e/specs/vocab-srs.spec.ts` — thêm function NÀY
  BÊN TRONG `test.describe.serial`, ngay sau khai báo closure vars
  (`orgId/classId/studentId/deckId/firstWordId/wordIds`) và trước test 1
  (helper phải ghi closure state nên không thể đứng ở mức module).
- **Steps:**
  1. Signature: `async function seedIsolatedEnvironment(page: Page): Promise<void>`.
     Doc-comment tiếng Việt ghi rõ: phục vụ chạy isolated `--grep` (#377);
     đồng bộ shape dữ liệu với test 1 — đổi shape ở test 1 phải sửa cả đây.
  2. **Trước tiên** seed direct-DB (mở `openDb()` như hiện tại, try/finally
     close), theo thứ tự FK:
     - `organization` (id mới, name `SRS Org ${runToken}`),
     - `class` (id mới, org trên, name `className`),
     - `student` (id mới → gán `studentId`, org trên, name "Vocab Student",
       email `studentEmail`, `onboarding_completed_at = now`) — INSERT cùng cột
       với test 1,
     - `enrollment` (full columns `(id, org_id, class_id, student_id, status,
       created_at)` — giá trị `crypto.randomUUID()`, org + class + student trên,
       `'active'`, now — như INSERT của test 1),
     - `vocab_deck` (id mới → gán `deckId`, org + class trên, title `deckTitle`;
       bỏ qua `lang`/`created_at`/`updated_at` nhờ default),
     - 3 × `vocab_word` full columns `(id, deck_id, word, translation,
       sort_order, created_at, updated_at)` — id mới push vào `wordIds` theo thứ
       tự: resilient/kiên cường, sustainable/bền vững, biodiversity/đa dạng sinh
       học, `sort_order` 0/1/2,
     - 3 × `vocab_card` full columns `(id, student_id, word_id, level, state,
       interval_days, due_at, updated_at)` — `id` mới cho từng card, mỗi word 1
       card `(studentId, wordId)`, `level 2`, `state 'review'`,
       `interval_days 1`, `due_at = isSustainable ? now - 86_400_000 : now +
       86_400_000` (word "sustainable" do quá khứ theo Amendment 1),
       `updated_at = now` (unique `(student_id, word_id)` — không trùng; bỏ qua
       `is_warning`/`lapses`/`created_at` nhờ default).
     - Gán cả `orgId`, `classId`, `firstWordId = wordIds[0]` (không bắt buộc
       nhưng giữ invariant của describe).
  3. Sau khi DB seed xong: signup portal **thật** (giống test 2 dòng ~232-241):
     goto `${STUDENT_ORIGIN}/login` → click `#tab-signup` → fill
     `#signup-name` "Vocab Student", `#signup-email` `studentEmail`,
     `#signup-password` `studentPassword` → submit `#panel-signup
     button[type='submit']` → expect text "Email chưa được xác thực" (timeout
     15s) → `await verifyStudentEmailFromMailLog(page, studentEmail)` → expect
     `vocab-home-entry` visible. Comment chéo: phải seed DB **trước** signup để
     `provisionStudentForUser` (match `lower(trim(email))`,
     `apps/server/src/student-provisioning.ts:22-31`) no-op thay vì tạo student
     id khác.
  4. Không thay đổi helper nào có sẵn; không export gì mới.
- **Success criteria:** helper compile; khi chạy isolated nó tự tạo đủ state để
  seed block của test 3 (UPDATE + INSERT) thành công.
- **Verify:** `pnpm --filter e2e exec tsc --noEmit` (trong `apps/e2e`:
  `pnpm --filter e2e check-types`) exit 0. (Verify hành vi ở Task 1.2.)

## Task 1.2 — Restructure mở đầu test 3 theo nhánh isolated/serial

- **Goal:** test 3 tự seed khi chạy isolated; đường serial không đổi hành vi.
- **Target files:** `apps/e2e/specs/vocab-srs.spec.ts`, thân test
  `seeded overdue review card requeues on wrong, evicts after 2 forgot; deleting
  deck keeps streak history` (~dòng 370).
- **Steps:**
  1. Ngay đầu test, TRƯỚC seed block: `const isolated = studentId === "";` rồi
     `if (isolated) { await seedIsolatedEnvironment(page); }` — bắt `isolated`
     TRƯỚC khi helper gán `studentId`.
  2. Seed block hiện tại (UPDATE `vocab_card` + INSERT `vocab_review_log`) giữ
     **nguyên văn** — ở nhánh isolated nó giờ có row để chạm.
  3. Đổi `await signInStudent(page);` thành
     `if (!isolated) { await signInStudent(page); }` kèm comment: nhánh isolated
     đã có session từ verify auto-login trong helper (form login sẽ detach nếu
     đăng nhập lại — precedent comment test 2).
  4. KHÔNG sửa bất kỳ dòng assertion nào khác của test; KHÔNG sửa test 1–2.
- **Success criteria:** diff chỉ gồm: helper mới + 2 điểm chạm trong test 3;
  test 1–2 byte-identical.
- **Verify (red→green của #377):**
  `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e
  exec playwright test specs/vocab-srs.spec.ts --grep "seeded overdue review
  card" --reporter=line` → **exit 0, output chứa `1 passed`**. Trước fix lệnh
  này exit 1 với `FOREIGN KEY constraint failed` (đã ghi nhận ở ak:debug).

## Amendment 1 (kongming verification-failure #2 — Mức 0 "seed-overdue")

Gate isolated đầu tiên fail 0/5: `vocab-overview-due-count` = "0" (expected "1").

- **Root cause:** portal home (`apps/student/src/routes/_auth/index.tsx:158`)
  prefetch `useVocabOverview()` ngay khi mount — TRƯỚC seed block của test.
  Query `["student","vocab-overview"]` có global `staleTime: 60_000` +
  `refetchOnWindowFocus: false` + `networkMode: "offlineFirst"`
  (`apps/student/src/lib/query-client.ts:42`) → SPA navigation tới /vocab phục
  vụ cache cũ mãi mãi (trong 60s). Serial path không bị vì `signInStudent` là
  full page load (cache trắng).
- **Fix (Mức 0 theo counsel kongming, mở rộng):** helper seed THẲNG trạng thái
  đích trước lần đọc đầu tiên của app — card "sustainable" `due_at` quá khứ +
  `vocab_review_log` hôm nay (streak dùng chung query overview; nếu chỉ seed
  card thì cache giữ streak=0 và vỡ assertion `vocab-overview-streak`). Seed
  block của test giữ nguyên cho serial path; ở isolated nó chạy sau nhưng
  idempotent (UPDATE cùng giá trị, INSERT thêm log cùng ngày → streak vẫn
  "1 ngày").
- **Verify amendment:** isolated 5/5 + full-file 1 run xanh (theo gate phase-02).
