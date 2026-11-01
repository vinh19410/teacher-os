---
phase: 5
title: "Phase 5: UI giáo viên, kiểm chứng học viên & E2E"
status: pending
priority: P1
effort: "3h"
dependencies: [2, 3, 4]
---

# Phase 5: UI giáo viên, kiểm chứng học viên & E2E

## Goal

Giáo viên quản lý bộ đề và gán vào lớp bằng giao diện; học viên thấy bài đúng lịch; E2E chứng minh không cần cron.

## Files

- Create: `apps/web/src/routes/_auth/assignments/packs/*` (danh sách + trình soạn bộ đề: tab "Của tôi"/"Thư viện", nút Nhân bản), `apps/web/src/components/classes/class-study-pack-section.tsx` (+ test)
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx` (thay mục "Kế hoạch tự học" của #526 bằng mục "Bộ đề tự học": danh sách pack đã gán + dialog gán gồm chọn pack, ngày bắt đầu, giờ mở, giờ hạn, xem trước lịch bỏ ngày nghỉ, huỷ)
- Create: `apps/e2e/specs/study-pack.spec.ts`
- Đọc trước khi sửa UI: `DESIGN.md`, `REVIEW.md`; mẫu filter `apps/web/src/components/ui/chip-filter.tsx`

## Tasks

1. UI bộ đề theo token `DESIGN.md`; picker chỉ cho kỹ năng được phép; trạng thái rỗng/lỗi/loading; focus bàn phím; tiếng Việt, ngày `dd/mm/yyyy`.
2. Dialog gán: mặc định `06:00`/`17:00`, xem trước bảng "ngày → bài" và ngày nghỉ bị bỏ; toast xác nhận/lỗi (precedent #522).
3. Giữ test hiện có của `$classId` (không thêm `role="tab"`, chỉ fetch khi mở mục — như #526).
4. E2E (libsql, port 8100/8101/8103/8104/8105 theo `AGENTS.md`): giáo viên tạo pack grammar + reading → gán lớp bắt đầu hôm nay → học viên thấy bài hôm nay, **không** thấy bài ngày mai (dịch `now` bằng cơ chế e2e sẵn có hoặc seed `available_at`); mở quiz bài chưa mở → 404; làm bài grammar được chấm tự động; học viên vào lớp sau nhận bài còn hạn.
5. Verify UI 3 viewport (1440×900, 768×1024, 375×812) + `pnpm design:compare`; chạy full Playwright suite trước khi merge (memory: full e2e before merge).

## Verify

`pnpm --filter web test`, `pnpm --filter e2e e2e`, `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`.

## Docs

Cập nhật `docs/` và `CHANGELOG.md` (hành vi người dùng: bộ đề, bỏ cron/thông báo, kỹ năng mới) — đọc file trước khi sửa.
