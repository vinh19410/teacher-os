---
phase: 1
title: "Module audit + cleanup + script CLI (TDD)"
status: pending
priority: P1
effort: "2.5h"
dependencies: []
---

# Phase 1: Module audit + cleanup + script CLI (TDD)

## Goal
Script `audit-663-orphan-materials.ts` chạy được trên local libsql (`--file`) và Cloudflare D1 thật (`--d1 --d1-stage staging|prod`), in báo cáo phân loại đủ để ra quyết định, và có mode `--apply` dọn dòng mồ côi manual theo pattern #659 — logic nằm trong module test được, test viết TRƯỚC code. Repo là PUBLIC: mode `--d1` chỉ in số liệu tổng hợp, không in ID từng dòng.

## Files to Create / Modify
- Create: `packages/db/src/audit/orphan-materials.ts` — logic: SQL audit, chain resolve, classify, cleanup plan + execution, D1 REST client, resolve database id fail-closed.
- Create: `packages/db/src/audit/orphan-materials.test.ts` — vitest, fixture libsql `:memory:`.
- Create: `packages/db/scripts/audit-663-orphan-materials.ts` — CLI mỏng, mirror cấu trúc `packages/db/scripts/seed-vocab-library.ts`.
- Modify: `packages/db/tsconfig.json` — thêm `"src/audit/**/*.ts"` vào `include` (hiện chỉ có schema/seed/scripts — red-team A6: không thêm thì test file mới không được `check-types` soi).

KHÔNG sửa `packages/db/src/seed/vocab-library.ts` (license gate seed có chủ ý, kèm guard test — counsel kongming 2026-11-10; red-team xác nhận).

## Context kỹ thuật (bắt buộc đọc trước khi code)

### Query audit (read-only, 2 câu)

