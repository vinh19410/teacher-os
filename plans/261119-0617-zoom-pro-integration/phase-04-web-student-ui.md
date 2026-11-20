---
phase: 4
title: "UI giáo viên và học viên"
status: pending
priority: P1
effort: "6h"
dependencies: [3]
---

# Phase 4: UI giáo viên và học viên

## Goal

App giáo viên (`apps/web`) và cổng học viên (`apps/student`) dùng Zoom: nút tạo Zoom đơn lẻ/hàng loạt, "Vào lớp (Zoom)", "Xem recording" kèm mật khẩu, trạng thái lỗi recording; trang Hồ sơ không còn phần cấp quyền Google Meet.

## Context

- Đọc `DESIGN.md` và `REVIEW.md` trước. Dùng component có sẵn (`Button`, `Badge`, `Input` từ `@/components/ui/*`), icon `lucide-react` (`Video`, `Film`, `Copy`, `ExternalLink`, `RefreshCw`), toast `sonner`. Không hard-code màu.
- Dữ liệu meeting đến từ snapshot kernel: `sessionMeetings: KernelSessionMeetingRow[]` (shape mới từ phase 1). `class-sessions-section.tsx` dựng `meetingByDate` (~dòng 243).
- Chữ hiển thị: "Zoom" thay "Google Meet" ở mọi chỗ; "Tạo Zoom hàng loạt", "Đang tạo Zoom…", "Vào lớp (Zoom)", "Đã sao chép link Zoom.", "Mật khẩu recording: <passcode>".
- Không làm tự điểm danh qua Zoom; modal điểm danh giữ nguyên.
- Thứ tự task có chủ ý: dọn trang Hồ sơ (4.2) trước khi chạy grep toàn `apps/web/src` (4.4).

## Files to Create / Modify

Web:
- Move + rewrite: `apps/web/src/lib/repos/google-meet.ts` → `apps/web/src/lib/repos/zoom-meeting.ts`
- Move + rewrite: `apps/web/src/components/schedule/session-meet-panel.tsx` → `session-zoom-panel.tsx` (và `.test.tsx`)
- Modify: `apps/web/src/components/class-detail/class-sessions-section.tsx`, `session-actions-modal.tsx`
- Modify: `apps/web/src/components/schedule/class-session-modal.tsx`, `lesson-modal.tsx`
- Modify: `apps/web/src/components/profile/google-link-card.tsx`, `apps/web/src/lib/use-linked-accounts.ts`, `apps/web/src/routes/_auth/profile.test.tsx`
- Modify (mọi chỗ còn `meetUrl` / `google-meet`): `apps/web/src/lib/data-provider.tsx`, `kernel-state.ts`, `kernel-state.test.ts`, `mock-data.ts`, `apps/web/test/fixtures/mock-data.ts`, `apps/web/src/routes/_auth/classes/$classId.tsx`

Student:
- Modify: `apps/student/src/components/overview/class-card.tsx`, `overview/upcoming-sessions.tsx`, `class/class-lesson-list.tsx`, `schedule/student-schedule-view.tsx` và các file `.test.tsx` tương ứng.

## Tasks

### Task 4.1 — Repo client Zoom
- Target files: `apps/web/src/lib/repos/zoom-meeting.ts` (sau `git mv apps/web/src/lib/repos/google-meet.ts apps/web/src/lib/repos/zoom-meeting.ts`).
- Steps: giữ helper fetch hiện có; xoá `fetchGoogleIntegrationStatus`; export:
  - `createSessionZoom(classId, dateISO): Promise<SessionZoomCreateResponse>` → `POST /api/classes/:classId/sessions/:date/zoom`
  - `createClassZoomBulk(classId): Promise<ClassZoomBulkCreateResponse>` → `POST /api/classes/:classId/zoom/bulk`
  - `syncSessionRecording`, `updateSessionRecording` giữ nguyên đường dẫn.
- Verify: no verification needed (Task 4.4).

