# Phase 3. Rehearse migration 0034 → 0056 (chỉ local)

Ngày: 2026-10-29. Kết luận: **GO** cho phần migration. Không ghi gì lên D1 remote (prod/staging), không tạo tài nguyên Cloudflare, không đọc hay export dữ liệu prod. Mọi dữ liệu là fixture tổng hợp (`fixture-*`, `@example.test`).

## Mục tiêu

Production D1 đứng ở 0034 (ledger 35 bản ghi, phase 1). Develop có thêm 0035–0056. Staging migrate dần nên không chứng minh được bước nhảy một lần 22 migration trên dữ liệu có sẵn. Rehearsal này dựng lại đúng trạng thái 0034, đổ dữ liệu hình dạng prod, áp 0035–0056 theo cách deploy prod áp, rồi kiểm dữ liệu và đường đọc HTTP.

## Cách prod áp migration (đã đọc code, không giả định)

- `packages/infra/alchemy.run.ts`: `Cloudflare.D1.Database("database", { migrationsDir: "../../packages/db/src/migrations" })`, bảng ledger mặc định `d1_migrations`.
- `alchemy@2.0.0-beta.72` `src/Cloudflare/D1/ApplyMigrations.ts`: ledger `(id TEXT PK, name TEXT, applied_at TEXT)`, `name` là tên file (`0035_ambiguous_freak.sql`). Mỗi file pending được gửi thành **một** query gồm SQL của file cộng `INSERT INTO d1_migrations …`. File nào đã có `name` trong ledger thì bỏ qua.
- Runbook mục "D1 ledger…" chỉ cho thao tác `--remote` trên DB staging/scratch. Bản rehearsal này giữ đúng trình tự và cách ghi ledger của runbook/alchemy nhưng chạy `--local`, theo ràng buộc của task.

## Môi trường

- Engine: `wrangler 4.84.1` `d1 execute --local --persist-to <scratchpad>`, chạy trong workerd `D1DatabaseObject` (cùng loại engine D1). Đã kiểm: `PRAGMA foreign_keys` = 1, và insert vi phạm FK bị từ chối `SQLITE_CONSTRAINT_FOREIGNKEY`. Hành vi này giống D1 prod và là điểm mấu chốt của 0041.
- Mỗi file migration chạy thành một batch (wrangler split + `db.batch`, một transaction), kèm dòng ledger trong cùng batch, giống alchemy.
- Migration 0000–0034 lấy từ `git archive 2ba23a22 packages/db/src/migrations`. Đã so từng byte: 35 file ở `2ba23a22` giống hệt bản develop (`25258515`). Hash của alchemy không đổi, nên deploy sẽ không thấy drift trên file cũ.
- 0035–0056 lấy từ working tree develop `25258515`.

## Lever (lặp lại được, nằm ngoài repo)

Toàn bộ nằm trong scratchpad của session, **không** commit vào repo:

| File | Việc |
| --- | --- |
| `rehearse.mjs` | Áp migration theo logic ledger của alchemy (`apply <dir> <from> <to>`), chạy SQL/file, đếm dòng mọi bảng. Không cho phép `--remote`. |
| `scenario.sh A\|B` | Chạy từ đầu đến cuối: archive `2ba23a22`, áp 0000–0034, seed, chụp DB, áp 0035–0056, đếm, so từng dòng, `foreign_key_check`, ledger. |
| `compare.py` | Diff từng dòng mọi bảng đã có trước migrate, trên các cột chung; chạy `integrity_check` và `foreign_key_check`. |
| `seed-0034.sql`, `seed-attempts-0034.sql`, `seed-annotations-0040.sql` | Fixture tổng hợp. |
| `read-paths.test.ts`, `read-paths.rollback.test.ts` | Test vitest gọi `buildApp` thật trên bản sao DB đã migrate. |

Muốn giữ lâu dài thì chuyển vào `scripts/` qua một PR riêng. Scratchpad mất khi hết session.

## Dữ liệu tổng hợp (seed tại 0034)

