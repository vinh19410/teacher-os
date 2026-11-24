import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	LIBRARY_ERROR_CODES,
	LIBRARY_READING_TYPES,
	type LibraryPartInput,
	libraryPartUpsertSchema,
	libraryTestListItemSchema,
	libraryTestListPageResponseSchema,
	validatePartForReady,
} from "@teacher-os/api/library-contracts";
import * as schema from "@teacher-os/db/schema/index";
import {
	libraryTest,
	libraryTestPart,
} from "@teacher-os/db/schema/library-test";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";
import { assignStudyPackToClass } from "../lib/study-pack-assign";
import type { SessionUser } from "../session";

/**
 * Plan #413 phase 3 — route CRUD `/api/admin/library` (header + parts).
 * Ma trận role: chỉ admin (role admin ∧ verified ∧ email ∈ allowlist) qua
 * được requireAdmin; mọi write phải mang Origin thuộc adminOrigins (CSRF)
 * và Content-Type JSON (trừ upload audio raw — file test riêng).
 */

const ADMIN_ORIGIN = "http://localhost:8004";
const TEACHER_ORIGIN = "http://localhost:8001";
const ADMIN_EMAILS = ["root@test.local", "root2@test.local"];
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);

const SESSIONS: Record<string, SessionUser | null> = {
	admin: {
		userId: "u-admin",
		userName: "Root",
		email: "root@test.local",
		emailVerified: true,
		role: "admin",
	},
	"admin-unverified": {
		userId: "u-admin2",
		userName: "Root2",
		email: "root2@test.local",
		emailVerified: false,
		role: "admin",
	},
	"admin-outside": {
		userId: "u-stranger",
		userName: "Stranger",
		email: "stranger@test.local",
		emailVerified: true,
		role: "admin",
	},
	teacher: {
		userId: "u-teacher",
		userName: "Teacher",
		email: "teacher@test.local",
		emailVerified: true,
		role: "teacher",
	},
	student: {
		userId: "u-student",
		userName: "Student",
		email: "student@test.local",
		emailVerified: true,
		role: "student",
	},
};

interface ReqOptions {
	user?: keyof typeof SESSIONS;
	body?: unknown;
	/** Mặc định ADMIN_ORIGIN cho mọi request; null = không gửi Origin. */
	origin?: string | null;
	contentType?: string | null;
}

function makeRequest(app: ServerApp, method: string, path: string) {
	return async (options: ReqOptions = {}): Promise<Response> => {
		const headers: Record<string, string> = {};
		headers.origin =
			options.origin === null ? "" : (options.origin ?? ADMIN_ORIGIN);
		if (options.origin === null) delete headers.origin;
		if (options.contentType !== null) {
			headers["content-type"] =
				options.contentType ??
				(options.body !== undefined ? "application/json" : "");
			if (!headers["content-type"]) delete headers["content-type"];
		}
		if (options.user !== undefined) {
			headers.cookie = "better-auth.session_token=t";
			headers["x-test-user"] = options.user;
		}
		return app.request(path, {
			method,
			headers,
			body:
				options.body === undefined ? undefined : JSON.stringify(options.body),
		});
	};
}

async function countTests(db: Db): Promise<number> {
	const rows = await db.select({ id: libraryTest.id }).from(libraryTest);
	return rows.length;
}

