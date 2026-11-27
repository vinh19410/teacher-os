# Ship official release v0.0.29 (develop → main)

**Date:** 2026-11-27

## Phạm vi

Promote các thay đổi trên `develop` lên `main`, bump 0.0.28 → 0.0.29: #994 reup recording Zoom lên R2 (xoá sau 90 ngày), #998 trang chi tiết buổi học + cắt PDF, #1010 và #1013 thiết kế lại trang lớp của học viên, #958 (migrations 0095–0096).

## Quá trình

- Gộp `origin/main` vào `develop`: 3 file xung đột (`CHANGELOG.md`, `apps/server/src/routes/syllabus.ts`, `apps/server/src/curriculum-overwrite.test.ts`); cây sau gộp trùng khớp `origin/develop`.
- Review trước phát hành: 0 Critical, 4 High về recording/cron. Sửa 3 trong `41c462e4` (link tay xoá video R2; nhắc hạn chạy sau Zoom sync; Trash cả recording khi buổi nhiều đoạn). Xoá/dời buổi làm mất video để lại #1015; giới hạn runtime cron và link bản gốc nhiều đoạn để lại #1016. Review lại: đã đóng đúng phạm vi.
- Gate local sau khi sửa: `pnpm exec biome check .` exit 0 (153 warning / 16 info), `pnpm check-types` 14/14, `pnpm test` 13/13 task (server 1913 qua + 1 expected fail, web 2559 qua). Không chạy full E2E ở local.

## Điểm cần lưu ý

- Người dùng tự backup D1 prod trước khi merge — máy này không có credential Cloudflare nên agent không làm thay được.
- Chưa tạo PR, chưa merge, chưa deploy. Còn mở #1015 và #1016: recording R2 vẫn có thể mất khi xoá/dời buổi.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
