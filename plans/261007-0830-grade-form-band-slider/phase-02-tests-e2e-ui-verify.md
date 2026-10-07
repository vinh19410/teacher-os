---
phase: 2
title: "Cập nhật test, e2e và verify UI"
status: pending
effort: "1.5h"
dependsOn: [1]
---

# Phase 02 — Cập nhật test, e2e và verify UI

## Context

- [grade-form.test.tsx](../../apps/web/src/components/grading/grade-form.test.tsx): helper `selectFor()` trả `HTMLSelectElement`; test "Đã chấm" kiểm `selectFor("fluency").value`.
- [teacher-grade-submission.spec.ts:178-183,265-270](../../apps/e2e/specs/teacher-grade-submission.spec.ts): dùng `getByLabel(...).selectOption(...)`.
- `AGENTS.md` / `REVIEW.md`: verify 3 viewport + keyboard focus; PR có screenshot. E2E dùng `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103`.

## Files

| Path | Action | Change |
|------|--------|--------|
| `apps/web/src/components/grading/grade-form.test.tsx` | modify | Helper `sliderFor()` trả `HTMLInputElement`; thêm test slider |
| `apps/e2e/specs/teacher-grade-submission.spec.ts` | modify | `selectOption(x)` → `fill(x)` (8 chỗ) |

## Steps

1. Unit test `grade-form.test.tsx`:
   - Đổi `selectFor` thành `sliderFor`, kiểu `HTMLInputElement`. Helper `choose` giữ `fireEvent.change(..., { target: { value } })`.
   - Test mới "Mỗi tiêu chí là range 0–9 bước 0.5": `type="range"`, `min="0"`, `max="9"`, `step="0.5"`.
   - Test mới "Chưa chấm hiện — và aria-valuetext Chưa chấm" cho từng slider.
   - Test mới "Bấm vị trí placeholder khi chưa chọn vẫn ghi 4.5": `fireEvent.pointerUp(sliderFor("task"))`, sau đó `aria-valuetext` là `4.5`. Nếu jsdom không dispatch được `pointerUp` thì dùng `fireEvent(el, new Event("pointerup", { bubbles: true }))`.
   - Test mới "Đổi slider cập nhật aria-valuetext theo formatBand" (`6` → `6.0`).
   - Test "Đã chấm": `sliderFor("fluency").value === "7"`, `sliderFor("pronunciation").value === "8"`.
   - Giữ các test cũ (nhãn tiêu chí, band live, payload `onSave`, alert, saving).

2. E2E `teacher-grade-submission.spec.ts`: đổi 8 lời gọi `.selectOption("…")` thành `.fill("…")`. Playwright `fill()` hỗ trợ `input[type=range]`, set value và bắn `input`/`change`. Assertion band `6.5` / `7.5` giữ nguyên.

3. Gates:

   ```bash
   pnpm check
   pnpm check-types
   pnpm --filter web test
   E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e -- teacher-grade-submission
   ```

4. Verify UI thật trên `/grading/$attemptId` (Writing + Speaking) ở 1440×900, 768×1024, 375×812:
   - Thanh không tràn trên 375; số band và vạch chia thẳng hàng với thumb ở `0`, `4.5`, `9`.
   - Tab qua 4 slider thấy focus ring accent; mũi tên đổi ±0.5, Home/End về 0/9; band tổng cập nhật.
   - Trạng thái chưa chọn mờ và hiện `—`; bài đã chấm mở đúng điểm.
   - Chụp screenshot để đính kèm PR.

## Validation

Mọi lệnh ở bước 3 xanh, checklist bước 4 đạt.

## Risk / Rollback

- Nếu Playwright `fill()` không bắn được `onChange` của React trên range: đổi sang `locator.evaluate` set value qua native setter rồi dispatch `input`. Ghi lý do vào comment ngắn trong spec.
