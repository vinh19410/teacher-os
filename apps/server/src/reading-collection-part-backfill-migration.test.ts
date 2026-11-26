/**
 * Verifies migration 0094 safely backfills Reading library `collection`,
 * `test_group`, `part` (`p1`/`p2`/`p3`), `position`, `source`, and
 * auto-generated part titles across 5 tables (`library_test`,
 * `library_test_part`, `assignment_test`, `assignment_test_part`,
 * `assignment_prompt`), while:
 * - Scrubbing `"Step IELTS"` / `"Unknown"` (including Prod D1 uncleaned rows)
 * - Disambiguating `"Coral reefs"` via mutually exclusive ASCII passage clues
 * - Matching homoglyph / whitespace title variants cleanly
 * - Preserving INF-03 tenant edits, short-title custom hijack guards,
 *   multi-part isolation, and the `assignment_test_part.part === assignment_prompt.part`
 *   invariant (both shared prompts and single-use custom-test prompts)
 * - Passing Alchemy `executeMultiple`, Drizzle `migrate()`, sentinel
 *   `updated_at = 1000` idempotency, retry safety, and HTTP Admin/Student E2E.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Client, createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, test } from "vitest";
import { buildApp, type Db } from "./app";
import type { SessionUser } from "./session";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url).href,
);

const SAMPLE_QUESTIONS = JSON.stringify([
	{
		stem: "Sample statement.",
		opts: null,
		answer: "TRUE",
		alts: "",
		type: "tfng",
		pin: null,
	},
]);

const PASSAGE_FALKIRK =
	"<p>The Falkirk Wheel in Scotland is the world's first and only rotating boat lift.</p>";
const PASSAGE_TERMITE =
	"<p>To most of us, termites are destructive insects that ruin wooden structures.</p>";
const PASSAGE_DROP =
	"<p>The history of human civilisation is entwined with the history of the ways we have learned to manipulate water resources.</p>";
const PASSAGE_ADVERTISING =
	"<p>The harder advertisers try to get your attention, the harder your brain works to filter them out.</p>";
const PASSAGE_TEAM =
	"<p>Poverty Point in the US was a massive earthwork built by hunter-gatherers.</p>";
const PASSAGE_TRAFFIC =
	"<p>Many big cities around the world face severe traffic congestion every day.</p>";
const PASSAGE_CORAL_C20 =
	"<p>Researchers at London Zoo are cultivating endangered coral reefs in specialized tanks.</p>";
const PASSAGE_CORAL_COLL =
	"<p>Coral reefs are underwater ecosystems held together by calcium carbonate structures.</p>";
const PASSAGE_LONGER =
	"<p>Some refer to it as caloric restriction, a regimen shown to extend lifespan.</p>";
const PASSAGE_SLEEP =
	"<p>Sleep is not an optional lifestyle luxury; it is a biological necessity.</p>";
const PASSAGE_FARMERS =
	"<p>The Farmers Trading Company began in New Zealand as a rural mail-order business.</p>";
const PASSAGE_INVENTION =
	"<p>Of all mankind's manifold creations, language must take pride of place.</p>";
const PASSAGE_DIABETES_CUSTOM =
	"<p>Teacher authored custom passage about glucose monitoring in clinic visits.</p>";
const PASSAGE_TEAM_CUSTOM =
	"<p>Custom workshop exercises on classroom collaboration and student icebreakers.</p>";

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

function migration0094File(): string {
	const file = migrationFiles().find((name) => name.startsWith("0094_"));
	if (!file) throw new Error("migration 0094 not found");
	return file;
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

async function seedOrg(client: Client, id: string) {
	await client.execute({
		sql: "INSERT INTO organization (id, name) VALUES (?, ?)",
		args: [id, `Org ${id}`],
	});
}

async function seedLibraryTest(
	client: Client,
	opts: {
		id: string;
		title: string;
		skill?: string;
		status?: string;
		collection?: string | null;
		testGroup?: string | null;
		updatedAt?: number;
	},
) {
	await client.execute({
		sql: "INSERT INTO library_test (id, title, skill, status, collection, test_group, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		args: [
			opts.id,
			opts.title,
			opts.skill ?? "reading",
			opts.status ?? "ready",
			opts.collection === undefined ? null : opts.collection,
			opts.testGroup === undefined ? null : opts.testGroup,
			opts.updatedAt ?? 500,
		],
	});
}

async function seedLibraryPart(
	client: Client,
	opts: {
		id: string;
		testId: string;
		part?: string;
		type?: string;
		title?: string;
		source?: string;
		passage: string;
		questions?: string;
		updatedAt?: number;
	},
) {
	await client.execute({
		sql: "INSERT INTO library_test_part (id, test_id, part, type, title, source, passage, questions, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		args: [
			opts.id,
			opts.testId,
			opts.part ?? "p1",
			opts.type ?? "tfng",
			opts.title ?? "",
			opts.source ?? "",
			opts.passage,
			opts.questions ?? SAMPLE_QUESTIONS,
			opts.updatedAt ?? 500,
		],
	});
}

async function seedAssignmentTest(
	client: Client,
	opts: {
		id: string;
		orgId: string;
		title: string;
		skill?: string;
		status?: string;
		collection?: string | null;
		testGroup?: string | null;
		libraryRef?: string | null;
		updatedAt?: number;
	},
) {
	await client.execute({
		sql: "INSERT INTO assignment_test (id, org_id, title, skill, status, collection, test_group, library_ref, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		args: [
			opts.id,
			opts.orgId,
			opts.title,
			opts.skill ?? "reading",
			opts.status ?? "ready",
			opts.collection === undefined ? null : opts.collection,
			opts.testGroup === undefined ? null : opts.testGroup,
			opts.libraryRef === undefined ? null : opts.libraryRef,
			opts.updatedAt ?? 500,
		],
	});
}

async function seedAssignmentPrompt(
	client: Client,
	opts: {
		id: string;
		orgId: string;
		title: string;
		skill?: string;
		part?: string;
		type?: string;
		source?: string;
		passage: string;
		questions?: string;
		libraryRef?: string | null;
	},
) {
	await client.execute({
		sql: "INSERT INTO assignment_prompt (id, org_id, task, genre, skill, part, type, title, source, prompt, passage, questions, library_ref, status) VALUES (?, ?, 'task2', '', ?, ?, ?, ?, ?, '', ?, ?, ?, 'ready')",
		args: [
			opts.id,
			opts.orgId,
			opts.skill ?? "reading",
			opts.part ?? "p1",
			opts.type ?? "tfng",
			opts.title,
			opts.source ?? "",
			opts.passage,
			opts.questions ?? SAMPLE_QUESTIONS,
			opts.libraryRef === undefined ? null : opts.libraryRef,
		],
	});
}

async function seedAssignmentTestPart(
	client: Client,
	opts: {
		id: string;
		testId: string;
		promptId: string;
		part?: string;
		position?: number;
	},
) {
	await client.execute({
		sql: "INSERT INTO assignment_test_part (id, test_id, prompt_id, part, position) VALUES (?, ?, ?, ?, ?)",
		args: [
			opts.id,
			opts.testId,
			opts.promptId,
			opts.part ?? "p1",
			opts.position ?? 0,
		],
	});
}

async function readRow(client: Client, table: string, id: string) {
	const res = await client.execute({
		sql: `SELECT * FROM ${table} WHERE id = ?`,
		args: [id],
	});
	const row = res.rows[0];
	if (!row) throw new Error(`Row ${id} not found in ${table}`);
	return row;
}

describe("migration 0094: backfill Reading library collection, test_group, and part (#884)", () => {
	test("1. updates all 5 tables across Step IELTS/Unknown, Coral reefs, homoglyphs, whitespace, existing test_group, and anchored SUBSTR auto-titles via executeMultiple", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0093_orange_vin_gonzales.sql");
		await seedOrg(client, "org-existing");

		const fixtures = [
			{
				key: "falkirk",
				title: "The Falkirk Wheel",
				collection: null,
				testGroup: "Passage 1",
				partTitle: "The Falkirk Wheel — P1",
				promptTitle: "The Falkirk Wheel — P1",
				source: "",
				passage: PASSAGE_FALKIRK,
			},
			{
				key: "termite",
				title: "Termite Mounds",
				collection: "",
				testGroup: null,
				partTitle: "Passage 1: Termite Mounds",
				promptTitle: "Passage 1: Termite Mounds",
				source: "",
				passage: PASSAGE_TERMITE,
			},
			{
				key: "drop",
				title: "\t Making Every Drop Count \r\n",
				collection: null,
				testGroup: "Test 1",
				partTitle: "Reading Passage 1: Making Every Drop Count",
				// Verifies anchored SUBSTR only rewrites the leading prefix, NOT the body.
				promptTitle: "Passage 1: Notes on Passage 1",
				source: "",
				passage: PASSAGE_DROP,
			},
			{
				key: "adv",
				title: "Advertising Needs Attention",
				collection: "Unknown",
				testGroup: "Unknown",
				partTitle: "Passage 1",
				promptTitle: "Passage 1",
				source: "Unknown — Passage 1",
				passage: PASSAGE_ADVERTISING,
			},
			{
				key: "team",
				title: "Team Building",
				collection: null,
				testGroup: null,
				partTitle: "Team Building",
				promptTitle: "Team Building",
				source: "",
				passage: PASSAGE_TEAM,
			},
			{
				key: "traffic",
				title: "Solving Traffic Problems in Big Cities",
				collection: "Step IELTS",
				testGroup: "Step IELTS",
				partTitle: "Solving Traffic Problems in Big Cities",
				promptTitle: "Solving Traffic Problems in Big Cities",
				source: "Step IELTS — Passage 1",
				passage: PASSAGE_TRAFFIC,
			},
			{
				key: "coral-c20",
				title: "Coral reefs",
				collection: null,
				testGroup: null,
				partTitle: "Passage 1",
				promptTitle: "Reading Passage 1",
				source: "",
				passage: PASSAGE_CORAL_C20,
			},
			{
				key: "coral-coll",
				title: "Coral Reefs",
				collection: "",
				testGroup: null,
				partTitle: "Passage 1",
				promptTitle: "Passage 1",
				source: "",
				passage: PASSAGE_CORAL_COLL,
			},
			{
				key: "longer",
				title: "Will Eating Less Make You Live Longer",
				collection: null,
				testGroup: null,
				partTitle: "Passage 1",
				promptTitle: "Passage 1",
				source: "",
				passage: PASSAGE_LONGER,
			},
			{
				key: "sleep",
				// Latin 'p' matches Cyrillic '\u0440' in JSON via NORM_TITLE
				title: "The science of sleep",
				collection: null,
				testGroup: null,
				partTitle: "The science of sleep — P1",
				promptTitle: "The science of sleep — P1",
				source: "",
				passage: PASSAGE_SLEEP,
			},
			{
				key: "farmers",
				// ASCII ':' matches full-width '\uFF1A' in JSON via NORM_TITLE
				title: "The Farmers:the Past and the Present",
				collection: null,
				testGroup: null,
				partTitle: "Passage 1: Farmers",
				promptTitle: "Passage 1: Farmers",
				source: "",
				passage: PASSAGE_FARMERS,
			},
			{
				key: "invention",
				// ASCII quotes match curly quotes '\u2018'/'\u2019' in JSON via NORM_TITLE
				title: "'This Marvellous Invention'",
				collection: null,
				testGroup: null,
				partTitle: "Reading Passage 1: Notes on Reading Passage 1",
				promptTitle: "Reading Passage 1: Notes on Reading Passage 1",
				source: "",
				passage: PASSAGE_INVENTION,
			},
			{
				key: "rome",
				// Only entry with empty passage -> empty passage_clue matches cleanly
				title: "Looking at Daily Life in Ancient Rome",
				collection: null,
				testGroup: null,
				partTitle: "Passage 1",
				promptTitle: "Passage 1",
				source: "",
				passage: "",
			},
		];

		for (const f of fixtures) {
			await seedLibraryTest(client, {
				id: `lt-${f.key}`,
				title: f.title,
				collection: f.collection,
				testGroup: f.testGroup,
			});
			await seedLibraryPart(client, {
				id: `ltp-${f.key}`,
				testId: `lt-${f.key}`,
				part: "p1",
				title: f.partTitle,
				source: f.source,
				passage: f.passage,
			});
			await seedAssignmentTest(client, {
				id: `at-${f.key}`,
				orgId: "org-existing",
				title: f.title,
				collection: f.collection,
				testGroup: f.testGroup,
				libraryRef: `lt-${f.key}`,
			});
			await seedAssignmentPrompt(client, {
				id: `ap-${f.key}`,
				orgId: "org-existing",
				part: "p1",
				title: f.promptTitle,
				source: f.source,
				passage: f.passage,
				libraryRef: `library_test_part:ltp-${f.key}`,
			});
			await seedAssignmentTestPart(client, {
				id: `atp-${f.key}`,
				testId: `at-${f.key}`,
				promptId: `ap-${f.key}`,
				part: "p1",
				position: 0,
			});
		}

		const rawSql = readFileSync(
			`${MIGRATIONS_DIR}/${migration0094File()}`,
			"utf8",
		);
		await client.executeMultiple(rawSql);

		// Verify all expected updates across all 5 tables.
		const expected: Array<{
			key: string;
			collection: string;
			testGroup: string;
			part: "p1" | "p2" | "p3";
			position: number;
			partSource: string;
			ltpTitle: string;
			apTitle: string;
		}> = [
			{
				key: "falkirk",
				collection: "Cambridge IELTS 11",
				testGroup: "Test 1",
				part: "p2",
				position: 1,
				partSource: "Cambridge IELTS 11 Test 1 — Passage 2",
				ltpTitle: "The Falkirk Wheel — P2",
				apTitle: "The Falkirk Wheel — P2",
			},
			{
				key: "termite",
				collection: "Collection",
				testGroup: "Passage 3",
				part: "p3",
				position: 2,
				partSource: "Collection — Passage 3",
				ltpTitle: "Passage 3: Termite Mounds",
				apTitle: "Passage 3: Termite Mounds",
			},
			{
				key: "drop",
				collection: "Cambridge IELTS 7",
				testGroup: "Test 1",
				part: "p2",
				position: 1,
				partSource: "Cambridge IELTS 7 Test 1 — Passage 2",
				ltpTitle: "Reading Passage 2: Making Every Drop Count",
				apTitle: "Passage 2: Notes on Passage 1",
			},
			{
				key: "adv",
				collection: "Actual Test",
				testGroup: "Passage 1",
				part: "p1",
				position: 0,
				partSource: "Actual Test — Passage 1",
				ltpTitle: "Passage 1",
				apTitle: "Passage 1",
			},
			{
				key: "team",
				collection: "Trainer",
				testGroup: "Passage 1",
				part: "p1",
				position: 0,
				partSource: "Trainer — Passage 1",
				ltpTitle: "Team Building",
				apTitle: "Team Building",
			},
			{
				key: "traffic",
				collection: "Other sources",
				testGroup: "Passage 1",
				part: "p1",
				position: 0,
				partSource: "Other sources — Passage 1",
				ltpTitle: "Solving Traffic Problems in Big Cities",
				apTitle: "Solving Traffic Problems in Big Cities",
			},
			{
				key: "coral-c20",
				collection: "Cambridge IELTS 20",
				testGroup: "Test 3",
				part: "p2",
				position: 1,
				partSource: "Cambridge IELTS 20 Test 3 — Passage 2",
				ltpTitle: "Passage 2",
				apTitle: "Reading Passage 2",
			},
			{
				key: "coral-coll",
				collection: "Collection",
				testGroup: "Passage 1",
				part: "p1",
				position: 0,
				partSource: "Collection — Passage 1",
				ltpTitle: "Passage 1",
				apTitle: "Passage 1",
			},
			{
				key: "longer",
				collection: "Collection",
				testGroup: "Passage 2",
				part: "p2",
				position: 1,
				partSource: "Collection — Passage 2",
				ltpTitle: "Passage 2",
				apTitle: "Passage 2",
			},
			{
				key: "sleep",
				collection: "Actual Test",
				testGroup: "Passage 3",
				part: "p3",
				position: 2,
				partSource: "Actual Test — Passage 3",
				ltpTitle: "The science of sleep — P3",
				apTitle: "The science of sleep — P3",
			},
			{
				key: "farmers",
				collection: "Forecast Quý 2-2025",
				testGroup: "Passage 2",
				part: "p2",
				position: 1,
				partSource: "Forecast Quý 2-2025 — Passage 2",
				ltpTitle: "Passage 2: Farmers",
				apTitle: "Passage 2: Farmers",
			},
			{
				key: "invention",
				collection: "Cambridge IELTS 11",
				testGroup: "Test 4",
				part: "p3",
				position: 2,
				partSource: "Cambridge IELTS 11 Test 4 — Passage 3",
				ltpTitle: "Reading Passage 3: Notes on Reading Passage 1",
				apTitle: "Reading Passage 3: Notes on Reading Passage 1",
			},
			{
				key: "rome",
				collection: "Collection",
				testGroup: "Passage 3",
				part: "p3",
				position: 2,
				partSource: "Collection — Passage 3",
				ltpTitle: "Passage 3",
				apTitle: "Passage 3",
			},
		];

		for (const exp of expected) {
			const lt = await readRow(client, "library_test", `lt-${exp.key}`);
			expect(lt.collection, `lt-${exp.key}.collection`).toBe(exp.collection);
			expect(lt.test_group, `lt-${exp.key}.test_group`).toBe(exp.testGroup);

			const ltp = await readRow(client, "library_test_part", `ltp-${exp.key}`);
			expect(ltp.part, `ltp-${exp.key}.part`).toBe(exp.part);
			expect(ltp.source, `ltp-${exp.key}.source`).toBe(exp.partSource);
			expect(ltp.title, `ltp-${exp.key}.title`).toBe(exp.ltpTitle);

			const at = await readRow(client, "assignment_test", `at-${exp.key}`);
			expect(at.collection, `at-${exp.key}.collection`).toBe(exp.collection);
			expect(at.test_group, `at-${exp.key}.test_group`).toBe(exp.testGroup);

			const atp = await readRow(
				client,
				"assignment_test_part",
				`atp-${exp.key}`,
			);
			expect(atp.part, `atp-${exp.key}.part`).toBe(exp.part);
			expect(Number(atp.position), `atp-${exp.key}.position`).toBe(
				exp.position,
			);

			const ap = await readRow(client, "assignment_prompt", `ap-${exp.key}`);
			expect(ap.part, `ap-${exp.key}.part`).toBe(exp.part);
			expect(ap.source, `ap-${exp.key}.source`).toBe(exp.partSource);
			expect(ap.title, `ap-${exp.key}.title`).toBe(exp.apTitle);
		}

		// No temporary helper tables left behind.
		const leftovers = await client.execute(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '_tmp_%0094'",
		);
		expect(leftovers.rows).toHaveLength(0);

		// Foreign keys remain 100% intact.
		const fkCheck = await client.execute("PRAGMA foreign_key_check");
		expect(fkCheck.rows).toHaveLength(0);
	});

	test("2. protects INF-03 tenant edits, custom short-title hijack, multi-part, shared & custom-1-part prompt part-invariants, listening, and snapshots", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0093_orange_vin_gonzales.sql");
		await seedOrg(client, "org-1");
		await seedOrg(client, "org-2");

		// Base library test for INF-03 / shared / custom-1-part tests (Falkirk Wheel -> C11T1 p2).
		await seedLibraryTest(client, {
			id: "lt-falkirk",
			title: "The Falkirk Wheel",
			collection: null,
			testGroup: null,
		});
		await seedLibraryPart(client, {
			id: "ltp-falkirk",
			testId: "lt-falkirk",
			part: "p1",
			title: "The Falkirk Wheel — P1",
			passage: PASSAGE_FALKIRK,
		});

		// A. Teacher-authored custom test (library_ref = NULL) with colliding title -> untouched.
		await seedAssignmentTest(client, {
			id: "at-teacher-custom",
			orgId: "org-1",
			title: "The Falkirk Wheel",
			collection: null,
			testGroup: null,
			libraryRef: null,
		});
		await seedAssignmentPrompt(client, {
			id: "ap-teacher-custom",
			orgId: "org-1",
			part: "p1",
			title: "The Falkirk Wheel — P1",
			passage: PASSAGE_FALKIRK,
			libraryRef: null,
		});
		await seedAssignmentTestPart(client, {
			id: "atp-teacher-custom",
			testId: "at-teacher-custom",
			promptId: "ap-teacher-custom",
			part: "p1",
			position: 0,
		});

		// B. Admin custom library tests with short colliding titles ("Team Building", "Diabetes")
		//    but unrelated passages -> must NOT be hijacked on library_test or library_test_part.
		await seedLibraryTest(client, {
			id: "lt-custom-team",
			title: "Team Building",
			collection: null,
			testGroup: null,
		});
		await seedLibraryPart(client, {
			id: "ltp-custom-team",
			testId: "lt-custom-team",
			part: "p1",
			title: "Passage 1",
			source: "",
			passage: PASSAGE_TEAM_CUSTOM,
		});
		await seedLibraryTest(client, {
			id: "lt-custom-diabetes",
			title: "Diabetes",
			collection: null,
			testGroup: null,
		});
		await seedLibraryPart(client, {
			id: "ltp-custom-diabetes",
			testId: "lt-custom-diabetes",
			part: "p1",
			title: "Passage 1",
			source: "",
			passage: PASSAGE_DIABETES_CUSTOM,
		});

		// C. Admin custom library test with custom collection ('Bộ đề riêng') matching Coral reefs
		//    -> BOTH library_test AND library_test_part untouched.
		await seedLibraryTest(client, {
			id: "lt-custom-coral",
			title: "Coral reefs",
			collection: "Bộ đề riêng",
			testGroup: "Đề tự biên soạn",
		});
		await seedLibraryPart(client, {
			id: "ltp-custom-coral",
			testId: "lt-custom-coral",
			part: "p1",
			title: "Passage 1",
			source: "",
			passage: PASSAGE_CORAL_C20,
		});

		// D. Multi-part Reading library test (p1 + p2, collection = NULL) -> untouched.
		await seedLibraryTest(client, {
			id: "lt-multi",
			title: "The Falkirk Wheel",
			collection: null,
			testGroup: null,
		});
		await seedLibraryPart(client, {
			id: "ltp-multi-p1",
			testId: "lt-multi",
			part: "p1",
			title: "Passage 1",
			passage: PASSAGE_FALKIRK,
		});
		await seedLibraryPart(client, {
			id: "ltp-multi-p2",
			testId: "lt-multi",
			part: "p2",
			title: "Passage 2",
			passage: PASSAGE_TERMITE,
		});

		// E. INF-03: Org copy where teacher customized collection = 'Lớp IELTS 7.0'
		//    -> at.collection, at.test_group, atp.part, atp.position, ap.part, AND ap.source ALL untouched!
		await seedAssignmentTest(client, {
			id: "at-inf03-col",
			orgId: "org-1",
			title: "The Falkirk Wheel",
			collection: "Lớp IELTS 7.0",
			testGroup: "Tuần 3",
			libraryRef: "lt-falkirk",
		});
		await seedAssignmentPrompt(client, {
			id: "ap-inf03-col",
			orgId: "org-1",
			part: "p1",
			title: "The Falkirk Wheel — P1",
			source: "",
			passage: PASSAGE_FALKIRK,
			libraryRef: "library_test_part:ltp-falkirk",
		});
		await seedAssignmentTestPart(client, {
			id: "atp-inf03-col",
			testId: "at-inf03-col",
			promptId: "ap-inf03-col",
			part: "p1",
			position: 0,
		});

		// F. INF-03: Org copy where teacher edited passage -> ap.part, ap.source, atp.part, atp.position untouched.
		await seedLibraryTest(client, {
			id: "lt-termite",
			title: "Termite Mounds",
			collection: null,
			testGroup: null,
		});
		await seedLibraryPart(client, {
			id: "ltp-termite",
			testId: "lt-termite",
			part: "p1",
			title: "Passage 1: Termite Mounds",
			passage: PASSAGE_TERMITE,
		});
		await seedAssignmentTest(client, {
			id: "at-inf03-passage",
			orgId: "org-1",
			title: "Termite Mounds",
			collection: null,
			testGroup: null,
			libraryRef: "lt-termite",
		});
		await seedAssignmentPrompt(client, {
			id: "ap-inf03-passage",
			orgId: "org-1",
			part: "p1",
			title: "Passage 1: Termite Mounds",
			source: "",
			passage: "<p>Teacher edited termite passage</p>",
			libraryRef: "library_test_part:ltp-termite",
		});
		await seedAssignmentTestPart(client, {
			id: "atp-inf03-passage",
			testId: "at-inf03-passage",
			promptId: "ap-inf03-passage",
			part: "p1",
			position: 0,
		});

		// G. Single-use library prompt (COUNT(*) = 1) attached ONLY to a custom 1-part test (library_ref IS NULL)
		//    -> post-D blocked-prompt populate MUST prevent Statement E from updating ap.part or ap.source!
		await seedAssignmentTest(client, {
			id: "at-custom-single",
			orgId: "org-2",
			title: "Custom Single Test",
			collection: null,
			testGroup: null,
			libraryRef: null,
		});
		await seedAssignmentPrompt(client, {
			id: "ap-custom-single-lib",
			orgId: "org-2",
			part: "p1",
			title: "The Falkirk Wheel — P1",
			source: "",
			passage: PASSAGE_FALKIRK,
			libraryRef: "library_test_part:ltp-falkirk",
		});
		await seedAssignmentTestPart(client, {
			id: "atp-custom-single",
			testId: "at-custom-single",
			promptId: "ap-custom-single-lib",
			part: "p1",
			position: 0,
		});

		// H. Shared prompt attached to 2 tests (synced 1-part + custom multi-part) -> INSERT OR IGNORE
		//    must not throw PRIMARY KEY error, and BOTH atp rows + ap stay at p1 / source=''!
		await seedLibraryTest(client, {
			id: "lt-drop",
			title: "Making Every Drop Count",
			collection: null,
			testGroup: null,
		});
		await seedLibraryPart(client, {
			id: "ltp-drop",
			testId: "lt-drop",
			part: "p1",
			title: "Passage 1: Making Every Drop Count",
			passage: PASSAGE_DROP,
		});
		await seedAssignmentPrompt(client, {
			id: "ap-shared",
			orgId: "org-1",
			part: "p1",
			title: "Passage 1: Making Every Drop Count",
			source: "",
			passage: PASSAGE_DROP,
			libraryRef: "library_test_part:ltp-drop",
		});
		await seedAssignmentPrompt(client, {
			id: "ap-other-p2",
			orgId: "org-1",
			part: "p2",
			title: "Other P2",
			passage: "<p>Other</p>",
			libraryRef: null,
		});
		await seedAssignmentTest(client, {
			id: "at-shared-synced",
			orgId: "org-1",
			title: "Making Every Drop Count",
			collection: null,
			testGroup: null,
			libraryRef: "lt-drop",
		});
		await seedAssignmentTestPart(client, {
			id: "atp-shared-synced",
			testId: "at-shared-synced",
			promptId: "ap-shared",
			part: "p1",
			position: 0,
		});
		await seedAssignmentTest(client, {
			id: "at-shared-custom-multi",
			orgId: "org-1",
			title: "Teacher Mock Full Test",
			libraryRef: null,
		});
		await seedAssignmentTestPart(client, {
			id: "atp-shared-multi-1",
			testId: "at-shared-custom-multi",
			promptId: "ap-shared",
			part: "p1",
			position: 0,
		});
		await seedAssignmentTestPart(client, {
			id: "atp-shared-multi-2",
			testId: "at-shared-custom-multi",
			promptId: "ap-other-p2",
			part: "p2",
			position: 1,
		});

		// I. Listening test with identical Reading title -> untouched.
		await seedLibraryTest(client, {
			id: "lt-listen-collide",
			title: "The Falkirk Wheel",
			skill: "listening",
			collection: null,
			testGroup: null,
		});
		await seedLibraryPart(client, {
			id: "ltp-listen-collide",
			testId: "lt-listen-collide",
			part: "s1",
			title: "Section 1",
			passage: PASSAGE_FALKIRK,
		});

		// J. Wildcard library_ref attack (`libraryXtestYpart:...`) -> untouched.
		await seedAssignmentPrompt(client, {
			id: "ap-wildcard-ref",
			orgId: "org-1",
			part: "p1",
			title: "Passage 1",
			source: "",
			passage: PASSAGE_FALKIRK,
			libraryRef: "libraryXtestYpart:ltp-falkirk",
		});

		// K. Library test already on part='p2', test_group='Test 1', collection=NULL, custom title='Tiêu đề riêng'
		//    -> backfills collection='Cambridge IELTS 11' and empty source, preserves test_group/part/custom title.
		await seedLibraryTest(client, {
			id: "lt-already-p2",
			title: "The Falkirk Wheel",
			collection: null,
			testGroup: "Test 1",
		});
		await seedLibraryPart(client, {
			id: "ltp-already-p2",
			testId: "lt-already-p2",
			part: "p2",
			title: "Tiêu đề riêng",
			source: "",
			passage: PASSAGE_FALKIRK,
		});

		// L. Snapshot & Study Pack references stay 100% intact.
		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, email) VALUES ('stu-snap', 'org-1', 'An', 'an@test.local')",
			args: [],
		});
		const snapshotJson = JSON.stringify([
			{ stem: "Immutable Q1", answer: "TRUE", type: "tfng" },
		]);
		await client.execute({
			sql: "INSERT INTO quiz_attempt (id, org_id, student_id, test_id, mode, status, questions_snapshot) VALUES ('qa-1', 'org-1', 'stu-snap', 'at-inf03-col', 'practice', 'submitted', ?)",
			args: [snapshotJson],
		});
		await client.execute({
			sql: "INSERT INTO study_pack (id, org_id, title, status) VALUES ('sp-1', NULL, 'Pack 1', 'ready')",
			args: [],
		});
		await client.execute({
			sql: "INSERT INTO study_pack_item (id, pack_id, day_index, position, source_kind, source_id) VALUES ('spi-1', 'sp-1', 1, 0, 'library_test_part', 'ltp-falkirk')",
			args: [],
		});

		// M. Finding 1 (p1 INF-03 & p1 custom 1-part): Advertising Needs Attention (m.part = 'p1')
		//    - at-p1-inf03 has teacher-customized collection='Lớp IELTS 7.0' -> ap-p1-inf03.source MUST stay ''!
		//    - at-p1-custom has library_ref=NULL attaching ltp-p1-adv -> ap-p1-custom.source MUST stay ''!
		await seedLibraryTest(client, {
			id: "lt-p1-adv",
			title: "Advertising Needs Attention",
			collection: null,
			testGroup: null,
		});
		await seedLibraryPart(client, {
			id: "ltp-p1-adv",
			testId: "lt-p1-adv",
			part: "p1",
			title: "Passage 1",
			source: "",
			passage: PASSAGE_ADVERTISING,
		});
		await seedAssignmentTest(client, {
			id: "at-p1-inf03",
			orgId: "org-1",
			title: "Advertising Needs Attention",
			collection: "Lớp IELTS 7.0",
			testGroup: "Tuần 3",
			libraryRef: "lt-p1-adv",
		});
		await seedAssignmentPrompt(client, {
			id: "ap-p1-inf03",
			orgId: "org-1",
			part: "p1",
			title: "Passage 1",
			source: "",
			passage: PASSAGE_ADVERTISING,
			libraryRef: "library_test_part:ltp-p1-adv",
		});
		await seedAssignmentTestPart(client, {
			id: "atp-p1-inf03",
			testId: "at-p1-inf03",
			promptId: "ap-p1-inf03",
			part: "p1",
			position: 0,
		});
		await seedAssignmentTest(client, {
			id: "at-p1-custom",
			orgId: "org-2",
			title: "Custom 1-Part P1 Test",
			collection: null,
			testGroup: null,
			libraryRef: null,
		});
		await seedAssignmentPrompt(client, {
			id: "ap-p1-custom",
			orgId: "org-2",
			part: "p1",
			title: "Passage 1",
			source: "",
			passage: PASSAGE_ADVERTISING,
			libraryRef: "library_test_part:ltp-p1-adv",
		});
		await seedAssignmentTestPart(client, {
			id: "atp-p1-custom",
			testId: "at-p1-custom",
			promptId: "ap-p1-custom",
			part: "p1",
			position: 0,
		});

		// N. Finding 2: Teacher extended a synced assignment_test (keeping library_ref) into 2 parts
		//    -> Statement C MUST NOT overwrite collection/test_group, and Statement E MUST NOT touch ap!
		await seedAssignmentTest(client, {
			id: "at-teacher-extended",
			orgId: "org-2",
			title: "Termite Mounds",
			collection: null,
			testGroup: null,
			libraryRef: "lt-termite",
		});
		await seedAssignmentPrompt(client, {
			id: "ap-ext-p1",
			orgId: "org-2",
			part: "p1",
			title: "Passage 1: Termite Mounds",
			source: "",
			passage: PASSAGE_TERMITE,
			libraryRef: "library_test_part:ltp-termite",
		});
		await seedAssignmentPrompt(client, {
			id: "ap-ext-p2",
			orgId: "org-2",
			part: "p2",
			title: "Teacher Added P2",
			source: "",
			passage: "<p>Extra teacher passage</p>",
			libraryRef: null,
		});
		await seedAssignmentTestPart(client, {
			id: "atp-ext-1",
			testId: "at-teacher-extended",
			promptId: "ap-ext-p1",
			part: "p1",
			position: 0,
		});
		await seedAssignmentTestPart(client, {
			id: "atp-ext-2",
			testId: "at-teacher-extended",
			promptId: "ap-ext-p2",
			part: "p2",
			position: 1,
		});

		// O. Finding 4: Admin manually moved a p1 library test ("Team Building") to p3 while org copy stayed at p1
		//    -> Statement D & E require ltp.part = m.part, so org copy MUST stay at p1 untouched!
		await seedLibraryTest(client, {
			id: "lt-admin-moved",
			title: "Team Building",
			collection: "Trainer",
			testGroup: "Passage 1",
		});
		await seedLibraryPart(client, {
			id: "ltp-admin-moved",
			testId: "lt-admin-moved",
			part: "p3",
			title: "Passage 3",
			source: "Trainer — Passage 1",
			passage: PASSAGE_TEAM,
		});
		await seedAssignmentTest(client, {
			id: "at-admin-moved",
			orgId: "org-1",
			title: "Team Building",
			collection: "Trainer",
			testGroup: "Passage 1",
			libraryRef: "lt-admin-moved",
		});
		await seedAssignmentPrompt(client, {
			id: "ap-admin-moved",
			orgId: "org-1",
			part: "p1",
			title: "Passage 1",
			source: "",
			passage: PASSAGE_TEAM,
			libraryRef: "library_test_part:ltp-admin-moved",
		});
		await seedAssignmentTestPart(client, {
			id: "atp-admin-moved",
			testId: "at-admin-moved",
			promptId: "ap-admin-moved",
			part: "p1",
			position: 0,
		});

		// P. Standalone Study Pack prompt (0 rows in assignment_test_part) IS cleanly upgraded by Statement E!
		await seedOrg(client, "org-standalone");
		await seedAssignmentPrompt(client, {
			id: "ap-standalone-pack",
			orgId: "org-standalone",
			part: "p1",
			title: "The Falkirk Wheel — P1",
			source: "",
			passage: PASSAGE_FALKIRK,
			libraryRef: "library_test_part:ltp-falkirk",
		});

		// Q. Ambiguous Coral reefs passage containing BOTH 'london zoo' AND 'calcium carbonate' (COUNT(*) = 2)
		//    -> skipped safely without arbitrary update!
		await seedLibraryTest(client, {
			id: "lt-coral-ambig",
			title: "Coral reefs",
			collection: null,
			testGroup: null,
		});
		await seedLibraryPart(client, {
			id: "ltp-coral-ambig",
			testId: "lt-coral-ambig",
			part: "p1",
			title: "Passage 1",
			source: "",
			passage: `${PASSAGE_CORAL_C20} ${PASSAGE_CORAL_COLL}`,
		});

		const rawSql = readFileSync(
			`${MIGRATIONS_DIR}/${migration0094File()}`,
			"utf8",
		);
		await client.executeMultiple(rawSql);

		// A. Teacher custom untouched
		expect(
			(await readRow(client, "assignment_test", "at-teacher-custom"))
				.collection,
		).toBeNull();
		expect(
			(await readRow(client, "assignment_test_part", "atp-teacher-custom"))
				.part,
		).toBe("p1");
		expect(
			(await readRow(client, "assignment_prompt", "ap-teacher-custom")).part,
		).toBe("p1");

		// B. Short-title custom hijack prevented
		expect(
			(await readRow(client, "library_test", "lt-custom-team")).collection,
		).toBeNull();
		expect(
			(await readRow(client, "library_test_part", "ltp-custom-team")).source,
		).toBe("");
		expect(
			(await readRow(client, "library_test", "lt-custom-diabetes")).collection,
		).toBeNull();
		expect(
			(await readRow(client, "library_test_part", "ltp-custom-diabetes"))
				.source,
		).toBe("");

		// C. Admin custom collection untouched on both library_test and library_test_part
		expect(
			(await readRow(client, "library_test", "lt-custom-coral")).collection,
		).toBe("Bộ đề riêng");
		expect(
			(await readRow(client, "library_test", "lt-custom-coral")).test_group,
		).toBe("Đề tự biên soạn");
		expect(
			(await readRow(client, "library_test_part", "ltp-custom-coral")).part,
		).toBe("p1");
		expect(
			(await readRow(client, "library_test_part", "ltp-custom-coral")).source,
		).toBe("");

		// D. Multi-part library test untouched
		expect(
			(await readRow(client, "library_test", "lt-multi")).collection,
		).toBeNull();
		expect(
			(await readRow(client, "library_test_part", "ltp-multi-p1")).part,
		).toBe("p1");
		expect(
			(await readRow(client, "library_test_part", "ltp-multi-p1")).source,
		).toBe("");

		// E. INF-03 customized collection untouched across at, atp, AND ap (including ap.source!)
		const atInfCol = await readRow(client, "assignment_test", "at-inf03-col");
		expect(atInfCol.collection).toBe("Lớp IELTS 7.0");
		expect(atInfCol.test_group).toBe("Tuần 3");
		const atpInfCol = await readRow(
			client,
			"assignment_test_part",
			"atp-inf03-col",
		);
		expect(atpInfCol.part).toBe("p1");
		expect(Number(atpInfCol.position)).toBe(0);
		const apInfCol = await readRow(client, "assignment_prompt", "ap-inf03-col");
		expect(apInfCol.part).toBe("p1");
		expect(apInfCol.source).toBe("");

		// F. INF-03 teacher-edited passage untouched on ap + atp
		const atpInfPass = await readRow(
			client,
			"assignment_test_part",
			"atp-inf03-passage",
		);
		expect(atpInfPass.part).toBe("p1");
		expect(Number(atpInfPass.position)).toBe(0);
		const apInfPass = await readRow(
			client,
			"assignment_prompt",
			"ap-inf03-passage",
		);
		expect(apInfPass.part).toBe("p1");
		expect(apInfPass.source).toBe("");

		// G. Single-use library prompt in custom 1-part test: blocked on ap.part AND ap.source!
		const atpCustomSingle = await readRow(
			client,
			"assignment_test_part",
			"atp-custom-single",
		);
		const apCustomSingle = await readRow(
			client,
			"assignment_prompt",
			"ap-custom-single-lib",
		);
		expect(atpCustomSingle.part).toBe("p1");
		expect(apCustomSingle.part).toBe("p1");
		expect(apCustomSingle.source).toBe("");

		// H. Shared prompt: both atp rows AND ap stay at p1 / source=''
		expect(
			(await readRow(client, "assignment_test_part", "atp-shared-synced")).part,
		).toBe("p1");
		expect(
			(await readRow(client, "assignment_test_part", "atp-shared-multi-1"))
				.part,
		).toBe("p1");
		const apShared = await readRow(client, "assignment_prompt", "ap-shared");
		expect(apShared.part).toBe("p1");
		expect(apShared.source).toBe("");

		// I. Listening untouched
		expect(
			(await readRow(client, "library_test", "lt-listen-collide")).collection,
		).toBeNull();
		expect(
			(await readRow(client, "library_test_part", "ltp-listen-collide")).part,
		).toBe("s1");

		// J. Wildcard library_ref untouched
		const apWild = await readRow(
			client,
			"assignment_prompt",
			"ap-wildcard-ref",
		);
		expect(apWild.part).toBe("p1");
		expect(apWild.source).toBe("");

		// K. Already p2 with custom title: backfills collection & source, preserves test_group/part/title
		const ltP2 = await readRow(client, "library_test", "lt-already-p2");
		expect(ltP2.collection).toBe("Cambridge IELTS 11");
		expect(ltP2.test_group).toBe("Test 1");
		const ltpP2 = await readRow(client, "library_test_part", "ltp-already-p2");
		expect(ltpP2.part).toBe("p2");
		expect(ltpP2.title).toBe("Tiêu đề riêng");
		expect(ltpP2.source).toBe("Cambridge IELTS 11 Test 1 — Passage 2");

		// L. quiz_attempt snapshot and study_pack_item untouched
		const qa = await readRow(client, "quiz_attempt", "qa-1");
		expect(qa.questions_snapshot).toBe(snapshotJson);
		const spi = await readRow(client, "study_pack_item", "spi-1");
		expect(spi.source_id).toBe("ltp-falkirk");

		// M. p1 INF-03 & p1 custom 1-part: ap.source MUST stay '' (Finding 1)
		expect(
			(await readRow(client, "assignment_test", "at-p1-inf03")).collection,
		).toBe("Lớp IELTS 7.0");
		expect(
			(await readRow(client, "assignment_prompt", "ap-p1-inf03")).source,
		).toBe("");
		expect(
			(await readRow(client, "assignment_prompt", "ap-p1-custom")).source,
		).toBe("");

		// N. Teacher-extended multi-part copy: collection/test_group AND ap untouched (Finding 2)
		const atExt = await readRow(
			client,
			"assignment_test",
			"at-teacher-extended",
		);
		expect(atExt.collection).toBeNull();
		expect(atExt.test_group).toBeNull();
		const apExt = await readRow(client, "assignment_prompt", "ap-ext-p1");
		expect(apExt.part).toBe("p1");
		expect(apExt.source).toBe("");

		// O. Admin manually moved p1 test to p3: org copy stays at p1 (Finding 4)
		expect(
			(await readRow(client, "assignment_test_part", "atp-admin-moved")).part,
		).toBe("p1");
		expect(
			(await readRow(client, "assignment_prompt", "ap-admin-moved")).part,
		).toBe("p1");

		// P. Standalone Study Pack prompt (0 assignment_test_part rows) upgraded cleanly
		const apStandalone = await readRow(
			client,
			"assignment_prompt",
			"ap-standalone-pack",
		);
		expect(apStandalone.part).toBe("p2");
		expect(apStandalone.source).toBe("Cambridge IELTS 11 Test 1 — Passage 2");
		expect(apStandalone.title).toBe("The Falkirk Wheel — P2");

		// Q. Ambiguous Coral reefs (matches 2 rows) skipped safely
		expect(
			(await readRow(client, "library_test", "lt-coral-ambig")).collection,
		).toBeNull();
		expect(
			(await readRow(client, "library_test_part", "ltp-coral-ambig")).part,
		).toBe("p1");
		expect(
			(await readRow(client, "library_test_part", "ltp-coral-ambig")).source,
		).toBe("");

		// Global invariant check: no assignment_test_part diverges from its assignment_prompt.part!
		const mismatches = await client.execute(`
			SELECT atp.id
			FROM assignment_test_part atp
			INNER JOIN assignment_prompt ap ON ap.id = atp.prompt_id
			WHERE atp.part <> ap.part
		`);
		expect(mismatches.rows).toHaveLength(0);
	});

	test("3. preserves idempotency (sentinel updated_at = 1000), survives dirty retry tables, and upgrades cleanly via Drizzle migrate()", async () => {
		// 1. Journal integrity check
		const journal = JSON.parse(
			readFileSync(`${MIGRATIONS_DIR}/meta/_journal.json`, "utf8"),
		) as {
			entries: Array<{
				idx: number;
				tag: string;
				when: number;
				breakpoints: boolean;
			}>;
		};
		const entry93 = journal.entries.find((e) => e.idx === 93);
		const entry94 = journal.entries.find((e) => e.idx === 94);
		expect(entry93).toBeDefined();
		expect(entry94).toBeDefined();
		expect(entry94?.tag).toBe(
			"0094_backfill_reading_library_collection_and_part",
		);
		expect(entry94?.breakpoints).toBe(true);
		expect(entry94?.when).toBeGreaterThan(entry93?.when ?? 0);

		// 2. Idempotency with sentinel updated_at = 1000 + dirty _tmp_* retry safety
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0093_orange_vin_gonzales.sql");
		await seedOrg(client, "org-idem");
		await seedLibraryTest(client, {
			id: "lt-idem",
			title: "The Falkirk Wheel",
			collection: null,
			testGroup: null,
		});
		await seedLibraryPart(client, {
			id: "ltp-idem",
			testId: "lt-idem",
			part: "p1",
			title: "The Falkirk Wheel — P1",
			passage: PASSAGE_FALKIRK,
		});
		await seedAssignmentTest(client, {
			id: "at-idem",
			orgId: "org-idem",
			title: "The Falkirk Wheel",
			collection: null,
			testGroup: null,
			libraryRef: "lt-idem",
		});
		await seedAssignmentPrompt(client, {
			id: "ap-idem",
			orgId: "org-idem",
			part: "p1",
			title: "The Falkirk Wheel — P1",
			passage: PASSAGE_FALKIRK,
			libraryRef: "library_test_part:ltp-idem",
		});
		await seedAssignmentTestPart(client, {
			id: "atp-idem",
			testId: "at-idem",
			promptId: "ap-idem",
			part: "p1",
			position: 0,
		});

		// Pre-create dirty temp tables simulating an interrupted prior attempt
		await client.execute("CREATE TABLE `_tmp_reading_meta_0094` (stale text)");
		await client.execute(
			"INSERT INTO `_tmp_reading_meta_0094` (stale) VALUES ('garbage')",
		);
		await client.execute(
			"CREATE TABLE `_tmp_blocked_prompt_0094` (stale text)",
		);
		await client.execute(
			"INSERT INTO `_tmp_blocked_prompt_0094` (stale) VALUES ('garbage')",
		);

		await applyFile(client, migration0094File());

		// Set sentinel updated_at = 1000 on all timestamped tables
		await client.execute(
			"UPDATE library_test SET updated_at = 1000 WHERE id = 'lt-idem'",
		);
		await client.execute(
			"UPDATE library_test_part SET updated_at = 1000 WHERE id = 'ltp-idem'",
		);
		await client.execute(
			"UPDATE assignment_test SET updated_at = 1000 WHERE id = 'at-idem'",
		);

		// Second run must be a total no-op (preserving sentinel updated_at = 1000)
		await applyFile(client, migration0094File());

		const ltIdem = await readRow(client, "library_test", "lt-idem");
		expect(ltIdem.collection).toBe("Cambridge IELTS 11");
		expect(ltIdem.test_group).toBe("Test 1");
		expect(Number(ltIdem.updated_at)).toBe(1000);

		const ltpIdem = await readRow(client, "library_test_part", "ltp-idem");
		expect(ltpIdem.part).toBe("p2");
		expect(ltpIdem.source).toBe("Cambridge IELTS 11 Test 1 — Passage 2");
		expect(ltpIdem.title).toBe("The Falkirk Wheel — P2");
		expect(Number(ltpIdem.updated_at)).toBe(1000);

		const atIdem = await readRow(client, "assignment_test", "at-idem");
		expect(atIdem.collection).toBe("Cambridge IELTS 11");
		expect(atIdem.test_group).toBe("Test 1");
		expect(Number(atIdem.updated_at)).toBe(1000);

		const leftovers = await client.execute(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '_tmp_%0094'",
		);
		expect(leftovers.rows).toHaveLength(0);

		// 3. Drizzle migrate() upgrade from 0093 -> 0094
		const drizzleClient = createClient({ url: "file::memory:" });
		await applyThrough(drizzleClient, "0093_orange_vin_gonzales.sql");
		await drizzleClient.execute(`
			CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at numeric
			)
		`);
		await drizzleClient.execute({
			sql: 'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (?, ?)',
			args: ["seeded-through-0093", entry93?.when ?? 0],
		});
		await seedOrg(drizzleClient, "org-m");
		await seedLibraryTest(drizzleClient, {
			id: "lt-m",
			title: "Termite Mounds",
			collection: null,
			testGroup: null,
		});
		await seedLibraryPart(drizzleClient, {
			id: "ltp-m",
			testId: "lt-m",
			part: "p1",
			title: "Passage 1: Termite Mounds",
			passage: PASSAGE_TERMITE,
		});
		await seedAssignmentTest(drizzleClient, {
			id: "at-m",
			orgId: "org-m",
			title: "Termite Mounds",
			collection: null,
			testGroup: null,
			libraryRef: "lt-m",
		});
		await seedAssignmentPrompt(drizzleClient, {
			id: "ap-m",
			orgId: "org-m",
			part: "p1",
			title: "Passage 1: Termite Mounds",
			passage: PASSAGE_TERMITE,
			libraryRef: "library_test_part:ltp-m",
		});
		await seedAssignmentTestPart(drizzleClient, {
			id: "atp-m",
			testId: "at-m",
			promptId: "ap-m",
			part: "p1",
			position: 0,
		});

		const db = drizzle(drizzleClient, { schema });
		await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

		expect(
			(await readRow(drizzleClient, "library_test", "lt-m")).collection,
		).toBe("Collection");
		expect(
			(await readRow(drizzleClient, "library_test_part", "ltp-m")).part,
		).toBe("p3");
		expect(
			(await readRow(drizzleClient, "assignment_test", "at-m")).collection,
		).toBe("Collection");
		expect(
			(await readRow(drizzleClient, "assignment_test_part", "atp-m")).part,
		).toBe("p3");
		expect(
			Number(
				(await readRow(drizzleClient, "assignment_test_part", "atp-m"))
					.position,
			),
		).toBe(2);
		expect(
			(await readRow(drizzleClient, "assignment_prompt", "ap-m")).part,
		).toBe("p3");
	});

	test("4. HTTP API E2E returns naturally sorted Reading facets (Bộ đề + Phần thi) on both org-existing and org-new and clean Admin/Quiz details", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0093_orange_vin_gonzales.sql");

		await seedOrg(client, "org-existing");
		await seedOrg(client, "org-new");
		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, email) VALUES ('stu-1', 'org-existing', 'Hoa', 'hoa@test.local')",
			args: [],
		});
		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, email) VALUES ('stu-2', 'org-new', 'Hoa', 'hoa@test.local')",
			args: [],
		});

		const catalogFixtures = [
			{
				key: "drop",
				title: "Making Every Drop Count",
				collection: null,
				passage: PASSAGE_DROP,
			},
			{
				key: "falkirk",
				title: "The Falkirk Wheel",
				collection: null,
				passage: PASSAGE_FALKIRK,
			},
			{
				key: "coral-c20",
				title: "Coral reefs",
				collection: null,
				passage: PASSAGE_CORAL_C20,
			},
			{
				key: "coral-coll",
				title: "Coral Reefs",
				collection: "",
				passage: PASSAGE_CORAL_COLL,
			},
			{
				key: "termite",
				title: "Termite Mounds",
				collection: null,
				passage: PASSAGE_TERMITE,
			},
			{
				key: "adv",
				title: "Advertising Needs Attention",
				collection: "Unknown",
				passage: PASSAGE_ADVERTISING,
			},
			{
				key: "team",
				title: "Team Building",
				collection: null,
				passage: PASSAGE_TEAM,
			},
			{
				key: "traffic",
				title: "Solving Traffic Problems in Big Cities",
				collection: "Step IELTS",
				passage: PASSAGE_TRAFFIC,
			},
		];

		for (const f of catalogFixtures) {
			await seedLibraryTest(client, {
				id: `lt-${f.key}`,
				title: f.title,
				collection: f.collection,
				testGroup: null,
			});
			await seedLibraryPart(client, {
				id: `ltp-${f.key}`,
				testId: `lt-${f.key}`,
				part: "p1",
				title: `${f.title} — P1`,
				passage: f.passage,
			});
			// Pre-synced org-existing graph (before migration)
			await seedAssignmentTest(client, {
				id: `at-ex-${f.key}`,
				orgId: "org-existing",
				title: f.title,
				collection: f.collection,
				testGroup: null,
				libraryRef: `lt-${f.key}`,
			});
			await seedAssignmentPrompt(client, {
				id: `ap-ex-${f.key}`,
				orgId: "org-existing",
				part: "p1",
				title: `${f.title} — P1`,
				passage: f.passage,
				libraryRef: `library_test_part:ltp-${f.key}`,
			});
			await seedAssignmentTestPart(client, {
				id: `atp-ex-${f.key}`,
				testId: `at-ex-${f.key}`,
				promptId: `ap-ex-${f.key}`,
				part: "p1",
				position: 0,
			});
		}

		const rawSql = readFileSync(
			`${MIGRATIONS_DIR}/${migration0094File()}`,
			"utf8",
		);
		await client.executeMultiple(rawSql);

		const drizzleDb = drizzle(client, { schema });
		const app = buildApp({
			getDb: () => drizzleDb as unknown as Db,
			corsOrigin: ["http://localhost:8003"],
			adminEmails: ["admin@test.local"],
			adminOrigins: ["http://localhost:8004"],
			getSessionUser: async (headers: Headers): Promise<SessionUser | null> => {
				const user = headers.get("x-test-user");
				if (user === "admin") {
					return {
						userId: "u-admin",
						userName: "Admin",
						email: "admin@test.local",
						emailVerified: true,
						role: "admin",
					};
				}
				if (user === "hoa") {
					return {
						userId: "u-hoa",
						userName: "Hoa",
						email: "hoa@test.local",
						emailVerified: true,
						role: "student",
					};
				}
				return null;
			},
			authHandler: () => new Response("auth OK"),
		});

		// 1. Both org-existing and org-new return naturally sorted collections & p1/p2/p3 facets
		for (const orgId of ["org-existing", "org-new"]) {
			const res = await app.request(
				"/api/student/practice?skill=reading&facets=1",
				{ headers: { "x-test-user": "hoa", "x-student-org-id": orgId } },
			);
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				total: number;
				facets: { collections: string[]; parts: string[] };
			};
			expect(body.total).toBe(8);
			expect(body.facets.collections).toEqual([
				"Actual Test",
				"Cambridge IELTS 7",
				"Cambridge IELTS 11",
				"Cambridge IELTS 20",
				"Collection",
				"Other sources",
				"Trainer",
			]);
			expect(body.facets.parts).toEqual(["p1", "p2", "p3"]);
		}

		// 2. Filter collection=Cambridge IELTS 20 + part=p2 -> Coral reefs (C20T3)
		const coralRes = await app.request(
			"/api/student/practice?skill=reading&facets=1&collection=Cambridge+IELTS+20&part=p2",
			{ headers: { "x-test-user": "hoa", "x-student-org-id": "org-existing" } },
		);
		expect(coralRes.status).toBe(200);
		const coralBody = (await coralRes.json()) as {
			items: Array<{
				title: string;
				collection: string | null;
				testGroup: string | null;
			}>;
		};
		expect(coralBody.items).toHaveLength(1);
		expect(coralBody.items[0]).toMatchObject({
			title: "Coral reefs",
			collection: "Cambridge IELTS 20",
			testGroup: "Test 3",
		});

		// 3. Filter part=p3 -> Termite Mounds
		const p3Res = await app.request(
			"/api/student/practice?skill=reading&facets=1&part=p3",
			{ headers: { "x-test-user": "hoa", "x-student-org-id": "org-new" } },
		);
		expect(p3Res.status).toBe(200);
		const p3Body = (await p3Res.json()) as {
			items: Array<{ title: string }>;
		};
		expect(p3Body.items.map((item) => item.title)).toEqual(["Termite Mounds"]);

		// 4. Student quiz detail for The Falkirk Wheel returns p2 + Cambridge IELTS 11 / Test 1
		const quizRes = await app.request(
			"/api/student/practice/at-ex-falkirk/quiz",
			{ headers: { "x-test-user": "hoa", "x-student-org-id": "org-existing" } },
		);
		expect(quizRes.status).toBe(200);
		const quizBody = (await quizRes.json()) as {
			part: string;
			collection: string | null;
			testGroup: string | null;
		};
		expect(quizBody.part).toBe("p2");
		expect(quizBody.collection).toBe("Cambridge IELTS 11");
		expect(quizBody.testGroup).toBe("Test 1");

		// 5. Admin list & detail return collection, testGroup, and parts[0].part === "p2"
		const adminListRes = await app.request(
			"/api/admin/library/tests?skill=reading",
			{ headers: { "x-test-user": "admin" } },
		);
		expect(adminListRes.status).toBe(200);
		const adminList = (await adminListRes.json()) as {
			tests: Array<{
				id: string;
				collection: string | null;
				testGroup: string | null;
			}>;
		};
		const falkirkAdmin = adminList.tests.find((t) => t.id === "lt-falkirk");
		expect(falkirkAdmin).toMatchObject({
			collection: "Cambridge IELTS 11",
			testGroup: "Test 1",
		});

		const adminDetailRes = await app.request(
			"/api/admin/library/tests/lt-falkirk",
			{ headers: { "x-test-user": "admin" } },
		);
		expect(adminDetailRes.status).toBe(200);
		const adminDetail = (await adminDetailRes.json()) as {
			collection: string | null;
			testGroup: string | null;
			parts: Array<{ part: string; source: string }>;
		};
		expect(adminDetail.collection).toBe("Cambridge IELTS 11");
		expect(adminDetail.testGroup).toBe("Test 1");
		expect(adminDetail.parts[0]).toMatchObject({
			part: "p2",
			source: "Cambridge IELTS 11 Test 1 — Passage 2",
		});

		// Confirm org-existing prompts were updated in place without recreating rows.
		const existingPrompts = await drizzleDb
			.select()
			.from(schema.assignmentPrompt)
			.where(eq(schema.assignmentPrompt.orgId, "org-existing"));
		expect(existingPrompts).toHaveLength(8);
	});
});
