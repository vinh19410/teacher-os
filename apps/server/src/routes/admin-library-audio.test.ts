import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { LIBRARY_AUDIO_MAX_BYTES } from "@teacher-os/api/library-contracts";
import * as schema from "@teacher-os/db/schema/index";
import {
	libraryTest,
	libraryTestPart,
} from "@teacher-os/db/schema/library-test";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import {
	buildApp,
	type Db,
	enforceDeclaredSize,
	type MediaStore,
	type ServerApp,
} from "../app";
import type { SessionUser } from "../session";

/**
 * Plan #413 phase 3 — route audio `/api/admin/library/tests/:id/parts/:part/
 * audio` trên MediaStore Map in-memory (precedent student-quiz-media.test):
 * Content-Length bắt buộc, MIME allowlist, cap 50MB, stream byte-thật;
 * upload thay thế ghi key mới → cập nhật row → xoá key cũ nền; lỗi giữa
 * chừng KHÔNG được để row trỏ object chưa tồn tại và KHÔNG xoá key cũ.
 */

const ADMIN_ORIGIN = "http://localhost:8004";
const ADMIN_EMAILS = ["root@test.local"];
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);

const ADMIN_SESSION: SessionUser = {
	userId: "u-admin",
	userName: "Root",
	email: "root@test.local",
	emailVerified: true,
	role: "admin",
};

