---
phase: 1
title: "Phase 1: Contracts & Server API tạo học viên thủ công + kích hoạt ngay"
status: completed
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Contracts & Server API tạo học viên thủ công + kích hoạt ngay

## Goal

Khôi phục hợp đồng Zod và endpoint `POST /api/students` (kèm tùy chọn ghi danh & kích hoạt lớp ngay lập tức), mở rộng `POST /api/classes/:id/enroll` hỗ trợ `activateNow`, tự động đóng lời mời `pending` trùng email, và khóa phòng thủ chiều sâu tại `createStudentGuard`.

## Files to Create / Modify

- Modify: `packages/api/src/contracts.ts` — thêm `PHONE_DIGITS_REGEX`, `studentCreateSchema`, `StudentCreateInput`, `StudentCreateResponse`, và thêm trường tùy chọn `activateNow?: boolean` vào `enrollStudentSchema`.
- Modify: `apps/server/src/routes/kernel.ts` — thêm route `POST /students`, cập nhật `POST /classes/:id/enroll` để gọi `activateEnrollment` khi `activateNow === true`, và loại trừ `demo-student:%` ở truy vấn kiểm trùng.
- Modify: `apps/server/src/routes/student.ts` — thêm kiểm tra `sessionUser.emailVerified !== true` ngay đầu `createStudentGuard`.
- Modify: `apps/server/src/kernel.test.ts` — cập nhật test dòng 4981 từ kỳ vọng 404 sang 201 cho `POST /api/students`.
- Modify: `apps/server/src/student.test.ts` — thêm bộ test tích hợp cho `POST /api/students`, `POST /api/classes/:id/enroll` (`activateNow: true`), tự đóng `student_invitation` `pending`, khớp nối Portal qua email đã xác thực, và từ chối `403 EMAIL_UNVERIFIED` khi chưa xác thực email.

## Tasks & Steps

### Task 1.1 — Bổ sung `studentCreateSchema` và mở rộng `enrollStudentSchema` trong `@teacher-os/api`

- **Goal:** Cung cấp schema Zod kiểm tra đầu vào cho tạo học viên thủ công (`POST /api/students`) và tùy chọn kích hoạt ngay (`activateNow`) khi ghi danh (`POST /api/classes/:id/enroll`).
- **Target files and symbols:**
  - `packages/api/src/contracts.ts`: `enrollStudentSchema` (dòng 19–22), thêm `PHONE_DIGITS_REGEX`, `studentCreateSchema`, `StudentCreateInput`, `StudentCreateResponse`.
- **Steps:**
  1. Trong `packages/api/src/contracts.ts` ngay trước `enrollStudentSchema` (khoảng dòng 18), khai báo:
     ```ts
     export const PHONE_DIGITS_REGEX = /^[0-9]{1,20}$/;

     export const studentCreateSchema = z
     	.object({
     		name: z
     			.string()
     			.trim()
     			.min(1, "Vui lòng nhập họ tên học viên")
     			.max(120, "Họ tên tối đa 120 ký tự"),
     		phone: z
     			.string()
     			.trim()
     			.refine((v) => v === "" || PHONE_DIGITS_REGEX.test(v), {
     				message: "Số điện thoại chỉ gồm chữ số (tối đa 20 số)",
     			})
     			.default(""),
     		email: z
     			.string()
     			.trim()
     			.toLowerCase()
     			.refine(
     				(v) => v === "" || z.string().email().safeParse(v).success,
     				{ message: "Email không hợp lệ" },
     			)
     			.default(""),
     		parentName: z.string().trim().max(120).default(""),
     		parentPhone: z
     			.string()
     			.trim()
     			.refine((v) => v === "" || PHONE_DIGITS_REGEX.test(v), {
     				message: "Số điện thoại phụ huynh chỉ gồm chữ số (tối đa 20 số)",
     			})
     			.default(""),
     		classId: z.string().trim().optional(),
     		activateNow: z.boolean().default(true),
     	})
     	.strict();
     export type StudentCreateInput = z.infer<typeof studentCreateSchema>;

     export interface StudentCreateResponse {
     	id: string;
     	enrollmentId?: string;
     	activated?: boolean;
     }
     ```
  2. Cập nhật `enrollStudentSchema` trong `packages/api/src/contracts.ts` (dòng 19–22) thành:
     ```ts
     export const enrollStudentSchema = z.object({
     	studentId: z.string().min(1),
     	activateNow: z.boolean().optional(),
     });
     export type EnrollStudent = z.infer<typeof enrollStudentSchema>;
     ```
