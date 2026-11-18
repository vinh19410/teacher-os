import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";
import type { SessionUser } from "../session";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);

/**
 * Đề thư viện ready (admin xuất bản) phải hiện ở catalog practice của mọi
 * org qua bản sao assignment_test; gỡ xuất bản thì ẩn; không nhân đôi.
 */
describe("student practice — đồng bộ đề thư viện", () => {
	let app: ServerApp;
	let db: Db;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const drizzleDb = drizzle(client, { schema });
		await migrate(drizzleDb, { migrationsFolder: MIGRATIONS_DIR });
		db = drizzleDb as unknown as Db;

		await db.insert(schema.organization).values([
			{ id: "org-1", name: "Academy 1" },
			{ id: "org-2", name: "Academy 2" },
		]);
		await db.insert(schema.student).values([
			{ id: "s-1", orgId: "org-1", name: "Hoa", email: "hoa@test.local" },
			{ id: "s-2", orgId: "org-2", name: "Hoa", email: "hoa@test.local" },
		]);
		await db.insert(schema.libraryTest).values([
			{
				id: "lt-ready",
				title: "Solving Traffic Problems in Big Cities",
				skill: "reading",
				status: "ready",
				collection: "Step IELTS",
			},
			{ id: "lt-draft", title: "Bản nháp", skill: "reading", status: "draft" },
		]);
		await db.insert(schema.libraryTestPart).values([
			{
				id: "ltp-1",
				testId: "lt-ready",
				part: "p1",
				type: "tfng",
				title: "Passage 1",
				passage: "text",
				questions: JSON.stringify([
					{ stem: "Q1", answer: "TRUE", alts: "" },
					{ stem: "Q2", answer: "FALSE", alts: "" },
				]),
			},
			{
				id: "ltp-2",
				testId: "lt-draft",
				part: "p1",
				type: "tfng",
				questions: "[]",
			},
		]);

		app = buildApp({
			getDb: () => db,
			corsOrigin: ["http://localhost:8003"],
			getSessionUser: async (headers: Headers): Promise<SessionUser | null> =>
				headers.get("x-test-user") === "hoa"
					? {
							userId: "u-hoa",
							userName: "Hoa",
							email: "hoa@test.local",
							emailVerified: true,
							role: "student",
						}
					: null,
			authHandler: () => new Response("auth OK"),
		});
	});

	async function catalog(orgId: string) {
		const res = await app.request("/api/student/practice?skill=reading", {
			headers: { "x-test-user": "hoa", "x-student-org-id": orgId },
		});
		expect(res.status).toBe(200);
		return (await res.json()) as {
			total: number;
			items: Array<{ testId: string; title: string; parts: number }>;
		};
	}

	test("đề thư viện ready hiện ở catalog của từng org, đề draft thì không", async () => {
		for (const orgId of ["org-1", "org-2"]) {
			const body = await catalog(orgId);
			expect(body.items.map((i) => i.title)).toEqual([
				"Solving Traffic Problems in Big Cities",
			]);
			expect(body.items[0]?.parts).toBe(1);
		}
	});

	test("gọi lặp lại không nhân đôi bản sao", async () => {
		await catalog("org-1");
		const body = await catalog("org-1");
		expect(body.total).toBe(1);
		const copies = await db
			.select()
			.from(schema.assignmentTest)
			.where(eq(schema.assignmentTest.libraryRef, "lt-ready"));
		expect(copies).toHaveLength(2); // một bản mỗi org
	});

	test("gỡ xuất bản thì ẩn, xuất bản lại thì hiện", async () => {
		await db
			.update(schema.libraryTest)
			.set({ status: "draft" })
			.where(eq(schema.libraryTest.id, "lt-ready"));
		expect((await catalog("org-1")).total).toBe(0);

		await db
			.update(schema.libraryTest)
			.set({ status: "ready" })
			.where(eq(schema.libraryTest.id, "lt-ready"));
		expect((await catalog("org-1")).total).toBe(1);
	});

	test("bản sao thiếu part được bù ở lần mở catalog sau", async () => {
		await db
			.delete(schema.assignmentTestPart)
			.where(
				eq(
					schema.assignmentTestPart.testId,
					(
						await db
							.select({ id: schema.assignmentTest.id })
							.from(schema.assignmentTest)
							.where(eq(schema.assignmentTest.libraryRef, "lt-ready"))
					)[0]?.id as string,
				),
			);
		const body = await catalog("org-1");
		expect(body.items.find((i) => i.title.startsWith("Solving"))?.parts).toBe(
			1,
		);
	});
});
