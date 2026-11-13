import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Client, createClient } from "@libsql/client";
import { describe, expect, test } from "vitest";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url).href,
);

function migrationFiles(): string[] {
	return readdirSync(MIGRATIONS_DIR)
		.filter((name) => /^\d{4}_.+\.sql$/.test(name))
		.sort();
}

function statements(sql: string): string[] {
	return sql
		.split("--> statement-breakpoint")
		.map((part) => part.trim())
		.filter(Boolean);
}

async function applyFile(client: Client, fileName: string) {
	const sql = readFileSync(`${MIGRATIONS_DIR}/${fileName}`, "utf8");
	for (const statement of statements(sql)) {
		await client.execute(statement);
	}
}

async function applyThrough(client: Client, maxInclusive: string) {
	for (const fileName of migrationFiles()) {
		if (fileName > maxInclusive) break;
		await applyFile(client, fileName);
	}
}

function first0024(): string {
	const file = migrationFiles().find((name) => name.startsWith("0024_"));
	if (!file) throw new Error("migration 0024 not found");
	return file;
}

async function seedUser(
	client: Client,
	id: string,
	email: string,
	createdAt = 1000,
) {
	await client.execute({
		sql: "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
		args: [id, `User ${id}`, email, createdAt, createdAt],
	});
}

async function seedOrg(client: Client, id = "org-1") {
	await client.execute({
		sql: "INSERT INTO organization (id, name) VALUES (?, 'Academy 1')",
		args: [id],
	});
}

async function seedMembership(
	client: Client,
	id: string,
	userId: string,
	createdAt = 1000,
) {
	await client.execute({
		sql: "INSERT INTO membership (id, org_id, user_id, role, created_at) VALUES (?, 'org-1', ?, 'teacher', ?)",
		args: [id, userId, createdAt],
	});
}

async function seedStudent(
	client: Client,
	id: string,
	email: string,
	createdAt = 1000,
) {
	await client.execute({
		sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES (?, 'org-1', ?, '', ?, '', ?)",
		args: [id, `Student ${id}`, email, createdAt, createdAt],
	});
}

async function applyBackfill(client: Client) {
	await applyFile(client, first0024());
}

async function roleOf(client: Client, userId: string) {
	const result = await client.execute({
		sql: "SELECT role FROM user WHERE id = ?",
		args: [userId],
	});
	return result.rows[0]?.role as string | null;
}

async function countNullRole(client: Client) {
	const result = await client.execute(
		"SELECT count(*) AS n FROM user WHERE role IS NULL",
	);
	return result.rows[0]?.n as number;
}

describe("user role backfill migration 0024", () => {
	test("membership-only user is classified teacher", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0023_special_inertia.sql");
		await seedOrg(client);
		await seedUser(client, "u-teacher", "teacher@example.com");
		await seedMembership(client, "m-1", "u-teacher", 1500);

		await applyBackfill(client);

		expect(await roleOf(client, "u-teacher")).toBe("teacher");
	});

	test("overlap: membership created before student row wins teacher (teacher who tested portal)", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0023_special_inertia.sql");
		await seedOrg(client);
		await seedUser(client, "u-1", "overlap@example.com", 1000);
		await seedMembership(client, "m-1", "u-1", 2000);
		await seedStudent(client, "stu-1", "overlap@example.com", 3000);

		await applyBackfill(client);

		expect(await roleOf(client, "u-1")).toBe("teacher");
	});

	test("overlap: student row created before membership wins student (student who opened teacher app)", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0023_special_inertia.sql");
		await seedOrg(client);
		await seedUser(client, "u-2", "leak@example.com", 1000);
		await seedMembership(client, "m-1", "u-2", 3000);
		await seedStudent(client, "stu-1", "leak@example.com", 2000);

		await applyBackfill(client);

		expect(await roleOf(client, "u-2")).toBe("student");
	});

	test("overlap: tied created_at is deterministically teacher", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0023_special_inertia.sql");
		await seedOrg(client);
		await seedUser(client, "u-3", "tie@example.com", 1000);
		await seedMembership(client, "m-1", "u-3", 2500);
		await seedStudent(client, "stu-1", "tie@example.com", 2500);

		await applyBackfill(client);

		expect(await roleOf(client, "u-3")).toBe("teacher");
	});

	test("student-row-only and no-trace users fall back to student", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0023_special_inertia.sql");
		await seedOrg(client);
		// Student row only (portal signup, email matches)
		await seedUser(client, "u-stu", "student@example.com", 1000);
		await seedStudent(client, "stu-1", "student@example.com", 1500);
		// Student row with case/whitespace variant email still matches
		await seedUser(client, "u-case", "Case@Example.com", 1000);
		await seedStudent(client, "stu-2", "case@example.com", 1500);
		// No trace at all
		await seedUser(client, "u-none", "unused@example.com", 1000);

		await applyBackfill(client);

		expect(await roleOf(client, "u-stu")).toBe("student");
		expect(await roleOf(client, "u-case")).toBe("student");
		expect(await roleOf(client, "u-none")).toBe("student");
	});

	test("after migration no user row has NULL role", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0023_special_inertia.sql");
		await seedOrg(client);
		await seedUser(client, "u-1", "a@example.com");
		await seedMembership(client, "m-1", "u-1", 1500);
		await seedUser(client, "u-2", "b@example.com");
		await seedStudent(client, "stu-1", "b@example.com", 1500);
		await seedUser(client, "u-3", "c@example.com");

		await applyBackfill(client);

		expect(await countNullRole(client)).toBe(0);
	});
});