- **Success criteria:** `studentCreateSchema` và `enrollStudentSchema` biên dịch sạch sẽ, không làm gãy bất kỳ contract nào trong `@teacher-os/api`.
- **Verify:** `pnpm --filter @teacher-os/api check-types` exits 0.

### Task 1.2 — Triển khai `POST /api/students` và mở rộng `POST /api/classes/:id/enroll` trong `apps/server/src/routes/kernel.ts`

- **Goal:** Cho phép giáo viên tạo học viên thủ công trong org (kèm tùy chọn ghi danh + kích hoạt `active` ngay vào lớp, tự đóng lời mời `pending` trùng email) và cho phép `POST /api/classes/:id/enroll` kích hoạt ngay khi `activateNow === true`.
- **Target files and symbols:**
  - `apps/server/src/routes/kernel.ts`: import `studentCreateSchema` và `StudentCreateResponse` từ `@teacher-os/api/contracts`; thêm handler `kernel.post("/students", ...)` ngay sau `kernel.get("/students", ...)` (dòng 314); cập nhật `kernel.post("/classes/:id/enroll", ...)` (dòng 440–491).
- **Steps:**
  1. Import `studentCreateSchema` và `type StudentCreateResponse` từ `@teacher-os/api/contracts` ở đầu file `apps/server/src/routes/kernel.ts`.
  2. Ngay dưới `kernel.get("/students", ...)` (dòng 315), thêm route `kernel.post("/students", async (c) => { ... })`:
     - Kiểm tra `const ctx = c.get("kernelCtx"); if (!ctx) return unauthorized(c);`.
     - Đọc body bằng `const body = await readBody(c, studentCreateSchema); if (!body.ok) return body.response;`.
     - Lấy `const input = body.data; const db = deps.getDb(); const normalizedEmail = input.email.trim().toLowerCase(); const classId = input.classId?.trim() ?? "";`.
     - Nếu `classId !== ""`: gọi `const cls = await findClass(db, classId, ctx.orgId);` — nếu `!cls` trả `c.json({ error: "class not found" }, 404)`.
     - Hàm kiểm tra trùng email trong org (dùng cho cả pre-check lẫn race-backstop trong `catch`, theo pattern `kernel.ts:1252`):
       ```ts
       async function findExistingByEmail() {
       	if (normalizedEmail === "") return undefined;
       	const [row] = await db
       		.select({ id: student.id, name: student.name })
       		.from(student)
       		.where(
       			and(
       				eq(student.orgId, ctx.orgId),
       				sql`lower(trim(${student.email})) = ${normalizedEmail}`,
       				sql`${student.id} NOT LIKE 'demo-student:%'`,
       			),
       		)
       		.limit(1);
       	return row;
       }
       ```
     - Nếu `const existingStudent = await findExistingByEmail()` có kết quả, trả `409`:
       ```ts
       return c.json(
       	{
       		error: `Email này đã được dùng cho học viên ${existingStudent.name}`,
       		code: STUDENT_INVITATION_ERROR_CODES.ALREADY_IN_ORG,
       		existingStudentName: existingStudent.name,
       	},
       	409,
       );
       ```
     - Khởi tạo `const studentId = crypto.randomUUID(); const enrollmentId = cls ? crypto.randomUUID() : undefined; const now = new Date();`.
     - Thực thi `await db.batch(statements)` trong khối `try { ... } catch (cause) { ... }`:
       - Statements:
         1. `db.insert(student).values({ id: studentId, orgId: ctx.orgId, name: input.name, phone: input.phone, email: normalizedEmail, zalo: input.phone, parentName: input.parentName, parentPhone: input.parentPhone, createdAt: now })`
         2. Nếu `normalizedEmail !== ""`: `db.update(studentInvitation).set({ status: "accepted", updatedAt: now }).where(and(eq(studentInvitation.orgId, ctx.orgId), sql\`lower(trim(${studentInvitation.email})) = ${normalizedEmail}\`, eq(studentInvitation.status, "pending")))`
         3. Nếu `cls && enrollmentId`: `db.insert(enrollment).values({ id: enrollmentId, orgId: ctx.orgId, classId: cls.id, studentId, status: "invited" })`
       - Trong `catch (cause)`: gọi `const raced = await findExistingByEmail();` — nếu `raced` tồn tại thì trả `409` với `STUDENT_INVITATION_ERROR_CODES.ALREADY_IN_ORG`; ngược lại `throw cause` (không nuốt nhầm lỗi FK/NOT NULL).
     - Nếu `cls && enrollmentId`:
       - Nếu `input.activateNow`:
         - Gọi `const act = await activateEnrollment(db, ctx.orgId, enrollmentId);`.
         - Nếu `!act.ok`: trả `c.json({ error: "enrollment activation failed" }, 500)`.
         - Trả `c.json({ id: studentId, enrollmentId, activated: true } satisfies StudentCreateResponse, 201)`. (Không gọi `classEnrolledEvent` vì học viên đã ở trạng thái `active`, không cần thông báo "Vào cổng học viên để kích hoạt").
       - Nếu `!input.activateNow`:
         - Gọi `await notify(ctx.orgId, [classEnrolledEvent({ enrollmentId, studentId, className: cls.name })]);`.
         - Trả `c.json({ id: studentId, enrollmentId, activated: false } satisfies StudentCreateResponse, 201)`.
     - Nếu không có `cls`: trả `c.json({ id: studentId } satisfies StudentCreateResponse, 201)`.
  3. Trong `kernel.post("/classes/:id/enroll", ...)` (`apps/server/src/routes/kernel.ts:440-491`):
     - Sau khi `await db.insert(enrollment).values({ id: enrollmentId, orgId: ctx.orgId, classId: cls.id, studentId: input.studentId, status: "invited" });`:
       - Nếu `input.activateNow === true`:
         - Gọi `const act = await activateEnrollment(db, ctx.orgId, enrollmentId);`
         - Nếu `!act.ok`: trả `c.json({ error: "enrollment activation failed" }, 500)`.
       - Ngược lại (`!input.activateNow`): giữ nguyên `await notify(ctx.orgId, [classEnrolledEvent({ enrollmentId, studentId: input.studentId, className: cls.name })]);`.
     - Trả `return c.json({ id: enrollmentId } satisfies CreatedResponse, 201);`.
