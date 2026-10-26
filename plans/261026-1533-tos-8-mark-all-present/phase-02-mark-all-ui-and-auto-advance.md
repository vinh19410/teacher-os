---
phase: 2
title: "Nút điền nhanh, hộp xác nhận khi lưu thiếu, tự mở ca kế tiếp"
status: pending
priority: P2
effort: "4h"
dependencies: [1]
---

# Phase 2: UI thao tác nhanh trên màn /attendance

## Goal

Đưa `markAllPresent()` ra giao diện và rút ngắn luồng điểm danh nhiều ca liên tiếp.

## Files to Create / Modify

- Modify: `apps/web/src/components/attendance/attendance-session-row.tsx` (TOS-7 tạo).
  - Nút secondary **Đánh dấu tất cả Có mặt** đặt trên bảng học viên, bên trái nút lưu (theo wireframe). Disabled khi `missing().length === 0` hoặc ca là ngày tương lai / lớp legacy.
  - Nhận prop `autoFocusBulk?: boolean`; khi `true` và hàng vừa mở thì focus nút điền nhanh (nếu nút disabled thì focus picker đầu tiên).
  - Khi bấm lưu mà `missing().length > 0`: mở `Modal` xác nhận thay vì chặn ngay.
- Create: `apps/web/src/components/attendance/fill-missing-confirm.tsx`. Nội dung `Modal` (`apps/web/src/components/ui/modal.tsx`):
  - Tiêu đề "Còn N học viên chưa chọn trạng thái".
  - Mô tả "Gán Có mặt cho N học viên này rồi lưu điểm danh ca học?"
  - Nút "Gán Có mặt và lưu" (primary) và "Quay lại chỉnh". Esc / đóng modal = "Quay lại chỉnh".
  - "Gán Có mặt và lưu": dispatch `markAllPresent()` rồi gọi `onSave` với entries đã điền.
  - "Quay lại chỉnh": hành vi TOS-7 (viền `warning` + focus dòng thiếu đầu tiên + thông báo).
- Modify: `apps/web/src/routes/_auth/attendance.tsx` (TOS-7 tạo).
  - Giữ `openClassKey` (classId + date) trong state của route.
  - Trong `onSuccess` của mutation lưu: tính ca kế tiếp **từ danh sách đang hiển thị trước khi refetch**: ca đầu tiên sau ca vừa lưu có trạng thái chưa điểm danh và không phải legacy; nếu không có thì vòng lại từ đầu danh sách. Đặt `openClassKey` sang ca đó với `autoFocusBulk`.
  - Hết ca pending: không mở ca nào, ghi "Đã điểm danh xong mọi ca trong ngày" vào vùng `aria-live="polite"`.
  - Ca mới mở mà nằm ngoài khung nhìn thì `scrollIntoView({ block: "nearest" })`.
- Modify: `apps/web/src/components/attendance/attendance-session-row.test.tsx`, `apps/web/src/routes/_auth/attendance.test.tsx`.

## Tasks & Steps

1. Test đỏ cho `AttendanceSessionRow`:
   - Bấm "Đánh dấu tất cả Có mặt" → mọi radio trống chuyển "Có mặt", radio đã chọn giữ nguyên.
   - Nút disabled khi đủ trạng thái, khi ngày tương lai và không render cho lớp legacy.
   - Lưu khi thiếu 2 người → modal ghi "Còn 2 học viên"; "Gán Có mặt và lưu" → `onSave` nhận đủ entries với 2 người `present`.
   - "Quay lại chỉnh" và Esc → `onSave` không được gọi, dòng thiếu có viền cảnh báo.
   - `autoFocusBulk` → nút điền nhanh có focus sau khi mở.
2. Test đỏ cho route: lưu ca thứ nhất thành công → ca pending thứ hai mở; lưu ca cuối → vùng `aria-live` có thông báo hoàn tất. Kiểm cả khi `status=pending` (ca vừa lưu biến khỏi danh sách).
3. Viết component và logic route cho test xanh.
4. Tự kiểm bàn phím: luồng một ca gồm Enter (điền nhanh) → Tab/mũi tên chỉnh ngoại lệ → Tab tới "Lưu điểm danh ca học" → Enter, rồi focus tự sang ca kế tiếp.
5. Đọc `DESIGN.md`; nút secondary dùng biến thể `Button` có sẵn, không hard-code màu.

## Verification

- `pnpm --filter web test -- attendance`
- `pnpm check-types`
- `pnpm check`
