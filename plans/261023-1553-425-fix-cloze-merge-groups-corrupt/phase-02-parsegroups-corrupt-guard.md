---
title: "Phase 2: parseGroups corrupt guard (TDD)"
status: pending
priority: P1
effort: "3.5h"
dependencies: []
---

# Phase 2: parseGroups corrupt guard (TDD)

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

## Goal

Nhóm câu corrupt trong DB được log (kèm reason) + gắn cờ `groupsCorrupt` trên DTO; mọi đường ghi đè/lỡ phát hành liên quan corrupt được chặn: PUT corrupt-bằng-rỗng thiếu cờ → 409 `GROUPS_CORRUPT`; cờ trên row sạch → 409 `GROUPS_NOT_CORRUPT`; publish đề có part corrupt → 409 `GROUPS_CORRUPT`.

## Files to Create / Modify

- Modify: `packages/api/src/library-contracts.ts` — `LIBRARY_ERROR_CODES` (dòng 55-63) thêm `"GROUPS_CORRUPT"`, `"GROUPS_NOT_CORRUPT"`; `libraryPartDtoSchema` (~472-493) thêm `groupsCorrupt: z.boolean().default(false)`; `libraryPartUpsertSchema` (~139-224) thêm `discardCorruptGroups: z.literal(true).optional()`.
- Modify: `apps/server/src/routes/admin-library.ts` — `parseGroups` (dòng ~130), `toPartInput` (~139), `toPartDto` (~158), route `PUT /tests/:id/parts/:part` (~498-555), route cập nhật header chuyển `status: "ready"` (khối `validateTestReady` ~450-455; xác định PATCH/PUT theo code thật).
- Modify: `apps/admin/src/components/library/part-form.tsx` — `partInputFromValue` (~273), `handleSave` catch (~552-555), `PartForm` (~410) thêm banner + nút "Lưu đè nhóm hỏng".
- Modify: `apps/admin/src/components/library/library-error.ts` — `CODE_MESSAGES` (~12-24) thêm 2 entry.
- Modify (fixtures TS): `apps/admin/src/components/library/part-form.test.tsx` (7 literal `LibraryPartDto`: ~29,455,534,629,720,824,921), `apps/admin/src/components/library/test-outline-model.test.ts` (~59), `apps/admin/src/components/library/answers-overview.test.ts` (~36-37) — thêm `groupsCorrupt: false` (type `z.infer` vẫn bắt buộc field dù input có default).
- Modify: `apps/server/src/routes/admin-library.test.ts`, `packages/api/src/library-contracts.test.ts`, `apps/admin/src/components/library/part-form.test.tsx` — test mới.
- KHÔNG đụng: `apps/admin/src/routes/_auth/library/tests/$testId.tsx` (chống double toast — red-team RT2#6; `library.test.ts` mock runtime không vỡ nhờ `.default(false)`).

## Hiện trạng (đã xác minh)

```ts
// apps/server/src/routes/admin-library.ts:130 (feat/424 tip)
function parseGroups(raw: string): LibraryQuestionGroup[] {
	const parsed = libraryQuestionGroupSchema
		.array()
		.max(LIBRARY_GROUP_MAX)
		.safeParse(parseJsonArray(raw));
	return parsed.success ? parsed.data : [];
}
```

- Cột DB: `groups: text("groups").notNull().default("[]")` (`packages/db/src/schema/library-test.ts:85`; migration `0044_library_part_groups.sql`).
- PUT part: chỉ `loadPartRow` khi `test.status === "ready"` (dòng ~518-524); ghi `groups: JSON.stringify(body.data.groups)` vô điều kiện (~540-541).
- Publish: route header (~450-455) gọi `validateTestReady(test.skill, parts.map(toPartInput))`; `toPartInput` → `parseGroups` → corrupt thành `[]` → "nhóm ngầm" hợp lệ → **publish pass im lặng** (red-team H; `library-contracts.ts:274-276`).
- `libraryError(c, status, code)` → `{error: code, code}`; `LibraryErrorCode` = tuple `LIBRARY_ERROR_CODES`.
- Admin UI: `partInputFromValue` luôn gửi `groups`; lỗi server ném `LibraryHttpError(status, msg, {code, issues})`; `isLibraryHttpError` tại `repos/library.ts:49-51`; `handleSave` catch nuốt error (`part-form.tsx:552-555`); `CODE_MESSAGES[error.code] ?? fallbackByStatus(...)` tại `library-error.ts:27-29`; `PartForm` nhận `saved` (DTO).
- Client `normalizeGroups` (part-form.tsx:149) âm thầm bỏ phần tử invalid — giữ nguyên, thêm comment khoá: "KHÔNG chuyển server sang salvage per-element nếu không bỏ cả lớp này — hai lớp salvage sẽ âm thầm sửa đề".
- Runbook có mục deploy-skew cho chính 2 schema này: `docs/production-release-runbook.md:835-836`.

## Tests Before (viết TRƯỚC, phải ĐỎ đúng loại)

### A. Contract (`packages/api/src/library-contracts.test.ts`)

1. `libraryPartDtoSchema.parse` DTO có `groupsCorrupt: true|false` → giữ giá trị; **THIẾU field → parse THÀNH CÔNG với `groupsCorrupt === false`** (`.default(false)` — chống deploy-skew; red-team F6).
2. `libraryPartUpsertSchema`: chấp nhận `discardCorruptGroups: true`; `false` → FAIL (literal(true)); field lạ → FAIL (strict); thiếu → parse ok, field không xuất hiện ở output bắt buộc.

### B. Route (`apps/server/src/routes/admin-library.test.ts`)

Seed corrupt: tạo test draft + part questions hợp lệ qua API, rồi `db.update(libraryTestPart).set({ groups: "{broken json" }).where(...)` trực tiếp qua drizzle test harness.

3. **PUT echo `[]` không cờ → 409, không ghi**: PUT `groups: []` → 409 `{error: "GROUPS_CORRUPT", code: "GROUPS_CORRUPT"}`; row giữ nguyên `groups === "{broken json"`, `questions` nguyên vẹn; log chứa `[admin-library] groups corrupt` + `"reason"` (substring `malformed`).
4. **PUT có cờ → 200, ghi + log** (payload rỗng hay đã soạn lại đều được): PUT `groups: []` + `discardCorruptGroups: true` → 200; row `groups === "[]"`; log chứa `discarded explicitly`.
5. **PUT groups soạn lại (không rỗng) KHÔNG cờ → 409**: PUT 1 group hợp lệ không cờ → 409 `GROUPS_CORRUPT`; row giữ nguyên `"{broken json"` (advisory: `group-model.ts addGroup` sinh non-empty từ dữ liệu ngầm — không phải ý định tường minh).
6. **DTO cờ**: GET detail khi corrupt → `part.groups === []` ∧ `part.groupsCorrupt === true`; sau step 4 → `groupsCorrupt === false`; part sạch từ đầu → `groupsCorrupt === false`.
7. **Cờ trên row SẠCH → 409 `GROUPS_NOT_CORRUPT`, không ghi** (chặn destructive-clear từ snapshot stale): row sạch + PUT `groups: []` + `discardCorruptGroups: true` → 409 `GROUPS_NOT_CORRUPT`, row giữ nguyên.
8. **Row sạch bình thường không đụng**: PUT không cờ groups hợp lệ/rỗng → 200 (regression).
9. **Ready validation vẫn chạy sau cờ**: test `ready` + part corrupt + PUT cờ nhưng questions thiếu đáp án → 400 NOT_READY (guard không né ready validation).
10. **Publish chặn corrupt**: test draft có 1 part corrupt (seed như trên) → route header chuyển `status: "ready"` → 409 `GROUPS_CORRUPT`, test vẫn draft; sau khi part được ghi lại hợp lệ (step 4) → publish pass.

### C. Admin UI

11. `part-form.test.tsx`: DTO `groupsCorrupt: true` → banner (text chứa "hỏng định dạng") + nút "Lưu đè nhóm hỏng" render; DTO sạch → không banner không nút.
12. Bấm nút → `onSave` nhận input có `discardCorruptGroups: true`.
13. `partInputFromValue(slot, value)` không options → input KHÔNG có `discardCorruptGroups`.
14. `handleSave` nhận `LibraryHttpError` 409 code `GROUPS_CORRUPT` → live-region/message chứa "Lưu đè nhóm hỏng" (single surface — không toast ở page).
15. `library-error.ts`: `libraryErrorMessage` với code `GROUPS_CORRUPT`/`GROUPS_NOT_CORRUPT` trả đúng entry mới (không rơi fallback).

**Verify (đỏ)**: `cd packages/api && pnpm vitest run src/library-contracts.test.ts` + `cd apps/server && pnpm vitest run src/routes/admin-library.test.ts` — test A.1 (thiếu field), B.3, B.4, B.7, B.10, C.11-15 FAIL vì behavior chưa có; KHÔNG fail vì TS compile chặn (nếu TS chặn fixture mới, dùng `as never`/cast cục bộ trong test đạt đỏ-hữu-ý, bỏ cast khi cài xong).

## Refactor (cài đặt)

### Contract — 3 thay đổi additive
- `LIBRARY_ERROR_CODES` += `"GROUPS_CORRUPT"`, `"GROUPS_NOT_CORRUPT"`.
- `libraryPartDtoSchema`: `groupsCorrupt: z.boolean().default(false)` — input cũ (thiếu field) parse được; `z.infer` output vẫn required → fixtures TS thêm `groupsCorrupt: false`.
- `libraryPartUpsertSchema`: `discardCorruptGroups: z.literal(true).optional()`.

### Server

```ts
type GroupsParse = {
	groups: LibraryQuestionGroup[];
	corrupt: boolean;
	reason?: "malformed" | "non-array" | "shape" | "over-cap";
};

/** Cột `groups` → nhóm đã validate. Phân biệt RỖNG (`[]` hợp lệ) vs CORRUPT
 * (JSON hỏng / không phải array / phần tử sai shape / vượt LIBRARY_GROUP_MAX)
 * — corrupt KHÔNG BAO GIỜ bị ghi đè im lặng (#425): nguồn corrupt thực tế là
 * schema siết chặt về sau làm row cũ thành invalid. */
function parseGroups(
	raw: string,
	ctx: { testId: string; part: string },
): GroupsParse {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		console.error("[admin-library] groups corrupt", { ...ctx, reason: "malformed" });
		return { groups: [], corrupt: true, reason: "malformed" };
	}
	if (!Array.isArray(value)) {
		console.error("[admin-library] groups corrupt", { ...ctx, reason: "non-array" });
		return { groups: [], corrupt: true, reason: "non-array" };
	}
	if (value.length > LIBRARY_GROUP_MAX) {
		console.error("[admin-library] groups corrupt", { ...ctx, reason: "over-cap" });
		return { groups: [], corrupt: true, reason: "over-cap" };
	}
	const parsed = libraryQuestionGroupSchema.array().safeParse(value);
	if (parsed.success) return { groups: parsed.data, corrupt: false };
	console.error("[admin-library] groups corrupt", { ...ctx, reason: "shape" });
	return { groups: [], corrupt: true, reason: "shape" };
}
```

- `toPartInput(row)` / `toPartDto(row)`: `const state = parseGroups(row.groups, { testId: row.testId, part: row.part });` → `groups: state.groups`; `toPartDto` thêm `groupsCorrupt: state.corrupt`.
- PUT part: dời `const existing = await loadPartRow(testId, part);` lên TRƯỚC nhánh ready (nhánh ready tái dùng, bỏ load trùng). Sau `readBody`:

```ts
const groupsState = existing
	? parseGroups(existing.groups, { testId, part })
	: { groups: [], corrupt: false };
if (body.data.discardCorruptGroups === true && !groupsState.corrupt) {
	return libraryError(c, 409, "GROUPS_NOT_CORRUPT");
}
if (groupsState.corrupt && body.data.discardCorruptGroups !== true) {
	// BẤT KỂ payload groups (rỗng hay soạn lại — UI có thể sinh non-empty từ
	// dữ liệu ngầm qua addGroup mà admin không thấy corrupt — advisory).
	return libraryError(c, 409, "GROUPS_CORRUPT");
}
if (groupsState.corrupt) {
	console.error("[admin-library] corrupt groups discarded explicitly", {
		...ctx,
		reason: groupsState.reason,
		groupsCount: body.data.groups.length,
	});
}
```

- Publish guard (route header, khối `status === "ready"`): giữ lại danh sách ROWS (không chỉ inputs): nếu `partRows.some((row) => parseGroups(row.groups, { testId, part: row.part }).corrupt)` → `return libraryError(c, 409, "GROUPS_CORRUPT")` TRƯỚC khi `validateTestReady`.

### Admin UI

- `partInputFromValue(slot, value, options?: { discardCorruptGroups?: boolean })` — thêm key vào object parse khi flag true; gọi cũ 3 tham số không đổi (caller `$testId.tsx:370,382` không đụng).
- `PartForm`: `const groupsCorrupt = saved?.groupsCorrupt === true;`
  - Banner khi corrupt: dùng component/variant token có sẵn (destructive/warning — CẤM hard-code màu theo `DESIGN.md`), text: "Nhóm câu hỏi đã lưu trên server hỏng định dạng nên đang được ẩn. Lưu bình thường sẽ bị chặn để tránh xóa nhầm — bấm «Lưu đè nhóm hỏng» nếu chắc chắn muốn thay thế."
  - Nút "Lưu đè nhóm hỏng" (variant destructive, chỉ render khi corrupt) → `handleSave({ discardCorruptGroups: true })`.
- `handleSave` đổi `catch {}` thành `catch (error)` + narrow:

```ts
} catch (error) {
	if (isLibraryHttpError(error) && error.code === "GROUPS_CORRUPT") {
		setLive("Part có nhóm câu hỏng trên server — bấm «Lưu đè nhóm hỏng» nếu muốn thay thế.");
	} else if (isLibraryHttpError(error) && error.code === "GROUPS_NOT_CORRUPT") {
		setLive("Nhóm câu đã được phục hồi trên server — tải lại trang để thấy dữ liệu mới.");
	} else {
		setLive("Chưa lưu được part — xem thông báo lỗi.");
	}
	return false;
}
```

- `library-error.ts` `CODE_MESSAGES` += `GROUPS_CORRUPT: "Part này có nhóm câu hỏng trên server — bấm «Lưu đè nhóm hỏng» nếu muốn thay thế."` và `GROUPS_NOT_CORRUPT: "Nhóm câu đã được phục hồi trên server — tải lại trang."`.
- Comment khoá cho `normalizeGroups` như mục Hiện trạng.

## Tests After (Regression gate)

- [x] `cd packages/api && pnpm vitest run src/library-contracts.test.ts` — exit 0.
- [x] `cd apps/server && pnpm vitest run src/routes/admin-library.test.ts` — exit 0 (toàn bộ, gồm test cũ).
- [x] `cd apps/admin && pnpm vitest run src/components/library/part-form.test.tsx src/components/library/test-outline-model.test.ts src/components/library/answers-overview.test.ts` — exit 0.
- [x] `pnpm --filter admin check-types` — exit 0 (fixture literals đã thêm `groupsCorrupt: false`).

## Tasks & Steps

1. **Task 2.1 — Contract**: sửa `library-contracts.ts` + test A (1-2) + thêm `groupsCorrupt: false` vào fixtures TS (part-form.test.tsx, test-outline-model.test.ts, answers-overview.test.ts — và mọi literal khác check-types reveal).
   - Success criteria: test A pass; admin check-types sạch.
   - Verify: `cd packages/api && pnpm vitest run src/library-contracts.test.ts && pnpm --filter admin check-types` — exit 0.
2. **Task 2.2 — Server guard**: `parseGroups` mới + `toPartInput`/`toPartDto` + PUT guard + publish guard + test B (3-10).
   - Success criteria: test B pass; log có reason; PUT sạch regression pass.
   - Verify: `cd apps/server && pnpm vitest run src/routes/admin-library.test.ts` exit 0.
3. **Task 2.3 — Admin UI**: banner + nút + options builder + catch narrow + CODE_MESSAGES + comment khoá normalizeGroups + test C (11-15).
   - Success criteria: test C pass; không màu hard-code mới.
   - Verify: `cd apps/admin && pnpm vitest run src/components/library/part-form.test.tsx && grep -nE "#[0-9a-fA-F]{3,8}" apps/admin/src/components/library/part-form.tsx` — test exit 0; grep không có match mới ngoài baseline (`git diff` không thêm dòng màu hex).

## Risk Assessment

- Load thêm 1 row trên mọi PUT part: lookup unique key `(testId, part)` trên D1 — không đáng kể (kongming xác nhận vòng 1).
- Guard chặn nhầm: chỉ khi row corrupt THẬT; row sạch đi qua bình thường (test 8); cờ trên sạch → 409 có chủ đích (test 7).
- Admin bế tắc khi corrupt: 2 đường — soạn lại groups không rỗng rồi lưu (test 5), hoặc nút xoá tường minh (test 4); cờ stale → 409 GROUPS_NOT_CORRUPT + reload (test 7).

## Security Considerations

- Log KHÔNG in nội dung groups (chỉ testId/part/reason).
- 409 không lộ chi tiết nội bộ; message UI tiếng Việt đã có.
- `discardCorruptGroups` là literal(true) — không thể gửi ngược `false` để "tắt" guard.
