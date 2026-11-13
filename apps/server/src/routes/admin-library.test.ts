import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { LIBRARY_ERROR_CODES } from "@teacher-os/api/library-contracts";
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

	test("PATCH status ready khi đề thiếu → 400 NOT_READY kèm lý do theo part", async () => {
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
		const paths = new Set((payload.issues ?? []).map((i) => i.path));
		// Listening cần đủ 4 slot — thiếu slot báo đúng theo part.
		for (const slot of ["s1", "s2", "s3", "s4"]) {
			expect(paths.has(`parts.${slot}`), `missing path parts.${slot}`).toBe(
				true,
			);
		}
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
							answer: slot === "s2" ? "A" : "1",
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

		/** Reading p1: tfng 0..2 + note inline 3..4 — mọi luật tầng nhóm
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
						id: "g-note",
						type: "note",
						instruction: "<p>Complete the notes</p>",
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

	test("publish đề có part corrupt → 409 GROUPS_CORRUPT; sửa part xong guard nhường chỗ luật slot", async () => {
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
		// Guard corrupt không còn chặn: lỗi duy nhất còn lại là thiếu các
		// slot preset khác (p2, p3) — luật ready riêng, không phải corrupt.
		const afterFix = await patch({ user: "admin", body: { status: "ready" } });
		expect(afterFix.status).toBe(400);
		const afterPayload = (await afterFix.json()) as {
			code?: string;
			issues?: Array<{ path: string; message: string }>;
		};
		expect(afterPayload.code).toBe("NOT_READY");
		expect(
			afterPayload.issues?.some((issue) => issue.message.includes("corrupt")),
		).toBe(false);
		expect(
			afterPayload.issues?.every((issue) => issue.path.startsWith("parts.")),
		).toBe(true);
		const [statusAfter] = await db
			.select({ status: libraryTest.status })
			.from(libraryTest)
			.where(eq(libraryTest.id, "lt-gc-publish"));
		expect(statusAfter?.status).toBe("draft");
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
