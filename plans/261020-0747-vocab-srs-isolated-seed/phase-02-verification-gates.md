# Phase 02 — Verification gates

> Handover contract (`--advice`): mọi Verify là so sánh cơ học — chạy lệnh, đối
> chiếu output. Không đạt → Failure Protocol.
>
> Thứ tự thực thi (kongming checkpoint #2): full-file serial TRƯỚC (bắt hỏng
> đường serial ở lần đầu, rẻ hơn), isolated 5/5 SAU.

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

## Task 2.1 — Diff review cơ học (kongming checkpoint #2, bắt buộc)

- **Goal:** đường serial byte-identical; test 3 chỉ có 2 điểm chèn.
- **Steps:**
  1. `git diff -U0 origin/develop...HEAD -- apps/e2e/specs/vocab-srs.spec.ts`
     (hoặc `git diff -U0` trước khi commit) — đối chiếu:
     - KHÔNG hunk nào nằm trong thân test 1 và test 2;
     - test 3 chỉ thêm: (a) khởi tạo nhánh `isolated` + gọi helper ở đầu,
       (b) điều kiện hoá `signInStudent`; không assertion bị đụng;
     - helper mới nằm trong `test.describe.serial`, sau closure vars, trước
       test 1.
- **Success criteria:** diff khớp mô tả trên.
- **Verify:** output `git diff -U0` không chứa dòng xoá (`^-`) nào thuộc thân
  test 1–2 và không đụng dòng assertion của test 3.

## Task 2.2 — Full-file serial regression (AC #3)

- **Goal:** đường serial (test 1→2→3) không đổi hành vi, 3/3 pass.
- **Steps:**
  1. `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter
     e2e exec playwright test specs/vocab-srs.spec.ts --reporter=line`
- **Success criteria:** exit 0, `3 passed`.
- **Verify:** output chứa `3 passed` và không chứa `flaky`/`failed`.

## Task 2.3 — Isolated stability 5/5 (AC #2 của issue #377)

- **Goal:** test chạy ổn định 5/5 lần liên tiếp ở chế độ isolated.
- **Steps:**
  1. Chạy đủ 5 lần bất kể kết quả (mỗi lần boot đầy đủ stack — KHÔNG reuse
     server):
     ```bash
     for i in 1 2 3 4 5; do
       E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 \
         pnpm --filter e2e exec playwright test specs/vocab-srs.spec.ts \
         --grep "seeded overdue review card" --reporter=line
     done
     ```
- **Success criteria:** cả 5 lần in `1 passed`; không có lần nào `1 failed` hay
  `flaky`.
- **Verify:** output của vòng lặp chứa đúng 5 chuỗi `1 passed` (đếm được; đây là
  bằng chứng duy nhất — exit code lệnh tổng không phải bằng chứng vì vòng sau
  vẫn chạy khi vòng trước fail).

## Task 2.4 — Static gates + scope check

- **Goal:** không phá gate repo; diff đúng phạm vi.
- **Steps:**
  1. `pnpm --filter e2e check-types` → exit 0.
  2. `pnpm check` (root gate của repo) → exit 0.
  3. `git diff --stat origin/develop...HEAD` → chỉ `apps/e2e/specs/vocab-srs.spec.ts`
     + files trong `plans/261020-0747-vocab-srs-isolated-seed/`.
- **Success criteria:** cả 3 lệnh exit 0 / output khớp.
- **Verify:** exit code từng lệnh = 0; `git diff --stat` không có file nào ngoài
  phạm vi trên.