describe("admin library CRUD (/api/admin/library)", () => {
	let app: ServerApp;
	let db: Db;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const libsql = drizzle(client, { schema });
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;

		app = buildApp({
			getDb: () => db,
			authHandler: () => new Response(null, { status: 404 }),
			corsOrigin: [TEACHER_ORIGIN],
			getSessionUser: async (headers) => {
				const key = headers.get("x-test-user");
				return key ? (SESSIONS[key] ?? null) : null;
			},
			adminEmails: ADMIN_EMAILS,
			adminOrigins: [ADMIN_ORIGIN],
		});
	});

	test("ma trận role trên POST /tests — chỉ admin hợp lệ ghi được", async () => {
		const post = makeRequest(app, "POST", "/api/admin/library/tests");
		const body = {
			title: "IELTS Reading Mock 1",
			skill: "reading",
		};

		const denied: Array<[string | undefined, number]> = [
			[undefined, 401],
			["teacher", 403],
			["student", 403],
			["admin-unverified", 403],
			["admin-outside", 403],
		];
		for (const [user, status] of denied) {
			const res = await post({ user, body });
			expect(res.status, `user=${user}`).toBe(status);
		}
		// Không request nào trong ma trận từ chối được ghi xuống DB.
		expect(await countTests(db)).toBe(0);

		const ok = await post({ user: "admin", body });
		expect(ok.status).toBe(201);
		const created = (await ok.json()) as { id: string };
		expect(created.id).toBeTruthy();
		expect(await countTests(db)).toBe(1);
		const [row] = await db
			.select()
			.from(libraryTest)
			.where(eq(libraryTest.id, created.id));
		expect(row?.status).toBe("draft");
		expect(row?.skill).toBe("reading");
		expect(row?.timeLimitSeconds).toBe(3600);
		expect(row?.createdBy).toBe("u-admin");
	});

	test("CSRF: Origin ngoài adminOrigins hoặc thiếu Origin → 403; content-type không JSON → 415", async () => {
		const post = makeRequest(app, "POST", "/api/admin/library/tests");
		const body = { title: "X", skill: "listening" };
		const rowsBefore = await countTests(db);

		const wrongOrigin = await post({
			user: "admin",
			body,
			origin: TEACHER_ORIGIN,
		});
		expect(wrongOrigin.status).toBe(403);

		const noOrigin = await post({ user: "admin", body, origin: null });
		expect(noOrigin.status).toBe(403);

		const formPost = await post({
			user: "admin",
			body,
			contentType: "text/plain",
		});
		expect(formPost.status).toBe(415);

		expect(await countTests(db)).toBe(rowsBefore);
	});

	test("PATCH gửi `skill` → 400 SKILL_IMMUTABLE, header không đổi", async () => {
		const [seeded] = await db
			.insert(libraryTest)
			.values({
				id: "lt-skill",
				title: "Listening Mock",
				skill: "listening",
				status: "draft",
				createdBy: "u-admin",
			})
			.returning({ id: libraryTest.id });

		const patch = makeRequest(
			app,
			"PATCH",
			"/api/admin/library/tests/lt-skill",
		);
		const res = await patch({
			user: "admin",
			body: { skill: "reading", title: "Hacked" },
		});
		expect(res.status).toBe(400);
		const payload = (await res.json()) as { code?: string };
		expect(payload.code).toBe("SKILL_IMMUTABLE");
		expect(LIBRARY_ERROR_CODES).toContain("SKILL_IMMUTABLE");

		const [row] = await db
			.select()
			.from(libraryTest)
			.where(eq(libraryTest.id, "lt-skill"));
		expect(row?.title).toBe("Listening Mock");
		expect(row?.skill).toBe("listening");
		expect(seeded).toBeTruthy();
	});

	test("GET /tests: sort updatedAt desc + partCount/questionCount/hasAllAudio + filter skill/status/q", async () => {
		// Seed trực tiếp để khống chế updatedAt và thống kê parts.
		await db.insert(libraryTest).values([
			{
				id: "lt-read-list",
				title: "Reading Bank A",
				description: "đề đọc",
				skill: "reading",
				status: "ready",
				createdBy: "u-admin",
				updatedAt: new Date(1000),
			},
			{
				id: "lt-listen-list",
				title: "Listening Bank B",
				skill: "listening",
				status: "draft",
				createdBy: "u-admin",
				updatedAt: new Date(2000),
			},
		]);
		await db.insert(libraryTestPart).values([
			{
				id: "ltp-r1",
				testId: "lt-read-list",
				part: "p1",
				type: "tfng",
				title: "Passage 1",
				band: "7.0",
				questions: JSON.stringify([
					{ stem: "Q1", answer: "TRUE", alts: "" },
					{ stem: "Q2", answer: "FALSE", alts: "" },
				]),
				updatedAt: new Date(1000),
			},
			{
				id: "ltp-r2",
				testId: "lt-read-list",
				part: "p2",
				type: "headings",
				title: "Passage 2",
				band: "7.0",
				questions: JSON.stringify([{ stem: "Q1", answer: "i", alts: "" }]),
				optionBank: JSON.stringify(["i", "ii", "iii"]),
				updatedAt: new Date(1000),
			},
			{
				// Listening mới upload 1/4 audio → hasAllAudio = false.
				id: "ltp-s1",
				testId: "lt-listen-list",
				part: "s1",
				type: "form",
				title: "Section 1",
				band: "6.5",
				questions: JSON.stringify([{ stem: "Q1", answer: "1", alts: "" }]),
				audioKey: "library/lt-listen-list/s1/uuid-a",
				audioName: "s1.mp3",
				audioContentType: "audio/mpeg",
				audioSize: 123,
				updatedAt: new Date(2000),
			},
		]);

		const get = makeRequest(app, "GET", "/api/admin/library/tests");
		const res = await get({ user: "admin" });
		expect(res.status).toBe(200);
		const payload = (await res.json()) as {
			tests: Array<{
				id: string;
				partCount: number;
				questionCount: number;
				hasAllAudio: boolean;
				skill: string;
				status: string;
				updatedAt: string;
			}>;
		};
		// Sort updatedAt desc: cặp seed trực tiếp giữ tương đối 2000 > 1000
		// (hai row tự tạo trước đó có updatedAt mới hơn nhưng vị trí không
		// khẳng định cứng).
		const ids = payload.tests.map((t) => t.id);
		expect(ids).toHaveLength(4);
		expect(ids.slice(-2)).toEqual(["lt-listen-list", "lt-read-list"]);
		const listen = payload.tests.find((t) => t.id === "lt-listen-list");
		expect(listen?.partCount).toBe(1);
		expect(listen?.questionCount).toBe(1);
		expect(listen?.hasAllAudio).toBe(false);
		const read = payload.tests.find((t) => t.id === "lt-read-list");
		expect(read?.partCount).toBe(2);
		expect(read?.questionCount).toBe(3);
		expect(read?.hasAllAudio).toBe(true);

		const filtered = await app.request(
			"/api/admin/library/tests?skill=listening&status=draft&q=bank",
			{ headers: authHeaders("admin") },
		);
		expect(filtered.status).toBe(200);
		const filteredPayload = (await filtered.json()) as {
			tests: Array<{ id: string }>;
		};
		expect(filteredPayload.tests.map((t) => t.id)).toEqual(["lt-listen-list"]);

		const badSkill = await app.request(
			"/api/admin/library/tests?skill=speaking",
			{ headers: authHeaders("admin") },
		);
		expect(badSkill.status).toBe(400);
	});

	test("GET /tests/:id: detail + parts DTO, không lộ audioKey; 404 TEST_NOT_FOUND", async () => {
		const res = await app.request("/api/admin/library/tests/lt-listen-list", {
			headers: authHeaders("admin"),
		});
		expect(res.status).toBe(200);
		const raw = await res.text();
		expect(raw).not.toContain("audioKey");
		const detail = JSON.parse(raw) as {
			id: string;
			parts: Array<{
				part: string;
				questions: unknown[];
				optionBank: string[];
				audio: {
					name: string;
					type: string;
					size: number;
					uploadedAt: string;
				} | null;
				updatedAt: string;
			}>;
			updatedAt: string;
		};
		expect(detail.parts).toHaveLength(1);
		expect(detail.parts[0]?.part).toBe("s1");
		expect(detail.parts[0]?.questions).toHaveLength(1);
		expect(detail.parts[0]?.audio).toMatchObject({
			name: "s1.mp3",
			type: "audio/mpeg",
			size: 123,
		});

		const missing = await app.request("/api/admin/library/tests/nope", {
			headers: authHeaders("admin"),
		});
		expect(missing.status).toBe(404);
		const missingPayload = (await missing.json()) as { code?: string };
		expect(missingPayload.code).toBe("TEST_NOT_FOUND");
	});

	test("PATCH header fields → 200 detail mới; strict body lạ → 400", async () => {
		const patch = makeRequest(
			app,
			"PATCH",
			"/api/admin/library/tests/lt-skill",
		);
		const res = await patch({
			user: "admin",
			body: { title: "Listening Mock v2", timeLimitSeconds: 1800 },
		});
		expect(res.status).toBe(200);
		const detail = (await res.json()) as {
			title: string;
			timeLimitSeconds: number;
		};
		expect(detail.title).toBe("Listening Mock v2");
		expect(detail.timeLimitSeconds).toBe(1800);

		const bad = await patch({ user: "admin", body: { nope: 1 } });
		expect(bad.status).toBe(400);

		const missing = await makeRequest(
			app,
			"PATCH",
			"/api/admin/library/tests/nope",
		)({
			user: "admin",
			body: { title: "X" },
		});
		expect(missing.status).toBe(404);
	});

	test("PATCH status ready khi đề rỗng (0 part) → 400 NOT_READY với issue parts", async () => {
		const res = await makeRequest(
			app,
			"PATCH",
			"/api/admin/library/tests/lt-skill",
		)({
			user: "admin",
			body: { status: "ready" },
		});
		expect(res.status).toBe(400);
		const payload = (await res.json()) as {
			code?: string;
			issues?: Array<{ path: string; message: string }>;
		};
		expect(payload.code).toBe("NOT_READY");
		expect(payload.issues).toContainEqual({
			path: "parts",
			message: "at least one part is required",
		});
		const [row] = await db
			.select()
			.from(libraryTest)
			.where(eq(libraryTest.id, "lt-skill"));
		expect(row?.status).toBe("draft");
	});

	test("PATCH status ready khi đề đủ điều kiện → 200 + row ready; draft hạ xuống được", async () => {
		// Điền đủ 4 slot hợp lệ cho listening — type theo catalog từng slot
		// (ASSIGNMENT_PART_TYPES); s2 match2 bankable cần optionBank ≥ 2 và
		// answer nằm trong bank.
		const slotTypes: Record<string, string> = {
			s1: "form",
			s2: "match2",
			s3: "mcq3",
			s4: "notes",
		};
		for (const slot of ["s1", "s2", "s3", "s4"]) {
			const res = await makeRequest(
				app,
				"PUT",
				`/api/admin/library/tests/lt-skill/parts/${slot}`,
			)({
				user: "admin",
				body: {
					part: slot,
					type: slotTypes[slot],
					title: `Section ${slot}`,
					band: "6.5",
					source: "",
					intro: "",
					passage: "",
					transcript: "<p>Transcript</p>",
					imageUrl: "",
					questions: [
						{
							stem: "Q1",
							answer: slot === "s2" || slot === "s3" ? "A" : "1",
							alts: "",
						},
					],
					optionBank: slot === "s2" ? ["A", "B", "C"] : [],
					note: "",
				},
			});
			expect(res.status, `slot=${slot}`).toBe(200);
		}
		// Listening ready cần audioName mọi part — seed trực tiếp cột audio
		// (route audio nằm ở file test riêng).
		for (const slot of ["s1", "s2", "s3", "s4"]) {
			await db
				.update(libraryTestPart)
				.set({
					audioKey: `library/lt-skill/${slot}/seed`,
					audioName: `${slot}.mp3`,
					audioContentType: "audio/mpeg",
					audioSize: 1,
				})
				.where(
					and(
						eq(libraryTestPart.testId, "lt-skill"),
						eq(libraryTestPart.part, slot),
					),
				);
		}
		const ready = await makeRequest(
			app,
			"PATCH",
			"/api/admin/library/tests/lt-skill",
		)({
			user: "admin",
			body: { status: "ready" },
		});
		expect(ready.status).toBe(200);
		const [row] = await db
			.select()
			.from(libraryTest)
			.where(eq(libraryTest.id, "lt-skill"));
		expect(row?.status).toBe("ready");

		const back = await makeRequest(
			app,
			"PATCH",
			"/api/admin/library/tests/lt-skill",
		)({
			user: "admin",
			body: { status: "draft" },
		});
		expect(back.status).toBe(200);
		const [row2] = await db
			.select()
			.from(libraryTest)
			.where(eq(libraryTest.id, "lt-skill"));
		expect(row2?.status).toBe("draft");
	});

	test("PATCH status ready đề reading chỉ có 1 part hợp lệ (p1 only hoặc p2 only) → 200 ready", async () => {
		for (const slot of ["p1", "p2"] as const) {
			const testId = `lt-read-1part-${slot}`;
			await db.insert(libraryTest).values({
				id: testId,
				title: `Reading 1-part (${slot})`,
				skill: "reading",
				status: "draft",
				createdBy: "u-admin",
			});
			const putRes = await makeRequest(
				app,
				"PUT",
				`/api/admin/library/tests/${testId}/parts/${slot}`,
			)({
				user: "admin",
				body: {
					part: slot,
					type: "tfng",
					title: `Passage ${slot}`,
					band: "6.5",
					source: "",
					intro: "",
					passage: "<p>Valid reading passage</p>",
					transcript: "",
					imageUrl: "",
					questions: [{ stem: "Statement 1", answer: "TRUE", alts: "" }],
					optionBank: [],
					note: "",
				},
			});
			expect(putRes.status, `PUT ${slot}`).toBe(200);

			const readyRes = await makeRequest(
				app,
				"PATCH",
				`/api/admin/library/tests/${testId}`,
			)({
				user: "admin",
				body: { status: "ready" },
			});
			expect(readyRes.status, `PATCH ready ${slot}`).toBe(200);
			const detail = (await readyRes.json()) as { status?: string };
			expect(detail.status).toBe("ready");

			const [row] = await db
				.select()
				.from(libraryTest)
				.where(eq(libraryTest.id, testId));
			expect(row?.status).toBe("ready");
		}
	});

	test("PATCH status ready đề listening chỉ có 1 part hợp lệ (s1 + audio + câu hỏi) → 200 ready", async () => {
		const testId = "lt-listen-1part-s1";
		await db.insert(libraryTest).values({
			id: testId,
			title: "Listening 1-part (s1)",
			skill: "listening",
			status: "draft",
			createdBy: "u-admin",
		});
		const putRes = await makeRequest(
			app,
			"PUT",
			`/api/admin/library/tests/${testId}/parts/s1`,
		)({
			user: "admin",
			body: validPartBody("s1"),
		});
		expect(putRes.status).toBe(200);
		await db
			.update(libraryTestPart)
			.set({
				audioKey: `library/${testId}/s1/seed`,
				audioName: "s1.mp3",
				audioContentType: "audio/mpeg",
				audioSize: 1,
			})
			.where(
				and(eq(libraryTestPart.testId, testId), eq(libraryTestPart.part, "s1")),
			);

		const readyRes = await makeRequest(
			app,
			"PATCH",
			`/api/admin/library/tests/${testId}`,
		)({
			user: "admin",
			body: { status: "ready" },
		});
		expect(readyRes.status).toBe(200);
		const detail = (await readyRes.json()) as { status?: string };
		expect(detail.status).toBe("ready");

		const [row] = await db
			.select()
			.from(libraryTest)
			.where(eq(libraryTest.id, testId));
		expect(row?.status).toBe("ready");
	});

	test("PATCH status ready đề reading có p1 hợp lệ + p2 thiếu passage → 400 NOT_READY với parts.p2.passage", async () => {
		const testId = "lt-read-partial-invalid";
		await db.insert(libraryTest).values({
			id: testId,
			title: "Reading partial invalid",
			skill: "reading",
			status: "draft",
			createdBy: "u-admin",
		});
		const p1Res = await makeRequest(
			app,
			"PUT",
			`/api/admin/library/tests/${testId}/parts/p1`,
		)({
			user: "admin",
			body: {
				part: "p1",
				type: "tfng",
				title: "Passage 1",
				band: "6.5",
				source: "",
				intro: "",
				passage: "<p>Valid passage 1</p>",
				transcript: "",
				imageUrl: "",
				questions: [{ stem: "Q1", answer: "TRUE", alts: "" }],
				optionBank: [],
				note: "",
			},
		});
		expect(p1Res.status).toBe(200);

		const p2Res = await makeRequest(
			app,
			"PUT",
			`/api/admin/library/tests/${testId}/parts/p2`,
		)({
			user: "admin",
			body: {
				part: "p2",
				type: "tfng",
				title: "Passage 2",
				band: "6.5",
				source: "",
				intro: "",
				passage: "",
				transcript: "",
				imageUrl: "",
				questions: [{ stem: "Q2", answer: "FALSE", alts: "" }],
				optionBank: [],
				note: "",
			},
		});
		expect(p2Res.status).toBe(200);

		const readyRes = await makeRequest(
			app,
			"PATCH",
			`/api/admin/library/tests/${testId}`,
		)({
			user: "admin",
			body: { status: "ready" },
		});
		expect(readyRes.status).toBe(400);
		const payload = (await readyRes.json()) as {
			code?: string;
			issues?: Array<{ path: string; message: string }>;
		};
		expect(payload.code).toBe("NOT_READY");
		expect((payload.issues ?? []).map((i) => i.path)).toContain(
			"parts.p2.passage",
		);
		const [row] = await db
			.select()
			.from(libraryTest)
			.where(eq(libraryTest.id, testId));
		expect(row?.status).toBe("draft");
	});

	test("PATCH status ready với cột questions corrupt → 400 NOT_READY kèm lý do, không 500", async () => {
		// JSON hợp lệ nhưng phần tử sai schema (stem phải là string) — seed
		// trực tiếp cột để mô phỏng dữ liệu ghi ngoài luồng (issue #426 F1).
		await db.insert(libraryTest).values({
			id: "lt-corrupt-q",
			title: "Corrupt Questions",
			skill: "reading",
			status: "draft",
			createdBy: "u-admin",
			updatedAt: new Date(3000),
		});
		await db.insert(libraryTestPart).values({
			id: "ltp-corrupt-q",
			testId: "lt-corrupt-q",
			part: "p1",
			type: "tfng",
			title: "Passage 1",
			band: "7.0",
			passage: "<p>P</p>",
			questions: JSON.stringify([{ stem: 123, answer: "TRUE", alts: "" }]),
			updatedAt: new Date(3000),
		});

		const ready = await makeRequest(
			app,
			"PATCH",
			"/api/admin/library/tests/lt-corrupt-q",
		)({ user: "admin", body: { status: "ready" } });
		// Bug cũ: cast mù `as LibraryPartInput["questions"]` → q.stem.trim()
		// TypeError → 500. Đúng: fail-soft → chặn NOT_READY có cấu trúc.
		expect(ready.status).toBe(400);
		const payload = (await ready.json()) as {
			code?: string;
			issues?: Array<{ path: string; message: string }>;
		};
		expect(payload.code).toBe("NOT_READY");
		expect((payload.issues ?? []).map((i) => i.path)).toContain(
			"parts.p1.questions",
		);

		// Biến thể thứ hai: phần tử không phải object.
		await db
			.update(libraryTestPart)
			.set({ questions: JSON.stringify(["x"]) })
			.where(
				and(
					eq(libraryTestPart.testId, "lt-corrupt-q"),
					eq(libraryTestPart.part, "p1"),
				),
			);
		const again = await makeRequest(
			app,
			"PATCH",
			"/api/admin/library/tests/lt-corrupt-q",
		)({ user: "admin", body: { status: "ready" } });
		expect(again.status).toBe(400);
		const againPayload = (await again.json()) as { code?: string };
		expect(againPayload.code).toBe("NOT_READY");
	});

	test("PUT part: slot ngoài preset → 404 PART_NOT_FOUND; body.part lệch URL → 400", async () => {
		const wrongSlot = await makeRequest(
			app,
			"PUT",
			"/api/admin/library/tests/lt-skill/parts/p1",
		)({ user: "admin", body: validPartBody("p1") });
		expect(wrongSlot.status).toBe(404);
		const payload = (await wrongSlot.json()) as { code?: string };
		expect(payload.code).toBe("PART_NOT_FOUND");

		const mismatch = await makeRequest(
			app,
			"PUT",
			"/api/admin/library/tests/lt-skill/parts/s1",
		)({ user: "admin", body: validPartBody("s2") });
		expect(mismatch.status).toBe(400);
	});

	test("PUT part cập nhật nội dung nhưng GIỮ audio có sẵn", async () => {
		await db.insert(libraryTest).values({
			id: "lt-keep",
			title: "Keep Audio",
			skill: "listening",
			status: "draft",
			createdBy: "u-admin",
		});
		await db.insert(libraryTestPart).values({
			id: "ltp-keep",
			testId: "lt-keep",
			part: "s4",
			type: "form",
			title: "Old",
			band: "6.0",
			questions: "[]",
			audioKey: "library/lt-keep/s4/keep",
			audioName: "keep.mp3",
			audioContentType: "audio/mpeg",
			audioSize: 9,
			updatedAt: new Date(1000),
		});
		const res = await makeRequest(
			app,
			"PUT",
			"/api/admin/library/tests/lt-keep/parts/s4",
		)({ user: "admin", body: validPartBody("s4", { title: "Section 4 mới" }) });
		expect(res.status).toBe(200);
		const payload = (await res.json()) as {
			part: { title: string; audio: { name: string } | null };
		};
		expect(payload.part.title).toBe("Section 4 mới");
		expect(payload.part.audio?.name).toBe("keep.mp3");
		const [row] = await db
			.select()
			.from(libraryTestPart)
			.where(
				and(
					eq(libraryTestPart.testId, "lt-keep"),
					eq(libraryTestPart.part, "s4"),
				),
			);
		expect(row?.audioKey).toBe("library/lt-keep/s4/keep");
		expect(row?.questions ? JSON.parse(row.questions) : []).toHaveLength(1);
	});

	test("PUT part trên test ready: nội dung thiếu → 400 NOT_READY; đạt → 200", async () => {
		await db
			.update(libraryTest)
			.set({ status: "ready" })
			.where(eq(libraryTest.id, "lt-skill"));

		const invalid = await makeRequest(
			app,
			"PUT",
			"/api/admin/library/tests/lt-skill/parts/s1",
		)({
			user: "admin",
			body: validPartBody("s1", {
				questions: [{ stem: "", answer: "", alts: "" }],
			}),
		});
		expect(invalid.status).toBe(400);
		const payload = (await invalid.json()) as {
			code?: string;
			issues?: Array<{ path: string }>;
		};
		expect(payload.code).toBe("NOT_READY");
		expect(payload.issues?.some((i) => i.path === "questions")).toBe(true);

		const valid = await makeRequest(
			app,
			"PUT",
			"/api/admin/library/tests/lt-skill/parts/s1",
		)({ user: "admin", body: validPartBody("s1", { title: "S1 valid" }) });
		expect(valid.status).toBe(200);

		// Trả draft lại cho các test sau.
		await db
			.update(libraryTest)
			.set({ status: "draft" })
			.where(eq(libraryTest.id, "lt-skill"));
	});

	test("DELETE part: ready → 409 giữ row; draft → 200 xoá row", async () => {
		await db
			.update(libraryTest)
			.set({ status: "ready" })
			.where(eq(libraryTest.id, "lt-skill"));
		const locked = await makeRequest(
			app,
			"DELETE",
			"/api/admin/library/tests/lt-skill/parts/s1",
		)({ user: "admin" });
		expect(locked.status).toBe(409);
		expect(
			await db
				.select()
				.from(libraryTestPart)
				.where(
					and(
						eq(libraryTestPart.testId, "lt-skill"),
						eq(libraryTestPart.part, "s1"),
					),
				),
		).toHaveLength(1);

		await db
			.update(libraryTest)
			.set({ status: "draft" })
			.where(eq(libraryTest.id, "lt-skill"));
		const ok = await makeRequest(
			app,
			"DELETE",
			"/api/admin/library/tests/lt-skill/parts/s1",
		)({ user: "admin" });
		expect(ok.status).toBe(200);
		expect(
			await db
				.select()
				.from(libraryTestPart)
				.where(
					and(
						eq(libraryTestPart.testId, "lt-skill"),
						eq(libraryTestPart.part, "s1"),
					),
				),
		).toHaveLength(0);

		const missing = await makeRequest(
			app,
			"DELETE",
			"/api/admin/library/tests/lt-skill/parts/s1",
		)({ user: "admin" });
		expect(missing.status).toBe(404);
	});

	test("DELETE test: xoá header + cascade parts trong một batch; 404 lần 2", async () => {
		const parts = await db
			.select({ id: libraryTestPart.id })
			.from(libraryTestPart)
			.where(eq(libraryTestPart.testId, "lt-skill"));
		expect(parts.length).toBeGreaterThan(0);

		const res = await makeRequest(
			app,
			"DELETE",
			"/api/admin/library/tests/lt-skill",
		)({
			user: "admin",
		});
		expect(res.status).toBe(200);
		expect(
			await db.select().from(libraryTest).where(eq(libraryTest.id, "lt-skill")),
		).toHaveLength(0);
		expect(
			await db
				.select()
				.from(libraryTestPart)
				.where(eq(libraryTestPart.testId, "lt-skill")),
		).toHaveLength(0);

		const again = await makeRequest(
			app,
			"DELETE",
			"/api/admin/library/tests/lt-skill",
		)({
			user: "admin",
		});
		expect(again.status).toBe(404);
	});
	describe("PUT part — question groups", () => {
		function seedGroupsTest() {
			return db.insert(libraryTest).values({
				id: "lt-groups",
				title: "Reading Groups Mock",
				skill: "reading",
				status: "draft",
				createdBy: "u-admin",
			});
		}

		/** Reading p1: tfng 0..2 + summary inline 3..4 — mọi luật tầng nhóm
		 * (contiguous, cover, type khớp nhóm đầu, cloze marker) đều đạt. */
		function groupsPartBody(
			overrides: Record<string, unknown> = {},
		): Record<string, unknown> {
			return {
				part: "p1",
				type: "tfng",
				title: "Passage 1",
				band: "6.5",
				source: "",
				intro: "",
				passage: "<p>Passage about cranberry bogs</p>",
				transcript: "",
				imageUrl: "",
				questions: [
					{ stem: "The bogs are flooded in winter.", answer: "TRUE", alts: "" },
					{ stem: "Growers harvest by hand.", answer: "FALSE", alts: "" },
					{
						stem: "The bog is drained each spring.",
						answer: "NOT GIVEN",
						alts: "",
					},
					{ stem: "Growers ____ the bogs.", answer: "flood", alts: "" },
					{ stem: "Berries ripen ____ autumn.", answer: "in", alts: "" },
				],
				optionBank: [],
				note: "",
				groups: [
					{
						id: "g-tfng",
						type: "tfng",
						instruction: "<p>TRUE / FALSE / NOT GIVEN</p>",
						startIndex: 0,
						count: 3,
					},
					{
						id: "g-summary",
						type: "summary",
						instruction: "<p>Complete the summary</p>",
						startIndex: 3,
						count: 2,
						answersInline: true,
					},
				],
				...overrides,
			};
		}

		test("lưu groups hợp lệ → 200, DTO trả lại đúng nhóm", async () => {
			await seedGroupsTest();
			const res = await makeRequest(
				app,
				"PUT",
				"/api/admin/library/tests/lt-groups/parts/p1",
			)({ user: "admin", body: groupsPartBody() });
			expect(res.status).toBe(200);
			const { part } = (await res.json()) as {
				part: { groups: Array<{ count: number }> };
			};
			expect(part.groups).toHaveLength(2);
			expect(part.groups[1]?.count).toBe(2);
		});

		test("GET chi tiết đề → part p1 có groups y hệt payload", async () => {
			const res = await app.request("/api/admin/library/tests/lt-groups", {
				headers: authHeaders("admin"),
			});
			expect(res.status).toBe(200);
			const detail = (await res.json()) as {
				parts: Array<{ part: string; groups: unknown[] }>;
			};
			const p1 = detail.parts.find((p) => p.part === "p1");
			// Round-trip bơm default của group schema (optionBank/flags).
			const [g1, g2] = groupsPartBody().groups as Array<
				Record<string, unknown>
			>;
			expect(p1?.groups).toEqual([
				{
					...g1,
					optionBank: [],
					answersInline: false,
					splitContent: false,
					dragDrop: false,
				},
				{ ...g2, optionBank: [], splitContent: false, dragDrop: false },
			]);
		});

		test("dải hở giữa hai nhóm → 400 invalid body", async () => {
			const [g1, g2] = groupsPartBody().groups as Array<
				Record<string, unknown>
			>;
			const res = await makeRequest(
				app,
				"PUT",
				"/api/admin/library/tests/lt-groups/parts/p1",
			)({
				user: "admin",
				body: groupsPartBody({
					groups: [
						g1,
						{ ...g2, startIndex: 4 }, // bỏ trống câu 3 — không contiguous
					],
				}),
			});
			expect(res.status).toBe(400);
			expect(await res.json()).toEqual({ error: "invalid body" });
		});

		test("payload không có groups (đề cũ) → 200, part.groups là []", async () => {
			const legacy = groupsPartBody();
			delete legacy.groups;
			const res = await makeRequest(
				app,
				"PUT",
				"/api/admin/library/tests/lt-groups/parts/p1",
			)({ user: "admin", body: legacy });
			expect(res.status).toBe(200);
			const { part } = (await res.json()) as { part: { groups: unknown[] } };
			expect(part.groups).toEqual([]);
		});

		test("đề ready: nhóm inline thiếu marker `____` → 400 NOT_READY path questions.3.stem", async () => {
			await db
				.update(libraryTest)
				.set({ status: "ready" })
				.where(eq(libraryTest.id, "lt-groups"));
			const [q1, q2, q3, , q5] = groupsPartBody().questions as Array<
				Record<string, unknown>
			>;
			const res = await makeRequest(
				app,
				"PUT",
				"/api/admin/library/tests/lt-groups/parts/p1",
			)({
				user: "admin",
				body: groupsPartBody({
					questions: [
						q1,
						q2,
						q3,
						// Câu 4 (index 3) trong nhóm inline mà thiếu marker.
						{ stem: "Growers flood the bogs.", answer: "flood", alts: "" },
						q5,
					],
				}),
			});
			expect(res.status).toBe(400);
			const payload = (await res.json()) as {
				code?: string;
				issues?: Array<{ path: string }>;
			};
			expect(payload.code).toBe("NOT_READY");
			expect(payload.issues?.some((i) => i.path === "questions.3.stem")).toBe(
				true,
			);

			// Trả draft lại cho các test sau.
			await db
				.update(libraryTest)
				.set({ status: "draft" })
				.where(eq(libraryTest.id, "lt-groups"));
		});
	});
});

