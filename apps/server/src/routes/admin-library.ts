import type { CreatedResponse } from "@teacher-os/api/contracts";
import {
	ASSIGNMENT_TEST_PRESETS,
	assignmentQuestionSchema,
} from "@teacher-os/api/contracts";
import {
	normalizeMediaType,
	sanitizeMediaFileName,
} from "@teacher-os/api/lib/quiz-media";
import {
	isLibrarySkill,
	LIBRARY_AUDIO_MAX_BYTES,
	LIBRARY_AUDIO_MIME,
	LIBRARY_GROUP_MAX,
	type LibraryErrorCode,
	type LibraryPartDto,
	type LibraryPartInput,
	type LibraryQuestionGroup,
	type LibrarySkill,
	type LibraryTestDetail,
	type LibraryTestListItem,
	libraryPartUpsertSchema,
	libraryQuestionGroupSchema,
	libraryTestCreateSchema,
	libraryTestUpdateSchema,
	validatePartForReady,
	validateTestReady,
} from "@teacher-os/api/library-contracts";
import {
	libraryTest,
	libraryTestPart,
} from "@teacher-os/db/schema/library-test";
import { and, asc, desc, eq, inArray, isNull, like, or } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { type Context, Hono } from "hono";
import type { z } from "zod";
import type { Db } from "../app";
import { mediaObjectResponse } from "../lib/media-response";
import { MediaSizeMismatchError, type MediaStore } from "../lib/media-store";
import { type AdminEnv, createRequireAdmin } from "../lib/require-admin";
import type { SessionUser } from "../session";

/**
 * Route `/api/admin/library` — thư viện đề IELTS toàn hệ thống (plan #413
 * phase 3). Khác kernel router: KHÔNG org-scoped (mọi đề dùng chung, chỉ
 * admin ghi — bảng không có `orgId`, precedent `vocab_library_*`), tự gắn
 * `requireAdmin` (phase 1) và TỰ áp CSRF riêng: Origin phải thuộc
 * `adminOrigins` (không phải origin teacher/student) và write JSON phải
 * `application/json` — trừ PUT `.../audio` (raw body stream thẳng vào R2,
 * handler tự kiểm Content-Length + MIME + byte thật).
 *
 * Audio upload thay thế theo contractSpeaking (#305): ghi key MỚI
 * `library/<testId>/<part>/<uuid>` → cập nhật row theo CAS key cũ → xoá key
 * cũ qua `runInBackground`. Mọi bước hỏng giữa chừng phải dọn object mới và
 * TUYỆT ĐỐI không xoá key cũ — row không bao giờ trỏ object chưa tồn tại.
 */

export interface AdminLibraryDeps {
	getDb(): Db;
	getSessionUser(headers: Headers): Promise<SessionUser | null>;
	/** Allowlist email admin (đã parse; so khớp lowercase trong requireAdmin). */
	adminEmails: string[];
	/** Origin console admin cho CSRF — rỗng thì mọi write bị 403 (fail-closed). */
	adminOrigins: string | string[];
	/** Xem `AppDeps.getLibraryAudioStore` — vắng mặt → route audio 503. */
	getLibraryAudioStore?(): MediaStore | undefined;
	/** Xem `AppDeps.runInBackground`. */
	runInBackground?(promise: Promise<unknown>): void;
}

type LibraryRow = typeof libraryTest.$inferSelect;
type PartRow = typeof libraryTestPart.$inferSelect;

const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

/** Audio upload là route raw duy nhất của router này. */
function isRawAudioUpload(method: string, path: string): boolean {
	return method === "PUT" && path.endsWith("/audio");
}

/** Mã 503 khi binding LIBRARY_AUDIO vắng — literal vì LIBRARY_ERROR_CODES
 * (contract phase 2) chỉ liệt kê lỗi nghiệp vụ đề. */
const LIBRARY_AUDIO_DISABLED = "LIBRARY_AUDIO_DISABLED";

/** CAS thắng nhau giữa hai upload song song (D1 không có transaction). */
const AUDIO_CHANGED = "AUDIO_CHANGED";

