---
phase: 3
title: "Bộ chuyển view, view Tháng/Ngày, màu lớp, hộp thoại sự kiện"
status: pending
priority: P1
effort: "6h"
dependencies: ["phase-01", "phase-02"]
---

# Phase 3: Giao diện `/schedule`

Đọc `DESIGN.md`; token ở `packages/ui/src/styles/globals.css`, component `apps/web/src/components/ui/*`.

## Files to Create / Modify

- Modify: `packages/ui/src/styles/globals.css` — token `--class-1..8` và `--class-1..8-soft` (light + dark), map `--color-class-*` (D2).
- Modify: `apps/web/src/routes/_auth/schedule.tsx` — thành shell: `validateSearch` theo `parseScheduleSearch`, `PageHead` (kicker theo view), bộ chuyển `Tháng | Tuần | Ngày` (segmented, `role="radiogroup"`), điều hướng trước/sau/hôm nay theo view, nút **+ Sự kiện** cạnh **+ Tạo lịch nghỉ**.
- Create: `apps/web/src/components/schedule/schedule-week-view.tsx` — tách lưới tuần hiện có, block đổi sang màu lớp + badge loại buổi; render sự kiện và thẻ kỳ nghỉ.
- Create: `apps/web/src/components/schedule/schedule-month-view.tsx`, `schedule-day-view.tsx` (D5).
- Create: `apps/web/src/components/schedule/org-event-modal.tsx` — Tên, Ngày, Từ giờ / Đến giờ, Ghi chú; lỗi inline theo `orgEventDraftSchema`; tạo xong cập nhật snapshot tại chỗ (D6) và Toast.
- Create: `apps/web/src/components/schedule/org-event-chip.tsx` — hiển thị sự kiện (muted + icon), bấm mở popover chi tiết có nút Xóa (xác nhận).
- Create: `apps/web/src/lib/repos/events.ts` — `createEvent`, `deleteEvent`.
- Tái dùng `holiday-calendar-card.tsx` (TOS-11/TOS-13) trong cả 3 view.
- Tests: `schedule.test.tsx` (cập nhật), `schedule-month-view.test.tsx`, `schedule-day-view.test.tsx`, `org-event-modal.test.tsx`.

## Tasks & Steps

1. Test đỏ: đổi view cập nhật URL; `?week=` cũ được thay URL; view Tháng hiện "+N" và bấm mở view Ngày; block hai lớp có màu khác nhau; tạo sự kiện xuất hiện ngay không reload; xóa sự kiện biến mất.
2. Tách view Tuần trước (không đổi hành vi ngoài màu), chạy lại test cũ, rồi thêm Tháng/Ngày, rồi sự kiện.
3. 3 viewport (1440×900, 768×1024, 375×812) + bàn phím: phím mũi tên trong bộ chuyển view, Tab qua ô ngày, Enter mở; focus trở về nút gọi sau khi đóng hộp thoại. `pnpm design:compare`, cập nhật baseline có chủ đích.

## Verification

- `pnpm --filter web test -- schedule org-event-modal`
- `pnpm check`, `pnpm check-types`, `pnpm design:compare`
