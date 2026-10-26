---
title: Ship TOS-13 Phương thức Hủy buổi (không bù) và Hoàn tác kỳ nghỉ tương lai
date: 2026-10-27
summary: "Ship issue #448: mở phương thức Hủy buổi (mode cancel, bảng holiday_session_cancel migration 0050) và thao tác Xóa kỳ nghỉ (Hoàn tác) DELETE /api/holidays/:id cho kỳ nghỉ tương lai, kích hoạt học viên D7, UI radio + thẻ kỳ nghỉ + hộp thoại xác nhận hoàn tác, E2E AC-003; PR vào develop (beta)"
---

# Ship TOS-13 Phương thức Hủy buổi (không bù) và Hoàn tác kỳ nghỉ tương lai

## What happened
Chạy `ak-vibe --ship --beta --advice` cho issue #448 (Jira TOS-13, AC-003) theo plan `plans/261026-2018-tos-13-holiday-cancel-and-undo/` trên worktree `ai-handle-issue-448`. Hoàn tất cả 4 phase:
1. **Phase 1 (Schema + Contract + Planner):** thêm bảng `holiday_session_cancel` (`packages/db/src/schema/organization-holiday.ts`, migration `0050_bent_spectrum.sql` sinh sau khi merge `origin/develop` có `0049_shocking_kabuki.sql` và sửa `prevId` bị lệch của `0049_snapshot.json`), mở `holidayDraftSchema.mode` nhận `"shift" | "cancel"`, mở rộng `planHolidayShift` trả `cancellations` (giữ nguyên `keptCompleted`/`unsupported`, cho phép lớp lịch legacy nhưng có `date` vẫn hủy được ở mode `cancel` theo D2).
2. **Phase 2 (API Cancel + Undo + Activation + Snapshot):** `POST /api/holidays` nhánh `cancel` ghi `holiday_session_cancel` + chuyển `lesson` sang `cancelled` trong 1 batch có guard; `DELETE /api/holidays/:id` kiểm tra org (404), `fromDate <= vietnamTodayISO()` (422 `holiday-started`), kiểm tra toàn vẹn các dòng buổi bù/buổi hủy qua `loadClassLessons` chunk 50 (409 `makeup-touched` kèm danh sách `touched`), thực thi hoàn tác nguyên tử kèm guard gộp trên `organization_holiday.name`; mở rộng `holidayBucketLocked` khóa sửa/dời ngày trong `holiday_session_cancel`; `activateEnrollment` áp `holiday_session_cancel` (D7) và bảo vệ nhánh I6 bằng `existingClassLessons.length === 0` + `holidayExistsGuard`; snapshot trả `holidays[].mode` và `holidayCancels`.
3. **Phase 3 (UI):** radio `"Hủy buổi (không bù)"` trong `HolidayModal`, cột Kết quả `"→ Hủy buổi (không bù)"` trong `HolidayPreviewTable`, tách `HolidayCalendarCard` hiển thị thẻ kỳ nghỉ và nút `"Xóa kỳ nghỉ (Hoàn tác)"` cho kỳ nghỉ tương lai, `HolidayUndoDialog` hiển thị tóm tắt D8 và danh sách `touched` khi 409, nhãn `"Đã hủy — «tên kỳ nghỉ»"` trên block lịch tuần.
4. **Phase 4 (E2E):** `apps/e2e/specs/holiday-cancel-and-undo.spec.ts` (5 kịch bản phủ hủy buổi, hoàn tác ở 3 viewport 1440×900 / 768×1024 / 375×812, và ẩn nút hoàn tác khi kỳ nghỉ đã bắt đầu).

## Decision
- **Red-team plan (`KongmingPlanGates`):** 0 blocking, 5 non-blocking notes đã áp dụng (planner bỏ qua buổi `holiday`, dùng `vietnamTodayISO` có sẵn của server, giữ D6 không dồn lịch kỳ nghỉ khác sau hoàn tác).
- **Code review (`LocalCodeReview`):** phát hiện 1 Critical / 3 Important / 1 Minor và đã sửa triệt để cả 5/5 trước khi ship:
  1. `planHolidayShift` chỉ đưa buổi vào `classShifts` khi mọi dòng trong `(classId, date)` đều `upcoming` (không trộn dòng `cancelled` hủy tay lẻ); khóa `holidayBucketLocked` cho cả `holiday_session_cancel`; `DELETE /api/holidays/:id` kiểm tra bucket cancel còn nguyên `cancelled`.
  2. `activateEnrollment` chỉ tự sinh shift/cancel ở nhánh I6 khi lớp chưa có bất kỳ dòng `lesson` nào trong DB (`existingClassLessons.length === 0`) và kèm `holidayExistsGuard` chống race với `DELETE`.
  3. Mở `mode = "cancel"` cho lớp lịch legacy có `date` đúng quyết định D2.
  4. Bỏ N+1 query trong `DELETE /api/holidays/:id` bằng `loadClassLessons` chunk 50 và gộp guard vào 1 câu `UPDATE organization_holiday`.
  5. Lọc `h.mode !== "cancel"` ở fallback `holidayNameForDate` và tinh chỉnh câu thông báo 409 khi `touched` rỗng trong `HolidayUndoDialog`.

## Verification
- `@teacher-os/api`: 24 files, 315 passed.
- `apps/server`: 68 files, 953 passed (migration `0050_bent_spectrum.sql` chạy qua migrator trên mọi test).
- `apps/web`: 155 files, 1624 passed.
- `apps/student`: 39 files, 364 passed; `apps/admin`: 17 files, 180 passed.
- `pnpm check-types`: 8/8 packages passed; `pnpm check`: 0 errors.
- Playwright E2E `holiday-cancel-and-undo.spec.ts`: 5/5 passed; regression `holiday-shift` + `holiday-skip-and-kept-completed`: 7/7 passed.
- `design:compare` (`t-schedule`): 6 ảnh, 0 lỗi.

## Open
- Quyết định D6 (không tự dồn lại buổi bù của kỳ nghỉ khác sau khi hoàn tác) là mặc định đã chốt của plan để tránh đổi ngày học đã thông báo không qua preview.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