function libraryError(
	c: Context<AdminEnv>,
	status: 400 | 404 | 409 | 413 | 415 | 500 | 503,
	code: LibraryErrorCode | typeof LIBRARY_AUDIO_DISABLED | typeof AUDIO_CHANGED,
): Response {
	return c.json({ error: code, code }, status);
}

async function readBody<S extends z.ZodType>(
	c: Context<AdminEnv>,
	schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: Response }> {
	let raw: unknown;
	try {
		raw = await c.req.json();
	} catch {
		return { ok: false, response: c.json({ error: "invalid json" }, 400) };
	}
	const parsed = schema.safeParse(raw);
	if (!parsed.success) {
		return { ok: false, response: c.json({ error: "invalid body" }, 400) };
	}
	return { ok: true, data: parsed.data };
}

/** JSON text column → array; corrupt/legacy → [] (part vẫn render, ready
 * validation sẽ chặn bằng "at least one question" thay vì crash). */
function parseJsonArray(raw: string): unknown[] {
	try {
		const value: unknown = JSON.parse(raw);
		return Array.isArray(value) ? value : [];
	} catch {
		return [];
	}
}

function parseStringArray(raw: string): string[] {
	return parseJsonArray(raw).filter(
		(item): item is string => typeof item === "string",
	);
}

type GroupsCorruptReason = "malformed" | "non-array" | "shape" | "over-cap";

type GroupsParse = {
	groups: LibraryQuestionGroup[];
	corrupt: boolean;
	reason?: GroupsCorruptReason;
};

/** Cột `groups` → nhóm đã validate. Phân biệt RỖNG (`[]` hợp lệ) vs CORRUPT
 * (JSON hỏng / không phải array / phần tử sai shape / vượt LIBRARY_GROUP_MAX)
 * — corrupt KHÔNG BAO GIỜ bị ghi đè im lặng (#425): nguồn corrupt thực tế là
 * schema siết chặt về sau làm row cũ thành invalid, nên row corrupt phải được
 * log + gắn cờ + chặn ghi đè cho đến khi có xác nhận tường minh. */
function parseGroups(
	raw: string,
	ctx: { testId: string; part: string },
): GroupsParse {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		console.error("[admin-library] groups corrupt", {
			...ctx,
			reason: "malformed" satisfies GroupsCorruptReason,
		});
		return { groups: [], corrupt: true, reason: "malformed" };
	}
	if (!Array.isArray(value)) {
		console.error("[admin-library] groups corrupt", {
			...ctx,
			reason: "non-array" satisfies GroupsCorruptReason,
		});
		return { groups: [], corrupt: true, reason: "non-array" };
	}
	if (value.length > LIBRARY_GROUP_MAX) {
		console.error("[admin-library] groups corrupt", {
			...ctx,
			reason: "over-cap" satisfies GroupsCorruptReason,
		});
		return { groups: [], corrupt: true, reason: "over-cap" };
	}
	const parsed = libraryQuestionGroupSchema.array().safeParse(value);
	if (parsed.success) return { groups: parsed.data, corrupt: false };
	console.error("[admin-library] groups corrupt", {
		...ctx,
		reason: "shape" satisfies GroupsCorruptReason,
	});
	return { groups: [], corrupt: true, reason: "shape" };
}

/**
 * Cột `questions` → câu đã validate schema; JSON hỏng/phần tử sai shape → []
 * (fail-soft như `groups` — ready validation chặn "at least one question"
 * thay vì crash 500). Trade-off (kongming plan-gate): parse TOÀN MẢNG — một
 * câu hỏng làm cả part rơi về `[]`, trong khi admin `normalizeQuestions`
 * xử lý từng câu; chấp nhận vì dữ liệu hỏng chỉ đến từ ghi ngoài luồng
 * (upsert schema đã chặn từ lúc lưu) và hướng chặn publish vẫn đúng.
 */
function parseQuestions(raw: string): LibraryPartInput["questions"] {
	const parsed = assignmentQuestionSchema
		.array()
		.max(40)
		.safeParse(parseJsonArray(raw));
	return parsed.success ? parsed.data : [];
}

