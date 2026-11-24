import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import type {
	ClassMaterialView,
	MaterialView,
	StudentClassMaterialView,
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
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);

const PDF = "application/pdf";

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
	"student-active": {
		userId: "u-stu-active",
		userName: "Minh",
		email: "minh@student.local",
		emailVerified: true,
		role: "student",
	},
	"student-other": {
		userId: "u-stu-other",
		userName: "Hà",
		email: "ha@student.local",
		emailVerified: true,
		role: "student",
	},
	"student-invited": {
		userId: "u-stu-invited",
		userName: "Linh",
		email: "linh@student.local",
		emailVerified: true,
		role: "student",
	},
	"student-dropped": {
		userId: "u-stu-dropped",
		userName: "Khôi",
		email: "khoi@student.local",
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
	const hooks = {
		onPut: null as ((key: string) => Promise<void>) | null,
	};
	const store: MediaStore = {
		async put(key, body, { contentType, size }) {
			const counted = enforceDeclaredSize(body, size);
			const bytes = new Uint8Array(
				await new Response(counted.stream).arrayBuffer(),
			);
			objects.set(key, { bytes, contentType });
			if (hooks.onPut) {
				await hooks.onPut(key);
			}
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
			objects.delete(key);
		},
	};
	return { store, objects, hooks };
}

function pdfFixture(tail: readonly number[] = []): Uint8Array {
	const head = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34];
	const out = new Uint8Array(head.length + tail.length);
	out.set(head, 0);
	out.set(tail, head.length);
	return out;
}

function mp3Id3Fixture(): Uint8Array {
	return new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 10]);
}

const CLASS_BASE = {
	orgId: "org-1",
	level: "6.5",
	type: "ielts",
	skills: '["reading"]',
	mode: "Online",
	schedule: '{"days":[1],"start":"18:00","end":"20:00"}',
	sessionsTotal: 8,
	sessionsDone: 0,
	status: "active",
	startDate: "2026-11-01",
	notes: "",
};

describe("class_material schema migration and foreign keys", () => {
	test("creates class_material with composite PK, indexes, class CASCADE, and material NO ACTION", async () => {
		const client = createClient({ url: "file::memory:" });
		await client.execute("PRAGMA foreign_keys = ON");
		const db = drizzle(client, { schema });
		await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

		const indexes = await client.execute(
			"SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'class_material'",
		);
		const indexNames = indexes.rows.map((r) => String(r.name));
		expect(indexNames).toContain("class_material_material_idx");
		expect(indexNames).toContain("class_material_org_idx");

		await db
			.insert(schema.organization)
			.values({ id: "org-fk", name: "FK Academy" });
		await db.insert(schema.classTable).values({
			...CLASS_BASE,
			id: "cls-fk",
			orgId: "org-fk",
			name: "FK Class",
		});
		await db.insert(schema.material).values({
			id: "mat-fk",
			orgId: "org-fk",
			title: "Course Guide",
			kind: "link",
			url: "https://example.com/guide",
			createdBy: "t-fk",
		});
		await db.insert(schema.classMaterial).values({
			orgId: "org-fk",
			classId: "cls-fk",
			materialId: "mat-fk",
			position: 0,
		});

		// Composite primary key blocks duplicate (class_id, material_id).
		await expect(
			db.insert(schema.classMaterial).values({
				orgId: "org-fk",
				classId: "cls-fk",
				materialId: "mat-fk",
				position: 1,
			}),
		).rejects.toThrow();

		// FK material_id ON DELETE NO ACTION prevents deleting an attached material.
		await expect(
			db.delete(schema.material).where(eq(schema.material.id, "mat-fk")),
		).rejects.toThrow();

		// FK class_id ON DELETE CASCADE removes the link row while keeping the material.
		await db
			.delete(schema.classTable)
			.where(eq(schema.classTable.id, "cls-fk"));
		const remainingLinks = await db
			.select()
			.from(schema.classMaterial)
			.where(eq(schema.classMaterial.classId, "cls-fk"));
		expect(remainingLinks).toHaveLength(0);

		const remainingMaterials = await db
			.select()
			.from(schema.material)
			.where(eq(schema.material.id, "mat-fk"));
		expect(remainingMaterials).toHaveLength(1);

		// Once the class cascade removes the link, the material can be deleted.
		await db.delete(schema.material).where(eq(schema.material.id, "mat-fk"));
		expect(
			await db
				.select()
				.from(schema.material)
				.where(eq(schema.material.id, "mat-fk")),
		).toHaveLength(0);
	});
});

