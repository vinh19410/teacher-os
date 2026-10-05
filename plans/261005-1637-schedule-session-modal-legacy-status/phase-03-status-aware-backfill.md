---
phase: 3
title: "Backfill xếp theo trạng thái + gắn ngày dữ liệu legacy"
status: pending
effort: "0.5d"
---

# Phase 3 — Backfill xếp theo trạng thái

## Context

- `packages/api/src/skeleton.ts:242-320` — `buildBackfillPlan`: trong mỗi bucket `(enrollmentId, weekday)` sort `(createdAtMs, seq)` rồi row thứ k nhận ngày thứ k của skeleton. Không xét `status`.
- UI legacy (`class-sessions.ts` `slotStatsBySid` + `sidStateAt`) hiển thị completed là prefix đầu, rồi cancelled, rồi upcoming → giáo viên đã điểm danh theo ngữ nghĩa đó, nhưng server ghi vào row tuỳ ý.
- Dry-run D1 local hiện tại: Lớp Test 1 `STAMPED`; row completed Học viên 2 (`23380cf2…`) → `2026-11-03` (sai), Học Viên 1 (`a120c595…`) → `2026-08-25`.
- CLI `apps/server/scripts/backfill-date.ts`; runbook `docs/production-release-runbook.md` Step B (~dòng 414). Dump lesson phải là **toàn bảng**.
- Test: `apps/server/src/skeleton-parity.test.ts` (`describe("buildBackfillPlan…")` ~dòng 582).
- D1 local: `packages/infra/.alchemy/local/d1/cloudflare-runtime-D1DatabaseObject/<hash>.sqlite`.

## Requirements

1. `BackfillLessonInput` thêm `status: string`. Sort trong bucket: rank `completed`=0, `cancelled`=1, còn lại=2; tie-break `(createdAtMs, seq)` như cũ. Cập nhật JSDoc giải thích bất biến "khớp prefix của renderer legacy (`sidStateAt`)".
2. `backfill-date.ts`: đọc `status` từ dump; cập nhật usage + query dump trong JSDoc.
3. Runbook Step B: query dump lesson thêm `l.status`; thêm truy vấn read-only phát hiện dữ liệu đã backfill sai trước đây:
   ```sql
   SELECT class_id, enrollment_id, date FROM lesson
   WHERE status = 'completed' AND date > '<today VN>';
   ```
   Ghi rõ: kết quả > 0 trên prod/staging cần operator quyết định sửa tay (không tự động trong plan này).
4. Chạy cho **D1 local** (sau khi phase 1 merge):
   - Dừng dev stack (tránh WAL lệch), backup bằng `sqlite3 <db> ".backup /tmp/teacher-os-d1-pre-backfill-261005.sqlite"`; ghi đường dẫn backup vào report. Không đưa file DB vào repo.
   - Dump toàn bảng (`class`, `lesson` + `status`) → chạy CLI → review SQL → apply bằng `sqlite3` (hoặc `wrangler d1 execute --local`).
   - Verify: `SELECT COUNT(*) FROM lesson WHERE date IS NULL` = 0 cho lớp conform; row completed của cả 2 HV Lớp Test 1 có `date = '2026-08-25'`; không row completed nào có `date > today`.

## Files

- Modify: `packages/api/src/skeleton.ts`, `apps/server/scripts/backfill-date.ts`, `docs/production-release-runbook.md`
- Tests: `apps/server/src/skeleton-parity.test.ts`

## Steps

1. Test trước: bucket 1 enrollment × 3 row Thứ Ba, row completed có `createdAt` muộn nhất → nhận ngày đầu skeleton; completed + cancelled + upcoming → thứ tự ngày completed < cancelled < upcoming; tie-break createdAt giữ nguyên khi cùng status. Test cũ phải xanh (fixture cũ không có status → thêm `status: "upcoming"`).
2. Implement sort + CLI + runbook.
3. `pnpm --filter server test`, `pnpm check-types`, rebuild `packages/api` nếu `dist` được dùng bởi script.
4. Backup + chạy backfill D1 local, verify bằng SQL ở Requirements 4.
5. Mở lại popup Lớp Test 1 06/10 và 25/08 trên dev stack → giống kết quả phase 1 (giờ đi đường v2).

## Validation

- Dry-run sau sửa: `grep 23380cf2 out.sql` → `2026-08-25`.
- AC trong `plan.md` về backfill + popup sau backfill.

## Risks

- Prod/staging có thể đã backfill bằng thuật toán cũ → plan chỉ cung cấp truy vấn phát hiện; sửa dữ liệu prod là quyết định riêng.
- Ghi đè DB local sai: luôn backup trước, SQL idempotent (`AND date IS NULL`).
