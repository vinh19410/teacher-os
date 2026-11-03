---
phase: 2
title: "Tài liệu, runbook và roadmap"
status: completed
priority: P2
effort: "1h"
dependencies: [1]
---

# Phase 2: Tài liệu, runbook và roadmap

## Goal

Người vận hành biết cách set `TEACHER_EMAILS` an toàn trước khi deploy production. Roadmap phản ánh định hướng mới: phục vụ một giáo viên trước, thương mại hoá sau khi qua cổng rõ ràng.

## Files to Create / Modify

- Modify: `packages/infra/.env.example`
- Modify: `docs/production-release-runbook.md`
- Modify: `docs/project-roadmap.md`
- Modify: `CHANGELOG.md` (theo format mục gần nhất)

## Tasks

### Task 2.1 — `.env.example`

- Goal: binding mới có tài liệu ngay cạnh `ADMIN_EMAILS`.
- Target: `packages/infra/.env.example`, ngay dưới khối `#ADMIN_EMAILS=...`.
- Steps: thêm khối comment tiếng Việt: "Danh sách email giáo viên được dùng app (single-org). Rỗng = không giới hạn (dev/e2e/staging). Production BẮT BUỘC set, alchemy ném lỗi nếu rỗng. So khớp lowercase, kiểm lại mỗi request." Kèm dòng `#TEACHER_EMAILS=owner@example.com`.
- Success criteria: không có email thật trong file.
- Verify: `grep -c "TEACHER_EMAILS" packages/infra/.env.example` in ra số lớn hơn hoặc bằng 1.

### Task 2.2 — Runbook production

- Goal: runbook có binding mới và bước kiểm tra trước deploy.
- Target: `docs/production-release-runbook.md`, hai bảng đang có dòng `ADMIN_EMAILS` (khoảng dòng 26 và 885) và mục các bước deploy gần dòng 890.
- Steps:
  1. Thêm dòng `TEACHER_EMAILS` vào từng bảng, mô tả: bắt buộc trên production (deploy fail nếu rỗng), rỗng ở môi trường khác là không giới hạn, kiểm mỗi request ở kernel và ở hook sign-up.
  2. Thêm bước trước deploy: chạy truy vấn đọc `SELECT email, created_at FROM user WHERE role = 'teacher';` trên D1 production và đặt `TEACHER_EMAILS` trên GitHub Environment `production` (`gh variable set TEACHER_EMAILS --env production --body "<email>"`) đúng email của chủ app như trong kết quả. Tài khoản teacher khác trong kết quả sẽ bị chặn bởi gate mỗi request; không xoá dữ liệu trong bước này. <!-- Updated: Red Team RT-1 -->
  3. Thêm cách rollback: đổi hoặc bổ sung email trong binding rồi deploy lại; không cần migration.
- Success criteria: không có email thật hay ID database trong runbook.
- Verify: `grep -c "TEACHER_EMAILS" docs/production-release-runbook.md` in ra số lớn hơn hoặc bằng 3.

### Task 2.3 — Roadmap

- Goal: roadmap ghi quyết định 2026-10-31 và cổng thương mại hoá.
- Target: `docs/project-roadmap.md`, mục "Phạm vi đã chốt" và "Định hướng quý sau".
- Steps:
  1. Trong "Phạm vi đã chốt", ngay dưới đoạn "Đổi định hướng 2026-10-25", thêm đoạn "Đổi định hướng 2026-10-31": app chạy single-org theo chính sách (allowlist `TEACHER_EMAILS`), chỉ chủ app dùng app giáo viên và chỉ học viên của chủ app dùng portal. Schema multi-org được giữ để thương mại hoá sau. Link tới plan này.
  2. Trong "Định hướng quý sau": giữ giai đoạn A (AI trợ giảng) nhưng ghi rõ **A0 (gói subscription/credit theo org) hoãn**; AI dùng cho chủ app, không tính tiền theo gói. Đánh dấu **giai đoạn C hoãn** tới khi qua cổng thương mại hoá.
  3. Thêm mục "Cổng thương mại hoá" với các tiêu chí đề xuất (user chỉnh lại sau): (a) chủ app vận hành lớp thật liên tục ít nhất 8 tuần; (b) 4 tuần liền không có lỗi chặn vận hành (lỗi khiến phải quay về làm tay); (c) các việc lặp lại hằng tuần (điểm danh, thu phí, giao và chấm bài) đều làm trên app, không còn sổ tay hay bảng tính song song. Khi qua cổng: bỏ fail-closed của `TEACHER_EMAILS`, rồi mở lại A0 và C.
- Success criteria: không xoá nội dung lịch sử của các mốc M1–M5.
- Verify: `grep -c "2026-10-31" docs/project-roadmap.md` in ra số lớn hơn hoặc bằng 1, và `grep -c "Cổng thương mại hoá" docs/project-roadmap.md` in ra số lớn hơn hoặc bằng 1.

### Task 2.4 — Changelog

- Goal: changelog ghi thay đổi cho người dùng.
- Target: `CHANGELOG.md`, theo format của mục mới nhất.
- Steps: thêm một dòng tiếng Việt: "App giáo viên chỉ cho phép email trong danh sách `TEACHER_EMAILS` (bắt buộc trên production)."
- Verify: `pnpm exec biome check .` exits 0.

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
