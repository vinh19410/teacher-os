---
phase: 3
title: "Radio Hủy buổi và nút Xóa kỳ nghỉ (Hoàn tác)"
status: completed
priority: P1
effort: "4h"
dependencies: ["phase-02"]
---

# Phase 3: Giao diện

Đọc `DESIGN.md`; token ở `packages/ui/src/styles/globals.css`, component `apps/web/src/components/ui/*`.

## Files to Create / Modify

- Modify: `apps/web/src/components/schedule/holiday-modal.tsx` — radio [8] thêm "Hủy buổi (không bù)"; đổi phương thức thì gọi lại preview; nhãn nút xác nhận đổi theo phương thức ("Xác nhận áp dụng & Dời buổi" / "Xác nhận áp dụng & Hủy buổi"); Toast "Đã hủy N buổi".
- Modify: `apps/web/src/components/schedule/holiday-preview-table.tsx` — cột Kết quả "→ Hủy buổi (không bù)" cho `cancellations`.
- Create: `apps/web/src/components/schedule/holiday-undo-dialog.tsx` — hộp thoại xác nhận (D8): tên kỳ nghỉ, khoảng ngày, "Khôi phục N buổi gốc · Thu hồi M buổi bù" (hoặc "Khôi phục N buổi đã hủy"); 409 `makeup-touched` hiện danh sách buổi bù đã bị đụng, không đóng; 422 hiện "Kỳ nghỉ đã bắt đầu".
- Modify: component thẻ kỳ nghỉ trên lịch tuần (tạo ở TOS-11 phase 5, trong `apps/web/src/routes/_auth/schedule.tsx` hoặc file tách) — nút "Xóa kỳ nghỉ (Hoàn tác)" chỉ khi `fromDate > todayISOVietnam()`; tách thành `apps/web/src/components/schedule/holiday-calendar-card.tsx` nếu TOS-11 chưa tách, để TOS-14 tái dùng.
- Modify: block buổi `cancelled` do kỳ nghỉ hiện "Đã hủy — «tên kỳ nghỉ»".
- Modify: `apps/web/src/lib/repos/holidays.ts` — `deleteHoliday(id)`, invalidate snapshot.
- Tests: `holiday-modal.test.tsx`, `holiday-undo-dialog.test.tsx`, `schedule.test.tsx`.

## Tasks & Steps

1. Test đỏ: chọn Hủy buổi → preview gọi với `mode:"cancel"`, bảng hiện "Hủy buổi (không bù)"; nút hoàn tác ẩn với kỳ nghỉ đã bắt đầu; xác nhận gọi `deleteHoliday`; 409 hiện danh sách.
2. Code cho xanh.
3. 3 viewport + bàn phím (Esc đóng, focus về nút gọi sau khi đóng) theo `REVIEW.md`; `pnpm design:compare`.

## Verification

- `pnpm --filter web test -- holiday-modal holiday-undo-dialog schedule`
- `pnpm check`, `pnpm check-types`, `pnpm design:compare`