function authHeaders(user: keyof typeof SESSIONS): Record<string, string> {
	return {
		origin: ADMIN_ORIGIN,
		cookie: "better-auth.session_token=t",
		"x-test-user": user,
	};
}

function validPartBody(
	part: string,
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		part,
		type: "form",
		title: `Section ${part}`,
		band: "6.5",
		source: "",
		intro: "",
		passage: "",
		transcript: "<p>Transcript</p>",
		imageUrl: "",
		questions: [{ stem: "Q1", answer: "1", alts: "" }],
		optionBank: [],
		note: "",
		...overrides,
	};
}

describe("groups corrupt guard (#425)", () => {
	// Harness tự chứa (DB in-memory riêng) — describe này nằm ngoài scope
	// `app`/`db` của describe chính.
	let app: ServerApp;
	let db: Db;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const libsql = drizzle(client, { schema });
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;

		app = buildApp({
			getDb: () => db,
			authHandler: () => new Response(null, { status: 404 }),
			corsOrigin: [TEACHER_ORIGIN],
			getSessionUser: async (headers) => {
				const key = headers.get("x-test-user");
				return key ? (SESSIONS[key] ?? null) : null;
			},
			adminEmails: ADMIN_EMAILS,
			adminOrigins: [ADMIN_ORIGIN],
		});
	});

	/** Seed test + part với cột groups corrupt (`{broken json`) hoặc sạch. */
	async function seedGuardFixture(
		id: string,
		opts: { corrupt: boolean; status?: "draft" | "ready" } = {
			corrupt: true,
		},
	) {
		await db.insert(libraryTest).values({
			id,
			title: "Groups Corrupt Guard",
			skill: "reading",
			status: opts.status ?? "draft",
			createdBy: "u-admin",
		});
		await db.insert(libraryTestPart).values({
			id: `ltp-${id}`,
			testId: id,
			part: "p1",
			type: "tfng",
			title: "Passage 1",
			band: "6.5",
			questions: JSON.stringify([
				{ stem: "The bogs are flooded in winter.", answer: "TRUE", alts: "" },
				{ stem: "Growers harvest by hand.", answer: "FALSE", alts: "" },
			]),
			groups: opts.corrupt ? "{broken json" : "[]",
			updatedAt: new Date(1000),
		});
	}

	async function groupsColumn(testId: string): Promise<string | null> {
		const [row] = await db
			.select({ groups: libraryTestPart.groups })
			.from(libraryTestPart)
			.where(
				and(eq(libraryTestPart.testId, testId), eq(libraryTestPart.part, "p1")),
			);
		return row?.groups ?? null;
	}

	/** Body hợp lệ theo schema (p1 tfng 2 câu, không groups — nhóm ngầm). */
	function guardPartBody(
		overrides: Record<string, unknown> = {},
	): Record<string, unknown> {
		return {
			part: "p1",
			type: "tfng",
			title: "Passage 1",
			band: "6.5",
			source: "",
			intro: "",
			passage: "<p>Passage about cranberry bogs</p>",
			transcript: "",
			imageUrl: "",
			questions: [
				{ stem: "The bogs are flooded in winter.", answer: "TRUE", alts: "" },
				{ stem: "Growers harvest by hand.", answer: "FALSE", alts: "" },
			],
			optionBank: [],
			note: "",
			...overrides,
		};
	}

	function putPart(testId: string, body: Record<string, unknown>) {
		return makeRequest(
			app,
			"PUT",
			`/api/admin/library/tests/${testId}/parts/p1`,
		)({ user: "admin", body });
	}

	test("PUT groups rỗng không cờ trên row corrupt → 409 GROUPS_CORRUPT, không ghi", async () => {
		await seedGuardFixture("lt-gc-echo");
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const res = await putPart("lt-gc-echo", guardPartBody({ groups: [] }));
			expect(res.status).toBe(409);
			const payload = (await res.json()) as { error?: string; code?: string };
			expect(payload.error).toBe("GROUPS_CORRUPT");
			expect(payload.code).toBe("GROUPS_CORRUPT");
			expect(await groupsColumn("lt-gc-echo")).toBe("{broken json");
			expect(
				errorSpy.mock.calls.some(
					([message, ctx]) =>
						String(message).includes("[admin-library] groups corrupt") &&
						(ctx as { reason?: string } | undefined)?.reason === "malformed",
				),
			).toBe(true);
		} finally {
			errorSpy.mockRestore();
		}
	});

	test("PUT có discardCorruptGroups → 200, ghi + log xác nhận tường minh", async () => {
		await seedGuardFixture("lt-gc-flag");
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const res = await putPart("lt-gc-flag", {
				...guardPartBody({ groups: [] }),
				discardCorruptGroups: true,
			});
			expect(res.status).toBe(200);
			expect(await groupsColumn("lt-gc-flag")).toBe("[]");
			const logged = errorSpy.mock.calls
				.map((call) => call.join(" "))
				.join("\n");
			expect(logged).toContain("discarded explicitly");
		} finally {
			errorSpy.mockRestore();
		}
	});

	test("PUT groups soạn lại (non-empty) không cờ trên row corrupt → 409", async () => {
		await seedGuardFixture("lt-gc-rebuilt");
		const res = await putPart(
			"lt-gc-rebuilt",
			guardPartBody({
				groups: [
					{
						id: "g-1",
						type: "tfng",
						instruction: "<p>TRUE / FALSE</p>",
						startIndex: 0,
						count: 2,
					},
				],
			}),
		);
		expect(res.status).toBe(409);
		const payload = (await res.json()) as { code?: string };
		expect(payload.code).toBe("GROUPS_CORRUPT");
		expect(await groupsColumn("lt-gc-rebuilt")).toBe("{broken json");
	});

	test("DTO gắn cờ: corrupt → true (groups []), sạch → false", async () => {
		await seedGuardFixture("lt-gc-dto");
		const corruptRes = await app.request("/api/admin/library/tests/lt-gc-dto", {
			headers: authHeaders("admin"),
		});
		const corruptDetail = (await corruptRes.json()) as {
			parts: Array<{ groupsCorrupt?: boolean; groups: unknown[] }>;
		};
		expect(corruptDetail.parts[0]?.groups).toEqual([]);
		expect(corruptDetail.parts[0]?.groupsCorrupt).toBe(true);

		await putPart("lt-gc-dto", {
			...guardPartBody({ groups: [] }),
			discardCorruptGroups: true,
		});
		const cleanRes = await app.request("/api/admin/library/tests/lt-gc-dto", {
			headers: authHeaders("admin"),
		});
		const cleanDetail = (await cleanRes.json()) as {
			parts: Array<{ groupsCorrupt?: boolean }>;
		};
		expect(cleanDetail.parts[0]?.groupsCorrupt).toBe(false);
	});

	test("cờ trên row SẠCH → 409 GROUPS_NOT_CORRUPT, không ghi", async () => {
		await seedGuardFixture("lt-gc-clean", { corrupt: false });
		const res = await putPart("lt-gc-clean", {
			...guardPartBody({ groups: [], title: "Đè nhầm" }),
			discardCorruptGroups: true,
		});
		expect(res.status).toBe(409);
		const payload = (await res.json()) as { code?: string };
		expect(payload.code).toBe("GROUPS_NOT_CORRUPT");
		expect(await groupsColumn("lt-gc-clean")).toBe("[]");
	});

	test("row sạch PUT bình thường không cờ → 200 (regression)", async () => {
		await seedGuardFixture("lt-gc-regression", { corrupt: false });
		const res = await putPart(
			"lt-gc-regression",
			guardPartBody({ title: "Sửa title" }),
		);
		expect(res.status).toBe(200);
	});

	test("ready validation vẫn chạy sau khi cờ cho qua → 400 NOT_READY", async () => {
		await seedGuardFixture("lt-gc-ready", {
			corrupt: true,
			status: "ready",
		});
		const res = await putPart("lt-gc-ready", {
			...guardPartBody({
				groups: [],
				questions: [{ stem: "", answer: "", alts: "" }],
			}),
			discardCorruptGroups: true,
		});
		expect(res.status).toBe(400);
		const payload = (await res.json()) as { code?: string };
		expect(payload.code).toBe("NOT_READY");
		expect(await groupsColumn("lt-gc-ready")).toBe("{broken json");
	});

	test("publish đề có part corrupt → 409 GROUPS_CORRUPT; sửa part xong publish ready thành công", async () => {
		await seedGuardFixture("lt-gc-publish");
		const patch = makeRequest(
			app,
			"PATCH",
			"/api/admin/library/tests/lt-gc-publish",
		);
		const blocked = await patch({ user: "admin", body: { status: "ready" } });
		expect(blocked.status).toBe(409);
		const blockedPayload = (await blocked.json()) as { code?: string };
		expect(blockedPayload.code).toBe("GROUPS_CORRUPT");
		const [statusRow] = await db
			.select({ status: libraryTest.status })
			.from(libraryTest)
			.where(eq(libraryTest.id, "lt-gc-publish"));
		expect(statusRow?.status).toBe("draft");

		await putPart("lt-gc-publish", {
			...guardPartBody({ groups: [] }),
			discardCorruptGroups: true,
		});
		// Guard corrupt không còn chặn và p1 đã hợp lệ → đề 1-part publish ready được.
		const afterFix = await patch({ user: "admin", body: { status: "ready" } });
		expect(afterFix.status).toBe(200);
		const afterDetail = (await afterFix.json()) as { status?: string };
		expect(afterDetail.status).toBe("ready");
		const [statusAfter] = await db
			.select({ status: libraryTest.status })
			.from(libraryTest)
			.where(eq(libraryTest.id, "lt-gc-publish"));
		expect(statusAfter?.status).toBe("ready");
	});
});

