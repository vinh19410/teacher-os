---
phase: 1
title: "Schema + migration 0011/0012 + backfill test"
status: pending
priority: P0
effort: "4h"
dependencies: []
---

# Phase 1: Schema + migration 0011/0012 + backfill test

## Overview

Cho `session_package` tồn tại mà không cần enrollment: thêm `studentId` NOT NULL
FK→student (ON DELETE cascade), hạ `enrollmentId` về nullable, thêm index mới.
Viết tay migration (tách 0011 recreate+backfill / 0012 partial index), bảo vệ bằng
test existing-data migration theo raw-execute pattern. Kèm nhiệm vụ cập nhật corpus
comment invariant-6 đang phát biểu ngược schema mới.

## Requirements

- Functional: gói buổi (total/price/mode) persist được cho học viên không có lớp.
- Non-functional: forward-only migration an toàn trên data thật (D1, apply không
  transactional); COUNT session_package trước/sau bằng nhau; không đụng
  enrollment/lesson; generate diff rỗng sau khi snapshot khớp.

## Architecture

`session_package` là bảng lá (không table nào FK tới nó — đã grep xác minh) →
table-recreate (pattern `0006_pink_ender_wiggin.sql`: `__new_` → INSERT SELECT →
DROP → RENAME) an toàn. `studentId` trở thành nguồn sự thật của sở hữu gói;
`enrollmentId` chỉ còn là "attachment tùy chọn vào lớp".

**Tại sao phải có anti-orphan guard:** `enrollment_id NOT NULL` chỉ bảo đảm
non-null, KHÔNG bảo đảm referential integrity (SQLite FK cần `PRAGMA
foreign_keys=ON`; không gì chặn DELETE tay qua D1 console). Orphan row + backfill
INNER JOIN = mất tiền im lặng, forward-only. Guard là statement ĐẦU TIÊN của 0011:
INSERT-SELECT orphan rows (LEFT JOIN enrollment IS NULL) vào bảng tạm cột NOT NULL
— có orphan ⇒ fail ⇒ migration dừng trước khi đụng data, retry an toàn.

**Tại sao tách 0012:** alchemy apply migration KHÔNG transactional (statement-level
autocommit; ledger INSERT nằm cuối chuỗi — Evidence: alchemy `ApplyMigrations.js:31-36`).
Partial unique index là statement DUY NHẤT chưa từng chạy trên D1; nếu nó fail trong
cùng file với recreate, mọi deploy kế tiếp wedge ("table already exists"). Tách riêng
⇒ fail của nó không đụng data.

## Related Code Files

- Modify: `packages/db/src/schema/session-package.ts` (schema + comment invariant)
- Modify: `packages/db/src/schema/student.ts:7` (comment "keyed by enrollment" → keyed by student)
- Create: `packages/db/src/migrations/0011_*.sql` (guard + recreate + backfill + old indexes + org_student idx)
- Create: `packages/db/src/migrations/0012_*.sql` (chỉ partial unique parked index)
- Create: `packages/db/src/migrations/meta/0011_snapshot.json` + `0012_snapshot.json`
  (BẮT BUỘC — thiếu thì lần `db:generate` kế tiếp diff chống 0010_snapshot stale và
  sinh table-recreate thứ hai phá data) + cập nhật `meta/_journal.json`
- Create: migration test (raw `client.execute` + `applyThrough`/`applyFile` pattern
  của `apps/server/src/comment-bank-existing-data-migration.test.ts:29-47`) — đặt
  tại `apps/server/src/session-package-parked-migration.test.ts` cạnh pattern
- Reference (đọc, không sửa): `packages/db/src/migrations/0006_pink_ender_wiggin.sql`,
  `packages/db/drizzle.config.ts`, `packages/db/package.json` (`db:generate`)

## Implementation Steps (TDD)

1. **Tests Before** — migration test theo raw-execute pattern (KHÔNG libsql
   migrator — nó apply-all, không dừng tại 0010 để seed):
   - `applyThrough(client, "0010_*.sql")`; seed **2 students + 2 classes +
     2 enrollments + 2 packages** (mỗi package kèm MỘT enrollment — 2 packages trên
     1 enrollment vi phạm `session_package_enrollment_uq` sẵn có, không seed được);
   - case A (guard): seed thêm 1 package orphan (`enrollment_id` trỏ enrollment
     không tồn tại — FK off trong libsql test nên seed được) → `applyFile("0011")`
     PHẢI fail (guard trips); dọn orphan → apply lại thành công;
   - case B (backfill): trên data sạch, assert (a) COUNT(session_package) trước/sau
     bằng nhau; (b) từng row `student_id` khớp `enrollment.student_id` của nó;
     (c) `total/price/mode` giữ nguyên;
   - case C (index): sau 0012, insert 2 package parked (`enrollment_id IS NULL`)
     cùng `student_id` → vi phạm partial unique; `sqlite_master` có đủ
     `session_package_enrollment_uq`, `session_package_org_idx`,
     `session_package_org_student_idx`, `session_package_parked_student_uq`.
