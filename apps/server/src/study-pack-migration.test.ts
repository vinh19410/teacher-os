import { readdirSync, readFileSync } from "node:fs";
import { type Client, createClient } from "@libsql/client";
import {
	assignStudyPackSchema,
	libraryExerciseCreateSchema,
	MAX_PACK_DAYS,
	MAX_PACK_ITEMS_PER_DAY,
	MAX_PACK_TOTAL_ITEMS,
	studyPackCreateSchema,
} from "@teacher-os/api/contracts";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { describe, expect, test } from "vitest";
import { buildApp, type Db } from "./app";

const MIGRATIONS_DIR = new URL(
	"../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

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

async function applyMigrationsUpTo(client: Client, maxPrefix: string) {
	for (const fileName of migrationFiles()) {
		if (fileName > maxPrefix) break;
		const sql = readFileSync(`${MIGRATIONS_DIR}/${fileName}`, "utf8");
		for (const statement of statements(sql)) {
			await client.execute(statement);
		}
	}
}

async function applySingleMigration(client: Client, fileName: string) {
	const sql = readFileSync(`${MIGRATIONS_DIR}/${fileName}`, "utf8");
	for (const statement of statements(sql)) {
		await client.execute(statement);
	}
}

describe("0060_study_pack.sql migration & /readyz (#533)", () => {
	test("nâng cấp từ 0059 sang 0060 không mất class_assignment & quiz_attempt, dọn sạch #526 và pass /readyz", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyMigrationsUpTo(client, "0059_self_study_plan.sql");

		const nowMs = Date.now();
		await client.execute({
			sql: "INSERT INTO organization (id, name, created_at) VALUES (?, ?, ?)",
			args: ["org-1", "Trung tâm A", nowMs],
		});
		await client.execute({
			sql: "INSERT INTO class (id, org_id, name, created_at) VALUES (?, ?, ?, ?)",
			args: ["cls-1", "org-1", "IELTS 6.5", nowMs],
		});
		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, created_at) VALUES (?, ?, ?, ?)",
			args: ["stu-1", "org-1", "Nguyễn Văn A", nowMs],
		});
		await client.execute({
			sql: "INSERT INTO assignment_prompt (id, org_id, task, genre, skill, part, type, title, band, prompt, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			args: [
				"prm-1",
				"org-1",
				"task2",
				"",
				"reading",
				"p1",
				"tfng",
				"Reading P1",
				"7.0",
				"",
				"ready",
				nowMs,
			],
		});
		await client.execute({
			sql: "INSERT INTO self_study_plan (id, org_id, class_id, title, start_date, end_date, release_time, due_time, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			args: [
				"ssp-1",
				"org-1",
				"cls-1",
				"Kế hoạch cũ",
				"2026-11-01",
				"2026-11-10",
				"06:00",
				"17:00",
				"published",
				nowMs,
				nowMs,
			],
		});
		await client.execute({
			sql: "INSERT INTO self_study_plan_day (id, org_id, plan_id, date, release_at, due_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
			args: [
				"sspd-1",
				"org-1",
				"ssp-1",
				"2026-11-01",
				nowMs,
				nowMs + 3600_000,
				"released",
			],
		});
		await client.execute({
			sql: "INSERT INTO self_study_plan_item (id, org_id, plan_id, date, prompt_id, position, note) VALUES (?, ?, ?, ?, ?, ?, ?)",
			args: ["sspi-1", "org-1", "ssp-1", "2026-11-01", "prm-1", 0, ""],
		});
		await client.execute({
			sql: "INSERT INTO class_assignment (id, org_id, class_id, prompt_id, title, due, note, due_at, plan_item_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			args: [
				"ca-1",
				"org-1",
				"cls-1",
				"prm-1",
				"Reading P1",
				"2026-11-01",
				"",
				nowMs + 3600_000,
				"sspi-1",
				nowMs,
			],
		});
		await client.execute({
			sql: "INSERT INTO quiz_attempt (id, org_id, assignment_id, student_id, mode, status, answers, questions_snapshot, correct_count, started_at, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			args: [
				"att-1",
				"org-1",
				"ca-1",
				"stu-1",
				"assignment",
				"submitted",
				'{"0":"TRUE"}',
				'[{"stem":"Q1","opts":null,"answer":"TRUE","alts":""}]',
				1,
				nowMs - 60_000,
				nowMs,
			],
		});
		await client.execute({
			sql: "INSERT INTO notification_record (id, org_id, student_id, event_type, event_group, idempotency_key, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
			args: [
				"notif-old-ssp",
				"org-1",
				"stu-1",
				"self_study_released",
				"assignment",
				"self_study_released:sspd-1:stu-1",
				"Bài tự học",
				"Nội dung",
				nowMs,
			],
		});
		await client.execute({
			sql: "INSERT INTO notification_record (id, org_id, student_id, event_type, event_group, idempotency_key, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
			args: [
				"notif-keep",
				"org-1",
				"stu-1",
				"assignment_published",
				"assignment",
				"assignment_published:ca-1:stu-1",
				"Bài tập mới",
				"Nội dung",
				nowMs,
			],
		});

		await applySingleMigration(client, "0060_study_pack.sql");

		const removedTables = await client.execute(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('self_study_plan', 'self_study_plan_day', 'self_study_plan_item')",
		);
		expect(removedTables.rows).toHaveLength(0);

		const createdTables = await client.execute(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('study_pack_exercise', 'study_pack', 'study_pack_item', 'class_study_pack')",
		);
		expect(createdTables.rows).toHaveLength(4);

		const caCols = await client.execute(
			"SELECT name FROM pragma_table_info('class_assignment')",
		);
		const caColNames = caCols.rows.map((r) => String(r.name));
		expect(caColNames).not.toContain("plan_item_id");
		expect(caColNames).toContain("available_at");
		expect(caColNames).toContain("class_study_pack_id");

		const apCols = await client.execute(
			"SELECT name FROM pragma_table_info('assignment_prompt')",
		);
		const apColNames = apCols.rows.map((r) => String(r.name));
		expect(apColNames).toContain("library_ref");

		const assignments = await client.execute(
			"SELECT id, title, due_at, available_at, class_study_pack_id FROM class_assignment WHERE id = 'ca-1'",
		);
		expect(assignments.rows).toHaveLength(1);
		expect(assignments.rows[0]?.title).toBe("Reading P1");

		const attempts = await client.execute(
			"SELECT id, correct_count FROM quiz_attempt WHERE id = 'att-1'",
		);
		expect(attempts.rows).toHaveLength(1);
		expect(Number(attempts.rows[0]?.correct_count)).toBe(1);

		const notifs = await client.execute(
			"SELECT id, event_type FROM notification_record",
		);
		expect(notifs.rows).toHaveLength(1);
		expect(notifs.rows[0]?.id).toBe("notif-keep");

		const libsql = drizzle(client, { schema });
		const app = buildApp({
			getDb: () => libsql as unknown as Db,
			corsOrigin: "http://localhost:8001",
			getSessionUser: async () => null,
			authHandler: () => new Response("auth stub", { status: 404 }),
		});
		const readyRes = await app.request("/readyz", {
			headers: { origin: "http://localhost:8001" },
		});
		expect(readyRes.status).toBe(200);
		expect(await readyRes.json()).toEqual({ ok: true });
	});
});

