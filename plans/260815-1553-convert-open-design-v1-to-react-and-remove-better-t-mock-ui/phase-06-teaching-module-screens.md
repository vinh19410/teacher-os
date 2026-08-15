---
phase: 6
title: "Teaching module screens"
status: pending
priority: P1
effort: "10h"
dependencies: [5]
---

# Phase 6: Teaching module screens

## Overview
Implement the "Giảng dạy" section: Classes (+detail with 4 tabs) and Syllabus (+detail with full module/lesson tree, CRUD modals) — the most interaction-heavy screens in the export.

## Requirements
- Functional — Classes (`/classes`): filter chips (Tất cả / Online / Offline / Đang học); table (name + level · skill · mode, assigned syllabus name or "Chưa gán", sĩ số count, progress bar + "n/total buổi", schedule, status badge); "+ Tạo lớp" modal (name required, level/skill/mode selects, syllabus select with — Chưa gán —, schedule text, total default 12, start date) → saveClass → appended row.
- Functional — Class detail (`/classes/$classId`): header card (name, meta line level · skill · mode + Lịch + Bắt đầu, Đổi syllabus + Thêm học viên buttons); 4 stat cards (học viên, buổi đã học n/total, %, bài trong syllabus); tabs — Học viên (roster table with Band target, remaining, Rủi ro/Ổn badge, click → student detail), Giáo trình (syllabus progress rendering with module accordions + lesson dots/badges, or empty state "Lớp chưa được gán syllabus"), Lịch học (class lessons table), Ghi chú (textarea + Lưu ghi chú).
- Functional — Syllabus (`/syllabus`): filter chips (Tất cả / Writing / Speaking / Reading); card grid (2 cols) with skill/level tags, total buổi meta, name, description, progress bar + n/done, "Đã gán" class badges or "Chưa gán", hover elevation; "+ Tạo syllabus" modal (name required, level/skill, description, total default 10) → creates and opens detail.
- Functional — Syllabus detail (`/syllabus/$syllabusId`): header card (tags, name, description, "Gán vào lớp" button); 4 stat cards (tổng buổi, đã dạy green, đang học accent, module count); "Buổi hiện tại" highlight card when a lesson has status current; module list — collapsible heads (title, Sửa link-btn, n/m count), lesson rows (dot done/current/upcoming, title, materials, "Mục tiêu:" line, status badge, Sửa link-btn), "+ Thêm buổi học" ghost button per module; "+ Thêm module" header button; empty module state; bottom "Lớp đang dùng syllabus này" table when assigned.
- Functional — Modals: add/edit module (title required, description), add/edit lesson (title required, objectives, materials, status select Sắp tới/Đang học/Đã dạy), assign-syllabus (class select + syllabus select with preselection) — all persisting through store actions from Phase 3.
- Non-functional: `totalLessons` recomputed as sum of module lessons after every module/lesson mutation (export `saveModule`/`saveLesson` behavior).
- Non-functional: class/syllabus detail routes render `notFoundComponent` on store lookup miss (red-team) — reload of a runtime-created id shows not-found, never a crash.

## Architecture
```
apps/web/src/routes/_auth/
├── classes/index.tsx
├── classes/$classId.tsx      # 4 tabs local state
├── syllabus/index.tsx
└── syllabus/$syllabusId.tsx  # module tree + CRUD wiring
apps/web/src/components/
├── modals/{add-class,add-syllabus,assign-syllabus,add-module,edit-module,add-lesson,edit-lesson}-modal.tsx
└── syllabus/{syllabus-module-list.tsx, syllabus-progress.tsx}
```
`syllabus-progress.tsx` is shared by class-detail "Giáo trình" tab and syllabus detail (export reuses `renderSyllabusProgress`). Module collapse = local state per module id in a `Set`.

## Related Code Files
- Create: 4 route files above
- Create: 7 modal components + 2 syllabus components
- Reference: export lines 427–469 (classes/syllabus markup), 1056–1244 (render functions incl. renderSyllabusProgress, openClass, openSyllabus), 1311–1501 (modals + save functions)

## Implementation Steps
1. Classes list + filters + create modal.
2. Class detail: header + stats + roster/schedule/notes tabs; "Giáo trình" tab stub calling shared progress component (built in step 4).
3. Syllabus list + cards + create modal (auto-navigate to new detail, matching export `openSyllabus(newId)`).
4. Shared `syllabus-progress.tsx` + `syllabus-module-list.tsx` with collapsible modules (export `toggleModule`), lesson dots, edit link-btns.
5. Syllabus detail: header, stats, current-lesson banner, module tree wiring all CRUD modals, assigned-classes table.
6. All 7 modals: controlled forms, required-field error divs (export `*-error` pattern), submit → store action → close → dependent views re-render.
7. Side-by-side comparison vs export at 1440px and 820px.

## Success Criteria
- [x] Classes table + filters exact; create modal validation blocks empty name
- [x] Class detail 4 tabs complete; roster links navigate to student detail
- [x] Syllabus cards show correct progress and assignment badges
- [x] Full CRUD loop: create syllabus → add module → add lesson → edit lesson status to done → counts update (module 1/3, totalLessons +1) → assign to class → class "Giáo trình" tab reflects it
- [x] Module collapse/expand works; "Buổi hiện tại" banner appears for syllabi with a current lesson
- [x] Empty states render (class without syllabus; new empty syllabus)
- [x] Detail routes render not-found on unknown ids; mobile interaction sweep repeated at 390px as each screen lands

<!-- Updated: Red Team - notFound on detail routes, mobile sweep inline -->

## Risk Assessment
- **Risk: modal count and prop plumbing gets messy** (7 modals × routes). Mitigation: single generic `Modal` shell from Phase 3; each modal = form fields + submit handler calling one store action; no shared modal state.
- **Risk: assign-syllabus preselection logic** (from syllabus detail it preselects that syllabus; from class detail it preselects class's current syllabus). Port export `openModal('assign-syllabus', id)` param passing exactly.
- **Risk: ID generation for new entities** — export uses `'c'+(len+1)` (collision-prone) and `'sy'+n+'-'+Date.now().toString(36)`. Use `crypto.randomUUID()`-suffixed ids in store actions; display ids never shown for these entities so no visual impact.
