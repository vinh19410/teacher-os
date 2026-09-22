---
phase: 1
title: "DB + Contracts + Server — cột email, SĐT digits-only, gói derive từ lớp"
status: todo
priority: P2
effort: "2h"
dependencies: []
---

# Phase 1: DB + Contracts + Server

## Goal (Overview)

Persist danh tính học viên (SĐT digits-only + email) và chuyển server sang logic gói mới: **D1** — tạo trong lớp thì gói derive từ lớp (`sessionsTotal` / `tuitionFee ?? 0` / `mode`); **D2** — tạo không lớp thì không tạo package row. Web consumer chưa đụng ở phase này (fixtures web sẽ đỏ check-types đến phase 2 — chủ đích, theo quy ước "đổi contract ⇒ đổi server + web cùng nhau" của `docs/code-standards.md`, tách phase để review).

## Context Links

- `packages/db/src/schema/student.ts:9-26` — bảng `student`: chỉ person fields, invariant 3 ("no package columns on student"); `phone`/`zalo` đang `notNull().default("")`
- `packages/api/src/contracts.ts:9-20` — `studentCreateSchema` hiện tại: `total/price/mode` có default 10/400000/Online; `phone` default `""` (optional)
- `packages/api/src/contracts.ts:634-641` — `KernelStudentRow` (id/name/phone/zalo/parentName/parentPhone) — thiếu `email`
- `apps/server/src/routes/kernel.ts:510-602` — `POST /students`: `findClass` select `{id, schedule, sessionsTotal, startDate, syllabusId}` (`:178-190`), `packageValues` từ input (`:545-554`), nhánh lớp (`:556-585`) và nhánh không lớp parked package (`:586-597`)
- `apps/server/src/routes/snapshot.ts:270-278` — snapshot map `students` (nơi duy nhất build `KernelStudentRow`)
- `packages/db/src/migrations/0007_class_type_skills.sql` — precedent: file drizzle-kit generate + UPDATE normalize data appendix (cùng file, tách `--> statement-breakpoint`)
- `apps/server/src/session-package-parked-migration.test.ts:1-70` — precedent test migration trên data cũ (seed pre-migration bằng raw SQL, apply theo file)

## Key Insights