- **Success criteria:** Route `POST /api/students` và `POST /api/classes/:id/enroll` xử lý đầy đủ tạo học viên, kích hoạt ngay, đóng lời mời `pending`, và race-backstop 409.
- **Verify:** no verification needed (covered by Task 1.4 test suite).

### Task 1.3 — Khóa phòng thủ chiều sâu tại `createStudentGuard`

- **Goal:** Đảm bảo `createStudentGuard` tự kiểm tra `sessionUser.emailVerified === true` kể cả khi được mount độc lập ngoài `studentRoutes`.
- **Target files and symbols:**
  - `apps/server/src/routes/student.ts`: `createStudentGuard` (dòng 119–130).
- **Steps:**
  1. Trong `apps/server/src/routes/student.ts` tại `createStudentGuard` (ngay sau `if (!sessionUser) return c.json(..., 401);`, dòng 124), thêm guard tường minh:
     ```ts
     if (sessionUser.emailVerified !== true) {
     	return c.json(
     		{
     			error: STUDENT_ERROR_CODES.EMAIL_UNVERIFIED,
     			code: STUDENT_ERROR_CODES.EMAIL_UNVERIFIED,
     		},
     		403,
     	);
     }
     ```
- **Success criteria:** Mọi route dùng `createStudentGuard` luôn từ chối `403 EMAIL_UNVERIFIED` nếu `sessionUser.emailVerified !== true`.
- **Verify:** no verification needed (covered by Task 1.4 test suite).

### Task 1.4 — Cập nhật `kernel.test.ts` và bổ sung test tích hợp tại `apps/server/src/student.test.ts`

