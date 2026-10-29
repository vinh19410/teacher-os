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
| `apps/e2e/specs/teacher-grade-submission.spec.ts` | modify | 8 chỗ `selectOption(x)` → helper set giá trị qua native setter + dispatch `input`; thêm 1 test click lên track |

## Steps

1. Unit test `grade-form.test.tsx`:
   - Đổi `selectFor` thành `sliderFor`, kiểu `HTMLInputElement`. Helper `choose` giữ `fireEvent.change(..., { target: { value } })`.
   - Test mới "Mỗi tiêu chí là range 0–9 bước 0.5": `type="range"`, `min="0"`, `max="9"`, `step="0.5"`.
   - Test mới "Chưa chấm hiện — và aria-valuetext Chưa chấm" cho từng slider.
   - Test mới "Bấm vị trí placeholder khi chưa chọn vẫn ghi 4.5": `fireEvent.pointerUp(sliderFor("task"))`, sau đó `aria-valuetext` là `4.5`. Nếu jsdom không dispatch được `pointerUp` thì dùng `fireEvent(el, new Event("pointerup", { bubbles: true }))`. Lưu ý: jsdom không mô phỏng track-click nên test này chỉ chứng minh wiring handler — hành vi browser thật do e2e click test ở bước 2 đảm nhiệm.
   - Test mới "Đổi slider cập nhật aria-valuetext theo formatBand" (`6` → `6.0`).
   - Test "Đã chấm": `sliderFor("fluency").value === "7"`, `sliderFor("pronunciation").value === "8"`.
   - Giữ các test cũ (nhãn tiêu chí, band live, payload `onSave`, alert, saving).

2. E2E `teacher-grade-submission.spec.ts`:
   - Thêm helper set giá trị range qua native setter rồi dispatch `input` (`locator.evaluate` + `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set`). KHÔNG dùng `fill()`: Playwright set `input.value` bằng JS, tracker của React 19 đồng bộ ngay trong instance setter nên event `input` sau đó bị nuốt, `onChange` không chạy (Red Team Review #1). Constraint nếu lỡ dùng `fill()`: giá trị phải canonical theo step 0.5 (`"6"`, `"6.5"` — không `"6.0"`, không thì throws "Malformed value").
   - Đổi 8 lời gọi `.selectOption("…")` (spec:178-183, 265-270 khi red-team chạy; sau implement nằm tại helper calls spec:201-204, 286-289) thành helper trên.
   - Assertion giữ nguyên: `6.5` (writing) và `7.0` (speaking).
   - Thêm 1 test path click thật: ở attempt chưa chấm, click giữa track một slider (ví dụ `getByLabel("Task Response").click()`) rồi `await expect(...).toHaveValue("4.5")` — unit jsdom không thay thế được vì không mô phỏng track-click.

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
   - Bấm lên thanh ở vị trí bất kỳ khi chưa chọn: số cập nhật theo vị trí bấm (thử cả giữa thanh = 4.5) và trạng thái mờ tắt ngay.
   - Trạng thái chưa chọn mờ và hiện `—`; bài đã chấm mở đúng điểm.
   - Chụp screenshot để đính kèm PR.

## Validation

Mọi lệnh ở bước 3 xanh, checklist bước 4 đạt.

## Risk / Rollback

- Helper native setter là path chính (React 19 nuốt `input` khi value set bằng JS thường — xem step 2); nếu vẫn gặp sự cố dispatch, fallback là `locator.focus()` + `pressSequentially("End")`/mũi tên để đổi giá trị qua event path thật của browser. Ghi lý do vào comment ngắn trong spec.