describe("class shared materials routes (teacher and student)", () => {
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
				id: "stu-active",
				orgId: "org-1",
				name: "Minh",
				email: "minh@student.local",
				phone: "0901111111",
			},
			{
				id: "stu-other",
				orgId: "org-1",
				name: "Hà",
				email: "ha@student.local",
				phone: "0902222222",
			},
			{
				id: "stu-invited",
				orgId: "org-1",
				name: "Linh",
				email: "linh@student.local",
				phone: "0903333333",
			},
			{
				id: "stu-dropped",
				orgId: "org-1",
				name: "Khôi",
				email: "khoi@student.local",
				phone: "0904444444",
			},
		]);
		await db.insert(schema.classTable).values([
			// class-no-lessons has zero lesson rows to verify class materials do not require sessions.
			{ ...CLASS_BASE, id: "class-no-lessons", name: "IELTS Zero Lessons" },
			{
				...CLASS_BASE,
				id: "class-paused",
				name: "IELTS Paused",
				status: "paused",
			},
			{ ...CLASS_BASE, id: "class-with-session", name: "IELTS Sessions" },
			{ ...CLASS_BASE, id: "class-org2", orgId: "org-2", name: "Org 2 Class" },
		]);
		await db.insert(schema.enrollment).values([
			{
				id: "enr-active-1",
				orgId: "org-1",
				classId: "class-no-lessons",
				studentId: "stu-active",
				status: "active",
			},
			{
				id: "enr-active-paused",
				orgId: "org-1",
				classId: "class-paused",
				studentId: "stu-active",
				status: "active",
			},
			{
				id: "enr-active-sess",
				orgId: "org-1",
				classId: "class-with-session",
				studentId: "stu-active",
				status: "active",
			},
			{
				id: "enr-other",
				orgId: "org-1",
				classId: "class-with-session",
				studentId: "stu-other",
				status: "active",
			},
			{
				id: "enr-invited",
				orgId: "org-1",
				classId: "class-no-lessons",
				studentId: "stu-invited",
				status: "invited",
			},
			{
				id: "enr-dropped",
				orgId: "org-1",
				classId: "class-no-lessons",
				studentId: "stu-dropped",
				status: "dropped",
			},
		]);
		await db.insert(schema.lesson).values({
			id: "l-sess-1",
			orgId: "org-1",
			classId: "class-with-session",
			enrollmentId: "enr-active-sess",
			day: 2,
			time: "18:00",
			dur: 120,
			date: "2026-11-10",
		});

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
		memory.hooks.onPut = null;
	});

	function json(
		path: string,
		method: string,
		body: unknown,
		user = "teacher-1",
		target: ServerApp = app,
	) {
		return target.request(path, {
			method,
			headers: {
				"x-test-user": user,
				Origin: user.startsWith("student") ? STUDENT_ORIGIN : TEACHER_ORIGIN,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});
	}

	function get(
		path: string,
		user = "teacher-1",
		extra: Record<string, string> = {},
		target: ServerApp = app,
	) {
		return target.request(path, {
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
			user?: string;
			target?: ServerApp;
		} = {},
	) {
		const mimeType = options.type ?? PDF;
		const bytes =
			options.bytes ??
			(mimeType === "audio/mpeg" ? mp3Id3Fixture() : pdfFixture());
		return (options.target ?? app).request(path, {
			method: "PUT",
			headers: {
				"x-test-user": options.user ?? "teacher-1",
				Origin: TEACHER_ORIGIN,
				"Content-Type": mimeType,
				"Content-Length": String(bytes.byteLength),
				"X-File-Name": encodeURIComponent(options.name ?? "Handbook.pdf"),
			},
			body: bytes as unknown as BodyInit,
		});
	}

	async function createBankLink(title: string, user = "teacher-1") {
		const res = await json(
			"/api/materials/links",
			"POST",
			{ title, url: "https://example.com/resource" },
			user,
		);
		expect(res.status).toBe(201);
		return ((await res.json()) as { material: MaterialView }).material;
	}

	const classPath = (classId = "class-no-lessons") =>
		`/api/classes/${classId}/materials`;
	const studentClassPath = (classId = "class-no-lessons") =>
		`/api/student/classes/${classId}/materials`;

	test("role gate: ta reads only, class_teacher reads and writes, suspended/student/anonymous blocked", async () => {
		const bankLink = await createBankLink("Gate Material");

		expect((await app.request(classPath())).status).toBe(401);
		expect((await get(classPath(), "student-active")).status).toBe(403);

		const suspGet = await get(classPath(), "susp-1");
		expect(suspGet.status).toBe(403);
		expect(((await suspGet.json()) as { code?: string }).code).toBe(
			"FORBIDDEN",
		);
		expect(
			(await json(classPath(), "POST", { materialId: bankLink.id }, "susp-1"))
				.status,
		).toBe(403);

		// TA can read class materials but cannot attach, upload, add link, or detach.
		expect((await get(classPath(), "ta-1")).status).toBe(200);
		for (const res of [
			await json(classPath(), "POST", { materialId: bankLink.id }, "ta-1"),
			await upload(`${classPath()}/files`, { user: "ta-1" }),
			await json(
				`${classPath()}/links`,
				"POST",
				{ title: "TA link", url: "https://example.com/ta" },
				"ta-1",
			),
			await del(`${classPath()}/${bankLink.id}`, "ta-1"),
		]) {
			expect(res.status).toBe(403);
			expect(((await res.json()) as { code?: string }).code).toBe("FORBIDDEN");
		}

		// class_teacher has full read/write permissions on class materials.
		const ctAttach = await json(
			classPath(),
			"POST",
			{ materialId: bankLink.id },
			"ct-1",
		);
		expect(ctAttach.status).toBe(201);
		const ctLink = await json(
			`${classPath()}/links`,
			"POST",
			{ title: "CT Class Link", url: "https://example.com/ct" },
			"ct-1",
		);
		expect(ctLink.status).toBe(201);
		const ctLinkItem = ((await ctLink.json()) as { item: ClassMaterialView })
			.item;
		const ctUpload = await upload(`${classPath()}/files`, {
			user: "ct-1",
			name: "CT Guide.pdf",
		});
		expect(ctUpload.status).toBe(201);
		const ctUploadItem = (
			(await ctUpload.json()) as { item: ClassMaterialView }
		).item;

		expect((await get(classPath(), "ct-1")).status).toBe(200);

		// Clean up created links and bank entries.
		expect((await del(`${classPath()}/${bankLink.id}`, "ct-1")).status).toBe(
			200,
		);
		expect((await del(`${classPath()}/${ctLinkItem.id}`, "ct-1")).status).toBe(
			200,
		);
		expect(
			(await del(`${classPath()}/${ctUploadItem.id}`, "ct-1")).status,
		).toBe(200);
		expect((await del(`/api/materials/${bankLink.id}`, "ct-1")).status).toBe(
			200,
		);
		expect((await del(`/api/materials/${ctLinkItem.id}`, "ct-1")).status).toBe(
			200,
		);
		expect(
			(await del(`/api/materials/${ctUploadItem.id}`, "ct-1")).status,
		).toBe(200);
	});

	test("teacher endpoints: attach, duplicate 409, upload to bank root, direct link, detach, paused class, and org isolation", async () => {
		const bankFirst = await createBankLink("Grammar Reference");
		const org2Material = await createBankLink("Org 2 Secret", "teacher-2");

		// Cross-org and missing class/material checks return 404.
		expect((await get(classPath("missing-class"))).status).toBe(404);
		expect((await get(classPath("class-org2"))).status).toBe(404);
		expect((await get(classPath(), "teacher-2")).status).toBe(404);
		expect(
			(await json(classPath(), "POST", { materialId: "missing-mat" })).status,
		).toBe(404);
		expect(
			(await json(classPath(), "POST", { materialId: org2Material.id })).status,
		).toBe(404);
		expect(
			(
				await json(classPath("class-org2"), "POST", {
					materialId: bankFirst.id,
				})
			).status,
		).toBe(404);
		expect((await json(classPath(), "POST", {})).status).toBe(400);

		// Attach existing bank material.
		const attachRes = await json(classPath(), "POST", {
			materialId: bankFirst.id,
		});
		expect(attachRes.status).toBe(201);
		const attached = ((await attachRes.json()) as { item: ClassMaterialView })
			.item;
		expect(attached).toMatchObject({
			id: bankFirst.id,
			position: 0,
			usageCount: 0,
			classUsageCount: 1,
		});
		expect(typeof attached.attachedAt).toBe("string");

		// Duplicate attach returns 409 ALREADY_ATTACHED.
		const dupRes = await json(classPath(), "POST", {
			materialId: bankFirst.id,
		});
		expect(dupRes.status).toBe(409);
		expect(((await dupRes.json()) as { code: string }).code).toBe(
			"ALREADY_ATTACHED",
		);

		// Upload PDF directly to class -> stored at bank root (folderId: null) and attached.
		const pdfBytes = pdfFixture([1, 2, 3, 4]);
		const uploadPdfRes = await upload(`${classPath()}/files`, {
			name: "Class Rules.pdf",
			bytes: pdfBytes,
		});
		expect(uploadPdfRes.status).toBe(201);
		const uploadedPdf = (
			(await uploadPdfRes.json()) as { item: ClassMaterialView }
		).item;
		expect(uploadedPdf).toMatchObject({
			kind: "file",
			folderId: null,
			title: "Class Rules.pdf",
			originalName: "Class Rules.pdf",
			mimeType: PDF,
			sizeBytes: pdfBytes.byteLength,
			position: 1,
			usageCount: 0,
			classUsageCount: 1,
		});
		expect(memory.objects.has(`org-1/${uploadedPdf.id}`)).toBe(true);

		// Upload MP3 directly to class -> kind: "media", folderId: null.
		const uploadMp3Res = await upload(`${classPath()}/files`, {
			name: "Listening Track.mp3",
			type: "audio/mpeg",
			bytes: mp3Id3Fixture(),
		});
		expect(uploadMp3Res.status).toBe(201);
		const uploadedMp3 = (
			(await uploadMp3Res.json()) as { item: ClassMaterialView }
		).item;
		expect(uploadedMp3).toMatchObject({
			kind: "media",
			folderId: null,
			position: 2,
			classUsageCount: 1,
		});

		// Upload validation & missing store / missing class checks write 0 objects.
		const objectCountBeforeErrors = memory.objects.size;
		expect(
			(await upload(`${classPath()}/files`, { target: appNoStore })).status,
		).toBe(503);
		expect((await upload(`${classPath("class-org2")}/files`)).status).toBe(404);
		expect(
			(
				await upload(`${classPath()}/files`, {
					type: "text/html",
					name: "bad.html",
					bytes: new TextEncoder().encode("<html></html>"),
				})
			).status,
		).toBe(415);
		expect(memory.objects.size).toBe(objectCountBeforeErrors);

		// Create link directly on class -> bank root (folderId: null) + attached.
		const badLink = await json(`${classPath()}/links`, "POST", {
			title: "XSS",
			url: "javascript:alert(1)",
		});
		expect(badLink.status).toBe(400);
		expect(
			(
				await json(`${classPath()}/links`, "POST", {
					title: "Extra field",
					url: "https://example.com",
					folderId: null,
				})
			).status,
		).toBe(400);
		expect(
			(
				await json(`${classPath("class-org2")}/links`, "POST", {
					title: "Wrong Org",
					url: "https://example.com",
				})
			).status,
		).toBe(404);

		const createdLinkRes = await json(`${classPath()}/links`, "POST", {
			title: "  Vocabulary Sheet  ",
			description: "  Shared sheet for the full course  ",
			url: " https://example.com/vocab ",
		});
		expect(createdLinkRes.status).toBe(201);
		const createdLink = (
			(await createdLinkRes.json()) as { item: ClassMaterialView }
		).item;
		expect(createdLink).toMatchObject({
			kind: "link",
			folderId: null,
			title: "Vocabulary Sheet",
			description: "Shared sheet for the full course",
			url: "https://example.com/vocab",
			position: 3,
			usageCount: 0,
			classUsageCount: 1,
		});

		// List order follows position ASC.
		const listed = (await (await get(classPath())).json()) as {
			items: ClassMaterialView[];
		};
		expect(listed.items.map((i) => i.id)).toEqual([
			bankFirst.id,
			uploadedPdf.id,
			uploadedMp3.id,
			createdLink.id,
		]);
		expect(listed.items.map((i) => i.position)).toEqual([0, 1, 2, 3]);

		// Bank list and detail expose accurate classUsageCount.
		const bankList = (await (
			await get("/api/materials?folderId=root")
		).json()) as { items: MaterialView[] };
		const byId = new Map(bankList.items.map((item) => [item.id, item]));
		expect(byId.get(uploadedPdf.id)?.classUsageCount).toBe(1);
		expect(byId.get(createdLink.id)?.classUsageCount).toBe(1);

		const detail = (await (
			await get(`/api/materials/${bankFirst.id}`)
		).json()) as { material: MaterialView };
		expect(detail.material.classUsageCount).toBe(1);

		// Paused class allows attach, upload, link create, list, and detach.
		const pausedAttach = await json(classPath("class-paused"), "POST", {
			materialId: bankFirst.id,
		});
		expect(pausedAttach.status).toBe(201);
		expect(
			((await pausedAttach.json()) as { item: ClassMaterialView }).item
				.classUsageCount,
		).toBe(2);

		const pausedLink = await json(
			`${classPath("class-paused")}/links`,
			"POST",
			{
				title: "Paused Class Link",
				url: "https://example.com/paused",
			},
		);
		expect(pausedLink.status).toBe(201);
		const pausedLinkItem = (
			(await pausedLink.json()) as { item: ClassMaterialView }
		).item;

		const pausedUpload = await upload(`${classPath("class-paused")}/files`, {
			name: "Paused Notes.pdf",
			bytes: pdfFixture([7, 7]),
		});
		expect(pausedUpload.status).toBe(201);
		const pausedUploadItem = (
			(await pausedUpload.json()) as { item: ClassMaterialView }
		).item;

		expect((await get(classPath("class-paused"))).status).toBe(200);

		// Detach removes class link only; material remains in bank and classUsageCount decrements.
		expect(
			(await del(`${classPath("class-paused")}/${bankFirst.id}`)).status,
		).toBe(200);
		expect(
			(await del(`${classPath("class-paused")}/${bankFirst.id}`)).status,
		).toBe(404);
		const afterDetach = (await (
			await get(`/api/materials/${bankFirst.id}`)
		).json()) as { material: MaterialView };
		expect(afterDetach.material.classUsageCount).toBe(1);

		// Detaching on wrong org / missing class returns 404 CLASS_NOT_FOUND.
		const wrongOrgDetach = await del(
			`${classPath("class-org2")}/${bankFirst.id}`,
		);
		expect(wrongOrgDetach.status).toBe(404);
		expect(((await wrongOrgDetach.json()) as { code: string }).code).toBe(
			"CLASS_NOT_FOUND",
		);

		// Leave pausedUploadItem & pausedLinkItem on class-paused for student tests, clean up temporary bank link only if needed.
		expect(pausedLinkItem.id).toBeTruthy();
		expect(pausedUploadItem.id).toBeTruthy();
	});

	test("upload rollback discards R2 object when DB insert fails or class disappears mid-upload", async () => {
		// Case 1: class deleted between resolveClass and db.batch -> 404 CLASS_NOT_FOUND, R2 discarded, no orphan material.
		await db.insert(schema.classTable).values({
			...CLASS_BASE,
			id: "class-vanishing",
			name: "Vanishing Class",
		});
		const objectsBefore = memory.objects.size;
		const uploadedKeys: string[] = [];
		memory.hooks.onPut = async (key) => {
			uploadedKeys.push(key);
			await db
				.delete(schema.classTable)
				.where(eq(schema.classTable.id, "class-vanishing"));
		};

		const vanishRes = await upload(`${classPath("class-vanishing")}/files`, {
			name: "Vanish.pdf",
		});
		expect(vanishRes.status).toBe(404);
		expect(((await vanishRes.json()) as { code: string }).code).toBe(
			"CLASS_NOT_FOUND",
		);
		await settle();
		expect(uploadedKeys).toHaveLength(1);
		const uploadedKey = uploadedKeys[0] ?? "";
		expect(uploadedKey).toMatch(/^org-1\//);
		expect(memory.objects.has(uploadedKey)).toBe(false);
		expect(memory.objects.size).toBe(objectsBefore);
		const matId = uploadedKey.split("/")[1] ?? "";
		expect(
			await db
				.select()
				.from(schema.material)
				.where(eq(schema.material.id, matId)),
		).toHaveLength(0);

		// Case 2: generic db.batch error -> 500 { error: "upload failed" }, R2 discarded.
		memory.hooks.onPut = null;
		const failingDb = new Proxy(db, {
			get(target, prop, receiver) {
				if (prop === "batch") {
					return () => Promise.reject(new Error("simulated db batch failure"));
				}
				return Reflect.get(target, prop, receiver);
			},
		}) as Db;
		const failingApp = buildApp({
			getDb: () => failingDb,
			authHandler: () => new Response(null, { status: 404 }),
			corsOrigin: [TEACHER_ORIGIN, STUDENT_ORIGIN],
			getSessionUser: sessionFor,
			getMaterialsStore: () => memory.store,
			runInBackground: (promise) => {
				background.push(promise);
			},
		});

		const beforeFail = memory.objects.size;
		const failRes = await upload(`${classPath()}/files`, {
			name: "DbFail.pdf",
			target: failingApp,
		});
		expect(failRes.status).toBe(500);
		expect(await failRes.json()).toEqual({ error: "upload failed" });
		await settle();
		expect(memory.objects.size).toBe(beforeFail);
	});

	test("DELETE /api/materials/:id blocks with 409 MATERIAL_IN_USE including classCount and allows delete after detach", async () => {
		const uploadRes = await upload("/api/materials/files", {
			name: "GuardFile.pdf",
			bytes: pdfFixture([4, 2]),
		});
		expect(uploadRes.status).toBe(201);
		const file = ((await uploadRes.json()) as { material: MaterialView })
			.material;
		expect(file.classUsageCount).toBe(0);

		// Attach to class-with-session.
		expect(
			(
				await json(classPath("class-with-session"), "POST", {
					materialId: file.id,
				})
			).status,
		).toBe(201);

		const blockedClassOnly = await del(`/api/materials/${file.id}`);
		expect(blockedClassOnly.status).toBe(409);
		expect(await blockedClassOnly.json()).toMatchObject({
			error: "MATERIAL_IN_USE",
			code: "MATERIAL_IN_USE",
			sessionCount: 0,
			syllabusCount: 0,
			classCount: 1,
		});
		expect(memory.objects.has(`org-1/${file.id}`)).toBe(true);

		// Also attach to a session -> reports both sessionCount and classCount.
		expect(
			(
				await json(
					"/api/classes/class-with-session/sessions/2026-11-10/materials",
					"POST",
					{ materialId: file.id },
				)
			).status,
		).toBe(201);
		const blockedBoth = await del(`/api/materials/${file.id}`);
		expect(blockedBoth.status).toBe(409);
		expect(await blockedBoth.json()).toMatchObject({
			code: "MATERIAL_IN_USE",
			sessionCount: 1,
			syllabusCount: 0,
			classCount: 1,
		});

		// PATCH updates metadata while preserving classUsageCount.
		const patched = await json(`/api/materials/${file.id}`, "PATCH", {
			title: "GuardFile Updated.pdf",
		});
		expect(patched.status).toBe(200);
		expect(
			((await patched.json()) as { material: MaterialView }).material,
		).toMatchObject({
			title: "GuardFile Updated.pdf",
			usageCount: 1,
			classUsageCount: 1,
		});

		// Detach from session and class, then delete succeeds and removes R2 object.
		expect(
			(
				await del(
					`/api/classes/class-with-session/sessions/2026-11-10/materials/${file.id}`,
				)
			).status,
		).toBe(200);
		expect(
			(await del(`${classPath("class-with-session")}/${file.id}`)).status,
		).toBe(200);
		expect((await del(`/api/materials/${file.id}`)).status).toBe(200);
		expect(memory.objects.has(`org-1/${file.id}`)).toBe(false);
	});

	test("student routes: active enrollment reads list, downloads/streams with Range & download=1, works with zero lessons and paused classes, enforces strict projection and IDOR 404", async () => {
		// Seed a dedicated unattached bank file in org-1 to test cross-material IDOR.
		const unattachedFileRes = await upload("/api/materials/files", {
			name: "PrivateBank.pdf",
			bytes: pdfFixture([9, 9]),
		});
		const unattachedFile = (
			(await unattachedFileRes.json()) as { material: MaterialView }
		).material;

		// Verify class-no-lessons truly has zero lessons in DB.
		const lessonsInZeroClass = await db
			.select()
			.from(schema.lesson)
			.where(
				and(
					eq(schema.lesson.orgId, "org-1"),
					eq(schema.lesson.classId, "class-no-lessons"),
				),
			);
		expect(lessonsInZeroClass).toHaveLength(0);

		// Active student reads class with zero lessons.
		const listRes = await get(
			studentClassPath("class-no-lessons"),
			"student-active",
		);
		expect(listRes.status).toBe(200);
		const listBody = (await listRes.json()) as {
			items: StudentClassMaterialView[];
		};
		expect(listBody.items.length).toBeGreaterThanOrEqual(4);
		expect(listBody.items.map((i) => i.id)).not.toContain(unattachedFile.id);

		// Verify strict safe projection — no teacher-only columns leaked.
		const expectedKeys = [
			"description",
			"id",
			"kind",
			"mimeType",
			"originalName",
			"position",
			"sizeBytes",
			"title",
			"url",
		];
		for (const item of listBody.items) {
			expect(Object.keys(item).sort()).toEqual(expectedKeys);
		}
		const rawJson = JSON.stringify(listBody);
		expect(rawJson).not.toContain("objectKey");
		expect(rawJson).not.toContain("createdBy");
		expect(rawJson).not.toContain("folderId");
		expect(rawJson).not.toContain("usageCount");
		expect(rawJson).not.toContain("classUsageCount");
		expect(rawJson).not.toContain("org-1/");
		expect(rawJson).not.toContain("t-1");

		const pdfItem = listBody.items.find((i) => i.title === "Class Rules.pdf");
		const mp3Item = listBody.items.find(
			(i) => i.title === "Listening Track.mp3",
		);
		const linkItem = listBody.items.find((i) => i.title === "Vocabulary Sheet");
		expect(pdfItem).toBeDefined();
		expect(mp3Item).toBeDefined();
		expect(linkItem).toBeDefined();

		// Download PDF: attachment disposition + strict security headers.
		const pdfRes = await get(
			`${studentClassPath("class-no-lessons")}/${pdfItem?.id}/file`,
			"student-active",
		);
		expect(pdfRes.status).toBe(200);
		expect(pdfRes.headers.get("Content-Type")).toBe(PDF);
		expect(pdfRes.headers.get("Content-Disposition")).toMatch(/^attachment;/);
		expect(pdfRes.headers.get("Cross-Origin-Resource-Policy")).toBe(
			"same-site",
		);
		expect(pdfRes.headers.get("Referrer-Policy")).toBe("no-referrer");
		expect(pdfRes.headers.get("Cross-Origin-Opener-Policy")).toBe(
			"same-origin",
		);
		expect(pdfRes.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(pdfRes.headers.get("Content-Security-Policy")).toBe(
			"default-src 'none'; frame-ancestors 'none'; sandbox",
		);
		expect(new Uint8Array(await pdfRes.arrayBuffer())).toEqual(
			pdfFixture([1, 2, 3, 4]),
		);

		// Stream MP3 inline + Range 206 + ?download=1 forces attachment.
		const mp3Full = await get(
			`${studentClassPath("class-no-lessons")}/${mp3Item?.id}/file`,
			"student-active",
		);
		expect(mp3Full.status).toBe(200);
		expect(mp3Full.headers.get("Content-Type")).toBe("audio/mpeg");
		expect(mp3Full.headers.get("Content-Disposition")).toMatch(/^inline;/);
		expect(mp3Full.headers.get("Cross-Origin-Resource-Policy")).toBe(
			"same-site",
		);
		expect(mp3Full.headers.get("Referrer-Policy")).toBe("no-referrer");
		expect(new Uint8Array(await mp3Full.arrayBuffer())).toEqual(
			mp3Id3Fixture(),
		);

		const mp3Range = await get(
			`${studentClassPath("class-no-lessons")}/${mp3Item?.id}/file`,
			"student-active",
			{ Range: "bytes=2-5" },
		);
		expect(mp3Range.status).toBe(206);
		expect(mp3Range.headers.get("Content-Range")).toBe("bytes 2-5/10");
		expect(new Uint8Array(await mp3Range.arrayBuffer())).toEqual(
			new Uint8Array([0x33, 4, 0, 0]),
		);

		const mp3Unsatisfiable = await get(
			`${studentClassPath("class-no-lessons")}/${mp3Item?.id}/file`,
			"student-active",
			{ Range: "bytes=50-60" },
		);
		expect(mp3Unsatisfiable.status).toBe(416);

		const mp3Download = await get(
			`${studentClassPath("class-no-lessons")}/${mp3Item?.id}/file?download=1`,
			"student-active",
		);
		expect(mp3Download.status).toBe(200);
		expect(mp3Download.headers.get("Content-Disposition")).toMatch(
			/^attachment;/,
		);
		expect(mp3Download.headers.get("Content-Security-Policy")).toBe(
			"default-src 'none'; frame-ancestors 'none'; sandbox",
		);

		// Active student reads & downloads from a paused class.
		const pausedListRes = await get(
			studentClassPath("class-paused"),
			"student-active",
		);
		expect(pausedListRes.status).toBe(200);
		const pausedItems = (
			(await pausedListRes.json()) as { items: StudentClassMaterialView[] }
		).items;
		const pausedPdf = pausedItems.find((i) => i.title === "Paused Notes.pdf");
		expect(pausedPdf).toBeDefined();
		const pausedFileRes = await get(
			`${studentClassPath("class-paused")}/${pausedPdf?.id}/file`,
			"student-active",
		);
		expect(pausedFileRes.status).toBe(200);
		expect(new Uint8Array(await pausedFileRes.arrayBuffer())).toEqual(
			pdfFixture([7, 7]),
		);

		// Link material has no R2 object -> 404; unattached material in same org -> 404.
		expect(
			(
				await get(
					`${studentClassPath("class-no-lessons")}/${linkItem?.id}/file`,
					"student-active",
				)
			).status,
		).toBe(404);
		expect(
			(
				await get(
					`${studentClassPath("class-no-lessons")}/${unattachedFile.id}/file`,
					"student-active",
				)
			).status,
		).toBe(404);

		// Non-active enrollments (other class, invited, dropped) and cross-org class -> 404.
		for (const blockedUser of [
			"student-other",
			"student-invited",
			"student-dropped",
		]) {
			expect(
				(await get(studentClassPath("class-no-lessons"), blockedUser)).status,
			).toBe(404);
			expect(
				(
					await get(
						`${studentClassPath("class-no-lessons")}/${pdfItem?.id}/file`,
						blockedUser,
					)
				).status,
			).toBe(404);
		}
		expect(
			(await get(studentClassPath("class-org2"), "student-active")).status,
		).toBe(404);
		expect(
			(
				await get(
					`${studentClassPath("class-org2")}/${pdfItem?.id}/file`,
					"student-active",
				)
			).status,
		).toBe(404);

		// Teacher session and anonymous blocked on student route.
		expect(
			(await get(studentClassPath("class-no-lessons"), "teacher-1")).status,
		).toBe(403);
		expect(
			(await app.request(studentClassPath("class-no-lessons"))).status,
		).toBe(401);

		// Missing store -> 503 MATERIALS_DISABLED on file route, list remains 200.
		expect(
			(
				await get(
					studentClassPath("class-no-lessons"),
					"student-active",
					{},
					appNoStore,
				)
			).status,
		).toBe(200);
		const noStoreFile = await get(
			`${studentClassPath("class-no-lessons")}/${pdfItem?.id}/file`,
			"student-active",
			{},
			appNoStore,
		);
		expect(noStoreFile.status).toBe(503);
		expect(await noStoreFile.json()).toEqual({
			error: "MATERIALS_DISABLED",
			code: "MATERIALS_DISABLED",
		});
	});
});