- `findClass` (`kernel.ts:178-190`) dùng chung cho nhiều route (notes, enroll, curriculum) — thêm cột vào select là additive, không route nào bị ảnh hưởng.
- Nhánh không lớp hiện parked package với `enrollmentId: null` (issue #104). D2 xoá hẳn insert này — precedent ngược: test `kernel.test.ts:1557` ("without classId the package parks on the student") phải rewrite thành "không có package".
- zod object non-strict **strips** unknown keys: client cũ gửi `total/price/mode` thừa không lỗi — nhưng `phone` có khoảng trắng sẽ 400 ngay. Monorepo deploy server+web cùng lúc nên không có cơ chế tương thích ngang.
- Migration normalization phone: giá trị legacy chỉ chứa charset form cũ cho phép `[0-9\s+]` (`add-student-modal.tsx:11`) — `replace(replace(phone,' ',''),'+','')` đủ cho charset đó; junk lạ hơn (nhập qua API trực tiếp) nằm ngoài, ghi nhận không sửa.

## Requirements

- [ ] Cột `student.email` (text, notNull, default "") + migration 0021 kèm UPDATE normalize phone legacy
- [ ] `studentCreateSchema`: bỏ `total/price/mode`; `phone` bắt buộc regex `^[0-9]+$`; `email` bắt buộc (`z.email()`, zod v4 catalog ^4.4.3)
- [ ] `KernelStudentRow` + `email`; snapshot map trả `email`
- [ ] `POST /students`: insert email; nhánh lớp derive package từ lớp; nhánh không lớp KHÔNG tạo package; enrollment + `generateScheduleLessons` giữ nguyên
- [ ] `POST /classes/:id/enroll` KHÔNG đổi logic (chỉ sửa comment "field-identical" — nguồn giá trị giờ khác nhau)
- [ ] Server tests: helper `addStudent` + mọi body direct theo schema mới; thêm test 400 (phone thiếu/chữ/khoảng trắng, email thiếu/sai format); rewrite test parked-package; test migration

## Architecture (data flow)

```
POST /api/students {name, phone(digits), email, parentName?, classId?}
  ├─ readBody(studentCreateSchema) → 400 nếu phone/email vi phạm
  ├─ findClass(classId, orgId) → {schedule, sessionsTotal, startDate, mode, tuitionFee} (org-scoped, 404 nếu lạ)
  ├─ insert student (email, zalo = phone — đã digits-only nên chỉ là copy)
  ├─ classId: insert enrollment → insert sessionPackage{total: cls.sessionsTotal,
  │        price: cls.tuitionFee ?? 0, mode: cls.mode} → generateScheduleLessons(...)  [một db.batch atomic]
  └─ không classId: KHÔNG insert sessionPackage (D2)
GET /api/kernel → snapshot.students[] giờ có email
```

## Related Code Files

- Modify: `packages/db/src/schema/student.ts` — thêm cột `email`
- Create: `packages/db/src/migrations/0021_*.sql` (+ `meta/_journal.json`) — sinh bằng `pnpm db:generate`, append UPDATE bằng tay theo precedent 0007
- Modify: `packages/api/src/contracts.ts` — `studentCreateSchema`, `KernelStudentRow`
- Modify: `apps/server/src/routes/kernel.ts` — `findClass` select, `POST /students`
- Modify: `apps/server/src/routes/snapshot.ts` — students map thêm `email`
- Modify: `apps/server/src/kernel.test.ts` — helper + tests theo schema mới
- Create: `apps/server/src/student-identity-migration.test.ts` — migration test theo pattern parked-migration test

## Implementation Steps

1. `packages/db/src/schema/student.ts` — thêm sau dòng `phone` (giữ invariant 3: vẫn không có package column):

   ```ts
   /** Email học viên — danh tính đăng nhập tương lai (username) cùng `phone`.
    * User-action ghi: tạo học viên (POST /api/students). Row legacy giữ "".
    * Chưa unique + chưa có user row — dành cho plan student-login sau này. */
   email: text("email").notNull().default(""),
   ```

2. Root chạy `pnpm db:generate` (script root `db:generate` → drizzle-kit generate, config `packages/db/drizzle.config.ts`). Kiểm tra file `0021_*.sql` sinh ra chỉ chứa `ALTER TABLE \`student\` ADD \`email\` text NOT NULL DEFAULT '';` rồi **append** (precedent `0007_class_type_skills.sql`):

   ```sql
   --> statement-breakpoint
   UPDATE "student" SET "phone" = replace(replace("phone", ' ', ''), '+', '');
   ```

   Ghi chú trong commit: chỉ strip charset form cũ cho phép (`[0-9\s+]` — `add-student-modal.tsx:11`); dữ liệu lạ hơn không sửa. Migration áp dụng đồng bộ ở mọi môi trường: e2e boot (`apps/e2e/src/boot.ts:35-40` dùng drizzle migrator cùng folder), dev (alchemy `migrationsDir` — `packages/infra/alchemy.run.ts:61`), deploy (`db:migrate:deploy`).

3. `packages/api/src/contracts.ts` — thay `studentCreateSchema` (giữ `enrollStudentSchema` nguyên vẹn):

   ```ts
   export const studentCreateSchema = z.object({
   	name: z.string().min(1),
   	/** SĐT = danh tính đăng nhập tương lai: bắt buộc, chỉ chữ số. */
   	phone: z.string().regex(/^[0-9]+$/),
   	/** Email = danh tính đăng nhập tương lai: bắt buộc lúc tạo (row legacy ""). */
   	email: z.email(),
   	parentName: z.string().default(""),
   	classId: z.string().min(1).optional(),
   });
   ```

   Xoá field `total/price/mode` kèm comment Issue #115 (comment đó chỉ còn nghĩa với `enrollStudentSchema` — schema enroll đã có comment mirror riêng tại `:22-26`). Dùng `z.email()` (zod v4 canonical; `z.string().email()` là alias deprecated). Thêm `email: string;` vào `KernelStudentRow` (`:634-641`, ngay sau `phone`) với docblock 1 dòng.

4. `apps/server/src/routes/kernel.ts` — `POST /students`:
   - Mở rộng select của `findClass` (`:180-186`) thêm `mode: classTable.mode, tuitionFee: classTable.tuitionFee`; cập nhật inline type `cls` ở route (`:519-528`) thêm `mode: string; tuitionFee: number | null;`.
   - Insert student thêm `email: input.email` (`:532-541`).
   - `packageValues` (`:545-554`) chuyển INTO nhánh lớp, derive từ lớp:

     ```ts
     const packageValues = {
     	orgId: ctx.orgId,
     	studentId,
     	// D1: gói derive từ lớp — không còn package fields trong input.
     	total: cls.sessionsTotal,
     	price: cls.tuitionFee ?? 0, // null = chưa thiết lập → 0
     	mode: cls.mode,
     	start: formatDayMonth(new Date()),
     	expiry: "",
     	status: "active",
     };
     ```

     Comment "Shared package fields — both branches must stay field-identical" (`:542-544`) thay bằng ghi chú D1/D2: gói chỉ tồn tại khi gắn lớp.
   - Nhánh `else` không lớp (`:586-597`): **xoá** insert `sessionPackage` — thay bằng comment: D2 — học viên chưa có gói; enroll vào lớp (POST /classes/:id/enroll) sẽ tạo gói. Lịch sử issue #104 parked-package ghi lại ở đây.
   - `POST /classes/:id/enroll`: KHÔNG đổi logic; comment "Package values must stay field-identical with POST /students" (`:648-649`) sửa thành "enroll nhận package fields từ input — luồng tạo học viên (POST /students) giờ derive gói từ lớp (D1)".
5. `apps/server/src/routes/snapshot.ts:270-278` — thêm `email: row.email,` vào students map.
6. `apps/server/src/kernel.test.ts`:
   - Helper `addStudent` (`:284-306`): body thành `{name, phone: "0900000000", email: "<tên>-e2e@test.local", parentName, ...(classId)}`; bỏ `total/price/mode` khỏi tham số extra (34 call site không cần sửa vì dùng helper).
   - Body direct: `:3553` (cross-org), `:4007/4034/4049/4064` — đổi phone digits + thêm email.
   - Test `"students with classId create enrollment + package atomically"` (`:1529-1556`): assertion package đổi thành derive — class tạo bởi helper `createClass` (`:219-248`) có `sessionsTotal: 12`, `tuitionFee` không set (null → 0), `mode: "Online"` → expect `{total: 12, price: 0, mode: "Online"}`. Đổi call `addStudent(..., {classId, total: 12, price: 500000})` → `{classId}`.
   - Test `"without classId the package parks on the student (issue #104)"` (`:1557-1582`): rewrite thành "without classId no package is created" — expect `snapshot.enrollments` rỗng, `snapshot.packages` rỗng, student có trong `snapshot.students`.
   - Describe `"student package minimums (issue #115)"` (`:3996-4073`): giữ nguyên 2 test enroll (total 0 → 400); XÓA/CSS rewrite các test create-student dùng total/price → thay bằng test validation mới: create thiếu phone → 400; phone `"0900 000 000"` (khoảng trắng) → 400; phone `"09a1"` → 400; thiếu email → 400; email `"not-an-email"` → 400; body hợp lệ (phone digits + email) → 201.
   - Test `"invalid body fails zod validation with 400"` (`:1492-1497`) giữ `{phone: ""}` — vẫn 400 (thiếu name/email + phone fail regex). Các test Origin/415 (`:1456-1490`) không đổi (guard chạy trước parse body).
7. Create `apps/server/src/student-identity-migration.test.ts` — theo pattern `session-package-parked-migration.test.ts`: apply migrations qua `0020`, seed org + student có `phone = "0900 123 456"` và `" +84901"`, apply `0021`, assert phone thành `"0900123456"`/`"84901"` và cột `email` mặc định `""`.

## Todo

- [ ] Cột `email` trong `schema/student.ts` + docblock danh tính login
- [ ] Migration 0021 (generate + UPDATE normalize phone) commit cùng journal
- [ ] `studentCreateSchema` mới (phone regex, z.email, bỏ package fields) + `KernelStudentRow.email`
- [ ] `findClass` select + `POST /students` derive gói (D1) / không gói (D2) + email insert + snapshot email
- [ ] `kernel.test.ts` cập nhật + test validation mới + test migration mới

## Success Criteria (verify)

- `pnpm --filter @teacher-os/api check-types` — exit 0 (package `db` không có script check-types — chỉ có `db:generate`/`db:migrate:deploy`, schema db được type-check gián tiếp qua `server` check-types)
- `pnpm --filter server check-types && pnpm --filter server test` — exit 0 (vitest chạy migration thật qua drizzle migrator — schema mới phải khớp migration)
- `ls packages/db/src/migrations/*.sql | tail -1` — file 0021 mới chứa ADD COLUMN email + UPDATE phone
- Lưu ý chủ đích: `pnpm --filter web check-types` ĐỎ ở cuối phase này (fixtures `KernelStudentRow` thiếu `email`) — xanh lại ở phase 2

## Risk Assessment

- **Cao nếu viết tay migration sai cú pháp D1** → luôn generate bằng `pnpm db:generate`, chỉ append UPDATE; precedent 0007 chứng minh pattern.
- UPDATE normalize đè dữ liệu：không thể revert từng phần trong SQLite không có backup — charset strip chỉ xoá space/`+`, không đụng chữ số; test migration (bước 7) chứng minh trước khi deploy.
- Quên cập nhật body direct trong `kernel.test.ts` → test đỏ 400 thay vì kịch bản gốc — checklist bước 6 liệt kê đủ 5 vị trí.

## Security Considerations

- Phone/email là PII danh tính: KHÔNG thêm unique index (chưa cần), không log giá trị; validate ở zod chặn junk trước khi vào DB.
- Org-scoping giữ nguyên: `findClass` vẫn lọc `orgId` (`:188`) — test cross-org `:3545-3568` vẫn phải 404 với body mới.

## Next Steps

- Phase 2 consume contract mới ở web form (modal + data-actions + repos/kernel + fixture reducer).
