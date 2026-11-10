import { type Client, createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";
import {
	auditOrphans,
	buildCleanupPlan,
	type ClassifiedRow,
	createD1AuditRunner,
	d1Query,
	reconcileSummary,
	redactSensitive,
	resolveChain,
	resolveD1DatabaseId,
	runCleanup,
	type SqlStatement,
} from "./orphan-materials";

const DDL = [
	"CREATE TABLE class (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, scheduling_mode TEXT NOT NULL DEFAULT 'auto')",
	`CREATE TABLE lesson_material (
		org_id TEXT NOT NULL,
		class_id TEXT NOT NULL,
		date TEXT NOT NULL,
		material_id TEXT NOT NULL,
		position INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL,
		PRIMARY KEY (class_id, date, material_id)
	)`,
	`CREATE TABLE holiday_session_shift (
		id TEXT PRIMARY KEY,
		org_id TEXT NOT NULL,
		holiday_id TEXT NOT NULL,
		class_id TEXT NOT NULL,
		original_date TEXT NOT NULL,
		makeup_date TEXT NOT NULL,
		created_at INTEGER NOT NULL
	)`,
	"CREATE UNIQUE INDEX shift_orig_uq ON holiday_session_shift (class_id, original_date)",
	"CREATE UNIQUE INDEX shift_makeup_uq ON holiday_session_shift (class_id, makeup_date)",
	`CREATE TABLE class_session (
		id TEXT PRIMARY KEY,
		org_id TEXT NOT NULL,
		class_id TEXT NOT NULL,
		date TEXT NOT NULL,
		time TEXT NOT NULL DEFAULT '19:00',
		dur INTEGER NOT NULL DEFAULT 90,
		topic TEXT NOT NULL DEFAULT '',
		zoom TEXT NOT NULL DEFAULT ''
	)`,
	`CREATE TABLE lesson (
		id TEXT PRIMARY KEY,
		org_id TEXT NOT NULL,
		class_id TEXT NOT NULL,
		enrollment_id TEXT NOT NULL,
		day INTEGER NOT NULL DEFAULT 1,
		time TEXT NOT NULL DEFAULT '19:00',
		dur INTEGER NOT NULL DEFAULT 90,
		date TEXT,
		type TEXT NOT NULL DEFAULT '1:1',
		status TEXT NOT NULL DEFAULT 'upcoming',
		topic TEXT NOT NULL DEFAULT '',
		zoom TEXT NOT NULL DEFAULT ''
	)`,
];

const ORG = "org-1";

async function makeDb(): Promise<Client> {
	const client = createClient({ url: ":memory:" });
	for (const ddl of DDL) {
		await client.execute(ddl);
	}
	return client;
}

interface FixtureSpec {
	lm: Array<{ classId: string; date: string; materialId: string }>;
	shifts: Array<{
		classId: string;
		originalDate: string;
		makeupDate: string;
	}>;
	classSessions: Array<{ classId: string; date: string }>;
	lessons: Array<{ classId: string; date: string; status: string }>;
}

async function seed(client: Client, spec: FixtureSpec): Promise<void> {
	const classes = new Set<string>();
	for (const row of spec.lm) {
		classes.add(row.classId);
	}
	for (const classId of classes) {
		await client.execute({
			sql: "INSERT INTO class (id, org_id, scheduling_mode) VALUES (?, ?, ?)",
			args: [classId, ORG, classId.startsWith("auto-") ? "auto" : "manual"],
		});
	}
	for (const [i, row] of spec.lm.entries()) {
		await client.execute({
			sql: "INSERT INTO lesson_material (org_id, class_id, date, material_id, position, created_at) VALUES (?, ?, ?, ?, 0, ?)",
			args: [ORG, row.classId, row.date, row.materialId, 1000 + i],
		});
	}
	for (const [i, row] of spec.shifts.entries()) {
		await client.execute({
			sql: "INSERT INTO holiday_session_shift (id, org_id, holiday_id, class_id, original_date, makeup_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			args: [
				`shift-${i}`,
				ORG,
				"holiday-1",
				row.classId,
				row.originalDate,
				row.makeupDate,
				2000 + i,
			],
		});
	}
	for (const [i, row] of spec.classSessions.entries()) {
		await client.execute({
			sql: "INSERT INTO class_session (id, org_id, class_id, date) VALUES (?, ?, ?, ?)",
			args: [`cs-${i}`, ORG, row.classId, row.date],
		});
	}
	for (const [i, row] of spec.lessons.entries()) {
		await client.execute({
			sql: "INSERT INTO lesson (id, org_id, class_id, enrollment_id, date, status) VALUES (?, ?, ?, 'enr-1', ?, ?)",
			args: [`lesson-${i}`, ORG, row.classId, row.date, row.status],
		});
	}
}

