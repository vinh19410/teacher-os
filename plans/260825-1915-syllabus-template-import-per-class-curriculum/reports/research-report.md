# Research report — template-instantiation patterns (2026-08-25)

External research with citations. Full URLs at the end.

## 1. Copy-on-import vs reference+override

Real products split cleanly:

**COPY (Moodle, Google Classroom):**
- Moodle "Import course data" copies selected activities from another course,
  no user data, NO live link after import (docs.moodle.org/405/en/Import_course_data).
- Moodle 4 "Course copy" duplicates a course as a template — community pattern
  is a "master course template" that teachers copy per section
  (docs.moodle.org/400/en/Course_copy).
- Google Classroom "Reuse post" copies a post; later edits don't affect the
  original. Drive attachments are the hybrid exception (opt-in "make copies")
  (support.google.com/edu/classroom/answer/6272593). "Copy a class" copies
  classwork + grading settings (answer/9093680).

**REFERENCE+OVERRIDE (Canvas Blueprint, Khan Academy):**
- Canvas associated courses subscribe to a blueprint; sync pushes content via a
  migration state machine; locked objects overwrite, unlocked local edits
  become "exceptions" — and retroactive locking can clobber local edits
  (canvas.instructure.com/doc/api/blueprint_courses.html; community threads).
- Khan Academy is pure reference: shared content library, teachers never edit
  content (support.khanacademy.org articles).

**Copy wins when:** the end user owns the content and wants per-class edits
(this feature's core requirement); no central admin pushes updates; small
volume makes storage free; no lock/exception/sync machinery wanted.
Reference wins for centrally-maintained content at scale.

Failure modes of reference+override at small scale: lock granularity +
conflict detection + sync history machinery; unpredictable "exception"
behavior; UX concepts a solo teacher never needs. Copy's only failure mode is
divergence (template improvements don't propagate) — acceptable in a pilot.

**Recommendation: pure COPY-ON-IMPORT, no live reference.** Keep a single
provenance reference (`source_template_id`) for "in use" counts only.

## 2. Re-import semantics

- Canvas: controlled push-sync with conflicts (heavy machinery).
- Moodle re-import: appends duplicates (worst); restore with "delete existing
  contents" is true replace.
- Google Classroom: re-import doesn't exist (fire-and-forget).
- Khan: always-current by construction.

**Recommendation for pilot: version-pin-by-snapshot + NO re-import in v1.**
The copy IS the pin. Template edits affect future imports only. If re-import
is ever requested, ship it as an explicit "Replace curriculum from template"
action with confirm (it resets class progress). Never append-only.

## 3. Data modeling on SQLite/D1 + Drizzle

(a) **Same tables + discriminator** (`syllabus.class_id` NULL = template):
lowest migration cost (add nullable column + indexes); full CRUD reuse — one
Drizzle schema, one Hono route family; snapshot gains one field; org scoping
unchanged. Risk: queries must always discriminate (helper + partial index).
(b) **Separate class_curriculum tables:** doubles schema + query code; drift
risk on every field addition. Only benefit: absolute boundary.
(c) **JSON snapshot column:** one-read curriculum but read-modify-write per
edit, no per-lesson queries/FK, poor schema evolution. Only fit for immutable
audit snapshots.

**Recommendation: (a).** Constraints: unique index on `syllabus(class_id)`
(one live curriculum per class, doubles as duplicate-import guard), partial
index for template listing, repository helpers always append the
discriminator to WHERE.

## 4. Drizzle + D1 deep-copy mechanics (verified against docs)

- D1 `db.batch()` IS a transaction ("if a statement fails it aborts or rolls
  back the entire sequence"), statements run sequentially
  (developers.cloudflare.com/d1/worker-api/d1-database). It is the ONLY way to
  atomic multi-table insert on D1 — manual BEGIN/COMMIT does not work
  (drizzle-orm issue #758).
- Limits are per-statement: 100 bound params, 100KB SQL, 30s whole batch; no
  official statement-count cap (developers.cloudflare.com/d1/platform/limits).
- Size check: ~60 lessons + ~10 modules + 1 syllabus ≈ 71 single-row INSERTs
  with ≤12 params each — orders of magnitude under every limit.
- Handler recipe: pre-SELECT template tree; generate ALL ids server-side with
  crypto.randomUUID() (deterministic FK wiring, safe retries); preserve
  `position` values as-is; one `db.batch([...])`; duplicate import → SQLite
  unique-constraint error → map to 409.
- Migration-time backfill reuses the same algorithm; chunk per class; D1 docs
  advise chunking large data migrations (~1000 rows per apply).
  d1-http driver guidance: orm.drizzle.team/docs/guides/d1-http-with-drizzle-kit.

## 5. Edge cases

- Class with no template: valid empty state; UI offers "start blank" vs
  "import from template".
- Template deleted after imports: copies are independent (deep copy); keep
  `source_template_id` FK `ON DELETE SET NULL` (provenance only — RESTRICT
  would block template deletion pointlessly, CASCADE would delete live class
  curricula).
- Duplicate import by same class: unique index on class_id → 409.
- totalLessons divergence after edits: compute live from the tree (web already
  does); never hand-maintain the column on class copies.
- Lesson status per class: status belongs to the copy. NEW imports reset all
  to 'upcoming' (current/done is class progress). Template rows keep a status
  default of 'upcoming'.

## Final recommendation

Copy-on-import with same-table discriminator `class_id NULL = template`;
version-pin-by-snapshot with no re-import in v1 (explicit replace action
later if asked); idempotent migration backfill reusing the copy algorithm
(server-generated UUIDs, preserved positions, one db.batch per class, unique
index as the duplicate guard).

## Sources

- https://canvas.instructure.com/doc/api/blueprint_courses.html
- https://community.canvaslms.com/t5/Canvas-Resource-Documents/Blueprint-Sync-Functionalities/ta-p/628548
- https://community.canvaslms.com/t5/Canvas-Question-Forum/Exception-when-syncing-blueprint/m-p/593686
- https://community.canvaslms.com/t5/Higher-Ed-Canvas-Users/Tips-for-Designing-and-Maintaining-Blueprint-Courses/m-p/271129
- https://docs.moodle.org/405/en/Import_course_data
- https://docs.moodle.org/502/en/Restore
- https://docs.moodle.org/400/en/Course_copy
- https://support.google.com/edu/classroom/answer/6272593
- https://support.google.com/edu/classroom/answer/9093680
- https://support.khanacademy.org/hc/en-us/articles/23273435151501-How-do-I-add-or-edit-a-course-on-my-Khan-Academy-class
- https://support.khanacademy.org/hc/en-us/articles/115000772311-How-do-I-create-assignments-for-my-class-
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/d1/worker-api/d1-database/
- https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1
- https://orm.drizzle.team/docs/batch-api
- https://orm.drizzle.team/docs/guides/d1-http-with-drizzle-kit
