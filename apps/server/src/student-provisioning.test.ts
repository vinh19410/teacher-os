import { createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Db } from "./app";
import { provisionStudentForUser } from "./student-provisioning";

const MIGRATIONS_DIR = new URL(
	"../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

describe("provisionStudentForUser", () => {
	let db: Db;

	beforeEach(async () => {
		const client = createClient({ url: "file::memory:" });
		const libsql = drizzle(client, { schema });
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;
	});

	test("có org → tạo đúng row (name/email normalized, phone/parent rỗng)", async () => {
		await db.insert(schema.organization).values({
			id: "org-1",
			name: "Academy 1",
		});

		await provisionStudentForUser(db, {
			name: "Alice Nguyen",
			email: " Alice@Example.Com ",
		});

		const rows = await db.select().from(schema.student);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			orgId: "org-1",
			name: "Alice Nguyen",
			email: "alice@example.com",
			phone: "",
			zalo: "",
			parentName: "",
			parentPhone: "",
		});
		expect(rows[0]?.id).toBeTruthy();
	});

	test("email rỗng / whitespace → không tạo row", async () => {
		await db.insert(schema.organization).values({
			id: "org-1",
			name: "Academy 1",
		});

		await provisionStudentForUser(db, {
			name: "No Email User",
			email: "   ",
		});

		const rows = await db.select().from(schema.student);
		expect(rows).toHaveLength(0);
	});

	test("email đã có 1 row → không tạo duplicate", async () => {
		await db.insert(schema.organization).values({
			id: "org-1",
			name: "Academy 1",
		});
		await db.insert(schema.student).values({
			id: "stu-existing",
			orgId: "org-1",
			name: "Existing Student",
			email: "bob@example.com",
			phone: "0901234567",
			zalo: "0901234567",
			parentName: "Parent Bob",
			parentPhone: "0907654321",
		});

		await provisionStudentForUser(db, {
			name: "Bob New",
			email: "Bob@example.com",
		});

		const rows = await db.select().from(schema.student);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.id).toBe("stu-existing");
		expect(rows[0]?.name).toBe("Existing Student");
	});

	test("2 row trùng email legacy → không tạo row mới (fail-closed giữ nguyên)", async () => {
		await db.insert(schema.organization).values({
			id: "org-1",
			name: "Academy 1",
		});
		// In legacy data before unique index, if multiple rows existed
		await db.insert(schema.student).values([
			{
				id: "stu-1",
				orgId: "org-1",
				name: "Student 1",
				email: "dupe@example.com",
			},
			{
				id: "stu-2",
				orgId: "org-1",
				name: "Student 2",
				email: "",
			},
		]);

		await provisionStudentForUser(db, {
			name: "Dupe User",
			email: "dupe@example.com",
		});

		const rows = await db.select().from(schema.student);
		expect(rows).toHaveLength(2);
	});

	test("chưa có org nào trong DB → không tạo row và không crash", async () => {
		await provisionStudentForUser(db, {
			name: "Orphan Student",
			email: "orphan@example.com",
		});

		const rows = await db.select().from(schema.student);
		expect(rows).toHaveLength(0);
	});

	test("DB ném lỗi → promise không reject (D7 fail-open)", async () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const failingDb = {
			select: () => {
				throw new Error("Simulated SQLite failure");
			},
		} as unknown as Db;

		await expect(
			provisionStudentForUser(failingDb, {
				name: "Crash Test",
				email: "crash@example.com",
			}),
		).resolves.toBeUndefined();

		expect(consoleSpy).toHaveBeenCalled();
		consoleSpy.mockRestore();
	});
});
