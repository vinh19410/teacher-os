---
title: Ship TOS-11 tạo lịch nghỉ chung, xem trước và dời buổi (+1 buổi cuối khóa)
date: 2026-10-26
summary: "Ship issue #445: 3 bảng lịch nghỉ chung, planner thuần planHolidayShift, API preview/apply nguyên tử, áp shift khi kích hoạt học viên và hộp thoại trên /schedule; PR vào develop (beta)"
---

# Ship TOS-11 tạo lịch nghỉ chung, xem trước và dời buổi (+1 buổi cuối khóa)

## What happened
Chạy `ak-vibe --ship --beta --advice` cho issue #445 (Jira TOS-11) theo plan `plans/261026-2007-tos-11-holiday-shift-makeup/` trên nhánh `ai-handle-issue-445` (base `develop`). Triển khai đầy đủ 6 phase: migration `0046_fresh_naoko.sql` (3 bảng `organization_holiday`, `organization_holiday_class`, `holiday_session_shift`), module thuần `planHolidayShift`, route `/api/holidays/preview` + `/api/holidays`, cập nhật các consumer đọc `lesson.status = "holiday"`, hộp thoại tạo lịch nghỉ trên `/schedule`, và E2E 3 viewport.

## Decision
- Red-team Kongming trả NO-GO có điều kiện với 3 Critical / 7 Important trước khi code; đã vá toàn bộ vào plan và hiện thực hóa:
  - **C1 (Batch nguyên tử):** D1 không rollback khi UPDATE khớp 0 dòng → dùng biểu thức `CASE WHEN ... ELSE NULL END` trên cột `NOT NULL` (`holiday_session_shift.original_date`) để ép toàn bộ `db.batch` rollback khi số dòng `upcoming` lệch hoặc ngày bù bị chiếm.
  - **C2 (Khóa edit buổi nghỉ):** chặn sửa/dời nhóm buổi có dòng `holiday` (`409 holiday-locked`) ở cả `/lessons/:id/edit` và `/classes/:id/sessions/:date/edit` (kèm `ne(lesson.status, "holiday")` trong `occurrenceUpdate`), đồng thời kéo `holiday_session_shift.makeupDate` trong cùng `db.batch` khi `moveDate` một buổi bù.
  - **C3 (Chống trùng ngày bù):** `uniqueIndex (class_id, makeup_date)` trên `holiday_session_shift`.
  - **I1–I7:** điểm bắt đầu tìm ngày bù từ `max(maxTeachingDate, todayISO) + 1`, chặn `past-range` (422), `activateEnrollment` áp shift cộng dồn theo `createdAt ASC` kèm guard + retry ≤ 3 và tự sinh shift cho lớp chưa có học viên lúc apply, nhóm `holiday` không tiêu thụ `index` buổi học (`index = 0`), sinh buổi bù bằng `INSERT ... SELECT` (trần 500 câu lệnh), và đối chiếu `planHash` SHA-256 giữa preview và apply.
- Local code review (`ReviewerTOS11`) bắt thêm 1 Critical + 4 Important + 2 Minor và đã sửa sạch: chặn `RangeError` trong `holidayISODate` khi ngày vượt biên lịch (`2026-13-01`), gộp `occurrenceUpdate` + update shift vào chung `db.batch`, loại trùng `classIds`, hiển thị bảng `keptCompleted`/`unsupported` kể cả khi `shifts` rỗng, sửa React `key` trong `ClassSessionsSection`, và tách `previewKey` để sửa tên/checkbox không bắn lại request preview.

## Verification
- `pnpm check` (biome check 1085 files): 0 error; `pnpm check-types`: 0 error.
- Unit & integration tests: `@teacher-os/api` 24/24 (`holiday-contracts`, `holiday-plan`), `@teacher-os/db` 6/6, `server` 873/873 (`holidays.test.ts` 13 cases gồm rollback race C1, chain I3, lớp trống I6, khóa edit C2; `kernel-occurrence.test.ts`; `dashboard-reminders.test.ts`), `web` 1500/1500 (`holiday-modal.test.tsx`, `schedule.test.tsx`, `class-occurrence.test.ts`, `schedule-week.test.ts`, `dashboard-from-kernel.test.ts`), `student` 353/353 (`class-lesson-list.test.tsx`).
- E2E Playwright `specs/holiday-shift.spec.ts`: 3/3 passed (1440×900, 768×1024, 375×812 + keyboard focus/Escape + 0 horizontal overflow).
- `pnpm design:compare -- --screens t-schedule --side app`: 6 ảnh, 0 lỗi.

## Open
- Điểm nối bàn giao cho các ticket kế tiếp:
  - **TOS-12:** dữ liệu `skippedHolidayDates` và `keptCompleted` đã có sẵn từ planner và bảng xem trước.
  - **TOS-13:** bảng `holiday_session_shift` lưu cặp `originalDate → makeupDate` để hiển thị và hoàn tác; `mode = "cancel"` sẽ mở ở TOS-13.
  - **TOS-14:** cộng dồn buổi bù vào `schedule-conflicts` (`classEnd`) và chặn `moveDate` thủ công rơi vào ngày nghỉ chung.
  - **TOS-19 (M1):** cột `organization_holiday.notified_at` (nullable) đã tạo sẵn để worker gửi Email + In-app cho học viên đọc và đóng dấu.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
