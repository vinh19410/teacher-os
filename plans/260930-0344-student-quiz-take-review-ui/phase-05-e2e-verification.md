---
phase: 5
title: "E2E + full verification"
status: pending
priority: P1
effort: "4h"
dependencies: [4]
---

# Phase 5: E2E + full verification

## Goal

Khóa trọn luồng học viên bằng một spec E2E end-to-end + leak-check answer key + chạy
full gates của repo.

## Context Links

- `apps/e2e/specs/student-org-invitation-and-switcher.spec.ts` — pattern student flow
  (teacher tạo + invite, student signup portal, switch org).
- `apps/e2e/specs/assignment-prompt-create.spec.ts` — pattern soạn prompt ready
  (reading + questions + key + alts).
- `apps/e2e/playwright.config.ts` — webServers api :8000 / web :8001 / student :8003.

<!-- Updated: Red Team Session 1 — direct-DB seeding, save-state testid, JSON-key leak-check, submit-without-waiting variant, dialog handler -->

## Key Insights

- **Seed thẳng DB, không lái UI authoring** [RT#12]: chuỗi teacher-signup + soạn prompt
  rich-editor + invite + verify email + onboarding quá dài cho budget 120s
  (`playwright.config.ts:9`). Dùng precedent seed thẳng `local.db` (`apps/e2e/specs/helpers.ts`
  seedStudent "Decision D6"): seed prompt ready + class + enrollment + class_assignment +
  target trực tiếp; student account tạo qua portal signup (giữ phần auth thật) hoặc seed
  session theo pattern spec hiện có — phần cần test là LUỒNG HỌC VIÊN, không phải authoring.
- Leak-check mirror precedent của preview e2e NHỚNG HƠN: (a) body text không chứa answer
  strings; (b) JSON payload GET quiz không chứa KEY `answer`/`alts` (tránh width-oracle
  class side-channel); (c) GET attempt-summary khi `in_progress` cũng không chứa key. [RT#6/#8]
- Save-state: chờ `data-testid="save-state"` đạt trạng thái terminal `saved` (không đợi
  text "Đã lưu" dễ flapping); một variant submit NGAY khi chưa saved để phủ
  drain-before-submit. [RT#7/#12]
- `page.on('dialog')` handler cho beforeunload guard nếu còn kích hoạt khi reload.

## Requirements

- [ ] Spec `student-quiz-take-review.spec.ts` chạy xanh trên CI config hiện có
      (chromium, workers 1, timezone Asia/Ho_Chi_Minh).
- [ ] Assert: start dialog → trả lời (1 radio đúng, 1 radio sai, 1 blank đúng qua alts,
      còn lại bỏ trống) → reload giữa chừng resume + answers còn → submit guard đếm
      đúng số câu trống → summary counters đúng (ví dụ 2 đúng / 1 sai / N bỏ) →
      detail chip + Đáp án + giải thích đúng.
- [ ] Variant drain: điền câu cuối → submit NGAY (không chờ saved) → câu đó được tính.
- [ ] Assert overview row đổi trạng thái sau nộp và link sang summary.
- [ ] Network leak-check 3 lớp: take body text, take JSON keys, in-progress summary.
- [ ] Full gates: `pnpm --filter student test`, `pnpm --filter web test`,
      `pnpm --filter server test`, `check-types` (turbo), `pnpm check`,
      `pnpm --filter e2e e2e` (toàn bộ specs, không chỉ spec mới).

## Implementation Steps

1. Viết spec với setup seed thẳng DB (helpers + `apps/e2e/local.db` precedent), tách 2
   test nếu vượt budget: (i) take→autosave→submit→summary→detail; (ii) leak-checks +
   drain variant.
2. Chạy local `pnpm --filter e2e e2e -- student-quiz` iterate tới xanh.
3. Chạy full e2e + toàn bộ gates ở trên; sửa regressions (nếu web preview tests vỡ vì
   Phase 2/3 đổi ClozeStemText, fix tại chỗ cùng plan).
4. Smoke thủ công một vòng trên dev stack rồi dọn: bỏ helper tạm, comment thừa.

## Todo

- [ ] Spec E2E trọn flow (take → autosave/reload → submit → summary → detail)
- [ ] Leak-check payload take
- [ ] Full gates xanh
- [ ] Dọn scaffolding

## Success Criteria

- Toàn bộ commands gates exit 0; spec mới ổn định khi chạy 3 lần liên tiếp.

## Risk Assessment

- E2E flaky do autosave debounce: spec chờ `data-testid="save-state"` đạt `saved` trước
  reload (selector deterministic), không sleep cứng.
- Spec quá dài: seed thẳng DB đã cắt phần authoring; nếu vẫn vượt 120s, tách 2 test.

## Security Considerations

- Leak-check là regression guard cho KD4 — giữ như một test case độc lập, dễ nhận diện
  tên ("does not leak the answer key to the take screen").

## Next Steps

Plan hoàn tất → `ak plan close` + journal; follow-up plans: test-assignment (giao full
test), reading tools (Tô sáng/Ghi chú) nếu user chọn ở Validation.