Hình dạng theo phase 1: 8 org, 20 user (cùng 20 `account`), 3 session, 9 membership với role `teacher` (code bootstrap ở `2ba23a22` ghi `teacher`), 5 lớp, 4 học viên.

- Lớp có lịch JSON chuẩn, một lớp có lịch dạng text cũ, một lớp `archived`.
- Giáo trình (syllabus): 1 template và các bản copy theo lớp, dựng đủ 5 ca cho 0042:
  - c1: có copy, con trỏ đang null.
  - c2: có copy, con trỏ lệch sang template.
  - c3: không có copy, con trỏ trỏ template.
  - c4: con trỏ null, có syllabus của **org khác** đặt `class_id = c4`.
  - c5: con trỏ đã đúng.
- 5 enrollment (`active` và `invited`), 2 session_package (một gói "parked" có `enrollment_id` null), 9 buổi học (`completed`, `absent`, `upcoming`, `cancelled`, một dòng `date` null).
- 5 invoice: đã thu đủ, thu một phần (`paid_amount` 1.000.000/3.600.000), chưa thu, quá hạn, thu tiền mặt. 4 payment_transaction: `matched` ×2, `unmatched`, `ignored`.
- Dữ liệu cũ khác: 3 assignment cũ, assignment_prompt/test/part, 2 class_assignment, 3 target, report, notif, comment_bank, student_invitation, org_bank_link, workspace_settings.
- Kịch bản A (giống prod): 0 quiz_attempt. Tổng 131 dòng trên 30 bảng.
- Kịch bản B (thêm): 3 quiz_attempt tại 0034 (một bài Writing đã chấm, có essay và media; một `in_progress`; một Reading đã nộp). Sau khi áp 0035–0040, thêm 3 `quiz_attempt_annotation` rồi mới áp 0041. Tổng 134 dòng trước migrate.

## Lệnh

```bash
cd <scratchpad>/rehearsal
./scenario.sh A      # prod-shaped
./scenario.sh B      # + attempts + annotations qua 0041
# đường đọc HTTP (file test copy tạm vào apps/server/src rồi xoá sau khi chạy)
REHEARSAL_DB=<scratchpad>/rehearsal/out-A/after.sqlite npx vitest run src/zz-rehearsal-0034.local.test.ts
REHEARSAL_DB=<scratchpad>/rehearsal/out-B/after.sqlite npx vitest run src/zz-rehearsal-0034.local.test.ts
```

## Kết quả

### Áp migration

Cả hai kịch bản: 22/22 file (0035–0056) chạy xong, không lỗi. Ledger tăng 35 → 57, id `00036`…`00057` liên tục, tên file đúng.

0040 và 0053 **không phải file rỗng**. Phase 1 kết luận nhầm vì `wc -l` đếm 0 dòng với file một dòng không có newline cuối. Nội dung thật:

- `0040_deep_oracle.sql`: `ALTER TABLE vocab_library_deck ADD description text`.
- `0053_purple_gorgon.sql`: `ALTER TABLE exam_import_job ADD error_reason text`.

Cả hai có trong `_journal.json` và được ghi vào ledger (`00041 0040_deep_oracle.sql`, `00054 0053_purple_gorgon.sql`). 0044 và 0056 cũng là file một dòng tương tự (ADD COLUMN có DEFAULT).

### Số dòng và diff từng dòng (30 bảng có trước 0035)

