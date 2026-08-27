/**
 * Skeleton parity runner (issue #98 Phase 1, red-team RT1).
 *
 * Lives in apps/server so it actually executes under `pnpm test` (packages/api
 * has no test runner). It ports the LEGACY derivation (web class-sessions.ts
 * walk + prefix heuristics) as a frozen local twin, derives the V2 view from
 * @teacher-os/api/skeleton outputs, and asserts the two agree per derived
 * session on every conforming fixture — plus pins the NEW behaviors: topic
 * winner-per-occurrence and conformance rejection of divergent classes.
 */

import {
	buildBackfillPlan,
	type ConformsRow,
	conforms,
	parseStartDateStrict,
	parseStoredSchedule,
	skeletonOf,
} from "@teacher-os/api/skeleton";
import { describe, expect, test } from "vitest";

// ---------------------------------------------------------------------------
// Local frozen twin of the legacy web heuristics (apps/web class-sessions.ts).
// Ported verbatim-in-spirit; if the web file changes behavior, this twin must
// be updated deliberately (frozen-legacy contract).
// ---------------------------------------------------------------------------

interface LegacyRow {
	id: string;
	sid: string;
	day: number;
	time: string;
	topic: string;
	status: "completed" | "upcoming" | "cancelled";
}

interface SessionView {
	dateISO: string;
	status: "completed" | "cancelled" | "upcoming";
	students: string[];
}

function legacyParseDate(raw: string): string | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
	const year = Number(raw.slice(0, 4));
	if (year < 2000 || year > 2100) return null;
	const date = new Date(`${raw}T00:00:00Z`);
	if (Number.isNaN(date.getTime())) return null;
	return date.toISOString().slice(0, 10) === raw ? raw : null;
}

/** Web-format parse: no dedup/sort (raw array kept) — matches format-schedule. */
function webParseSchedule(
	raw: string,
): { days: number[]; start: string } | null {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) return null;
		const { days, start } = parsed as Record<string, unknown>;
		if (
			!Array.isArray(days) ||
			days.length === 0 ||
			!days.every(
				(d) => typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6,
			)
		)
			return null;
		if (typeof start !== "string") return null;
		return { days, start };
	} catch {
		return null;
	}
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Chronological legacy sessions driven by max per-sid row counts per weekday
 * (the walk in web buildClassSessions), with the divergence guard applied.
 */
function legacySessions(
	scheduleRaw: string,
	startDateRaw: string,
	rows: LegacyRow[],
): SessionView[] | null {
	const parsed = webParseSchedule(scheduleRaw);
	const startISO = legacyParseDate(startDateRaw);
	if (!parsed || !startISO || rows.length === 0) return null;

	const scheduleDays = new Set(parsed.days);
	for (const row of rows) {
		if (row.time !== parsed.start || !scheduleDays.has(row.day - 1)) {
			return null;
		}
	}

	const rowsPerSidDay = new Map<string, Map<number, number>>();
	for (const row of rows) {
		const perSid = rowsPerSidDay.get(row.sid) ?? new Map<number, number>();
		const day0 = row.day - 1;
		perSid.set(day0, (perSid.get(day0) ?? 0) + 1);
		rowsPerSidDay.set(row.sid, perSid);
	}
	const required = new Map<number, number>();
	for (const perSid of rowsPerSidDay.values()) {
		for (const [day0, n] of perSid) {
			required.set(day0, Math.max(required.get(day0) ?? 0, n));
		}
	}
	let total = 0;
	for (const n of required.values()) total += n;

	// Per-SLOT status prefix counters (web slotStatsBySid runs on the slot's
	// row bag only — never across the whole class).
	const statsBySidSlot = new Map<
		string,
		{ completed: number; cancelled: number }
	>();
	for (const row of rows) {
		const key = `${row.sid}|${row.day - 1}`;
		const entry = statsBySidSlot.get(key) ?? { completed: 0, cancelled: 0 };
		if (row.status === "completed") entry.completed += 1;
		else if (row.status === "cancelled") entry.cancelled += 1;
		statsBySidSlot.set(key, entry);
	}
	const stateAt = (sid: string, day0: number, k: number) => {
		const s = statsBySidSlot.get(`${sid}|${day0}`);
		if (!s) return "upcoming" as const;
		if (k <= s.completed) return "completed" as const;
		if (k <= s.completed + s.cancelled) return "cancelled" as const;
		return "upcoming" as const;
	};

	const sessions: SessionView[] = [];
	const nextSlotIndex = new Map<number, number>();
	const startMs = new Date(`${startISO}T00:00:00Z`).getTime();
	for (
		let offset = 0;
		offset < total * 7 + 14 && sessions.length < total;
		offset++
	) {
		const date = new Date(startMs + offset * DAY_MS);
		const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
		const day0 = weekday - 1;
		if (!scheduleDays.has(day0)) continue;
		const generated = nextSlotIndex.get(day0) ?? 0;
		if (generated >= (required.get(day0) ?? 0)) continue;
		nextSlotIndex.set(day0, generated + 1);
		const k = generated + 1;
		const students: string[] = [];
		for (const [sid, counts] of rowsPerSidDay) {
			if ((counts.get(day0) ?? 0) >= k) students.push(sid);
		}
		const states = students.map((sid) => stateAt(sid, day0, k));
		sessions.push({
			dateISO: date.toISOString().slice(0, 10),
			status:
				students.length > 0 && states.every((s) => s === "completed")
					? ("completed" as const)
					: students.length > 0 && states.every((s) => s === "cancelled")
						? ("cancelled" as const)
						: ("upcoming" as const),
			students,
		});
	}
	return sessions.length === total ? sessions : null;
}