/** Fixture chuẩn theo plan: mirror dữ liệu thật — mồ côi manual có lesson
 * `holiday` ở ngày gốc (trạng thái tất yếu sau shift), buổi bù có lesson
 * `upcoming`.
 *
 * - c1: 2 mồ côi thuần (2026-01-05, 2026-01-07) + 1 dòng còn lesson
 *   `upcoming` ở gốc (2026-01-09, bị loại).
 * - c2: chain 2 nhịp 2026-02-02 → 2026-02-09 → 2026-02-16 (eligible).
 * - c3: chain loop 2026-03-02 → 2026-03-09 → 2026-03-02 (loại).
 * - auto-c4: không class_session ở gốc (auto_review). */
function baseSpec(): FixtureSpec {
	return {
		lm: [
			{ classId: "c1", date: "2026-01-05", materialId: "m1" },
			{ classId: "c1", date: "2026-01-07", materialId: "m2" },
			{ classId: "c1", date: "2026-01-09", materialId: "m3" },
			{ classId: "c2", date: "2026-02-02", materialId: "m4" },
			{ classId: "c3", date: "2026-03-02", materialId: "m5" },
			{ classId: "auto-c4", date: "2026-04-02", materialId: "m6" },
		],
		shifts: [
			{ classId: "c1", originalDate: "2026-01-05", makeupDate: "2026-01-12" },
			{ classId: "c1", originalDate: "2026-01-07", makeupDate: "2026-01-14" },
			{ classId: "c1", originalDate: "2026-01-09", makeupDate: "2026-01-16" },
			{ classId: "c2", originalDate: "2026-02-02", makeupDate: "2026-02-09" },
			{ classId: "c2", originalDate: "2026-02-09", makeupDate: "2026-02-16" },
			{ classId: "c3", originalDate: "2026-03-02", makeupDate: "2026-03-09" },
			{ classId: "c3", originalDate: "2026-03-09", makeupDate: "2026-03-02" },
			{
				classId: "auto-c4",
				originalDate: "2026-04-02",
				makeupDate: "2026-04-09",
			},
		],
		classSessions: [
			{ classId: "c1", date: "2026-01-05" },
			{ classId: "c1", date: "2026-01-07" },
			{ classId: "c1", date: "2026-01-09" },
			{ classId: "c2", date: "2026-02-02" },
			{ classId: "c3", date: "2026-03-02" },
		],
		lessons: [
			{ classId: "c1", date: "2026-01-05", status: "holiday" },
			{ classId: "c1", date: "2026-01-12", status: "upcoming" },
			{ classId: "c1", date: "2026-01-07", status: "holiday" },
			{ classId: "c1", date: "2026-01-14", status: "upcoming" },
			{ classId: "c1", date: "2026-01-09", status: "holiday" },
			{ classId: "c1", date: "2026-01-09", status: "upcoming" },
			{ classId: "c2", date: "2026-02-02", status: "holiday" },
			{ classId: "c2", date: "2026-02-09", status: "holiday" },
			{ classId: "c2", date: "2026-02-16", status: "upcoming" },
			{ classId: "c3", date: "2026-03-02", status: "holiday" },
			{ classId: "c3", date: "2026-03-09", status: "holiday" },
			{ classId: "auto-c4", date: "2026-04-02", status: "holiday" },
			{ classId: "auto-c4", date: "2026-04-09", status: "upcoming" },
		],
	};
}

