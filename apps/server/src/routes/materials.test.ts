import { createClient } from "@libsql/client";
import type {
	LessonMaterialView,
	MaterialFolderView,
	MaterialView,
	StudentLessonMaterialView,
} from "@teacher-os/api/material-contracts";
import {
	MATERIAL_DOC_MAX_BYTES,
	MATERIAL_MEDIA_MAX_BYTES,
} from "@teacher-os/api/material-contracts";
import * as schema from "@teacher-os/db/schema/index";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
	buildApp,
	type Db,
	enforceDeclaredSize,
	type MediaStore,
	type ServerApp,
} from "../app";
import type { SessionUser } from "../session";

const TEACHER_ORIGIN = "http://localhost:8001";
const STUDENT_ORIGIN = "http://localhost:8003";
const MIGRATIONS_DIR = new URL(
	"../../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

const PDF = "application/pdf";
const SESSION_DATE = "2026-11-10";
const OTHER_DATE = "2026-11-12";

const SESSIONS: Record<string, SessionUser> = {
	"teacher-1": {
		userId: "t-1",
		userName: "Cô Lan",
		email: "lan@test.local",
		emailVerified: true,
		role: "teacher",
	},
	"ta-1": {
		userId: "ta-1",
		userName: "Trợ giảng",
		email: "ta@test.local",
		emailVerified: true,
		role: "teacher",
	},
	"teacher-2": {
		userId: "t-2",
		userName: "Thầy Nam",
		email: "nam@test.local",
		emailVerified: true,
		role: "teacher",
	},
	"student-1": {
		userId: "u-stu-1",
		userName: "Minh",
		email: "minh@student.local",
		emailVerified: true,
		role: "student",
	},
	"student-2": {
		userId: "u-stu-2",
		userName: "Hà",
		email: "ha@student.local",
		emailVerified: true,
		role: "student",
	},
};

function sessionFor(headers: Headers): Promise<SessionUser | null> {
	const key = headers.get("x-test-user");
	return Promise.resolve(key ? (SESSIONS[key] ?? null) : null);
}

function createMemoryStore() {
	const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
	const failures = { delete: false };
	const store: MediaStore = {
		async put(key, body, { contentType, size }) {
			const counted = enforceDeclaredSize(body, size);
			const bytes = new Uint8Array(
				await new Response(counted.stream).arrayBuffer(),
			);
			objects.set(key, { bytes, contentType });
		},
		async get(key, range) {
			const object = objects.get(key);
			if (!object) return null;
			const bytes = range
				? object.bytes.slice(range.offset, range.offset + range.length)
				: object.bytes;
			return {
				body: new Response(bytes).body as ReadableStream<Uint8Array>,
				contentType: object.contentType,
				size: object.bytes.byteLength,
				...(range ? { range } : {}),
			};
		},
		async delete(key) {
			if (failures.delete) throw new Error("r2 down");
			objects.delete(key);
		},
	};
	return { store, objects, failures };
}

function bytesOf(length: number, fill = 7): Uint8Array {
	return new Uint8Array(length).fill(fill);
}

describe("material bank and session materials", () => {
	let app: ServerApp;
	let appNoStore: ServerApp;
	let db: Db;
	const memory = createMemoryStore();
	const background: Promise<unknown>[] = [];
	const settle = async () => {
		await Promise.all(background.splice(0));
	};

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		await client.execute("PRAGMA foreign_keys = ON");
		const libsql = drizzle(client, { schema });
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;

		await db.insert(schema.organization).values([
			{ id: "org-1", name: "Academy 1" },
			{ id: "org-2", name: "Academy 2" },
		]);
		await db.insert(schema.user).values([
			{ id: "t-1", name: "Cô Lan", email: "lan@test.local", role: "teacher" },
			{
				id: "ta-1",
				name: "Trợ giảng",
				email: "ta@test.local",
				role: "teacher",
			},
			{ id: "t-2", name: "Thầy Nam", email: "nam@test.local", role: "teacher" },
		]);
		await db.insert(schema.membership).values([
			{ id: "mem-1", orgId: "org-1", userId: "t-1", role: "teacher" },
			{ id: "mem-ta", orgId: "org-1", userId: "ta-1", role: "ta" },
			{ id: "mem-2", orgId: "org-2", userId: "t-2", role: "teacher" },
		]);
		await db.insert(schema.student).values([
			{
				id: "stu-1",
				orgId: "org-1",
				name: "Minh",
				email: "minh@student.local",
				phone: "0901111111",
			},
			{
				id: "stu-2",
				orgId: "org-1",
				name: "Hà",
				email: "ha@student.local",
				phone: "0902222222",
			},
		]);
		const classBase = {
			orgId: "org-1",
			level: "6.5",
			type: "ielts",
			skills: '["reading"]',
			mode: "Online",
			schedule: '{"days":[1],"start":"18:00","end":"20:00"}',
			sessionsTotal: 4,
			sessionsDone: 0,
			status: "active",
			startDate: "2026-11-01",
			notes: "",
		};
		await db.insert(schema.classTable).values([
			{ ...classBase, id: "class-1", name: "IELTS A" },
			{ ...classBase, id: "class-2", name: "IELTS B" },
			{ ...classBase, id: "class-x", orgId: "org-2", name: "Org 2 class" },
		]);
		await db.insert(schema.enrollment).values([
			{
				id: "enr-1",
				orgId: "org-1",
				classId: "class-1",
				studentId: "stu-1",
				status: "active",
			},
			{
				id: "enr-2",
				orgId: "org-1",
				classId: "class-2",
				studentId: "stu-2",
				status: "active",
			},
		]);
		const lessonBase = { orgId: "org-1", day: 2, time: "18:00", dur: 120 };
		await db.insert(schema.lesson).values([
			{
				...lessonBase,
				id: "l-1",
				classId: "class-1",
				enrollmentId: "enr-1",
				date: SESSION_DATE,
			},
			{
				...lessonBase,
				id: "l-1b",
				classId: "class-1",
				enrollmentId: "enr-1",
				date: OTHER_DATE,
			},
			{
				...lessonBase,
				id: "l-2",
				classId: "class-2",
				enrollmentId: "enr-2",
				date: SESSION_DATE,
			},
		]);

		const base = {
			getDb: () => db,
			authHandler: () => new Response(null, { status: 404 }),
			corsOrigin: [TEACHER_ORIGIN, STUDENT_ORIGIN],
			getSessionUser: sessionFor,
		};
		app = buildApp({
			...base,
			getMaterialsStore: () => memory.store,
			runInBackground: (promise) => {
				background.push(promise);
			},
		});
		appNoStore = buildApp(base);
	});

	beforeEach(() => {
		memory.failures.delete = false;
	});

	function headers(user = "teacher-1"): Record<string, string> {
		return {
			"x-test-user": user,
			Origin: user.startsWith("student") ? STUDENT_ORIGIN : TEACHER_ORIGIN,
			"Content-Type": "application/json",
		};
	}

	function json(
		path: string,
		method: string,
		body: unknown,
		user = "teacher-1",
		target: ServerApp = app,
	) {
		return target.request(path, {
			method,
			headers: headers(user),
			body: JSON.stringify(body),
		});
	}

	function get(
		path: string,
		user = "teacher-1",
		extra: Record<string, string> = {},
	) {
		return app.request(path, {
			headers: { "x-test-user": user, ...extra },
		});
	}

	function del(path: string, user = "teacher-1") {
		return app.request(path, {
			method: "DELETE",
			headers: { "x-test-user": user, Origin: TEACHER_ORIGIN },
		});
	}

	function upload(
		path: string,
		options: {
			bytes?: Uint8Array;
			type?: string;
			name?: string;
			length?: string;
			user?: string;
			target?: ServerApp;
		} = {},
	) {
		const bytes = options.bytes ?? bytesOf(8);
		return (options.target ?? app).request(path, {
			method: "PUT",
			headers: {
				"x-test-user": options.user ?? "teacher-1",
				Origin: TEACHER_ORIGIN,
				"Content-Type": options.type ?? PDF,
				"Content-Length": options.length ?? String(bytes.byteLength),
				"X-File-Name": encodeURIComponent(options.name ?? "Unit 1.pdf"),
			},
			body: bytes as unknown as BodyInit,
		});
	}

	async function createLink(title: string, folderId: string | null = null) {
		const res = await json("/api/materials/links", "POST", {
			title,
			url: "https://example.com/video",
			folderId,
		});
		expect(res.status).toBe(201);
		return ((await res.json()) as { material: MaterialView }).material;
	}

	async function createFolder(
		name: string,
		parentId: string | null = null,
		user = "teacher-1",
	) {
		return json("/api/materials/folders", "POST", { name, parentId }, user);
	}

	const sessionPath = (classId = "class-1", date = SESSION_DATE) =>
		`/api/classes/${classId}/sessions/${date}/materials`;

	test("role gate: anonymous 401, student role 403, ta reads but cannot write", async () => {
		expect((await app.request("/api/materials")).status).toBe(401);
		expect((await get("/api/materials", "student-1")).status).toBe(403);
		expect((await get("/api/materials", "ta-1")).status).toBe(200);
		expect((await get(sessionPath(), "ta-1")).status).toBe(200);
		const taCreate = await json(
			"/api/materials/links",
			"POST",
			{ title: "x", url: "https://a.b" },
			"ta-1",
		);
		expect(taCreate.status).toBe(403);
		expect((await createFolder("TA folder", null, "ta-1")).status).toBe(403);
		expect(
			(await upload("/api/materials/files", { user: "ta-1" })).status,
		).toBe(403);
	});

	test("folder CRUD: unique names per parent, rename, move, delete only when empty", async () => {
		const resA = await createFolder("Unit A");
		expect(resA.status).toBe(201);
		const folderA = ((await resA.json()) as { folder: MaterialFolderView })
			.folder;
		expect((await createFolder("Unit A")).status).toBe(409);
		const resB = await createFolder("Unit A", folderA.id);
		expect(resB.status).toBe(201);
		const folderB = ((await resB.json()) as { folder: MaterialFolderView })
			.folder;
		expect(folderB.parentId).toBe(folderA.id);

		// Rename collides with a sibling at the root.
		await createFolder("Unit C");
		const clash = await json(`/api/materials/folders/${folderA.id}`, "PATCH", {
			name: "Unit C",
		});
		expect(clash.status).toBe(409);
		const renamed = await json(
			`/api/materials/folders/${folderA.id}`,
			"PATCH",
			{ name: "Unit A1" },
		);
		expect(renamed.status).toBe(200);
		expect(
			((await renamed.json()) as { folder: MaterialFolderView }).folder.name,
		).toBe("Unit A1");

		// Moving a folder into its own child is a cycle.
		const cycle = await json(`/api/materials/folders/${folderA.id}`, "PATCH", {
			parentId: folderB.id,
		});
		expect(cycle.status).toBe(400);
		expect(((await cycle.json()) as { code: string }).code).toBe(
			"FOLDER_CYCLE",
		);

		// Move B to the root.
		const moved = await json(`/api/materials/folders/${folderB.id}`, "PATCH", {
			parentId: null,
		});
		expect(moved.status).toBe(200);
		expect(
			((await moved.json()) as { folder: MaterialFolderView }).folder.parentId,
		).toBeNull();

		// Non-empty folder (has a material) cannot be deleted.
		const link = await createLink("Inside A", folderA.id);
		const notEmpty = await del(`/api/materials/folders/${folderA.id}`);
		expect(notEmpty.status).toBe(409);
		expect(((await notEmpty.json()) as { code: string }).code).toBe(
			"FOLDER_NOT_EMPTY",
		);
		// Folder with a child folder cannot be deleted either.
		const childRes = await createFolder("Child", folderB.id);
		const child = ((await childRes.json()) as { folder: MaterialFolderView })
			.folder;
		expect((await del(`/api/materials/folders/${folderB.id}`)).status).toBe(
			409,
		);
		expect((await del(`/api/materials/folders/${child.id}`)).status).toBe(200);
		expect((await del(`/api/materials/folders/${folderB.id}`)).status).toBe(
			200,
		);

		// Moving the material out empties folder A.
		const out = await json(`/api/materials/${link.id}`, "PATCH", {
			folderId: null,
		});
		expect(out.status).toBe(200);
		expect((await del(`/api/materials/folders/${folderA.id}`)).status).toBe(
			200,
		);
		expect((await del(`/api/materials/folders/${folderA.id}`)).status).toBe(
			404,
		);
	});

	test("folder depth is capped at five levels, including moves", async () => {
		let parent: string | null = null;
		const ids: string[] = [];
		for (let level = 1; level <= 5; level++) {
			const res = await createFolder(`Depth ${level}`, parent);
			expect(res.status).toBe(201);
			const id = ((await res.json()) as { folder: MaterialFolderView }).folder
				.id;
			ids.push(id);
			parent = id;
		}
		const tooDeep = await createFolder("Depth 6", parent);
		expect(tooDeep.status).toBe(400);
		expect(((await tooDeep.json()) as { code: string }).code).toBe(
			"FOLDER_TOO_DEEP",
		);
		// A two-level subtree cannot move under level 4.
		const top = await createFolder("Subtree top");
		const topId = ((await top.json()) as { folder: MaterialFolderView }).folder
			.id;
		await createFolder("Subtree leaf", topId);
		const move = await json(`/api/materials/folders/${topId}`, "PATCH", {
			parentId: ids[3],
		});
		expect(move.status).toBe(400);
		const okMove = await json(`/api/materials/folders/${topId}`, "PATCH", {
			parentId: ids[2],
		});
		expect(okMove.status).toBe(200);
	});

	test("link create validates url and fields; list filters by q, kind, folder", async () => {
		for (const url of [
			"javascript:alert(1)",
			"data:text/html,<b>x</b>",
			"ftp://x.y",
		]) {
			const res = await json("/api/materials/links", "POST", {
				title: "Bad",
				url,
			});
			expect(res.status).toBe(400);
		}
		expect(
			(
				await json("/api/materials/links", "POST", {
					title: "x".repeat(201),
					url: "https://a.b",
				})
			).status,
		).toBe(400);
		expect(
			(
				await json("/api/materials/links", "POST", {
					title: "x",
					url: "https://a.b",
					folderId: "missing",
				})
			).status,
		).toBe(404);

		const folderRes = await createFolder("Listening pack");
		const folder = ((await folderRes.json()) as { folder: MaterialFolderView })
			.folder;
		const link = await createLink("Zebra podcast", folder.id);
		expect(link).toMatchObject({
			kind: "link",
			url: "https://example.com/video",
			folderId: folder.id,
			usageCount: 0,
		});
		expect(link).not.toHaveProperty("createdBy");
		expect(link).not.toHaveProperty("objectKey");

		const search = await get("/api/materials?q=zEbRa");
		const found = (await search.json()) as { items: MaterialView[] };
		expect(found.items.map((i) => i.id)).toEqual([link.id]);
		const byFolder = (await (
			await get(`/api/materials?folderId=${folder.id}`)
		).json()) as { items: MaterialView[] };
		expect(byFolder.items.map((i) => i.id)).toEqual([link.id]);
		const byRoot = (await (
			await get("/api/materials?folderId=root")
		).json()) as {
			items: MaterialView[];
		};
		expect(byRoot.items.map((i) => i.id)).not.toContain(link.id);
		const byKind = (await (await get("/api/materials?kind=file")).json()) as {
			items: MaterialView[];
		};
		expect(byKind.items.every((i) => i.kind === "file")).toBe(true);
		expect((await get("/api/materials?kind=video")).status).toBe(400);

		const edited = await json(`/api/materials/${link.id}`, "PATCH", {
			title: "Zebra podcast ep 2",
			description: "Nghe trước buổi học",
		});
		expect(edited.status).toBe(200);
		expect(
			((await edited.json()) as { material: MaterialView }).material,
		).toMatchObject({
			title: "Zebra podcast ep 2",
			description: "Nghe trước buổi học",
		});
		expect((await json(`/api/materials/${link.id}`, "PATCH", {})).status).toBe(
			400,
		);
	});

	test("file upload: whitelist, size caps, stored under <orgId>/<id>, download with Range", async () => {
		expect(
			(await upload("/api/materials/files", { type: "text/html" })).status,
		).toBe(415);
		expect(
			(await upload("/api/materials/files", { type: "image/svg+xml" })).status,
		).toBe(415);
		expect(
			(
				await upload("/api/materials/files", {
					length: String(MATERIAL_DOC_MAX_BYTES + 1),
				})
			).status,
		).toBe(413);
		expect(
			(
				await upload("/api/materials/files", {
					type: "video/mp4",
					length: String(MATERIAL_MEDIA_MAX_BYTES + 1),
				})
			).status,
		).toBe(413);
		expect((await upload("/api/materials/files", { length: "0" })).status).toBe(
			400,
		);
		expect((await upload("/api/materials/files", { name: "" })).status).toBe(
			400,
		);
		// Declared length lies about the body: rejected, nothing persisted.
		const before = memory.objects.size;
		expect(
			(await upload("/api/materials/files", { length: "100" })).status,
		).toBe(400);
		await settle();
		expect(memory.objects.size).toBe(before);
		expect(
			(await upload("/api/materials/files", { target: appNoStore })).status,
		).toBe(503);

		const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
		const res = await upload("/api/materials/files", {
			bytes,
			type: "audio/mpeg",
			name: "Bài nghe 1.mp3",
		});
		expect(res.status).toBe(201);
		const created = ((await res.json()) as { material: MaterialView }).material;
		expect(created).toMatchObject({
			kind: "media",
			title: "Bài nghe 1.mp3",
			originalName: "Bài nghe 1.mp3",
			mimeType: "audio/mpeg",
			sizeBytes: 10,
		});
		expect(memory.objects.has(`org-1/${created.id}`)).toBe(true);

		const full = await get(`/api/materials/${created.id}/file`);
		expect(full.status).toBe(200);
		expect(full.headers.get("Content-Type")).toBe("audio/mpeg");
		expect(full.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(full.headers.get("Content-Disposition")).toMatch(/^inline;/);
		expect(full.headers.get("Cross-Origin-Resource-Policy")).toBe("same-site");
		expect(new Uint8Array(await full.arrayBuffer())).toEqual(bytes);

		const partial = await get(
			`/api/materials/${created.id}/file`,
			"teacher-1",
			{
				Range: "bytes=2-4",
			},
		);
		expect(partial.status).toBe(206);
		expect(partial.headers.get("Content-Range")).toBe("bytes 2-4/10");
		expect(new Uint8Array(await partial.arrayBuffer())).toEqual(
			new Uint8Array([3, 4, 5]),
		);
		const unsatisfiable = await get(
			`/api/materials/${created.id}/file`,
			"teacher-1",
			{ Range: "bytes=50-60" },
		);
		expect(unsatisfiable.status).toBe(416);

		const download = await get(`/api/materials/${created.id}/file?download=1`);
		expect(download.headers.get("Content-Disposition")).toMatch(/^attachment;/);

		const pdf = await upload("/api/materials/files", { name: "Unit 2.pdf" });
		const pdfMaterial = ((await pdf.json()) as { material: MaterialView })
			.material;
		expect(pdfMaterial.kind).toBe("file");
		const pdfFile = await get(`/api/materials/${pdfMaterial.id}/file`);
		expect(pdfFile.headers.get("Content-Disposition")).toMatch(/^attachment;/);
	});

	test("org isolation: another org sees 404 on every id-addressed route", async () => {
		const link = await createLink("Org 1 only");
		const folderRes = await createFolder("Org 1 folder");
		const folder = ((await folderRes.json()) as { folder: MaterialFolderView })
			.folder;
		const file = (
			(await (
				await upload("/api/materials/files", { name: "secret.pdf" })
			).json()) as { material: MaterialView }
		).material;

		const other = "teacher-2";
		expect((await get(`/api/materials/${link.id}`, other)).status).toBe(404);
		expect((await get(`/api/materials/${file.id}/file`, other)).status).toBe(
			404,
		);
		expect(
			(await json(`/api/materials/${link.id}`, "PATCH", { title: "x" }, other))
				.status,
		).toBe(404);
		expect((await del(`/api/materials/${link.id}`, other)).status).toBe(404);
		expect(
			(
				await json(
					`/api/materials/folders/${folder.id}`,
					"PATCH",
					{ name: "x" },
					other,
				)
			).status,
		).toBe(404);
		expect(
			(await del(`/api/materials/folders/${folder.id}`, other)).status,
		).toBe(404);
		const list = (await (await get("/api/materials", other)).json()) as {
			items: MaterialView[];
		};
		expect(list.items).toEqual([]);
		const folders = (await (
			await get("/api/materials/folders", other)
		).json()) as {
			folders: MaterialFolderView[];
		};
		expect(folders.folders).toEqual([]);
		// Org 2 cannot attach org 1 materials or reach org 1 classes.
		expect((await get(sessionPath(), other)).status).toBe(404);
		expect(
			(await json(sessionPath(), "POST", { materialId: link.id }, other))
				.status,
		).toBe(404);
		// Org 1 cannot attach into an org 2 class.
		expect(
			(await json(sessionPath("class-x"), "POST", { materialId: link.id }))
				.status,
		).toBe(404);
	});

	test("session materials: attach, duplicate 409, list order, detach keeps the material", async () => {
		const first = await createLink("Warm-up video");
		const second = await createLink("Homework sheet");

		expect(
			(
				await json(sessionPath("class-1", "2026-11-11"), "POST", {
					materialId: first.id,
				})
			).status,
		).toBe(404);
		expect(
			(
				await json(sessionPath("class-1", "2026-13-01"), "POST", {
					materialId: first.id,
				})
			).status,
		).toBe(400);
		expect(
			(await json(sessionPath(), "POST", { materialId: "missing" })).status,
		).toBe(404);

		const attach = await json(sessionPath(), "POST", { materialId: first.id });
		expect(attach.status).toBe(201);
		const item = ((await attach.json()) as { item: LessonMaterialView }).item;
		expect(item).toMatchObject({ id: first.id, position: 0, usageCount: 1 });
		const dup = await json(sessionPath(), "POST", { materialId: first.id });
		expect(dup.status).toBe(409);
		expect(((await dup.json()) as { code: string }).code).toBe(
			"ALREADY_ATTACHED",
		);
		expect(
			(await json(sessionPath(), "POST", { materialId: second.id })).status,
		).toBe(201);

		const list = (await (await get(sessionPath())).json()) as {
			items: LessonMaterialView[];
		};
		const mine = list.items.filter((i) => [first.id, second.id].includes(i.id));
		expect(mine.map((i) => i.id)).toEqual([first.id, second.id]);
		expect(mine[1]?.position).toBeGreaterThan(mine[0]?.position ?? 0);

		expect((await del(`${sessionPath()}/${first.id}`)).status).toBe(200);
		expect((await del(`${sessionPath()}/${first.id}`)).status).toBe(404);
		expect((await get(`/api/materials/${first.id}`)).status).toBe(200);
		expect((await del(`/api/materials/${first.id}`)).status).toBe(200);
	});

	test("delete is blocked with 409 and session count while the material is in use", async () => {
		const file = (
			(await (
				await upload("/api/materials/files", { name: "used.pdf" })
			).json()) as { material: MaterialView }
		).material;
		await json(sessionPath(), "POST", { materialId: file.id });
		await json(sessionPath("class-1", OTHER_DATE), "POST", {
			materialId: file.id,
		});
		const blocked = await del(`/api/materials/${file.id}`);
		expect(blocked.status).toBe(409);
		expect(await blocked.json()).toMatchObject({
			code: "MATERIAL_IN_USE",
			sessionCount: 2,
		});
		expect(memory.objects.has(`org-1/${file.id}`)).toBe(true);

		await del(`${sessionPath()}/${file.id}`);
		await del(`${sessionPath("class-1", OTHER_DATE)}/${file.id}`);
		const removed = await del(`/api/materials/${file.id}`);
		expect(removed.status).toBe(200);
		expect(memory.objects.has(`org-1/${file.id}`)).toBe(false);
		expect((await get(`/api/materials/${file.id}`)).status).toBe(404);
	});

	test("delete keeps the DB consistent when the object delete fails", async () => {
		const file = (
			(await (
				await upload("/api/materials/files", { name: "orphan.pdf" })
			).json()) as { material: MaterialView }
		).material;
		memory.failures.delete = true;
		const res = await del(`/api/materials/${file.id}`);
		expect(res.status).toBe(200);
		expect((await get(`/api/materials/${file.id}`)).status).toBe(404);
	});

	test("upload into a session creates the bank material and the link together", async () => {
		const folderRes = await createFolder("Session uploads");
		const folder = ((await folderRes.json()) as { folder: MaterialFolderView })
			.folder;
		const res = await upload(`${sessionPath()}/files?folderId=${folder.id}`, {
			name: "Slides.pptx",
			type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
		});
		expect(res.status).toBe(201);
		const item = ((await res.json()) as { item: LessonMaterialView }).item;
		expect(item).toMatchObject({
			kind: "file",
			folderId: folder.id,
			title: "Slides.pptx",
			usageCount: 1,
		});
		const bank = (await (
			await get(`/api/materials?folderId=${folder.id}`)
		).json()) as { items: MaterialView[] };
		expect(bank.items.map((i) => i.id)).toEqual([item.id]);
		const [link] = await db
			.select()
			.from(schema.lessonMaterial)
			.where(
				and(
					eq(schema.lessonMaterial.materialId, item.id),
					eq(schema.lessonMaterial.date, SESSION_DATE),
				),
			);
		expect(link?.classId).toBe("class-1");

		// Unknown session: nothing is written to the store.
		const before = memory.objects.size;
		expect(
			(await upload(`${sessionPath("class-1", "2026-11-11")}/files`)).status,
		).toBe(404);
		expect(memory.objects.size).toBe(before);
		expect(
			(await upload(`${sessionPath()}/files`, { type: "text/plain" })).status,
		).toBe(415);
	});

	test("students: enrolled student reads materials of the session; others are blocked", async () => {
		const link = await createLink("Student link");
		const file = (
			(await (
				await upload("/api/materials/files", {
					name: "Worksheet.pdf",
					bytes: new Uint8Array([9, 8, 7]),
				})
			).json()) as { material: MaterialView }
		).material;
		const unattached = await createLink("Not in session");
		await json(sessionPath(), "POST", { materialId: link.id });
		await json(sessionPath(), "POST", { materialId: file.id });

		const studentPath = `/api/student/classes/class-1/sessions/${SESSION_DATE}/materials`;
		const res = await get(studentPath, "student-1");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { items: StudentLessonMaterialView[] };
		const ids = body.items.map((i) => i.id);
		expect(ids).toEqual(expect.arrayContaining([link.id, file.id]));
		expect(ids).not.toContain(unattached.id);
		for (const item of body.items) {
			expect(Object.keys(item).sort()).toEqual(
				[
					"description",
					"id",
					"kind",
					"mimeType",
					"originalName",
					"position",
					"sizeBytes",
					"title",
					"url",
				].sort(),
			);
		}
		const raw = JSON.stringify(body);
		expect(raw).not.toContain("org-1/");
		expect(raw).not.toContain("t-1");

		const download = await get(`${studentPath}/${file.id}/file`, "student-1");
		expect(download.status).toBe(200);
		expect(download.headers.get("Cross-Origin-Resource-Policy")).toBe(
			"same-site",
		);
		expect(new Uint8Array(await download.arrayBuffer())).toEqual(
			new Uint8Array([9, 8, 7]),
		);
		// Material not attached to this session, or a link: 404.
		expect(
			(await get(`${studentPath}/${unattached.id}/file`, "student-1")).status,
		).toBe(404);
		expect(
			(await get(`${studentPath}/${link.id}/file`, "student-1")).status,
		).toBe(404);
		// Date with no lesson of this student's enrollment.
		expect(
			(
				await get(
					"/api/student/classes/class-1/sessions/2026-11-11/materials",
					"student-1",
				)
			).status,
		).toBe(404);

		// A student of another class gets 404 for both list and file.
		expect((await get(studentPath, "student-2")).status).toBe(404);
		expect(
			(await get(`${studentPath}/${file.id}/file`, "student-2")).status,
		).toBe(404);
		// A teacher session cannot use the student portal route.
		expect((await get(studentPath, "teacher-1")).status).toBe(403);
	});

	test("moving a session date carries its materials along", async () => {
		const link = await createLink("Moves with session");
		await json(sessionPath("class-2"), "POST", { materialId: link.id });
		const move = await json(
			`/api/classes/class-2/sessions/${SESSION_DATE}/edit`,
			"POST",
			{ moveDate: "2026-11-17" },
		);
		expect(move.status).toBe(200);
		const moved = (await (
			await get(sessionPath("class-2", "2026-11-17"))
		).json()) as { items: LessonMaterialView[] };
		expect(moved.items.map((i) => i.id)).toEqual([link.id]);
		expect((await get(sessionPath("class-2"))).status).toBe(404);
	});

	test("search matches Vietnamese text regardless of case", async () => {
		await createLink("Đề cương ôn tập");
		await createLink("BÀI TẬP ngữ pháp");
		const search = async (q: string) =>
			(
				(await (
					await get(`/api/materials?q=${encodeURIComponent(q)}`)
				).json()) as { items: MaterialView[] }
			).items.map((i) => i.title);
		expect(await search("đề")).toContain("Đề cương ôn tập");
		expect(await search("ĐỀ CƯƠNG")).toContain("Đề cương ôn tập");
		expect(await search("bài tập")).toContain("BÀI TẬP ngữ pháp");
		expect(await search("không-có-chuỗi-này")).toEqual([]);
	});

	test("a link left behind by a deleted session can still be detached, freeing the material", async () => {
		const link = await createLink("Orphaned link");
		const orphanDate = "2026-11-24";
		await db.insert(schema.lesson).values({
			orgId: "org-1",
			id: "l-orphan",
			classId: "class-1",
			enrollmentId: "enr-1",
			day: 2,
			time: "18:00",
			dur: 120,
			date: orphanDate,
		});
		await json(sessionPath("class-1", orphanDate), "POST", {
			materialId: link.id,
		});
		await db.delete(schema.lesson).where(eq(schema.lesson.id, "l-orphan"));

		expect((await get(sessionPath("class-1", orphanDate))).status).toBe(404);
		expect((await del(`/api/materials/${link.id}`)).status).toBe(409);

		const detach = await del(
			`${sessionPath("class-1", orphanDate)}/${link.id}`,
		);
		expect(detach.status).toBe(200);
		expect((await del(`/api/materials/${link.id}`)).status).toBe(200);
	});
});

