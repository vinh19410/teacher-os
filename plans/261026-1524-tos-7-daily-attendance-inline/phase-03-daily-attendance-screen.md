---
phase: 3
title: "Nội dung màn /attendance: chip lọc, accordion, 4 trạng thái, ghi chú, lưu"
status: pending
priority: P1
effort: "7h"
dependencies: [2, "TOS-6 phase 2"]
---

# Phase 3: Màn Điểm danh tổng theo ngày

## Goal

Thay empty state của route khung `/attendance` (TOS-6) bằng danh sách ca thật, điểm danh và lưu inline, không chuyển trang. Hợp đồng URL `?date=&status=` giữ nguyên như TOS-6 đã chốt.

## Files to Create / Modify

- Create: `apps/web/src/lib/repos/daily-attendance.ts`.
  - `dailyAttendanceQuery(date)`: `queryOptions` với key `["kernel", "attendance", "daily", date]`. Nằm dưới prefix `kernel` để các mutation kernel hiện có tự làm mới.
  - `saveSessionAttendance(classId, date, entries)`: `PUT`, `credentials: "include"`, ném `HttpError` theo mẫu `repos/grading.ts`.
- Create: `apps/web/src/lib/attendance-draft.ts`. Reducer thuần cho trạng thái nháp của một ca: `set(lessonId, attendance)`, `setNote(lessonId, note)`, `reset(fromServer)`, `missing()`. Thiết kế sẵn để AC-003 thêm `markAllPresent()` mà không đổi cấu trúc.
- Create: `apps/web/src/lib/attendance-draft.test.ts`.
- Create: `apps/web/src/components/attendance/attendance-session-row.tsx`. Hàng accordion của một ca + bảng học viên. Nhận data qua props, không tự fetch.
- Create: `apps/web/src/components/attendance/attendance-status-picker.tsx`. Radio group 4 trạng thái (`role="radiogroup"`, phím mũi tên đổi lựa chọn).
- Create: `apps/web/src/components/attendance/attendance-session-row.test.tsx`.
- Modify: `apps/web/src/routes/_auth/attendance.tsx` (TOS-6 tạo). Gắn query, `ChipFilter` trạng thái, danh sách ca. Cập nhật `attendance.test.tsx`.

## Hành vi UI

| Vùng | Hành vi |
|---|---|
| Đầu trang | `PageHead` "Điểm danh tổng theo ngày", kicker ngày định dạng `vi-VN`. Ô chọn ngày + nút "Hôm nay"; đổi ngày thì `navigate({ search })`. |
| Chip lọc | `ChipFilter` "Tất cả / Chưa điểm danh / Đã điểm danh" với badge `counts`, badge `aria-hidden`. Lọc client-side trên dữ liệu đã tải. |
| Hàng ca (thu gọn) | "HH:mm – HH:mm · Tên lớp · Sĩ số N HV" + `Badge` "Chưa điểm danh" hoặc "Đã điểm danh (x/N có mặt)". |
| Hàng ca (mở) | Bảng học viên: STT, tên, `AttendanceStatusPicker`, ô "Ghi chú học vụ" (`maxLength=255`). Nút primary "Lưu điểm danh ca học". |
| Lớp legacy | Nhãn "Lớp chưa gắn lịch ngày", danh sách học viên chỉ đọc, nút "Mở lớp để điểm danh →" tới `/classes/$classId`. |
| Lưu | Nút disabled + "Đang lưu…" khi pending. Thành công: toast "Đã lưu điểm danh" (hoặc "Đã cập nhật điểm danh" khi ca đã `recorded`), thu gọn hàng, `invalidateQueries({ queryKey: ["kernel"] })` để bộ đếm dashboard và snapshot cùng làm mới. URL không đổi. |
| Thiếu trạng thái | Chặn ở client: viền `warning` cho dòng thiếu, focus dòng thiếu đầu tiên, thông báo "Còn N học viên chưa chọn trạng thái". Không gọi API. |
| Lỗi server | 422 `future-session`: "Chưa đến ngày học, chưa thể điểm danh." 409 `roster-changed`: "Danh sách lớp vừa thay đổi, đã tải lại." rồi refetch. Lỗi khác: thông báo kèm nút "Thử lại", giữ nguyên nháp. |
| Ngày tương lai | Picker và nút lưu disabled, ghi chú "Chưa đến ngày học". |
| Loading / rỗng | Skeleton 3 hàng. Rỗng: "Không có ca học nào trong ngày này." |
| Mở sẵn | Khi `status=pending`, ca chưa điểm danh đầu tiên mở sẵn. |

Responsive theo wireframe: ở `768px` và `375px`, bảng học viên chuyển thành thẻ xếp chồng; picker 4 trạng thái thành lưới 2×2, mỗi ô ≥ 44px chiều cao. Token màu từ `packages/ui/src/styles/globals.css`, đọc `DESIGN.md` trước khi viết.

## Tasks & Steps

1. Test đỏ cho `attendance-draft`: chọn trạng thái, sửa note, `missing()` trả đúng `lessonId`, `reset` lấy lại giá trị server.
2. Test đỏ cho `AttendanceSessionRow`:
   - Mở hàng thì thấy đủ học viên và 4 lựa chọn với nhãn tiếng Việt chuẩn.
   - Bấm lưu khi thiếu → không gọi `onSave`, hiện thông báo thiếu.
   - Chọn đủ rồi lưu → `onSave` nhận đúng `entries` (kể cả note đã trim).
   - Ca legacy không render radio, có link sang trang lớp.
3. Viết repo, reducer, component, gắn vào route. Cập nhật `attendance.test.tsx` mock fetch.
4. Tự kiểm bàn phím: Tab vào hàng ca, Enter/Space mở, mũi tên đổi trạng thái, Tab tới ghi chú rồi nút lưu; focus ring hiện rõ.

## Verification

- `pnpm --filter web test -- attendance`
- `pnpm check-types`
- `pnpm check`
