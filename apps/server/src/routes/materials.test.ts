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
	"ct-1": {
		userId: "ct-1",
		userName: "GV phụ trách lớp",
		email: "ct@test.local",
		emailVerified: true,
		role: "teacher",
	},
	"susp-1": {
		userId: "susp-1",
		userName: "Tạm ngưng",
		email: "susp@test.local",
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
			{
				id: "ct-1",
				name: "GV phụ trách lớp",
				email: "ct@test.local",
				role: "teacher",
			},
			{
				id: "susp-1",
				name: "Tạm ngưng",
				email: "susp@test.local",
				role: "teacher",
			},
			{ id: "t-2", name: "Thầy Nam", email: "nam@test.local", role: "teacher" },
		]);
		await db.insert(schema.membership).values([
			{ id: "mem-1", orgId: "org-1", userId: "t-1", role: "teacher" },
			{ id: "mem-ta", orgId: "org-1", userId: "ta-1", role: "ta" },
			{ id: "mem-ct", orgId: "org-1", userId: "ct-1", role: "class_teacher" },
			{
				id: "mem-susp",
				orgId: "org-1",
				userId: "susp-1",
				role: "suspended",
			},
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

		// Unknown/revoked membership role hits materialRoutes gate directly (403 FORBIDDEN, not STUDENT_ON_TEACHER_APP).
		const suspList = await get("/api/materials", "susp-1");
		expect(suspList.status).toBe(403);
		const suspBody: { code?: string } = await suspList.json();
		expect(suspBody.code).toBe("FORBIDDEN");
		expect((await get(sessionPath(), "susp-1")).status).toBe(403);

		// class_teacher can write folders and materials; ta gets 403 FORBIDDEN across all remaining write endpoints.
		const ctFolderRes = await createFolder("CT Folder", null, "ct-1");
		expect(ctFolderRes.status).toBe(201);
		const ctFolderBody: { folder: MaterialFolderView } =
			await ctFolderRes.json();
		const ctFolder = ctFolderBody.folder;
		const ctMat = await createLink("CT Material", ctFolder.id);
		const attachRes = await json(
			sessionPath(),
			"POST",
			{ materialId: ctMat.id },
			"ct-1",
		);
		expect(attachRes.status).toBe(201);

		expect(
			(
				await json(
					`/api/materials/folders/${ctFolder.id}`,
					"PATCH",
					{ name: "Nope" },
					"ta-1",
				)
			).status,
		).toBe(403);
		expect(
			(await del(`/api/materials/folders/${ctFolder.id}`, "ta-1")).status,
		).toBe(403);
		expect(
			(
				await json(
					`/api/materials/${ctMat.id}`,
					"PATCH",
					{ title: "Nope" },
					"ta-1",
				)
			).status,
		).toBe(403);
		expect((await del(`/api/materials/${ctMat.id}`, "ta-1")).status).toBe(403);
		expect(
			(await json(sessionPath(), "POST", { materialId: ctMat.id }, "ta-1"))
				.status,
		).toBe(403);
		expect(
			(await upload(`${sessionPath()}/files`, { user: "ta-1" })).status,
		).toBe(403);
		expect((await del(`${sessionPath()}/${ctMat.id}`, "ta-1")).status).toBe(
			403,
		);

		// Cross-org parentId injection is rejected on both POST and PATCH.
		expect(
			(await createFolder("Cross-org child", ctFolder.id, "teacher-2")).status,
		).toBe(404);
		const org2RootRes = await createFolder("Org2 Root", null, "teacher-2");
		const org2RootBody: { folder: MaterialFolderView } =
			await org2RootRes.json();
		expect(
			(
				await json(
					`/api/materials/folders/${org2RootBody.folder.id}`,
					"PATCH",
					{ parentId: ctFolder.id },
					"teacher-2",
				)
			).status,
		).toBe(404);

		// Clean up seeded test rows so later tests start with clean bank state.
		expect((await del(`${sessionPath()}/${ctMat.id}`, "ct-1")).status).toBe(
			200,
		);
		expect((await del(`/api/materials/${ctMat.id}`, "ct-1")).status).toBe(200);
		expect(
			(await del(`/api/materials/folders/${ctFolder.id}`, "ct-1")).status,
		).toBe(200);
		expect(
			(
				await del(
					`/api/materials/folders/${org2RootBody.folder.id}`,
					"teacher-2",
				)
			).status,
		).toBe(200);
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

	test("concurrent folder moves, renames, and creates enforce cycle, depth, and partial-update invariants atomically (#646)", async () => {
		const makeFolder = async (name: string, parentId: string | null = null) => {
			const res = await createFolder(name, parentId);
			expect(res.status).toBe(201);
			const body: { folder: MaterialFolderView } = await res.json();
			return body.folder;
		};

		// 1. Concurrent cross-move A -> B and B -> A: exactly one 200 and one 400 FOLDER_CYCLE.
		const raceA = await makeFolder("Race A");
		const raceB = await makeFolder("Race B");
		const [mAB, mBA] = await Promise.all([
			json(`/api/materials/folders/${raceA.id}`, "PATCH", {
				parentId: raceB.id,
			}),
			json(`/api/materials/folders/${raceB.id}`, "PATCH", {
				parentId: raceA.id,
			}),
		]);
		expect([mAB.status, mBA.status].sort()).toEqual([200, 400]);
		const cycleLoser = mAB.status === 400 ? mAB : mBA;
		const cycleBody: { code?: string } = await cycleLoser.json();
		expect(cycleBody.code).toBe("FOLDER_CYCLE");
		const listAfterRace: { folders: MaterialFolderView[] } = await (
			await get("/api/materials/folders")
		).json();
		const rowA = listAfterRace.folders.find((f) => f.id === raceA.id);
		const rowB = listAfterRace.folders.find((f) => f.id === raceB.id);
		expect(
			(rowA?.parentId === null && rowB?.parentId === raceA.id) ||
				(rowB?.parentId === null && rowA?.parentId === raceB.id),
		).toBe(true);

		// 2a. Concurrent pure rename + pure move on the same folder preserves BOTH updates.
		const parentP = await makeFolder("Parent P");
		const child = await makeFolder("Child Orig", parentP.id);
		const [renRes, movRes] = await Promise.all([
			json(`/api/materials/folders/${child.id}`, "PATCH", {
				name: "Child Renamed",
			}),
			json(`/api/materials/folders/${child.id}`, "PATCH", { parentId: null }),
		]);
		expect([renRes.status, movRes.status]).toEqual([200, 200]);
		const listAfterPartial: { folders: MaterialFolderView[] } = await (
			await get("/api/materials/folders")
		).json();
		const updatedChild = listAfterPartial.folders.find(
			(f) => f.id === child.id,
		);
		expect(updatedChild?.name).toBe("Child Renamed");
		expect(updatedChild?.parentId).toBeNull();

		// 2b. Concurrent moves of same-named folders into the same parent return [200, 409 FOLDER_NAME_TAKEN], never 500.
		const src1 = await makeFolder("Clash Src 1");
		const src2 = await makeFolder("Clash Src 2");
		const dest = await makeFolder("Clash Dest");
		const clash1 = await makeFolder("Same Name", src1.id);
		const clash2 = await makeFolder("Same Name", src2.id);
		const [c1Res, c2Res] = await Promise.all([
			json(`/api/materials/folders/${clash1.id}`, "PATCH", {
				parentId: dest.id,
			}),
			json(`/api/materials/folders/${clash2.id}`, "PATCH", {
				parentId: dest.id,
			}),
		]);
		expect([c1Res.status, c2Res.status].sort()).toEqual([200, 409]);
		const clashLoser = c1Res.status === 409 ? c1Res : c2Res;
		const clashBody: { code?: string } = await clashLoser.json();
		expect(clashBody.code).toBe("FOLDER_NAME_TAKEN");

		// 3a. Concurrent PATCH depth-cap race (4 + 5 individually valid, combined = 6 > 5).
		const r0 = await makeFolder("DepthRace R0");
		const l1 = await makeFolder("DepthRace L1");
		const l2 = await makeFolder("DepthRace L2", l1.id);
		await makeFolder("DepthRace L3", l2.id);
		const s1 = await makeFolder("DepthRace S1");
		const s2 = await makeFolder("DepthRace S2", s1.id);
		await makeFolder("DepthRace S3", s2.id);
		const [dMove1, dMove2] = await Promise.all([
			json(`/api/materials/folders/${l1.id}`, "PATCH", { parentId: r0.id }),
			json(`/api/materials/folders/${s1.id}`, "PATCH", { parentId: l2.id }),
		]);
		expect([dMove1.status, dMove2.status].sort()).toEqual([200, 400]);
		const depthLoser = dMove1.status === 400 ? dMove1 : dMove2;
		const depthLoserBody: { code?: string } = await depthLoser.json();
		expect(depthLoserBody.code).toBe("FOLDER_TOO_DEEP");

		// 3b. Concurrent PATCH + POST depth-cap race (combined = 6 > 5).
		const d0 = await makeFolder("PostRace D0");
		const d1 = await makeFolder("PostRace D1");
		const d2 = await makeFolder("PostRace D2", d1.id);
		const d3 = await makeFolder("PostRace D3", d2.id);
		const d4 = await makeFolder("PostRace D4", d3.id);
		const [pMove, pCreate] = await Promise.all([
			json(`/api/materials/folders/${d1.id}`, "PATCH", { parentId: d0.id }),
			createFolder("PostRace D5", d4.id),
		]);
		const pStatuses = [pMove.status, pCreate.status];
		expect(pStatuses.includes(400)).toBe(true);
		expect(pStatuses.some((s) => s === 200 || s === 201)).toBe(true);
		const postRaceLoser = pMove.status === 400 ? pMove : pCreate;
		const postRaceBody: { code?: string } = await postRaceLoser.json();
		expect(postRaceBody.code).toBe("FOLDER_TOO_DEEP");
		const listAfterDepthRaces: { folders: MaterialFolderView[] } = await (
			await get("/api/materials/folders")
		).json();
		const byIdAfterDepth = new Map(
			listAfterDepthRaces.folders.map((f) => [f.id, f]),
		);
		for (const folder of listAfterDepthRaces.folders) {
			let depth = 0;
			let cur: string | null = folder.id;
			while (cur !== null) {
				depth += 1;
				cur = byIdAfterDepth.get(cur)?.parentId ?? null;
			}
			expect(depth).toBeLessThanOrEqual(5);
		}

		// 4. Legacy cyclic rows: POST child / re-confirming cycle -> 400 FOLDER_CYCLE; moving under valid root breaks cycle -> 200.
		const validRoot = await makeFolder("Recovery Root");
		await db.insert(schema.materialFolder).values([
			{ id: "cyc-x", orgId: "org-1", parentId: null, name: "Cycle X" },
			{ id: "cyc-y", orgId: "org-1", parentId: "cyc-x", name: "Cycle Y" },
		]);
		await db
			.update(schema.materialFolder)
			.set({ parentId: "cyc-y" })
			.where(eq(schema.materialFolder.id, "cyc-x"));

		const postOnCycle = await createFolder("Under Cycle", "cyc-x");
		expect(postOnCycle.status).toBe(400);
		const postOnCycleBody: { code?: string } = await postOnCycle.json();
		expect(postOnCycleBody.code).toBe("FOLDER_CYCLE");

		const reconfirmCycle = await json("/api/materials/folders/cyc-x", "PATCH", {
			parentId: "cyc-y",
		});
		expect(reconfirmCycle.status).toBe(400);
		const reconfirmBody: { code?: string } = await reconfirmCycle.json();
		expect(reconfirmBody.code).toBe("FOLDER_CYCLE");

		const breakCycle = await json("/api/materials/folders/cyc-x", "PATCH", {
			parentId: validRoot.id,
		});
		expect(breakCycle.status).toBe(200);
		const listAfterRecovery: { folders: MaterialFolderView[] } = await (
			await get("/api/materials/folders")
		).json();
		expect(
			listAfterRecovery.folders.find((f) => f.id === "cyc-x")?.parentId,
		).toBe(validRoot.id);
		expect(
			listAfterRecovery.folders.find((f) => f.id === "cyc-y")?.parentId,
		).toBe("cyc-x");
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
		expect(full.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
		expect(full.headers.get("Referrer-Policy")).toBe("no-referrer");
		expect(full.headers.get("Content-Security-Policy")).toContain(
			"media-src 'self'",
		);
		expect(full.headers.get("Content-Security-Policy")).toContain(
			"sandbox allow-same-origin",
		);
		expect(full.headers.get("Content-Security-Policy")).not.toContain(
			"allow-scripts",
		);
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
		expect(partial.headers.get("Content-Disposition")).toMatch(/^inline;/);
		expect(partial.headers.get("Content-Security-Policy")).toContain(
			"media-src 'self'",
		);
		expect(partial.headers.get("Content-Security-Policy")).not.toContain(
			"allow-scripts",
		);
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
		expect(download.headers.get("Content-Security-Policy")).toBe(
			"default-src 'none'; frame-ancestors 'none'; sandbox",
		);

		const pdf = await upload("/api/materials/files", { name: "Unit 2.pdf" });
		const pdfMaterial = ((await pdf.json()) as { material: MaterialView })
			.material;
		expect(pdfMaterial.kind).toBe("file");
		const pdfFile = await get(`/api/materials/${pdfMaterial.id}/file`);
		expect(pdfFile.headers.get("Content-Disposition")).toMatch(/^attachment;/);
		expect(pdfFile.headers.get("Content-Security-Policy")).toBe(
			"default-src 'none'; frame-ancestors 'none'; sandbox",
		);
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
		expect(download.headers.get("Cross-Origin-Opener-Policy")).toBe(
			"same-origin",
		);
		expect(download.headers.get("Referrer-Policy")).toBe("no-referrer");
		expect(download.headers.get("Content-Security-Policy")).toBe(
			"default-src 'none'; frame-ancestors 'none'; sandbox",
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

	test("students: đọc buổi có cả direct + tài liệu từ giáo trình, trùng id chỉ 1 lần (#655)", async () => {
		// Lớp riêng có giáo trình copy — tách khỏi class-1/class-2 của các
		// test khác để không làm lệch mapping buổi N ↔ bài N của chúng.
		await db.insert(schema.classTable).values({
			id: "class-cur",
			orgId: "org-1",
			name: "IELTS GT",
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
		});
		await db.insert(schema.enrollment).values({
			id: "enr-cur",
			orgId: "org-1",
			classId: "class-cur",
			studentId: "stu-1",
			status: "active",
		});
		// Hai buổi dạy: buổi 1 (2026-11-03) trống, buổi 2 (SESSION_DATE)
		// ánh xạ bài 2 của giáo trình.
		const lessonBase = { orgId: "org-1", day: 2, time: "18:00", dur: 120 };
		await db.insert(schema.lesson).values([
			{
				...lessonBase,
				id: "l-cur-1",
				classId: "class-cur",
				enrollmentId: "enr-cur",
				date: "2026-11-03",
			},
			{
				...lessonBase,
				id: "l-cur-2",
				classId: "class-cur",
				enrollmentId: "enr-cur",
				date: SESSION_DATE,
			},
		]);
		// Copy giáo trình của class-cur: 1 module, 2 bài — buổi N ↔ bài N.
		await db.insert(schema.syllabus).values({
			id: "cur-copy",
			orgId: "org-1",
			name: "Giáo trình GT",
			level: "6.5",
			type: "ielts",
			skills: '["reading"]',
			description: "",
			totalLessons: 2,
			classId: "class-cur",
		});
		await db.insert(schema.syllabusModule).values({
			id: "cur-m1",
			orgId: "org-1",
			syllabusId: "cur-copy",
			title: "M1",
			position: 0,
		});
		await db.insert(schema.syllabusLesson).values([
			{
				id: "cur-ls1",
				orgId: "org-1",
				moduleId: "cur-m1",
				title: "Bài 1",
				position: 0,
			},
			{
				id: "cur-ls2",
				orgId: "org-1",
				moduleId: "cur-m1",
				title: "Bài 2",
				position: 1,
			},
		]);
		// Ngân hàng: 1 file (thử tải file tài liệu giáo trình) + 2 link, một
		// link cũng được gắn direct để kiểm dedupe (direct ưu tiên).
		// Cast có tên: JSON từ test server tự quan sát qua assertions dưới.
		const uploadBody = (await (
			await upload("/api/materials/files", {
				name: "GT Worksheet.pdf",
				bytes: new Uint8Array([5, 6]),
			})
		).json()) as { material: MaterialView };
		const bankFile = uploadBody.material;
		const bankLink = await createLink("GT link");
		const dup = await createLink("Trùng direct");
		await db.insert(schema.syllabusLessonMaterial).values([
			{
				orgId: "org-1",
				syllabusLessonId: "cur-ls2",
				materialId: bankFile.id,
				position: 0,
			},
			{
				orgId: "org-1",
				syllabusLessonId: "cur-ls2",
				materialId: bankLink.id,
				position: 1,
			},
			{
				orgId: "org-1",
				syllabusLessonId: "cur-ls2",
				materialId: dup.id,
				position: 2,
			},
		]);
		// Direct của buổi SESSION_DATE.
		const directLink = await createLink("Direct link");
		const curSessionPath = `/api/classes/class-cur/sessions/${SESSION_DATE}/materials`;
		await json(curSessionPath, "POST", { materialId: dup.id });
		await json(curSessionPath, "POST", { materialId: directLink.id });

		const curPath = `/api/student/classes/class-cur/sessions/${SESSION_DATE}/materials`;
		const res = await get(curPath, "student-1");
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			items: StudentLessonMaterialView[];
			curriculumMaterials: StudentLessonMaterialView[];
		};
		// Direct trước theo position.
		expect(body.items.map((i) => i.id)).toEqual([dup.id, directLink.id]);
		// Curriculum sau theo link position, đã dedupe (dup chỉ nằm ở direct).
		expect(body.curriculumMaterials.map((i) => i.id)).toEqual([
			bankFile.id,
			bankLink.id,
		]);
		// Hợp danh sách: mỗi materialId đúng 1 lần.
		const allIds = [...body.items, ...body.curriculumMaterials].map(
			(i) => i.id,
		);
		expect(new Set(allIds).size).toBe(allIds.length);

		// Projection nghiêm StudentLessonMaterialView — không lộ teacher-only.
		const raw = JSON.stringify(body);
		expect(raw).not.toContain("objectKey");
		expect(raw).not.toContain("createdBy");
		expect(raw).not.toContain("org-1/");
		expect(raw).not.toContain("t-1");

		// File tài liệu giáo trình tải được qua endpoint file của buổi.
		const download = await get(`${curPath}/${bankFile.id}/file`, "student-1");
		expect(download.status).toBe(200);
		expect(new Uint8Array(await download.arrayBuffer())).toEqual(
			new Uint8Array([5, 6]),
		);
		// Link giáo trình không có file (như link direct).
		expect(
			(await get(`${curPath}/${bankLink.id}/file`, "student-1")).status,
		).toBe(404);
		// Tài liệu ngân hàng thuộc BÀI KHÁC (không ánh xạ buổi này) vẫn 404.
		const otherLessonBank = await createLink("Thuộc bài 1");
		await db.insert(schema.syllabusLessonMaterial).values({
			orgId: "org-1",
			syllabusLessonId: "cur-ls1",
			materialId: otherLessonBank.id,
			position: 0,
		});
		expect(
			(await get(`${curPath}/${otherLessonBank.id}/file`, "student-1")).status,
		).toBe(404);

		// Buổi trống (không direct, bài ánh xạ không có links mới) → rỗng.
		const emptyRes = await get(
			"/api/student/classes/class-cur/sessions/2026-11-03/materials",
			"student-1",
		);
		expect(emptyRes.status).toBe(200);
		const emptyBody = (await emptyRes.json()) as {
			items: StudentLessonMaterialView[];
			curriculumMaterials: StudentLessonMaterialView[];
		};
		expect(emptyBody.items).toEqual([]);
		// Bài 1 có otherLessonBank nhưng buổi 2026-11-03 ánh xạ bài 1 → có
		// đúng tài liệu của bài 1, không xuyên sang bài 2.
		expect(emptyBody.curriculumMaterials.map((i) => i.id)).toEqual([
			otherLessonBank.id,
		]);

		// Học viên lớp khác vẫn bị chặn cả list lẫn file.
		expect((await get(curPath, "student-2")).status).toBe(404);
		expect(
			(await get(`${curPath}/${bankFile.id}/file`, "student-2")).status,
		).toBe(404);
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

	describe("#645: chặn attach/upload/detach vào buổi holiday", () => {
		const HOLIDAY_DATE = "2026-11-17";
		const MIXED_DATE = "2026-11-19";

		// Buổi holiday có dòng lesson; ngày trộn 1 dòng holiday + 1 dòng
		// non-holiday (semantics bucket khớp web `allHoliday`).
		const lessonBase = { orgId: "org-1", day: 3, time: "18:00", dur: 120 };
		const ensureHolidayLessons = async () => {
			await db
				.insert(schema.lesson)
				.values([
					{
						...lessonBase,
						id: "l-hol",
						classId: "class-1",
						enrollmentId: "enr-1",
						date: HOLIDAY_DATE,
						status: "holiday",
					},
					{
						...lessonBase,
						id: "l-mixed-hol",
						classId: "class-1",
						enrollmentId: "enr-1",
						date: MIXED_DATE,
						status: "holiday",
					},
					{
						...lessonBase,
						id: "l-mixed-up",
						classId: "class-1",
						enrollmentId: "enr-1",
						date: MIXED_DATE,
						status: "upcoming",
					},
				])
				.onConflictDoNothing();
		};

		const seedBankMaterial = async (id: string) => {
			await db
				.insert(schema.material)
				.values({
					id,
					orgId: "org-1",
					kind: "link",
					url: `https://example.com/${id}`,
					title: id,
					createdBy: "t-1",
				})
				.onConflictDoNothing();
		};

		test("POST attach vào buổi holiday trả 409 SESSION_HOLIDAY", async () => {
			await ensureHolidayLessons();
			await seedBankMaterial("mat-hol");
			const res = await json(sessionPath("class-1", HOLIDAY_DATE), "POST", {
				materialId: "mat-hol",
			});
			expect(res.status).toBe(409);
			expect(((await res.json()) as { code: string }).code).toBe(
				"SESSION_HOLIDAY",
			);
		});

		test("PUT upload file vào buổi holiday trả 409 SESSION_HOLIDAY", async () => {
			await ensureHolidayLessons();
			const res = await upload(`${sessionPath("class-1", HOLIDAY_DATE)}/files`);
			expect(res.status).toBe(409);
			expect(((await res.json()) as { code: string }).code).toBe(
				"SESSION_HOLIDAY",
			);
		});

		test("DELETE detach trên buổi holiday trả 409 SESSION_HOLIDAY", async () => {
			await ensureHolidayLessons();
			await seedBankMaterial("mat-hol");
			await db
				.insert(schema.lessonMaterial)
				.values({
					orgId: "org-1",
					classId: "class-1",
					date: HOLIDAY_DATE,
					materialId: "mat-hol",
				})
				.onConflictDoNothing();
			const res = await del(`${sessionPath("class-1", HOLIDAY_DATE)}/mat-hol`);
			expect(res.status).toBe(409);
			expect(((await res.json()) as { code: string }).code).toBe(
				"SESSION_HOLIDAY",
			);
		});

		test("GET list materials trên buổi holiday vẫn 200 (modal render được)", async () => {
			await ensureHolidayLessons();
			const res = await get(sessionPath("class-1", HOLIDAY_DATE));
			expect(res.status).toBe(200);
			const body = (await res.json()) as { items: unknown[] };
			expect(Array.isArray(body.items)).toBe(true);
		});

		test("ngày trộn holiday + non-holiday: attach vẫn 201 (bucket semantics khớp web)", async () => {
			await ensureHolidayLessons();
			await seedBankMaterial("mat-mixed");
			const res = await json(sessionPath("class-1", MIXED_DATE), "POST", {
				materialId: "mat-mixed",
			});
			expect(res.status).toBe(201);
		});

		test("ngày có lesson holiday + buổi manual class_session: attach qua manual vẫn 201 (#658)", async () => {
			// HOLIDAY_DATE có 1 dòng lesson holiday; thêm buổi manual
			// class_session cùng ngày (#658: buổi thật cho materials).
			await ensureHolidayLessons();
			await db
				.insert(schema.classSession)
				.values({
					id: "cs-hol-manual",
					orgId: "org-1",
					classId: "class-1",
					date: HOLIDAY_DATE,
					time: "18:00",
					dur: 120,
					topic: "Buổi bù manual",
					zoom: "",
				})
				.onConflictDoNothing();
			await seedBankMaterial("mat-manual");
			const res = await json(sessionPath("class-1", HOLIDAY_DATE), "POST", {
				materialId: "mat-manual",
			});
			expect(res.status).toBe(201);
		});
	});

	test("lớp manual 0 học viên: dời buổi kéo tài liệu theo (#658)", async () => {
		await db.insert(schema.classTable).values({
			orgId: "org-1",
			id: "class-manual-2",
			name: "Manual Move",
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
		});
		// Trạng thái kernel tạo cho lớp manual 0 học viên: chỉ có class_session.
		await db.insert(schema.classSession).values({
			id: "cs-manual-2",
			orgId: "org-1",
			classId: "class-manual-2",
			date: "2026-11-20",
			time: "18:00",
			dur: 120,
			topic: "Buổi dời",
			zoom: "",
		});
		const link = await createLink("Tài liệu buổi dời");
		const beforePath = sessionPath("class-manual-2", "2026-11-20");
		expect(
			(await json(beforePath, "POST", { materialId: link.id })).status,
		).toBe(201);

		// Link mồ côi sẵn ở ngày đích (materialId KHÁC nguồn — dạng #659):
		// move không được xoá tài liệu không liên quan (kongming checkpoint
		// review PR: double-submit/bucketMoved không được biến delete đích
		// thành xoá tài liệu vừa dời).
		const orphanAtDest = await createLink("Mồ côi tại đích");
		await db.insert(schema.lessonMaterial).values({
			orgId: "org-1",
			classId: "class-manual-2",
			date: "2026-11-21",
			materialId: orphanAtDest.id,
		});

		// Dời buổi manual qua route occurrence edit (pattern test "moving a
		// session date carries its materials along").
		const move = await json(
			"/api/classes/class-manual-2/sessions/2026-11-20/edit",
			"POST",
			{ moveDate: "2026-11-21" },
		);
		expect(move.status).toBe(200);

		const movedPath = sessionPath("class-manual-2", "2026-11-21");
		const moved = (await (await get(movedPath)).json()) as {
			items: LessonMaterialView[];
		};
		// Tài liệu nguồn dời sang đích; link mồ côi có sẵn ở đích giữ nguyên.
		expect(moved.items.map((i) => i.id).sort()).toEqual(
			[link.id, orphanAtDest.id].sort(),
		);
		expect((await get(beforePath)).status).toBe(404);
		// Dòng link KHÔNG còn ở ngày cũ — gỡ ở ngày cũ phải 404 (chứng minh
		// lesson_material đã dời theo buổi, không mồ côi lại chỗ cũ).
		expect((await del(`${beforePath}/${link.id}`)).status).toBe(404);
		// Gỡ khỏi buổi mới (đúng 409-in-use giờ đã gỡ được) rồi xoá ngân hàng:
		// không còn 409 sai.
		expect((await del(`${movedPath}/${link.id}`)).status).toBe(200);
		expect((await del(`/api/materials/${link.id}`)).status).toBe(200);
	});

	test("lớp manual 0 học viên: buổi chỉ có class_session — GET/attach/upload/detach không 404 (#658)", async () => {
		await db.insert(schema.classTable).values({
			orgId: "org-1",
			id: "class-manual",
			name: "Manual 0 HV",
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
		});
		// Trạng thái kernel tạo cho lớp manual 0 học viên (route add manual
		// session POST /classes/:id/sessions): luôn có class_session, lesson
		// chỉ sinh cho enrollment active.
		await db.insert(schema.classSession).values({
			id: "cs-manual",
			orgId: "org-1",
			classId: "class-manual",
			date: "2026-11-15",
			time: "18:00",
			dur: 120,
			topic: "Buổi manual",
			zoom: "",
		});

		// Negative control: ngày KHÔNG có lesson lẫn class_session vẫn 404 —
		// resolve không được nới lỏng thành "lớp thuộc org là buổi tồn tại".
		expect((await get(sessionPath("class-manual", "2026-11-16"))).status).toBe(
			404,
		);
		const emptyAttach = await json(
			sessionPath("class-manual", "2026-11-16"),
			"POST",
			{ materialId: "mat-any" },
		);
		expect(emptyAttach.status).toBe(404);
		expect(await emptyAttach.json()).toMatchObject({
			code: "SESSION_NOT_FOUND",
		});
		// PUT upload dùng chung resolver — negative control phủ đủ 3 route.
		const emptyUpload = await upload(
			`${sessionPath("class-manual", "2026-11-16")}/files`,
			{ name: "Empty.pdf" },
		);
		expect(emptyUpload.status).toBe(404);

		const link = await createLink("Tài liệu buổi manual");
		const basePath = sessionPath("class-manual", "2026-11-15");

		const listed = await get(basePath);
		expect(listed.status).toBe(200);
		const emptyList = (await listed.json()) as {
			items: LessonMaterialView[];
			curriculumMaterials: unknown[];
		};
		expect(emptyList.items).toEqual([]);
		// Không có dòng lesson nên phần suy #655 phải rỗng, không nổ.
		expect(emptyList.curriculumMaterials).toEqual([]);

		expect((await json(basePath, "POST", { materialId: link.id })).status).toBe(
			201,
		);
		const after = (await (await get(basePath)).json()) as {
			items: LessonMaterialView[];
		};
		expect(after.items.map((i) => i.id)).toEqual([link.id]);

		const uploaded = await upload(`${basePath}/files`, {
			name: "Manual.pdf",
		});
		expect(uploaded.status).toBe(201);

		// Bất biến #658: tài liệu gắn TRƯỚC khi có học viên phải hiện ra cho
		// học viên đầu tiên sau activation — mô phỏng output của activation
		// (enrollment active + lesson sinh từ class_session, cùng date).
		await db.insert(schema.enrollment).values({
			id: "enr-manual",
			orgId: "org-1",
			classId: "class-manual",
			studentId: "stu-1",
			status: "active",
		});
		await db.insert(schema.lesson).values({
			id: "l-manual",
			orgId: "org-1",
			classId: "class-manual",
			enrollmentId: "enr-manual",
			day: 2,
			time: "18:00",
			dur: 120,
			date: "2026-11-15",
		});
		const studentView = (await (
			await get(
				"/api/student/classes/class-manual/sessions/2026-11-15/materials",
				"student-1",
			)
		).json()) as { items: StudentLessonMaterialView[] };
		expect(studentView.items.map((i) => i.id)).toContain(link.id);

		expect((await del(`${basePath}/${link.id}`)).status).toBe(200);
		expect((await del(`${basePath}/${link.id}`)).status).toBe(404);
	});

	describe("#662: chặn attach vào ngày đã shift (path 2)", () => {
		const D = "2026-12-01"; // ngày gốc đã shift
		const DM = "2026-12-08"; // ngày bù

		/** Class manual độc lập theo 3 cờ tổ hợp: lesson holiday, class_session,
		 * shift row. Mỗi case dùng classId riêng để matrix không đụng nhau. */
		async function seedShiftedManualBucket(
			classId: string,
			opts: {
				holidayLesson: boolean;
				classSession: boolean;
				shiftRow: boolean;
			},
		) {
			await db.insert(schema.classTable).values({
				orgId: "org-1",
				id: classId,
				name: `Manual ${classId}`,
				level: "6.5",
				type: "ielts",
				skills: '["reading"]',
				mode: "Online",
				schedule: '{"days":[2],"start":"18:00","end":"20:00"}',
				sessionsTotal: 4,
				sessionsDone: 0,
				status: "active",
				startDate: "2026-11-01",
				notes: "",
			});
			await db.insert(schema.student).values({
				id: `stu-${classId}`,
				orgId: "org-1",
				name: `HV ${classId}`,
			});
			await db.insert(schema.enrollment).values({
				id: `enr-${classId}`,
				orgId: "org-1",
				classId,
				studentId: `stu-${classId}`,
				status: "active",
			});
			if (opts.holidayLesson) {
				await db.insert(schema.lesson).values({
					id: `l-hol-${classId}`,
					orgId: "org-1",
					classId,
					enrollmentId: `enr-${classId}`,
					day: 2,
					time: "18:00",
					dur: 120,
					date: D,
					status: "holiday",
				});
			}
			if (opts.classSession) {
				await db.insert(schema.classSession).values({
					id: `cs-${classId}`,
					orgId: "org-1",
					classId,
					date: D,
					time: "18:00",
					dur: 120,
					topic: "Buổi manual",
					zoom: "",
				});
			}
			if (opts.shiftRow) {
				await db.insert(schema.organizationHoliday).values({
					id: `hol-${classId}`,
					orgId: "org-1",
					name: `Nghỉ ${classId}`,
					fromDate: D,
					toDate: D,
					scope: "org",
					mode: "shift",
					notify: false,
					createdByUserId: "t-1",
				});
				await db.insert(schema.holidaySessionShift).values({
					id: `shift-${classId}`,
					orgId: "org-1",
					holidayId: `hol-${classId}`,
					classId,
					originalDate: D,
					makeupDate: DM,
				});
			}
		}

		async function seedBankLink662(id: string) {
			await db
				.insert(schema.material)
				.values({
					id,
					orgId: "org-1",
					kind: "link",
					url: `https://example.com/${id}`,
					title: id,
					createdBy: "t-1",
				})
				.onConflictDoNothing();
		}

		test("attach vào bucket all-holiday + class_session + shift row → 409 (T8)", async () => {
			await seedShiftedManualBucket("cls-662a", {
				holidayLesson: true,
				classSession: true,
				shiftRow: true,
			});
			await seedBankLink662("mat-662a");
			const res = await json(sessionPath("cls-662a", D), "POST", {
				materialId: "mat-662a",
			});
			expect(res.status).toBe(409);
			expect(((await res.json()) as { code: string }).code).toBe(
				"SESSION_HOLIDAY",
			);
		});

		test("upload vào bucket 3-điều-kiện → 409 (T9)", async () => {
			await seedShiftedManualBucket("cls-662b", {
				holidayLesson: true,
				classSession: true,
				shiftRow: true,
			});
			const res = await upload(`${sessionPath("cls-662b", D)}/files`);
			expect(res.status).toBe(409);
			expect(((await res.json()) as { code: string }).code).toBe(
				"SESSION_HOLIDAY",
			);
		});

		test("detach cùng trạng thái vẫn 200 — predicate không áp detach (T10)", async () => {
			await seedShiftedManualBucket("cls-662c", {
				holidayLesson: true,
				classSession: true,
				shiftRow: true,
			});
			await seedBankLink662("mat-662c");
			await db.insert(schema.lessonMaterial).values({
				orgId: "org-1",
				classId: "cls-662c",
				date: D,
				materialId: "mat-662c",
			});
			const res = await del(`${sessionPath("cls-662c", D)}/mat-662c`);
			expect(res.status).toBe(200);
		});

		test("bucket rỗng (0 lesson) + class_session + shift row: attach vẫn 201 — cửa sổ path-1 (T11)", async () => {
			await seedShiftedManualBucket("cls-662d", {
				holidayLesson: false,
				classSession: true,
				shiftRow: true,
			});
			await seedBankLink662("mat-662d");
			const res = await json(sessionPath("cls-662d", D), "POST", {
				materialId: "mat-662d",
			});
			expect(res.status).toBe(201);
		});

		test("matrix 2³: 409 chỉ khi holiday∧cs∧shift; (1,0,·) 409 hiện có; (0,0,·) 404 (T12)", async () => {
			const combos = [
				{
					holidayLesson: true,
					classSession: false,
					shiftRow: false,
					expect: 409,
				},
				{
					holidayLesson: true,
					classSession: false,
					shiftRow: true,
					expect: 409,
				},
				{
					holidayLesson: true,
					classSession: true,
					shiftRow: true,
					expect: 409,
				},
				{
					holidayLesson: true,
					classSession: true,
					shiftRow: false,
					expect: 201,
				},
				{
					holidayLesson: false,
					classSession: true,
					shiftRow: false,
					expect: 201,
				},
				{
					holidayLesson: false,
					classSession: true,
					shiftRow: true,
					expect: 201,
				},
				{
					holidayLesson: false,
					classSession: false,
					shiftRow: false,
					expect: 404,
				},
				{
					holidayLesson: false,
					classSession: false,
					shiftRow: true,
					expect: 404,
				},
			];
			let i = 0;
			for (const combo of combos) {
				i += 1;
				const classId = `cls-662m${i}`;
				await seedShiftedManualBucket(classId, combo);
				await seedBankLink662(`mat-${classId}`);
				const res = await json(sessionPath(classId, D), "POST", {
					materialId: `mat-${classId}`,
				});
				expect(res.status, `combo ${JSON.stringify(combo)}`).toBe(combo.expect);
			}
		});
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

		await db
			.insert(schema.organization)
			.values({ id: "org-1", name: "Academy" });
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
			{
				id: "mat-1",
				orgId: "org-1",
				title: "Đề buổi 1",
				kind: "link",
				url: "https://a.example/1",
				createdBy: "t-1",
			},
			{
				id: "mat-2",
				orgId: "org-1",
				title: "Đề buổi 2",
				kind: "link",
				url: "https://a.example/2",
				createdBy: "t-1",
			},
			{
				id: "mat-3",
				orgId: "org-1",
				title: "Đề buổi 2 thêm",
				kind: "link",
				url: "https://a.example/3",
				createdBy: "t-1",
			},
			{
				id: "mat-direct",
				orgId: "org-1",
				title: "Tài liệu direct",
				kind: "link",
				url: "https://a.example/d",
				createdBy: "t-1",
			},
			{
				id: "mat-free",
				orgId: "org-1",
				title: "Tài liệu rảnh",
				kind: "link",
				url: "https://a.example/f",
				createdBy: "t-1",
			},
		]);
		await db.insert(schema.syllabusLessonMaterial).values([
			{
				orgId: "org-1",
				syllabusLessonId: "ls-1",
				materialId: "mat-1",
				position: 0,
			},
			{
				orgId: "org-1",
				syllabusLessonId: "ls-2",
				materialId: "mat-2",
				position: 0,
			},
			{
				orgId: "org-1",
				syllabusLessonId: "ls-2",
				materialId: "mat-3",
				position: 1,
			},
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
