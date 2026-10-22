# Phase 01 — Sửa 3 comment trỏ route /syllabi đã gỡ

Mọi thay đổi trong phase này là comment-only: KHÔNG được đổi bất kỳ dòng code, string
literal, identifier nào. Nếu một lệnh `sed`/edit chạm ngoài đúng dòng chỉ định → đã sai,
dừng theo Failure Protocol.

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

### Task 1.1 — Comment invoiceCreateSchema trong contracts.ts
- Goal: comment JSDoc của `invoiceCreateSchema` trỏ route tạo syllabus còn sống.
- Target files: `packages/api/src/contracts.ts` — dòng 1133, trong JSDoc block ngay trên
  `export const invoiceCreateSchema`.
- Steps:
  1. Tìm chính xác dòng ` * consistent with POST /syllabi.` (duy nhất trong file).
  2. Thay bằng ` * consistent with POST /api/syllabus-templates.` — giữ nguyên indent
     1 space + `*`, không đụng dòng nào khác.
- Success criteria: file không còn chuỗi `POST /syllabi` ngoài dạng mới; dòng 1133-1134
  đọc `* consistent with POST /api/syllabus-templates.` rồi `*/`.
- Verify: `grep -c "POST /api/syllabus-templates" packages/api/src/contracts.ts` in `1` và
  `grep -c "consistent with POST /syllabi" packages/api/src/contracts.ts` in `0`.

### Task 1.2 — Comment route POST /invoices trong kernel.ts
- Goal: comment trên handler `kernel.post("/invoices")` trỏ đúng route thay thế.
- Target files: `apps/server/src/routes/kernel.ts` — dòng 1082, comment ngay trên
  `kernel.post("/invoices", async (c) => {`.
- Steps:
  1. Tìm chính xác dòng `	// Issue #60 — creation is non-idempotent, consistent with POST /syllabi.`
     (duy nhất trong file).
  2. Thay `POST /syllabi.` bằng `POST /api/syllabus-templates.` — giữ nguyên tab indent,
     prefix `// Issue #60 — creation is non-idempotent, consistent with`, không đụng dòng khác.
- Success criteria: comment đọc
  `// Issue #60 — creation is non-idempotent, consistent with POST /api/syllabus-templates.`
- Verify: `grep -c "consistent with POST /api/syllabus-templates" apps/server/src/routes/kernel.ts`
  in `1` và `grep -c "consistent with POST /syllabi" apps/server/src/routes/kernel.ts` in `0`.

### Task 1.3 — Comment quizWriteGuard trong student.ts
- Goal: comment precedent bodyLimit trỏ tới route đang giữ pattern đó hôm nay.
- Target files: `apps/server/src/routes/student.ts` — dòng 363, trong `createQuizWriteGuard`,
  comment ngay trên `return bodyLimit({`.
- Steps:
  1. Tìm chính xác dòng `			// Content-Length không lọt) — precedent kernel.ts /syllabi.`
     (duy nhất trong file).
  2. Thay bằng `			// Content-Length không lọt) — precedent POST /api/syllabus-templates (syllabus.ts).`
     — giữ nguyên 3-tab indent, dòng trên (`// Cap đo TRÊN BYTE THẬT của body (chunked/malformed`)
     giữ nguyên.
- Success criteria: comment precedent trỏ route sống; route đó thật sự dùng bodyLimit đo
  byte thật (`apps/server/src/routes/syllabus.ts:417-421`).
- Verify: `grep -c "precedent POST /api/syllabus-templates (syllabus.ts)" apps/server/src/routes/student.ts`
  in `1` và `grep -c "precedent kernel.ts /syllabi" apps/server/src/routes/student.ts` in `0`.

### Task 1.4 — Verify toàn phase
- Goal: chứng minh diff chỉ là 3 dòng comment và không phá gì.
- Target files: không sửa gì — chỉ chạy lệnh.
- Steps:
  1. `git diff --stat` → đúng 3 file, mỗi file 1 insertion +1 deletion.
  2. `git diff` → chỉ 3 dòng comment thay đổi, 0 dòng code.
  3. `pnpm check` → exit 0.
  4. `pnpm check-types` → exit 0.
  5. `pnpm --filter server test` → exit 0.
- Success criteria: cả 5 lệnh thoả điều kiện trên.
- Verify: exit code từng lệnh (0) và output `git diff --stat` = 3 files changed,
  3 insertions, 3 deletions.