describe("Study Pack & Library Exercise Zod contracts (#533)", () => {
	test("từ chối dayIndex ngoài khoảng 1..366, quá 10 bài/ngày, quá 200 bài/pack, trùng bài trong cùng ngày, hoặc pack ready rỗng", () => {
		expect(
			studyPackCreateSchema.safeParse({
				title: "Pack rỗng nhưng ready",
				status: "ready",
				items: [],
			}).success,
		).toBe(false);

		expect(
			studyPackCreateSchema.safeParse({
				title: "Pack nháp rỗng hợp lệ",
				status: "draft",
				items: [],
			}).success,
		).toBe(true);

		expect(
			studyPackCreateSchema.safeParse({
				title: "Day 0",
				status: "draft",
				items: [{ dayIndex: 0, sourceKind: "org_prompt", sourceId: "p-1" }],
			}).success,
		).toBe(false);

		expect(
			studyPackCreateSchema.safeParse({
				title: "Day 367",
				status: "draft",
				items: [
					{
						dayIndex: MAX_PACK_DAYS + 1,
						sourceKind: "org_prompt",
						sourceId: "p-1",
					},
				],
			}).success,
		).toBe(false);

		expect(
			studyPackCreateSchema.safeParse({
				title: "Trùng bài trong cùng ngày",
				status: "ready",
				items: [
					{ dayIndex: 1, sourceKind: "org_prompt", sourceId: "p-1" },
					{ dayIndex: 1, sourceKind: "org_prompt", sourceId: "p-1" },
				],
			}).success,
		).toBe(false);

		const elevenInOneDay = Array.from(
			{ length: MAX_PACK_ITEMS_PER_DAY + 1 },
			(_, idx) => ({
				dayIndex: 1,
				sourceKind: "org_prompt" as const,
				sourceId: `p-${idx + 1}`,
			}),
		);
		expect(
			studyPackCreateSchema.safeParse({
				title: "Quá 10 bài/ngày",
				status: "ready",
				items: elevenInOneDay,
			}).success,
		).toBe(false);

		const overTotalItems = Array.from(
			{ length: MAX_PACK_TOTAL_ITEMS + 1 },
			(_, idx) => ({
				dayIndex: Math.floor(idx / 5) + 1,
				sourceKind: "org_prompt" as const,
				sourceId: `p-${idx + 1}`,
			}),
		);
		expect(
			studyPackCreateSchema.safeParse({
				title: "Quá 200 bài/pack",
				status: "ready",
				items: overTotalItems,
			}).success,
		).toBe(false);
	});

	test("assignStudyPackSchema kiểm tra startDate hợp lệ và dueTime > releaseTime", () => {
		expect(
			assignStudyPackSchema.safeParse({
				packId: "pack-1",
				startDate: "2026-11-02",
				releaseTime: "06:00",
				dueTime: "17:00",
			}).success,
		).toBe(true);

		expect(
			assignStudyPackSchema.safeParse({
				packId: "pack-1",
				startDate: "2026-11-02",
				releaseTime: "17:00",
				dueTime: "17:00",
			}).success,
		).toBe(false);

		expect(
			assignStudyPackSchema.safeParse({
				packId: "pack-1",
				startDate: "2026-02-30",
			}).success,
		).toBe(false);
	});

	test("libraryExerciseCreateSchema kiểm tra skill và câu hỏi hợp lệ", () => {
		expect(
			libraryExerciseCreateSchema.safeParse({
				skill: "grammar",
				part: "g1",
				type: "gap",
				title: "B2 Grammar Gap",
				status: "ready",
				questions: [
					{
						stem: "She ____ already finished her homework.",
						opts: null,
						answer: "has",
						alts: "",
					},
				],
			}).success,
		).toBe(true);

		expect(
			libraryExerciseCreateSchema.safeParse({
				skill: "writing",
				part: "task2",
				type: "discuss",
				title: "Invalid skill for library exercise",
				status: "ready",
				questions: [],
			}).success,
		).toBe(false);
	});
});
