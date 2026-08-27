---
title: "Phase 2: DB schema và migration 0009 — backfill copy-on-import"
status: todo
priority: P1
effort: "0.5d"
dependencies: [1]
---

# Phase 2: DB schema và migration 0009 — backfill copy-on-import

> Context: [reports/design-decisions.md](./reports/design-decisions.md) (D3 mục 4-5, assumptions 2/4), [reports/scout-report.md](./reports/scout-report.md) (§4 pointer hiện tại, §8 implication), [reports/research-report.md](./reports/research-report.md) (§4 backfill reuses copy algorithm, §5 edge cases).

## Overview

Viết tiếp block **backfill** vào file 0009 (tạo ở Phase 1, land cùng commit): mỗi class đang có `syllabus_id` ĐÚNG ORG được một bản copy riêng của cây syllabus gốc — copy syllabus row (`class_id` set, `source_template_id` = id gốc), copy modules qua helper mapping table, copy lessons join theo mapping, **preserve status** (khác runtime import — đây là sự thật tiến độ hiện có của lớp, D3.4), rồi `UPDATE class.syllabus_id` trỏ sang copy; cuối cùng reset mọi lesson status của **cây template gốc** về `upcoming` (status là tiến độ lớp, không phải nội dung template — D2.3, red-team F).

Sau phase này migration 0009 hoàn chỉnh: DB pilot migrate xong là ở trạng thái đích của cả feature (phía server/web cũ vẫn đọc được vì pointer vẫn resolve).

## Requirements

- [x] Copy syllabus cho mọi class có `syllabus_id` **cùng org với syllabus gốc** (`AND s.org_id = c.org_id` — red-team D: không join org → copy lệch org = data exposure xuyên org qua snapshot org-scope).
- [x] Id mới sinh trong SQL dạng **UUID 36 ký tự có gạch** khớp format `crypto.randomUUID()` hiện hành (red-team E):
   ```sql
   printf('%s-%s-%s-%s-%s', lower(hex(randomblob(4))), lower(hex(randomblob(2))), lower(hex(randomblob(2))), lower(hex(randomblob(2))), lower(hex(randomblob(6)))))
   ```
   (bỏ claim cũ "randomblob(16) đúng format" — sai; id 32-hex không gạch sẽ trộn 2 namespace format vĩnh viễn).
- [x] Helper table `tmp_module_map(old_id, class_id, new_id)` làm cầu nối module cũ → mới cho lesson copy; DROP sau khi xong.
- [x] Preserve `status` lesson trên COPY, preserve `position` module/lesson, preserve toàn bộ metadata syllabus (name/level/type/skills/description/totalLessons/createdAt).
- [x] Thứ tự statement parent-first: syllabus copy → module copy → lesson copy → reset template status → UPDATE class pointer → DROP helper; **mỗi statement ngăn cách `--> statement-breakpoint`** (migrator chỉ split trên token này — red-team A).
- [x] **Idempotent khi replay (red-team D):** INSERT copy syllabus có guard `AND NOT EXISTS (SELECT 1 FROM syllabus s2 WHERE s2.class_id = c.id)`; UPDATE pointer chỉ áp class có copy tương ứng (EXISTS) — không NULL hóa pointer class mồ côi; fail giữa chừng không wedge DB.
- [x] Class mồ côi / lệch org bị DROP khỏi backfill — đếm và log số lượng (SELECT trước migrate).

## Architecture

Backfill thuần SQL set-based (không vòng lặp script): join `class c ON c.syllabus_id = s1.id` nhân bản theo từng class; unique index (phase 1) đảm bảo subquery tìm copy theo `class_id` luôn trả ≤1 row. Runtime import (phase 3) tái dùng cùng thuật toán bằng TS + `db.batch` — migration chỉ chạy một lần, runtime là đường chính về sau.

## Related Code Files

- `packages/db/src/migrations/0009_syllabus_template_discriminator.sql` — append block backfill.
- `packages/db/src/schema/class.ts` — bảng `class` (`syllabusId` pointer) để tham chiếu cột khi viết UPDATE.

## Implementation Steps

