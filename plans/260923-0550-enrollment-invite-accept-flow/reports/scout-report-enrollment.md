# Scout Report — Enrollment Flow (codebase hiện trạng)

Ngày scout: 2026-09-23. Phạm vi: toàn bộ monorepo teacher-os.

## 1. Data model (packages/db — Drizzle + SQLite/D1)

- `packages/db/src/schema/enrollment.ts` — bảng `enrollment`: **chỉ có `id, orgId, classId, studentId, createdAt`, KHÔNG có cột `status`**. Unique index `enrollment_class_student_uq` trên `(classId, studentId)` (dòng 35-38); comment dòng 13-16: "membership of a student in a class is exactly one enrollment".
- `packages/db/src/schema/student.ts` — `id, orgId, name, phone, email, zalo, parentName, parentPhone, createdAt`. Comment dòng 18-21: email + SĐT là "danh tính đăng nhập tương lai", chưa unique, chưa có user row.
- Migration duy nhất liên quan: `packages/db/src/migrations/0001_opposite_loki.sql` (dòng 21-33 tạo bảng enrollment). Scripts: `db:generate` (drizzle-kit), `db:migrate:deploy`.
- Enum status hiện có ở bảng khác: `session_package.status` default `"active"` (`schema/session-package.ts:39`), `class.status` default `"active"` (`schema/class.ts:27`), lesson `"done"|"current"|"upcoming"` (`contracts.ts:697`). Enrollment hôm nay: **tồn tại = đang học** (boolean vô hình).

## 2. Server API (apps/server — Hono, kernel.ts)

- `POST /api/classes/:id/enroll` — `apps/server/src/routes/kernel.ts:601-672`; zod `enrollStudentSchema = z.object({ studentId })` (`packages/api/src/contracts.ts:25-28`). Một `db.batch` atomic tạo: enrollment + `sessionPackage` (status hardcode `"active"`, kernel.ts:654) + chuỗi lesson từ lịch lớp (`generateScheduleLessons`). Trùng → 409 "student already enrolled" (623-634); sai org → 404.
- `POST /api/students` — kernel.ts:512-597: tạo student, nếu có `classId` thì enroll luôn (enrollment + package + lessons cùng batch); không lớp thì KHÔNG tạo gói (nhánh D2, comment 590-594).
- Snapshot đọc enrollments: `apps/server/src/routes/snapshot.ts:146-148` (query), map ra `KernelEnrollmentRow = {id, classId, studentId, createdAt}` (`contracts.ts:663-668`) tại snapshot.ts:295-300.
- **Không có endpoint update/unenroll enrollment** — cần viết mới (pattern tham khảo `POST /classes/:id/tuition-fee` kernel.ts:999, POST-only).

## 3. Frontend (apps/web)

- `apps/web/src/components/modals/add-student-modal.tsx` — modal "+ Thêm học viên" 2 tab `existing | create` (dòng 12), label "Học viên có sẵn"/"Tạo học viên mới" (165/173); submit action `enroll-student` (88-99); picker lọc `cls.studentIds` (43-48). Email field help text: "Dùng làm tài khoản đăng nhập cho học viên sau này" (245).
- Wire action: `apps/web/src/lib/data-actions.ts:84-89` → `apps/web/src/lib/repos/kernel.ts:52-59` (map sang POST enroll) → reducer `apps/web/src/lib/data-store-reducer.ts:127-139` (append vào `class.studentIds`).
- Derive roster: `apps/web/src/lib/repos/classes.ts:58` — `studentIds: rosterByClass.get(row.id) ?? []` (từ enrollments). `apps/web/src/lib/repos/enrollments.ts` — `mapEnrollments` (passthrough) + `classesByStudent`.
- Roster tab: `apps/web/src/routes/_auth/classes/$classId.tsx` (tab `"roster"` 112/242/260, KPI sĩ số 223, nút "+ Thêm học viên" 217). Nợ học phí join qua enrollment: `apps/web/src/lib/tuition-from-kernel.ts:53-66`.
- **Chưa có badge/filter/switch nào trên enrollment status.**

## 4. Invitation mechanism

Không tồn tại. Grep `invit` toàn repo chỉ ra nhiễu (từ "investigate"). Không invite token, không email invite.

## 5. Student ↔ User

Không liên kết. `student` không có `userId`. Plan `plans/260922-0716-student-create-identity-fields/plan.md` non-goals: KHÔNG portal, KHÔNG user row, KHÔNG FK, KHÔNG unique — "dữ liệu login thật là plan sau".

## 6. Testing

- Server: vitest (`apps/server/package.json` `"test": "vitest run"`). `apps/server/src/kernel.test.ts` (helper `findEnrollment` 51-58; invoice-bound-to-enrollment 1271-1336), `kernel-occurrence.test.ts:157,436-444`.
- Web: `apps/web/src/lib/add-student-enroll.contract.test.ts`, `apps/web/src/lib/repos/enrollments.test.ts`.
- E2E Playwright (apps/e2e, `pnpm e2e`): `specs/enroll-existing-student.spec.ts`, `class-roster-tuition-debt.spec.ts`, `class-operations.spec.ts`.
- Skeleton parity: `packages/api/src/skeleton.ts` — set-equality đếm lesson theo enrollment.

## 7. Docs / plans liên quan

- `plans/260829-1115-122-class-detail-enroll-existing-student-picker/plan.md` — tab "Học viên có sẵn" + endpoint enroll (issue #122); batch atomic, 409 trùng, KPI sĩ số.
- `plans/260922-0716-student-create-identity-fields/plan.md` — identity fields; D1 gói derive từ lớp / D2 không lớp = không gói; non-goal portal.
- `plans/260816-1821-class-detail-enroll-student-into-viewed-class/` — enroll đầu tiên.
- `plans/260922-0859-student-profile-class-instead-of-package/`, `plans/260922-0935-student-list-class-instead-of-package/` — profile/list học viên hiển thị lớp.
- `plans/260828-0452-project-class-sessions-before-first-enrollment/` — projection buổi học khi lớp CHƯA có enrollment.
- `docs/project-overview-pdr.md` (15, 23) — kernel tables gồm enrollment.

## Risks đã ghi nhận

1. Thêm status đụng invariant "exactly one enrollment per (classId, studentId)" — re-enroll sau khi rời lớp phải quyết thiết kế sớm.
2. Lesson series + package sinh NGAY lúc enroll (kernel.ts:645-669) — với "invited" cần quyết thời điểm sinh; ảnh hưởng skeleton parity + `rosterDebtByStudent`.
3. Roster, KPI sĩ số, picker, debt join đều coi enrollment = đang học — invited phải được tách ở các chỗ này.
4. Snapshot + `KernelEnrollmentRow` chưa có field status → thay đổi contract (file có convention `| string` forward-compat).
5. Không có endpoint update enrollment → viết mới theo pattern POST-only.
