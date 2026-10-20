---
phase: 1
title: "Mirror wrong-streak counter + gate assertion theo verdict thực tế"
status: completed
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Mirror wrong-streak counter + gate assertion

## Goal

Test 3 của `apps/e2e/specs/vocab-srs.spec.ts` pass ổn định (không flake theo shuffle
prompt) trong khi assertion wrong-streak overlay vẫn firing đúng khi điều kiện trigger
của nó (≥ 5 wrong/forgot liên tiếp) xảy ra thật; đồng thời sửa flow sau dismiss overlay
để session không còn deadlock trên prompt typing/option.

## Files to Create / Modify

- Modify: `apps/e2e/specs/vocab-srs.spec.ts` — chỉ test 3 ("seeded overdue review card
  requeues on wrong, evicts after 2 forgot; deleting deck keeps streak history"), vòng
  `while` + gate sau vòng lặp. Không đụng test khác.

## Tasks & Steps

### Task 1.1 — Sửa nhánh overlay: dismiss + advance feedback

- Goal: sau khi dismiss overlay, session advance qua prompt hiện tại thay vì kẹt ở
  input disabled (hiện trạng: `dismissEncouragement` chỉ tự-advance với selfCheck —
  `review-session.ts:321-327`; với typing/option, feedback vẫn mở và
  `inputDisabled = feedback !== null` khóa mọi input — `vocab-session-view.tsx:337`,
  `prompt-typing.tsx:58`, `prompt-word-choice.tsx:44-51` có
  `disabled:pointer-events-none` → Playwright `fill`/`click` sẽ treo chờ
  actionability đến timeout).
- Target: đầu vòng `while`, nhánh `if (await page.getByTestId("vocab-wrong-streak-overlay").isVisible())`.
- Steps — thay nhánh hiện tại (`overlaySeen = true; dismiss; continue;`) bằng:
  ```ts
  if (await page.getByTestId("vocab-wrong-streak-overlay").isVisible()) {
    overlaySeen = true;
    await page.getByTestId("vocab-dismiss-overlay").click();
    // dismiss chỉ tự-advance với selfCheck; typing/option vẫn mở feedback —
    // bấm continue để qua prompt kế (selfCheck: panel đã đóng, bỏ qua).
    const overlayContinue = page.getByTestId("vocab-continue-btn");
    if (await overlayContinue.isVisible()) {
      await expect(overlayContinue).toBeEnabled();
      await overlayContinue.click();
    }
    continue;
  }
  ```
- Success criteria: sau dismiss, vòng lặp quay lại với prompt MỚI (không còn iteration
  hiện feedback cũ); selfCheck (không thể xuất hiện trong review session — pool options
  luôn non-empty) vẫn an toàn vì `isVisible()` false.
- Verify: `pnpm --filter e2e check-types` exit 0.

### Task 1.2 — Thêm mirror counter (đọc verdict) + reset khi overlay

- Goal: biến đếm wrong/forgot liên tiếp phản ánh đúng engine state, đọc từ DOM.
- Target: vòng `while` trong test 3.
- Steps:
  1. Thêm hai biến cạnh `let overlaySeen = false;`:
     ```ts
     let wrongStreak = 0; // mirror của engine: wrong/forgot liên tiếp (§3 rule 4)
     let overlayRequired = false; // engine buộc overlay khi mirror chạm 5
     ```
  2. Trong nhánh overlay của Task 1.1, sau `overlaySeen = true;` thêm
     `wrongStreak = 0;` (engine reset streak về 0 khi hiển thị overlay —
     `review-session.ts:242-244`).
  3. Trong khối feedback CHUNG (phủ cả 3 nhánh trả lời typing/options/self-forgot),
     ngay sau `await expect(feedbackContinue).toBeVisible();` và TRƯỚC
     `await expect(feedbackContinue).toBeEnabled();` thêm:
     ```ts
     const verdict =
       (await page.getByTestId("vocab-feedback-verdict").textContent()) ?? "";
     expect(
       ["Chính xác", "Chưa đúng", "Chưa nhớ"],
       "feedback verdict text drift",
     ).toContain(verdict);
     if (verdict === "Chính xác") {
       wrongStreak = 0;
     } else {
       wrongStreak += 1;
     }
     if (wrongStreak >= 5) {
       overlayRequired = true;
     }
     ```
     (panel và nút continue render cùng một commit React —
     `vocab-feedback-panel.tsx:51-62` — nên lúc nút visible thì verdict đã có mặt;
     whitelist chặn mirror-inflation nếu UI copy drift.)
- Success criteria: mỗi prompt trả lời được đếm đúng verdict; overlay làm reset mirror
  đúng như engine; nhánh `continue` chờ render không đọc verdict.
- Limitation note (không sửa trong scope này): nếu selfCheck thật sự xuất hiện trong
  review session, nhánh self-forgot đã treo sẵn ở
  `expect(vocab-continue-btn).toBeVisible()` vì selfCheck không render feedback panel
  (`vocab-session-view.tsx:479`) mà auto-continue sau 240ms — là pre-existing, độc lập
  với thay đổi này.
- Verify: `pnpm --filter e2e check-types` exit 0.

### Task 1.3 — Thay gate `safety >= 5` bằng `overlayRequired` + assert nghịch

- Goal: assertion chỉ chạy khi trigger thật xảy ra; mirror drift bị phát hiện 2 chiều.
- Target: khối sau vòng `while` trong test 3.
- Steps — thay:
  ```ts
  // Chỉ assert overlay khi session đủ dài để chạm streak 5.
  if (safety >= 5) {
    expect(overlaySeen, "wrong-streak overlay appeared").toBe(true);
  }
  ```
  bằng:
  ```ts
  // Assertion bám điều kiện trigger thật của overlay (≥ 5 wrong/forgot liên tiếp,
  // đếm từ feedback verdict) thay vì proxy `safety` (tăng cả vòng chờ render) — #379.
  if (overlayRequired) {
    expect(overlaySeen, "wrong-streak overlay appeared").toBe(true);
  }
  // Assert nghịch: overlay xuất hiện ⇒ mirror phải đạt 5 (phát hiện mirror drift).
  if (overlaySeen) {
    expect(overlayRequired, "overlay implies 5 wrong/forgot counted").toBe(true);
  }
  ```
  Giữ nguyên biến `safety` với vai trò cap vòng lặp (60) — không xóa.
- Success criteria: không còn `safety >= 5` ở gate; hai assertion đối xứng.
- Verify: `grep -c "safety >= 5" apps/e2e/specs/vocab-srs.spec.ts` → `0`;
  `grep -c "overlayRequired" apps/e2e/specs/vocab-srs.spec.ts` → ≥ 3.

### Task 1.4 — Kiểm chứng runtime (multi-run green + gates repo)

- Goal: bằng chứng chạy thật, không chỉ compile.
- Steps (dev stack local chiếm 8000/8001/8003 — e2e bắt buộc dùng override port,
  `apps/e2e/playwright.config.ts:5-7`):
  1. `pnpm check` → exit 0.
  2. `pnpm check-types` (root, turbo) → exit 0.
  3. `pnpm --filter student test` → exit 0 (chắc chắn không đụng unit coverage).
  4. `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e -- vocab-srs`
     chạy full-file, lặp **3 lần liên tiếp** → cả 3 exit 0. Lưu ý: nếu test KHÁC trong
     file flake (ví dụ countdown nhạy thời gian), đó là ngoài scope fix này — ghi nhận
     evidence, không scope-creep, không từ bỏ gate của test 3.
- Success criteria: 3/3 run green (hoặc fail ngoài scope đã ghi nhận rõ); test 3
  không fail lần nào.
- Verify: exit code từng lệnh = 0; ghi lại số run và kết quả vào completion report.

## Verification

- `pnpm --filter e2e check-types` → exit 0.
- `pnpm check` → exit 0; `pnpm check-types` (root) → exit 0.
- `pnpm --filter student test` → exit 0.
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e -- vocab-srs` × 3 → 3/3 exit 0, test 3 green mọi run.

## TDD note (red state không tái lập được)

Đây là flake xác suất: red state gốc (fail tại gate) chỉ xuất hiện theo shuffle và đã
được ghi nhận 1/1 trong run gate #377. Chế độ hang sau dismiss (F1) cũng chỉ xảy ra
khi overlay xuất hiện (~vài % mỗi run). Không thể tạo red test deterministic từ e2e;
regression gate của plan này là **multi-run green e2e** + hai assertion đối xứng
(thiếu overlay khi mirror ≥ 5 → fail; có overlay khi mirror < 5 → fail).

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