describe("admin library exercises & study packs (#533)", () => {
	let app: ServerApp;
	let db: Db;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		await client.execute("PRAGMA foreign_keys = ON");
		const libsql = drizzle(client, { schema });
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;

		app = buildApp({
			getDb: () => db,
			authHandler: () => new Response(null, { status: 404 }),
			corsOrigin: [TEACHER_ORIGIN],
			getSessionUser: async (headers) => {
				const key = headers.get("x-test-user");
				return key ? (SESSIONS[key] ?? null) : null;
			},
			adminEmails: ADMIN_EMAILS,
			adminOrigins: [ADMIN_ORIGIN],
		});
	});

	test("CRUD /api/admin/library/exercises và /api/admin/library/packs", async () => {
		const postExercise = makeRequest(
			app,
			"POST",
			"/api/admin/library/exercises",
		);
		const denied = await postExercise({
			user: "teacher",
			body: {
				skill: "grammar",
				part: "g1",
				type: "mcq",
				title: "Grammar 1",
				questions: [
					{
						stem: "He ____ a teacher.",
						opts: ["is", "are", "am", "be"],
						answer: "A",
						alts: "",
					},
				],
				status: "ready",
			},
		});
		expect(denied.status).toBe(403);

		const createdExRes = await postExercise({
			user: "admin",
			body: {
				skill: "grammar",
				part: "g1",
				type: "mcq",
				title: "Grammar Exercise 1",
				band: "6.5",
				intro: "<p>Choose the correct answer.</p>",
				questions: [
					{
						stem: "He ____ a teacher.",
						opts: ["is", "are", "am", "be"],
						answer: "A",
						alts: "",
					},
				],
				status: "ready",
			},
		});
		expect(createdExRes.status).toBe(201);
		const { exercise } = (await createdExRes.json()) as {
			exercise: { id: string; title: string; skill: string; status: string };
		};
		expect(exercise.title).toBe("Grammar Exercise 1");
		expect(exercise.skill).toBe("grammar");
		expect(exercise.status).toBe("ready");

		const getExercises = makeRequest(
			app,
			"GET",
			"/api/admin/library/exercises?skill=grammar&status=ready",
		);
		const listExRes = await getExercises({ user: "admin" });
		expect(listExRes.status).toBe(200);
		const listExData = (await listExRes.json()) as {
			exercises: Array<{ id: string }>;
		};
		expect(listExData.exercises).toHaveLength(1);
		expect(listExData.exercises[0]?.id).toBe(exercise.id);

		const putExercise = makeRequest(
			app,
			"PUT",
			`/api/admin/library/exercises/${exercise.id}`,
		);
		const updatedExRes = await putExercise({
			user: "admin",
			body: {
				skill: "grammar",
				part: "g1",
				type: "mcq",
				title: "Grammar Exercise 1 Updated",
				band: "7.0",
				intro: "<p>Choose the best answer.</p>",
				questions: [
					{
						stem: "He ____ a doctor.",
						opts: ["is", "are", "am", "be"],
						answer: "A",
						alts: "",
					},
				],
				status: "ready",
			},
		});
		expect(updatedExRes.status).toBe(200);
		const updatedExData = (await updatedExRes.json()) as {
			exercise: { title: string; band: string };
		};
		expect(updatedExData.exercise.title).toBe("Grammar Exercise 1 Updated");
		expect(updatedExData.exercise.band).toBe("7.0");

		const postPack = makeRequest(app, "POST", "/api/admin/library/packs");
		const forbiddenOrgPromptRes = await postPack({
			user: "admin",
			body: {
				title: "Bad System Pack",
				status: "ready",
				items: [
					{
						dayIndex: 1,
						sourceKind: "org_prompt",
						sourceId: "some-org-prompt",
					},
				],
			},
		});
		expect(forbiddenOrgPromptRes.status).toBe(422);

		const createdPackRes = await postPack({
			user: "admin",
			body: {
				title: "System Grammar Pack",
				description: "7-day system pack",
				status: "ready",
				items: [
					{
						dayIndex: 1,
						sourceKind: "library_exercise",
						sourceId: exercise.id,
						note: "Day 1 note",
					},
				],
			},
		});
		expect(createdPackRes.status).toBe(201);
		const { pack } = (await createdPackRes.json()) as {
			pack: {
				id: string;
				scope: string;
				orgId: string | null;
				dayCount: number;
				itemCount: number;
				items: Array<{ title: string; skill: string }>;
			};
		};
		expect(pack.scope).toBe("system");
		expect(pack.orgId).toBeNull();
		expect(pack.dayCount).toBe(1);
		expect(pack.itemCount).toBe(1);
		expect(pack.items[0]?.title).toBe("Grammar Exercise 1 Updated");
		expect(pack.items[0]?.skill).toBe("grammar");

		const getPacks = makeRequest(app, "GET", "/api/admin/library/packs");
		const listPackRes = await getPacks({ user: "admin" });
		expect(listPackRes.status).toBe(200);
		const listPackData = (await listPackRes.json()) as {
			packs: Array<{ id: string }>;
		};
		expect(listPackData.packs.map((p) => p.id)).toContain(pack.id);

		const getPackDetail = makeRequest(
			app,
			"GET",
			`/api/admin/library/packs/${pack.id}`,
		);
		const detailRes = await getPackDetail({ user: "admin" });
		expect(detailRes.status).toBe(200);

		const putPack = makeRequest(
			app,
			"PUT",
			`/api/admin/library/packs/${pack.id}`,
		);
		const updatedPackRes = await putPack({
			user: "admin",
			body: {
				title: "System Grammar Pack v2",
				description: "Updated description",
				status: "ready",
				items: [
					{
						dayIndex: 1,
						sourceKind: "library_exercise",
						sourceId: exercise.id,
						note: "Updated note",
					},
				],
			},
		});
		expect(updatedPackRes.status).toBe(200);
		const updatedPackData = (await updatedPackRes.json()) as {
			pack: { title: string };
		};
		expect(updatedPackData.pack.title).toBe("System Grammar Pack v2");

		const delPack = makeRequest(
			app,
			"DELETE",
			`/api/admin/library/packs/${pack.id}`,
		);
		const delPackRes = await delPack({ user: "admin" });
		expect(delPackRes.status).toBe(200);

		const delEx = makeRequest(
			app,
			"DELETE",
			`/api/admin/library/exercises/${exercise.id}`,
		);
		const delExRes = await delEx({ user: "admin" });
		expect(delExRes.status).toBe(200);
	});

	test("PUT /api/admin/library/packs/:id preserves item IDs, prevents duplicate assignments on reuse, and enforces 404 when revoked to draft (#554)", async () => {
		const postEx = makeRequest(app, "POST", "/api/admin/library/exercises");
		const ex1Res = await postEx({
			user: "admin",
			body: {
				skill: "grammar",
				part: "g1",
				type: "mcq",
				title: "Admin Reuse Ex 1",
				questions: [
					{
						stem: "Q1 ____",
						opts: ["A", "B", "C", "D"],
						answer: "A",
						alts: "",
					},
				],
				status: "ready",
			},
		});
		const ex2Res = await postEx({
			user: "admin",
			body: {
				skill: "grammar",
				part: "g1",
				type: "mcq",
				title: "Admin Reuse Ex 2",
				questions: [
					{
						stem: "Q2 ____",
						opts: ["A", "B", "C", "D"],
						answer: "B",
						alts: "",
					},
				],
				status: "ready",
			},
		});
		const ex1Data: { exercise: { id: string } } = await ex1Res.json();
		const ex2Data: { exercise: { id: string } } = await ex2Res.json();
		const { exercise: ex1 } = ex1Data;
		const { exercise: ex2 } = ex2Data;

		const postPack = makeRequest(app, "POST", "/api/admin/library/packs");
		const createdRes = await postPack({
			user: "admin",
			body: {
				title: "Sys Pack Reuse",
				description: "v1",
				status: "ready",
				items: [
					{
						dayIndex: 1,
						sourceKind: "library_exercise",
						sourceId: ex1.id,
						note: "v1",
					},
				],
			},
		});
		expect(createdRes.status).toBe(201);
		const createdData: {
			pack: { id: string; items: Array<{ id: string }> };
		} = await createdRes.json();
		const { pack: createdPack } = createdData;
		const item1IdBefore = createdPack.items[0]?.id;

		await db.insert(schema.organization).values({
			id: "org-admin-pack-test",
			name: "Org Admin Pack Test",
		});
		await db.insert(schema.classTable).values({
			id: "cls-admin-pack-test",
			orgId: "org-admin-pack-test",
			name: "Class Admin Pack",
			level: "6.5",
			type: "ielts",
			skills: '["reading"]',
			mode: "Online",
			schedule: '{"days":[1],"start":"18:00","end":"20:00"}',
			sessionsTotal: 8,
			sessionsDone: 0,
			status: "active",
			startDate: "2026-12-01",
			notes: "",
		});

		const assign1 = await assignStudyPackToClass(db, {
			orgId: "org-admin-pack-test",
			classId: "cls-admin-pack-test",
			packId: createdPack.id,
			startDate: "2026-12-01",
			releaseTime: "06:00",
			dueTime: "17:00",
		});
		expect(assign1.ok).toBe(true);

		const putPack = makeRequest(
			app,
			"PUT",
			`/api/admin/library/packs/${createdPack.id}`,
		);
		const updatedRes = await putPack({
			user: "admin",
			body: {
				title: "Sys Pack Reuse v2",
				description: "v2",
				status: "ready",
				items: [
					{
						dayIndex: 1,
						sourceKind: "library_exercise",
						sourceId: ex1.id,
						note: "v2 kept",
					},
					{
						dayIndex: 2,
						sourceKind: "library_exercise",
						sourceId: ex2.id,
						note: "v2 added",
					},
				],
			},
		});
		expect(updatedRes.status).toBe(200);
		const updatedData: {
			pack: { items: Array<{ id: string }> };
		} = await updatedRes.json();
		const { pack: updatedPack } = updatedData;
		expect(updatedPack.items[0]?.id).toBe(item1IdBefore);
		expect(updatedPack.items[1]?.id).not.toBe(item1IdBefore);

		const assign2 = await assignStudyPackToClass(db, {
			orgId: "org-admin-pack-test",
			classId: "cls-admin-pack-test",
			packId: createdPack.id,
			startDate: "2026-12-01",
			releaseTime: "06:00",
			dueTime: "17:00",
		});
		expect(assign2).toMatchObject({ ok: true, reused: true });

		const classAssignments = await db
			.select({ id: schema.classAssignment.id })
			.from(schema.classAssignment)
			.where(eq(schema.classAssignment.classId, "cls-admin-pack-test"));
		expect(classAssignments).toHaveLength(1);

		// Revoke system pack to draft -> must immediately return 404 even with existing active class_study_pack
		const revokeRes = await putPack({
			user: "admin",
			body: {
				title: "Sys Pack Revoked",
				description: "draft",
				status: "draft",
				items: [],
			},
		});
		expect(revokeRes.status).toBe(200);

		const assignAfterRevoke = await assignStudyPackToClass(db, {
			orgId: "org-admin-pack-test",
			classId: "cls-admin-pack-test",
			packId: createdPack.id,
			startDate: "2026-12-01",
			releaseTime: "06:00",
			dueTime: "17:00",
		});
		expect(assignAfterRevoke).toEqual({
			ok: false,
			status: 404,
			error: "study pack not found",
		});
	});
});