| Bảng | A trước → sau | B trước → sau | Thay đổi |
| --- | --- | --- | --- |
| organization / user / account | 8 / 20 / 20 → giữ nguyên | như A | 0 |
| membership / session | 9 / 3 → giữ nguyên | như A | 0 |
| class | 5 → 5 | 5 → 5 | chỉ `syllabus_id` của c1 (null → s1) và c2 (s-tpl → s2) |
| syllabus / module / lesson | 5 / 4 / 6 → giữ nguyên | như A | 0 |
| student / enrollment / session_package | 4 / 5 / 2 → giữ nguyên | như A | 0 |
| lesson | 9 → 9 | 9 → 9 | 0, thêm cột `attendance`, `attendance_note` (null) |
| invoice | 5 → 5 | 5 → 5 | 0 (`paid_amount` giữ nguyên) |
| payment_transaction | 4 → 4 | 4 → 4 | 0, thêm `method` (`''`), `recorded_by` (null) |
| quiz_attempt | 0 → 0 | 3 → 3 | 0 trên cột cũ, thêm `test_id` (null), `mode` (`assignment`) |
| assignment, assignment_prompt/test/part, class_assignment(_target), report, notif, comment_bank, student_invitation, org_bank_link, workspace_settings, verification | giữ nguyên | giữ nguyên | 0 |
| d1_migrations | 35 → 57 | 35 → 57 | +22 |

Tổng các bảng cũ: A 131 → 131, B 134 → 134. Có 21 bảng mới, đều rỗng sau migrate (B có 3 annotation).

### 0042 (con trỏ lớp ↔ giáo trình)

Kết quả đúng với cả 5 ca: c1 → s1, c2 → s2, c3 giữ s-tpl, c4 giữ null (không bị syllabus khác org chiếm), c5 giữ s5. Không xoá dòng nào. Snapshot `/api/kernel` trả `{"c1":"s1","c2":"s2","c3":"s-tpl","c4":null}` cho org-1.

### 0041 (dựng lại quiz_attempt)

- A: 0 attempt, chạy sạch.
- B: 3/3 attempt giữ nguyên mọi cột cũ, `mode = 'assignment'`, `test_id = null`. 3/3 annotation giống hệt trước 0041 (id, attempt_id, offset, note). Không còn bảng tạm `quiz_attempt_annotation_mig_backup` hay `__new_*`.
- Đã thử ràng buộc sau migrate (trên DB B, ném đi sau khi thử):
  - CHECK `quiz_attempt_mode_assignment_link` chặn `mode='assignment'` khi `assignment_id` null.
  - Unique `(assignment_id, student_id)` chặn bản trùng.
  - `mode='practice'` không có assignment thì ghi được.
  - Xoá `assignment_test` thì `test_id` về null (FK `set null`), không lỗi.

### Toàn vẹn

- `PRAGMA foreign_key_check` qua D1 local: `[]` cho cả A và B.
- `integrity_check` (chạy bằng sqlite3 trên bản chụp WAL-safe, vì D1 chặn pragma này với `SQLITE_AUTH`): `ok`.
- Schema (`sqlite_master`, trừ ledger) sau khi nhảy 0034 → 0056 **giống hệt** schema của DB dựng mới 0000–0056 (808 dòng, diff rỗng). Như vậy schema mà toàn bộ test server dùng (libsql, migrate từ đầu) chính là schema prod sẽ có sau deploy.

### Đường đọc HTTP (code develop `25258515`, `buildApp` thật, DB là bản sao đã migrate)

Teacher của org-1 có dữ liệu cũ, kết quả giống nhau ở A và B:

| Endpoint | Status |
| --- | --- |
| `GET /readyz` | 200 `{"ok":true}` |
| `/api/kernel` (loadSnapshot) | 200, 4 lớp, 3 học viên, 4 invoice, `viewer.canAccessFinance=true` |
| `/api/students`, `/api/students/invitations`, `/api/students/st1/billing-timeline` | 200 |
| `/api/classes`, `/api/invoices`, `/api/invoices/inv2/payment`, `/api/invoices/inv2/transactions` | 200 (inv2 `paidAmount` 1.000.000) |
| `/api/payment-transactions` | 200 |
| `/api/dashboard/reminders`, `/api/attendance/daily`, `/api/notification-logs` | 200 |
| `/api/grading`, `/api/credits/wallet` | 200 |
| `/api/bank-link` | 503 `BANKHUB_DISABLED`, đúng hợp đồng gating khi thiếu secret SePay |
| `/api/kernel/vocab/progress` (không truyền `studentId`) | 400 `studentId is required`, lỗi validate tham số |

