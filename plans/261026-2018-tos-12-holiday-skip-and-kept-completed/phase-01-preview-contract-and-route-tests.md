---
phase: 1
title: "Preview trả tên kỳ nghỉ bị nhảy qua + test route AC-002"
status: completed
priority: P1
effort: "3h"
dependencies: ["#445"]
---

# Phase 1: Contract preview và test route

> **Red-team adjustments (kongming, 2026-10-26):** bổ sung file
> `apps/server/src/routes/enrollment-activation.ts` (C2b — nơi gọi planner thứ
> hai, `loadClassHolidays` phải lấy thêm cột `name`); shape chốt
> `skippedHolidays: {date, holidayName: string | null}[]` — null = ngày thuộc
> kỳ nghỉ đang tạo, client điền tên từ form (giữ quyết định previewKey bỏ
> `name`); loader sắp `createdAt ASC, id`, kỳ khai báo trước thắng khi chồng
> ngày (I2); test case (c) làm theo I4: buổi trộn completed+upcoming của
> `enr-a1` tại F3 + lớp B vẫn dời, apply assert status giữ nguyên và không có
> shift cho lớp A. Không đưa `skippedHolidays` vào `planHashOf` (tên không đổi
> dữ liệu ghi DB; đưa tên draft vào hash sẽ gây 409 khi sửa tên).

## Goal

Preview/apply chứng minh được hai luật AC-002 với dữ liệu thật trong DB, và trả đủ thông tin để UI ghi tên kỳ nghỉ bị nhảy qua (D3).

## Files to Modify

- `packages/api/src/holiday-plan.ts` — `existingHolidayDates` đổi thành map `classId → Map<date, holidayName>`; `PlannedShift.skippedHolidays: {date, holidayName}[]` (thay `skippedHolidayDates`). Ngày thuộc kỳ nghỉ đang tạo dùng tên của draft.
- `packages/api/src/holiday-plan.test.ts` — cập nhật case nhảy 26/12 → 29/12 kiểm tra cả tên.
- `packages/api/src/contracts.ts` — kiểu `HolidayPreview` theo shape mới.
- `apps/server/src/routes/holidays.ts` — loader trả tên kỳ nghỉ cùng ngày.
- `apps/server/src/routes/holidays.test.ts` — thêm case.

## Tasks & Steps

1. Đọc `HolidayPreview` và loader thực tế trên `develop` (sau #445) — ghi chênh lệch so với plan TOS-11 nếu có.
2. Test đỏ ở `holidays.test.ts`:
   - Seed lớp "IELTS 5.0B" T3 & T7, kỳ nghỉ «Nghỉ Tết Dương lịch» 26/12/2026 đã lưu (scope org). Tạo kỳ nghỉ mới trúng 1 buổi sao cho ngày bù kế tiếp là 26/12 → preview `makeupDate = 2026-12-29`, `skippedHolidays = [{date:"2026-12-26", holidayName:"Nghỉ Tết Dương lịch"}]`; apply tạo lesson tại 29/12, không có lesson tại 26/12.
   - Kỳ nghỉ 26/12 chỉ áp cho lớp A (`scope = "classes"`) → ngày bù lớp B không nhảy.
   - Seed buổi 20/11/2026 lớp "Giao tiếp 1" có 1 dòng `completed` và 1 dòng `upcoming`; kỳ nghỉ org bao 20/11 → buổi vào `keptCompleted`; apply không đổi status của cả 2 dòng, không có `holiday_session_shift` cho buổi đó.
3. Sửa planner/loader/contract cho xanh.

## Verification

- `pnpm --filter @teacher-os/api test -- holiday-plan`
- `pnpm --filter server test -- holidays`
- `pnpm check-types`
