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

function first0023(): string {
	const file = migrationFiles().find((name) => name.startsWith("0023_"));
	if (!file) throw new Error("migration 0023 not found");
	return file;
}

describe("student email unique expression index migration 0023", () => {
	test("dedupes non-destructively, normalizes email to lower(trim), and enforces expression unique index", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0022_neat_quicksilver.sql");

		await client.execute(
			"INSERT INTO organization (id, name) VALUES ('org-1', 'Academy 1')",
		);

		// Seed:
		// 1. Two students with duplicate email
		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES ('stu-1', 'org-1', 'Student 1', '0901', 'dupe@example.com', '', 1000)",
		});
		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES ('stu-2', 'org-1', 'Student 2', '0902', 'dupe@example.com', '', 2000)",
		});

		// 2. Two students with case-variant email
		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES ('stu-3', 'org-1', 'Student 3', '0903', 'Anna@X.com', '', 3000)",
		});
		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES ('stu-4', 'org-1', 'Student 4', '0904', 'anna@x.com', '', 4000)",
		});

		// 3. One distinct student
		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES ('stu-5', 'org-1', 'Student 5', '0905', 'single@example.com', '', 5000)",
		});

		// Apply migration 0023
		await applyFile(client, first0023());

		const result = await client.execute(
			"SELECT id, email FROM student ORDER BY id ASC",
		);

		expect(result.rows).toHaveLength(5);

		const byId = Object.fromEntries(
			result.rows.map((r) => [r.id as string, r.email as string]),
		);

		// Oldest dupe retains normalized email, newer gets blanked
		expect(byId["stu-1"]).toBe("dupe@example.com");
		expect(byId["stu-2"]).toBe("");

		// Case-variant: oldest retains lowercased email, newer gets blanked
		expect(byId["stu-3"]).toBe("anna@x.com");
		expect(byId["stu-4"]).toBe("");

		// Single distinct email remains
		expect(byId["stu-5"]).toBe("single@example.com");

		// Enforce unique expression index:
		// Exact dupe fails
		await expect(
			client.execute({
				sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES ('stu-dupe-1', 'org-1', 'New', '', 'dupe@example.com', '', 6000)",
			}),
		).rejects.toThrow(/UNIQUE constraint failed/i);

		// Case variant dupe fails
		await expect(
			client.execute({
				sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES ('stu-dupe-2', 'org-1', 'New', '', 'DUPE@EXAMPLE.COM', '', 6000)",
			}),
		).rejects.toThrow(/UNIQUE constraint failed/i);

		// Trimmed variant dupe fails
		await expect(
			client.execute({
				sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES ('stu-dupe-3', 'org-1', 'New', '', '  dupe@example.com  ', '', 6000)",
			}),
		).rejects.toThrow(/UNIQUE constraint failed/i);

		// Empty string email succeeds (partial index ignores empty string)
		await expect(
			client.execute({
				sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES ('stu-blank-1', 'org-1', 'Blank', '', '', '', 7000)",
			}),
		).resolves.toBeDefined();
	});
});