Riêng B: `GET /api/grading` liệt kê qa1. `GET /api/grading/qa1` trả 200 kèm 2 annotation. qa2 trả 409 `NOT_SUBMITTED` và qa3 (Reading) trả 400 `SKILL_NOT_GRADABLE`, đều đúng hợp đồng.

User mới chưa có org: bootstrap qua `/api/kernel` trả 200, rồi `/api/invoices`, `/api/students`, `/api/grading`, `/api/credits/wallet` đều dưới 500.

Không endpoint nào trả 500. Sau khi chạy xong, file test tạm đã xoá khỏi `apps/server/src`.

Các test migration có sẵn trong repo cũng đã chạy và xanh, 18/18: `syllabus-pointer-reconcile-migration`, `quiz-attempt-practice-migration`, `lesson-attendance-columns-migration`, `readiness`.

### Rollback code (thêm, phục vụ plan 7.4)

Chạy cùng bộ test với code `2ba23a22` (git worktree tạm trong scratchpad, `pnpm install --offline`, đã gỡ worktree) trên DB đã migrate tới 0056:

- `/readyz` 200, `/api/kernel` 200, `/api/students` 200, `/api/invoices` 200, `/api/payment-transactions` 200, `GET /api/grading/qa1` 200.
- Bootstrap user mới 200.
- Các route chỉ có ở develop trả 404, không có 500.

Vậy redeploy `2ba23a22` sau khi đã migrate không làm vỡ các màn đọc lõi. Phần ghi (old code insert vào `quiz_attempt`/`payment_transaction`) chưa thử. Suy luận từ schema: các cột mới đều nullable hoặc có DEFAULT, và code cũ luôn set `assignment_id`, nên CHECK mới không chặn. Đây là suy luận, chưa đo.

## Giới hạn của rehearsal

- Engine là D1 local (workerd), không phải D1 remote. Prod gửi mỗi file thành **một** query HTTP `/query`. Local thì wrangler split rồi `db.batch`. Cả hai đều chạy trong một transaction, có FK enforce, và `PRAGMA foreign_keys` không có tác dụng. Khác biệt còn lại thuộc tầng vận chuyển, không thuộc ngữ nghĩa SQL.
- Đường đọc HTTP chạy trên libsql (node) đọc bản sao file sqlite mà D1 local đã migrate, không boot worker. Không dùng cổng nào, nên dev stack 8000/8001/8003/8004 không bị đụng.
- Dữ liệu tổng hợp chỉ mô phỏng hình dạng prod, không phải giá trị thật. Có thể prod còn những giá trị text lạ mà fixture không có (ví dụ status cũ). Read path phân tích JSON/text một cách phòng thủ (`parseSchedule`, `parseSkills`…), nhưng chưa có bằng chứng trên chính dữ liệu prod.
- Phát hiện phụ, ngoài prod: 0038/0039 rebuild `vocab_deck`/`vocab_card` bằng `DROP TABLE` mà không backup bảng con (`vocab_word` từ 0036 có FK `deck_id` → `vocab_deck` ON DELETE cascade). Trên D1 (FK luôn ON) thì drop sẽ cascade. Prod không bị ảnh hưởng vì các bảng vocab được 0036 tạo rỗng ngay trong cùng đợt deploy. Không cần migration mới cho release này.

## Kết luận

**GO** cho bước nhảy 0034 → 0056 trên prod:

- 22 migration chạy sạch.
- Không mất hay đổi dòng nào ngoài thay đổi chủ đích của 0042.
- FK/CHECK/unique đứng vững, ledger đúng (cả 0040 và 0053).
- Schema đích trùng với schema test.
- Các đường đọc lõi không 500 với cả code mới và code rollback.

Không phát hiện migration không an toàn, nên không đề xuất migration forward mới.

Điều kiện vẫn giữ từ runbook và plan: migrate chạy trước khi worker mới nhận traffic (alchemy làm theo thứ tự này), ghi bookmark Time Travel ngay trước deploy (6.2), và smoke tay các API đọc cột mới sau deploy (7.3), vì `/readyz` không kiểm cột.
