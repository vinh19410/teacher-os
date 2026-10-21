---
title: "Phase 1: Đo dữ liệu thật và khoá baseline"
status: todo
---

# Phase 1: Đo dữ liệu thật và khoá baseline

## Goal

Biết chính xác dữ liệu prod đang lệch bao nhiêu và khoá hành vi hiện tại bằng số liệu test, trước khi đổi bất cứ dòng code nào.

## Context

- Migration 0009 cố ý để nguyên con trỏ mồ côi và khác org (`apps/server/src/syllabus-template-migration.test.ts`, lớp c4 và c5), nên prod có thể còn các dòng này.
- `POST /syllabi/:id/remove` đặt `source_template_id = NULL` trên các bản copy, nên copy có `source_template_id` null là bình thường.
- Phase này không sửa code ứng dụng. Chỉ tạo file trong `plans/261021-0938-syllabus-template-vs-class-curriculum-refactor/reports/`.

## Files

- Create: `reports/phase-01-anomaly-queries.sql`
- Create: `reports/phase-01-baseline.md`
- Create (sau khi user gửi kết quả): `reports/phase-01-anomaly-report.md`

## Tasks

### Task 1.1: Viết truy vấn đo (chỉ đọc)

- **Goal:** một file SQL chỉ chứa `SELECT`, user chạy được trên staging rồi prod.
- **Target files:** `reports/phase-01-anomaly-queries.sql`.
- **Steps:**
  1. Tạo file với đúng 8 truy vấn dưới đây (Q1a, Q1b, Q1c, Q2-Q6), mỗi truy vấn một dòng chú thích tiếng Việt ngay trên nó:
     ```sql
     -- Q1a lớp có con trỏ mồ côi (id không tồn tại trong syllabus)
     SELECT COUNT(*) AS q1a FROM class c WHERE c.syllabus_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM syllabus s WHERE s.id = c.syllabus_id);
     -- Q1b lớp có con trỏ trỏ sang syllabus của org khác (tham chiếu chéo tenant, chặn xoá do FK)
     SELECT COUNT(*) AS q1b FROM class c JOIN syllabus s ON s.id = c.syllabus_id WHERE s.org_id <> c.org_id;
     -- Q1c lớp có con trỏ trỏ vào syllabus cùng org nhưng không phải bản copy của chính nó
     SELECT COUNT(*) AS q1c FROM class c JOIN syllabus s ON s.id = c.syllabus_id WHERE s.org_id = c.org_id AND (s.class_id IS NULL OR s.class_id <> c.id);
     -- Q2 lớp có bản copy nhưng con trỏ null hoặc khác copy
     SELECT COUNT(*) AS q2 FROM class c JOIN syllabus s ON s.class_id = c.id AND s.org_id = c.org_id WHERE c.syllabus_id IS NULL OR c.syllabus_id <> s.id;
     -- Q3 bản copy có class_id không khớp lớp nào cùng org
     SELECT COUNT(*) AS q3 FROM syllabus s WHERE s.class_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM class c WHERE c.id = s.class_id AND c.org_id = s.org_id);
     -- Q4 bản copy mất nguồn template (source_template_id null)
     SELECT COUNT(*) AS q4 FROM syllabus WHERE class_id IS NOT NULL AND source_template_id IS NULL;
     -- Q5 tổng quan
     SELECT (SELECT COUNT(*) FROM class) AS classes, (SELECT COUNT(*) FROM syllabus WHERE class_id IS NULL) AS templates, (SELECT COUNT(*) FROM syllabus WHERE class_id IS NOT NULL) AS copies;
     -- Q6 kích thước cây lớn nhất (module + lesson) của một syllabus, để đối chiếu MAX_IMPORT_NODES = 500
     SELECT MAX(n) AS q6 FROM (SELECT s.id, (SELECT COUNT(*) FROM syllabus_module m WHERE m.syllabus_id = s.id) + (SELECT COUNT(*) FROM syllabus_lesson l JOIN syllabus_module m2 ON m2.id = l.module_id WHERE m2.syllabus_id = s.id) AS n FROM syllabus s);
     ```
  2. Ghi ở đầu file cách chạy (user chạy, không phải agent):
     `wrangler d1 execute <staging-name> --remote --json --command "<SQL>"` rồi lặp lại với `teacher-os-db` (prod) sau khi staging đã chạy được. Tên staging lấy trong `docs/production-release-runbook.md` mục Provision staging.