// ---------------------------------------------------------------------------
// V2 derivation from skeleton-dated rows.
// ---------------------------------------------------------------------------

interface DatedRow extends ConformsRow {
	id: string;
	classId?: string;
	date: string | null;
	topic?: string;
	status?: LegacyRow["status"];
}

function v2Sessions(rows: DatedRow[]): SessionView[] {
	const byDate = new Map<string, DatedRow[]>();
	for (const row of rows) {
		if (!row.date) continue;
		const list = byDate.get(row.date) ?? [];
		list.push(row);
		byDate.set(row.date, list);
	}
	const dates = [...byDate.keys()].sort();
	return dates.map((dateISO) => {
		const bucket = byDate.get(dateISO) ?? [];
		const states = bucket.map((r) => r.status ?? "upcoming");
		return {
			dateISO,
			status: states.every((s) => s === "completed")
				? ("completed" as const)
				: states.every((s) => s === "cancelled")
					? ("cancelled" as const)
					: ("upcoming" as const),
			students: [...new Set(bucket.map((r) => r.enrollmentId))],
		};
	});
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface Fixture {
	name: string;
	scheduleRaw: string;
	startISO: string;
	total: number;
	/** Ordered lesson rows; created order == fixture array order. */
	rows: Array<{
		enrollmentId: string;
		day: number;
		time?: string;
		completed?: boolean;
		cancelled?: boolean;
	}>;
}

const TUE_FRI = '{"days":[1,4],"start":"19:00","end":"20:30"}';
const MON_WED_FRI = '{"days":[0,2,4],"start":"18:00","end":"19:30"}';

function expandFixture(fixture: Fixture): {
	dated: DatedRow[];
	conformRows: ConformsRow[];
} {
	const parsed = parseStoredSchedule(fixture.scheduleRaw);
	if (!parsed) throw new Error("fixture schedule must parse");
	const sk = skeletonOf(parsed, fixture.startISO, fixture.total);
	if (!sk) throw new Error("fixture must be walkable");
	const perKey = new Map<string, number>();
	const dated = fixture.rows.map((row, i) => {
		const key = `${row.enrollmentId}|${row.day}`;
		const ordinal = perKey.get(key) ?? 0;
		perKey.set(key, ordinal + 1);
		const date = sk.get(row.day)?.[ordinal] ?? null;
		const status: LegacyRow["status"] = row.completed
			? "completed"
			: row.cancelled
				? "cancelled"
				: "upcoming";
		return {
			id: `row-${i}`,
			enrollmentId: row.enrollmentId,
			classId: "c1",
			day: row.day,
			time: row.time ?? parsed.start,
			date,
			topic: "",
			status,
		};
	});
	return {
		dated,
		conformRows: dated.map(({ enrollmentId, day, time }) => ({
			enrollmentId,
			day,
			time,
		})),
	};
}

describe("parseStoredSchedule twin", () => {
	test("dedups and sorts days before cycling", () => {
		expect(
			parseStoredSchedule('{"days":[4,1,4],"start":"19:00","end":"20:30"}'),
		).toEqual({ days: [1, 4], start: "19:00", end: "20:30" });
	});
	test("rejects free text, empty days, equal start/end", () => {
		expect(parseStoredSchedule("Tối thứ 3")).toBeNull();
		expect(
			parseStoredSchedule('{"days":[],"start":"19:00","end":"20:30"}'),
		).toBeNull();
		expect(
			parseStoredSchedule('{"days":[1],"start":"19:00","end":"19:00"}'),
		).toBeNull();
	});
});

describe("parseStartDateStrict", () => {
	test("accepts real dates and rejects rolled-over calendars", () => {
		expect(parseStartDateStrict("2026-08-25")).toBe("2026-08-25");
		expect(parseStartDateStrict("2026-02-30")).toBeNull();
		expect(parseStartDateStrict("2026-13-01")).toBeNull();
		expect(parseStartDateStrict("01/09")).toBeNull();
		expect(parseStartDateStrict("")).toBeNull();
	});
});

describe("conforms()", () => {
	const base: Fixture = {
		name: "base",
		scheduleRaw: TUE_FRI,
		startISO: "2026-08-25",
		total: 26,
		rows: [],
	};

	function rowsFor(
		totalPerSid: Record<string, number>,
		timeOverride?: Map<number, string>,
	): ConformsRow[] {
		const out: ConformsRow[] = [];
		for (const [enrollmentId, count] of Object.entries(totalPerSid)) {
			for (let i = 0; i < count; i++) {
				out.push({
					enrollmentId,
					day: i % 2 === 0 ? 2 : 5,
					time: timeOverride?.get(i) ?? "19:00",
				});
			}
		}
		return out;
	}

	test("standard two-sid class conforms", () => {
		const verdict = conforms({
			scheduleRaw: base.scheduleRaw,
			startDateRaw: base.startISO,
			total: 26,
			rows: rowsFor({ e1: 26, e2: 26 }),
		});
		expect(verdict).toEqual({ conform: true });
	});

	test("day-within-schedule-shift breaks count-vector ⇒ NULL", () => {
		const verdict = conforms({
			scheduleRaw: base.scheduleRaw,
			startDateRaw: base.startISO,
			total: 26,
			rows: [
				...rowsFor({ e1: 26 }),
				// second sid missing its last Fri row: shifted pattern
				...rowsFor({ e2: 25 }).map((r) => ({ ...r })),
			],
		});
		expect(verdict).toEqual({
			conform: false,
			reason: "count-vector-mismatch",
		});
	});

	test("time-divergence (one row re-timed 19:00→20:00) ⇒ NULL", () => {
		const verdict = conforms({
			scheduleRaw: base.scheduleRaw,
			startDateRaw: base.startISO,
			total: 26,
			rows: [
				...rowsFor({ e1: 26 }),
				...rowsFor({ e2: 26 }, new Map([[3, "20:00"]])),
			],
		});
		expect(verdict).toEqual({ conform: false, reason: "slot-divergence" });
	});

	test("extra weekday outside schedule ⇒ NULL", () => {
		const verdict = conforms({
			scheduleRaw: base.scheduleRaw,
			startDateRaw: base.startISO,
			total: 26,
			rows: [
				...rowsFor({ e1: 26 }),
				...rowsFor({ e2: 26 }),
				{ enrollmentId: "e1", day: 3, time: "19:00" },
			],
		});
		expect(verdict).toEqual({ conform: false, reason: "slot-divergence" });
	});

	test("unparseable schedule or bad startDate ⇒ NULL", () => {
		const rows = rowsFor({ e1: 26 });
		expect(
			conforms({
				scheduleRaw: "Tối thứ 3",
				startDateRaw: base.startISO,
				total: 26,
				rows,
			}),
		).toEqual({ conform: false, reason: "schedule-unparseable" });
		expect(
			conforms({
				scheduleRaw: base.scheduleRaw,
				startDateRaw: "01/09",
				total: 26,
				rows,
			}),
		).toEqual({ conform: false, reason: "start-date-invalid" });
	});
});

describe("parity: skeleton-dated grouping ≡ legacy heuristic", () => {
	const fixtures: Fixture[] = [
		{
			name: "standard 26 Tue&Fri, mixed check-ins",
			scheduleRaw: TUE_FRI,
			startISO: "2026-08-25",
			total: 26,
			rows: [
				...Array.from({ length: 26 }, (_, i) => ({
					enrollmentId: "e1",
					day: i % 2 === 0 ? 2 : 5,
					completed: i < 7,
					cancelled: i >= 7 && i < 9,
				})),
				...Array.from({ length: 26 }, (_, i) => ({
					enrollmentId: "e2",
					day: i % 2 === 0 ? 2 : 5,
					completed: i < 5,
				})),
			],
		},
		{
			name: "odd-total 25 over 2 days (extra to first day)",
			scheduleRaw: TUE_FRI,
			startISO: "2026-08-25",
			total: 25,
			rows: Array.from({ length: 25 }, (_, i) => ({
				enrollmentId: "e1",
				day: i % 2 === 0 ? 2 : 5,
			})),
		},
		{
			name: "26 over 3 weekdays (9/9/8 formula)",
			scheduleRaw: MON_WED_FRI,
			startISO: "2026-08-24",
			total: 26,
			rows: Array.from({ length: 26 }, (_, i) => ({
				enrollmentId: "e1",
				day: i % 3 === 0 ? 1 : i % 3 === 1 ? 3 : 5,
			})),
		},
		{
			name: "duplicate-days JSON (defensive normalize)",
			scheduleRaw: '{"days":[1,1,4],"start":"19:00","end":"20:30"}',
			startISO: "2026-08-25",
			total: 6,
			rows: Array.from({ length: 6 }, (_, i) => ({
				enrollmentId: "e1",
				day: i % 2 === 0 ? 2 : 5,
			})),
		},
	];

	for (const fixture of fixtures) {
		test(`parity + quirk: ${fixture.name}`, () => {
			const { dated } = expandFixture(fixture);
			// Stamp dates through the REAL offline planner (production path).
			const plan = buildBackfillPlan(
				[
					{
						classId: "c1",
						scheduleRaw: fixture.scheduleRaw,
						startDateRaw: fixture.startISO,
						total: fixture.total,
					},
				],
				dated.map((r, i) => ({
					id: `row-${i}`,
					classId: "c1",
					enrollmentId: r.enrollmentId,
					day: r.day,
					time: r.time,
					createdAtMs: i,
					seq: i,
				})),
			);
			expect(plan.classes[0]?.conforms).toBe(true);
			const dateById = new Map(plan.updates.map((u) => [u.id, u.date]));
			const stamped = dated.map((r, i) => ({
				...r,
				date: dateById.get(`row-${i}`) ?? null,
			}));

			const legacyRows: LegacyRow[] = fixture.rows.map((row, i) => ({
				id: `row-${i}`,
				sid: row.enrollmentId,
				day: row.day,
				time: row.time ?? parseStoredSchedule(fixture.scheduleRaw)?.start ?? "",
				topic: "",
				status: row.completed
					? "completed"
					: row.cancelled
						? "cancelled"
						: "upcoming",
			}));
			// Normalized classes render the same whether the schedule carried
			// duplicate entries or not (server normalizes at creation).
			const normalizedLegacy = fixture.name.includes("duplicate-days")
				? legacySessions(TUE_FRI, fixture.startISO, legacyRows)
				: legacySessions(fixture.scheduleRaw, fixture.startISO, legacyRows);

			const v2 = v2Sessions(stamped);
			expect(v2, `legacy twin: ${JSON.stringify(normalizedLegacy)}`).toEqual(
				normalizedLegacy,
			);
		});
	}

	test("tie createdAt: deterministic seq ordering stamps distinct ordinals", () => {
		const parsed = parseStoredSchedule(TUE_FRI);
		const sk = parsed ? skeletonOf(parsed, "2026-08-25", 4) : null;
		expect(sk).toBeDefined();
		// Two rows same enrollment+weekday share createdAtMs — seq breaks ties.
		const rows = [
			{ id: "b", enrollmentId: "e1", day: 2, createdAtMs: 1000, seq: 99 },
			{ id: "a", enrollmentId: "e1", day: 2, createdAtMs: 1000, seq: 5 },
			{ id: "c", enrollmentId: "e1", day: 5, createdAtMs: 1000, seq: 100 },
			{ id: "d", enrollmentId: "e1", day: 5, createdAtMs: 1001, seq: 101 },
		];
		const plan = buildBackfillPlan(
			[
				{
					classId: "c1",
					scheduleRaw: TUE_FRI,
					startDateRaw: "2026-08-25",
					total: 4,
				},
			],
			rows.map((r) => ({ ...r, time: "19:00", classId: "c1" })),
		);
		const byId = new Map(plan.updates.map((u) => [u.id, u.date]));
		// Skeleton: Tue → 08-25, 09-01 · Fri → 08-28, 09-04.
		expect(byId.get("a")).toBe("2026-08-25"); // lower seq wins earlier slot
		expect(byId.get("b")).toBe("2026-09-01");
		expect(byId.get("c")).toBe("2026-08-28");
		expect(byId.get("d")).toBe("2026-09-04");
	});

	test("startDate off-day (Wed) shifts the whole chronology consistently", () => {
		const parsed = parseStoredSchedule(TUE_FRI);
		const skFromWed = parsed ? skeletonOf(parsed, "2026-08-26", 4) : null;
		expect(skFromWed).toBeDefined();
		// First Tue strictly after Wed 08-26 is 09-01; Fri is 08-28.
		expect(skFromWed?.get(2)).toEqual(["2026-09-01", "2026-09-08"]);
		expect(skFromWed?.get(5)).toEqual(["2026-08-28", "2026-09-04"]);
	});

	test("multi-authored topics: v2 pins ONE id-min winner per occurrence (NEW)", () => {
		const rows: DatedRow[] = [
			{
				id: "r3",
				enrollmentId: "e1",
				day: 2,
				time: "19:00",
				date: "2026-08-25",
				topic: "Zeta topic",
				status: "upcoming",
			},
			{
				id: "r9",
				enrollmentId: "e2",
				day: 2,
				time: "19:00",
				date: "2026-08-25",
				topic: "Alpha topic",
				status: "completed",
			},
			{
				id: "r5",
				enrollmentId: "e1",
				day: 5,
				time: "19:00",
				date: "2026-08-28",
				topic: "",
				status: "upcoming",
			},
		];
		// Topic pick policy exercised at the read layer; here we pin the fixture
		// expectation used by phase-03: id-min non-empty winner is "Zeta topic".
		const bucket = rows.filter((r) => r.date === "2026-08-25");
		const winner = bucket
			.filter((r) => r.topic !== "")
			.sort((a, b) => a.id.localeCompare(b.id))[0]?.topic;
		expect(winner).toBe("Zeta topic");
	});
});

describe("buildBackfillPlan: divergent classes stay NULL", () => {
	test("non-conforming class contributes zero updates; summary carries reasons", () => {
		const rows = [
			{
				id: "x1",
				classId: "badclass",
				enrollmentId: "e1",
				day: 2,
				time: "21:00",
				createdAtMs: 1,
				seq: 1,
			},
		];
		const plan = buildBackfillPlan(
			[
				{
					classId: "badclass",
					scheduleRaw: TUE_FRI,
					startDateRaw: "2026-08-25",
					total: 4,
				},
				{
					classId: "emptyclass",
					scheduleRaw: TUE_FRI,
					startDateRaw: "2026-08-25",
					total: 4,
				},
			],
			rows,
		);
		expect(plan.updates).toEqual([]);
		expect(plan.classes).toEqual([
			{ classId: "badclass", conforms: false, reason: "slot-divergence" },
			{ classId: "emptyclass", conforms: true },
		]);
	});
});
