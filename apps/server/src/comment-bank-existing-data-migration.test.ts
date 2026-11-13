/**
 * Proves migration 0006 upgrades both empty and populated comment_bank.
 * Kernel tests migrate an empty database, so they cannot catch ADD NOT NULL
 * without a backfill.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
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

async function applyFile(
	client: ReturnType<typeof createClient>,
	fileName: string,
) {
	const sql = readFileSync(`${MIGRATIONS_DIR}/${fileName}`, "utf8");
	for (const statement of statements(sql)) {
		await client.execute(statement);
	}
}

async function applyThrough(
	client: ReturnType<typeof createClient>,
	maxInclusive: string,
) {
	for (const fileName of migrationFiles()) {
		if (fileName > maxInclusive) break;
		await applyFile(client, fileName);
	}
}

describe("comment_bank existing-data migration 0006", () => {
	test("empty comment_bank survives 0006 and unique index", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0006_pink_ender_wiggin.sql");

		const info = await client.execute("PRAGMA table_info(comment_bank)");
		expect(info.rows.some((row) => row.name === "operation_id")).toBe(true);

		const indexes = await client.execute("PRAGMA index_list(comment_bank)");
		expect(
			indexes.rows.some(
				(row) => row.name === "comment_bank_org_operation_uidx",
			),
		).toBe(true);

		const fk = await client.execute("PRAGMA foreign_key_check");
		expect(fk.rows).toEqual([]);
	});

	test("two comments in one org survive 0006 with unique operation_id from id", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0005_mature_sasquatch.sql");

		await client.execute(
			"INSERT INTO organization (id, name) VALUES ('org-fixture', 'fixture-org')",
		);
		await client.execute(
			"INSERT INTO comment_bank (id, org_id, tag, text) VALUES ('comment-a', 'org-fixture', 'chung', 'fixture-a')",
		);
		await client.execute(
			"INSERT INTO comment_bank (id, org_id, tag, text) VALUES ('comment-b', 'org-fixture', 'chung', 'fixture-b')",
		);

		await applyFile(client, "0006_pink_ender_wiggin.sql");

		const rows = await client.execute(
			"SELECT id, operation_id FROM comment_bank ORDER BY id",
		);
		expect(rows.rows).toEqual([
			{ id: "comment-a", operation_id: "comment-a" },
			{ id: "comment-b", operation_id: "comment-b" },
		]);

		const fk = await client.execute("PRAGMA foreign_key_check");
		expect(fk.rows).toEqual([]);
	});
});