async function classifyFixture(client: Client) {
	return auditOrphans(client);
}

function findByMaterial(rows: ClassifiedRow[], mid: string): ClassifiedRow {
	const row = rows.find((r) => r.materialId === mid);
	if (!row) throw new Error(`fixture row ${mid} missing`);
	return row;
}

describe("auditOrphans", () => {
	it("phân loại manual/auto status-aware và loại đúng dòng không join shift", async () => {
		const client = await makeDb();
		const spec = baseSpec();
		spec.lm.push({ classId: "c1", date: "2026-01-20", materialId: "m9" });
		await seed(client, spec);
		const { rows, summary } = await auditOrphans(client);
		expect(rows).toHaveLength(6);
		const m1 = findByMaterial(rows, "m1");
		expect(m1.hasClassSession).toBe(1);
		expect(m1.activeLessonAtDate).toBe(0);
		expect(m1.schedulingMode).toBe("manual");
		expect(m1.lmCreatedAt).toBe(1000);
		const m6 = findByMaterial(rows, "m6");
		expect(m6.hasClassSession).toBe(0);
		expect(m6.schedulingMode).toBe("auto");
		expect(summary.total).toBe(6);
	});

	it("dest_conflict_same_material đúng 0/1 khi makeup đã có cùng materialId", async () => {
		const client = await makeDb();
		const spec = baseSpec();
		spec.lm.push({ classId: "c1", date: "2026-01-12", materialId: "m1" });
		await seed(client, spec);
		const { rows } = await auditOrphans(client);
		const m1 = findByMaterial(
			rows.filter((r) => r.date === "2026-01-05"),
			"m1",
		);
		expect(m1.destConflictSameMaterial).toBe(1);
		const m2 = findByMaterial(rows, "m2");
		expect(m2.destConflictSameMaterial).toBe(0);
	});
});

describe("resolveChain", () => {
	it("chain 2 nhịp về terminal đúng; loop trả ok=false", async () => {
		const client = await makeDb();
		await seed(client, baseSpec());
		const { shifts } = await auditOrphans(client);
		const chainHead = resolveChain(shifts, "c2", "2026-02-02");
		expect(chainHead.ok).toBe(true);
		expect(chainHead.terminal).toBe("2026-02-16");
		const chainMid = resolveChain(shifts, "c2", "2026-02-09");
		expect(chainMid.terminal).toBe("2026-02-16");
		const loop = resolveChain(shifts, "c3", "2026-03-02");
		expect(loop.ok).toBe(false);
	});
});

