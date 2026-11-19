---
phase: 1
title: "Fix AddClassSessionModal layout and migrate to DatePickerInput + TimeInput24h"
status: completed
---

# Phase 1 — Sửa bố cục & chuyển sang DatePickerInput / TimeInput24h

## Scope & File Ownership

- **Modify:**
  - `apps/web/src/components/modals/add-class-session-modal.tsx`
  - `apps/web/src/components/modals/add-class-session-modal.test.tsx`
- **Artifacts (POT screenshots):**
  - `plans/reports/822-add-session-modal-desktop-1440x900-light.png`
  - `plans/reports/822-add-session-modal-desktop-1440x900-dark.png`
  - `plans/reports/822-add-session-modal-datepicker-open.png`
  - `plans/reports/822-add-session-modal-tablet-768x1024-light.png`
  - `plans/reports/822-add-session-modal-mobile-375x812-light.png`
- **Out of Scope (Non-goals):**
  - Không thay đổi API contract `add-manual-session` hoặc `packages/ui/src/components/date-picker-input.tsx`.
  - Không thay đổi các modal khác (`AddClassModal`, `SessionActionsModal`, `LessonEditForm`).

## TDD Test Matrix

Viết/cập nhật test trước trong `apps/web/src/components/modals/add-class-session-modal.test.tsx`:

| # | Case | Expected |
|---|---|---|
| 1 | Prefill mặc định (`startDate: 2026-11-10`, `19:00`, `90`) | `Ngày học *` hiển thị `"10/11/2026"` (`dd/mm/yyyy`, `type="text"`), `Giờ học *` hiển thị `"19:00"` (`type="text"`), `Thời lượng (phút)` hiển thị `"90"`, nút `"Chọn ngày"` tồn tại |
| 2 | Submit khi gõ ngày không hợp lệ (`"31/02/2026"` hoặc `"abc"`) | Chặn submit, không gọi `POST /api/classes/cls-1/sessions`, hiển thị lỗi ngày hợp lệ (`dd/mm/yyyy`) |
| 3 | Submit khi gõ giờ không hợp lệ (`"25:99"` hoặc `"abc"`) | Chặn submit, không gọi `POST`, hiển thị lỗi giờ hợp lệ (`HH:mm`) |
| 4 | Nhập trùng ngày `existingDateISOs` bằng định dạng `"10/11/2026"` | Hiển thị `"Lớp đã có buổi học vào ngày này."` và không gọi `POST` |
| 5 | Chọn ngày từ popover lịch + nhập giờ 24h `"08:30"` + submit | Payload gửi lên server đúng `date: "2026-11-12"`, `time: "08:30"`, `dur: 90` |
| 6 | Submit khi thiếu chủ đề | Hiển thị `"Vui lòng nhập tên hoặc chủ đề buổi học."` và ô `Ngày học *` KHÔNG bị gắn `aria-invalid="true"` |
| 7 | Giữ nguyên tests chọn/gỡ `materialIds` và không gửi `zoom` | Pass không hồi quy |

## Implementation Steps

1. **Red (TDD):** Cập nhật và thêm các test cases trên trong `apps/web/src/components/modals/add-class-session-modal.test.tsx`, chạy `pnpm --filter web exec vitest run src/components/modals/add-class-session-modal.test.tsx` để xác nhận fail trước khi sửa code.
2. **Green:** Cập nhật `apps/web/src/components/modals/add-class-session-modal.tsx`:
   - Import `DatePickerInput, TimeInput24h` từ `@/components/ui/date-picker-input`.
   - Thêm state `dateInvalid` và `timeInvalid` (`boolean`, mặc định `false`), reset về `false` trong `useEffect` khi mở modal và trong `resetForm()`.
   - Kiểm tra `if (dateInvalid || !date.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date.trim()))` với thông báo `"Vui lòng chọn ngày học hợp lệ (dd/mm/yyyy)."` và `if (timeInvalid || !time.trim() || !/^\d{2}:\d{2}$/.test(time.trim()))` với thông báo `"Vui lòng chọn giờ học hợp lệ (HH:mm)."`.
   - Cấu trúc lại layout form:
     - Hàng 1: `<Field label="Ngày học *"><DatePickerInput value={date} todayISO={todayISOVietnam()} onChange={(nextIso) => { setDate(nextIso); setError(undefined); }} onInvalidChange={(invalid) => { setDateInvalid(invalid); if (!invalid) setError(undefined); }} disabled={saving} /></Field>`
     - Hàng 2: `<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">` chứa `<Field label="Giờ học *"><TimeInput24h presets={[]} className="w-full sm:w-full" value={time} onChange={(nextTime) => { setTime(nextTime); setError(undefined); }} onInvalidChange={(invalid) => { setTimeInvalid(invalid); if (!invalid) setError(undefined); }} disabled={saving} /></Field>` và `<Field label="Thời lượng (phút)"><Input type="number" min={15} max={360} step={15} value={dur} onChange={(e) => setDur(e.target.value)} disabled={saving} /></Field>`.
     - Bỏ `error={error}` khỏi `<Field label="Ngày học *">`; hiển thị `{error && <p role="alert" aria-live="polite" className="text-destructive text-xs">{error}</p>}` ngay trước `{notice && ...}`.
3. **Verify:**
   - Chạy `pnpm --filter web exec vitest run src/components/modals/add-class-session-modal.test.tsx`.
   - Chạy `pnpm --filter web test`, `pnpm exec biome check .`, `pnpm check-types`.
   - Boot stack local trên port override (`8100`/`8101`), mở `AddClassSessionModal` trong Chromium headless, đo `getBoundingClientRect()` chứng minh:
     - Nhãn `Giờ học *` và `Thời lượng (phút)` cùng `height` (1 dòng), hai ô input cùng `top` và `bottom` trên 1440×900 và 768×1024.
     - Không có tràn ngang ở 1440×900, 768×1024, 375×812, và 320×812.
     - Popover lịch mở đúng `z-[110]`, Escape đóng popover mà không đóng modal.
     - Chụp 5 screenshot POT vào `plans/reports/` và tự xem lại bằng `read_file`.

## Risks & Rollback

- **Rủi ro:** E2E spec đang tương tác với `AddClassSessionModal` có thể điền trực tiếp ô ngày theo định dạng `YYYY-MM-DD`. Đã kiểm tra qua 4 E2E spec (`649-screenshots.spec.ts`, `655-screenshots.spec.ts`, `materials-at-session-create.spec.ts`, `syllabus-class-curriculum.spec.ts`) — cả 4 đều chỉ mở modal và không điền trực tiếp ô ngày/giờ.
- **Rủi ro:** `DatePickerInput` trong `Modal` khi bấm Escape hoặc click ngoài popover. `Modal` đã có `hasOpenChildPopup()` và `DatePickerInput` đã dừng lan truyền `Escape` (`z-[110]`), sẽ verify trực tiếp trong Chromium.
- **Rollback:** Revert commit trên branch; không có migration DB hay thay đổi contract API.
