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

function migration(nameStart: string): string {
	const file = migrationFiles().find((name) => name.startsWith(nameStart));
	if (!file) throw new Error(`migration ${nameStart} not found`);
	return file;
}

describe("org_bank_link va_code migration 0100", () => {
	test("adds va_code column with empty default and allows shared va_code across orgs", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0099_daffy_gressill.sql");

		await client.execute(
			"INSERT INTO organization (id, name, created_at) VALUES ('org-1', 'Academy 1', 1000)",
		);
		await client.execute(
			"INSERT INTO organization (id, name, created_at) VALUES ('org-2', 'Academy 2', 1000)",
		);
		await client.execute(
			"INSERT INTO org_bank_link (org_id, status, account_number) VALUES ('org-1', 'linked', '0123456789')",
		);

		await applyFile(client, migration("0100_"));

		const existing = await client.execute(
			"SELECT va_code FROM org_bank_link WHERE org_id = 'org-1'",
		);
		expect(existing.rows[0]?.va_code).toBe("");

		await client.execute(
			"UPDATE org_bank_link SET va_code = 'MMY' WHERE org_id = 'org-1'",
		);
		await client.execute(
			"INSERT INTO org_bank_link (org_id, status, account_number, va_code) VALUES ('org-2', 'linked', '9876543210', 'MMY')",
		);

		const count = await client.execute(
			"SELECT COUNT(*) AS n FROM org_bank_link WHERE va_code = 'MMY'",
		);
		expect(count.rows[0]?.n).toBe(2);
	});
});