### Task 4.2 — Trang Hồ sơ: bỏ quyền Meet
- Target files: `apps/web/src/components/profile/google-link-card.tsx`, `apps/web/src/lib/use-linked-accounts.ts`, `apps/web/src/routes/_auth/profile.test.tsx`.
- Steps: `connectGoogle(withMeetScopes)` → `connectGoogle()` không truyền `scopes`; xoá `needsMeetPermission`, `meetReady`, badge "Sẵn sàng Meet"/"Thiếu quyền Meet" và nút cấp quyền; xoá phần gọi trạng thái Google integration trong `use-linked-accounts.ts`. Thẻ chỉ còn trạng thái liên kết đăng nhập Google như trước #816 (tham khảo `git show def76a93^:apps/web/src/components/profile/google-link-card.tsx` và `git show def76a93^:apps/web/src/lib/use-linked-accounts.ts`). Cập nhật test profile, bỏ mọi URL `googleapis.com/auth`.
- Verify: `pnpm --filter web exec vitest run src/routes/_auth/profile.test.tsx` exit 0; `grep -rn "googleapis.com/auth" apps packages --include=*.ts --include=*.tsx | grep -v node_modules | wc -l` in `0`.

### Task 4.3 — Panel Zoom của buổi học
- Target files: `apps/web/src/components/schedule/session-zoom-panel.tsx` (+ test), sau `git mv` từ `session-meet-panel.tsx` / `session-meet-panel.test.tsx`.
- Steps:
  1. Đổi tên component `SessionMeetPanel` → `SessionZoomPanel`; cập nhật mọi import (`grep -rn "SessionMeetPanel\|session-meet-panel" apps/web/src`).
  2. `meetUrl` → `joinUrl = zoom || meeting?.joinUrl || ""`; gọi `createSessionZoom`.
  3. Lỗi: bỏ nhánh `GOOGLE_*`; `ZOOM_NOT_CONFIGURED` → toast "Chưa cấu hình Zoom cho hệ thống. Liên hệ quản trị để thêm ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET."; lỗi khác (kể cả `ZOOM_RATE_LIMITED`) → hiện `err.message`.
  4. Khi `meeting?.recordingPassword` có giá trị và `recordingStatus === "ready"`: hiện "Mật khẩu recording: <passcode>" (chữ `font-mono`) + nút copy (`aria-label="Sao chép mật khẩu recording"`).
  5. Khi `recordingStatus === "failed"`: hiện `Badge` cảnh báo "Recording lỗi" và dòng `meeting.recordingError` (nếu có).
  6. Test: chuyển ca hiện có sang chữ Zoom; thêm ca hiện mật khẩu; thêm ca `failed` hiện `recordingError`.
- Verify: `pnpm --filter web exec vitest run src/components/schedule/session-zoom-panel.test.tsx` exit 0.

### Task 4.4 — Danh sách buổi, modal buổi
- Target files: `class-sessions-section.tsx`, `session-actions-modal.tsx`, `class-session-modal.tsx`, `lesson-modal.tsx`, cùng các file `lib`/fixture ở danh sách trên.
- Steps: `createClassMeetBulk` → `createClassZoomBulk`; state `bulkCreatingMeet` → `bulkCreatingZoom`; `hasMissingMeet` → `hasMissingZoom`; `rowMeetUrl` → `rowJoinUrl`; `meeting?.meetUrl` → `meeting?.joinUrl`; mọi chuỗi hiển thị "Google Meet"/"Meet" → "Zoom".
- Verify: `grep -rn "Google Meet\|meetUrl\|google-meet\|SessionMeetPanel" apps/web/src apps/web/test | wc -l` in `0`; `pnpm --filter web test` exit 0.

### Task 4.5 — Cổng học viên
- Target files: 4 component student ở trên + test.
- Steps: `meetUrl` → `joinUrl`; nhãn "Vào lớp (Google Meet)" → "Vào lớp (Zoom)"; cạnh nút "Xem recording", nếu có `recordingPassword` thì hiện "Mật khẩu: <passcode>" (chữ nhỏ, `font-mono`) và nút copy có `aria-label="Sao chép mật khẩu recording"`. Cập nhật test tương ứng.
- Verify: `pnpm --filter student test` exit 0; `grep -rn "Google Meet\|meetUrl" apps/student/src | wc -l` in `0`.

### Task 4.6 — Gate typecheck toàn repo
- Verify: `pnpm check-types` exit 0 (đây là lần đầu toàn repo phải xanh lại).

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
