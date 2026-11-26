---
title: "Fix #959: Overdue attendance dashboard visibility"
date: 2026-11-26
summary: "Hiển thị buổi quá hạn chưa điểm danh qua ?v=2, GET /api/attendance/overdue, prefix cache invalidation và tab Quá hạn trên /teacher/attendance (#959)"
---

# Fix #959: Overdue attendance dashboard visibility

## What Happened & Root Cause

`apps/server/src/routes/dashboard-reminders.ts` trước đây lọc cứng `eq(lesson.date, today)` thay vì gom cả quá khứ, khiến mọi buổi có ngày đã qua nhưng chưa chốt điểm danh (`lesson.date < today`, `status = "upcoming"`) biến mất hoàn toàn khỏi Dashboard Card #1, chỉ số Hero `openTasks` và màn `/teacher/attendance`. Giáo viên bỏ lỡ buổi hôm trước là hệ thống xem như xong việc.

## The Brutal Truth

Bề mặt tưởng chỉ là sửa điều kiện ngày, nhưng ba phiên Red-Team song song đã đập thẳng 11 phát hiện (4 Critical) trước khi kịp gõ dòng code đầu tiên — nếu lao vào làm ngay, ta đã đẩy lên production một bản vá vỡ schema `.strict()` lúc deploy-skew và để `DataProvider` (`staleTime: Infinity`) ghim cache cũ vĩnh viễn. Đã thế, máy VM dùng chung nghẽn RAM/CPU liên tục làm `check-types` và Vitest nổ dây chuyền, còn ảnh chụp 375px lại lòi dấu `·` rớt dòng mồ côi mà toàn bộ unit test đều mù tịt. Mệt nhất không phải viết tính năng, mà là vá từng cái bẫy vận hành và đồng hồ lệch trước khi chúng cắn lúc 2 giờ sáng.

## Decisions

1. **Opt-in `?v=2` trên `GET /api/dashboard/reminders`:** Giữ nguyên payload v1 `.strict()` (`pending = today + overdue`) và chỉ trả thêm `today`, `overdue`, `items[].date` khi client gửi `?v=2`. **Loại bỏ** phương án sửa thẳng v1 vì `alchemy.run.ts` deploy `serverWorker` trước `lmsWorker` — đổi shape v1 sẽ làm web bundle cũ fail Zod `.strict()` trong cửa sổ deploy-skew hai chiều.
2. **Endpoint `GET /api/attendance/overdue` dùng chung helper 4 bảng có `orgId`:** Tái sử dụng `queryOverdueAttendanceBuckets` cùng `computeReminders`, chạy Bước 2 theo batch 25 cặp `(classId, date)` để ăn thẳng index `lesson_class_date_idx`, thêm TOCTOU empty-bucket guard và chuẩn hóa `?limit=` chặt (mặc định 50, kẹp tối đa 100, giá trị lỗi trả `400`). **Loại bỏ** truy vấn lặp theo từng ngày hoặc `IN` không giới hạn vượt trần bind param D1.
3. **Invalidate theo prefix `attendanceBaseQueryKey = ["kernel", "attendance"]`:** Cập nhật `DataProvider` xóa cả nhánh `daily` lẫn `overdue` sau mutation vì `staleTime: Infinity` sẽ giữ dữ liệu cũ nếu chỉ invalidate khóa ngày đơn lẻ.
4. **UX `/teacher/attendance` chống lệch giờ và bước ngày:** Thêm chip `"Quá hạn"` + banner đỏ bám trang, tự rollover qua nửa đêm giờ VN, dùng `effectiveTodayISO` làm chuẩn clock-skew cho `isRowOverdue`, `isFutureDate`, nút `"Hôm nay"`, và auto-advance theo `queryState`/`dataUpdatedAt` + `prevOverdueIndex`.

## Challenges & Fixes

- **Red-Team tiền triển khai (11 findings):** Khóa trước 4 lỗi Critical (`DataProvider` stale cache, lỗi `TS2339` khi truy cập `classPaused` trên union type, deploy-skew `.strict()`, và join thiếu cô lập `orgId` đủ 4 bảng), 6 High và 1 Medium ngay trong plan.
- **Phase 1 Verify:** Bắt được mã lỗi chuẩn wire của auth là `ACCOUNT_ADMIN_ROLE` (`ACCOUNT_ERROR_CODES.ADMIN_ON_TEACHER_APP`) thay vì chuỗi suy đoán.
- **Tắc nghẽn hạ tầng VM dùng chung:** Phải chạy tuần tự `check-types` từng package, tách Vitest với `--maxWorkers=2` (`VITEST_SKIP_SLOW=1` + `test:ledger`), và nối lại `design:compare` bỏ `--force` sau khi đụng race frame trắng giữa `networkidle` và `DataProvider`.
- **Soi ảnh 375px & local `code-reviewer`:** Mắt thường trên screenshot POT 375px phát hiện dấu `·` rớt dòng mồ côi trong `AttendanceSessionRow` (sửa bằng `hidden sm:inline` + `basis-full sm:basis-auto`); `code-reviewer` bắt thêm lệch clock-skew ở `isFutureDate` và 3 server unit test thiếu (TOCTOU empty bucket, >25-batch + clamp 100, same-day tie-breaker) — tất cả đã vá và xác minh xanh.

## Lessons Learned

- Mọi schema Zod `.strict()` chạy sau thứ tự deploy `serverWorker` → `lmsWorker` bắt buộc tiến hóa kiểu opt-in (`?v=2`) để chịu được deploy-skew hai chiều.
- Với `staleTime: Infinity`, mọi query họ hàng (`daily`, `overdue`) phải chia sẻ chung một query key prefix để một lệnh invalidate phủ sạch không bỏ sót.
- Không tin vào đồng hồ máy client (`new Date()`) cho phân loại quá khứ/tương lai (`isRowOverdue`, `isFutureDate`) khi server đã cấp mốc ngày chuẩn (`effectiveTodayISO`).
- Unit test không thay được bước mở screenshot viewport 375px bằng mắt; các lỗi wrap ký tự phân cách (`·`) chỉ lộ khi render thật.

## Next Steps

- Chủ nhánh commit, push và mở PR beta vào `develop` cho issue #959, đính kèm POT với 7 ảnh `plans/reports/959-*.png` ngay khi CI xanh (AgentWiki publish skipped — giữ file local làm nguồn gốc).
- Mở issue follow-up riêng (ngoài phạm vi #959) để xử lý triệt để race frame trắng `networkidle` vs `DataProvider` trong harness `design:compare` trên máy tải cao.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