/**
 * #655 — delete guard đếm cả hai bảng link, và GET materials của buổi trả
 * thêm `curriculumMaterials` suy từ giáo trình (buổi N ↔ bài N), dedupe với
 * direct. File test riêng có db riêng để không đụng state describe trên.
 */
describe("material delete guard + curriculumMaterials (#655)", () => {
	let app: ServerApp;
	let db: Db;

	const D1 = "2026-11-10";
	const D2 = "2026-11-12";

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		await client.execute("PRAGMA foreign_keys = ON");
		const libsql = drizzle(client, { schema });
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;

		await db.insert(schema.organization).values({ id: "org-1", name: "Academy" });
		await db.insert(schema.user).values({
			id: "t-1",
			name: "Cô Lan",
			email: "lan@test.local",
			role: "teacher",
		});
		await db.insert(schema.membership).values({
			id: "mem-1",
			orgId: "org-1",
			userId: "t-1",
			role: "teacher",
		});
		await db.insert(schema.student).values({
			id: "stu-1",
			orgId: "org-1",
			name: "Minh",
			phone: "0901111111",
		});
		await db.insert(schema.classTable).values({
			id: "class-1",
			orgId: "org-1",
			name: "IELTS",
			level: "6.5",
			type: "ielts",
			skills: '["reading"]',
			mode: "Online",
			schedule: '{"days":[2,4],"start":"18:00","end":"20:00"}',
			sessionsTotal: 2,
			sessionsDone: 0,
			status: "active",
			startDate: D1,
			notes: "",
		});
		await db.insert(schema.enrollment).values({
			id: "enr-1",
			orgId: "org-1",
			classId: "class-1",
			studentId: "stu-1",
			status: "active",
		});
		await db.insert(schema.lesson).values([
			{
				id: "l-1",
				orgId: "org-1",
				classId: "class-1",
				enrollmentId: "enr-1",
				day: 2,
				time: "18:00",
				dur: 120,
				date: D1,
			},
			{
				id: "l-2",
				orgId: "org-1",
				classId: "class-1",
				enrollmentId: "enr-1",
				day: 4,
				time: "18:00",
				dur: 120,
				date: D2,
			},
		]);

		// Giáo trình copy: buổi 1 → ls-1 (mat-1), buổi 2 → ls-2 (mat-2, mat-3).
		await db.insert(schema.syllabus).values({
			id: "copy-1",
			orgId: "org-1",
			name: "Giáo trình",
			level: "6.5",
			type: "ielts",
			skills: '["reading"]',
			description: "",
			totalLessons: 2,
			classId: "class-1",
		});
		await db.insert(schema.syllabusModule).values({
			id: "m-1",
			orgId: "org-1",
			syllabusId: "copy-1",
			title: "M1",
			position: 0,
		});
		await db.insert(schema.syllabusLesson).values([
			{
				id: "ls-1",
				orgId: "org-1",
				moduleId: "m-1",
				title: "Bài 1",
				objectives: "",
				materials: "",
				kind: "lesson",
				status: "upcoming",
				position: 0,
			},
			{
				id: "ls-2",
				orgId: "org-1",
				moduleId: "m-1",
				title: "Bài 2",
				objectives: "",
				materials: "",
				kind: "lesson",
				status: "upcoming",
				position: 1,
			},
		]);
		await db.insert(schema.material).values([
			{ id: "mat-1", orgId: "org-1", title: "Đề buổi 1", kind: "link", url: "https://a.example/1", createdBy: "t-1" },
			{ id: "mat-2", orgId: "org-1", title: "Đề buổi 2", kind: "link", url: "https://a.example/2", createdBy: "t-1" },
			{ id: "mat-3", orgId: "org-1", title: "Đề buổi 2 thêm", kind: "link", url: "https://a.example/3", createdBy: "t-1" },
			{ id: "mat-direct", orgId: "org-1", title: "Tài liệu direct", kind: "link", url: "https://a.example/d", createdBy: "t-1" },
			{ id: "mat-free", orgId: "org-1", title: "Tài liệu rảnh", kind: "link", url: "https://a.example/f", createdBy: "t-1" },
		]);
		await db.insert(schema.syllabusLessonMaterial).values([
			{ orgId: "org-1", syllabusLessonId: "ls-1", materialId: "mat-1", position: 0 },
			{ orgId: "org-1", syllabusLessonId: "ls-2", materialId: "mat-2", position: 0 },
			{ orgId: "org-1", syllabusLessonId: "ls-2", materialId: "mat-3", position: 1 },
		]);

		app = buildApp({
			getDb: () => db,
			authHandler: () => new Response(null, { status: 404 }),
			corsOrigin: TEACHER_ORIGIN,
			getSessionUser: sessionFor,
		});
	});

	function headers(): Record<string, string> {
		return {
			"x-test-user": "teacher-1",
			Origin: TEACHER_ORIGIN,
			"Content-Type": "application/json",
		};
	}

	function json(path: string, method: string, body?: unknown) {
		return app.request(path, {
			method,
			headers: headers(),
			body: body === undefined ? undefined : JSON.stringify(body),
		});
	}

	test("delete guard 409 nêu cả hai số khi tài liệu dùng trên giáo trình", async () => {
		const res = await json("/api/materials/mat-1", "DELETE");
		expect(res.status).toBe(409);
		const body = (await res.json()) as {
			error: string;
			code: string;
			sessionCount: number;
			syllabusCount: number;
		};
		expect(body.error).toBe("MATERIAL_IN_USE");
		expect(body.sessionCount).toBe(0);
		expect(body.syllabusCount).toBe(1);
	});

	test("delete guard giữ payload cũ khi tài liệu chỉ dùng trên buổi học", async () => {
		const attach = await json(
			`/api/classes/class-1/sessions/${D1}/materials`,
			"POST",
			{ materialId: "mat-direct" },
		);
		expect(attach.status).toBe(201);

		const res = await json("/api/materials/mat-direct", "DELETE");
		expect(res.status).toBe(409);
		const body = (await res.json()) as {
			sessionCount: number;
			syllabusCount: number;
		};
		expect(body.sessionCount).toBe(1);
		expect(body.syllabusCount).toBe(0);
	});

	test("tài liệu không dùng vẫn xoá được", async () => {
		const res = await json("/api/materials/mat-free", "DELETE");
		expect(res.status).toBe(200);
	});

	test("GET materials buổi học có curriculumMaterials (buổi N ↔ bài N)", async () => {
		const d1 = (await (
			await json(`/api/classes/class-1/sessions/${D1}/materials`, "GET")
		).json()) as {
			items: LessonMaterialView[];
			curriculumMaterials: StudentLessonMaterialView[];
		};
		expect(d1.items).toHaveLength(1); // mat-direct gắn ở test trước
		expect(d1.curriculumMaterials.map((m) => m.id)).toEqual(["mat-1"]);

		const d2 = (await (
			await json(`/api/classes/class-1/sessions/${D2}/materials`, "GET")
		).json()) as {
			items: LessonMaterialView[];
			curriculumMaterials: StudentLessonMaterialView[];
		};
		expect(d2.items).toHaveLength(0);
		expect(d2.curriculumMaterials.map((m) => m.id)).toEqual(["mat-2", "mat-3"]);
		expect(d2.curriculumMaterials.every((m) => !("usageCount" in m))).toBe(
			true,
		);
	});

	test("dedupe: tài liệu direct trùng với curriculumMaterials bị loại khỏi phần suy", async () => {
		const attach = await json(
			`/api/classes/class-1/sessions/${D2}/materials`,
			"POST",
			{ materialId: "mat-2" },
		);
		expect(attach.status).toBe(201);
		const body = (await (
			await json(`/api/classes/class-1/sessions/${D2}/materials`, "GET")
		).json()) as {
			items: LessonMaterialView[];
			curriculumMaterials: StudentLessonMaterialView[];
		};
		expect(body.items.map((i) => i.id)).toContain("mat-2");
		// direct ưu tiên: mat-2 chỉ xuất hiện ở items, curriculum chỉ còn mat-3.
		expect(body.curriculumMaterials.map((m) => m.id)).toEqual(["mat-3"]);
	});
});
