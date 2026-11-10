---
phase: 1
title: "TDD — test đỏ + fix nhánh I6"
status: pending
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: TDD — test đỏ + fix nhánh I6

## Goal

`activateEnrollment` nhánh I6 (lớp manual chưa từng có shift/cancel/lesson) kéo `lesson_material` từ ngày gốc sang ngày bù trong cùng batch nguyên tử, kèm 5 regression test (gồm test chuỗi 2 kỳ nghỉ bảo vệ thứ tự per-shift).

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

## Files to Create / Modify

- Modify: `apps/server/src/routes/enrollment-activation.ts` (nhánh I6 trong `activateEnrollment`, import `lessonMaterial`, `inArray`)
- Modify: `apps/server/src/routes/holidays.test.ts` (hoist helpers + 5 test mới)

## Tasks & Steps

### Task 1.1 — Hoist test helpers lên module scope

- Goal: `seedMaterial` + `lessonMaterialsAt` dùng được từ describe mới (#659) mà không duplicate.
- Target: `apps/server/src/routes/holidays.test.ts` — move 2 hàm (hiện trong `describe("#645: holiday shift dời lesson_material sang buổi bù")`, ~dòng 1240) ra module scope, giữ nguyên thân hàm và nơi gọi cũ (closure `db` module-level đã có).
- Steps:
  1. Cut 2 định nghĩa `seedMaterial(id, classId, date, position = 0)` và `lessonMaterialsAt(date)` từ describe #645.
  2. Paste ngay sau `function nextDowISO(...)` (module scope).
  3. Không đổi gì khác; describe #645 vẫn gọi được (tên không đổi).
- Success criteria: file biên dịch, describe #645 không sửa.
- Verify: `pnpm --filter server exec vitest run src/routes/holidays.test.ts` exit 0, `Tests  35 passed`.

### Task 1.2 — Viết 5 test mới (TDD đỏ)

- Goal: bẫy đúng bug #659 trước khi sửa code production, gồm bẫy thứ tự per-shift qua chuỗi 2 kỳ nghỉ sinh bởi chính planner I6.
- Target: `apps/server/src/routes/holidays.test.ts` — thêm `describe("#659: activation I6 lớp manual kéo lesson_material theo shift")` NGAY SAU test `"I3: chuỗi 2 kỳ nghỉ nối nhau..."` trong describe `"Kích hoạt enrollment sau khi áp kỳ nghỉ (D6)"`.
- Context bắt buộc (red-team Finding "makeup date"): planner chọn makeup quét đúng thứ của lớp từ `maxTeachingDate + 1` (`packages/api/src/holiday-plan.ts:220-241`) — lớp manual chỉ có 1 buổi sẽ ra makeup F3+7, KHÔNG phải F9. Mọi test dùng planner I6 phải seed **đủ 8 `class_session`** (F1+0,7,14,21,28,35,42,49 — như production) để `maxTeachingDate = F1+49` và makeup = `F9` (`addDaysISO(F1, 56)`), khớp pattern test I6 hiện có. Test boundary-pin (non-I6) chỉ cần 1 `class_session` vì không chạy planner.
- Steps:
  1. Thêm describe mới với helper + 5 test dưới đây. Dùng sẵn: `F1`, `F3`, `F9`, `SCHEDULE_A`, seed `s-1`, `t-1`, org-1 từ `beforeEach`; định nghĩa `const F10 = addDaysISO(F1, 63);` trong describe (khớp test I3).

  Helper chung:

```ts
/** Lớp manual với 8 buổi class_session (F1..F1+49) như production —
 * đủ để planner I6 chọn makeup = F9 (red-team: makeup quét từ
 * maxTeachingDate + 1 theo thứ của lớp). */
async function seedManualClassWith8Sessions(classId: string, csPrefix: string) {
	await db.insert(schema.classTable).values({
		id: classId,
		orgId: "org-1",
		name: `Lớp ${classId}`,
		schedule: SCHEDULE_A,
		sessionsTotal: 8,
		startDate: F1,
		status: "active",
		schedulingMode: "manual",
	});
	await db.insert(schema.classSession).values(
		[0, 7, 14, 21, 28, 35, 42, 49].map((offset, i) => ({
			id: `${csPrefix}-${i}`,
			orgId: "org-1",
			classId,
			date: addDaysISO(F1, offset),
			time: "19:00",
			dur: 90,
		})),
	);
}

async function seedOrgShiftHoliday(id: string, date: string, created: number) {
	await db.insert(schema.organizationHoliday).values({
		id,
		orgId: "org-1",
		name: `Nghỉ lễ ${id}`,
		fromDate: date,
		toDate: date,
		scope: "org",
		mode: "shift",
		notify: false,
		createdByUserId: "t-1",
		createdAt: new Date(created),
	});
}
```

  2. Test 1 — AC core (kịch bản issue "attach trước → holiday → activate → tài liệu ở ngày bù"):

```ts
test("I6 lớp manual: activation tự sinh shift kéo lesson_material sang buổi bù", async () => {
	await seedManualClassWith8Sessions("cls-manual", "csm-a");
	await seedMaterial("mat-659", "cls-manual", F3);
	await seedOrgShiftHoliday("hol-659", F3, 1000);
	await db.insert(schema.enrollment).values({
		id: "enr-659",
		orgId: "org-1",
		classId: "cls-manual",
		studentId: "s-1",
		status: "invited",
	});

	const activation = await activateEnrollment(db, "org-1", "enr-659");
	expect(activation).toEqual({ ok: true });

	// Tài liệu theo buổi bù, ngày gốc rỗng.
	expect(await lessonMaterialsAt(F3)).toHaveLength(0);
	const makeup = await lessonMaterialsAt(F9);
	expect(makeup.map((r) => r.materialId)).toEqual(["mat-659"]);

	// Lesson: gốc holiday ở F3, bù upcoming ở F9.
	const rows = await db
		.select({ date: schema.lesson.date, status: schema.lesson.status })
		.from(schema.lesson)
		.where(eq(schema.lesson.enrollmentId, "enr-659"));
	expect(rows.find((row) => row.date === F3)?.status).toBe("holiday");
	const at9 = rows.filter((row) => row.date === F9);
	expect(at9).toHaveLength(1);
	expect(at9[0]?.status).toBe("upcoming");
});
```

  3. Test 2 — undo round-trip, CÓ assertion trung gian (red-team: không có assertion trung gian thì test pass cả khi chưa fix — vacuous):

```ts
test("I6 lớp manual: DELETE hoàn tác dời tài liệu ngược về ngày gốc", async () => {
	await seedManualClassWith8Sessions("cls-manual-undo", "csm-b");
	await seedMaterial("mat-659u", "cls-manual-undo", F3);
	await seedOrgShiftHoliday("hol-659u", F3, 1000);
	await db.insert(schema.enrollment).values({
		id: "enr-659u",
		orgId: "org-1",
		classId: "cls-manual-undo",
		studentId: "s-1",
		status: "invited",
	});
	const activation = await activateEnrollment(db, "org-1", "enr-659u");
	expect(activation).toEqual({ ok: true });

	// Assertion trung gian: tài liệu ĐÃ theo buổi bù trước khi hoàn tác —
	// dòng này là thứ fail ở pha đỏ (chưa fix thì tài liệu còn ở F3).
	const beforeUndo = await lessonMaterialsAt(F9);
	expect(beforeUndo.map((r) => r.materialId)).toEqual(["mat-659u"]);

	const app = createApp();
	const delRes = await deleteHolidayReq(app, "hol-659u");
	expect(delRes.status).toBe(200);

	expect(await lessonMaterialsAt(F9)).toHaveLength(0);
	const original = await lessonMaterialsAt(F3);
	expect(original.map((r) => r.materialId)).toEqual(["mat-659u"]);
});
```

  4. Test 3 — cleanup-trùng (parity scenario C #645, red-team: seed block hoàn chỉnh, class riêng nhất quán):

```ts
test("I6 lớp manual: dòng trùng materialId ở makeupDate bị dọn, bản move thắng", async () => {
	await seedManualClassWith8Sessions("cls-manual-dup", "csm-c");
	await seedMaterial("mat-659d", "cls-manual-dup", F3);
	// materialId TRÙNG đã có sẵn ở ngày bù trước activation — cleanup-trùng
	// phải xoá bản này (đỡ khoá chính cho move), giữ đúng 1 bản sau move.
	await seedMaterial("mat-659d", "cls-manual-dup", F9);
	await seedOrgShiftHoliday("hol-659d", F3, 1000);
	await db.insert(schema.enrollment).values({
		id: "enr-659d",
		orgId: "org-1",
		classId: "cls-manual-dup",
		studentId: "s-1",
		status: "invited",
	});

	const activation = await activateEnrollment(db, "org-1", "enr-659d");
	expect(activation).toEqual({ ok: true });

	expect(await lessonMaterialsAt(F3)).toHaveLength(0);
	const makeup = await lessonMaterialsAt(F9);
	expect(makeup.map((r) => r.materialId)).toEqual(["mat-659d"]);
});
```

  5. Test 4 — boundary pin non-I6 (khóa semantics #658; seed `organizationHoliday` rõ ràng — FK của `holidaySessionShift.holidayId`):

```ts
test("non-I6 (shift có sẵn): activation KHÔNG move lesson_material (semantics #658)", async () => {
	await db.insert(schema.classTable).values({
		id: "cls-manual-pin",
		orgId: "org-1",
		name: "Lớp pin",
		schedule: SCHEDULE_A,
		sessionsTotal: 8,
		startDate: F1,
		status: "active",
		schedulingMode: "manual",
	});
	await db.insert(schema.classSession).values({
		id: "csm-pin-0",
		orgId: "org-1",
		classId: "cls-manual-pin",
		date: F3,
		time: "19:00",
		dur: 90,
	});
	await seedMaterial("mat-659p", "cls-manual-pin", F3);
	await seedOrgShiftHoliday("hol-659p", F3, 1000);
	await db.insert(schema.holidaySessionShift).values({
		id: "shift-659p",
		orgId: "org-1",
		holidayId: "hol-659p",
		classId: "cls-manual-pin",
		originalDate: F3,
		makeupDate: F9,
		createdAt: new Date(1000),
	});
	await db.insert(schema.enrollment).values({
		id: "enr-659p",
		orgId: "org-1",
		classId: "cls-manual-pin",
		studentId: "s-1",
		status: "invited",
	});

	const activation = await activateEnrollment(db, "org-1", "enr-659p");
	expect(activation).toEqual({ ok: true });

	// Shift áp lên rows (F3 holiday + F9 upcoming) nhưng tài liệu GIỮ nguyên
	// ngày gốc — teacher đã gắn vào shift có sẵn là dữ liệu thật (#658).
	const rows = await db
		.select({ date: schema.lesson.date, status: schema.lesson.status })
		.from(schema.lesson)
		.where(eq(schema.lesson.enrollmentId, "enr-659p"));
	expect(rows.find((row) => row.date === F3)?.status).toBe("holiday");
	expect(rows.find((row) => row.date === F9)?.status).toBe("upcoming");
	expect(await lessonMaterialsAt(F3)).toHaveLength(1);
	expect(await lessonMaterialsAt(F9)).toHaveLength(0);
});
```

  6. Test 5 — chuỗi 2 kỳ nghỉ SINH BỞI PLANNER I6 (bẫy thứ tự per-shift; red-team: test I3 pre-seed shift nên đi non-I6, không exercise statements mới). Dữ liệu dup tại ĐÍCH CUỐI (F10) là thứ khiến thứ tự gom-sai văng PK conflict → 500:

```ts
test("I6 chuỗi 2 kỳ nghỉ (F3→F9→F10): material đi đúng đích cuối, đúng 1 bản", async () => {
	await seedManualClassWith8Sessions("cls-manual-chain", "csm-e");
	await seedMaterial("mat-659e", "cls-manual-chain", F3);
	// Dup tại ĐÍCH CUỐI của chuỗi: cleanup của shift 2 (F9→F10) phải thấy
	// bản vừa move từ F3 sang F9 — thứ tự gom sai sẽ để bản này sống và
	// UPDATE cuối đụng khoá chính (classId, date, materialId) → 500.
	await seedMaterial("mat-659e", "cls-manual-chain", F10);
	await seedOrgShiftHoliday("hol-chain1", F3, 1000);
	await seedOrgShiftHoliday("hol-chain2", F9, 2000);
	await db.insert(schema.enrollment).values({
		id: "enr-659e",
		orgId: "org-1",
		classId: "cls-manual-chain",
		studentId: "s-1",
		status: "invited",
	});

	const activation = await activateEnrollment(db, "org-1", "enr-659e");
	expect(activation).toEqual({ ok: true });

	expect(await lessonMaterialsAt(F3)).toHaveLength(0);
	expect(await lessonMaterialsAt(F9)).toHaveLength(0);
	const final = await lessonMaterialsAt(F10);
	expect(final.map((r) => r.materialId)).toEqual(["mat-659e"]);
});
```

  7. Chạy verify ĐỎ (chưa sửa code production).
- Success criteria: test 1, 2, 3, 5 FAIL vì tài liệu còn kẹt ngày gốc (test 2 fail tại assertion trung gian); test 4 PASS ngay (non-I6 không move là hành vi hiện tại).
- Verify: `pnpm --filter server exec vitest run src/routes/holidays.test.ts` exit KHÁC 0, `Tests  36 passed, 4 failed` (failed = test 1, 2, 3, 5) — đây là trạng thái đỏ MONG MUỐN của TDD; pass condition của bước này là đúng pattern đó.

### Task 1.3 — Fix nhánh I6 trong `enrollment-activation.ts`

- Goal: batch activation I6 thêm cặp statement cleanup-trùng + move `lesson_material` per shift.
- Target: `apps/server/src/routes/enrollment-activation.ts` — hàm `activateEnrollment`, khối dựng `statements` (dòng ~548), loop `for (const shift of newShifts)`.
- Steps:
  1. Thêm import: `import { lessonMaterial } from "@teacher-os/db/schema/material";` và thêm `inArray` vào import `drizzle-orm` (hiện `and, eq, sql` tại dòng 22).
  2. Trong loop `for (const shift of newShifts)`, NGAY SAU `statements.push(db.insert(holidaySessionShift)...)`, push thêm 2 statement — THỨ TỰ per-shift là bắt buộc (cleanup trước move, shift chuỗi cần thấy ghi của câu trước):

```ts
// #659: activation tự sinh shift (nhánh I6 — lớp manual chưa từng có
// shift/lesson lúc apply) phải kéo tài liệu đã gắn vào ngày gốc theo
// buổi bù, pattern `shiftStatements` của holidays.ts (#645): dọn TRƯỚC
// các dòng trùng materialId ở makeupDate để UPDATE move không đụng khoá
// chính (classId, date, materialId); KHÔNG xoá dòng khác ở makeupDate —
// #658: ngày có buổi manual `class_session` là dữ liệu thật. Khi trùng
// materialId, bản move thắng bản đích (nhất quán scenario C #645) — nội
// dung tài liệu (bảng material) không mất, chỉ liên kết ngày bù được
// thay bằng bản cùng materialId từ ngày gốc. Hai câu này nằm trong cùng
// batch nguyên tử: guard CASE của lesson insert làm toàn batch rollback
// khi trạng thái lệch. Thứ tự per-shift là load-bearing: shift chuỗi
// (makeup kỳ trước trúng kỳ sau) cần thấy ghi của câu trước — test 5
// describe #659 bẫy đúng case gom-sai gây PK conflict.
statements.push(
	db.delete(lessonMaterial).where(
		and(
			eq(lessonMaterial.orgId, orgId),
			eq(lessonMaterial.classId, cls.id),
			eq(lessonMaterial.date, shift.makeupDate),
			inArray(
				lessonMaterial.materialId,
				db
					.select({ mid: lessonMaterial.materialId })
					.from(lessonMaterial)
					.where(
						and(
							eq(lessonMaterial.orgId, orgId),
							eq(lessonMaterial.classId, cls.id),
							eq(lessonMaterial.date, shift.originalDate),
						),
					),
			),
		),
	),
);
statements.push(
	db
		.update(lessonMaterial)
		.set({ date: shift.makeupDate })
		.where(
			and(
				eq(lessonMaterial.orgId, orgId),
				eq(lessonMaterial.classId, cls.id),
				eq(lessonMaterial.date, shift.originalDate),
			),
		),
);
```

  3. KHÔNG thêm statement material nào ngoài loop `for (const shift of newShifts)` (non-I6 giữ nguyên — quyết định thiết kế #4). KHÔNG đụng `class_session`. KHÔNG đụng loop `for (const cancel of newCancels)` (cancellation không có buổi bù — nhất quán #645).
- Success criteria: 5 test mới + toàn bộ suite holidays xanh.
- Verify: `pnpm --filter server exec vitest run src/routes/holidays.test.ts` exit 0, `Tests  40 passed (40)`.
- Verify 2: `pnpm --filter server exec vitest run src/routes/materials.test.ts` exit 0 (guard #658 không bị ảnh hưởng — fix không đụng `materials.ts`).

### Task 1.4 — Kiểm tra lint trên 2 file đã sửa

- Goal: không để biome đỏ trong PR.
- Steps:
  1. `pnpm exec biome check apps/server/src/routes/enrollment-activation.ts apps/server/src/routes/holidays.test.ts`
- Success criteria: exit 0.
- Verify: lệnh trên exit 0, không in error.

## Verification

- `pnpm --filter server exec vitest run src/routes/holidays.test.ts` → exit 0, `Tests  40 passed (40)`.
- `pnpm --filter server exec vitest run src/routes/materials.test.ts` → exit 0.
- `pnpm exec biome check apps/server/src/routes/enrollment-activation.ts apps/server/src/routes/holidays.test.ts` → exit 0.
