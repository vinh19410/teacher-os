# Design decisions — orchestrator synthesis (2026-08-25)

Inputs: reports/scout-report.md (codebase), reports/research-report.md
(external patterns). Mode: deep. Kongming checkpoint (--advice): dispatch
FAILED at transport (codex proxy 502, model unroutable) — advisory miss
recorded per protocol; red-team gate compensates. Host is single-model, so
no Fable/Sol pin was possible anyway.

## D1 — Copy-on-import, same tables + discriminator

- `syllabus.class_id`: NULL = template, NOT NULL = live per-class copy.
  UNIQUE index on `class_id` (SQLite allows multiple NULLs) = one live
  curriculum per class + duplicate-import guard.
- `syllabus.source_template_id`: nullable self-FK, ON DELETE SET NULL,
  provenance + "in use" counts only. No version column (YAGNI): the copy IS
  the version pin. No sync, no re-import in v1.
- Modules/lessons unchanged — they hang off the copied syllabus row.
  Module/lesson CRUD handlers stay discriminator-agnostic (id+org checks
  already suffice); UI surfaces decide template-vs-class editing.

## D2 — Import endpoint semantics

- `POST /api/classes/:id/import-syllabus` body `{templateId}`:
  1. verify class org; verify template exists AND `class_id IS NULL` AND org.
  2. pre-SELECT template tree; generate server-side UUIDs for copy +
     every module + every lesson; preserve `position`.
  3. NEW imports reset every copied lesson status to `upcoming`
     (status is class progress, not template content).
  4. single `db.batch([...])` — insert syllabus copy (class_id, org_id,
     metadata, source_template_id) + set class.syllabus_id to the copy id +
     all module/lesson inserts. D1 batch = real transaction.
  5. unique-violation on class_id → 409 "class already has a curriculum".
- `assign-syllabus` endpoint/action is REPLACED (clean cutover, pre-prod).
- Unassign ("" semantics) becomes: confirm + delete the class-owned copy
  tree + null the pointer. Kept because current UI has "— Chưa gán —".
- `POST /api/classes` with a templateId: create class row + run the same
  import inside one batch (atomic create+import).

## D3 — Migration 0009 (hand-written SQL, convention 0007/0008)

1. `ALTER TABLE syllabus ADD class_id text` (nullable, no default).
2. `ALTER TABLE syllabus ADD source_template_id text` + FK (deferred via
   separate index; SQLite ALTER can't add FK — document as logical FK).
3. `CREATE UNIQUE INDEX syllabus_class_unique ON syllabus(class_id) WHERE class_id IS NOT NULL;`
   ~~`CREATE INDEX syllabus_template_idx ...`~~ **[superseded — red-team L:
   dead index dropped; only `syllabus_class_unique` ships]**
4. Backfill per existing class with syllabus_id: copy syllabus row (new id
   via `lower(hex(randomblob(16)))`, class_id set, source_template_id =
   original), copy modules carrying a mapping (helper table or embedded
   join on source ids), copy lessons joining the module mapping, PRESERVE
   current statuses (best available truth for existing classes), then
   UPDATE class.syllabus_id to the copy. Drop helper table after.
5. Statement order must respect FK (or use PRAGMA defer — D1 migrations run
   sequentially; write INSERTs parent-first).

## D4 — Snapshot & contracts

- `KernelSyllabusRow` gains `classId: string | null` and
  `sourceTemplateId: string | null`. Snapshot mapping unchanged otherwise.
- Web display `Syllabus` type gains the same two fields.
- Template gallery = `syllabi.filter(s => s.classId === null)`.
- Class detail keeps `syllabusById(cls.syllabusId)` — pointer now names the
  copy; ZERO churn in that read path.
- Template "in use" = classes whose syllabus row has
  `sourceTemplateId === template.id` (web derives from snapshot).

## D5 — Web changes

- Action `assign-syllabus` → `import-syllabus` (command path
  `/api/classes/:id/import-syllabus`, body `{templateId}`).
- `mapSyllabi` passes through classId/sourceTemplateId.
- `useSyllabus` exposes `templates` (filtered) alongside `syllabi`.
- Syllabus pages = template gallery (list filter + "đang dùng" counts;
  detail = template editor; AddSyllabusModal unchanged → creates template).
- Class Giáo trình tab = full editor: reuse add/edit module + lesson modals
  against the class copy; ImportSyllabusModal (reworked assign modal) lists
  templates only; unassign = confirm dialog → import-syllabus with ""? No —
  new action `remove-curriculum` or DELETE-style POST; decide in phase:
  `POST /api/classes/:id/remove-curriculum` deleting copy + nulling pointer.
- ~~Reducer: import/remove cases update pointer only (snapshot refresh brings
  the tree)~~ **[superseded — red-team B: reducer is a dead fixture; only the
  dead `assign-syllabus` case is deleted, no new cases]**; keep totalLessons
  recompute behavior.
- classes/index.tsx syllabus column unchanged (pointer still resolves).

## D6 — Non-goals (v1)

- No template versioning / re-import / replace-from-template.
- No sync between template and imported copies.
- No editing class copies from the template gallery.
- No changes to scheduled lessons (lesson table, check-in, cancel).

## Load-bearing assumptions

1. Pre-production: no prod D1 exists (runbook 2026-08-20) → breaking
   contract change allowed without dual-write. Verify before cook.
2. Local dev D1 data is pilot-real: backfill must preserve it (no reset).
3. D1 batch handles ~71 statements/class transactionally (docs verified).
4. SQLite `randomblob` id generation is acceptable in migration SQL.
   **[Red-team delta E]** Superseded: use the printf UUID-shaped expression
   (36-char dashed) to match `crypto.randomUUID()` — plain `randomblob(16)`
   mixes two id namespaces forever.

## Red-team deltas (2026-08-25, binding on top of D1-D6)

- **Index set (D3):** `syllabus_template_idx` dropped — dead index (no
  consuming query); only `syllabus_class_unique` ships.
- **Rehearsal method (D3):** no `db:migrate:deploy` (d1-http driver, no
  credentials, repo-banned); rehearsal is an automated in-memory libsql test
  (pattern `apps/server/src/comment-bank-existing-data-migration.test.ts`).
  0009 lands complete (structural + backfill) in ONE commit — alchemy dev
  auto-applies and the name-ledger would skip a later append (0008 incident).
- **Import response (D2):** `{ id: copyId }` (CreatedResponse), not
  `{syllabusId}` — transport reads `json.id` only.
- **Backfill (D3):** org-join `s.org_id = c.org_id`; orphan pointers not
  nulled (UPDATE guarded by EXISTS); idempotent via NOT EXISTS; template
  tree statuses reset to `upcoming` after copying.
- **remove-curriculum (D2):** update pointer null FIRST (FK NO ACTION),
  then child-first deletes, all org-scoped.
