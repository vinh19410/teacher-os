# Scout report — syllabus domain inventory (2026-08-25)

Read-only scout of the current shared-tree syllabus model. Evidence for the
template-import refactor plan.

## 1. Server routes (apps/server/src/routes/kernel.ts)

| Lines | Route | Behavior | Org-scope |
|---|---|---|---|
| 165-181 | helpers | `findSyllabus` filters id+orgId; `resolveSyllabusId`: ""→null, foreign/missing→undefined (404) | yes |
| 183-205 | helper | `findModule` requires module id + syllabus id + org id | yes |
| 299-339 | POST /api/classes | resolves input.syllabusId by org, stores pointer only — no clone | yes |
| 341-369 | POST /api/classes/:id/assign-syllabus | validates class+syllabus org, updates classTable.syllabusId pointer only | yes |
| 534-570 | GET/POST /api/syllabi | GET returns snapshot.syllabi; POST creates metadata row (no tree) | yes |
| 572-613 | POST /api/syllabi/:id/modules | parent syllabus+org check; position = max+1 | yes |
| 615-640 | POST /api/syllabi/:id/modules/:mid | findModule parent check; edit title/description | yes |
| 642-681 | POST .../lessons | module parent+org check; position = max+1; status trio | yes |
| 683-723 | POST .../lessons/:lid | join lesson→module, checks lesson/module/syllabus/org; full replace | yes |

All POST kernel routes go through Origin + JSON middleware (kernel.ts:106-124);
missing kernelCtx → 401.

## 2. Snapshot (apps/server/src/routes/snapshot.ts)

- 64-136: loadSnapshot parallel org-scoped selects on syllabus,
  syllabus_module, syllabus_lesson; order position then createdAt.
- 145-180: lessonsByModule / modulesBySyllabus maps — tree built from FK ids,
  no class dimension.
- 226-235: syllabi[] mapping with stored totalLessons on the wire (web
  recomputes for display).

## 3. Contracts (packages/api/src/contracts.ts)

- 89-108: assignSyllabusSchema (syllabusId string, "" unassigns);
  classCreateSchema (syllabusId default "").
- 110-155: syllabusCreateSchema (type/skills superRefine), moduleUpsertSchema,
  lessonUpsertSchema (status done|current|upcoming).
- 225-243: KernelClassRow.syllabusId: string | null.
- 256-294: KernelSyllabusRow/ModuleRow/LessonRow — no classId anywhere.
- 306-325: KernelLessonRow (scheduled lesson) is a separate concept:
  classId+enrollmentId+day/time/status completed|upcoming|cancelled|absent.

## 4. Web data layer

- apps/web/src/lib/data-actions.ts:42-96 — add-class carries syllabusId;
  add-syllabus; assign-syllabus(classId, syllabusId); add/edit-module and
  add/edit-lesson keyed by syllabusId (+moduleId/lessonId).
- apps/web/src/lib/repos/kernel.ts:52-74 — assign-syllabus →
  POST /api/classes/:id/assign-syllabus; add-syllabus → POST /api/syllabi.
  108-137 nested module/lesson paths. 148-159 mapKernelSnapshot → mapSyllabi.
- apps/web/src/lib/repos/syllabus.ts:16-45 — mapSyllabi recomputes
  totalLessons = sum(lessons) (:27); maps empty description/objectives/
  materials to undefined/—; keeps status trio.
- apps/web/src/lib/repos/use-syllabus.ts:17-25 — useSyllabus reads
  data.syllabi; writes stay on the command bus.
- apps/web/src/lib/data-provider.tsx:53-55,133-136 — exposes syllabusById,
  classesForSyllabus (filter class.syllabusId).
- apps/web/src/lib/data-store-reducer.ts:151-261 — add-syllabus, assign
  pointer-only (:164-170), add/edit module/lesson with totalLessons recompute.
- apps/web/src/lib/mock-data.ts:95-129 — display types Syllabus/SyllabusModule/
  SyllabusLesson; ClassGroup.syllabusId.