1. Append vào 0009 (sau phần structural, sketch — cook thì rà đúng tên cột theo schema; `uuidexpr` = printf UUID ở Requirements):
   ```sql
   --> statement-breakpoint
  CREATE TABLE IF NOT EXISTS tmp_module_map (
    old_module_id text NOT NULL,
    class_id text NOT NULL,
    new_module_id text NOT NULL,
    PRIMARY KEY (old_module_id, class_id)
  );
   -- 0. đếm row sẽ bị bỏ (mồ côi / lệch org) để log
   --> statement-breakpoint
   -- 1. copy syllabus/class cùng org có pointer, chưa có copy (idempotent); gốc thành template
   INSERT INTO syllabus (id, org_id, name, level, type, skills, description, total_lessons, created_at, class_id, source_template_id)
   SELECT :uuidexpr:, s.org_id, s.name, s.level, s.type, s.skills, s.description, s.total_lessons, s.created_at, c.id, s.id
   FROM class c JOIN syllabus s ON s.id = c.syllabus_id AND s.org_id = c.org_id
   WHERE c.syllabus_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM syllabus s2 WHERE s2.class_id = c.id);
   --> statement-breakpoint
   -- 2. mapping module cũ → mới (mỗi class một dòng, cùng guard org + idempotent)
   INSERT INTO tmp_module_map (old_module_id, class_id, new_module_id)
   SELECT m.id, c.id, :uuidexpr:
   FROM syllabus_module m
   JOIN syllabus s ON s.id = m.syllabus_id
   JOIN class c ON c.syllabus_id = s.id AND s.org_id = c.org_id
   WHERE NOT EXISTS (SELECT 1 FROM syllabus_module m2 WHERE m2.syllabus_id =
     (SELECT s2.id FROM syllabus s2 WHERE s2.class_id = c.id AND s2.source_template_id = s.id));
   --> statement-breakpoint
   -- 3. copy modules; syllabus copy resolve qua (class_id, source_template_id)
   INSERT INTO syllabus_module (id, org_id, syllabus_id, title, description, position, created_at)
   SELECT mm.new_module_id, m.org_id,
     (SELECT s2.id FROM syllabus s2 WHERE s2.class_id = mm.class_id AND s2.source_template_id = m.syllabus_id),
     m.title, m.description, m.position, m.created_at
   FROM syllabus_module m JOIN tmp_module_map mm ON mm.old_module_id = m.id;
   --> statement-breakpoint
   -- 4. copy lessons: PRESERVE status (khác runtime import reset upcoming)
   INSERT INTO syllabus_lesson (id, org_id, module_id, title, objectives, materials, status, position, created_at)
   SELECT :uuidexpr:, l.org_id, mm.new_module_id, l.title, l.objectives, l.materials, l.status, l.position, l.created_at
   FROM syllabus_lesson l
   JOIN syllabus_module m ON m.id = l.module_id
   JOIN tmp_module_map mm ON mm.old_module_id = m.id;
   --> statement-breakpoint
   -- 5. reset status cây template gốc → upcoming (D2.3, red-team F)
   UPDATE syllabus_lesson SET status = 'upcoming'
   WHERE module_id IN (SELECT id FROM syllabus_module WHERE syllabus_id IN
     (SELECT id FROM syllabus WHERE class_id IS NULL));
   --> statement-breakpoint
   -- 6. pointer trỏ copy — CHỈ class có copy tương ứng (không NULL hóa mồ côi)
   UPDATE class SET syllabus_id = (
     SELECT s2.id FROM syllabus s2 WHERE s2.class_id = class.id AND s2.source_template_id = class.syllabus_id
   ) WHERE syllabus_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM syllabus s3 WHERE s3.class_id = class.id AND s3.source_template_id = class.syllabus_id);
   --> statement-breakpoint
   DROP TABLE tmp_module_map;
   ```
2. **Rehearsal bằng test tự động** theo pattern `apps/server/src/comment-bank-existing-data-migration.test.ts:29-70` (red-team A): libsql in-memory, applyFile tuần tự 0000→0009, seed dữ liệu hình pilot (≥2 org, ≥2 class share 1 template, lesson đủ 3 status, 1 class mồ côi pointer, 1 class trỏ syllabus lệch org), assert matrix dưới. KHÔNG dùng `db:migrate:deploy` (driver d1-http, không credentials — chạy được thì bắn thẳng vào D1 remote phá pilot).
3. Ghi chú footer file 0009: backfill idempotent (guard NOT EXISTS + `CREATE TABLE IF NOT EXISTS` cho helper — replay sau partial-fail không chết ở duplicate table); journal + test là guard replay.

