---
title: "Fix Student Class Card Schedule JSON Display"
date: "2026-09-24"
author: "Assistant"
tags: ["student-portal", "ui", "schedule", "class-card", "formatting"]
---

# Fix Student Class Card Schedule JSON Display

## Symptom
Trên thẻ lớp học của học viên ở trang Tổng quan cổng học viên (`apps/student`):
Dòng thông tin lịch học bị hiển thị chuỗi JSON thô như `{"days":[0,2,4],"start":"19:00","end":"20:30"}` thay vì dạng tiếng Việt dễ đọc (ví dụ: `T2 & T4 & T6 · 19:00–20:30`).

## Root Cause
1. **Lưu trữ database**: Trường `schedule` trong bảng `classTable` lưu dữ liệu dạng chuỗi JSON `{"days":[0,2,4],"start":"19:00","end":"20:30"}` (hoặc chuỗi văn bản tự do với dữ liệu cũ).
2. **Server API endpoint**: Route `GET /api/student/overview` (`apps/server/src/routes/student.ts`) truyền trực tiếp giá trị cột `cls.schedule` thô từ database vào response `StudentClass.schedule` mà không qua hàm định dạng.
3. **Student UI**: Component `ClassCard` (`apps/student/src/components/overview/class-card.tsx`) render trực tiếp `{cls.schedule}` mà không parse hoặc gọi `formatSchedule`, đồng thời mock test trước đó dùng chuỗi đã định dạng sẵn `"T2 & T5 · 18:30–20:00"` nên không phát hiện ra lỗi khi chạy với dữ liệu thật.

## Solution
1. **Chia sẻ logic `formatSchedule` tại `@teacher-os/api`**:
   - Tạo file `packages/api/src/format-schedule.ts` chứa `SCHEDULE_DAY_NAMES = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]`, hàm `parseSchedule` (phân tích chuỗi JSON, lọc và sắp xếp ngày từ 0 đến 6 tăng dần) và hàm `formatSchedule(raw: string)` (định dạng thành `T2 & T4 & T6 · 19:00–20:30`, fallback về chuỗi gốc nếu là văn bản cũ hoặc không phải JSON).
   - Cập nhật `apps/web/src/lib/format-schedule.ts` để re-export `formatSchedule`, `parseSchedule`, `type StructuredSchedule` từ `@teacher-os/api/format-schedule`, đảm bảo tính tương thích ngược cho `apps/web`.
2. **Định dạng dữ liệu trên Server (`apps/server/src/routes/student.ts`)**:
   - Gọi `schedule: formatSchedule(cls.schedule)` khi chuẩn bị dữ liệu lớp học cho endpoint `/api/student/overview`.
3. **Định dạng dữ liệu trên Client (`apps/student/src/components/overview/class-card.tsx`)**:
   - Sử dụng `formatSchedule(cls.schedule)` trước khi hiển thị trên thẻ lớp học, đảm bảo phòng thủ hai đầu (server lẫn client).
4. **Unit Tests**:
   - Thêm test case trong `apps/student/test/overview.test.tsx` kiểm tra `ClassCard` nhận chuỗi JSON `{"days":[0,2,4],"start":"19:00","end":"20:30"}` và render đúng `T2 & T4 & T6 · 19:00–20:30`, không hiển thị chuỗi JSON thô.
   - Thêm test case `(k)` trong `apps/server/src/student.test.ts` kiểm tra `/api/student/overview` format schedule đúng dạng cho học viên.

## Verification
- `pnpm --filter @teacher-os/api check-types`: Đạt 100% không lỗi.
- `pnpm --filter student test`: 40/40 tests pass.
- `pnpm --filter server test`: 323/323 tests pass.
- `pnpm --filter web test`: Pass toàn bộ tests liên quan.
- `pnpm check`: Biome check & lint sạch sẽ trên 466 files.
- `pnpm test`: Toàn bộ workspace test suites pass.
