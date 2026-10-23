---
phase: 5
title: "E2E, verify 3 viewport, docs (PR2)"
status: pending
priority: P1
effort: "4h"
dependencies: [4]
---

# Phase 5: E2E, verify 3 viewport, docs (PR2)

## Goal

Luồng soạn đề có nhóm được Playwright phủ end-to-end, UI đạt 3 viewport + bàn phím theo `REVIEW.md`, runbook ghi thứ tự deploy migration `0044`.

## Files to Create / Modify

- Modify: `apps/e2e/specs/admin-library-reading.spec.ts` (thêm một `test` mới; giữ test cũ)
- Modify: `docs/production-release-runbook.md` (thêm mục migration `0044`)
- Modify (nếu file có mục mô tả `library_test_part`): tài liệu kiến trúc trong `docs/` — tìm bằng `grep -rln "library_test_part" docs`

## Tasks & Steps

### Task 5.1 — E2E soạn part 2 nhóm

- Goal: chứng minh acceptance "tạo part Reading 2 nhóm, lưu, tải lại vẫn đúng".
- Target: `apps/e2e/specs/admin-library-reading.spec.ts`; tái dùng `createReadingTest`, `openEmptySlot`, `fillRichEditor` có sẵn trong file/`./helpers`.
- Steps: thêm `test("soạn passage có 2 nhóm câu, lưu và tải lại", ...)`:
  1. Tạo đề Reading, mở slot Passage 1, điền tiêu đề part + passage.
  2. Nhóm ngầm: chọn dạng `tfng`, nhập 3 câu + đáp án.
  3. Bấm "Chia thành nhiều nhóm câu" → bấm "Thêm nhóm câu"; ở nhóm 2 chọn dạng "Note completion", tick "Ô trả lời nằm trong hướng dẫn", nhập hướng dẫn `Complete the notes below.`, nhập 2 câu có stem chứa `____` (vd `Growers ____ the bogs.`) + đáp án; điền "Giải thích câu 4".
  4. Kiểm `Câu có ô trống: 2/2` hiển thị.
  5. Lưu part; `page.reload()`; mở lại slot Passage 1.
  6. Kỳ vọng: `nav` "Mục lục nhóm câu" có "Nhóm câu 1" và "Nhóm câu 2"; có `Câu 1`…`Câu 5`; mở nhóm 2 thấy checkbox "Ô trả lời nằm trong hướng dẫn" vẫn được tick, stem câu 4 còn `____`, giải thích câu 4 còn nguyên.
- Verify: chạy đúng lệnh e2e local trong `AGENTS.md` với port override: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e specs/admin-library-reading.spec.ts` exits 0 và output có `passed`, không có `failed`. Nếu fail kèm `[dev-watchdog] hạ tầng dev server bất ổn` thì đó là lỗi hạ tầng (xem `AGENTS.md`), không phải lỗi test — vẫn áp Failure Protocol.

### Task 5.2 — Hồi quy e2e admin

- Verify: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e specs/admin-library-reading.spec.ts specs/admin-library-listening.spec.ts specs/admin-auth.spec.ts` exits 0, không có `failed`.

### Task 5.3 — Verify UI 3 viewport + bàn phím

- Goal: bố cục 2 cột không vỡ, outline dùng được bằng bàn phím.
- Steps:
  1. Mở trang sửa đề có part 2 nhóm ở 1440×900, 768×1024, 375×812.
  2. Ở mỗi viewport chụp screenshot lưu vào `plans/261022-1329-library-question-groups/screens/{1440,768,375}.png`.
  3. Dùng Tab đi qua outline → thẻ nhóm: focus ring thấy được, Enter trên mục outline mở đúng nhóm.
- Success criteria: không có thanh cuộn ngang trang ở 375; outline nằm trên thẻ nhóm ở 768 và 375, nằm cột trái ở 1440.
- Verify: 3 file screenshot tồn tại (`ls plans/261022-1329-library-question-groups/screens/*.png` liệt kê 3 file) VÀ trong console trang, `document.documentElement.scrollWidth <= window.innerWidth` trả `true` ở 375.

### Task 5.4 — Runbook + docs

- Steps:
  1. Trong `docs/production-release-runbook.md`, thêm mục cho `0044_library_part_groups` theo đúng mẫu các mục `0037`–`0039`: chạy `db:migrate:deploy` TRƯỚC khi deploy worker (route admin ghi cột `groups`); migration chỉ `ADD COLUMN` có default, không cần khung giờ thấp điểm; ghi bookmark D1 Time Travel trước khi apply.
  2. Nếu `grep -rln "library_test_part" docs` trả file mô tả cột của bảng, thêm dòng mô tả cột `groups` (một câu, trỏ về `packages/api/src/library-contracts.ts`).
- Verify: `grep -n "0044" docs/production-release-runbook.md` in ra ít nhất 1 dòng.

### Task 5.5 — Gate cuối PR2

- Verify: `pnpm check && pnpm check-types && pnpm test` đều exit 0, và Task 5.2 đã pass trong cùng nhánh.

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
