---
phase: 5
title: "Answers Checking"
status: pending
priority: P1
effort: "5h"
dependencies: [4]
---

# Phase 5: Answers Checking

## Goal
Panel soát đáp án tầm test theo hành vi Selfomy: **View All Answers** (grid 40 câu), **Paste answer key** (định dạng `1. A` / `1. True` / `1. Car / Cars` mỗi dòng), **Compare** (diff expected vs actual), **Apply** (ghi đáp án key vào prompts qua PATCH prompt của phase 2).

## Key Insights
- Parse lại dùng pattern đã chứng minh: `PASTE_LINE_PATTERN = /^\s*(\d+)[.)]\s*(.+)$/` tại `apps/web/src/components/assignments/bulk-key-paste.ts:10` — generalize thành hàm thuần nhận ranges của test (không copy component).
- Alt answers phân tách bằng `/` (convention `alts` hiện tại) — "1. Car / Cars" tách thành answer `Car` + alts `["Cars"]`.
- Số dòng key mapping theo **số câu tính từ computeTestRanges**, không theo vị trí trong part (tránh lệ khi part lệch 13 câu — cùng lỗi mode như `bulk-key-paste.ts:5-8` comment "order-mapping misaligns answer keys").
- Apply là thao tác ghi đè nhiều prompt — phải có confirm rõ + preview những gì sẽ đổi trước khi ghi.

## Files to Create / Modify

- Create: `apps/web/src/lib/test-answer-key.ts` + `test-answer-key.test.ts` (parse + compare thuần)
- Create: `apps/web/src/components/assignment-tests/answers-checking-panel.tsx` + test
- Modify: `apps/web/src/components/assignment-tests/test-builder-shell.tsx` (nút bật panel)
- Modify: `apps/web/src/lib/repos/assignment-tests.ts` (helper apply — gọi PATCH prompt từng part)

## Tasks & Steps

### Task 5.1 — Parse key + compare (hàm thuần)
- Goal: parse chuỗi key paste + diff với actual, test trước UI.
- Target files: `apps/web/src/lib/test-answer-key.ts` + test.
- Steps:
  1. `parseTestAnswerKey(text: string, ranges): { number: number; answer: string; alts: string[] }[]` — mỗi dòng match pattern `số. giá trị / alt1 / alt2`; bỏ dòng trống; giá trị tfng chuẩn hóa TRUE/FALSE/NOT GIVEN (case-insensitive), ynng YES/NO/NOT GIVEN, mcq giữ chữ A–D hoa.
  2. `compareAnswerKey(key, actual): { number; status: 'match'|'mismatch'|'missing'|'extra'; expected?; actual? }[]` — actual lấy từ prompt questions theo ranges.
  3. Vitest: parse "1. A", "2. True", "3. Car / Cars", dòng thiếu số bị bỏ, "41. X" ngoài range bị đánh dấu extra.
- Success criteria: 2 hàm thuần pass toàn bộ case test.
- Verify: `pnpm -F web test -- test-answer-key` exit 0.

### Task 5.2 — Panel UI (View all + Paste + Compare)
- Goal: panel bật/tắt từ shell, 3 vùng theo Selfomy.
- Target files: `apps/web/src/components/assignment-tests/answers-checking-panel.tsx`.
- Steps:
  1. **View All Answers**: grid 40 ô (hoặc theo tổng số câu thật) — số câu, kind chip (TFNG/YNNG/MCQ/…), answer hiện tại + alts; ô trống (chưa có đáp án) nổi bật màu cảnh báo.
  2. **Paste**: textarea + hint đúng chữ Selfomy ("Mỗi dòng 1 câu: 1. A / 1. True / 1. Car / Cars").
  3. **Compare**: sau khi parse → bảng diff match/mismatch/missing/extra với màu; đếm "38 match, 2 mismatch".
  4. Panel chỉ đọc questions từ snapshot repo (không fetch riêng).
- Success criteria: paste key 40 dòng so với đề có 2 sai → hiển thị đúng 2 mismatch ở đúng số câu.
- Verify: `pnpm -F web test -- answers-checking-panel` exit 0.

### Task 5.3 — Apply (ghi key vào prompts)
- Goal: nút Apply ghi answer/alts từ key vào đúng question của đúng prompt.
- Target files: modify `answers-checking-panel.tsx`, `apps/web/src/lib/repos/assignment-tests.ts`.
- Steps:
  1. Trước khi ghi: hiện danh sách "sẽ đổi N câu ở M part" (chỉ liệt kê câu thực sự khác actual) + nút confirm.
  2. Apply: group theo part theo ranges → với mỗi part có thay đổi, build questions mới (giữ nguyên stem/opts, chỉ thay answer/alts) → gọi PATCH `/api/assignments/prompts/:id` (phase 2) tuần tự; nếu 1 part lỗi thì dừng, báo part lỗi, KHÔNG rollback part đã ghi (idempotent — chạy lại Apply chỉ đụng câu còn lệch).
  3. Sau apply: refetch snapshot, panel tự compare lại (thường ra all-match).
- Success criteria: apply key 40 dòng vào đề trống đáp án → View All toàn xanh; chạy lại Apply lần 2 không đổi gì (0 thay đổi).
- Verify: `pnpm -F web test` exit 0 (mock action: apply gọi PATCH đúng số prompt có thay đổi); e2e thật phủ ở phase 6.

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
- **Map key theo index part thay vì số câu ranges** — cùng bug precedence bulk-key-paste; mọi lookup theo `number` (số câu tuyệt đối).
- **Apply đè mất alts đang có** — chỉ thay câu có expected khác actual; câu match giữ nguyên không ghi lại.
- **Ghi nửa chừng lỗi mạng** — idempotency là mitigation chính; báo rõ part lỗi.

## Security Considerations
- Apply chỉ PATCH prompt thuộc org (route đã org-scope); không nhận promptId tuỳ ý từ UI ngoài list trong test.

## Todo

- [ ] Task 5.1 — parse + compare thuần + vitest
- [ ] Task 5.2 — Panel View/Paste/Compare
- [ ] Task 5.3 — Apply có confirm + idempotent
- [ ] `pnpm -F web test` + `pnpm check-types` exit 0
