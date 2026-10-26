---
phase: 5
title: "Nút + Tạo lịch nghỉ, hộp thoại xem trước trên /schedule"
status: completed
priority: P1
effort: "6h"
dependencies: ["phase-03", "phase-04"]
---

# Phase 5: Giao diện trên `/schedule`

## Goal

Màn `[3] schedule-and-holiday-modal` theo wireframe: nút **+ Tạo lịch nghỉ** ở `PageHead`, hộp thoại nhập, bảng xem trước, xác nhận; lịch tuần hiện nhãn kỳ nghỉ và "Đã dời sang dd/MM".

Đọc `DESIGN.md` trước khi làm; dùng token ở `packages/ui/src/styles/globals.css`, component `apps/web/src/components/ui/*`.

## Files to Create / Modify

- Create: `apps/web/src/components/schedule/holiday-modal.tsx`
- Create: `apps/web/src/components/schedule/holiday-preview-table.tsx`
- Create: `apps/web/src/components/schedule/holiday-modal.test.tsx`
- Create: `apps/web/src/lib/repos/holidays.ts` — `previewHoliday(draft)`, `applyHoliday(draft, planHash)` (fetch + zod parse theo mẫu `apps/web/src/lib/repos/lessons.ts`; apply gửi kèm `planHash` của lần preview gần nhất — I7); sau apply invalidate snapshot kernel để lịch tải lại.
- Modify: `apps/web/src/routes/_auth/schedule.tsx` — nút ở `PageHead`, state mở hộp thoại; block tuần có trạng thái `holiday` hiển thị tên kỳ nghỉ + "Đã dời sang dd/MM" (đọc từ snapshot, xem dưới).
- Modify: `apps/server/src/routes/snapshot.ts` + kiểu snapshot ở `contracts.ts` — thêm `holidays` (id, name, fromDate, toDate) và `holidayShifts` (classId, originalDate, makeupDate) của org, để lịch không cần gọi thêm endpoint.
- Modify: `apps/web/src/routes/_auth/schedule.test.tsx`

## Hộp thoại

| # | Phần tử | Hành vi |
|---|---|---|
| 4 | Tên kỳ nghỉ * | `Field` text, đếm ký tự, lỗi inline khi < 2 hoặc > 100. |
| 5–6 | Từ ngày / Đến ngày * | `input type="date"`, `min` = hôm nay (VN) — server vẫn tự chặn 422 `past-range` (I2); lỗi inline khi Đến < Từ hoặc > 30 ngày. |
| 7 | Phạm vi * | Radio "Toàn bộ tổ chức" (mặc định) / "Chọn lớp học cụ thể" + `ChipMulti` các lớp đang mở. |
| 8 | Phương thức | Radio "Dời lịch (+1 buổi vào cuối khóa)" chọn sẵn; "Hủy buổi" thêm ở TOS-13. |
| 9 | Bảng xem trước | Gọi preview khi form hợp lệ, debounce 300ms; cột: Lớp · Buổi gốc (thứ, dd/MM, Buổi N) · Trạng thái · Kết quả ("→ Dời sang T6, 25/12/2026 · 18:00"). `keptCompleted` và `unsupported` hiện thành dòng xám không thao tác (nhãn chi tiết ở TOS-12). Trạng thái loading/lỗi/rỗng rõ ràng. |
| 10 | Gửi thông báo | Checkbox mặc định bật. |
| 11–12 | Hủy bỏ / Xác nhận áp dụng & Dời buổi | Nút xác nhận disabled khi form lỗi, đang tải preview, hoặc `shifts` rỗng (kèm cảnh báo "Không có buổi học nào trong khoảng ngày đã chọn"). 409 `stale-preview` → tải lại preview và báo "Lịch vừa thay đổi, kiểm tra lại bảng xem trước". Thành công → Toast "Đã dời N buổi", đóng hộp thoại. |

Responsive: ở 375px bảng xem trước chuyển thành danh sách thẻ dọc. Bàn phím: focus đầu vào ô Tên, Esc đóng, Enter trên nút xác nhận; badge đếm `aria-hidden`.

## Tasks & Steps

1. Test component đỏ: lỗi inline + nút khóa khi tên 1 ký tự / khoảng 31 ngày; preview được gọi với draft đúng; bảng render ngày bù; xác nhận gọi apply và đóng; 409 gọi lại preview.
2. Dựng repo + component, gắn vào route.
3. Snapshot `holidays`/`holidayShifts` + render nhãn trên block tuần; test `schedule.test.tsx`.
4. Tự kiểm 3 viewport (1440×900, 768×1024, 375×812) và focus theo `REVIEW.md`; chạy `pnpm design:compare`.

## Verification

- `pnpm --filter web test -- holiday-modal schedule`
- `pnpm --filter server test -- kernel-occurrence` (thêm case snapshot trả `holidays`/`holidayShifts`)
- `pnpm check`, `pnpm check-types`, `pnpm design:compare`