/** Row part → input cho validatePartForReady/validateTestReady. */
function toPartInput(row: PartRow): LibraryPartInput {
	return {
		part: row.part,
		type: row.type,
		title: row.title,
		band: row.band as LibraryPartInput["band"],
		source: row.source,
		intro: row.intro,
		passage: row.passage,
		transcript: row.transcript,
		imageUrl: row.imageUrl,
		questions: parseQuestions(row.questions),
		groups: parseGroups(row.groups, {
			testId: row.testId,
			part: row.part,
		}).groups,
		optionBank: parseStringArray(row.optionBank),
		note: row.note,
		audioName: row.audioName ?? "",
	};
}

function toPartDto(row: PartRow): LibraryPartDto {
	const groupsState = parseGroups(row.groups, {
		testId: row.testId,
		part: row.part,
	});
	return {
		id: row.id,
		testId: row.testId,
		part: row.part,
		type: row.type,
		title: row.title,
		band: row.band,
		source: row.source,
		intro: row.intro,
		passage: row.passage,
		transcript: row.transcript,
		imageUrl: row.imageUrl,
		questions: parseJsonArray(row.questions),
		groups: groupsState.groups,
		groupsCorrupt: groupsState.corrupt,
		optionBank: parseStringArray(row.optionBank),
		note: row.note,
		audio:
			row.audioKey === null
				? null
				: {
						name: row.audioName ?? "",
						type: row.audioContentType ?? "",
						size: row.audioSize ?? 0,
						uploadedAt: row.audioUploadedAt
							? row.audioUploadedAt.toISOString()
							: "",
					},
		updatedAt: row.updatedAt.toISOString(),
	};
}