describe("15 IELTS Reading types & validation (#762)", () => {
	let app: ServerApp;
	let db: Db;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const libsql = drizzle(client, { schema });
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;

		app = buildApp({
			getDb: () => db,
			authHandler: () => new Response(null, { status: 404 }),
			corsOrigin: [TEACHER_ORIGIN],
			getSessionUser: async (headers) => {
				const key = headers.get("x-test-user");
				return key ? (SESSIONS[key] ?? null) : null;
			},
			adminEmails: ADMIN_EMAILS,
			adminOrigins: [ADMIN_ORIGIN],
		});
	});

	function readingPartBody(
		type: string,
		part = "p1",
		overrides: Record<string, unknown> = {},
	): Record<string, unknown> {
		const base = {
			part,
			type,
			title: `Passage ${part.toUpperCase()} (${type})`,
			band: "7.0",
			source: "",
			intro: "",
			passage: "<p>Academic reading passage content.</p>",
			transcript: "",
			imageUrl: "",
			optionBank: [] as string[],
			note: "",
			groups: [] as unknown[],
		};

		switch (type) {
			case "tfng":
				return {
					...base,
					questions: [{ stem: "Claim 1", answer: "TRUE", alts: "" }],
					...overrides,
				};
			case "ynng":
				return {
					...base,
					questions: [{ stem: "Writer view 1", answer: "YES", alts: "" }],
					...overrides,
				};
			case "mcq":
				return {
					...base,
					questions: [
						{
							stem: "Choose one",
							opts: ["Option A", "Option B", "Option C", "Option D"],
							answer: "A",
							alts: "",
						},
					],
					...overrides,
				};
			case "mcq_many":
				return {
					...base,
					questions: [
						{
							stem: "Pick two (1)",
							opts: ["Opt A", "Opt B", "Opt C", "Opt D", "Opt E", "Opt F"],
							answer: "A",
							alts: "",
							answerSet: "set-1",
						},
						{
							stem: "Pick two (2)",
							opts: ["Opt A", "Opt B", "Opt C", "Opt D", "Opt E", "Opt F"],
							answer: "F",
							alts: "",
							answerSet: "set-1",
						},
					],
					...overrides,
				};
			case "headings":
				return {
					...base,
					optionBank: ["Heading 1", "Heading 2", "Heading 3"],
					questions: [{ stem: "Paragraph A", answer: "i", alts: "" }],
					...overrides,
				};
			case "info":
			case "features":
			case "match_names":
			case "matching":
			case "sentend":
				return {
					...base,
					optionBank: ["Item A", "Item B", "Item C"],
					questions: [{ stem: `Stem for ${type}`, answer: "A", alts: "" }],
					...overrides,
				};
			case "diagram":
				return {
					...base,
					imageUrl: "https://cdn.example.com/reading-diagram.png",
					questions: [{ stem: "Top valve", answer: "inlet", alts: "" }],
					...overrides,
				};
			case "summary":
			case "sent":
			case "fill_blank":
				return {
					...base,
					questions: [
						{ stem: "The process ____ in winter.", answer: "stops", alts: "" },
					],
					...overrides,
				};
			default:
				return {
					...base,
					questions: [
						{ stem: "Where did it start?", answer: "London", alts: "" },
					],
					...overrides,
				};
		}
	}

	async function createReadingTest(
		id: string,
		status: "draft" | "ready" = "draft",
	) {
		await db.insert(libraryTest).values({
			id,
			title: `Reading ${id}`,
			skill: "reading",
			status,
			createdBy: "u-admin",
		});
	}

	test("tất cả 15 LIBRARY_READING_TYPES được chấp nhận ở draft và ready", async () => {
		expect(LIBRARY_READING_TYPES).toEqual([
			"tfng",
			"summary",
			"info",
			"mcq",
			"ynng",
			"headings",
			"mcq_many",
			"sent",
			"match_names",
			"features",
			"sentend",
			"fill_blank",
			"shortans",
			"diagram",
			"matching",
		]);
		expect(LIBRARY_READING_TYPES).toHaveLength(15);

		await createReadingTest("lt-r15-draft", "draft");
		await createReadingTest("lt-r15-ready", "ready");

		for (const type of LIBRARY_READING_TYPES) {
			const payload = readingPartBody(type, "p1");
			const parsed = libraryPartUpsertSchema.parse(payload) as LibraryPartInput;
			expect(validatePartForReady("reading", parsed), type).toEqual([]);

			const draftRes = await makeRequest(
				app,
				"PUT",
				"/api/admin/library/tests/lt-r15-draft/parts/p1",
			)({ user: "admin", body: payload });
			expect(draftRes.status, `draft ${type}`).toBe(200);

			const readyRes = await makeRequest(
				app,
				"PUT",
				"/api/admin/library/tests/lt-r15-ready/parts/p1",
			)({ user: "admin", body: payload });
			expect(readyRes.status, `ready ${type}`).toBe(200);
		}
	});

	test("note / tablecomp / flowchart bị chặn ở validatePartForReady & publish ready nhưng vẫn load được qua GET DTO", async () => {
		const legacyTypes = ["note", "tablecomp", "flowchart"] as const;
		await createReadingTest("lt-r-legacy", "draft");
		await createReadingTest("lt-r-legacy-ready", "ready");

		const slots = ["p1", "p2", "p3"] as const;
		for (const [idx, legacyType] of legacyTypes.entries()) {
			const slot = slots[idx] ?? "p1";
			const parsed = libraryPartUpsertSchema.parse(
				readingPartBody(legacyType, slot),
			) as LibraryPartInput;
			const issues = validatePartForReady("reading", parsed);
			expect(
				issues.some(
					(i) => i.path === "type" && i.message === "invalid type for part",
				),
				legacyType,
			).toBe(true);

			// Seed row cũ trực tiếp trong DB.
			await db.insert(libraryTestPart).values({
				id: `ltp-legacy-${slot}`,
				testId: "lt-r-legacy",
				part: slot,
				type: legacyType,
				title: `Legacy ${legacyType}`,
				band: "6.5",
				passage: "<p>Legacy passage</p>",
				questions: JSON.stringify([
					{ stem: "Legacy ____", opts: null, answer: "word", alts: "" },
				]),
				optionBank: "[]",
				groups: "[]",
				updatedAt: new Date(1000),
			});

			// PUT trực tiếp vào test đang ready cũng bị chặn 400 NOT_READY.
			const readyPut = await makeRequest(
				app,
				"PUT",
				"/api/admin/library/tests/lt-r-legacy-ready/parts/p1",
			)({ user: "admin", body: readingPartBody(legacyType, "p1") });
			expect(readyPut.status, `ready PUT ${legacyType}`).toBe(400);
			const readyPutJson = (await readyPut.json()) as {
				code?: string;
				issues?: Array<{ path: string }>;
			};
			expect(readyPutJson.code).toBe("NOT_READY");
			expect(readyPutJson.issues?.some((i) => i.path === "type")).toBe(true);
		}

		// GET DTO vẫn tải các row legacy bình thường.
		const getRes = await app.request("/api/admin/library/tests/lt-r-legacy", {
			headers: authHeaders("admin"),
		});
		expect(getRes.status).toBe(200);
		const detail = (await getRes.json()) as {
			parts: Array<{ part: string; type: string }>;
		};
		expect(detail.parts.map((p) => p.type)).toEqual([
			"note",
			"tablecomp",
			"flowchart",
		]);

		// Publish ready bị chặn với NOT_READY cho cả 3 slot p1/p2/p3.
		const publishRes = await makeRequest(
			app,
			"PATCH",
			"/api/admin/library/tests/lt-r-legacy",
		)({ user: "admin", body: { status: "ready" } });
		expect(publishRes.status).toBe(400);
		const publishJson = (await publishRes.json()) as {
			code?: string;
			issues?: Array<{ path: string; message: string }>;
		};
		expect(publishJson.code).toBe("NOT_READY");
		const paths = new Set((publishJson.issues ?? []).map((i) => i.path));
		expect(paths.has("parts.p1.type")).toBe(true);
		expect(paths.has("parts.p2.type")).toBe(true);
		expect(paths.has("parts.p3.type")).toBe(true);
	});

	test("headings 13 mục (i–xiii) & summary word bank 16 mục (A–P) lưu và publish ready thành công", async () => {
		await createReadingTest("lt-r-banks", "draft");

		const headings13 = Array.from({ length: 13 }, (_, i) => `Heading ${i + 1}`);
		const summary16 = Array.from({ length: 16 }, (_, i) => `word${i + 1}`);

		const p1Res = await makeRequest(
			app,
			"PUT",
			"/api/admin/library/tests/lt-r-banks/parts/p1",
		)({
			user: "admin",
			body: readingPartBody("headings", "p1", {
				optionBank: headings13,
				questions: [
					{ stem: "Section A", answer: "i", alts: "" },
					{ stem: "Section B", answer: "xiii", alts: "" },
				],
			}),
		});
		expect(p1Res.status).toBe(200);

		const p2Res = await makeRequest(
			app,
			"PUT",
			"/api/admin/library/tests/lt-r-banks/parts/p2",
		)({
			user: "admin",
			body: readingPartBody("summary", "p2", {
				optionBank: summary16,
				questions: [
					{ stem: "First ____ gap.", answer: "A", alts: "" },
					{ stem: "Second ____ gap.", answer: "P", alts: "" },
					{ stem: "Reused ____ gap.", answer: "P", alts: "" },
				],
			}),
		});
		expect(p2Res.status).toBe(200);

		const p3Res = await makeRequest(
			app,
			"PUT",
			"/api/admin/library/tests/lt-r-banks/parts/p3",
		)({
			user: "admin",
			body: readingPartBody("summary", "p3", { optionBank: [] }),
		});
		expect(p3Res.status).toBe(200);

		const publishRes = await makeRequest(
			app,
			"PATCH",
			"/api/admin/library/tests/lt-r-banks",
		)({ user: "admin", body: { status: "ready" } });
		expect(publishRes.status).toBe(200);

		const getRes = await app.request("/api/admin/library/tests/lt-r-banks", {
			headers: authHeaders("admin"),
		});
		expect(getRes.status).toBe(200);
		const detail = (await getRes.json()) as {
			status: string;
			parts: Array<{ part: string; optionBank: string[] }>;
		};
		expect(detail.status).toBe("ready");
		expect(detail.parts.find((p) => p.part === "p1")?.optionBank).toHaveLength(
			13,
		);
		expect(detail.parts.find((p) => p.part === "p2")?.optionBank).toHaveLength(
			16,
		);

		// Đáp án vượt phạm vi bank (xiv trên 13 headings, Q trên 16 summary) → 400 NOT_READY.
		const badHeading = await makeRequest(
			app,
			"PUT",
			"/api/admin/library/tests/lt-r-banks/parts/p1",
		)({
			user: "admin",
			body: readingPartBody("headings", "p1", {
				optionBank: headings13,
				questions: [{ stem: "Section A", answer: "xiv", alts: "" }],
			}),
		});
		expect(badHeading.status).toBe(400);

		const badSummary = await makeRequest(
			app,
			"PUT",
			"/api/admin/library/tests/lt-r-banks/parts/p2",
		)({
			user: "admin",
			body: readingPartBody("summary", "p2", {
				optionBank: summary16,
				questions: [{ stem: "Gap ____.", answer: "Q", alts: "" }],
			}),
		});
		expect(badSummary.status).toBe(400);
	});

	test("mcq_many (6–8 opts + answerSet), diagram (imageUrl, không pin), match_names, matching, fill_blank lưu & ready", async () => {
		await createReadingTest("lt-r-specials", "draft");

		// p1: mcq_many với 8 lựa chọn (A–H) + answerSet
		const opts8 = ["A1", "B1", "C1", "D1", "E1", "F1", "G1", "H1"];
		const p1Res = await makeRequest(
			app,
			"PUT",
			"/api/admin/library/tests/lt-r-specials/parts/p1",
		)({
			user: "admin",
			body: readingPartBody("mcq_many", "p1", {
				questions: [
					{
						stem: "Choose two (1)",
						opts: opts8,
						answer: "A",
						alts: "",
						answerSet: "pair-8",
					},
					{
						stem: "Choose two (2)",
						opts: opts8,
						answer: "H",
						alts: "",
						answerSet: "pair-8",
					},
				],
			}),
		});
		expect(p1Res.status).toBe(200);

		// p2: diagram có imageUrl và KHÔNG có pin
		const p2Res = await makeRequest(
			app,
			"PUT",
			"/api/admin/library/tests/lt-r-specials/parts/p2",
		)({
			user: "admin",
			body: readingPartBody("diagram", "p2", {
				imageUrl: "https://cdn.example.com/engine-diagram.png",
				questions: [
					{ stem: "Part 1", answer: "piston", alts: "" },
					{ stem: "Part 2", answer: "cylinder", alts: "" },
				],
			}),
		});
		expect(p2Res.status).toBe(200);

		// p3: nhóm hỗn hợp match_names + matching (tái dùng bank ≥ 2 mục) + fill_blank inline
		const p3Res = await makeRequest(
			app,
			"PUT",
			"/api/admin/library/tests/lt-r-specials/parts/p3",
		)({
			user: "admin",
			body: readingPartBody("match_names", "p3", {
				optionBank: [],
				questions: [
					{ stem: "Researcher quote 1", answer: "A", alts: "" },
					{ stem: "Researcher quote 2", answer: "B", alts: "" },
					{ stem: "Researcher quote 3", answer: "A", alts: "" },
					{ stem: "Category match 1", answer: "B", alts: "" },
					{ stem: "Category match 2", answer: "A", alts: "" },
					{ stem: "Water boils at ____ degrees.", answer: "100", alts: "" },
				],
				groups: [
					{
						id: "g-names",
						type: "match_names",
						instruction: "<p>Match each researcher</p>",
						startIndex: 0,
						count: 3,
						optionBank: ["Dr. Smith", "Prof. Lee"],
					},
					{
						id: "g-matching",
						type: "matching",
						instruction: "<p>Match each category</p>",
						startIndex: 3,
						count: 2,
						optionBank: ["Type X", "Type Y"],
					},
					{
						id: "g-fill",
						type: "fill_blank",
						instruction: "<p>Fill in the blank</p>",
						startIndex: 5,
						count: 1,
						answersInline: true,
					},
				],
			}),
		});
		expect(p3Res.status).toBe(200);

		const publishRes = await makeRequest(
			app,
			"PATCH",
			"/api/admin/library/tests/lt-r-specials",
		)({ user: "admin", body: { status: "ready" } });
		expect(publishRes.status).toBe(200);

		// mcq_many thiếu answerSet trên test ready → 400 NOT_READY
		const missingAnswerSet = await makeRequest(
			app,
			"PUT",
			"/api/admin/library/tests/lt-r-specials/parts/p1",
		)({
			user: "admin",
			body: readingPartBody("mcq_many", "p1", {
				questions: [
					{
						stem: "Missing set",
						opts: ["A", "B", "C", "D", "E", "F"],
						answer: "A",
						alts: "",
					},
				],
			}),
		});
		expect(missingAnswerSet.status).toBe(400);

		// diagram thiếu imageUrl trên test ready → 400 NOT_READY
		const missingImage = await makeRequest(
			app,
			"PUT",
			"/api/admin/library/tests/lt-r-specials/parts/p2",
		)({
			user: "admin",
			body: readingPartBody("diagram", "p2", { imageUrl: "" }),
		});
		expect(missingImage.status).toBe(400);
	});
});

