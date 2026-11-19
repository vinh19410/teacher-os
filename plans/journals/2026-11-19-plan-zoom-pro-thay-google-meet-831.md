---
title: "Plan Zoom Pro thay Google Meet (#831)"
date: 2026-11-19
summary: Lập plan 5 phase thay Google Meet bằng Zoom Pro S2S OAuth; kongming bắt 8 lỗi Verify trước khi giao executor
---

# Plan Zoom Pro thay Google Meet (#831)

## What happened
- Brainstorm rồi lập plan `plans/261119-0617-zoom-pro-integration` (5 phase, handover `--advice`) để thay Google Meet (#816, chưa lên `main`) bằng Zoom Pro qua Server-to-Server OAuth.
- Bản nháp đầu có 6 phase gồm tự điểm danh từ participants Zoom. Kongming review tìm 8 lỗi chặn mà executor yếu sẽ kẹt:
  - bỏ cột có FK (`google_owner_user_id`) khiến drizzle-kit dựng lại bảng, không sinh `DROP COLUMN`;
  - `Config.Redacted` không combine với `withDefault` (comment sẵn ở `alchemy.run.ts`);
  - `apps/e2e/src/boot.ts` import file Google Meet bị xoá ở phase 3, nên e2e typecheck đỏ tới phase 6;
  - `auth-role-roundtrip.test.ts` assert `prompt === "select_account consent"`;
  - vài lệnh grep Verify chạy trước phase dọn file tương ứng;
  - `lead-contracts.ts` khớp regex "Google Meet";
  - ship note giả định prod đã có bảng `class_session_meeting`, sai vì commit #816 chưa lên `main`.

## Decision
- Một host `ZOOM_HOST_USER`, link chung, `join_before_host: true`, không phòng chờ, cron poll thay webhook.
- Người dùng bỏ tự điểm danh qua Zoom: auto `present` sẽ trừ buổi trong gói, giáo viên tự điểm danh sau buổi.
- Nhiều phiên trong một buổi: chỉ lấy recording phiên cuối, ghi là giới hạn đã biết. Giữ copy landing "Google Meet".

## Next steps
- `/ak-cook plans/261119-0617-zoom-pro-integration/plan.md --advice`.
- Trước deploy: tạo app S2S trên Zoom Marketplace và thêm secret `ZOOM_*` lên GitHub.
- Commit plan: 81d955e4 trên `develop`; issue #831.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
