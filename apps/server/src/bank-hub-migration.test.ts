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

describe("bank hub migration 0034", () => {
	test("adds nullable payment columns to existing invoices with safe defaults", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0033_adorable_felicia_hardy.sql");

		await client.execute(
			"INSERT INTO organization (id, name) VALUES ('org-1', 'Academy')",
		);
		await client.execute(
			"INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES ('stu-1', 'org-1', 'Student 1', '0901', 's@example.com', '', 1000)",
		);
		await client.execute(
			"INSERT INTO invoice (id, org_id, student_id, amount, status, created_at) VALUES ('inv-1', 'org-1', 'stu-1', 500000, 'unpaid', 1000)",
		);

		await applyFile(client, migration("0034_"));

		const invoice = await client.execute(
			"SELECT payment_code, pay_token, paid_amount FROM invoice WHERE id = 'inv-1'",
		);
		expect(invoice.rows[0]).toEqual({
			payment_code: null,
			pay_token: null,
			paid_amount: 0,
		});

		// Many invoices share the NULL payment_code/pay_token — unique indexes
		// must treat NULLs as distinct.
		await client.execute(
			"INSERT INTO invoice (id, org_id, student_id, amount, status, created_at) VALUES ('inv-2', 'org-1', 'stu-1', 300000, 'unpaid', 1001)",
		);
		const count = await client.execute(
			"SELECT COUNT(*) AS n FROM invoice WHERE payment_code IS NULL",
		);
		expect(count.rows[0]?.n).toBe(2);
	});

	test("creates org_bank_link and payment_transaction with documented constraints", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0033_adorable_felicia_hardy.sql");
		await applyFile(client, migration("0034_"));

		await client.execute(
			"INSERT INTO organization (id, name) VALUES ('org-1', 'Academy')",
		);
		await client.execute(
			`INSERT INTO org_bank_link (org_id, company_xid, bank_account_xid, status) VALUES ('org-1', 'c-1', 'ba-1', 'linked')`,
		);

		// One row per org: org_id is the PK.
		await expect(
			client.execute(
				"INSERT INTO org_bank_link (org_id, company_xid) VALUES ('org-1', 'c-other')",
			),
		).rejects.toThrow();

		await client.execute(
			`INSERT INTO payment_transaction (id, org_id, provider_txn_id, amount, content, match_status)
			 VALUES ('pt-1', 'org-1', 'txn-1', 200000, 'TOS7K2M9QXA hoc phi', 'matched')`,
		);
		// UNIQUE(provider, provider_txn_id) — the idempotency key.
		await expect(
			client.execute(
				`INSERT INTO payment_transaction (id, org_id, provider_txn_id, amount, content, match_status)
				 VALUES ('pt-2', 'org-1', 'txn-1', 200000, 'TOS7K2M9QXA hoc phi', 'matched')`,
			),
		).rejects.toThrow();

		// Deleting the org cascades to both financial tables.
		await client.execute("DELETE FROM organization WHERE id = 'org-1'");
		const links = await client.execute(
			"SELECT COUNT(*) AS n FROM org_bank_link",
		);
		const txns = await client.execute(
			"SELECT COUNT(*) AS n FROM payment_transaction",
		);
		expect(links.rows[0]?.n).toBe(0);
		expect(txns.rows[0]?.n).toBe(0);
	});
});
