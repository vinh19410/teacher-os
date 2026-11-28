---
title: "Phase 2: Web Modal Preview, Visual Verification & POT"
status: completed
---

# Phase 2: web-and-visual-pot

## Overview

Nối `resolveClassExpectedEndDate` từ `$classId.tsx` vào `ConfirmOpeningModal` để iframe xem trước email hiển thị đúng ngày kết thúc khóa học dự kiến (gồm lịch bù nghỉ lễ hoặc tính lại trực tiếp khi sửa `Ngày khai giảng`), giữ nguyên `<dl>` tóm tắt đầu modal, kiểm chứng giao diện 3 viewport + light/dark và chạy toàn bộ local gate.

## Requirements

- [ ] `$classId.tsx` tính `openingSessionEndDate` bằng `resolveClassExpectedEndDate` (với `effectiveSessionsTotal` đồng bộ `resolveClassSessions`, gồm `curriculumCopy.totalLessons` khi `cls.sessionsTotal === 0`) và truyền `expectedEndDate={openingSessionEndDate}` + `effectiveSessionsTotal` vào `ConfirmOpeningModal`.
- [ ] `ConfirmOpeningModal` bỏ truyền `level` vào `renderClassOpeningEmail`, truyền `expectedEndDate: previewExpectedEndDate` (dùng `isLiveStartDateEdited = !startDateReadOnly && effectiveStartDate !== cls.startDate.trim()`):
  - Lớp `manual`: dùng `expectedEndDate ?? null`.
  - Lớp `auto` khi `isLiveStartDateEdited === true`: ước tính live bằng `computeExpectedEndDateFromSchedule` với `effectiveSessionsTotal`.
  - Lớp `auto` khi `isLiveStartDateEdited === false`: ưu tiên `expectedEndDate` (nếu khác `undefined`), fallback `computeExpectedEndDateFromSchedule`.
- [ ] Khung `<dl>` tóm tắt đầu modal (`Lịch học`, `Hình thức`, `Tổng số buổi`) không thay đổi.
- [ ] Chụp ảnh POT 3 viewport (`1440×900` light/dark, `768×1024` light, `375×812` light) trong `plans/reports/` và kiểm tra trực quan từng ảnh.

## Files to Modify

- `apps/web/src/routes/_auth/classes/$classId.tsx`
- `apps/web/src/routes/_auth/classes/$classId.test.tsx`
- `apps/web/src/components/modals/confirm-opening-modal.tsx`
- `apps/web/src/components/modals/confirm-opening-modal.test.tsx`

## Implementation Steps (TDD)

1. **Test-first ở `apps/web`:**
   - Cập nhật `confirm-opening-modal.test.tsx`: kiểm tra `iframe.srcdoc` có `Ngày kết thúc khóa học dự kiến`, không có `Trình độ`/`Thời lượng`, cập nhật live khi đổi `Ngày khai giảng`, giữ `expectedEndDate` ở lớp `manual`, ẩn dòng khi `manual` + `null`, và giữ nguyên `Tổng số buổi` ở `<dl>` summary.
   - Bổ sung test trong `$classId.test.tsx`: lớp có `holidayShifts` truyền ngày buổi bù sang preview iframe của `ConfirmOpeningModal`.
2. **Implement `apps/web`:**
   - Cập nhật `apps/web/src/routes/_auth/classes/$classId.tsx` và `apps/web/src/components/modals/confirm-opening-modal.tsx`.
3. **Full local gates & isolated code review:**
   - Chạy `pnpm check`, `pnpm exec biome check .`, `pnpm check-types`, `pnpm --filter @teacher-os/api test`, `CI=1 pnpm --filter web test`, `pnpm --filter server test`, `pnpm build`.
   - Spawn `code-reviewer` subagent độc lập rà soát toàn bộ diff.
4. **Visual verification & POT screenshots:**
   - Khởi động stack local tạm (port `8100`/`8101`), đăng nhập/seed dữ liệu mẫu, chụp 4 ảnh PNG vào `plans/reports/`, đọc kiểm tra bằng `read_file`, và dọn sạch toàn bộ tiến trình con.

## Todo

- [x] Viết/cập nhật test `confirm-opening-modal.test.tsx` và `$classId.test.tsx`
- [x] Cập nhật `apps/web/src/routes/_auth/classes/$classId.tsx` và `confirm-opening-modal.tsx`
- [x] Chạy đầy đủ local gates (`biome`, `check-types`, tests, `build`) và `code-reviewer`
- [x] Chụp và kiểm tra 4 ảnh POT (`1440-light`, `1440-dark`, `768-light`, `375-light`) + ảnh full body email (`1440-light`, `1440-dark`, `375-light`)

## Verification

- `CI=1 pnpm --filter web test src/components/modals/confirm-opening-modal.test.tsx src/routes/_auth/classes/$classId.test.tsx`
- `pnpm exec biome check . && pnpm check-types && pnpm --filter @teacher-os/api test && CI=1 pnpm --filter web test && pnpm --filter server test && pnpm build`

## Success Criteria

Preview email trong `ConfirmOpeningModal` khớp 100% email server gửi đi trên trạng thái lớp đã lưu (gồm buổi học thực tế, holiday shift/cancel, lớp manual, lớp chưa có lịch), ước tính live theo `computeExpectedEndDateFromSchedule` khi sửa `startDate` trước khi bấm gửi, toàn bộ local gate xanh, review sạch, và 4 ảnh POT xác nhận không lỗi hiển thị.