const SESSIONS: Record<string, SessionUser | null> = {
	admin: ADMIN_SESSION,
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

function sessionFor(headers: Headers): SessionUser | null {
	const key = headers.get("x-test-user");
	return key ? (SESSIONS[key] ?? null) : null;
}

/** Store Map trong bộ nhớ + hook chạy sau khi object đã ghi, trước khi
 * handler CAS — ép race giữa hai bucket op và row update thành tất định. */
function createMemoryMediaStore() {
	const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
	const hooks: { afterPut: (() => Promise<void>) | null } = { afterPut: null };
	const store: MediaStore = {
		async put(key, body, { contentType, size }) {
			const counted = enforceDeclaredSize(body, size);
			const bytes = new Uint8Array(
				await new Response(counted.stream).arrayBuffer(),
			);
			objects.set(key, { bytes, contentType });
			const afterPut = hooks.afterPut;
			hooks.afterPut = null;
			if (afterPut) await afterPut();
		},
		async get(key) {
			const object = objects.get(key);
			if (!object) return null;
			return {
				body: new Response(object.bytes).body as ReadableStream<Uint8Array>,
				contentType: object.contentType,
				size: object.bytes.byteLength,
			};
		},
		async delete(key) {
			objects.delete(key);
		},
	};
	return { store, objects, hooks };
}

function bytesOf(length: number, fill: number): Uint8Array {
	return new Uint8Array(length).fill(fill);
}

function authHeaders(
	extra: Record<string, string> = {},
): Record<string, string> {
	return {
		origin: ADMIN_ORIGIN,
		cookie: "better-auth.session_token=t",
		"x-test-user": "admin",
		...extra,
	};
}

async function audioPut(
	app: ServerApp,
	path: string,
	options: {
		bytes?: Uint8Array;
		length?: string | null;
		type?: string | null;
		name?: string | null;
		origin?: string;
		/** null = anonymous (401); mặc định "admin". */
		user?: string | null;
	},
): Promise<Response> {
	const headers: Record<string, string> = {
		origin: options.origin ?? ADMIN_ORIGIN,
	};
	if (options.user !== null) {
		headers.cookie = "better-auth.session_token=t";
		headers["x-test-user"] = options.user ?? "admin";
	}
	if (options.length !== null) {
		headers["content-length"] =
			options.length ?? String(options.bytes?.byteLength ?? 0);
	}
	if (options.type !== null)
		headers["content-type"] = options.type ?? "audio/mpeg";
	if (options.name !== null) {
		headers["x-file-name"] =
			options.name ?? encodeURIComponent("section-1.mp3");
	}
	return app.request(path, {
		method: "PUT",
		headers,
		body: (options.bytes ?? bytesOf(4, 1)) as unknown as BodyInit,
	});
}

const AUDIO_PATH = "/api/admin/library/tests/lt-a/parts/s1/audio";

describe("admin library audio", () => {
	let app: ServerApp;
	let appNoStore: ServerApp;
	let db: Db;
	const memory = createMemoryMediaStore();
	const background: Promise<unknown>[] = [];

	const settle = async () => {
		await Promise.all(background.splice(0));
	};

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const libsql = drizzle(client, { schema });
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;

		const baseDeps = {
			getDb: () => db,
			authHandler: () => new Response(null, { status: 404 }),
			corsOrigin: [ADMIN_ORIGIN],
			getSessionUser: (headers: Headers) =>
				Promise.resolve(sessionFor(headers)),
			adminEmails: ADMIN_EMAILS,
			adminOrigins: [ADMIN_ORIGIN],
		};
		app = buildApp({
			...baseDeps,
			getLibraryAudioStore: () => memory.store,
			runInBackground: (promise) => {
				background.push(promise);
			},
		});
		appNoStore = buildApp({ ...baseDeps });

		// Đề listening draft + slot s1 đã có audio cũ trong store.
		await db.insert(libraryTest).values({
			id: "lt-a",
			title: "Listening Audio Test",
			skill: "listening",
			status: "draft",
			createdBy: "u-admin",
		});
		await db.insert(libraryTest).values({
			id: "lt-read",
			title: "Reading Audio Test",
			skill: "reading",
			status: "draft",
			createdBy: "u-admin",
		});
		await db.insert(libraryTestPart).values({
			id: "ltp-a-s1",
			testId: "lt-a",
			part: "s1",
			type: "form",
			title: "Section 1",
			band: "6.5",
			questions: JSON.stringify([{ stem: "Q1", answer: "1", alts: "" }]),
			audioKey: "library/lt-a/s1/old",
			audioName: "old.mp3",
			audioContentType: "audio/mpeg",
			audioSize: 4,
		});
		memory.objects.set("library/lt-a/s1/old", {
			bytes: bytesOf(4, 9),
			contentType: "audio/mpeg",
		});
	});

	const DENIED_USERS = [
		"teacher",
		"student",
		"admin-unverified",
		"admin-outside",
	] as const;
	test("role matrix trên PUT audio: 401/403, không ghi gì vào store lẫn row", async () => {
		const keysBefore = new Set(memory.objects.keys());
		for (const user of DENIED_USERS) {
			const res = await audioPut(app, AUDIO_PATH, {
				bytes: bytesOf(4, 1),
				user,
			});
			expect(res.status, `user=${user}`).toBe(403);
		}
		const anonymous = await audioPut(app, AUDIO_PATH, {
			bytes: bytesOf(4, 1),
			user: null,
		});
		expect(anonymous.status).toBe(401);
		expect(new Set(memory.objects.keys())).toEqual(keysBefore);
		const [row] = await db
			.select()
			.from(libraryTestPart)
			.where(
				and(eq(libraryTestPart.testId, "lt-a"), eq(libraryTestPart.part, "s1")),
			);
		expect(row?.audioKey).toBe("library/lt-a/s1/old");
	});

	test("PUT audio admin → 200, key đúng format library/<testId>/<part>/<uuid>, row cập nhật", async () => {
		const res = await audioPut(app, AUDIO_PATH, {
			bytes: bytesOf(6, 7),
			type: "audio/mp4",
			name: encodeURIComponent("section one.m4a"),
		});
		expect(res.status).toBe(200);
		const payload = (await res.json()) as {
			audio: { name: string; type: string; size: number; uploadedAt: string };
		};
		expect(payload.audio).toMatchObject({
			name: "section one.m4a",
			type: "audio/mp4",
			size: 6,
		});
		expect(payload.audio.uploadedAt).toBeTruthy();

		const [row] = await db
			.select()
			.from(libraryTestPart)
			.where(
				and(eq(libraryTestPart.testId, "lt-a"), eq(libraryTestPart.part, "s1")),
			);
		expect(row?.audioKey).toMatch(/^library\/lt-a\/s1\/[0-9a-f-]{36}$/);
		expect(row?.audioName).toBe("section one.m4a");
		expect(row?.audioContentType).toBe("audio/mp4");
		expect(row?.audioSize).toBe(6);
		expect(memory.objects.get(row?.audioKey ?? "")?.bytes).toEqual(
			bytesOf(6, 7),
		);

		// Dọn key vừa upload để các test sau sạch.
		await settle();
		if (row?.audioKey) memory.objects.delete(row.audioKey);
		await db
			.update(libraryTestPart)
			.set({
				audioKey: "library/lt-a/s1/old",
				audioName: "old.mp3",
				audioContentType: "audio/mpeg",
				audioSize: 4,
				audioUploadedAt: null,
			})
			.where(
				and(eq(libraryTestPart.testId, "lt-a"), eq(libraryTestPart.part, "s1")),
			);
		memory.objects.set("library/lt-a/s1/old", {
			bytes: bytesOf(4, 9),
			contentType: "audio/mpeg",
		});
	});

	test("CSRF: PUT audio raw vẫn cần Origin admin", async () => {
		const res = await audioPut(app, AUDIO_PATH, {
			bytes: bytesOf(4, 1),
			origin: "http://localhost:8001",
		});
		expect(res.status).toBe(403);
	});

	test("reading test → 400 INVALID_AUDIO; slot ngoài preset → 404", async () => {
		const reading = await audioPut(
			app,
			"/api/admin/library/tests/lt-read/parts/p1/audio",
			{ bytes: bytesOf(4, 1) },
		);
		expect(reading.status).toBe(400);
		const readingCode = (await reading.json()) as { code?: string };

		expect(readingCode.code).toBe("INVALID_AUDIO");

		const wrongSlot = await audioPut(
			app,
			"/api/admin/library/tests/lt-a/parts/p1/audio",
			{ bytes: bytesOf(4, 1) },
		);
		expect(wrongSlot.status).toBe(404);
		const wrongSlotCode = (await wrongSlot.json()) as { code?: string };

		expect(wrongSlotCode.code).toBe("PART_NOT_FOUND");

		const noTest = await audioPut(
			app,
			"/api/admin/library/tests/nope/parts/s1/audio",
			{ bytes: bytesOf(4, 1) },
		);
		expect(noTest.status).toBe(404);
	});

	test("thiếu/sai Content-Length → 400; MIME lạ → 415; tên file xấu → 400", async () => {
		const noLength = await audioPut(app, AUDIO_PATH, {
			bytes: bytesOf(4, 1),
			length: null,
		});
		expect(noLength.status).toBe(400);
		const noLengthCode = (await noLength.json()) as { code?: string };

		expect(noLengthCode.code).toBe("INVALID_AUDIO");

		const zero = await audioPut(app, AUDIO_PATH, {
			bytes: new Uint8Array(0),
			length: "0",
		});
		expect(zero.status).toBe(400);

		const badMime = await audioPut(app, AUDIO_PATH, {
			bytes: bytesOf(4, 1),
			type: "video/mp4",
		});
		expect(badMime.status).toBe(415);
		const badMimeCode = (await badMime.json()) as { code?: string };
		expect(badMimeCode.code).toBe("UNSUPPORTED_AUDIO_TYPE");

		const noName = await audioPut(app, AUDIO_PATH, {
			bytes: bytesOf(4, 1),
			name: null,
		});
		expect(noName.status).toBe(400);

		const emptyName = await audioPut(app, AUDIO_PATH, {
			bytes: bytesOf(4, 1),
			name: encodeURIComponent("   "),
		});
		expect(emptyName.status).toBe(400);
	});

	test("quá cap 50MB → 413 AUDIO_TOO_LARGE và KHÔNG để lại object", async () => {
		const keysBefore = new Set(memory.objects.keys());
		const res = await audioPut(app, AUDIO_PATH, {
			bytes: bytesOf(8, 1),
			length: String(LIBRARY_AUDIO_MAX_BYTES + 1),
		});
		expect(res.status).toBe(413);
		const payload = (await res.json()) as { code?: string };

		expect(payload.code).toBe("AUDIO_TOO_LARGE");
		expect(new Set(memory.objects.keys())).toEqual(keysBefore);
	});

	test("Content-Length lệch byte thật → 400, object mới bị dọn, row + object cũ nguyên", async () => {
		const res = await audioPut(app, AUDIO_PATH, {
			bytes: bytesOf(5, 1),
			length: "10",
		});
		expect(res.status).toBe(400);
		const payload = (await res.json()) as { code?: string };

		expect(payload.code).toBe("INVALID_AUDIO");
		await settle();
		const newKeys = [...memory.objects.keys()].filter(
			(k) => k !== "library/lt-a/s1/old",
		);
		expect(newKeys).toEqual([]);
		const [row] = await db
			.select()
			.from(libraryTestPart)
			.where(
				and(eq(libraryTestPart.testId, "lt-a"), eq(libraryTestPart.part, "s1")),
			);
		expect(row?.audioKey).toBe("library/lt-a/s1/old");
		expect(memory.objects.has("library/lt-a/s1/old")).toBe(true);
	});

	test("lỗi DB giữa put và CAS → 500, object mới bị dọn, key cũ KHÔNG bị xoá", async () => {
		memory.hooks.afterPut = async () => {
			throw new Error("db down");
		};
		const res = await audioPut(app, AUDIO_PATH, { bytes: bytesOf(6, 3) });
		expect(res.status).toBe(500);
		await settle();
		// Object mới (nếu store kịp set trước khi hook ném) phải được dọn;
		// object cũ phải còn nguyên và row vẫn trỏ key cũ.
		const newKeys = [...memory.objects.keys()].filter(
			(k) => k !== "library/lt-a/s1/old",
		);
		expect(newKeys).toEqual([]);
		const [row] = await db
			.select()
			.from(libraryTestPart)
			.where(
				and(eq(libraryTestPart.testId, "lt-a"), eq(libraryTestPart.part, "s1")),
			);
		expect(row?.audioKey).toBe("library/lt-a/s1/old");
		expect(memory.objects.has("library/lt-a/s1/old")).toBe(true);
	});

	test("thua CAS (row bị đổi audioKey sau put) → 409, object mới bị dọn, KHÔNG xoá key nào cũ", async () => {
		memory.hooks.afterPut = async () => {
			await db
				.update(libraryTestPart)
				.set({ audioKey: "hijacked" })
				.where(
					and(
						eq(libraryTestPart.testId, "lt-a"),
						eq(libraryTestPart.part, "s1"),
					),
				);
		};
		const res = await audioPut(app, AUDIO_PATH, { bytes: bytesOf(6, 4) });
		expect(res.status).toBe(409);
		await settle();
		const newKeys = [...memory.objects.keys()].filter(
			(k) => k !== "library/lt-a/s1/old",
		);
		expect(newKeys).toEqual([]);
		const [row] = await db
			.select()
			.from(libraryTestPart)
			.where(
				and(eq(libraryTestPart.testId, "lt-a"), eq(libraryTestPart.part, "s1")),
			);
		expect(row?.audioKey).toBe("hijacked");
		expect(memory.objects.has("library/lt-a/s1/old")).toBe(true);
		// Trả state cho test thay thế.
		await db
			.update(libraryTestPart)
			.set({ audioKey: "library/lt-a/s1/old" })
			.where(
				and(eq(libraryTestPart.testId, "lt-a"), eq(libraryTestPart.part, "s1")),
			);
	});

	test("upload thay thế thành công → sau settle() key cũ biến mất, row trỏ key mới", async () => {
		const res = await audioPut(app, AUDIO_PATH, { bytes: bytesOf(5, 5) });
		expect(res.status).toBe(200);
		const payload = (await res.json()) as { audio: { size: number } };
		expect(payload.audio.size).toBe(5);
		await settle();
		const [row] = await db
			.select()
			.from(libraryTestPart)
			.where(
				and(eq(libraryTestPart.testId, "lt-a"), eq(libraryTestPart.part, "s1")),
			);
		expect(row?.audioKey).toBeTruthy();
		expect(row?.audioKey === "library/lt-a/s1/old").toBe(false);
		expect(memory.objects.has("library/lt-a/s1/old")).toBe(false);
		expect(memory.objects.has(row?.audioKey ?? "")).toBe(true);
	});

	test("upload vào slot chưa có row → tự tạo row chỉ với audio", async () => {
		const res = await audioPut(
			app,
			"/api/admin/library/tests/lt-a/parts/s3/audio",
			{
				bytes: bytesOf(3, 2),
				name: encodeURIComponent("s3.wav"),
				type: "audio/wav",
			},
		);
		expect(res.status).toBe(200);
		const [row] = await db
			.select()
			.from(libraryTestPart)
			.where(
				and(eq(libraryTestPart.testId, "lt-a"), eq(libraryTestPart.part, "s3")),
			);
		expect(row?.audioName).toBe("s3.wav");
		expect(row?.audioContentType).toBe("audio/wav");
		expect(row?.type).toBe("");
		await settle();
	});

	test("GET audio → stream đúng header khoá; chưa có audio → 404", async () => {
		const res = await app.request(AUDIO_PATH, { headers: authHeaders() });
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
		expect(res.headers.get("Content-Length")).toBe("5");
		expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(res.headers.get("Content-Security-Policy")).toContain("sandbox");
		expect(res.headers.get("Cache-Control")).toBe("private, no-store");
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytesOf(5, 5));

		const noAudio = await app.request(
			"/api/admin/library/tests/lt-a/parts/s2/audio",
			{ headers: authHeaders() },
		);
		expect(noAudio.status).toBe(404);
	});

	test("DELETE audio: ready → 409; draft → xoá object nền + clear row; idempotent", async () => {
		// Đề đang draft, s1 có audio từ test thay thế.
		await db
			.update(libraryTest)
			.set({ status: "ready" })
			.where(eq(libraryTest.id, "lt-a"));
		const locked = await app.request(AUDIO_PATH, {
			method: "DELETE",
			headers: authHeaders(),
		});
		expect(locked.status).toBe(409);
		const [lockedRow] = await db
			.select()
			.from(libraryTestPart)
			.where(
				and(eq(libraryTestPart.testId, "lt-a"), eq(libraryTestPart.part, "s1")),
			);
		expect(lockedRow?.audioKey).toBeTruthy();

		await db
			.update(libraryTest)
			.set({ status: "draft" })
			.where(eq(libraryTest.id, "lt-a"));
		const key = lockedRow?.audioKey ?? "";
		const ok = await app.request(AUDIO_PATH, {
			method: "DELETE",
			headers: authHeaders(),
		});
		expect(ok.status).toBe(200);
		await settle();
		expect(memory.objects.has(key)).toBe(false);
		const [row] = await db
			.select()
			.from(libraryTestPart)
			.where(
				and(eq(libraryTestPart.testId, "lt-a"), eq(libraryTestPart.part, "s1")),
			);
		expect(row?.audioKey).toBeNull();
		expect(row?.audioName).toBeNull();

		const again = await app.request(AUDIO_PATH, {
			method: "DELETE",
			headers: authHeaders(),
		});
		expect(again.status).toBe(200);
	});

	test("DELETE test dọn mọi audio key — không object mồ côi", async () => {
		await db.insert(libraryTest).values({
			id: "lt-purge",
			title: "Purge Me",
			skill: "listening",
			status: "draft",
			createdBy: "u-admin",
		});
		for (const slot of ["s1", "s2"]) {
			await db.insert(libraryTestPart).values({
				id: `ltp-purge-${slot}`,
				testId: "lt-purge",
				part: slot,
				type: "",
				title: "",
				band: "6.0",
				questions: "[]",
				audioKey: `library/lt-purge/${slot}/k`,
				audioName: `${slot}.mp3`,
				audioContentType: "audio/mpeg",
				audioSize: 2,
			});
			memory.objects.set(`library/lt-purge/${slot}/k`, {
				bytes: bytesOf(2, 1),
				contentType: "audio/mpeg",
			});
		}
		const res = await app.request("/api/admin/library/tests/lt-purge", {
			method: "DELETE",
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		await settle();
		expect(memory.objects.has("library/lt-purge/s1/k")).toBe(false);
		expect(memory.objects.has("library/lt-purge/s2/k")).toBe(false);
	});

	test("store vắng mặt → PUT/GET/DELETE audio → 503 LIBRARY_AUDIO_DISABLED", async () => {
		const put = await audioPut(appNoStore, AUDIO_PATH, {
			bytes: bytesOf(4, 1),
		});
		expect(put.status).toBe(503);
		const disabled = (await put.json()) as { code?: string };
		expect(disabled.code).toBe("LIBRARY_AUDIO_DISABLED");
		const get = await appNoStore.request(AUDIO_PATH, {
			headers: authHeaders(),
		});
		expect(get.status).toBe(503);
		const del = await appNoStore.request(AUDIO_PATH, {
			method: "DELETE",
			headers: authHeaders(),
		});
		expect(del.status).toBe(503);
	});
});
