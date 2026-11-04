---
title: Plan 554 study-pack follow-ups after release 553
date: 2026-11-04
summary: "Chốt kế hoạch 3 phase TDD + handover (Red-Team RT-1..RT-6 & Kongming GO) cho các bản sửa study-pack #554."
---

# Plan 554 study-pack follow-ups after release 553

## What happened
Hoàn tất điều tra nguyên nhân gốc (/ak-debug), tham vấn Kongming và lập kế hoạch 3 phase TDD + handover (`plans/261104-0018-554-study-pack-followup`) cho issue #554 (follow-up từ review release PR #553).

Ba subagent Red-Team đối kháng (`RedTeamSecurity`, `RedTeamAssumption`, `RedTeamFailure`) đã rà soát chéo toàn bộ plan với codebase thực tế và phát hiện 6 điểm tinh chỉnh quan trọng (RT-1..RT-6):
- Bật `PRAGMA foreign_keys = ON` trong Vitest `libsql` và bắt lỗi FK quanh `executeBatchedStatements` để chuyển tình huống hủy bộ đề xen giữa các batch trên D1 thành `409 "study pack was cancelled"` thay vì nổ `500`.
- Phân tách rõ `cutoff = null` (xóa toàn bộ bài chưa làm kể cả Ngày 1 cho lượt gán mới `createdFresh` bị hủy giữa chừng) với `cutoff = packRow.cancelledAt ?? now` cho `cancelClassStudyPack` và nhánh `reused`.
- Đồng nhất đóng băng `existingAssignments` ở cả `existingActive` lẫn `raced`, lọc `due_at > now` khi backfill target, giữ nguyên chặn `404` cho system pack `draft`, và cập nhật thông báo `409` trên `ClassStudyPackSection`.
- Đính chính cơ chế `PROBE_QUERY` của `apps/server/src/routes/readiness.ts` đối với index cộng thêm của `0061` (cấm `DROP INDEX` thủ công trên D1) và bổ sung câu lệnh `UPDATE study_pack SET source_pack_id = NULL` cho pre-flight tránh vướng `ON DELETE restrict`.

## Decision
Chốt thực thi 3 phase theo thứ tự: Phase 1 (`0060_snapshot.json` -> `0061` unique index `study_pack_org_source_pack_uq` -> `try/catch` + re-SELECT trong route clone), Phase 2 (giữ `study_pack_item.id` khi `PUT`, đóng băng `class_assignment` ở `reused`/`raced`, gộp `cancelClassStudyPack` thành 1 `db.batch` nguyên tử + hậu kiểm hủy trong `assignStudyPackToClass` + UI `409`), Phase 3 (runbook rollback & cổng kiểm chứng toàn bộ repo).

## Next steps
Cập nhật trạng thái issue #554 sang `in progress`, chạy `/ak-fix --auto --advice` bám sát từng cổng TDD Red/Green, review local và mở PR về `develop`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