- **Goal:** Cập nhật test cũ ở `kernel.test.ts:4981` và chứng minh bằng test tự động toàn bộ luồng tạo học viên thủ công, ghi danh & kích hoạt ngay, mở khóa tạo hóa đơn + giao bài tập, tự đóng lời mời `pending`, khớp nối Student Portal, và chặn email chưa xác thực.
- **Target files and symbols:**
  - `apps/server/src/kernel.test.ts` (dòng 4981–4992).
  - `apps/server/src/student.test.ts`.
- **Steps:**
  1. Trong `apps/server/src/kernel.test.ts` (dòng 4981–4992), đổi test `"POST /api/students route is removed and returns 404"` thành `"POST /api/students creates a manual student and returns 201"` kiểm tra `expect(res.status).toBe(201)`.
  2. Mở `apps/server/src/student.test.ts` và bổ sung các test case:
     - `POST /api/students creates a student with only name (no email, no phone) and returns 201`: tạo học viên chỉ có `{ name: "Bé An" }` → trả 201, `GET /api/students` trả về học viên với `email: ""`, `phone: ""`.
     - `POST /api/students creates multiple students without email in the same org without unique collision`: tạo 2 học viên không email → cả hai trả 201.
     - `POST /api/students with classId and activateNow=true creates active enrollment, session_package, and lessons, unlocking invoice and assignment creation`:
       - Tạo lớp IELTS Writing (`POST /api/classes` với `tuitionFee: 3000000`, `sessionsTotal: 8`, `startDate: "2027-01-04"`).
       - Tạo học viên kèm `{ name: "Lê Minh", classId, activateNow: true }` → trả 201 `{ id, enrollmentId, activated: true }`.
       - Tạo hóa đơn (`POST /api/invoices` với `enrollmentId`, `amount: 3000000`, `due: "2027-01-10"`) → trả **201**.
       - Tạo đề Writing ready (`POST /api/assignments/prompts`) và giao bài cho lớp (`POST /api/classes/:id/assignments` với `studentIds: [studentId]`) → trả **201**.
     - `POST /api/students with duplicate email in same org returns 409 STUDENT_ALREADY_IN_ORG; auto-accepts pending student_invitation on creation`:
       - Gửi lời mời `POST /api/students/invite` cho `minh@test.local` → `student_invitation.status` là `"pending"`.
       - Gọi `POST /api/students` với `email: "Minh@Test.Local", name: "Minh"` → trả 201; kiểm tra `GET /api/students/invitations` thấy lời mời đã chuyển sang `"accepted"`.
       - Gọi lại `POST /api/students` với `email: "minh@test.local", name: "Minh 2"` → trả 409 với `code: "STUDENT_ALREADY_IN_ORG"`.
     - `Student created manually with email links automatically when logging into Student Portal with verified email, and rejects unverified email with 403 EMAIL_UNVERIFIED`:
       - Học viên gọi `GET /api/student/me` với session `role: "student", email: "minh@test.local", emailVerified: false` → trả **403** với `code: "STUDENT_EMAIL_UNVERIFIED"`.
       - Học viên gọi `GET /api/student/me` với session `role: "student", email: "minh@test.local", emailVerified: true` → trả **200** với đúng `student.id` và `orgId`.
     - `POST /api/classes/:id/enroll with activateNow=true activates enrollment immediately`:
       - Tạo học viên chưa có lớp, sau đó gọi `POST /api/classes/:id/enroll` với `{ studentId, activateNow: true }` → trả 201, snapshot `enrollments` có `status: "active"`.
- **Success criteria:** Toàn bộ test trong `apps/server/src/student.test.ts`, `apps/server/src/student-invitation.test.ts`, và `apps/server/src/kernel.test.ts` đều pass.
- **Verify:** `pnpm --filter @teacher-os/api check-types && pnpm --filter server check-types && pnpm --filter server test -- src/student.test.ts src/student-invitation.test.ts src/kernel.test.ts` exits 0.

## Verification

- `pnpm --filter @teacher-os/api check-types && pnpm --filter server check-types` exits 0.
- `pnpm --filter server test -- src/student.test.ts src/student-invitation.test.ts src/kernel.test.ts` exits 0.

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
