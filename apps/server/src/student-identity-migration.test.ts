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

function first0021(): string {
	const file = migrationFiles().find((name) => name.startsWith("0021_"));
	if (!file) throw new Error("migration 0021 not found");
	return file;
}

describe("student identity migration 0021", () => {
	test("adds email column with default empty string and normalizes legacy phone spaces and plus", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0020_awesome_champions.sql");

		await client.execute(
			"INSERT INTO organization (id, name) VALUES ('org-id-1', 'Org 1')",
		);
		await client.execute(
			"INSERT INTO student (id, org_id, name, phone, zalo) VALUES ('stu-1', 'org-id-1', 'Student 1', '0900 123 456', '0900123456')",
		);
		await client.execute(
			"INSERT INTO student (id, org_id, name, phone, zalo) VALUES ('stu-2', 'org-id-1', 'Student 2', ' +84901', '84901')",
		);

		await applyFile(client, first0021());

		const result = await client.execute(
			"SELECT id, phone, email FROM student ORDER BY id ASC",
		);

		expect(result.rows).toHaveLength(2);
		expect(result.rows[0]).toMatchObject({
			id: "stu-1",
			phone: "0900123456",
			email: "",
		});
		expect(result.rows[1]).toMatchObject({
			id: "stu-2",
			phone: "84901",
			email: "",
		});
	});
});