2. **Schema TS trước, generate 2 lượt (recipe kongming — không phẫu thuật journal tay)**:
   - (a) sửa `session-package.ts` (studentId NOT NULL FK `onDelete: "cascade"`;
     enrollmentId nullable; giữ nguyên 2 index cũ + thêm `org_student` idx) +
     comment invariant ("Package belongs to a student; enrollment is the optional
     class attachment") — CHƯA thêm partial unique → `pnpm --filter db db:generate`
     ra 0011 (journal + 0011_snapshot do tool sinh);
   - (b) thêm `.where(sql\`enrollment_id is null\`)` vào partial unique trong schema
     → `db:generate` lần 2 ra 0012 + 0012_snapshot;
   - (c) tay thay THÂN SQL 0011 bằng bản viết tay: anti-orphan guard (statement
     đầu) → recreate → backfill `INSERT INTO __new_... (..., student_id, ...) SELECT
     sp..., e.student_id FROM session_package sp INNER JOIN enrollment e ON
     e.id = sp.enrollment_id` → tạo lại TOÀN BỘ index cũ + org_student idx — giữ
     nguyên các marker `--> statement-breakpoint` giữa statements (cả libsql
     migrator lẫn raw-execute test đều split theo marker này). SQL 0012 giữ nguyên
     của tool. KHÔNG đụng `_journal.json` hay copy snapshot tay.
   - (d) Nếu hỏng giữa chừng (migrator không thấy file / generate diff bất thường):
     `git checkout HEAD -- packages/db/src/migrations` và làm lại theo recipe,
     không sửa state nửa vời.
   - (e) Chạy NGAY cuối Phase 1: migration test + kernel suite + generate trên tree
     sạch ra diff rỗng (git status migrations rỗng) — không defer sang Phase 3.
3. **Comment sweep (phần schema)**: `student.ts:7` đổi "keyed by enrollment" thành
   keyed by student; `session-package.ts:12-16` viết lại invariant 6 mới.
4. **Verify** (Regression Gate): migration test xanh; `pnpm --filter server test`
   (suite cũ phải còn xanh trừ test đóng băng bug `kernel.test.ts:755` — Phase 2
   viết lại, fail có chủ đích được ghi nhận); `pnpm check-types` có thể đỏ tại
   `students.ts:52` — được Phase 2 xử lý ngay đầu (không commit bỏ lửng: Phase 1+2
   land cùng PR, CI chỉ chạy trên đầu nhánh).

## Todo

- [x] Migration test raw-execute (guard orphan case + backfill asserts + index asserts)
- [x] Schema TS + comment invariant mới
- [x] Generate lấy journal/snapshots → viết tay SQL 0011 → journal/snapshot đầy đủ
- [x] `drizzle-kit generate` trên tree sạch cho diff rỗng (kiểm tay bằng git status)
- [x] `pnpm --filter server test` xanh (trừ :755 fail có chủ đích)

## Success Criteria

- [x] Guard chặn orphan (case A fail-then-pass), backfill đúng (case B), index đầy đủ (case C)
- [x] meta/ có snapshot cho TẤT CẢ journal entries (không thiếu 0011/0012)
- [x] Suite server hiện tại không regression mới (trừ :755 đã ghi nhận)

## Risk Assessment

R1 (chết người): backfill sai trên data thật. Response: guard anti-orphan đầu file;
test seed pre-0011 (gồm orphan); ledger-check + destroy/recreate staging nếu 0011
bản cũ từng apply (bẫy rehearsal-stale — alchemy skip theo tên,
`ApplyMigrations.js:27`); checksum 0011 vào PR description; baseline COUNT trước deploy.
Giả định D1 nhận partial index — tín hiệu vỡ: 0012 fail staging; response: KHÔNG sửa
0012 (đã apply theo tên), ship 0013 fallback unique thường `(student_id,
enrollment_id)` + staging destroy/recreate, escalate kongming nếu vẫn fail.
