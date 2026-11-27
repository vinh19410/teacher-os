---
date: 2026-11-27
issue: 1015
branch: fix/1015-keep-r2-recording-on-session-ops
status: completed
---

# Journal — #1015: Bảo toàn video R2 khi xóa, dời buổi học, áp/hoàn tác kỳ nghỉ hoặc đổi ngày khai giảng

## Bối cảnh & Nguyên nhân gốc

Từ sau #994, Zoom cloud recording được chép sang bucket R2 riêng (`RECORDINGS`) và đưa bản gốc trên Zoom vào Trash, khiến object trên R2 nhiều khi là bản sao duy nhất còn hạn. Tuy nhiên, `DELETE /api/classes/:id/sessions/:date`, `POST /api/classes/:id/sessions/:date/edit`, `POST /api/holidays`, `DELETE /api/holidays/:id`, và `applyClassStartDateChange` (`PATCH /api/classes/:id`, `POST /api/classes/:id/confirm-opening`) đều xóa hoặc ghi đè `class_session_meeting` (theo `date`) hoặc đẩy sang `runInBackground` thông qua `syncZoomOnSession*`, dẫn tới nguy cơ mất hẳn video R2 còn hạn khi sửa/xóa/dời buổi.

## Giải pháp đã triển khai

1. **Định nghĩa thống nhất & bẫy cần tránh:**
   - Định nghĩa bản ghi R2 còn hạn (`hasLiveR2Recording`, `liveR2RecordingSql(nowMs)`, `nonLiveR2RecordingSql(nowMs)` trong `apps/server/src/lib/zoom/session-zoom-service.ts`): `recordingStorageKey IS NOT NULL AND (recordingExpiresAt IS NULL OR recordingExpiresAt > nowMs)`.
   - Mọi biểu thức SQL luôn bind `nowMs = now.getTime()` dạng số nguyên ms cho cột `timestamp_ms`, giữ bảng `classSessionMeeting` không alias ở câu target, và dọn object R2 đã hết hạn qua `deleteRecordingObjectBestEffort` **bên ngoài** `runZoomSyncTask` để `!isZoomEnabled` vẫn dọn sạch.
2. **Bảo vệ nguyên tử trong `db.batch` + đóng TOCTOU:**
   - **Xóa/hủy buổi:** `DELETE /api/classes/:id/sessions/:date` (`apps/server/src/routes/kernel.ts`) và `syncZoomOnSessionCancelOrDelete` chặn `409 RECORDING_LOCKED` khi còn video R2 còn hạn, dùng `nonLiveR2RecordingSql(nowMs)` trong `.delete().returning(...)`, còn hủy buổi chỉ soft-detach (`zoomMeetingId = null`, `joinUrl = ""`) với SQL `CASE` giữ nguyên trạng thái R2.
   - **Dời buổi & Kỳ nghỉ:** `POST /api/classes/:id/sessions/:date/edit`, `syncZoomOnSessionEdit`, `POST /api/holidays`, và `DELETE /api/holidays/:id` (`apps/server/src/routes/holidays.ts`) cập nhật `class_session_meeting` đồng bộ trong cùng `db.batch` với CAS (`classTable.name`, `recordingGuardCas`, chunk 6/statement <= 68 binds trên D1) và re-query trong `catch` (`err` & `err.cause`).
   - **Đổi ngày khai giảng:** `applyClassStartDateChange` (`apps/server/src/lib/class-start-date-reschedule.ts`) mô phỏng `simulateZoomSyncPlan` trước `db.batch` (`recordDestroyed` cho Step A/`surplusOldDates`/Pass 1.5/Step C shifts vs `recordCancelled` cho Step C `newCancels`), khóa `casGuardSql` + CAS theo chunk 40 ngày cho `surplusOldDates`, và re-check `classSessionMeeting` + `loadClassHolidays` tại `attempt >= 3`.
3. **Frontend & Tài liệu:**
   - Toàn bộ modal/toast/repo ở `apps/web` (`session-actions-modal.tsx`, `kernel-outcome.ts`, `$classId.tsx`, `use-kernel-form-submit.ts`, `repos/class-opening.ts`, `confirm-opening-modal.tsx`, `repos/holidays.ts`, `holiday-modal.tsx`, `holiday-undo-dialog.tsx`) đối chiếu `code === RECORDING_ERROR_CODES.LOCKED` (không dùng `reason` vì `repos/kernel.ts` ghi đè `reason` bằng `error`), kèm `apps/web/src/lib/repos/holidays.test.ts` và cập nhật `docs/system-architecture.md`.

## Lưu ý vận hành phát hiện trong quá trình verify

- Shell mặc định chạy Node `v26.9.0` làm 2 test `localStorage` không liên quan (`login-signup-gate.test.tsx`, `app-shell.test.tsx`) fail trong `vitest` jsdom; chạy dưới Node `v24.22.2` theo `AGENTS.md` cho kết quả 100% xanh.
- Gate đã pass dưới Node `v24.22.2`: `pnpm --filter server test` (143/143 files), `pnpm --filter web test` (221/221 files, 2568/2568 tests), `pnpm exec biome check .` (2615 files, 0 errors), và `pnpm check-types` (14/14 tasks).
