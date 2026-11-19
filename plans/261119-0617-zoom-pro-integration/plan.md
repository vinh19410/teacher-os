---
title: "Tích hợp Zoom Pro qua API (thay Google Meet)"
description: "Mỗi buổi học online có ngày cụ thể tự có Zoom meeting và tự lấy cloud recording; gỡ toàn bộ Google Meet/Calendar/Drive."
status: pending
priority: P1
effort: 3d
issue: 831
branch: vinh19410/feat/zoom-pro-integration
tags: [feature, backend, frontend, database, api]
blockedBy: []
blocks: []
created: 2026-11-19
---

# Tích hợp Zoom Pro qua API (thay Google Meet)

## Overview

Mỗi buổi học online có ngày cụ thể tự có Zoom meeting và tự lấy cloud recording; gỡ toàn bộ Google Meet/Calendar/Drive (đăng nhập Google giữ nguyên). Giáo viên vẫn tự điểm danh sau buổi như hiện nay.
Issue: [#831](https://github.com/vinh19410/teacher-os/issues/831). Nguồn quyết định: `plans/reports/brainstorm-261119-0509-zoom-pro-integration.md` và Validation Log bên dưới.

**Handover contract (`--advice`):** mỗi phase gồm task có Goal / Target files / Steps / Success criteria / Verify, và một khối `## Failure Protocol` riêng. Executor dừng khi một Verify không đạt — đó là hành vi đúng, không phải kẹt.

## Quyết định đã chốt

1. Thay hẳn Google Meet (không đa provider).
2. Server-to-Server OAuth, một license Zoom Pro, một host `ZOOM_HOST_USER` (mặc định `me`); không cảnh báo trùng giờ.
3. Phạm vi: tạo link tự động + cloud recording. **Không** tự điểm danh qua Zoom.
4. Link chung cho cả lớp, không registration; học viên vào được trước giáo viên, không phòng chờ.
5. Không làm webhook; dùng cron `*/10 * * * *` có sẵn.
6. Phòng bị mở lại giữa buổi (nhiều phiên): chỉ lấy recording phiên cuối — giới hạn đã biết.
7. Giữ nguyên chữ "Google Meet" trong form landing (`packages/api/src/lead-contracts.ts`).

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [DB, contracts và cấu hình Zoom](./phase-01-db-contracts-config.md) | Pending |
| 2 | [Zoom API client + fake](./phase-02-zoom-api-client.md) | Pending |
| 3 | [Service, routes, cron, E2E boot; gỡ Google Meet](./phase-03-server-service-routes-cron.md) | Pending |
| 4 | [UI giáo viên và học viên](./phase-04-web-student-ui.md) | Pending |
| 5 | [E2E spec, gates, docs, ship-ready](./phase-05-e2e-gates-docs.md) | Pending |

Tuần tự 1 → 5. Typecheck toàn repo được phép đỏ từ phase 1 đến hết phase 4 (Task 4.6 là lần đầu phải xanh lại); test của từng package vẫn phải xanh ở từng phase.

## Success Criteria (Done means)

- [ ] Migration D1 chuyển `class_session_meeting` sang cột Zoom, bỏ cột Google; test db/api pass.
- [ ] Thiếu secret Zoom: app vẫn chạy, nút tạo trả `ZOOM_NOT_CONFIGURED`, cron bỏ qua êm.
- [ ] Tạo/sửa/huỷ/dời/bù lễ buổi online tạo/cập nhật/xoá đúng Zoom meeting; join URL mirror vào `class_session.zoom` / `lesson.zoom`; có nút tạo đơn lẻ và hàng loạt.
- [ ] Meeting tạo dưới `ZOOM_HOST_USER`, `auto_recording: "cloud"`, `join_before_host: true`, không phòng chờ, không registration.
- [ ] Cron gán recording (share URL + mật khẩu) với `pending/ready/failed`; UI hiện lỗi khi `failed`; nút đồng bộ tay chạy.
- [ ] Không còn code/scope/UI Google Meet/Calendar/Drive (trừ copy landing đã giữ); đăng nhập Google vẫn pass test.
- [ ] Web + student hiện "Vào lớp (Zoom)" và "Xem recording" kèm mật khẩu ở 3 viewport.
- [ ] `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`, spec E2E `zoom-meeting.spec.ts` pass.

## Dependencies

- Secret thật trên GitHub (Repository hoặc environment `staging`/`production`): `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`; variable `ZOOM_HOST_USER` (tuỳ chọn). App S2S trên Zoom Marketplace cần scopes: `meeting:write:meeting:admin`, `meeting:update:meeting:admin`, `meeting:delete:meeting:admin`, `meeting:read:meeting:admin`, `cloud_recording:read:list_recording_files:admin` (đối chiếu tên granular scope trên Marketplace khi tạo app).
- Tiền đề: Google Meet #816 (đang trên `develop`, chưa lên `main`). Không plan nào khác chặn.

## Validation Log

### Session 1 — 2026-11-19 (kongming review + câu hỏi người dùng)

Kongming (advisory, Fable) tìm 8 lỗi chặn. Tất cả đã sửa trong phase:
- E2E boot import file đã xoá → chuyển sang Task 3.7, thêm `pnpm --filter e2e check-types` vào 3.9.
- Migration bỏ cột có FK sẽ dựng lại bảng, không sinh `DROP COLUMN` → sửa Verify 1.1 (đã đối chiếu tiền lệ `0073`).
- `Config.Redacted` không combine với `withDefault` → dùng `Config.String` (đã đối chiếu comment ở `alchemy.run.ts` ~241).
- Grep `googleapis.com/auth` chạy sớm hơn phase dọn web → thu hẹp ở 3.6, grep toàn repo ở 4.2.
- `auth-role-roundtrip.test.ts` assert `select_account consent` → thêm bước sửa bắt buộc ở 3.6 (đã đối chiếu ~226).
- Grep web chạy trước khi dọn Hồ sơ → đổi thứ tự (4.2 trước 4.4).
- `lead-contracts.ts` khớp regex "Google Meet" → loại trừ trong Verify 5.2.
- Ship note sai: prod chưa có bảng (commit #816 chưa lên `main`, đã kiểm `git merge-base`) → sửa ở phase 5.
- Thêm: `settings` meeting tường minh, cắt topic ≤200, phân biệt 429 theo ngày/theo giây, test bù lễ, UI hiện `recordingError`, bỏ route status không dùng.

Câu hỏi người dùng:
1. Giáo viên bắt đầu buổi thế nào? → **Cho học viên vào trước host** (`join_before_host: true`, không phòng chờ).
2. Ngưỡng tự điểm danh? → **Bỏ tự điểm danh qua Zoom**, giáo viên tự điểm danh sau buổi. Đã xoá phase điểm danh, cột/kiểu participants và scope đọc participants.
3. Phòng mở lại nhiều phiên? → **Ghi là giới hạn**, chỉ lấy phiên cuối.
4. Copy landing "Google Meet"? → **Giữ nguyên**.

Mặc định không hỏi: dung lượng cloud Pro đầy → recording `failed`, giáo viên tự dọn trên Zoom (khớp non-goal "không quản lý dung lượng từ app"), ghi vào docs.

Whole-plan sweep: 5 phase file đều có Failure Protocol; đường dẫn đối chiếu bằng `grep`/`ls` trong session; không còn tham chiếu tới phase điểm danh. Kết luận: sẵn sàng cook.