## File Inventory

| File | Action | Size | Test impact |
|------|--------|------|-------------|
| `packages/db/src/migrations/0009_syllabus_template_discriminator.sql` | modify (append backfill + comments) | L | rehearsal matrix dưới; phase 6 chạy lại trên bản sao pilot |
| *(không file source nào khác — thuần SQL)* | — | — | — |

## Test Scenario Matrix

| # | Scenario | Priority | Verify (SELECT sau rehearsal) |
|---|----------|----------|-------------------------------|
| 1 | Số copy syllabus = số class có pointer cùng org; mỗi copy có đúng `class_id`, `source_template_id` = gốc | Critical | `SELECT class_id, count(*) FROM syllabus WHERE class_id IS NOT NULL GROUP BY class_id` — mọi group = 1 |
| 2 | Cây copy đủ chiều sâu: modules copy/lớp = modules gốc, lessons/module giữ nguyên đếm | Critical | join đếm theo `source_template_id` so với gốc |
| 3 | Lesson status preserve trên COPY (done/current/upcoming giữ nguyên phân bố) | Critical | `GROUP BY status` trước/sau bằng nhau trên phần copy |
| 4 | `position` module/lesson không xáo trộn | High | min/max/sequence per (copy, parent) khớp gốc |
| 5 | Class không có `syllabus_id` → không phát sinh copy; class mồ côi/lệch org bị bỏ, pointer KHÔNG bị NULL hóa | Critical | đếm copy; pointer mồ côi giữ giá trị cũ; log count = số đã bỏ |
| 6 | Cây gốc nguyên vẹn: mọi syllabus gốc giờ `class_id NULL`, module/lesson gốc còn đủ | Critical | đếm gốc trước/sau |
| 7 | `class.syllabus_id` sau migrate luôn trỏ copy trong cùng org | High | JOIN pointer → syllabus.org_id = class.org_id, pointer không trỏ id nào có `class_id IS NULL` |
| 8 | `tmp_module_map` bị DROP, DB không còn table lạ | Medium | `.tables` |
| 9 | Cây template gốc 100% `status = 'upcoming'` sau reset (red-team F) | High | `SELECT count(*) FROM syllabus_lesson WHERE status <> 'upcoming' AND module_id IN (template cây)` = 0 |
| 10 | Mọi id backfill sinh ra có dạng UUID 36 ký tự có gạch (red-team E) | High | `SELECT id FROM syllabus WHERE class_id IS NOT NULL` khớp `length(id)=36` + 4 gạch |
| 11 | Replay file 0009 lần 2 không lỗi, không nhân bản thêm (idempotent — red-team D) | Critical | chạy apply lần 2 → mọi count giữ nguyên |
## Success Criteria

- [x] Rehearsal test tự động (in-memory, seed pilot-like) pass 11 scenario matrix trên; migration chạy không lỗi.
- [x] DB persistent gốc (bản chính + dev D1 local) chưa đụng tới — chỉ migrate qua alchemy deploy khi cook xong (phase 6).
- [x] Comment đầu 0009 ghi rõ thứ tự block + guard idempotent.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Subquery resolve copy trả nhiều row → corruption | Unique index `syllabus_class_unique` (phase 1) bảo đảm 1 copy/class — tạo index TRƯỚC backfill (đã đúng thứ tự file) |
| Helper table quên DROP → drift schema vs snapshot | Scenario 8 kiểm tra; đặt DROP ngay cuối file |
| SQL backfill sai thứ tự FK (module trước syllabus copy) | Thứ tự block cố định; rehearsal test bắt lỗi ngay |
| Dữ liệu pilot có row lỗi (mồ côi / lệch org) | JOIN org + EXISTS guard bỏ row lỗi một cách tường minh; đếm + log (scenario 5); không chặn migration |
| Fail giữa chừng khi deploy thật → DB kẹt | Backfill idempotent (NOT EXISTS guards, scenario 11) — retry chạy tiếp thay vì chết ở duplicate column/row |
## Dependency Map

- **Input:** Phase 1 (file 0009 structural + index làm guard cho backfill).
- **Output → Phase 3:** semantics backfill (preserve status vs runtime reset) là spec đối chiếu cho handler import.
- **Output → Phase 6:** chạy lại rehearsal như acceptance cuối; assume pre-prod (assumption 1 — verify không có prod D1 trước cook).
