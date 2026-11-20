---
title: "Fix AddClassSessionModal date/time inputs and field alignment (#822)"
description: "Replace native date/time inputs with DatePickerInput and TimeInput24h and restructure the date/time/duration grid in AddClassSessionModal to prevent clock icon clipping and label wrapping."
status: completed
priority: P2
issue: 822
branch: vinh19410/fix-web-gi-h-c-b-c-t-icon-ng-h-v-nh-n-th-i-l-ng
mode: beta
route: bugfix
created: 2026-11-19
---

# Plan #822 — Sửa bố cục ngày/giờ/thời lượng trong AddClassSessionModal

- **Issue:** https://github.com/vinh19410/teacher-os/issues/822
- **Branch:** `vinh19410/fix-web-gi-h-c-b-c-t-icon-ng-h-v-nh-n-th-i-l-ng` (base: `origin/develop`)
- **Route:** `bugfix` (`/ak-fix`)
- **Mode:** `beta` (`--ship --beta`)
- **Status:** completed

## Root Cause (Proven)

Trong `apps/web/src/components/modals/add-class-session-modal.tsx` (dòng 186–218), modal dùng `Modal` mặc định (`max-w-[480px]`, padding `p-6`, độ rộng ruột `432px`). Hàng đầu tiên dùng `grid-cols-1 gap-4 sm:grid-cols-2` (`208px` mỗi nửa), sau đó nửa phải lồng tiếp `grid-cols-2 gap-2`, ép hai ô **Giờ học \*** và **Thời lượng (phút)** xuống chỉ còn `~100px` mỗi ô:
1. `<Input type="time">` hiển thị `07:00 PM` + icon đồng hồ tràn khỏi `100px` và bị cắt mép phải (xác nhận trực quan trên `plans/reports/821-add-session-modal-desktop-1440x900-light.png`).
2. Nhãn `Thời lượng (phút)` (~116px) bị xuống 2 dòng trong cột `100px`, đẩy ô input xuống thấp hơn 2 ô cùng hàng.
3. `<Input type="date">` và `<Input type="time">` gốc hiển thị `mm/dd/yyyy` và 12h AM/PM theo locale trình duyệt, lệch quy ước `DESIGN.md` (#572).
4. Thông báo lỗi form-level (`error`) đang gắn lên `<Field label="Ngày học *">`, khiến ô ngày bị gắn `aria-invalid="true"` cả khi lỗi thuộc chủ đề, giờ học hoặc thời lượng.

## Acceptance Criteria

1. `AddClassSessionModal` dùng `DatePickerInput` cho **Ngày học \*** (hiển thị `dd/mm/yyyy`, icon calendar căn phải, popover lịch `T2..CN` hoạt động bình thường trong `Modal`, chặn submit khi người dùng gõ ngày không hợp lệ qua `onInvalidChange`).
2. `AddClassSessionModal` dùng `TimeInput24h` (`presets={[]}`, `className="w-full sm:w-full"`) cho **Giờ học \*** (định dạng 24h `HH:mm`, không dùng `<input type="time">` gốc nên không bị 12h AM/PM và không bị cắt icon đồng hồ, chặn submit khi giờ không hợp lệ qua `onInvalidChange`).
3. Bố cục mới đặt **Ngày học \*** thành 1 hàng full-width, hàng dưới là `grid-cols-1 gap-4 sm:grid-cols-2` chứa **Giờ học \*** và **Thời lượng (phút)** (nhất quán với `SessionActionsModal` và `EditClassModal`):
   - Trên desktop (`1440×900`) và tablet (`768×1024`): mỗi cột ở hàng 2 rộng `208px`, nhãn `Giờ học *` và `Thời lượng (phút)` nằm đúng 1 dòng, hai ô input thẳng hàng baseline tuyệt đối, không bị cắt icon hay tràn chữ.
   - Trên mobile (`375×812`) và `320px` reflow: xếp 1 cột dọc, không horizontal overflow.
4. Lỗi form-level (`error`) render bằng `<p role="alert" aria-live="polite" className="text-destructive text-xs">` tách khỏi `<Field label="Ngày học *">` để không gắn sai `aria-invalid` cho ô ngày khi lỗi ở trường khác; `DatePickerInput` và `TimeInput24h` tự giữ `aria-invalid` khi chuỗi đang gõ không hợp lệ.
5. Reset sạch `dateInvalid` / `timeInvalid` khi mở lại modal (`open` từ `false` → `true`) và giữ nguyên contract payload `POST /api/classes/:id/sessions` (`date: YYYY-MM-DD`, `time: HH:mm`, `dur: number`, `topic`, `materialIds?`).
6. Unit tests (TDD) trong `apps/web/src/components/modals/add-class-session-modal.test.tsx` phủ đầy đủ hiển thị `dd/mm/yyyy` + `HH:mm`, chặn submit khi gõ ngày/giờ không hợp lệ, kiểm tra trùng ngày theo `dd/mm/yyyy`, chọn ngày qua popover, gửi payload chuẩn ISO + 24h, và không gắn nhầm `aria-invalid` cho `Ngày học *` khi thiếu chủ đề.
7. Pass toàn bộ local gates: `pnpm exec biome check .`, `pnpm check-types`, `pnpm --filter web test`.
8. Xác minh trực quan bằng Chromium trên 3 viewport (`1440×900`, `768×1024`, `375×812`) + `320px` reflow + dark mode + mở popover lịch; lưu screenshot POT vào `plans/reports/` (`822-*.png`).

## Phases

| Phase | File | Status | Description |
|---|---|---|---|
| Phase 1 | [phase-01-fix-layout-and-date-time-inputs.md](./phase-01-fix-layout-and-date-time-inputs.md) | completed | TDD unit tests, layout & `DatePickerInput`/`TimeInput24h` migration, local gates & 3-viewport visual verification |