describe("classifyRows", () => {
	it("gán disposition đúng cho mọi nhánh loại + reconciliation khớp", async () => {
		const client = await makeDb();
		await seed(client, baseSpec());
		const { rows, summary } = await classifyFixture(client);
		expect(findByMaterial(rows, "m1").disposition).toBe("cleanup_eligible");
		expect(findByMaterial(rows, "m2").disposition).toBe("cleanup_eligible");
		expect(findByMaterial(rows, "m3").disposition).toBe(
			"active_lesson_at_date",
		);
		const m4 = findByMaterial(rows, "m4");
		expect(m4.disposition).toBe("cleanup_eligible");
		expect(m4.chainTerminal).toBe("2026-02-16");
		expect(findByMaterial(rows, "m5").disposition).toBe("chain_loop");
		expect(findByMaterial(rows, "m6").disposition).toBe("auto_review");
		expect(summary.manualTotal).toBe(5);
		expect(summary.cleanupEligible).toBe(3);
		expect(summary.autoTotal).toBe(1);
		expect(summary.manualBySchedulingMode.manual).toBe(5);
		expect(summary.reconcileOk).toBe(true);
		expect(reconcileSummary(summary)).toBe(true);
	});

	it("summary lệch bất biến → reconcileSummary trả false (gate F7)", () => {
		const mismatched = {
			total: 6,
			manualTotal: 5,
			autoTotal: 1,
			cleanupEligible: 3,
			excluded: {
				auto_review: 1,
				active_lesson_at_date: 0,
				chain_loop: 0,
				dest_no_active_session: 0,
			},
			manualBySchedulingMode: { manual: 5 },
			reconcileOk: false,
		};
		expect(reconcileSummary(mismatched)).toBe(false);
	});

	it("đích không có buổi dạy thật (chỉ lesson holiday) → dest_no_active_session", async () => {
		const client = await makeDb();
		const spec = baseSpec();
		// c1: mồ côi 2026-01-05 có makeup 2026-01-12 nhưng bỏ lesson upcoming ở đích.
		spec.lessons = spec.lessons.filter(
			(l) => !(l.classId === "c1" && l.date === "2026-01-12"),
		);
		await seed(client, spec);
		const { rows } = await classifyFixture(client);
		expect(findByMaterial(rows, "m1").disposition).toBe(
			"dest_no_active_session",
		);
	});
});

describe("buildCleanupPlan + runCleanup", () => {
	it("chỉ group eligible; statement 1 là DELETE live-subquery, statement 2 UPDATE đúng thứ tự", async () => {
		const client = await makeDb();
		await seed(client, baseSpec());
		const { rows } = await classifyFixture(client);
		const plan = buildCleanupPlan(rows);
		expect(plan.groups).toHaveLength(3);
		const group1 = plan.groups.find((g) => g.originalDate === "2026-01-05");
		expect(group1?.terminalDate).toBe("2026-01-12");
		expect(group1?.statements[0]?.sql).toContain("IN (SELECT");
		expect(group1?.statements[0]?.sql).toContain("DELETE FROM lesson_material");
		expect(
			group1?.statements[1]?.sql.startsWith("UPDATE lesson_material"),
		).toBe(true);
	});

	it("move đúng dòng ở gốc sang terminal; single-use: replay cùng plan throw", async () => {
		const client = await makeDb();
		await seed(client, baseSpec());
		const plan = buildCleanupPlan((await classifyFixture(client)).rows);
		await runCleanup(client, plan);
		const after = await client.execute(
			"SELECT class_id, date, material_id FROM lesson_material ORDER BY material_id, date",
		);
		const positions = after.rows.map(
			(r) => `${String(r.material_id)}@${String(r.date)}`,
		);
		expect(positions).toContain("m1@2026-01-12");
		expect(positions).toContain("m2@2026-01-14");
		expect(positions).toContain("m4@2026-02-16");
		expect(positions).toContain("m3@2026-01-09");
		expect(positions).toContain("m5@2026-03-02");
		expect(positions).toContain("m6@2026-04-02");
		expect(after.rows).toHaveLength(6);
		await expect(runCleanup(client, plan)).rejects.toThrow();
		const plan2 = buildCleanupPlan((await classifyFixture(client)).rows);
		expect(plan2.groups).toHaveLength(0);
	});

	it("trùng materialId ở makeup: move thắng, chỉ còn 1 dòng ở đích", async () => {
		const client = await makeDb();
		const spec = baseSpec();
		spec.lm.push({ classId: "c1", date: "2026-01-12", materialId: "m1" });
		await seed(client, spec);
		const plan = buildCleanupPlan((await classifyFixture(client)).rows);
		await runCleanup(client, plan);
		const after = await client.execute(
			"SELECT date FROM lesson_material WHERE class_id = 'c1' AND material_id = 'm1'",
		);
		expect(after.rows).toHaveLength(1);
		expect(String(after.rows[0]?.date)).toBe("2026-01-12");
	});

	it("partial failure giữa chừng: chạy lại với audit tươi hội tụ, không mất dòng", async () => {
		const client = await makeDb();
		await seed(client, baseSpec());
		const plan = buildCleanupPlan((await classifyFixture(client)).rows);
		const failing = new SequentialFailingRunner(client, 2);
		await expect(runCleanup(failing, plan)).rejects.toThrow();
		const plan2 = buildCleanupPlan((await classifyFixture(client)).rows);
		await runCleanup(client, plan2);
		const count = await client.execute(
			"SELECT count(*) AS n FROM lesson_material",
		);
		expect(Number(count.rows[0]?.n)).toBe(6);
		const m4 = await client.execute(
			"SELECT date FROM lesson_material WHERE material_id = 'm4'",
		);
		expect(String(m4.rows[0]?.date)).toBe("2026-02-16");
	});

	it("dòng auto và dòng có lesson upcoming ở gốc không bị move", async () => {
		const client = await makeDb();
		await seed(client, baseSpec());
		const plan = buildCleanupPlan((await classifyFixture(client)).rows);
		await runCleanup(client, plan);
		const m3 = await client.execute(
			"SELECT date FROM lesson_material WHERE material_id = 'm3'",
		);
		expect(String(m3.rows[0]?.date)).toBe("2026-01-09");
		const m6 = await client.execute(
			"SELECT date FROM lesson_material WHERE material_id = 'm6'",
		);
		expect(String(m6.rows[0]?.date)).toBe("2026-04-02");
	});
});