Câu 1 — dòng mồ côi ứng viên (query gốc issue #663 + cột hành động; **status-aware** theo red-team F1: shift luôn để lại lesson `status='holiday'` ở ngày gốc — `enrollment-activation.ts:57`, `holidays.ts:329-330` — nên EXISTS lesson phải lọc status, không thì loại nhầm 100% population; JOIN `class` lấy `scheduling_mode` và `lm.created_at` theo advisory kongming round-2 — xem phân loại bên dưới):

```sql
SELECT lm.org_id, s.org_id AS shift_org_id, lm.class_id, lm.date, lm.material_id,
       lm.created_at AS lm_created_at,
       cls.scheduling_mode AS scheduling_mode,
       s.id AS shift_id, s.makeup_date, s.created_at AS shift_created_at,
       EXISTS (SELECT 1 FROM class_session cs
               WHERE cs.class_id = lm.class_id AND cs.date = lm.date) AS has_class_session,
       EXISTS (SELECT 1 FROM lesson_material d
               WHERE d.class_id = lm.class_id AND d.date = s.makeup_date
                 AND d.material_id = lm.material_id) AS dest_conflict_same_material,
       EXISTS (SELECT 1 FROM lesson l
               WHERE l.class_id = lm.class_id AND l.date = lm.date
                 AND l.status IN ('upcoming','completed')) AS active_lesson_at_date
FROM lesson_material lm
JOIN holiday_session_shift s
  ON s.class_id = lm.class_id AND s.original_date = lm.date
JOIN class cls ON cls.id = lm.class_id
ORDER BY lm.class_id, lm.date, lm.material_id;
```

Câu 2 — toàn bộ shift để resolve chain trong JS (chain link có thể không có material nên không thấy từ câu 1):

```sql
SELECT class_id, original_date, makeup_date, created_at
FROM holiday_session_shift ORDER BY class_id, created_at;
```

### Phân loại & chain (trong JS, từ 2 kết quả trên)

- Phân loại (advisory round-2 đã kiểm chứng `kernel.ts:2427-2450`): chiều CHẮC CHẮN duy nhất là **lớp manual ⟹ có `class_session` ở ngày gốc** (`has_class_session=1`) — route thêm buổi manual luôn insert `class_session`. CHIỀU NGƯỢC KHÔNG CHẮC: lớp auto 0 lesson (chưa có học viên) qua gate `!manual` của route add-session và insert được `class_session` → population `has_class_session=1` có thể chứa dòng của lớp auto. Vì vậy report phải kèm `scheduling_mode` (từ bảng `class`) và `lm.created_at`: (a) breakdown `manual_total` theo `scheduling_mode` để owner thấy cơ chế; (b) `lm.created_at` phân biệt legacy pre-#659/#662 với tái phát post-deploy (population JOIN bắt cả đường attach-sau-shift đã fix của #662). Phạm vi cleanup v1 giữ `has_class_session=1` làm superset bảo thủ — cơ chế mồ côi giống nhau ở cả hai loại lớp.
- `has_class_session = 0` ⟹ lớp auto (chiều chắc: manual session luôn có `class_session`) — breakdown riêng, không đụng v1.
- **Chain resolve** (red-team F2): với mỗi `(class_id, original_date)`, đi theo `original_date → makeup_date` bằng bảng shift câu 2 tới đích cuối (`visited` set chặn loop; loop → loại, lý do `chain_loop`). Đích cuối `T` phải có buổi dạy THẬT: `active_lesson_at_T` (lesson status `upcoming`/`completed`) hoặc `class_session` tại `T` — kiểm tra bằng 2 câu đọc thêm bounded theo class tham gia (read-only). Đích chỉ có lesson `holiday`/`cancelled` → loại, lý do `dest_no_active_session` (move sẽ tạo mồ côi mới, giấu trong hậu-audit).
- **Phạm vi cleanup v1** — dòng thỏa ĐỒNG THỜI: `has_class_session = 1` ∧ `active_lesson_at_date = 0` ∧ chain resolve được ∧ đích cuối có buổi thật. Mọi dòng khác: chỉ báo cáo kèm nhãn lý do (`auto_review`, `active_lesson_at_date`, `chain_loop`, `dest_no_active_session`).
- **Từ vựng số liệu** (red-team S8/A5 — bắt buộc dùng đúng): `manual_total` = số dòng `has_class_session=1`; `cleanup_eligible` = số dòng thỏa phạm vi v1; breakdown lý do loại. Bất biến bắt buộc: `manual_total == cleanup_eligible + Σ(loại)` — lệch → exit 2 (chốt red-team F7: không cho bug gate trốn trong số liệu).

### Cleanup (delete-then-move #659, sửa theo red-team S2/F5)

- Per group `(class_id, original_date D → terminal T)`, ĐÚNG THỨ TỰ:
  1. `DELETE FROM lesson_material WHERE class_id = ? AND date = ? /* T */ AND material_id IN (SELECT material_id FROM lesson_material WHERE class_id = ? AND date = ? /* D */)` — **live subquery tại thời điểm chạy**, KHÔNG pre-bind danh sách materialId từ snapshot audit (red-team F5: #659 dùng subquery live trong batch nguyên tử; script không có batch nguyên tử nên phải giữ subquery để không xoá nhầm link xuất hiện sau audit).
  2. `UPDATE lesson_material SET date = ? /* T */ WHERE class_id = ? AND date = ? /* D */`.
- KHÔNG xoá dòng khác ở `T` (#658: ngày có buổi manual là dữ liệu thật). Chain nhiều nhịp: mỗi nhịp là một group riêng (D0→T, D1→T với T chung — hợp lệ vì hai group không giao materialId trùng ở cùng đích? CÓ thể trùng: group sau có câu DELETE câu 1 dọn trùng trước khi move — đúng pattern).
- D1 REST là request tuần tự, KHÔNG nguyên tử (`packages/db/scripts/README-seed-vocab-library.md:61-62`): **hội tụ chỉ khi plan luôn được rebuild từ audit tươi ngay trước apply**. `runCleanup` single-use: đánh dấu consumed, gọi lần 2 với cùng plan object → throw (red-team S2: replay cùng plan = câu DELETE xoá mất dòng đã move). KHÔNG có retry-cả-group; KHÔNG có `--plan-file`.
- Sau apply bắt buộc chạy lại audit và in số hậu-dọn (manual_total còn lại + breakdown).

### Resolve database id (hàm MỚI, fail-closed cả 2 stage — red-team S9)

- List `GET https://api.cloudflare.com/client/v4/accounts/{accountId}/d1/database?name=<prefix>&per_page=100` + **phân trang hết các page** (đọc `result_info` cho tới khi hết; KHÔNG throw-on-truncate đơn giản).
- Staging: prefix `teacher-os-database-staging-`, lọc `STAGING_D1_NAME_REGEX`. Prod: prefix `teacher-os-database-prod-`, lọc `PROD_D1_NAME_REGEX` (tên prod thật `teacher-os-database-prod-*` — `packages/db/scripts/README-seed-vocab-library.md:63`). Cả hai: ĐÚNG 1 match, id khớp `D1_UUID_REGEX`-tương đương; 0 hoặc >1 → throw fail-closed; stage khác → throw.
- Error message phải redact `databaseId` + token: copy pattern `redactSensitive` từ `packages/db/scripts/seed-vocab-library.ts:121` vào module audit (KHÔNG import ngược từ scripts — dependency direction; red-team S4/F6). KHÔNG đụng `resolveStagingD1DatabaseId`/`assertNonProdD1Database`.

### D1 REST client

`POST .../d1/database/{databaseId}/query` body `{"sql": "..."}`, header `Authorization: Bearer <token>`; response `{ success, result: [{ results: [...] }], errors }`. JSON parse guard; `success !== true` → throw kèm status + errors đã redact; KHÔNG in token.

### CLI (mirror `packages/db/scripts/seed-vocab-library.ts`: parseArgs, USAGE_TEXT, main)

- Flags: `--file <path>` | `--d1 --d1-stage <staging|prod>` (đúng một nguồn); `--apply`; `--confirm-stage <stage>` (bắt buộc khi `--apply` + `--d1`, phải bằng `--d1-stage` — confirm-gate mirror `state-migrate.yml:59-70`, red-team S3/A4); `--dump <path>` (bắt buộc khi `--apply --d1`: ghi JSON các dòng + statement sẽ chạy TRƯỚC câu ghi đầu tiên — bản backup khôi phục; mặc định `./audit-663-apply-dump-<epoch>.json`, KHÔNG commit).
- **Chính sách exposure (repo PUBLIC — red-team S1):** mode `--d1` CHỈ in tổng hợp số liệu (`manual_total` kèm breakdown theo `scheduling_mode`, `cleanup_eligible`, breakdown lý do loại, `auto_total`) — không bảng dòng, không ID. Bảng dòng đầy đủ (cap 200 dòng) chỉ ở mode `--file`. Comment issue chỉ nêu số tổng hợp.
- Exit: 0 thành công; 1 lỗi runtime; 2 lệch bất biến phân loại.
- Format chuẩn repo: **tab + double quotes** (biome.json `quoteStyle: "double"` — red-team S5: KHÔNG phải single quote).

## Tests Before (viết trước, chạy RED)

`packages/db/src/audit/orphan-materials.test.ts`, vitest, `createClient(":memory:")` từ `@libsql/client`, CREATE TABLE đúng cột (`lesson_material` gồm cả `position`, `created_at` — `material.ts:97-123`; `holiday_session_shift` — `organization-holiday.ts:79-112`; `class_session`; `lesson` cần cột `status`). **Fixture phải mirror dữ liệu thật: dòng mồ côi manual có lesson rows `status='holiday'` ở ngày gốc** (red-team F1 — fixture thiếu holiday lesson đã từng mask đúng bug cần bắt). Tối thiểu:

1. `auditOrphans`: manual (holiday-lesson ở gốc) có `has_class_session=1`, `active_lesson_at_date=0`, `scheduling_mode` và `lm_created_at` được surface đúng từ JOIN; auto có `has_class_session=0`; dòng không join shift bị loại; `dest_conflict_same_material` đúng 0/1. Fixture CREATE bảng `class` với cột `scheduling_mode` (default `'auto'`).
2. Chain resolve: D0→D1→D2 (shift 2 nhịp) → terminal D2; D1 có material riêng → group (D1→D2); loop D0→D1→D0 → loại `chain_loop`.
3. `buildCleanupPlan`: chỉ group thỏa v1; statement 1 DELETE dùng **live subquery** (assert chuỗi SQL chứa `IN (SELECT`), statement 2 UPDATE đúng thứ tự; nhãn lý do loại đầy đủ.
4. Single-use plan: `runCleanup` gọi lần 2 với cùng plan object → throw; rebuild plan từ audit tươi rồi chạy → hội tụ (số dòng tổng không đổi, dòng ở terminal).
5. Partial failure: fake runner tuần tự throw sau statement DELETE của group 2 → chạy lại (audit tươi + plan mới) → hội tụ, tổng dòng `lesson_material` không mất.
6. Dòng auto và dòng có `active_lesson_at_date=1` (lesson `upcoming` ở gốc) KHÔNG bị move.
7. Reconciliation: classify trả `manual_total == cleanup_eligible + Σ(excluded)`; fixture lệch → `reconcile` throw.
8. `resolveD1DatabaseId` fake `fetchImpl`: staging đúng-1-match; 0 match → throw; >1 → throw; prod prefix+regex match; prod 0 match → throw; stage `dev` → throw; pagination 2 page gộp đủ.
9. `d1Query` fake: `success:false` → throw (message redact databaseId); HTTP 500 → throw.
10. `redactSensitive`: thay token/uuid trong message bằng `[REDACTED]`.

## Tasks & Steps

### Task 1.1 — Viết test RED
- Goal: test file tồn tại, chạy fail vì module chưa có.
- Target files: `packages/db/src/audit/orphan-materials.test.ts`; `packages/db/tsconfig.json` (thêm include).
- Steps: tạo file với 10 nhóm test trên; import từ `./orphan-materials` (chưa tồn tại); sửa tsconfig include.
- Success criteria: vitest exit ≠ 0 với lỗi không resolve được module.
- Verify: `cd packages/db && pnpm exec vitest run 2>&1 | tail -3; echo "EXIT=$?"` — output chứa `orphan-materials` và EXIT ≠ 0 (chạy 2 lệnh riêng, không pipe che exit).

### Task 1.2 — Implement module
- Goal: toàn bộ logic nằm trong `packages/db/src/audit/orphan-materials.ts`, test xanh.
- Target files: `packages/db/src/audit/orphan-materials.ts`.
- Steps: hiện thực theo Context; export: `ORPHAN_AUDIT_SQL`, `SHIFTS_SQL`, `AuditRow`, `ShiftRow`, `auditOrphans`, `resolveChain(shifts)`, `classifyRows`, `buildCleanupPlan`, `runCleanup` (single-use), `resolveD1DatabaseId`, `d1Query`, `createD1AuditRunner`, `redactSensitive`, `reconcileSummary`.
- Success criteria: 10 nhóm test xanh; không import từ `apps/`; không in token; không sửa `vocab-library.ts`.
- Verify: `pnpm --filter @teacher-os/db test` exit 0 và `git status --porcelain packages/db/src/seed/` rỗng.

### Task 1.3 — CLI script
- Goal: CLI chạy audit `--file`/`--d1`, `--apply` có confirm-gate + dump, exposure đúng chính sách public.
- Target files: `packages/db/scripts/audit-663-orphan-materials.ts`.
- Steps: copy cấu trúc CLI seed script; mode `--file` in bảng (cap 200) + summary; mode `--d1` chỉ summary tổng hợp; `--apply --d1` đòi `--confirm-stage` khớp + ghi dump JSON trước câu ghi đầu; sau apply chạy lại audit in hậu-dọn.
- Success criteria: smoke local với fixture thật (2 manual mồ côi có holiday-lesson ở gốc, 1 manual có lesson `upcoming` ở gốc, 1 chain 2 nhịp về đích có buổi, 1 chain loop, 1 auto): audit in `manual_total: 5`, `cleanup_eligible: 3` (2 thuần + 1 chain đầu); `--apply --file` move đúng 3, còn lại nguyên vị trí; chạy CLI lần 2 sau apply → `cleanup_eligible: 0`, tổng dòng không đổi.
- Verify: `pnpm --filter @teacher-os/db exec tsx scripts/audit-663-orphan-materials.ts --file /tmp/audit663.db 2>&1; echo EXIT=$?` chứa `manual_total: 5`, `cleanup_eligible: 3`, EXIT=0; bước apply in dump path + hậu-dọn `cleanup_eligible: 0`.

### Task 1.4 — Gate chất lượng
- Goal: không phá gate hiện có.
- Steps: `pnpm --filter @teacher-os/db check-types` (nhờ tsconfig include, test file được typecheck) và `pnpm exec biome check packages/db/src/audit packages/db/scripts/audit-663-orphan-materials.ts packages/db/tsconfig.json`; sửa tới sạch (tab + double quotes).
- Success criteria: cả hai exit 0.
- Verify: `pnpm --filter @teacher-os/db check-types && pnpm exec biome check packages/db/src/audit packages/db/scripts/audit-663-orphan-materials.ts` exit 0.

## Regression gate
- `pnpm --filter @teacher-os/db test` — xanh toàn bộ gồm test cũ `vocab-library.test.ts` + `vocab.test.ts`.

## TDD Refactor
Sau khi test xanh: bỏ dead code, gộp helper trùng nếu lặp quá 2 lần; KHÔNG trừu tượng hoá thêm. KHÔNG gộp "fetch retry" thành wrapper tái dùng group cleanup (red-team S2: retry phải ở mức statement đơn, plan rebuild ở CLI).

## Tests After
Không thêm test mới sau refactor; re-run regression gate.

## Verification (tổng phase)
- [ ] `pnpm --filter @teacher-os/db test` exit 0
- [ ] `pnpm --filter @teacher-os/db check-types` exit 0
- [ ] `pnpm exec biome check packages/db/src/audit packages/db/scripts/audit-663-orphan-materials.ts` exit 0
- [ ] Smoke CLI `--file` + `--apply` đúng số liệu fixture (Task 1.3)
- [ ] `git status --porcelain packages/db/src/seed/` rỗng

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
