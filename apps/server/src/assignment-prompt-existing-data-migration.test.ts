/**
 * Proves migration 0019 backfills canonical v5 identifiers for existing
 * Writing rows instead of only passing on an empty database.
 */
import { readdirSync, readFileSync } from "node:fs";
import { type Client, createClient } from "@libsql/client";
import { describe, expect, test } from "vitest";

const MIGRATIONS_DIR = new URL(
	"../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

function statements(sql: string): string[] {
	return sql
		.split("--> statement-breakpoint")
		.map((part) => part.trim())
		.filter(Boolean);
}

async function applyThrough(client: Client, maxInclusive: string) {
	const files = readdirSync(MIGRATIONS_DIR)
		.filter((name) => /^\d{4}_.+\.sql$/.test(name))
		.sort();
	for (const fileName of files) {
		if (fileName > maxInclusive) break;
		const sql = readFileSync(`${MIGRATIONS_DIR}/${fileName}`, "utf8");
		for (const statement of statements(sql)) await client.execute(statement);
	}
}

async function applyFile(client: Client, fileName: string) {
	const sql = readFileSync(`${MIGRATIONS_DIR}/${fileName}`, "utf8");
	for (const statement of statements(sql)) await client.execute(statement);
}

describe("assignment_prompt existing-data migration 0019", () => {
	test("backfills Writing skill, part, and type for existing rows", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0018_glorious_agent_brand.sql");
		await client.execute(
			"INSERT INTO organization (id, name) VALUES ('org-fixture', 'fixture-org')",
		);
		await client.execute(
			"INSERT INTO assignment_prompt (id, org_id, task, genre, title, prompt) VALUES ('prompt-fixture', 'org-fixture', 'task2', 'discuss', 'Legacy prompt', 'Write an essay.')",
		);

		await applyFile(client, "0019_solid_boomer.sql");
		const rows = await client.execute(
			"SELECT skill, part, type, questions FROM assignment_prompt WHERE id = 'prompt-fixture'",
		);
		expect(rows.rows).toEqual([
			{ skill: "writing", part: "task2", type: "discuss", questions: "[]" },
		]);
		const fk = await client.execute("PRAGMA foreign_key_check");
		expect(fk.rows).toEqual([]);
	});
});