/** Runner tuần tự cho test partial failure: chạy từng statement, throw ở
 * statement thứ `failAt` (đếm trên toàn run). */
class SequentialFailingRunner {
	private count = 0;
	constructor(
		private readonly client: Client,
		private readonly failAt: number,
	) {}
	async run(statements: SqlStatement[]): Promise<void> {
		for (const statement of statements) {
			if (this.count === this.failAt) {
				throw new Error("simulated network failure");
			}
			this.count += 1;
			await this.client.execute({
				sql: statement.sql,
				args: statement.args as never[],
			});
		}
	}
	async queryRows(sql: string): Promise<Array<Record<string, unknown>>> {
		const res = await this.client.execute(sql);
		return res.rows.map((r) => ({ ...(r as Record<string, unknown>) }));
	}
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status });
}

function d1Uuid(index: number): string {
	return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function d1ListResponse(
	names: string[],
	extra?: { totalCount?: number; totalPages?: number },
	uuidOffset = 0,
) {
	return {
		success: true,
		result: names.map((name, i) => ({
			uuid: d1Uuid(uuidOffset + i),
			name,
		})),
		result_info: {
			total_count: extra?.totalCount ?? names.length,
			total_pages: extra?.totalPages ?? 1,
		},
	};
}

const D1_BASE = { accountId: "acc", apiToken: "tok" } as const;

describe("resolveD1DatabaseId", () => {
	it("staging đúng 1 match → trả uuid; stage lạ → throw fail-closed", async () => {
		const fetchImpl = (async () =>
			jsonResponse(
				d1ListResponse(["teacher-os-database-staging-abcdefghijklmnop"]),
			)) as typeof fetch;
		const id = await resolveD1DatabaseId({
			...D1_BASE,
			stage: "staging",
			fetchImpl,
		});
		expect(id).toBe(d1Uuid(0));
		await expect(
			resolveD1DatabaseId({ ...D1_BASE, stage: "dev", fetchImpl }),
		).rejects.toThrow(/staging|prod/);
	});

	it("0 match hoặc >1 match → throw exactly-1", async () => {
		const fetchNone = (async () =>
			jsonResponse(d1ListResponse([]))) as typeof fetch;
		await expect(
			resolveD1DatabaseId({
				...D1_BASE,
				stage: "staging",
				fetchImpl: fetchNone,
			}),
		).rejects.toThrow(/exactly 1/i);
		const fetchTwo = (async () =>
			jsonResponse(
				d1ListResponse([
					"teacher-os-database-staging-abcdefghijklmnop",
					"teacher-os-database-staging-qrstuv232456wxyz",
				]),
			)) as typeof fetch;
		await expect(
			resolveD1DatabaseId({
				...D1_BASE,
				stage: "staging",
				fetchImpl: fetchTwo,
			}),
		).rejects.toThrow(/exactly 1/i);
	});

	it("prod match prefix teacher-os-database-prod-; chỉ staging → throw", async () => {
		const fetchProd = (async () =>
			jsonResponse(
				d1ListResponse(["teacher-os-database-prod-pilot1"]),
			)) as typeof fetch;
		const id = await resolveD1DatabaseId({
			...D1_BASE,
			stage: "prod",
			fetchImpl: fetchProd,
		});
		expect(id).toBe(d1Uuid(0));
		const fetchStagingOnly = (async () =>
			jsonResponse(
				d1ListResponse(["teacher-os-database-staging-abcd2324"]),
			)) as typeof fetch;
		await expect(
			resolveD1DatabaseId({
				...D1_BASE,
				stage: "prod",
				fetchImpl: fetchStagingOnly,
			}),
		).rejects.toThrow(/exactly 1/i);
	});

	it("phân trang 2 page gộp đủ trước khi lọc exactly-1", async () => {
		const pages = [
			d1ListResponse(["teacher-os-database-staging-abcdefghijklmnop"], {
				totalCount: 2,
				totalPages: 2,
			}),
			d1ListResponse(
				["teacher-os-database-prod-aaaaaaaaaaaaaaaa"],
				{ totalCount: 2, totalPages: 2 },
				100,
			),
		];
		let call = 0;
		const fetchPaged = (async (url: RequestInfo | URL) => {
			const pageIndex = String(url).includes("page=2") ? 1 : 0;
			call += 1;
			return jsonResponse(pages[pageIndex]);
		}) as typeof fetch;
		const id = await resolveD1DatabaseId({
			...D1_BASE,
			stage: "prod",
			fetchImpl: fetchPaged,
		});
		expect(id).toBe(d1Uuid(100));
		expect(call).toBe(2);
	});
});

describe("d1Query + redactSensitive", () => {
	it("success:false → throw với message đã redact databaseId", async () => {
		const fetchFail = (async () =>
			jsonResponse({
				success: false,
				errors: [{ message: "internal error for db-uuid-1234" }],
			})) as typeof fetch;
		await expect(
			d1Query({
				accountId: "acc",
				databaseId: "db-uuid-1234",
				apiToken: "tok",
				sql: "SELECT 1",
				fetchImpl: fetchFail,
			}),
		).rejects.toThrow(/\[REDACTED\]/);
	});

	it("HTTP 500 → throw kèm status", async () => {
		const fetch500 = (async () =>
			new Response("boom", { status: 500 })) as typeof fetch;
		await expect(
			d1Query({
				accountId: "acc",
				databaseId: "dbid",
				apiToken: "tok",
				sql: "SELECT 1",
				fetchImpl: fetch500,
			}),
		).rejects.toThrow(/500/);
	});

	it("createD1AuditRunner trả rows từ result[0].results", async () => {
		const fetchOk = (async () =>
			jsonResponse({
				success: true,
				result: [{ results: [{ n: 1 }] }],
			})) as typeof fetch;
		const runner = createD1AuditRunner({
			accountId: "acc",
			databaseId: "dbid",
			apiToken: "tok",
			fetchImpl: fetchOk,
		});
		const rows = await runner.queryRows("SELECT 1 AS n");
		expect(rows).toEqual([{ n: 1 }]);
	});

	it("redactSensitive thay secret bằng [REDACTED]", () => {
		expect(
			redactSensitive("token=secret-token-here", ["secret-token-here"]),
		).toBe("token=[REDACTED]");
	});
});