describe("GET /api/admin/library/tests D1 limits & resilience", () => {
	const D1_MAX_BOUND_PARAMS = 100;
	let app: ServerApp;
	let db: Db;
	let rawClient: ReturnType<typeof createClient>;
	let guardEnabled = false;
	let executeCalls = 0;
	let batchCalls = 0;
	const observedQueries: Array<{
		sql: string;
		paramCount: number;
		mode: "execute" | "batch";
	}> = [];

	function resetQueryStats(): void {
		executeCalls = 0;
		batchCalls = 0;
		observedQueries.length = 0;
	}

	function countStmtParams(stmt: unknown): { sql: string; paramCount: number } {
		if (typeof stmt === "string") return { sql: stmt, paramCount: 0 };
		if (stmt && typeof stmt === "object" && "sql" in stmt) {
			const record = stmt as { sql: string; args?: unknown };
			const args = record.args;
			const paramCount = Array.isArray(args)
				? args.length
				: args && typeof args === "object"
					? Object.keys(args).length
					: 0;
			return { sql: record.sql, paramCount };
		}
		return { sql: "", paramCount: 0 };
	}

	function inspectStatement(stmt: unknown, mode: "execute" | "batch"): void {
		if (!guardEnabled) return;
		const info = countStmtParams(stmt);
		observedQueries.push({ ...info, mode });
		if (info.paramCount > D1_MAX_BOUND_PARAMS) {
			throw new Error(
				`D1_ERROR: too many SQL variables (${info.paramCount} > ${D1_MAX_BOUND_PARAMS})`,
			);
		}
	}

	beforeAll(async () => {
		rawClient = createClient({ url: "file::memory:" });
		const origExecute = rawClient.execute.bind(rawClient);
		const origBatch = rawClient.batch.bind(rawClient);

		const guardedClient = new Proxy(rawClient, {
			get(target, prop, receiver) {
				if (prop === "execute") {
					return (stmt: Parameters<typeof origExecute>[0]) => {
						if (guardEnabled) executeCalls += 1;
						inspectStatement(stmt, "execute");
						return origExecute(stmt);
					};
				}
				if (prop === "batch") {
					return (
						stmts: Parameters<typeof origBatch>[0],
						mode?: Parameters<typeof origBatch>[1],
					) => {
						if (guardEnabled) batchCalls += 1;
						for (const stmt of stmts) inspectStatement(stmt, "batch");
						return origBatch(stmts, mode);
					};
				}
				const value = Reflect.get(target, prop, receiver);
				return typeof value === "function" ? value.bind(target) : value;
			},
		});

		const libsql = drizzle(guardedClient, { schema });
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;

		// Seed 125 đề (> 100 giới hạn bound-param của Cloudflare D1):
		// - 110 đề reading ready ("BatchTest Reading N") có part p1 (2 câu)
		// - 10 đề listening draft/ready: 1 đề đủ 4 audio, 1 đề thiếu audio, 8 đề 0 part
		// - 5 đề edge case: corrupt questions mix, non-array questions, wildcard/backslash literal, unknown skill, part title mismatch
		const testRows: Array<typeof libraryTest.$inferInsert> = [];
		const partRows: Array<typeof libraryTestPart.$inferInsert> = [];
		for (let i = 0; i < 110; i++) {
			const id = `lt-bulk-r-${String(i).padStart(3, "0")}`;
			testRows.push({
				id,
				title: `BatchTest Reading ${i}`,
				description: "bulk reading",
				skill: "reading",
				status: "ready",
				createdBy: "u-admin",
				updatedAt: new Date(10_000 + i),
			});
			partRows.push({
				id: `ltp-bulk-r-${i}`,
				testId: id,
				part: "p1",
				type: "tfng",
				title: "Passage 1",
				passage: "Very long passage text ".repeat(50),
				questions: JSON.stringify([
					{ stem: "Q1", answer: "TRUE", alts: "" },
					{ stem: "Q2", answer: "FALSE", alts: "" },
				]),
				updatedAt: new Date(10_000 + i),
			});
		}

		// Listening full audio (4/4 slots)
		testRows.push({
			id: "lt-listen-full",
			title: "Listening Full Audio",
			skill: "listening",
			status: "ready",
			createdBy: "u-admin",
			updatedAt: new Date(20_000),
		});
		for (const slot of ["s1", "s2", "s3", "s4"]) {
			partRows.push({
				id: `ltp-lf-${slot}`,
				testId: "lt-listen-full",
				part: slot,
				type: "form",
				title: `Section ${slot}`,
				transcript: "Long transcript ".repeat(50),
				questions: JSON.stringify([{ stem: "Q", answer: "a", alts: "" }]),
				audioKey: `library/lt-listen-full/${slot}/audio.mp3`,
				audioName: `${slot}.mp3`,
				audioContentType: "audio/mpeg",
				audioSize: 100,
				updatedAt: new Date(20_000),
			});
		}

		// Listening partial audio (1/4 slots)
		testRows.push({
			id: "lt-listen-partial",
			title: "Listening Partial Audio",
			skill: "listening",
			status: "draft",
			createdBy: "u-admin",
			updatedAt: new Date(20_001),
		});
		partRows.push({
			id: "ltp-lp-s1",
			testId: "lt-listen-partial",
			part: "s1",
			type: "form",
			title: "Section 1",
			questions: JSON.stringify([{ stem: "Q", answer: "a", alts: "" }]),
			audioKey: "library/lt-listen-partial/s1/audio.mp3",
			updatedAt: new Date(20_001),
		});

		// 8 đề 0 part
		for (let i = 0; i < 8; i++) {
			testRows.push({
				id: `lt-empty-${i}`,
				title: `Empty Test ${i}`,
				skill: i % 2 === 0 ? "reading" : "listening",
				status: "draft",
				createdBy: "u-admin",
				updatedAt: new Date(20_010 + i),
			});
		}

		// Edge case 1: mix part hợp lệ + part corrupt JSON trên cùng 1 đề
		testRows.push({
			id: "lt-corrupt-mix",
			title: "Corrupt Mix Test",
			skill: "reading",
			status: "draft",
			createdBy: "u-admin",
			updatedAt: new Date(21_000),
		});
		partRows.push(
			{
				id: "ltp-cm-p1",
				testId: "lt-corrupt-mix",
				part: "p1",
				questions: JSON.stringify([
					{ stem: "Q1", answer: "A", alts: "" },
					{ stem: "Q2", answer: "B", alts: "" },
				]),
				updatedAt: new Date(21_000),
			},
			{
				id: "ltp-cm-p2",
				testId: "lt-corrupt-mix",
				part: "p2",
				questions: "{not-valid-json",
				updatedAt: new Date(21_000),
			},
			{
				id: "ltp-cm-p3",
				testId: "lt-corrupt-mix",
				part: "p3",
				questions: '{"not":"an-array"}',
				updatedAt: new Date(21_000),
			},
		);

		// Edge case 2: JSON5 trailing comma + primitive + null + empty
		testRows.push({
			id: "lt-corrupt-shapes",
			title: "Corrupt Shapes Test",
			skill: "listening",
			status: "draft",
			createdBy: "u-admin",
			updatedAt: new Date(21_001),
		});
		partRows.push(
			{
				id: "ltp-cs-s1",
				testId: "lt-corrupt-shapes",
				part: "s1",
				questions: "[1, 2,]",
				updatedAt: new Date(21_001),
			},
			{
				id: "ltp-cs-s2",
				testId: "lt-corrupt-shapes",
				part: "s2",
				questions: "123",
				updatedAt: new Date(21_001),
			},
			{
				id: "ltp-cs-s3",
				testId: "lt-corrupt-shapes",
				part: "s3",
				questions: "null",
				updatedAt: new Date(21_001),
			},
			{
				id: "ltp-cs-s4",
				testId: "lt-corrupt-shapes",
				part: "s4",
				questions: "",
				updatedAt: new Date(21_001),
			},
		);

		// Edge case 3: tiêu đề chứa ký tự đặc biệt %, _, \ và cụm tiếng Việt dài > 50 bytes
		testRows.push({
			id: "lt-wildcard-literal",
			title:
				"Score 100%_\\Literal Bộ đề IELTS Reading tổng hợp nâng cao thực hành",
			skill: "reading",
			status: "draft",
			createdBy: "u-admin",
			updatedAt: new Date(21_002),
		});

		// Edge case 4: part title khớp từ khóa nhưng header KHÔNG khớp
		testRows.push({
			id: "lt-part-title-only",
			title: "Header Without Keyword",
			skill: "reading",
			status: "draft",
			createdBy: "u-admin",
			updatedAt: new Date(21_003),
		});
		partRows.push({
			id: "ltp-pto-p1",
			testId: "lt-part-title-only",
			part: "p1",
			title: "PartOnlySecretNeedle",
			questions: JSON.stringify([{ stem: "Q1", answer: "A", alts: "" }]),
			updatedAt: new Date(21_003),
		});

		// Edge case 5: unknown skill trong DB
		testRows.push({
			id: "lt-unknown-skill",
			title: "Unknown Skill Row",
			skill: "writing",
			status: "draft",
			createdBy: "u-admin",
			updatedAt: new Date(21_004),
		});

		for (let i = 0; i < testRows.length; i += 8) {
			await db.insert(libraryTest).values(testRows.slice(i, i + 8));
		}
		for (let i = 0; i < partRows.length; i += 4) {
			await db.insert(libraryTestPart).values(partRows.slice(i, i + 4));
		}

		app = buildApp({
			getDb: () => db,
			authHandler: () => new Response(null, { status: 404 }),
			corsOrigin: [TEACHER_ORIGIN],
			getSessionUser: async (headers) => {
				const key = headers.get("x-test-user");
				return key ? (SESSIONS[key] ?? null) : null;
			},
			adminEmails: ADMIN_EMAILS,
			adminOrigins: [ADMIN_ORIGIN],
		});
		guardEnabled = true;
	});

	test("125 bộ đề không vượt giới hạn 100 bound params của D1 và không kéo cột nặng của library_test_part", async () => {
		resetQueryStats();
		const res = await makeRequest(
			app,
			"GET",
			"/api/admin/library/tests",
		)({
			user: "admin",
		});
		expect(res.status).toBe(200);

		const payload = (await res.json()) as { tests: unknown[] };
		expect(payload.tests).toHaveLength(125);
		const parsedTests = payload.tests.map((item) =>
			libraryTestListItemSchema.parse(item),
		);

		// Chạy đúng 1 D1 batch gồm 2 statement (không tách 2 execute rời).
		expect(batchCalls).toBe(1);
		expect(executeCalls).toBe(0);
		expect(observedQueries).toHaveLength(2);
		for (const q of observedQueries) {
			expect(q.paramCount).toBe(0);
		}

		const headerQueries = observedQueries.filter(
			(q) =>
				q.sql.toLowerCase().includes('from "library_test"') &&
				!q.sql.toLowerCase().includes("library_test_part"),
		);
		expect(headerQueries).toHaveLength(1);
		for (const hq of headerQueries) {
			const lower = hq.sql.toLowerCase();
			expect(lower).not.toMatch(/select\s+\*/);
			expect(lower).not.toContain("created_by");
		}

		const partQueries = observedQueries.filter((q) =>
			q.sql.toLowerCase().includes("library_test_part"),
		);
		expect(partQueries).toHaveLength(1);
		for (const pq of partQueries) {
			const lower = pq.sql.toLowerCase();
			expect(lower).not.toMatch(/select\s+\*/);
			for (const heavyCol of [
				"passage",
				"transcript",
				"groups",
				"option_bank",
				"image_url",
				"intro",
				"note",
				"source",
			]) {
				expect(lower).not.toContain(heavyCol);
			}
			// Cột questions chỉ được đọc trong json_valid / json_array_length, không select trần.
			const stripped = lower
				.replace(/json_valid\([^)]*questions[^)]*\)/g, "")
				.replace(/json_array_length\([^)]*questions[^)]*\)/g, "");
			expect(stripped).not.toContain("questions");
		}

		const listenFull = parsedTests.find((t) => t.id === "lt-listen-full");
		expect(listenFull).toMatchObject({
			partCount: 4,
			questionCount: 4,
			hasAllAudio: true,
		});
		const listenPartial = parsedTests.find((t) => t.id === "lt-listen-partial");
		expect(listenPartial).toMatchObject({
			partCount: 1,
			questionCount: 1,
			hasAllAudio: false,
		});
		const corruptMix = parsedTests.find((t) => t.id === "lt-corrupt-mix");
		expect(corruptMix).toMatchObject({
			partCount: 3,
			questionCount: 2,
			hasAllAudio: true,
		});
		const corruptShapes = parsedTests.find((t) => t.id === "lt-corrupt-shapes");
		expect(corruptShapes).toMatchObject({
			partCount: 4,
			questionCount: 0,
			hasAllAudio: false,
		});
		const unknownSkill = parsedTests.find((t) => t.id === "lt-unknown-skill");
		expect(unknownSkill?.hasAllAudio).toBe(false);
	});

	test("lọc > 100 đề dùng <= 6 params, khớp literal %/_/\\ + UTF-8 > 50 bytes và không ăn nhầm part.title", async () => {
		resetQueryStats();
		const bulkFiltered = await makeRequest(
			app,
			"GET",
			"/api/admin/library/tests?skill=reading&status=ready&q=BatchTest",
		)({ user: "admin" });
		expect(bulkFiltered.status).toBe(200);
		const bulkBody = (await bulkFiltered.json()) as {
			tests: Array<{ id: string; partCount: number; questionCount: number }>;
		};
		expect(bulkBody.tests).toHaveLength(110);
		expect(bulkBody.tests[0]?.partCount).toBe(1);
		expect(bulkBody.tests[0]?.questionCount).toBe(2);
		expect(batchCalls).toBe(1);
		expect(executeCalls).toBe(0);
		expect(observedQueries).toHaveLength(2);
		for (const q of observedQueries) {
			expect(q.paramCount).toBeLessThanOrEqual(6);
			expect(q.sql.toLowerCase()).not.toContain(" like ");
		}

		// Ký tự %, _, \ được khớp nguyên văn (không bị coi là wildcard)
		const wildcardRes = await makeRequest(
			app,
			"GET",
			`/api/admin/library/tests?q=${encodeURIComponent("100%_\\")}`,
		)({ user: "admin" });
		expect(wildcardRes.status).toBe(200);
		const wildcardBody = (await wildcardRes.json()) as {
			tests: Array<{ id: string }>;
		};
		expect(wildcardBody.tests.map((t) => t.id)).toEqual([
			"lt-wildcard-literal",
		]);

		// Chuỗi tiếng Việt > 50 bytes UTF-8 (vượt D1 LIKE 50-byte cap nếu dùng LIKE) vẫn trả 200
		const longViQuery = "Bộ đề IELTS Reading tổng hợp nâng cao thực hành";
		expect(Buffer.byteLength(longViQuery, "utf8")).toBeGreaterThan(50);
		const viRes = await makeRequest(
			app,
			"GET",
			`/api/admin/library/tests?q=${encodeURIComponent(longViQuery)}`,
		)({ user: "admin" });
		expect(viRes.status).toBe(200);
		const viBody = (await viRes.json()) as { tests: Array<{ id: string }> };
		expect(viBody.tests.map((t) => t.id)).toEqual(["lt-wildcard-literal"]);

		// Từ khóa chỉ nằm ở library_test_part.title không được khớp header
		const partTitleRes = await makeRequest(
			app,
			"GET",
			"/api/admin/library/tests?q=PartOnlySecretNeedle",
		)({ user: "admin" });
		expect(partTitleRes.status).toBe(200);
		const partTitleBody = (await partTitleRes.json()) as {
			tests: Array<{ id: string }>;
		};
		expect(partTitleBody.tests).toEqual([]);

		// ?q= dài quá 200 ký tự trả 400
		const tooLongQ = "a".repeat(201);
		const tooLongRes = await makeRequest(
			app,
			"GET",
			`/api/admin/library/tests?q=${tooLongQ}`,
		)({ user: "admin" });
		expect(tooLongRes.status).toBe(400);
	});

	test("timestamp hỏng trong DB không gây 500 ở GET /tests và GET /tests/:id; audioUploadedAt null trả rỗng không log lỗi", async () => {
		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			// Trước khi corrupt: audio_uploaded_at là NULL → trả "" và KHÔNG log lỗi.
			const cleanDetailRes = await makeRequest(
				app,
				"GET",
				"/api/admin/library/tests/lt-listen-partial",
			)({ user: "admin" });
			expect(cleanDetailRes.status).toBe(200);
			const cleanDetail = (await cleanDetailRes.json()) as {
				parts: Array<{ audio: { uploadedAt: string } | null }>;
			};
			expect(cleanDetail.parts[0]?.audio?.uploadedAt).toBe("");
			expect(errSpy).not.toHaveBeenCalled();

			guardEnabled = false;
			await rawClient.execute({
				sql: "UPDATE library_test SET updated_at = 'not-a-date', created_at = 8640000000000001 WHERE id = 'lt-listen-partial'",
			});
			await rawClient.execute({
				sql: "UPDATE library_test_part SET updated_at = 'not-a-date', audio_uploaded_at = 'not-a-date' WHERE id = 'ltp-lp-s1'",
			});
			guardEnabled = true;

			const listRes = await makeRequest(
				app,
				"GET",
				"/api/admin/library/tests?q=Listening%20Partial",
			)({ user: "admin" });
			expect(listRes.status).toBe(200);
			const listBody = (await listRes.json()) as { tests: unknown[] };
			const [item] = listBody.tests.map((t) =>
				libraryTestListItemSchema.parse(t),
			);
			expect(item?.createdAt).toBe("1970-01-01T00:00:00.000Z");
			expect(item?.updatedAt).toBe("1970-01-01T00:00:00.000Z");

			const detailRes = await makeRequest(
				app,
				"GET",
				"/api/admin/library/tests/lt-listen-partial",
			)({ user: "admin" });
			expect(detailRes.status).toBe(200);
			const detail = (await detailRes.json()) as {
				createdAt: string;
				updatedAt: string;
				parts: Array<{
					updatedAt: string;
					audio: { uploadedAt: string } | null;
				}>;
			};
			expect(detail.createdAt).toBe("1970-01-01T00:00:00.000Z");
			expect(detail.updatedAt).toBe("1970-01-01T00:00:00.000Z");
			expect(detail.parts[0]?.updatedAt).toBe("1970-01-01T00:00:00.000Z");
			expect(detail.parts[0]?.audio?.uploadedAt).toBe("");
			expect(errSpy).toHaveBeenCalled();
		} finally {
			guardEnabled = false;
			await rawClient.execute({
				sql: "UPDATE library_test SET created_at = 20001, updated_at = 20001 WHERE id = 'lt-listen-partial'",
			});
			await rawClient.execute({
				sql: "UPDATE library_test_part SET updated_at = 20001, audio_uploaded_at = NULL WHERE id = 'ltp-lp-s1'",
			});
			guardEnabled = true;
			errSpy.mockRestore();
		}
	});

	test("router.onError trả JSON 500 an toàn, log cause và không rò rỉ SQL params hay lỗi nội bộ", async () => {
		const failingApp = buildApp({
			getDb: () => {
				const drizzleErr = new Error(
					"Failed query: select * from library_test\nparams: secret-token-value",
					{ cause: new Error("D1_ERROR: simulated backend failure") },
				);
				throw drizzleErr;
			},
			authHandler: () => new Response(null, { status: 404 }),
			corsOrigin: [TEACHER_ORIGIN],
			getSessionUser: async (headers) => {
				const key = headers.get("x-test-user");
				return key ? (SESSIONS[key] ?? null) : null;
			},
			adminEmails: ADMIN_EMAILS,
			adminOrigins: [ADMIN_ORIGIN],
		});

		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const res = await makeRequest(
				failingApp,
				"GET",
				"/api/admin/library/tests",
			)({ user: "admin" });
			expect(res.status).toBe(500);
			const text = await res.text();
			expect(JSON.parse(text)).toEqual({ error: "internal server error" });
			expect(text).not.toContain("secret-token-value");
			expect(text).not.toContain("D1_ERROR");
			expect(errSpy).toHaveBeenCalledWith("[admin-library] unhandled error", {
				method: "GET",
				path: "/api/admin/library/tests",
				message: "Failed query",
				cause: "D1_ERROR: simulated backend failure",
			});
		} finally {
			errSpy.mockRestore();
		}
	});

	test("paginated mode with >100 tests stays within D1 param limits, avoids LIKE and heavy columns, and skips part query on empty page", async () => {
		resetQueryStats();
		const res = await makeRequest(
			app,
			"GET",
			"/api/admin/library/tests?page=1&pageSize=50",
		)({ user: "admin" });
		expect(res.status).toBe(200);
		expect(res.headers.get("cache-control")).toBe("no-store");

		const payload = libraryTestListPageResponseSchema.parse(await res.json());
		expect(payload.total).toBe(125);
		expect(payload.page).toBe(1);
		expect(payload.pageSize).toBe(50);
		expect(payload.totalPages).toBe(3);
		expect(payload.tests).toHaveLength(50);
		expect(payload.counts).toEqual({
			skill: { reading: 117, listening: 7 },
			status: { draft: 14, ready: 111 },
		});

		expect(batchCalls).toBe(1);
		expect(executeCalls).toBe(1);
		expect(observedQueries).toHaveLength(5);
		for (const q of observedQueries) {
			expect(q.paramCount).toBeLessThanOrEqual(50);
			expect(q.sql.toLowerCase()).not.toContain(" like ");
		}

		const headerQueries = observedQueries.filter(
			(q) =>
				q.sql.toLowerCase().includes('from "library_test"') &&
				!q.sql.toLowerCase().includes("library_test_part"),
		);
		expect(headerQueries).toHaveLength(4);
		for (const hq of headerQueries) {
			const lower = hq.sql.toLowerCase();
			expect(lower).not.toMatch(/select\s+\*/);
			expect(lower).not.toContain("created_by");
		}

		const partQueries = observedQueries.filter((q) =>
			q.sql.toLowerCase().includes("library_test_part"),
		);
		expect(partQueries).toHaveLength(1);
		for (const pq of partQueries) {
			const lower = pq.sql.toLowerCase();
			expect(pq.paramCount).toBe(50);
			expect(lower).not.toMatch(/select\s+\*/);
			for (const heavyCol of [
				"passage",
				"transcript",
				"groups",
				"option_bank",
				"image_url",
				"intro",
				"note",
				"source",
			]) {
				expect(lower).not.toContain(heavyCol);
			}
			const stripped = lower
				.replace(/json_valid\([^)]*questions[^)]*\)/g, "")
				.replace(/json_array_length\([^)]*questions[^)]*\)/g, "");
			expect(stripped).not.toContain("questions");
		}

		expect(payload.tests.find((t) => t.id === "lt-listen-full")).toMatchObject({
			partCount: 4,
			questionCount: 4,
			hasAllAudio: true,
		});
		expect(
			payload.tests.find((t) => t.id === "lt-listen-partial"),
		).toMatchObject({
			partCount: 1,
			questionCount: 1,
			hasAllAudio: false,
		});
		expect(payload.tests.find((t) => t.id === "lt-corrupt-mix")).toMatchObject({
			partCount: 3,
			questionCount: 2,
			hasAllAudio: true,
		});
		expect(
			payload.tests.find((t) => t.id === "lt-corrupt-shapes"),
		).toMatchObject({
			partCount: 4,
			questionCount: 0,
			hasAllAudio: false,
		});
		expect(
			payload.tests.find((t) => t.id === "lt-unknown-skill")?.hasAllAudio,
		).toBe(false);

		// Filtered paginated request with q > 100 matching rows stays below D1 bound-param limit without LIKE
		resetQueryStats();
		const filteredRes = await makeRequest(
			app,
			"GET",
			"/api/admin/library/tests?page=1&pageSize=50&skill=reading&status=ready&q=BatchTest",
		)({ user: "admin" });
		expect(filteredRes.status).toBe(200);
		const filteredPayload = libraryTestListPageResponseSchema.parse(
			await filteredRes.json(),
		);
		expect(filteredPayload.total).toBe(110);
		expect(filteredPayload.totalPages).toBe(3);
		expect(filteredPayload.tests).toHaveLength(50);
		expect(filteredPayload.counts).toEqual({
			skill: { reading: 110, listening: 0 },
			status: { draft: 0, ready: 110 },
		});
		for (const q of observedQueries) {
			expect(q.paramCount).toBeLessThanOrEqual(50);
			expect(q.sql.toLowerCase()).not.toContain(" like ");
		}

		// Out-of-range page (rows.length === 0) skips library_test_part query completely
		resetQueryStats();
		const emptyPageRes = await makeRequest(
			app,
			"GET",
			"/api/admin/library/tests?page=99&pageSize=50",
		)({ user: "admin" });
		expect(emptyPageRes.status).toBe(200);
		const emptyPagePayload = libraryTestListPageResponseSchema.parse(
			await emptyPageRes.json(),
		);
		expect(emptyPagePayload.tests).toEqual([]);
		expect(emptyPagePayload.total).toBe(125);
		expect(emptyPagePayload.page).toBe(99);
		expect(emptyPagePayload.totalPages).toBe(3);
		expect(batchCalls).toBe(1);
		expect(executeCalls).toBe(0);
		expect(observedQueries).toHaveLength(4);
		expect(
			observedQueries.some((q) =>
				q.sql.toLowerCase().includes("library_test_part"),
			),
		).toBe(false);
	});
});

