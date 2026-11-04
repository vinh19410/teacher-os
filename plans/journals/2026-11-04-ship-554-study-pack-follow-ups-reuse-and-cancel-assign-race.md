---
title: Ship 554 study-pack follow-ups reuse and cancel-assign race
date: 2026-11-04
summary: "Hoàn tất 5 hạng mục follow-up #554: snapshot 0060, unique clone 0061, chống nhân đôi khi reuse, khóa nguyên tử race hủy/gán và runbook rollback."
---

# Ship 554 study-pack follow-ups reuse and cancel-assign race

## What happened
Hoàn tất triển khai, kiểm thử TDD, review độc lập (`LocalCodeReviewer`: Approved, 0 Critical / 0 Important / 2 Minor — đã xử lý trọn 2/2 Minor) và đồng bộ `origin/develop` cho issue #554:
- Bổ sung `packages/db/src/migrations/meta/0060_snapshot.json` (`prevId` nối liền từ `0059`) và sinh migration `0061_petite_dormammu.sql` tạo unique index `study_pack_org_source_pack_uq` trên `study_pack(org_id, source_pack_id)`.
- Bọc `db.batch` trong `POST /api/study-packs/:id/clone` bằng `try/catch` + re-`SELECT` bản ghi thắng cuộc theo `(orgId, sourcePackId)` để hai request chạy song song trả cùng `pack.id` với HTTP `201`.
- Giữ nguyên `study_pack_item.id` cho các bộ `(dayIndex, sourceKind, sourceId)` không đổi khi `PUT /api/study-packs/:id` và `PUT /api/admin/library/packs/:id`; đóng băng `class_assignment` ở cả nhánh `existingActive` lẫn `raced` của `assignStudyPackToClass`, chỉ backfill `class_assignment_target` cho bài còn hạn (`due_at > now`), đồng thời giữ chặn `404` ngay lập tức khi system pack chuyển về `draft`.
- Gộp `cancelClassStudyPack` thành 1 `db.batch` nguyên tử theo `packRow.cancelledAt ?? now`; bọc `executeBatchedStatements` bắt lỗi FK trên D1 và hậu kiểm `status === 'cancelled'` (dọn sạch toàn bộ bài chưa làm với `cutoff = null` khi `createdFresh || assignmentValues.length > 0`, trả `409 "study pack was cancelled"`), cập nhật `ClassStudyPackSection` hiển thị đúng thông báo và làm mới danh sách.
- Bổ sung hướng dẫn pre-flight chống trùng `(org_id, source_pack_id)` và lưu ý rollback `0060`–`0061` (cấm `DROP INDEX study_pack_org_source_pack_uq` thủ công trên D1) vào `docs/production-release-runbook.md`.

## Decision
Tách commit rõ ràng giữa migration/schema (`0060_snapshot.json`, `0061_petite_dormammu`) và logic server/web/docs để dễ review và truy vết lịch sử migration.

## Next steps
Mở PR beta vào `develop`, chạy `/ak-review-pr --fix --reply --advice`, chờ CI `develop` xanh và thực hiện cổng review hậu PR bắt buộc của Kongming. Trước khi promote `develop` lên `staging`/`main`, người vận hành cần chạy truy vấn pre-flight kiểm tra trùng `(org_id, source_pack_id)` trên D1 theo runbook.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
