---
title: "Reup Zoom Cloud Recording lên Cloudflare R2 và tự gỡ sau 90 ngày"
description: "Tự động tải 1 file video MP4 chính của Zoom Cloud Recording sang bucket R2 private (lifecycle 90 ngày), đưa bản gốc trên Zoom vào Trash sau khi lưu R2 + D1 thành công, và phát video trực tiếp trong app Teacher OS."
status: completed
priority: P1
issue: 994
branch: vinh19410/Moved-Recording-Zoom-To-R2
tags: [feature, backend, frontend, database, infra, zoom, r2]
created: 2026-11-26
---

# Reup Zoom Cloud Recording lên Cloudflare R2 (90 ngày)

Issue: [#994](https://github.com/vinh19410/teacher-os/issues/994)
Preview diagram: [advise-261126-1445-zoom-recording-r2-preview.html](../reports/advise-261126-1445-zoom-recording-r2-preview.html)

## Phases & File Ownership

| Phase | Scope | Owned files | Depends on |
|---|---|---|---|
| 1 | Infra R2 `recordings` (lifecycle 90d + abort multipart 1d), D1 schema & migration, Zod contracts, `RecordingStore` + `recordingVideoResponse` + `FsRecordingStore` | `packages/infra/alchemy.run.ts`, `packages/db/src/schema/class-session-meeting.ts`, `packages/db/src/migrations/0097_*`, `packages/api/src/contracts.ts`, `apps/server/src/lib/recording-store.ts`, `apps/server/src/lib/r2-recording-store.ts`, `apps/server/src/lib/recording-video-response.ts`, `apps/e2e/src/fs-recording-store.ts` | — |
| 2A | Server Zoom client (select MP4, safe redirect download, `trashRecording`), `session-zoom-service` (reup max 2/tick, fallback Zoom, retry trash, 90d expiry sweep, manual override cleanup), stream routes (teacher + student Range 206 + IDOR + 410), `scheduled.ts`, `app.ts`, `index.ts`, `boot.ts` & server tests | `apps/server/src/lib/zoom/*`, `apps/server/src/lib/scheduled*`, `apps/server/src/routes/zoom-meeting*`, `apps/server/src/routes/snapshot.ts`, `apps/server/src/routes/student-class.ts`, `apps/server/src/routes/student.ts`, `apps/server/src/routes/kernel.ts`, `apps/server/src/app.ts`, `apps/server/src/index.ts`, `apps/e2e/src/boot.ts` | Phase 1 |
| 2B | Shared `<RecordingPlayerModal>` (`@teacher-os/ui`), teacher web UI (`SessionZoomPanel`, `ClassSessionsSection`, `zoom-meeting.ts`), student portal UI (`ClassLessonList`, `StudentScheduleView`, `student.ts`) & component tests | `packages/ui/src/components/recording-player-modal*`, `apps/web/src/lib/repos/zoom-meeting.ts`, `apps/web/src/components/schedule/session-zoom-panel*`, `apps/web/src/components/class-detail/class-sessions-section.tsx`, `apps/student/src/lib/repos/student.ts`, `apps/student/src/components/class/class-lesson-list*`, `apps/student/src/components/schedule/student-schedule-view*` | Phase 1 |
| 3 | E2E spec `zoom-meeting.spec.ts` + 3-viewport/dark POT capture, docs update (`docs/system-architecture.md`), full local quality gates | `apps/e2e/specs/zoom-meeting.spec.ts`, `docs/system-architecture.md`, `plans/reports/994-*.png` | Phase 2A, 2B |
| 4 | Isolated final review (fix + re-review until clean), PR into `develop` (`--beta`), CI convergence, merge (`--merge`), issue `shipped` + POT comment | GitHub PR & Issue #994 | Phase 3 |

## Acceptance Criteria (Done means)

- [x] Bucket R2 private `recordings` khai báo trong `packages/infra/alchemy.run.ts` với lifecycle 90 ngày (7,776,000 s) và abort multipart 1 ngày (86,400 s), kèm FS adapter trong `apps/e2e/src/boot.ts`.
- [x] Migration D1 (`0097`), schema Drizzle và Zod contracts hỗ trợ metadata R2, hạn 90 ngày, trạng thái `expired` và trạng thái Zoom Trash mà không lộ object key R2 ra client.
- [x] Cron `*/10 * * * *` và nút Đồng bộ tải 1 file MP4 chính từ Zoom sang R2 theo streaming (zero-copy single put hoặc R2 multipart 8 MiB/part), commit D1 rồi mới gọi Zoom `DELETE ?action=trash`; lỗi tải giữ fallback link Zoom và không gọi Trash; buổi cũ không tự backfill nhưng kéo được bằng nút Đồng bộ.
- [x] Route stream video xác thực cho giáo viên và học viên trả đúng 200/206 Range, chặn IDOR (403/404), trả 410 khi hết hạn, có header `CORP: same-site`, `Referrer-Policy: no-referrer`, `INLINE_MEDIA_CSP`, không có tham số tải attachment.
- [x] Cron dọn bản ghi quá 90 ngày xóa object R2 và cập nhật DB sang `expired`; UI giáo viên & học viên mở modal `<video>` player (ẩn nút tải, không hiện mật khẩu Zoom khi nguồn R2, hiện hạn 90 ngày), hiện badge "Đã hết hạn lưu trữ" sau 90 ngày, giữ tương thích link Zoom fallback và "Gán link tay".
- [x] Pass `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`, `pnpm --filter e2e e2e zoom-meeting.spec.ts`, isolated review sạch, PR vào `develop` được merge và có comment POT trên #994.
