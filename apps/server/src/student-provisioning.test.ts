import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Db } from "./app";
import { provisionStudentForUser } from "./student-provisioning";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url).href,
);

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

	test("name rỗng / whitespace → mặc định lấy local-part của email", async () => {
		await db.insert(schema.organization).values({
			id: "org-1",
			name: "Academy 1",
		});

		await provisionStudentForUser(db, {
			name: "   ",
			email: " Alice.Nguyen@Example.Com ",
		});
		await provisionStudentForUser(db, {
			name: null,
			email: "bob@example.com",
		});

		const rows = await db.select().from(schema.student);
		expect(rows).toHaveLength(2);
		expect(rows.find((r) => r.email === "alice.nguyen@example.com")?.name).toBe(
			"alice.nguyen",
		);
		expect(rows.find((r) => r.email === "bob@example.com")?.name).toBe("bob");
	});

	test("có pending studentInvitation → tạo student và tự accept lời mời (#716)", async () => {
		await db.insert(schema.organization).values({
			id: "org-1",
			name: "Academy 1",
		});
		await db.insert(schema.user).values({
			id: "u-inviter",
			name: "Teacher Inviter",
			email: "teacher@example.com",
			emailVerified: true,
			role: "teacher",
		});
		await db.insert(schema.studentInvitation).values({
			id: "inv-pending-1",
			orgId: "org-1",
			inviterUserId: "u-inviter",
			email: " Invited.Student@Example.Com ",
			status: "pending",
		});

		await provisionStudentForUser(db, {
			name: "Invited Student",
			email: "invited.student@example.com",
		});

		const students = await db.select().from(schema.student);
		expect(students).toHaveLength(1);
		expect(students[0]).toMatchObject({
			orgId: "org-1",
			name: "Invited Student",
			email: "invited.student@example.com",
		});

		const [inv] = await db
			.select()
			.from(schema.studentInvitation)
			.where(eq(schema.studentInvitation.id, "inv-pending-1"));
		expect(inv?.status).toBe("accepted");
	});

	test("student đã tồn tại + pending invitation → giữ nguyên hồ sơ cũ và vẫn accept lời mời (#716)", async () => {
		await db.insert(schema.organization).values({
			id: "org-1",
			name: "Academy 1",
		});
		await db.insert(schema.user).values({
			id: "u-inviter",
			name: "Teacher Inviter",
			email: "teacher@example.com",
			emailVerified: true,
			role: "teacher",
		});
		await db.insert(schema.student).values({
			id: "stu-existing",
			orgId: "org-1",
			name: "Existing Profile",
			email: "existing@example.com",
			phone: "0909998888",
		});
		await db.insert(schema.studentInvitation).values({
			id: "inv-existing-1",
			orgId: "org-1",
			inviterUserId: "u-inviter",
			email: "existing@example.com",
			status: "pending",
		});

		await provisionStudentForUser(db, {
			name: "New Display Name",
			email: "Existing@Example.Com",
		});

		const students = await db.select().from(schema.student);
		expect(students).toHaveLength(1);
		expect(students[0]).toMatchObject({
			id: "stu-existing",
			name: "Existing Profile",
			phone: "0909998888",
		});

		const [inv] = await db
			.select()
			.from(schema.studentInvitation)
			.where(eq(schema.studentInvitation.id, "inv-existing-1"));
		expect(inv?.status).toBe("accepted");
	});

	test("3-tier org priority: teacherEmails > managed membership (bỏ qua empty/TA org) > earliest org fallback (#716)", async () => {
		// Tier 1: org có manager thuộc teacherEmails thắng org có manager khác tạo sớm hơn
		await db.insert(schema.organization).values([
			{ id: "org-empty", name: "Empty Seed Org", createdAt: new Date(1000) },
			{ id: "org-ta-only", name: "TA Only Org", createdAt: new Date(1500) },
			{ id: "org-other", name: "Other Managed Org", createdAt: new Date(2000) },
			{ id: "org-boss", name: "Boss Teacher Org", createdAt: new Date(3000) },
		]);
		await db.insert(schema.user).values([
			{
				id: "u-ta",
				name: "TA User",
				email: "ta@example.com",
				emailVerified: true,
				role: "teacher",
			},
			{
				id: "u-other",
				name: "Other Teacher",
				email: "other@example.com",
				emailVerified: true,
				role: "teacher",
			},
			{
				id: "u-boss",
				name: "Boss Teacher",
				email: "boss@example.com",
				emailVerified: true,
				role: "teacher",
			},
		]);
		await db.insert(schema.membership).values([
			{ id: "mem-ta", orgId: "org-ta-only", userId: "u-ta", role: "ta" },
			{
				id: "mem-other",
				orgId: "org-other",
				userId: "u-other",
				role: "teacher",
			},
			{ id: "mem-boss", orgId: "org-boss", userId: "u-boss", role: "owner" },
		]);

		await provisionStudentForUser(
			db,
			{ name: "Tier 1 Student", email: "tier1@example.com" },
			{ teacherEmails: ["  Boss@Example.Com  "] },
		);
		const [tier1Student] = await db
			.select()
			.from(schema.student)
			.where(eq(schema.student.email, "tier1@example.com"));
		expect(tier1Student?.orgId).toBe("org-boss");

		// Tier 2: không truyền teacherEmails → chọn org có active manager (bỏ qua org-empty và org-ta-only)
		await provisionStudentForUser(db, {
			name: "Tier 2 Student",
			email: "tier2@example.com",
		});
		const [tier2Student] = await db
			.select()
			.from(schema.student)
			.where(eq(schema.student.email, "tier2@example.com"));
		expect(tier2Student?.orgId).toBe("org-other");

		// Tier 3: khi xóa hết membership → fallback về earliest org (createdAt asc, id asc)
		await db.delete(schema.membership);
		await provisionStudentForUser(db, {
			name: "Tier 3 Student",
			email: "tier3@example.com",
		});
		const [tier3Student] = await db
			.select()
			.from(schema.student)
			.where(eq(schema.student.email, "tier3@example.com"));
		expect(tier3Student?.orgId).toBe("org-empty");
	});
});