function headerFields(row: LibraryRow) {
	return {
		id: row.id,
		title: row.title,
		description: row.description,
		skill: row.skill,
		timeLimitSeconds: row.timeLimitSeconds,
		collection: row.collection,
		testGroup: row.testGroup,
		status: row.status,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

/** Slot chuẩn theo skill — part ngoài preset bị chặn ở PUT/DELETE. */
function presetParts(skill: LibrarySkill): string[] {
	return ASSIGNMENT_TEST_PRESETS[skill].slots.map((slot) => slot.part);
}

export function adminLibraryRoutes(deps: AdminLibraryDeps) {
	const router = new Hono<AdminEnv>();
	// Lazy: `getDb` có thể ném (binding D1 thiếu — readiness test build app
	// với getDb ném lỗi) — chỉ gọi ở request thật sự chạm DB, như kernel.
	let dbRef: Db | undefined;
	const withDb = (): Db => (dbRef ??= deps.getDb());
	const allowedOrigins = Array.isArray(deps.adminOrigins)
		? deps.adminOrigins
		: typeof deps.adminOrigins === "string"
			? [deps.adminOrigins]
			: [];

	const inBackground = (label: string, work: () => Promise<unknown>) => {
		const promise = work().catch((error: unknown) => {
			console.error(`[admin-library] ${label} failed`, { error });
		});
		if (deps.runInBackground) deps.runInBackground(promise);
	};

	async function loadTestRow(testId: string): Promise<LibraryRow | null> {
		const [row] = await withDb()
			.select()
			.from(libraryTest)
			.where(eq(libraryTest.id, testId));
		return row ?? null;
	}

	async function loadPartRow(
		testId: string,
		part: string,
	): Promise<PartRow | null> {
		const [row] = await withDb()
			.select()
			.from(libraryTestPart)
			.where(
				and(eq(libraryTestPart.testId, testId), eq(libraryTestPart.part, part)),
			);
		return row ?? null;
	}

	async function loadPartRows(testId: string): Promise<PartRow[]> {
		return withDb()
			.select()
			.from(libraryTestPart)
			.where(eq(libraryTestPart.testId, testId))
			.orderBy(asc(libraryTestPart.part));
	}

	async function loadTestDetail(
		testId: string,
	): Promise<LibraryTestDetail | null> {
		const row = await loadTestRow(testId);
		if (!row) return null;
		const parts = await loadPartRows(testId);
		return { ...headerFields(row), parts: parts.map(toPartDto) };
	}

	// ---- Guards: requireAdmin (phase 1) + CSRF riêng của /api/admin ----
	router.use("*", createRequireAdmin(deps));
	router.use("*", async (c, next) => {
		if (!WRITE_METHODS.includes(c.req.method)) return next();
		// Cookies SameSite=None nên CSRF phòng bằng Origin check tường minh
		// (fail-closed: Origin thiếu hoặc ngoài adminOrigins → 403).
		const origin = c.req.header("Origin") ?? "";
		if (!allowedOrigins.includes(origin)) {
			return c.json({ error: "origin not allowed" }, 403);
		}
		// Upload audio raw + DELETE không có JSON body — bỏ kiểm content-type.
		if (
			isRawAudioUpload(c.req.method, c.req.path) ||
			c.req.method === "DELETE"
		) {
			return next();
		}
		const contentType = c.req.header("Content-Type") ?? "";
		if (!contentType.toLowerCase().startsWith("application/json")) {
			return c.json({ error: "content-type must be application/json" }, 415);
		}
		return next();
	});

	// ---- GET /tests — list + thống kê parts, sort updatedAt desc ----
	router.get("/tests", async (c) => {
		const conditions = [];
		const skill = c.req.query("skill");
		if (skill !== undefined) {
			if (!isLibrarySkill(skill))
				return c.json({ error: "invalid skill" }, 400);
			conditions.push(eq(libraryTest.skill, skill));
		}
		const status = c.req.query("status");
		if (status !== undefined) {
			if (status !== "draft" && status !== "ready") {
				return c.json({ error: "invalid status" }, 400);
			}
			conditions.push(eq(libraryTest.status, status));
		}
		const q = c.req.query("q")?.trim();
		if (q) {
			const needle = `%${q}%`;
			conditions.push(
				or(
					like(libraryTest.title, needle),
					like(libraryTest.description, needle),
					like(libraryTest.collection, needle),
					like(libraryTest.testGroup, needle),
				),
			);
		}
		const rows = await withDb()
			.select()
			.from(libraryTest)
			.where(conditions.length > 0 ? and(...conditions) : undefined)
			.orderBy(desc(libraryTest.updatedAt));
		const partRows =
			rows.length > 0
				? await withDb()
						.select()
						.from(libraryTestPart)
						.where(
							inArray(
								libraryTestPart.testId,
								rows.map((row) => row.id),
							),
						)
				: [];
		const partsByTest = new Map<string, PartRow[]>();
		for (const part of partRows) {
			const bucket = partsByTest.get(part.testId) ?? [];
			bucket.push(part);
			partsByTest.set(part.testId, bucket);
		}
		const tests: LibraryTestListItem[] = rows.map((row) => {
			const parts = partsByTest.get(row.id) ?? [];
			const skill = isLibrarySkill(row.skill) ? row.skill : null;
			const hasAllAudio =
				skill === "reading"
					? true // reading không cần audio
					: skill !== null &&
						presetParts(skill).every(
							(slot) =>
								(parts.find((part) => part.part === slot)?.audioKey ?? null) !==
								null,
						);
			return {
				...headerFields(row),
				partCount: parts.length,
				questionCount: parts.reduce(
					(sum, part) => sum + parseJsonArray(part.questions).length,
					0,
				),
				hasAllAudio,
			};
		});
		return c.json({ tests });
	});

	// ---- POST /tests — tạo header, luôn draft ----
	router.post("/tests", async (c) => {
		const body = await readBody(c, libraryTestCreateSchema);
		if (!body.ok) return body.response;
		// requireAdmin đã qua nhưng không set ctx — đọc lại session cho
		// `createdBy` (lookup thứ 2 chỉ trên đường tạo đề, chấp nhận được).
		const session = await deps.getSessionUser(c.req.raw.headers);
		if (!session) return c.json({ error: "unauthorized" }, 401);
		const id = crypto.randomUUID();
		await withDb()
			.insert(libraryTest)
			.values({
				id,
				title: body.data.title,
				description: body.data.description || null,
				skill: body.data.skill,
				timeLimitSeconds: body.data.timeLimitSeconds,
				collection: body.data.collection || null,
				testGroup: body.data.testGroup || null,
				status: "draft",
				createdBy: session.userId,
			});
		return c.json({ id } satisfies CreatedResponse, 201);
	});

	// ---- GET /tests/:id — header + parts DTO (không lộ audioKey) ----
	router.get("/tests/:id", async (c) => {
		const detail = await loadTestDetail(c.req.param("id"));
		if (!detail) return libraryError(c, 404, "TEST_NOT_FOUND");
		return c.json(detail);
	});

	// ---- PATCH /tests/:id — header + status; skill bất immutable ----
	router.patch("/tests/:id", async (c) => {
		let raw: unknown;
		try {
			raw = await c.req.json();
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
			return c.json({ error: "invalid body" }, 400);
		}
		if ("skill" in raw) {
			return libraryError(c, 400, "SKILL_IMMUTABLE");
		}
		let status: "draft" | "ready" | undefined;
		if ("status" in raw) {
			const requested: unknown = raw.status;
			if (requested === "draft" || requested === "ready") {
				status = requested;
			} else {
				return c.json({ error: "invalid body" }, 400);
			}
		}
		const rest: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(raw)) {
			if (key !== "status") rest[key] = value;
		}
		const parsed = libraryTestUpdateSchema.safeParse(rest);
		if (!parsed.success) return c.json({ error: "invalid body" }, 400);

		const testId = c.req.param("id");
		const test = await loadTestRow(testId);
		if (!test) return libraryError(c, 404, "TEST_NOT_FOUND");
		if (!isLibrarySkill(test.skill)) {
			return c.json({ error: "corrupt test skill" }, 500);
		}

		const set: Partial<typeof libraryTest.$inferInsert> = {};
		if (parsed.data.title !== undefined) set.title = parsed.data.title;
		if (parsed.data.description !== undefined) {
			set.description = parsed.data.description || null;
		}
		if (parsed.data.timeLimitSeconds !== undefined) {
			set.timeLimitSeconds = parsed.data.timeLimitSeconds;
		}
		if (parsed.data.collection !== undefined) {
			set.collection = parsed.data.collection || null;
		}
		if (parsed.data.testGroup !== undefined) {
			set.testGroup = parsed.data.testGroup || null;
		}
		if (status === "ready") {
			const parts = await loadPartRows(testId);
			// #425 — đề có part groups corrupt không được phát hành: toPartInput
			// fallback [] thành "nhóm ngầm" hợp lệ → validate sẽ pass im lặng.
			const corruptPart = parts.find(
				(row) => parseGroups(row.groups, { testId, part: row.part }).corrupt,
			);
			if (corruptPart) return libraryError(c, 409, "GROUPS_CORRUPT");
			const issues = validateTestReady(test.skill, parts.map(toPartInput));
			if (issues.length > 0) {
				return c.json({ error: "NOT_READY", code: "NOT_READY", issues }, 400);
			}
			set.status = "ready";
		} else if (status === "draft") {
			set.status = "draft";
		}
		if (Object.keys(set).length > 0) {
			await withDb()
				.update(libraryTest)
				.set(set)
				.where(eq(libraryTest.id, testId));
		}
		const detail = await loadTestDetail(testId);
		return c.json(detail);
	});

	// ---- DELETE /tests/:id — batch xoá header + parts, dọn audio nền ----
	router.delete("/tests/:id", async (c) => {
		const testId = c.req.param("id");
		const test = await loadTestRow(testId);
		if (!test) return libraryError(c, 404, "TEST_NOT_FOUND");
		const parts = await loadPartRows(testId);
		const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
			withDb()
				.delete(libraryTestPart)
				.where(eq(libraryTestPart.testId, testId)),
			withDb().delete(libraryTest).where(eq(libraryTest.id, testId)),
		];
		await withDb().batch(statements);
		// Object R2 xoá SAU khi row đã biến mất — hỏng giữa chừng chỉ để
		// object mồ côi (dọn tay), không bao giờ để row trỏ object thiếu.
		const store = deps.getLibraryAudioStore?.();
		const keys = parts
			.map((part) => part.audioKey)
			.filter((key): key is string => key !== null);
		if (store && keys.length > 0) {
			inBackground("delete audio objects of test", () =>
				Promise.all(keys.map((key) => store.delete(key))),
			);
		}
		return c.json({ ok: true });
	});

	// ---- PUT /tests/:id/parts/:part — upsert một slot theo preset ----
	router.put("/tests/:id/parts/:part", async (c) => {
		const testId = c.req.param("id");
		const test = await loadTestRow(testId);
		if (!test) return libraryError(c, 404, "TEST_NOT_FOUND");
		if (!isLibrarySkill(test.skill)) {
			return c.json({ error: "corrupt test skill" }, 500);
		}
		const part = c.req.param("part");
		if (!presetParts(test.skill).includes(part)) {
			return libraryError(c, 404, "PART_NOT_FOUND");
		}
		const body = await readBody(c, libraryPartUpsertSchema);
		if (!body.ok) return body.response;
		if (body.data.part !== part) {
			return c.json({ error: "invalid body" }, 400);
		}
		// #425 — groups corrupt không bao giờ bị ghi đè im lặng: đọc row hiện có
		// TRƯỚC khi ghi (tái dùng cho ready-check bên dưới, không query 2 lần).
		const existing = await loadPartRow(testId, part);
		const groupsState = existing
			? parseGroups(existing.groups, { testId, part })
			: { groups: [], corrupt: false };
		if (body.data.discardCorruptGroups === true && !groupsState.corrupt) {
			// Snapshot stale: client nghĩ corrupt nhưng row đã sạch — bắt reload
			// trước khi cho destructive-clear đè dữ liệu hợp lệ.
			return libraryError(c, 409, "GROUPS_NOT_CORRUPT");
		}
		if (groupsState.corrupt && body.data.discardCorruptGroups !== true) {
			// BẤT KỂ payload groups (rỗng hay soạn lại — UI có thể sinh non-empty
			// từ dữ liệu ngầm qua addGroup mà admin không thấy corrupt).
			return libraryError(c, 409, "GROUPS_CORRUPT");
		}
		if (groupsState.corrupt) {
			console.error("[admin-library] corrupt groups discarded explicitly", {
				testId,
				part,
				reason: groupsState.reason,
				groupsCount: body.data.groups.length,
			});
		}
		if (test.status === "ready") {
			// Test đã ready: part chỉnh được nhưng phải đạt luật ready. Validate
			// trên trạng thái HIỆU LỰC — audioName là của row hiện có (route
			// giữ nguyên cột audio, client không khai), không phải của payload.
			// `existing` đã load ở guard groups corrupt phía trên.
			const effective: LibraryPartInput = {
				...body.data,
				audioName: existing?.audioName ?? "",
			};
			const issues = validatePartForReady(test.skill, effective);
			if (issues.length > 0) {
				return c.json({ error: "NOT_READY", code: "NOT_READY", issues }, 400);
			}
		}
		// Cố ý KHÔNG đụng cột audio* — audioName/key chỉ do route upload
		// audio set, client không tự khai (đề listening ready cần audio thật).
		const content = {
			type: body.data.type,
			title: body.data.title,
			band: body.data.band,
			source: body.data.source,
			intro: body.data.intro,
			passage: body.data.passage,
			transcript: body.data.transcript,
			imageUrl: body.data.imageUrl,
			questions: JSON.stringify(body.data.questions),
			optionBank: JSON.stringify(body.data.optionBank),
			groups: JSON.stringify(body.data.groups),
			note: body.data.note,
		};
		await withDb()
			.insert(libraryTestPart)
			.values({ id: crypto.randomUUID(), testId, part, ...content })
			.onConflictDoUpdate({
				target: [libraryTestPart.testId, libraryTestPart.part],
				set: content,
			});
		const row = await loadPartRow(testId, part);
		if (!row) return libraryError(c, 404, "PART_NOT_FOUND");
		return c.json({ part: toPartDto(row) });
	});

	// ---- DELETE /tests/:id/parts/:part — chặn khi test ready ----
	router.delete("/tests/:id/parts/:part", async (c) => {
		const testId = c.req.param("id");
		const test = await loadTestRow(testId);
		if (!test) return libraryError(c, 404, "TEST_NOT_FOUND");
		if (test.status === "ready") {
			// Phải hạ draft trước — xoá part của đề ready làm hỏng đề đã phát hành.
			return libraryError(c, 409, "NOT_READY");
		}
		const part = c.req.param("part");
		const row = await loadPartRow(testId, part);
		if (!row) return libraryError(c, 404, "PART_NOT_FOUND");
		await withDb()
			.delete(libraryTestPart)
			.where(eq(libraryTestPart.id, row.id));
		if (row.audioKey !== null) {
			const store = deps.getLibraryAudioStore?.();
			const audioKey = row.audioKey;
			if (store)
				inBackground("delete audio of part", () => store.delete(audioKey));
		}
		return c.json({ ok: true });
	});

	// ---- PUT /tests/:id/parts/:part/audio — raw upload (listening only) ----
	router.put("/tests/:id/parts/:part/audio", async (c) => {
		const store = deps.getLibraryAudioStore?.();
		if (!store) return libraryError(c, 503, LIBRARY_AUDIO_DISABLED);
		const testId = c.req.param("id");
		const test = await loadTestRow(testId);
		if (!test) return libraryError(c, 404, "TEST_NOT_FOUND");
		if (test.skill !== "listening") {
			// Đề reading không có audio; writing/speaking không thuộc thư viện.
			return libraryError(c, 400, "INVALID_AUDIO");
		}
		const part = c.req.param("part");
		if (!presetParts("listening").includes(part)) {
			return libraryError(c, 404, "PART_NOT_FOUND");
		}

		const lengthHeader = c.req.header("Content-Length");
		const size =
			lengthHeader !== undefined && /^\d+$/.test(lengthHeader)
				? Number(lengthHeader)
				: Number.NaN;
		if (!(size > 0)) {
			return libraryError(c, 400, "INVALID_AUDIO");
		}
		if (size > LIBRARY_AUDIO_MAX_BYTES) {
			return libraryError(c, 413, "AUDIO_TOO_LARGE");
		}
		const contentType = normalizeMediaType(c.req.header("Content-Type") ?? "");
		if (!Object.hasOwn(LIBRARY_AUDIO_MIME, contentType)) {
			return libraryError(c, 415, "UNSUPPORTED_AUDIO_TYPE");
		}
		let name: string | null = null;
		try {
			name = sanitizeMediaFileName(
				decodeURIComponent(c.req.header("X-File-Name") ?? ""),
			);
		} catch {
			name = null;
		}
		// Tên bắt buộc: đề listening ready cần audioName; upload vô danh tạo
		// trạng thái không bao giờ ready được.
		if (!name) return libraryError(c, 400, "INVALID_AUDIO");
		const requestBody = c.req.raw.body;
		if (requestBody === null) return libraryError(c, 400, "INVALID_AUDIO");

		// CAS theo key cũ: đọc TRƯỚC khi ghi object mới (D1 không có
		// transaction — thua CAS thì huỷ object mới, không đụng key cũ).
		const existing = await loadPartRow(testId, part);
		const oldKey = existing?.audioKey ?? null;
		const newKey = `library/${testId}/${part}/${crypto.randomUUID()}`;
		const discardNew = () =>
			inBackground("discard new audio object", () => store.delete(newKey));
		try {
			await store.put(newKey, requestBody, { contentType, size });
		} catch (error) {
			discardNew();
			if (error instanceof MediaSizeMismatchError) {
				return libraryError(c, 400, "INVALID_AUDIO");
			}
			console.error("[admin-library] audio upload failed", { error });
			return c.json({ error: "audio upload failed" }, 500);
		}

		const uploadedAt = new Date();
		const audioSet = {
			audioKey: newKey,
			audioName: name,
			audioContentType: contentType,
			audioSize: size,
			audioUploadedAt: uploadedAt,
		};
		try {
			// Slot chưa có row → insert mới; có row → update theo CAS key cũ.
			const updated = await withDb()
				.insert(libraryTestPart)
				.values({ id: crypto.randomUUID(), testId, part, ...audioSet })
				.onConflictDoUpdate({
					target: [libraryTestPart.testId, libraryTestPart.part],
					set: audioSet,
					setWhere:
						oldKey === null
							? isNull(libraryTestPart.audioKey)
							: eq(libraryTestPart.audioKey, oldKey),
				})
				.returning({ id: libraryTestPart.id });
			if (updated.length === 0) {
				discardNew();
				return libraryError(c, 409, AUDIO_CHANGED);
			}
		} catch (error) {
			// Row update hỏng sau khi object đã ghi: huỷ object mới, GIỮ key cũ
			// — row vẫn trỏ đúng object đang tồn tại.
			discardNew();
			console.error("[admin-library] audio row update failed", { error });
			return c.json({ error: "audio upload failed" }, 500);
		}
		if (oldKey !== null) {
			// Xoá key cũ chỉ chạy nền: fail (R2 lỗi) → orphan R2 chấp nhận được
			// (được log ở inBackground); row đã trỏ key mới nên audio vẫn phát đúng.
			inBackground("delete old audio object", () => store.delete(oldKey));
		}
		return c.json({
			audio: {
				name,
				type: contentType,
				size,
				uploadedAt: uploadedAt.toISOString(),
			},
		});
	});

	// ---- GET /tests/:id/parts/:part/audio — stream (chưa Range, xem spec Risks) ----
	router.get("/tests/:id/parts/:part/audio", async (c) => {
		const store = deps.getLibraryAudioStore?.();
		if (!store) return libraryError(c, 503, LIBRARY_AUDIO_DISABLED);
		const testId = c.req.param("id");
		if (!(await loadTestRow(testId)))
			return libraryError(c, 404, "TEST_NOT_FOUND");
		const row = await loadPartRow(testId, c.req.param("part"));
		if (!row || row.audioKey === null) {
			return libraryError(c, 404, "PART_NOT_FOUND");
		}
		const audioKey = row.audioKey;
		const object = await store.get(audioKey);
		if (!object) return libraryError(c, 404, "PART_NOT_FOUND");
		return mediaObjectResponse(object, {
			mediaType: row.audioContentType,
			mediaName: row.audioName,
		});
	});

	// ---- DELETE /tests/:id/parts/:part/audio — chặn khi test ready ----
	router.delete("/tests/:id/parts/:part/audio", async (c) => {
		const store = deps.getLibraryAudioStore?.();
		if (!store) return libraryError(c, 503, LIBRARY_AUDIO_DISABLED);
		const testId = c.req.param("id");
		const test = await loadTestRow(testId);
		if (!test) return libraryError(c, 404, "TEST_NOT_FOUND");
		if (test.status === "ready") {
			return libraryError(c, 409, "NOT_READY");
		}
		const part = c.req.param("part");
		const row = await loadPartRow(testId, part);
		if (!row || row.audioKey === null) return c.json({ ok: true });
		const oldKey = row.audioKey;
		const updated = await withDb()
			.update(libraryTestPart)
			.set({
				audioKey: null,
				audioName: null,
				audioContentType: null,
				audioSize: null,
				audioUploadedAt: null,
			})
			.where(
				and(
					eq(libraryTestPart.testId, testId),
					eq(libraryTestPart.part, part),
					eq(libraryTestPart.audioKey, oldKey),
				),
			)
			.returning({ id: libraryTestPart.id });
		if (updated.length === 0) {
			// Thua CAS với upload song song — re-read: đã bị ai xoá rồi thì
			// coi như mong muốn đạt được, giữ idempotent (precedent Speaking).
			const reread = await loadPartRow(testId, part);
			if (reread?.audioKey !== null) {
				return libraryError(c, 409, AUDIO_CHANGED);
			}
			return c.json({ ok: true });
		}
		inBackground("delete audio object", () => store.delete(oldKey));
		return c.json({ ok: true });
	});

	return router;
}