describe("GET /api/admin/library/tests server-side pagination", () => {
	let db: Db;
	let app: ServerApp;
	const expectedOrderedIds: string[] = [];

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const libsql = drizzle(client, { schema });
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;

		// Seed 25 tests across three timestamp bands:
		// - 7 newer tests (updatedAt 60_000..60_006)
		// - 5 tied tests sharing identical updatedAt = 50_000 (spanning page 1 & page 2 at pageSize=10)
		// - 13 older tests (updatedAt 40_000..40_012)
		const newerSpecs: Array<{
			id: string;
			skill: "reading" | "listening";
			status: "ready" | "draft";
			tag: "Alpha" | "Beta";
			field: "title" | "description" | "collection" | "testGroup";
		}> = [
			{
				id: "new-0",
				skill: "reading",
				status: "ready",
				tag: "Alpha",
				field: "title",
			},
			{
				id: "new-1",
				skill: "reading",
				status: "ready",
				tag: "Alpha",
				field: "collection",
			},
			{
				id: "new-2",
				skill: "reading",
				status: "draft",
				tag: "Alpha",
				field: "description",
			},
			{
				id: "new-3",
				skill: "reading",
				status: "draft",
				tag: "Beta",
				field: "title",
			},
			{
				id: "new-4",
				skill: "listening",
				status: "ready",
				tag: "Alpha",
				field: "testGroup",
			},
			{
				id: "new-5",
				skill: "listening",
				status: "ready",
				tag: "Beta",
				field: "title",
			},
			{
				id: "new-6",
				skill: "listening",
				status: "draft",
				tag: "Alpha",
				field: "title",
			},
		];

		const tiedSpecs: Array<{
			id: string;
			skill: "reading" | "listening";
			status: "ready" | "draft";
			tag: "Alpha" | "Beta";
		}> = [
			{ id: "tie-a", skill: "reading", status: "ready", tag: "Beta" },
			{ id: "tie-b", skill: "listening", status: "draft", tag: "Alpha" },
			{ id: "tie-c", skill: "reading", status: "draft", tag: "Beta" },
			{ id: "tie-d", skill: "listening", status: "ready", tag: "Alpha" },
			{ id: "tie-e", skill: "reading", status: "ready", tag: "Alpha" },
		];

		const olderSpecs: Array<{
			id: string;
			skill: "reading" | "listening";
			status: "ready" | "draft";
		}> = [
			{ id: "old-00", skill: "reading", status: "ready" },
			{ id: "old-01", skill: "reading", status: "ready" },
			{ id: "old-02", skill: "reading", status: "ready" },
			{ id: "old-03", skill: "reading", status: "ready" },
			{ id: "old-04", skill: "reading", status: "ready" },
			{ id: "old-05", skill: "reading", status: "draft" },
			{ id: "old-06", skill: "reading", status: "draft" },
			{ id: "old-07", skill: "reading", status: "draft" },
			{ id: "old-08", skill: "listening", status: "ready" },
			{ id: "old-09", skill: "listening", status: "ready" },
			{ id: "old-10", skill: "listening", status: "draft" },
			{ id: "old-11", skill: "listening", status: "draft" },
			{ id: "old-12", skill: "listening", status: "draft" },
		];

		const rows: Array<typeof libraryTest.$inferInsert> = [];
		for (const [index, spec] of newerSpecs.entries()) {
			rows.push({
				id: spec.id,
				title:
					spec.field === "title"
						? `${spec.tag} Newer ${index}`
						: `Newer ${index}`,
				description:
					spec.field === "description" ? `${spec.tag} desc` : "plain desc",
				collection:
					spec.field === "collection" ? `${spec.tag} coll` : "plain coll",
				testGroup:
					spec.field === "testGroup" ? `${spec.tag} group` : "plain group",
				skill: spec.skill,
				status: spec.status,
				createdBy: "u-admin",
				updatedAt: new Date(60_000 + index),
			});
		}
		for (const spec of tiedSpecs) {
			rows.push({
				id: spec.id,
				title: `${spec.tag} Tied ${spec.id}`,
				skill: spec.skill,
				status: spec.status,
				createdBy: "u-admin",
				updatedAt: new Date(50_000),
			});
		}
		for (const [index, spec] of olderSpecs.entries()) {
			rows.push({
				id: spec.id,
				title: `Beta Older ${index}`,
				skill: spec.skill,
				status: spec.status,
				createdBy: "u-admin",
				updatedAt: new Date(40_000 + index),
			});
		}

		// Expected deterministic order: updatedAt DESC, id DESC
		expectedOrderedIds.push(
			...[...newerSpecs].reverse().map((s) => s.id),
			"tie-e",
			"tie-d",
			"tie-c",
			"tie-b",
			"tie-a",
			...[...olderSpecs].reverse().map((s) => s.id),
		);

		for (let i = 0; i < rows.length; i += 8) {
			await db.insert(libraryTest).values(rows.slice(i, i + 8));
		}

		await db.insert(libraryTestPart).values([
			{
				id: "pg-part-1",
				testId: "new-0",
				part: "p1",
				questions: JSON.stringify([
					{ stem: "Q1", answer: "A", alts: "" },
					{ stem: "Q2", answer: "B", alts: "" },
				]),
				updatedAt: new Date(60_000),
			},
			{
				id: "pg-part-2",
				testId: "new-0",
				part: "p2",
				questions: JSON.stringify([{ stem: "Q3", answer: "C", alts: "" }]),
				updatedAt: new Date(60_000),
			},
			{
				id: "pg-part-l1",
				testId: "new-4",
				part: "s1",
				questions: JSON.stringify([{ stem: "Q1", answer: "1", alts: "" }]),
				audioKey: "library/new-4/s1/a.mp3",
				updatedAt: new Date(60_004),
			},
		]);

		app = buildApp({
			getDb: () => db,
			authHandler: () => new Response(null, { status: 404 }),
			corsOrigin: [TEACHER_ORIGIN],
			getSessionUser: async (headers) => {
				const key = headers.get("x-test-user");
				return key ? (SESSIONS[key] ?? null) : null;
			},
			adminEmails: ADMIN_EMAILS,
			adminOrigins: [ADMIN_ORIGIN],
		});
	});

	test("slices pages cleanly for pageSize 10, 20, 50 and applies defaults when only one pagination param is provided", async () => {
		const page1Res = await makeRequest(
			app,
			"GET",
			"/api/admin/library/tests?page=1&pageSize=10",
		)({ user: "admin" });
		expect(page1Res.status).toBe(200);
		expect(page1Res.headers.get("cache-control")).toBe("no-store");
		const page1 = libraryTestListPageResponseSchema.parse(
			await page1Res.json(),
		);
		expect(page1.total).toBe(25);
		expect(page1.page).toBe(1);
		expect(page1.pageSize).toBe(10);
		expect(page1.totalPages).toBe(3);
		expect(page1.tests).toHaveLength(10);

		const page2Res = await makeRequest(
			app,
			"GET",
			"/api/admin/library/tests?page=2&pageSize=10",
		)({ user: "admin" });
		expect(page2Res.status).toBe(200);
		const page2 = libraryTestListPageResponseSchema.parse(
			await page2Res.json(),
		);
		expect(page2.page).toBe(2);
		expect(page2.tests).toHaveLength(10);

		const page3Res = await makeRequest(
			app,
			"GET",
			"/api/admin/library/tests?page=3&pageSize=10",
		)({ user: "admin" });
		expect(page3Res.status).toBe(200);
		const page3 = libraryTestListPageResponseSchema.parse(
			await page3Res.json(),
		);
		expect(page3.page).toBe(3);
		expect(page3.tests).toHaveLength(5);

		const allIds = [...page1.tests, ...page2.tests, ...page3.tests].map(
			(t) => t.id,
		);
		expect(allIds).toEqual(expectedOrderedIds);

		// Part summaries are accurately attached on page items
		expect(page1.tests.find((t) => t.id === "new-0")).toMatchObject({
			partCount: 2,
			questionCount: 3,
			hasAllAudio: true,
		});
		expect(page1.tests.find((t) => t.id === "new-4")).toMatchObject({
			partCount: 1,
			questionCount: 1,
			hasAllAudio: false,
		});

		// Default pageSize=20 when only page=1 is passed
		const defaultSizeRes = await makeRequest(
			app,
			"GET",
			"/api/admin/library/tests?page=1",
		)({ user: "admin" });
		expect(defaultSizeRes.status).toBe(200);
		const defaultSize = libraryTestListPageResponseSchema.parse(
			await defaultSizeRes.json(),
		);
		expect(defaultSize.page).toBe(1);
		expect(defaultSize.pageSize).toBe(20);
		expect(defaultSize.totalPages).toBe(2);
		expect(defaultSize.tests).toHaveLength(20);

		const page2DefaultSizeRes = await makeRequest(
			app,
			"GET",
			"/api/admin/library/tests?page=2&pageSize=20",
		)({ user: "admin" });
		expect(page2DefaultSizeRes.status).toBe(200);
		const page2DefaultSize = libraryTestListPageResponseSchema.parse(
			await page2DefaultSizeRes.json(),
		);
		expect(page2DefaultSize.tests).toHaveLength(5);
		expect(
			[...defaultSize.tests, ...page2DefaultSize.tests].map((t) => t.id),
		).toEqual(expectedOrderedIds);

		// Default page=1 when only pageSize=10 is passed
		const defaultPageRes = await makeRequest(
			app,
			"GET",
			"/api/admin/library/tests?pageSize=10",
		)({ user: "admin" });
		expect(defaultPageRes.status).toBe(200);
		const defaultPage = libraryTestListPageResponseSchema.parse(
			await defaultPageRes.json(),
		);
		expect(defaultPage.page).toBe(1);
		expect(defaultPage.pageSize).toBe(10);
		expect(defaultPage.tests.map((t) => t.id)).toEqual(
			expectedOrderedIds.slice(0, 10),
		);

		// pageSize=50 returns all 25 items on 1 page
		const largePageRes = await makeRequest(
			app,
			"GET",
			"/api/admin/library/tests?page=1&pageSize=50",
		)({ user: "admin" });
		expect(largePageRes.status).toBe(200);
		const largePage = libraryTestListPageResponseSchema.parse(
			await largePageRes.json(),
		);
		expect(largePage.totalPages).toBe(1);
		expect(largePage.tests.map((t) => t.id)).toEqual(expectedOrderedIds);
	});

	test("uses deterministic id desc tie-breaker when multiple tests share updatedAt across page boundaries", async () => {
		const [p1Res, p2Res, unpaginatedRes] = await Promise.all([
			makeRequest(
				app,
				"GET",
				"/api/admin/library/tests?page=1&pageSize=10",
			)({ user: "admin" }),
			makeRequest(
				app,
				"GET",
				"/api/admin/library/tests?page=2&pageSize=10",
			)({ user: "admin" }),
			makeRequest(app, "GET", "/api/admin/library/tests")({ user: "admin" }),
		]);
		const p1 = libraryTestListPageResponseSchema.parse(await p1Res.json());
		const p2 = libraryTestListPageResponseSchema.parse(await p2Res.json());
		const unpaginated = (await unpaginatedRes.json()) as {
			tests: Array<{ id: string }>;
		};

		// Page 1 ends with tie-e, tie-d, tie-c and page 2 starts with tie-b, tie-a
		expect(p1.tests.slice(-3).map((t) => t.id)).toEqual([
			"tie-e",
			"tie-d",
			"tie-c",
		]);
		expect(p2.tests.slice(0, 2).map((t) => t.id)).toEqual(["tie-b", "tie-a"]);

		const p1Ids = new Set(p1.tests.map((t) => t.id));
		for (const item of p2.tests) {
			expect(p1Ids.has(item.id)).toBe(false);
		}
		expect(unpaginated.tests.map((t) => t.id)).toEqual(expectedOrderedIds);
	});

	test("computes cross-dimensional facet counts accurately across skill, status, and q filters", async () => {
		// Unfiltered baseline
		const allRes = await makeRequest(
			app,
			"GET",
			"/api/admin/library/tests?page=1&pageSize=10",
		)({ user: "admin" });
		const all = libraryTestListPageResponseSchema.parse(await allRes.json());
		expect(all.total).toBe(25);
		expect(all.counts).toEqual({
			skill: { reading: 15, listening: 10 },
			status: { draft: 11, ready: 14 },
		});

		// Filtering by skill=reading preserves counts.skill.listening while narrowing counts.status
		const readingRes = await makeRequest(
			app,
			"GET",
			"/api/admin/library/tests?page=1&pageSize=10&skill=reading",
		)({ user: "admin" });
		const reading = libraryTestListPageResponseSchema.parse(
			await readingRes.json(),
		);
		expect(reading.total).toBe(15);
		expect(reading.totalPages).toBe(2);
		expect(reading.tests.every((t) => t.skill === "reading")).toBe(true);
		expect(reading.counts).toEqual({
			skill: { reading: 15, listening: 10 },
			status: { draft: 6, ready: 9 },
		});

		// Filtering by status=ready preserves counts.status.draft while narrowing counts.skill
		const readyRes = await makeRequest(
			app,
			"GET",
			"/api/admin/library/tests?page=1&pageSize=10&status=ready",
		)({ user: "admin" });
		const ready = libraryTestListPageResponseSchema.parse(
			await readyRes.json(),
		);
		expect(ready.total).toBe(14);
		expect(ready.tests.every((t) => t.status === "ready")).toBe(true);
		expect(ready.counts).toEqual({
			skill: { reading: 9, listening: 5 },
			status: { draft: 11, ready: 14 },
		});

		// Combining q=Alpha narrows both facet dimensions
		const searchRes = await makeRequest(
			app,
			"GET",
			"/api/admin/library/tests?page=1&pageSize=10&q=Alpha",
		)({ user: "admin" });
		const search = libraryTestListPageResponseSchema.parse(
			await searchRes.json(),
		);
		expect(search.total).toBe(8);
		expect(search.counts).toEqual({
			skill: { reading: 4, listening: 4 },
			status: { draft: 3, ready: 5 },
		});

		// Combining skill + status + q computes each facet without its own dimension
		const combinedRes = await makeRequest(
			app,
			"GET",
			"/api/admin/library/tests?page=1&pageSize=10&skill=reading&status=ready&q=Alpha",
		)({ user: "admin" });
		const combined = libraryTestListPageResponseSchema.parse(
			await combinedRes.json(),
		);
		expect(combined.total).toBe(3);
		expect(combined.totalPages).toBe(1);
		expect(combined.tests.map((t) => t.id)).toEqual([
			"new-1",
			"new-0",
			"tie-e",
		]);
		expect(combined.counts).toEqual({
			skill: { reading: 3, listening: 2 },
			status: { draft: 1, ready: 3 },
		});
	});

	test("handles out-of-range page and zero-match queries gracefully", async () => {
		const outOfRangeRes = await makeRequest(
			app,
			"GET",
			"/api/admin/library/tests?page=99&pageSize=10",
		)({ user: "admin" });
		expect(outOfRangeRes.status).toBe(200);
		const outOfRange = libraryTestListPageResponseSchema.parse(
			await outOfRangeRes.json(),
		);
		expect(outOfRange).toEqual({
			tests: [],
			total: 25,
			page: 99,
			pageSize: 10,
			totalPages: 3,
			counts: {
				skill: { reading: 15, listening: 10 },
				status: { draft: 11, ready: 14 },
			},
		});

		const emptyRes = await makeRequest(
			app,
			"GET",
			"/api/admin/library/tests?page=1&pageSize=20&q=NoSuchMatchKeyword",
		)({ user: "admin" });
		expect(emptyRes.status).toBe(200);
		const empty = libraryTestListPageResponseSchema.parse(
			await emptyRes.json(),
		);
		expect(empty).toEqual({
			tests: [],
			total: 0,
			page: 1,
			pageSize: 20,
			totalPages: 1,
			counts: {
				skill: { reading: 0, listening: 0 },
				status: { draft: 0, ready: 0 },
			},
		});
	});

	test("rejects invalid page and pageSize query parameters with 400", async () => {
		for (const badPage of ["0", "-1", "abc", "1.5", "01", "100001", ""]) {
			const res = await makeRequest(
				app,
				"GET",
				`/api/admin/library/tests?page=${encodeURIComponent(badPage)}`,
			)({ user: "admin" });
			expect(res.status, `page=${badPage}`).toBe(400);
			expect(await res.json()).toEqual({ error: "invalid page" });
		}

		for (const badPageSize of ["15", "100", "0", "020", "abc", ""]) {
			const res = await makeRequest(
				app,
				"GET",
				`/api/admin/library/tests?pageSize=${encodeURIComponent(badPageSize)}`,
			)({ user: "admin" });
			expect(res.status, `pageSize=${badPageSize}`).toBe(400);
			expect(await res.json()).toEqual({ error: "invalid pageSize" });
		}
	});
});