## 5. Web UI consumers

| File | R/W | Notes |
|---|---|---|
| routes/_auth/syllabus/index.tsx:22-47,73-120 | R + modal | list via useSyllabus; finds classes by c.syllabusId===sy.id; AddSyllabusModal + navigate on server id |
| routes/_auth/syllabus/$syllabusId.tsx:61-86,167-220 | R + writes | tree render; edit module/lesson; assign modal; counts done/current |
| routes/_auth/classes/$classId.tsx:48-59,105-116,167-181 | R + assign | sy = syllabusById(cls.syllabusId); Giáo trình tab renders SyllabusProgress; AssignSyllabusModal |
| routes/_auth/classes/index.tsx:47-56 | R | class table shows syllabus name via pointer |
| components/syllabus/syllabus-progress.tsx:24-72 | R | flattens lessons; done count; renders statuses; no mutation |
| modals/add-class-modal.tsx:47,121-122,191-204 | R+W | syllabus select from data.syllabi; payload syllabusId |
| modals/assign-syllabus-modal.tsx:21-39,66-73 | R+W | dispatches assign-syllabus |
| modals/add-syllabus-modal.tsx | W | metadata + skills validation only |
| modals/add-module-modal.tsx, edit-module-modal.tsx | R+W | keyed by syllabusId |
| modals/add-lesson-modal.tsx, edit-lesson-modal.tsx | R+W | status trio input; keyed by syllabusId/moduleId |

## 6. Tests locking current semantics

Server (apps/server/src/kernel.test.ts):
- :796 create syllabus→module→lesson ordered tree
- :829 snapshot echoes type/skills; :839/:856 ielts/communication validation
- :887 module edit foreign syllabus 404; :900 lesson edit foreign module 404
- :956-1005 cross-org isolation (org B sees nothing, edits 404, tree unchanged)
- :1444 assign then unassign + notes; :1474 foreign-org assign 404

Web:
- repos/syllabus.test.ts:65 totalLessons recompute; :69 type/skills; :74/:79
  placeholders; :88 status trio; :93 zero-lesson total; :115 empty org
- repos/kernel.test.ts:231-240 totals; :368-399 nested paths; :401-410 assign path
- data-store-reducer.test.ts:117 add-syllabus keeps payload total;
  :134/:146 add-module totals; :167/:187 lesson recompute; :211 edit-module;
  :223 assign-syllabus sets pointer only
- syllabus-peel.contract.test.ts:18-52 read via useSyllabus/mapSyllabi, no seed
- classes-peel.contract.test.ts:60 assign modal repo-read/bus-write
- kernel-runtime.contract.test.ts:149 navigate only on refreshed server id;
  :248-251 scheduled "lesson-edit" ≠ curriculum "edit-lesson"

E2E: apps/e2e/specs/class-operations.spec.ts — scheduled lessons/check-in only;
no syllabus coverage.

## 7. Two status domains — never conflate

- Curriculum status (shared today): syllabus_lesson.status
  (packages/db/src/schema/syllabus.ts:54-62) → snapshot → mapSyllabi →
  syllabus pages + class Giáo trình. Mutated only by add/edit-lesson UI +
  server syllabus lesson handlers.
- Scheduled lesson status: lesson.status (schema/lesson.ts:24-43), per
  class+enrollment, check-in/cancel/edit endpoints kernel.ts:354-513,
  generateScheduleLessons kernel.ts:74-108 (triggered by student creation).
  Top-level snapshot.lessons; repos/lessons.ts maps them.

## 8. Refactor implication

Assignment is pointer-only today; editing a syllabus changes what every
assigned class reads. The copy boundary must be introduced at import time; all
reads/writes keyed by shared syllabusId migrate to per-class curriculum
identity. Invariants to keep: org isolation, position ordering, status trio,
totalLessons recompute, scheduled-lesson separation.
