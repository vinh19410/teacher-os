---
phase: 4
title: "E2E keyboard theo role+name, fieldset scope theo row id"
status: pending
priority: P2
effort: "1.5h"
dependencies: []
---

# Phase 4: E2E keyboard không đếm Tab mù

## Goal

Test keyboard ở `admin-library-reading.spec.ts` định vị hàng cây bằng role+name (bất biến trước thêm/bớt nút), assert scroll target qua row id ổn định; helper `fillQuestionRow` scope fieldset theo row id của part thay vì `.nth()` toàn trang. KHÔNG giảm số assertion.

## Files to Create / Modify

- Modify: `apps/e2e/specs/admin-library-reading.spec.ts` (section keyboard ~:562-584, helper `fillQuestionRow` :60-70 + call sites)

## Tasks & Steps

### Task 4.1 — Keyboard section bỏ con số 7 cố định, GIỮ kiểm chứng Tab
<!-- Updated: Red Team RT-1 — giữ kiểm chứng Tab (trần 20 + toBeFocused + assert thứ tự), bỏ focus() thay thế -->
- Goal: test không còn phụ thuộc số nút trung gian (thêm/bớt nút không làm lệch) nhưng VẪN chứng minh cây đi tới được bằng Tab — không được thay bằng `.focus()` (sẽ làm yếu test, mất kiểm chứng bàn phím).
- Target files: `apps/e2e/specs/admin-library-reading.spec.ts` (khối "11. Bàn phím").
- Steps:
  1. Từ trạng thái focus hiện tại (nút "Thu gọn mục lục" → 1 Tab đã tới "Passage 1", assert focus-ring giữ nguyên), thay `for (i=0; i<7; i++) press Tab` bằng vòng lặp CÓ TRẦN: tối đa 20 lần `page.keyboard.press("Tab")`, sau mỗi lần ghi `document.activeElement?.textContent ?? ""` vào mảng `traversed`; dừng khi `row5` focus — chốt bằng `await expect(row5).toBeFocused()` (trần 20 vượt mà chưa focus → test fail, KHÔNG tăng trần vô hạn).
  2. `row5` định vị role+name: `outline(page).getByRole("button", { name: "Câu 5", exact: true })`.
  3. Assert THỨ TỰ: `traversed` phải bằng danh sách tên các nút hàng của p1 lấy TỪ CHÍNH `outline(page)` (DOM order, đoạn giữa "Passage 1" và "Câu 5" — vd `["Nhóm 1", "Câu 1", "Câu 2", "Câu 3", "Nhóm 2", "Câu 4", "Câu 5"]`) — so dark với locator chứ không hard-code mảng trong test.
  4. `Enter` → assert scroll target bằng row id ổn định ĐÃ VERIFY: "Câu 5" là hàng thứ 2 của nhóm gi=1, index hàng trong nhóm đếm từ 0 (bằng chứng: `part-form.test.tsx:1121` `focusRowId("p1", 1, 2, false) === "group-p1-1-q2"` — hàm passthrough; `items` của GroupCard là slice theo nhóm) → id đúng là **`#group-p1-1-q1`**. Vẫn in log/kiểm tra DOM thật khi chạy lần đầu để chốt.
  5. Giữ nguyên phần mũi tên CardTabs phía sau.
- Success criteria: test keyboard pass mà không phụ thuộc con số nút cố định; kiểm chứng Tab-reachable + focus-ring + scroll giữ nguyên (không giảm assertion).
- Verify: chạy spec reading local (env port e2e override) — test "soạn passage có 2 nhóm câu" exit 0.

### Task 4.2 — fillQuestionRow scope theo row id (cả reading + listening)
- Goal: hàng câu flat chọn qua `#${slot}-q${index}` (id có sẵn từ AnswerKeyGrid `${rowIdPrefix ?? partId}-q${index}`) thay vì `fieldset[aria-label^="Câu"]` nth toàn trang — áp dụng CẢ helper copy trong `admin-library-listening.spec.ts:56-63` (kongming gate: plan gốc bỏ sót).
- Target files: `apps/e2e/specs/admin-library-reading.spec.ts`, `apps/e2e/specs/admin-library-listening.spec.ts`.
- Steps:
  1. Đổi signature `fillQuestionRow(page, slot, index, stem, answer)`; row = `page.locator(`#${slot}-q${index}`)`.
  2. Cập nhật TẤT CẢ call sites flat trong CẢ HAI file (grep `fillQuestionRow(`) — số lần gọi giữ nguyên, thứ tự fill giữ nguyên.
  3. Comment helper ghi rõ: id hàng flat là `${slot}-q${n}`; hàng nhóm đã có `fillGroupRow` scope `#group-{slot}-{gi}` từ trước.
- Success criteria: cả 2 spec đọc được, không còn locator `fieldset[aria-label^="Câu"]` dạng nth toàn trang.
- Verify: `grep -rn 'fieldset\[aria-label\^="Câu"' apps/e2e/specs/admin-library-reading.spec.ts apps/e2e/specs/admin-library-listening.spec.ts` trả về 0 dòng (helper đã bỏ).

### Task 4.3 — Chạy e2e admin local
- Goal: cả reading + listening xanh sau refactor.
- Steps:
  1. Bật dev stack theo quy ước repo: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104` (xem AGENTS.md + playwright config của `apps/e2e`).
  2. `pnpm --filter e2e e2e -- admin-library-reading` rồi `-- admin-library-listening` (lệnh chính xác theo `apps/e2e/package.json`).
- Success criteria: 2 spec xanh; nếu watchdog fail hạ tầng (message `[dev-watchdog]`) thì chạy lại sau khi hạ tầng ổn — không nhầm với lỗi test.
- Verify: output playwright: passed cho cả 2 spec.

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
