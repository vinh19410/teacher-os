# Project Overview PDR

Teacher OS is a teacher-first operations app for managing classes, students, syllabi, lessons, invoices, assignments, reports, notifications, and feedback. The durable contract is class-centric: a teacher signs in, gets an org-scoped workspace, and the UI reads and writes the kernel through server-owned APIs instead of local mock state.

## Who this serves

- Teachers who need a single workspace for day-to-day class operations.
- AI collaborators that need stable entry points for product, API, schema, and runtime changes.

## Durable product decisions

| Decision | Owner |
| --- | --- |
| Only `teacher`-role accounts are bootstrapped into an org with a `teacher` membership when no membership exists yet; a `student` role receives 403 `ACCOUNT_STUDENT_ROLE`. Accounts carry an app role (`user.role`): student-portal sign-ups are `student` and cannot sign in on the teacher app; teacher accounts cannot sign in on the student portal (403 `ACCOUNT_TEACHER_ROLE`). | [apps/server/src/app.ts](../apps/server/src/app.ts) and [packages/db/src/schema/membership.ts](../packages/db/src/schema/membership.ts) and [packages/auth/src/role.ts](../packages/auth/src/role.ts) |
| The persistent kernel is org-scoped and centers on `organization`, `membership`, `student`, `class`, `enrollment`, `session_package`, and syllabus tables. | [packages/db/src/schema/index.ts](../packages/db/src/schema/index.ts) |
| Curriculum data stays separate from delivered lessons. | [packages/db/src/schema/syllabus.ts](../packages/db/src/schema/syllabus.ts) and [packages/db/src/schema/lesson.ts](../packages/db/src/schema/lesson.ts) |
| The web app stays behind a load gate until the first kernel snapshot resolves. | [apps/web/src/lib/data-provider.tsx](../apps/web/src/lib/data-provider.tsx) |
| Kernel writes are POST-only JSON commands; the client refreshes the snapshot after each write (creation endpoints return the server id, bulk replacements acknowledge with ok). | [apps/web/src/lib/repos/kernel.ts](../apps/web/src/lib/repos/kernel.ts) and [apps/server/src/routes/kernel.ts](../apps/server/src/routes/kernel.ts) |
| A syllabus lesson's `kind` (`lesson`/`midterm`/`final`) is curriculum content copied with the template; `status` is per-class progress that resets to `upcoming` on copy. | [packages/db/src/schema/syllabus.ts](../packages/db/src/schema/syllabus.ts) and [apps/server/src/routes/kernel.ts](../apps/server/src/routes/kernel.ts) |
| `assignment_prompt` is an org-scoped bank of unassigned IELTS 4-skill prompts carrying the auto-grading answer key (no student/class FK); delivering a prompt to a class writes a `class_assignment` snapshot row (its `title` is frozen at assign time), and the `assignment` table stays per-student grading fed by the server. | [packages/db/src/schema/assignment-prompt.ts](../packages/db/src/schema/assignment-prompt.ts), [packages/db/src/schema/class-assignment.ts](../packages/db/src/schema/class-assignment.ts), and [apps/server/src/routes/assignments/index.ts](../apps/server/src/routes/assignments/index.ts) |
| Deferred feature clusters are hidden by static flags in code, not runtime toggles; the parent-reports cluster ships disabled (`PARENT_REPORTS_ENABLED = false`) with backend, schema, and components untouched so one constant flip re-enables it. | [apps/web/src/lib/features.ts](../apps/web/src/lib/features.ts) |
| Better Auth is the sign-in boundary, and the auth route redirects unauthenticated users to login. | [apps/web/src/routes/_auth/route.tsx](../apps/web/src/routes/_auth/route.tsx) and [apps/server/src/index.ts](../apps/server/src/index.ts) |
| Students originate from student portal provisioning on first portal login (verified email + earliest global org); teachers no longer create students manually and only enroll existing students into classes via POST /api/classes/:id/enroll. | [apps/server/src/routes/student.ts](../apps/server/src/routes/student.ts) and [apps/server/src/student-provisioning.ts](../apps/server/src/student-provisioning.ts) |
| Enrollment có vòng đời trạng thái `invited` → `active`: thêm học viên vào lớp tạo `invited` (chưa có gói/buổi học); `active` chỉ sinh khi được kích hoạt qua `POST /api/enrollments/:id/accept` (nút Kích hoạt admin) hoặc qua portal `POST /api/student/enrollments/:id/accept`; hủy lời mời (DELETE) chỉ áp dụng cho `invited`; invoices và assignments chỉ chấp nhận enrollment `active`. | [packages/db/src/schema/enrollment.ts](../packages/db/src/schema/enrollment.ts), [apps/server/src/routes/kernel.ts](../apps/server/src/routes/kernel.ts), và [apps/server/src/routes/student.ts](../apps/server/src/routes/student.ts) |

## Product requirements

- Keep every user-facing data change org-scoped.
- Keep derived values derived in the adapter or snapshot layer, not duplicated as new source-of-truth columns.
- Keep the kernel transport contract stable unless the web and server owners change together.
- Keep the current auth/bootstrap flow intact unless a new workspace model is explicitly chosen.
- Keep the UI on the kernel snapshot contract; do not reintroduce local mock state as the runtime source of truth.

## Acceptance criteria for future changes

- The signed-in teacher can reach a populated org workspace without manual tenant setup.
- The main data flows still work through the kernel snapshot and command bus.
- Product changes still point to the owning source file instead of copying behavior into docs.

## Student Multi-Org and Invitation Model

- **Org-Scoped Student Profiles:** Instead of a single global student profile, `student` records are scoped by `org_id` with unique constraint `UNIQUE(org_id, lower(trim(email)))`. One email address can study across multiple teacher organizations.
- **Teacher Invitations (`student_invitation`):** Teachers invite students via email from `/students`. Pending invitations are unique per `(org_id, lower(trim(email)))`.
- **Portal Notifications & Acceptance:** Students receive real-time notifications in their portal bell icon. Accepting creates their student profile in the target organization.
- **Multi-Org Switcher:** Students in multiple organizations switch active context via header `x-student-org-id` and the `OrgSwitcher` dropdown without losing session authentication.