- **Success criteria:** file chỉ có `SELECT`; không có `UPDATE`, `DELETE`, `INSERT`, `DROP`.
- **Verify:** `rg -ni "update|delete|insert|drop|alter" plans/261021-0938-syllabus-template-vs-class-curriculum-refactor/reports/phase-01-anomaly-queries.sql` in ra không dòng nào (exit code 1 của `rg` là kết quả đạt).

### Task 1.2: Khoá baseline test và số đo code

- **Goal:** số liệu "trước" để so sánh ở các phase sau.
- **Target files:** `reports/phase-01-baseline.md`.
- **Steps:**
  1. Chạy `pnpm --filter server test` và ghi số test pass, số test fail, thời gian.
  2. Chạy `pnpm --filter web test` và ghi tương tự.
  3. Chạy `wc -l apps/server/src/routes/kernel.ts` và ghi số dòng.
  4. Chạy `rg -c "classId\s*(===|!==)\s*null" apps/web/src --glob '!**/*.test.*' --glob '!**/vocab/**'` và ghi từng file kèm số.
  5. Chạy `rg -n "set\(\{ syllabusId" apps/server/src --glob '!*.test.*'` và ghi từng dòng (đây là các nơi ghi con trỏ hiện tại).
  6. Liệt kê (chỉ tên) các khối `describe` trong `apps/server/src/kernel.test.ts` có chữ "syllabus" hoặc "curriculum"; các khối này là bộ test khoá hành vi, không được sửa nội dung ở phase 2.
- **Success criteria:** file baseline có đủ 6 mục; cả hai lệnh test cho kết quả rõ ràng (pass hoặc danh sách fail đã có từ trước).
- **Verify:** `pnpm --filter server test` exits 0 and prints `Test Files` and `Tests` lines with `0 failed`. Nếu đã fail từ trước khi sửa gì, dừng và báo (xem Failure Protocol); không coi là baseline.

### Task 1.3: Chờ kết quả đo từ user (cổng quyết định)

- **Goal:** có `phase-01-anomaly-report.md` trước khi bắt đầu phase 3.
- **Steps:**
  1. Đưa user file `phase-01-anomaly-queries.sql` và hai lệnh `wrangler` ở Task 1.1. Agent không tự chạy trên prod.
  2. Khi user dán kết quả, ghi vào `reports/phase-01-anomaly-report.md` bảng Q1a, Q1b, Q1c, Q2-Q6 kèm ngày giờ và môi trường.
  3. Quy tắc quyết định, ghi vào cuối báo cáo:
     - Q1b > 0: hỏi user có muốn `0042` đặt `NULL` cho các con trỏ khác org không (khuyến nghị có, vì chúng chặn xoá template). Mặc định là **không**.
     - Q1a, Q1c > 0: code mới đã chịu được (đọc theo `class_id`); không cần migration, chỉ ghi nhận.
     - Q2 > 0: migration `0042` sẽ sửa các dòng này (đã nằm trong thiết kế).
     - Q3 > 0: liệt kê, không xử lý trong plan này; hỏi user.
     - Q6 ≥ 500: dừng và báo, vì import của template đó đã bị chặn bởi `MAX_IMPORT_NODES`.
- **Success criteria:** báo cáo có đủ Q1a, Q1b, Q1c, Q2-Q6 và một dòng "Quyết định của user" cho mỗi truy vấn khác 0.
- **Verify:** `rg -c "Q(1[abc]|[2-6])" plans/261021-0938-syllabus-template-vs-class-curriculum-refactor/reports/phase-01-anomaly-report.md` prints a number ≥ 8. Phase 2 có thể bắt đầu song song với bước chờ này; phase 3 thì không.

## Success Criteria

- [ ] Baseline test và số đo code đã ghi.
- [ ] Kết quả đo prod (và staging) đã ghi, quyết định về Q1b đã có.
- [ ] Không có file nào ngoài `reports/` bị đổi (`git status --porcelain` chỉ liệt kê file trong thư mục plan).

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
