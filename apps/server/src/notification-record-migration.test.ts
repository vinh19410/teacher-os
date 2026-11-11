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

async function applyAll(client: Client) {
	for (const fileName of migrationFiles()) {
		const sql = readFileSync(`${MIGRATIONS_DIR}/${fileName}`, "utf8");
		for (const statement of statements(sql)) {
			await client.execute(statement);
		}
	}
}

describe("notification_record migration 0047", () => {
	test("tạo bảng notification_record với unique + index", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyAll(client);

		const tables = await client.execute(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'notification_record'",
		);
		expect(tables.rows).toHaveLength(1);

		const indexes = await client.execute(
			"SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'notification_record' AND name IS NOT NULL",
		);
		const names = indexes.rows.map((row) => String(row.name));
		// Unique (org_id, idempotency_key) + 2 index tra cứu
		expect(names.some((name) => name.includes("idempotency"))).toBe(true);
		expect(names.some((name) => name.includes("created"))).toBe(true);
		expect(names.some((name) => name.includes("student"))).toBe(true);
	});

	test("insert trùng (org_id, idempotency_key) bị bỏ qua với onConflictDoNothing", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyAll(client);

		await client.execute(
			"INSERT INTO organization (id, name) VALUES ('org-1', 'Academy 1')",
		);
		await client.execute(
			"INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES ('stu-1', 'org-1', 'Student 1', '0901', '', '', 1000)",
		);

		const insert = `INSERT INTO notification_record
			(id, org_id, student_id, event_type, event_group, idempotency_key, title, body, link_path, ref_type, ref_id, channels, recipient_email, sender_name, reply_to_email, status, retry_count, last_error, sent_at, read_at, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT DO NOTHING`;

		await client.execute({
			sql: insert,
			args: [
				"n-1",
				"org-1",
				"stu-1",
				"grade_returned",
				"assignment",
				"grade:task-1",
				"Bài đã chấm",
				"Nội dung",
				"/classes/c-1",
				"class_assignment",
				"task-1",
				"email,in_app",
				"stu@example.com",
				"Ms My",
				"reply@example.com",
				"sent",
				0,
				null,
				1000,
				null,
				2000,
			],
		});
		await client.execute({
			sql: insert,
			args: [
				"n-2",
				"org-1",
				"stu-1",
				"grade_returned",
				"assignment",
				"grade:task-1",
				"Bài đã chấm",
				"Nội dung",
				"/classes/c-1",
				"class_assignment",
				"task-1",
				"in_app",
				"stu@example.com",
				"Ms My",
				"reply@example.com",
				"queued",
				0,
				null,
				null,
				null,
				3000,
			],
		});

		const rows = await client.execute(
			"SELECT id FROM notification_record WHERE org_id = 'org-1' AND idempotency_key = 'grade:task-1'",
		);
		expect(rows.rows).toHaveLength(1);
		expect(String(rows.rows[0]?.id)).toBe("n-1");
	});

	test("xóa org cascade xóa notification_record", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyAll(client);

		await client.execute(
			"INSERT INTO organization (id, name) VALUES ('org-1', 'Academy 1')",
		);
		await client.execute(
			"INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES ('stu-1', 'org-1', 'Student 1', '0901', '', '', 1000)",
		);
		await client.execute(
			"INSERT INTO notification_record (id, org_id, student_id, event_type, event_group, idempotency_key, title, body, channels, status, retry_count, created_at) VALUES ('n-1', 'org-1', 'stu-1', 'class_enrolled', 'class_invite', 'k-1', 'T', 'B', 'in_app', 'queued', 0, 1000)",
		);

		await client.execute("PRAGMA foreign_keys = ON");
		await client.execute("DELETE FROM organization WHERE id = 'org-1'");

		const rows = await client.execute("SELECT id FROM notification_record");
		expect(rows.rows).toHaveLength(0);
	});
});
