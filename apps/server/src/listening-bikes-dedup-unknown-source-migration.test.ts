/**
 * Verifies migration 0092 safely demotes legacy manual "Talking about the
 * history of bikes" duplicates (and their synced `assignment_test` copies) to
 * `draft` with canonical fail-closed guards, normalizes `Unknown` source labels
 * to `Other sources` across all four tables while preserving INF-03 and Zod
 * max(200) invariants, preserves historical `quiz_attempt` review/audio +
 * `/history`, and passes both Alchemy flat SQL execution and Drizzle migrator.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Client, createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, test } from "vitest";
import { buildApp, type Db } from "./app";
import type { MediaStore } from "./lib/media-store";
import type { SessionUser } from "./session";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url).href,
);

const CANONICAL_BIKES_TEST_ID =
	"lib-listen-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3";
const CANONICAL_BIKES_PART_ID =
	"lib-listen-part-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3-s4";
const CANONICAL_BIKES_AUDIO_KEY =
	"library-listening/83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3.mp3";
const DEPRECATION_MARKER = `[Duplicate of ${CANONICAL_BIKES_TEST_ID}]`;

const SIBLING_UNKNOWN_TEST_ID =
	"lib-listen-0c07c56f-6946-41fd-97e0-06001b159046";
const SIBLING_UNKNOWN_PART_ID =
	"lib-listen-part-0c07c56f-6946-41fd-97e0-06001b159046-s1";

const CAMBRIDGE_TEST_ID = "lib-listen-cambridge-18-t1-s1";
const CAMBRIDGE_PART_ID = "lib-listen-part-cambridge-18-t1-s1";

const SAMPLE_QUESTIONS = JSON.stringify([
	{
		stem: "need ____ than walking",
		opts: null,
		answer: "less effort",
		alts: "",
		type: "tablecomp",
		pin: null,
	},
]);

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

function migration0092File(): string {
	const file = migrationFiles().find((name) => name.startsWith("0092_"));
	if (!file) throw new Error("migration 0092 not found");
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
		description?: string | null;
		updatedAt?: number;
	},
) {
	await client.execute({
		sql: "INSERT INTO library_test (id, title, description, skill, collection, test_group, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
		args: [
			opts.id,
			opts.title,
			opts.description === undefined ? null : opts.description,
			opts.skill ?? "listening",
			opts.collection === undefined ? null : opts.collection,
			opts.testGroup === undefined ? null : opts.testGroup,
			opts.status ?? "ready",
			opts.updatedAt ?? 500,
		],
	});
}

async function seedLibraryPart(
	client: Client,
	opts: {
		id: string;
		testId: string;
		part: string;
		source?: string;
		audioKey?: string | null;
		updatedAt?: number;
	},
) {
	await client.execute({
		sql: "INSERT INTO library_test_part (id, test_id, part, type, title, source, questions, audio_key, audio_name, audio_content_type, audio_size, updated_at) VALUES (?, ?, ?, 'tablecomp', 'Part title', ?, ?, ?, 'audio.mp3', 'audio/mpeg', 6, ?)",
		args: [
			opts.id,
			opts.testId,
			opts.part,
			opts.source ?? "",
			SAMPLE_QUESTIONS,
			opts.audioKey === undefined ? CANONICAL_BIKES_AUDIO_KEY : opts.audioKey,
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
		sql: "INSERT INTO assignment_test (id, org_id, title, skill, collection, test_group, status, library_ref, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		args: [
			opts.id,
			opts.orgId,
			opts.title,
			opts.skill ?? "listening",
			opts.collection === undefined ? null : opts.collection,
			opts.testGroup === undefined ? null : opts.testGroup,
			opts.status ?? "ready",
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
		skill?: string;
		part?: string;
		source?: string;
		libraryRef?: string | null;
		audioKey?: string | null;
	},
) {
	await client.execute({
		sql: "INSERT INTO assignment_prompt (id, org_id, task, genre, skill, part, type, title, prompt, source, questions, audio_key, audio_name, library_ref, status) VALUES (?, ?, 'task2', '', ?, ?, 'tablecomp', 'Prompt title', '', ?, ?, ?, 'audio.mp3', ?, 'ready')",
		args: [
			opts.id,
			opts.orgId,
			opts.skill ?? "listening",
			opts.part ?? "s4",
			opts.source ?? "",
			SAMPLE_QUESTIONS,
			opts.audioKey === undefined ? CANONICAL_BIKES_AUDIO_KEY : opts.audioKey,
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
			opts.part ?? "s4",
			opts.position ?? 0,
		],
	});
}

async function seedCanonicalBikes(
	client: Client,
	opts?: {
		status?: string;
		collection?: string | null;
		withPart?: boolean;
		audioKey?: string | null;
		updatedAt?: number;
	},
) {
	await seedLibraryTest(client, {
		id: CANONICAL_BIKES_TEST_ID,
		title: "Talking about the history of bikes",
		collection: opts?.collection === undefined ? "Unknown" : opts.collection,
		testGroup: "Section 4",
		status: opts?.status ?? "ready",
		updatedAt: opts?.updatedAt ?? 500,
	});
	if (opts?.withPart !== false) {
		await seedLibraryPart(client, {
			id: CANONICAL_BIKES_PART_ID,
			testId: CANONICAL_BIKES_TEST_ID,
			part: "s4",
			source: "Unknown — Section 4",
			audioKey:
				opts?.audioKey === undefined
					? CANONICAL_BIKES_AUDIO_KEY
					: opts.audioKey,
			updatedAt: opts?.updatedAt ?? 500,
		});
	}
}

describe("listening bikes dedup & Unknown source normalization migration 0092", () => {
	test("Case 1: demotes legacy Bikes duplicates, normalizes Unknown -> Other sources across 4 tables via flat SQL, preserves history & study_pack_item", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0091_fix_reading_shares_duplicated_title.sql");
		await seedOrg(client, "org-1");

		await seedCanonicalBikes(client);
		await seedLibraryTest(client, {
			id: SIBLING_UNKNOWN_TEST_ID,
			title: "Advice",
			collection: "  unknown  ",
			testGroup: "Section 1",
		});
		await seedLibraryPart(client, {
			id: SIBLING_UNKNOWN_PART_ID,
			testId: SIBLING_UNKNOWN_TEST_ID,
			part: "s1",
			source: "Unknown",
		});

		// Legacy manual row 1: NULL collection & NULL test_group, NBSP + mixed casing, existing description
		await seedLibraryTest(client, {
			id: "manual-bikes-legacy-id",
			title: "  Talking About The History Of Bikes\u00a0",
			collection: null,
			testGroup: null,
			description: "Old note",
		});
		await seedLibraryPart(client, {
			id: "manual-bikes-legacy-part",
			testId: "manual-bikes-legacy-id",
			part: "s4",
			source: "",
		});

		// Legacy manual row 2: blank collection, test_group = 'Section 4', trailing CR, NULL description
		await seedLibraryTest(client, {
			id: "manual-bikes-s4-group-id",
			title: "Talking about the history of bikes\r",
			collection: "",
			testGroup: "Section 4",
			description: null,
		});
		await seedLibraryPart(client, {
			id: "manual-bikes-s4-group-part",
			testId: "manual-bikes-s4-group-id",
			part: "s4",
			source: "",
		});

		// study_pack_item referencing legacy library_test_part must remain intact (no DELETE cascade)
		await client.execute({
			sql: "INSERT INTO study_pack (id, org_id, title, description, level, status) VALUES ('sp-1', NULL, 'Pack 1', '', 'B1', 'ready')",
			args: [],
		});
		await client.execute({
			sql: "INSERT INTO study_pack_item (id, pack_id, day_index, position, source_kind, source_id, note) VALUES ('spi-1', 'sp-1', 1, 0, 'library_test_part', 'manual-bikes-legacy-part', '')",
			args: [],
		});

		// Org copies on org-1
		await seedAssignmentTest(client, {
			id: "at-canonical-bikes",
			orgId: "org-1",
			title: "Talking about the history of bikes",
			collection: "Unknown",
			testGroup: "Section 4",
			libraryRef: CANONICAL_BIKES_TEST_ID,
		});
		await seedAssignmentPrompt(client, {
			id: "ap-canonical-bikes",
			orgId: "org-1",
			part: "s4",
			source: "Unknown — Section 4",
			libraryRef: `library_test_part:${CANONICAL_BIKES_PART_ID}`,
		});
		await seedAssignmentTestPart(client, {
			id: "atp-canonical-bikes",
			testId: "at-canonical-bikes",
			promptId: "ap-canonical-bikes",
			part: "s4",
		});

		await seedAssignmentTest(client, {
			id: "at-sibling-unknown",
			orgId: "org-1",
			title: "Advice",
			collection: "  UNKNOWN ",
			testGroup: "Section 1",
			libraryRef: SIBLING_UNKNOWN_TEST_ID,
		});
		await seedAssignmentPrompt(client, {
			id: "ap-sibling-unknown",
			orgId: "org-1",
			part: "s1",
			source: "Unknown",
			libraryRef: `library_test_part:${SIBLING_UNKNOWN_PART_ID}`,
		});

		await seedAssignmentTest(client, {
			id: "at-legacy-bikes",
			orgId: "org-1",
			title: "Talking about the history of bikes",
			collection: null,
			testGroup: null,
			libraryRef: "manual-bikes-legacy-id",
		});
		await seedAssignmentTest(client, {
			id: "at-legacy-s4-group",
			orgId: "org-1",
			title: "Talking about the history of bikes",
			collection: "",
			testGroup: "Section 4",
			libraryRef: "manual-bikes-s4-group-id",
		});

		// Dangling org copy whose legacy library_test was already deleted
		await seedAssignmentTest(client, {
			id: "at-dangling-bikes",
			orgId: "org-1",
			title: "Talking about the history of bikes",
			collection: null,
			testGroup: "S4",
			libraryRef: "deleted-manual-bikes-id",
		});
		await seedAssignmentPrompt(client, {
			id: "ap-dangling-bikes",
			orgId: "org-1",
			part: "s4",
			source: "",
			libraryRef: "library_test_part:deleted-part",
		});
		await seedAssignmentTestPart(client, {
			id: "atp-dangling-bikes",
			testId: "at-dangling-bikes",
			promptId: "ap-dangling-bikes",
			part: "s4",
		});

		// Submitted practice attempt on legacy Bikes copy must stay joinable for /history
		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, email) VALUES ('stu-1', 'org-1', 'Minh', 'minh@test.local')",
			args: [],
		});
		await client.execute({
			sql: "INSERT INTO quiz_attempt (id, org_id, assignment_id, student_id, test_id, mode, status, questions_snapshot, correct_count, submitted_at) VALUES ('att-legacy-1', 'org-1', NULL, 'stu-1', 'at-legacy-bikes', 'practice', 'submitted', ?, 1, 1700000000000)",
			args: [SAMPLE_QUESTIONS],
		});

		// Execute raw flat SQL file exactly like Cloudflare D1 / Alchemy runner
		const rawSql = readFileSync(
			`${MIGRATIONS_DIR}/${migration0092File()}`,
			"utf8",
		);
		await client.executeMultiple(rawSql);

		// 1. Legacy library_test rows demoted with clean deprecation note, parts & study_pack_item intact
		const legacy1 = (
			await client.execute(
				"SELECT status, description FROM library_test WHERE id = 'manual-bikes-legacy-id'",
			)
		).rows[0];
		expect(legacy1?.status).toBe("draft");
		expect(legacy1?.description).toBe(`${DEPRECATION_MARKER} Old note`);

		const legacy2 = (
			await client.execute(
				"SELECT status, description FROM library_test WHERE id = 'manual-bikes-s4-group-id'",
			)
		).rows[0];
		expect(legacy2?.status).toBe("draft");
		expect(legacy2?.description).toBe(DEPRECATION_MARKER);

		const packItem = (
			await client.execute(
				"SELECT source_id FROM study_pack_item WHERE id = 'spi-1'",
			)
		).rows[0];
		expect(packItem?.source_id).toBe("manual-bikes-legacy-part");

		// 2. Legacy synced & dangling assignment_test copies demoted
		for (const id of [
			"at-legacy-bikes",
			"at-legacy-s4-group",
			"at-dangling-bikes",
		]) {
			const row = (
				await client.execute({
					sql: "SELECT status FROM assignment_test WHERE id = ?",
					args: [id],
				})
			).rows[0];
			expect(row?.status, `expected ${id} to be demoted`).toBe("draft");
		}

		// 3. Submitted quiz_attempt keeps non-null test_id and remains visible to INNER JOIN (/history)
		const historyJoin = await client.execute(`
			SELECT qa.id, qa.test_id, at.title, at.skill
			FROM quiz_attempt qa
			INNER JOIN assignment_test at ON at.id = qa.test_id AND at.org_id = qa.org_id
			WHERE qa.id = 'att-legacy-1'
		`);
		expect(historyJoin.rows).toHaveLength(1);
		expect(historyJoin.rows[0]?.test_id).toBe("at-legacy-bikes");
		expect(historyJoin.rows[0]?.title).toBe(
			"Talking about the history of bikes",
		);

		// 4. Unknown normalized to Other sources across all 4 tables
		const canonLt = (
			await client.execute({
				sql: "SELECT status, collection FROM library_test WHERE id = ?",
				args: [CANONICAL_BIKES_TEST_ID],
			})
		).rows[0];
		expect(canonLt?.status).toBe("ready");
		expect(canonLt?.collection).toBe("Other sources");

		const siblingLt = (
			await client.execute({
				sql: "SELECT collection FROM library_test WHERE id = ?",
				args: [SIBLING_UNKNOWN_TEST_ID],
			})
		).rows[0];
		expect(siblingLt?.collection).toBe("Other sources");

		const canonLtp = (
			await client.execute({
				sql: "SELECT source FROM library_test_part WHERE id = ?",
				args: [CANONICAL_BIKES_PART_ID],
			})
		).rows[0];
		expect(canonLtp?.source).toBe("Other sources — Section 4");

		const siblingLtp = (
			await client.execute({
				sql: "SELECT source FROM library_test_part WHERE id = ?",
				args: [SIBLING_UNKNOWN_PART_ID],
			})
		).rows[0];
		expect(siblingLtp?.source).toBe("Other sources");

		const canonAt = (
			await client.execute(
				"SELECT status, collection FROM assignment_test WHERE id = 'at-canonical-bikes'",
			)
		).rows[0];
		expect(canonAt?.status).toBe("ready");
		expect(canonAt?.collection).toBe("Other sources");

		const siblingAt = (
			await client.execute(
				"SELECT collection FROM assignment_test WHERE id = 'at-sibling-unknown'",
			)
		).rows[0];
		expect(siblingAt?.collection).toBe("Other sources");

		const canonAp = (
			await client.execute(
				"SELECT source FROM assignment_prompt WHERE id = 'ap-canonical-bikes'",
			)
		).rows[0];
		expect(canonAp?.source).toBe("Other sources — Section 4");

		const siblingAp = (
			await client.execute(
				"SELECT source FROM assignment_prompt WHERE id = 'ap-sibling-unknown'",
			)
		).rows[0];
		expect(siblingAp?.source).toBe("Other sources");

		const fkCheck = await client.execute("PRAGMA foreign_key_check");
		expect(fkCheck.rows).toHaveLength(0);
	});

	test("Case 2: fail-closed canonical gates skip demote when canonical is missing, draft, lacks s4 part, or lacks audio_key", async () => {
		const scenarios: Array<{
			name: string;
			seedCanonical: (client: Client) => Promise<void>;
		}> = [
			{
				name: "missing canonical",
				seedCanonical: async () => undefined,
			},
			{
				name: "canonical is draft",
				seedCanonical: async (client) => {
					await seedCanonicalBikes(client, { status: "draft" });
				},
			},
			{
				name: "canonical ready without s4 part",
				seedCanonical: async (client) => {
					await seedCanonicalBikes(client, { withPart: false });
				},
			},
			{
				name: "canonical ready with blank audio_key",
				seedCanonical: async (client) => {
					await seedCanonicalBikes(client, { audioKey: "   " });
				},
			},
		];

		for (const scenario of scenarios) {
			const client = createClient({ url: "file::memory:" });
			await applyThrough(
				client,
				"0091_fix_reading_shares_duplicated_title.sql",
			);
			await seedOrg(client, "org-1");
			await scenario.seedCanonical(client);

			await seedLibraryTest(client, {
				id: "manual-bikes-id",
				title: "Talking about the history of bikes",
				collection: null,
				testGroup: null,
			});
			await seedLibraryPart(client, {
				id: "manual-bikes-part",
				testId: "manual-bikes-id",
				part: "s4",
			});
			await seedAssignmentTest(client, {
				id: "at-manual-bikes",
				orgId: "org-1",
				title: "Talking about the history of bikes",
				collection: null,
				testGroup: null,
				libraryRef: "manual-bikes-id",
			});

			await applyFile(client, migration0092File());

			const lt = (
				await client.execute(
					"SELECT status FROM library_test WHERE id = 'manual-bikes-id'",
				)
			).rows[0];
			const at = (
				await client.execute(
					"SELECT status FROM assignment_test WHERE id = 'at-manual-bikes'",
				)
			).rows[0];
			expect(lt?.status, scenario.name).toBe("ready");
			expect(at?.status, scenario.name).toBe("ready");
		}
	}, 20_000);

	test("Case 3: protects INF-03 org customizations, teacher-authored tests, custom/multi-part Listening tests, Zod max(200), and wildcard spoofing", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0091_fix_reading_shares_duplicated_title.sql");

		for (const orgId of [
			"org-author",
			"org-cambridge",
			"org-custom",
			"org-long",
			"org-spoof",
			"org-dangling-multi",
		]) {
			await seedOrg(client, orgId);
		}

		await seedCanonicalBikes(client);

		// 3b: Custom non-lib-listen Listening test with explicit collection
		await seedLibraryTest(client, {
			id: "custom-mock-bikes",
			title: "Talking about the history of bikes",
			collection: "Mock Exam 2026",
			testGroup: "Test 1",
		});
		await seedLibraryPart(client, {
			id: "custom-mock-bikes-s4",
			testId: "custom-mock-bikes",
			part: "s4",
		});

		// 3c: Multi-part non-lib-listen Listening test (s1 + s4) with blank collection
		await seedLibraryTest(client, {
			id: "multipart-bikes",
			title: "Talking about the history of bikes",
			collection: null,
			testGroup: null,
		});
		await seedLibraryPart(client, {
			id: "multipart-bikes-s1",
			testId: "multipart-bikes",
			part: "s1",
		});
		await seedLibraryPart(client, {
			id: "multipart-bikes-s4",
			testId: "multipart-bikes",
			part: "s4",
		});

		// 3d: Cambridge library test whose org copy was manually set to collection='Unknown' by teacher
		await seedLibraryTest(client, {
			id: CAMBRIDGE_TEST_ID,
			title: "Cambridge Sample",
			collection: "Cambridge IELTS 18",
			testGroup: "Test 1",
		});
		await seedLibraryPart(client, {
			id: CAMBRIDGE_PART_ID,
			testId: CAMBRIDGE_TEST_ID,
			part: "s1",
			source: "Unknown Artist — Section 1",
		});

		// 3f: Reading test sharing the exact title
		await seedLibraryTest(client, {
			id: "reading-bikes",
			title: "Talking about the history of bikes",
			skill: "reading",
			collection: null,
			testGroup: null,
		});

		// 3a: Teacher-authored org test (library_ref = NULL)
		await seedAssignmentTest(client, {
			id: "at-org-authored",
			orgId: "org-author",
			title: "Talking about the history of bikes",
			collection: "Unknown",
			libraryRef: null,
		});

		// 3d: Org copy of Cambridge test where teacher manually typed collection='Unknown'
		await seedAssignmentTest(client, {
			id: "at-cambridge-teacher-unknown",
			orgId: "org-cambridge",
			title: "Cambridge Sample",
			collection: "Unknown",
			libraryRef: CAMBRIDGE_TEST_ID,
		});

		// 3e: Org copy of canonical Bikes where teacher customized collection & prompt source
		await seedAssignmentTest(client, {
			id: "at-custom-col",
			orgId: "org-custom",
			title: "Talking about the history of bikes",
			collection: "Bộ đề riêng của lớp",
			libraryRef: CANONICAL_BIKES_TEST_ID,
		});
		const customSource = "Unknown — Ghi chú riêng lớp 7A";
		await seedAssignmentPrompt(client, {
			id: "ap-custom-source",
			orgId: "org-custom",
			part: "s4",
			source: customSource,
			libraryRef: `library_test_part:${CANONICAL_BIKES_PART_ID}`,
		});

		// 3e (200-char boundary): must NOT be rewritten to 206 chars
		const longSource200 = `Unknown — ${"a".repeat(190)}`;
		expect(longSource200).toHaveLength(200);
		await seedAssignmentPrompt(client, {
			id: "ap-long-source",
			orgId: "org-long",
			part: "s4",
			source: longSource200,
			libraryRef: `library_test_part:${CANONICAL_BIKES_PART_ID}`,
		});

		// 3g: Wildcard spoofed library_ref (`_` wildcard trap)
		await seedAssignmentPrompt(client, {
			id: "ap-wildcard-spoof",
			orgId: "org-spoof",
			part: "s4",
			source: "Unknown — Section 4",
			libraryRef: `libraryXtestYpart:${CANONICAL_BIKES_PART_ID}`,
		});

		// Dangling multi-part org copy (has s1 + s4) must NOT be demoted
		await seedAssignmentTest(client, {
			id: "at-dangling-multipart",
			orgId: "org-dangling-multi",
			title: "Talking about the history of bikes",
			collection: null,
			testGroup: null,
			libraryRef: "deleted-multipart-id",
		});
		await seedAssignmentPrompt(client, {
			id: "ap-dangling-s1",
			orgId: "org-dangling-multi",
			part: "s1",
		});
		await seedAssignmentPrompt(client, {
			id: "ap-dangling-s4",
			orgId: "org-dangling-multi",
			part: "s4",
		});
		await seedAssignmentTestPart(client, {
			id: "atp-dm-s1",
			testId: "at-dangling-multipart",
			promptId: "ap-dangling-s1",
			part: "s1",
			position: 0,
		});
		await seedAssignmentTestPart(client, {
			id: "atp-dm-s4",
			testId: "at-dangling-multipart",
			promptId: "ap-dangling-s4",
			part: "s4",
			position: 1,
		});

		await applyFile(client, migration0092File());

		// Assert all protected rows are completely untouched
		expect(
			(
				await client.execute(
					"SELECT status, collection FROM library_test WHERE id = 'custom-mock-bikes'",
				)
			).rows[0],
		).toMatchObject({ status: "ready", collection: "Mock Exam 2026" });

		expect(
			(
				await client.execute(
					"SELECT status FROM library_test WHERE id = 'multipart-bikes'",
				)
			).rows[0]?.status,
		).toBe("ready");

		expect(
			(
				await client.execute({
					sql: "SELECT source FROM library_test_part WHERE id = ?",
					args: [CAMBRIDGE_PART_ID],
				})
			).rows[0]?.source,
		).toBe("Unknown Artist — Section 1");

		expect(
			(
				await client.execute(
					"SELECT status FROM library_test WHERE id = 'reading-bikes'",
				)
			).rows[0]?.status,
		).toBe("ready");

		expect(
			(
				await client.execute(
					"SELECT status, collection FROM assignment_test WHERE id = 'at-org-authored'",
				)
			).rows[0],
		).toMatchObject({ status: "ready", collection: "Unknown" });

		expect(
			(
				await client.execute(
					"SELECT collection FROM assignment_test WHERE id = 'at-cambridge-teacher-unknown'",
				)
			).rows[0]?.collection,
		).toBe("Unknown");

		expect(
			(
				await client.execute(
					"SELECT collection FROM assignment_test WHERE id = 'at-custom-col'",
				)
			).rows[0]?.collection,
		).toBe("Bộ đề riêng của lớp");

		expect(
			(
				await client.execute(
					"SELECT source FROM assignment_prompt WHERE id = 'ap-custom-source'",
				)
			).rows[0]?.source,
		).toBe(customSource);

		expect(
			(
				await client.execute(
					"SELECT source FROM assignment_prompt WHERE id = 'ap-long-source'",
				)
			).rows[0]?.source,
		).toBe(longSource200);

		expect(
			(
				await client.execute(
					"SELECT source FROM assignment_prompt WHERE id = 'ap-wildcard-spoof'",
				)
			).rows[0]?.source,
		).toBe("Unknown — Section 4");

		expect(
			(
				await client.execute(
					"SELECT status FROM assignment_test WHERE id = 'at-dangling-multipart'",
				)
			).rows[0]?.status,
		).toBe("ready");
	});

	test("Case 4: is strictly idempotent on re-run with explicit updated_at sentinel (500 -> 1000)", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0091_fix_reading_shares_duplicated_title.sql");
		await seedOrg(client, "org-1");

		await seedCanonicalBikes(client, { updatedAt: 500 });
		await seedLibraryTest(client, {
			id: "manual-bikes-id",
			title: "Talking about the history of bikes",
			collection: null,
			testGroup: null,
			description: "Legacy desc",
			updatedAt: 500,
		});
		await seedLibraryPart(client, {
			id: "manual-bikes-part",
			testId: "manual-bikes-id",
			part: "s4",
			updatedAt: 500,
		});
		await seedAssignmentTest(client, {
			id: "at-canonical",
			orgId: "org-1",
			title: "Talking about the history of bikes",
			collection: "Unknown",
			testGroup: "Section 4",
			libraryRef: CANONICAL_BIKES_TEST_ID,
			updatedAt: 500,
		});
		await seedAssignmentTest(client, {
			id: "at-legacy",
			orgId: "org-1",
			title: "Talking about the history of bikes",
			collection: null,
			testGroup: null,
			libraryRef: "manual-bikes-id",
			updatedAt: 500,
		});

		// First run
		await applyFile(client, migration0092File());

		for (const [table, id] of [
			["library_test", CANONICAL_BIKES_TEST_ID],
			["library_test", "manual-bikes-id"],
			["library_test_part", CANONICAL_BIKES_PART_ID],
			["assignment_test", "at-canonical"],
			["assignment_test", "at-legacy"],
		] as const) {
			const row = (
				await client.execute({
					sql: `SELECT updated_at FROM ${table} WHERE id = ?`,
					args: [id],
				})
			).rows[0];
			expect(Number(row?.updated_at), `${table}:${id} run 1`).toBeGreaterThan(
				500,
			);
			await client.execute({
				sql: `UPDATE ${table} SET updated_at = 1000 WHERE id = ?`,
				args: [id],
			});
		}

		// Second run must match 0 rows and preserve sentinel updated_at = 1000
		await applyFile(client, migration0092File());

		for (const [table, id] of [
			["library_test", CANONICAL_BIKES_TEST_ID],
			["library_test", "manual-bikes-id"],
			["library_test_part", CANONICAL_BIKES_PART_ID],
			["assignment_test", "at-canonical"],
			["assignment_test", "at-legacy"],
		] as const) {
			const row = (
				await client.execute({
					sql: `SELECT updated_at FROM ${table} WHERE id = ?`,
					args: [id],
				})
			).rows[0];
			expect(Number(row?.updated_at), `${table}:${id} run 2`).toBe(1000);
		}

		const descRow = (
			await client.execute(
				"SELECT description FROM library_test WHERE id = 'manual-bikes-id'",
			)
		).rows[0];
		expect(descRow?.description).toBe(`${DEPRECATION_MARKER} Legacy desc`);
	});

	test("Case 5: upgrades cleanly from 0091 -> 0092 via Drizzle libsql migrator and satisfies journal monotonicity", async () => {
		const journal = JSON.parse(
			readFileSync(`${MIGRATIONS_DIR}/meta/_journal.json`, "utf8"),
		) as {
			entries: Array<{
				idx: number;
				when: number;
				tag: string;
				breakpoints: boolean;
			}>;
		};
		const entry91 = journal.entries.find((e) => e.idx === 91);
		const entry92 = journal.entries.find((e) => e.idx === 92);
		expect(entry91).toBeDefined();
		expect(entry92).toBeDefined();
		expect(entry92?.tag).toBe(
			"0092_fix_listening_bikes_dedup_and_unknown_source",
		);
		expect(entry92?.breakpoints).toBe(true);
		expect(entry92?.when ?? 0).toBeGreaterThan(entry91?.when ?? 0);

		const drizzleClient = createClient({ url: "file::memory:" });
		await applyThrough(
			drizzleClient,
			"0091_fix_reading_shares_duplicated_title.sql",
		);
		await drizzleClient.execute(`
			CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at numeric
			)
		`);
		await drizzleClient.execute({
			sql: 'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (?, ?)',
			args: ["seeded-through-0091", entry91?.when ?? 0],
		});

		await seedOrg(drizzleClient, "org-1");
		await seedCanonicalBikes(drizzleClient);
		await seedLibraryTest(drizzleClient, {
			id: "manual-bikes-id",
			title: "Talking about the history of bikes",
			collection: null,
			testGroup: null,
		});
		await seedLibraryPart(drizzleClient, {
			id: "manual-bikes-part",
			testId: "manual-bikes-id",
			part: "s4",
		});
		await seedAssignmentTest(drizzleClient, {
			id: "at-canonical",
			orgId: "org-1",
			title: "Talking about the history of bikes",
			collection: "Unknown",
			testGroup: "Section 4",
			libraryRef: CANONICAL_BIKES_TEST_ID,
		});
		await seedAssignmentPrompt(drizzleClient, {
			id: "ap-canonical",
			orgId: "org-1",
			part: "s4",
			source: "Unknown — Section 4",
			libraryRef: `library_test_part:${CANONICAL_BIKES_PART_ID}`,
		});
		await seedAssignmentTest(drizzleClient, {
			id: "at-legacy",
			orgId: "org-1",
			title: "Talking about the history of bikes",
			collection: null,
			testGroup: null,
			libraryRef: "manual-bikes-id",
		});

		const db = drizzle(drizzleClient, { schema });
		await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

		expect(
			(
				await drizzleClient.execute({
					sql: "SELECT collection FROM library_test WHERE id = ?",
					args: [CANONICAL_BIKES_TEST_ID],
				})
			).rows[0]?.collection,
		).toBe("Other sources");
		expect(
			(
				await drizzleClient.execute({
					sql: "SELECT source FROM library_test_part WHERE id = ?",
					args: [CANONICAL_BIKES_PART_ID],
				})
			).rows[0]?.source,
		).toBe("Other sources — Section 4");
		expect(
			(
				await drizzleClient.execute(
					"SELECT status FROM library_test WHERE id = 'manual-bikes-id'",
				)
			).rows[0]?.status,
		).toBe("draft");
		expect(
			(
				await drizzleClient.execute(
					"SELECT status FROM assignment_test WHERE id = 'at-legacy'",
				)
			).rows[0]?.status,
		).toBe("draft");
		expect(
			(
				await drizzleClient.execute(
					"SELECT collection FROM assignment_test WHERE id = 'at-canonical'",
				)
			).rows[0]?.collection,
		).toBe("Other sources");
		expect(
			(
				await drizzleClient.execute(
					"SELECT source FROM assignment_prompt WHERE id = 'ap-canonical'",
				)
			).rows[0]?.source,
		).toBe("Other sources — Section 4");
	});

	test("Case 6: direct /quiz, /audio, POST /attempts reflect Statement 2 BEFORE catalog sync, preserving review for submitters and returning single Other sources card on catalog", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0091_fix_reading_shares_duplicated_title.sql");
		await seedOrg(client, "org-1");

		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, email) VALUES ('stu-submitted', 'org-1', 'Submitted', 'submitted@test.local'), ('stu-fresh', 'org-1', 'Fresh', 'fresh@test.local')",
			args: [],
		});

		// Pre-migration state: both canonical (Unknown) and legacy (blank) exist AND are already synced to org-1
		await seedCanonicalBikes(client);
		await seedLibraryTest(client, {
			id: "manual-bikes-legacy",
			title: "Talking about the history of bikes",
			collection: null,
			testGroup: "Section 4",
		});
		await seedLibraryPart(client, {
			id: "manual-bikes-legacy-part",
			testId: "manual-bikes-legacy",
			part: "s4",
			audioKey: "library/manual-bikes-legacy/s4/legacy.mp3",
		});

		await seedAssignmentTest(client, {
			id: "at-canonical-synced",
			orgId: "org-1",
			title: "Talking about the history of bikes",
			collection: "Unknown",
			testGroup: "Section 4",
			libraryRef: CANONICAL_BIKES_TEST_ID,
		});
		await seedAssignmentPrompt(client, {
			id: "ap-canonical-synced",
			orgId: "org-1",
			part: "s4",
			source: "Unknown — Section 4",
			audioKey: CANONICAL_BIKES_AUDIO_KEY,
			libraryRef: `library_test_part:${CANONICAL_BIKES_PART_ID}`,
		});
		await seedAssignmentTestPart(client, {
			id: "atp-canonical-synced",
			testId: "at-canonical-synced",
			promptId: "ap-canonical-synced",
			part: "s4",
		});

		await seedAssignmentTest(client, {
			id: "at-legacy-synced",
			orgId: "org-1",
			title: "Talking about the history of bikes",
			collection: null,
			testGroup: "Section 4",
			libraryRef: "manual-bikes-legacy",
		});
		await seedAssignmentPrompt(client, {
			id: "ap-legacy-synced",
			orgId: "org-1",
			part: "s4",
			source: "",
			audioKey: "library/manual-bikes-legacy/s4/legacy.mp3",
			libraryRef: "library_test_part:manual-bikes-legacy-part",
		});
		await seedAssignmentTestPart(client, {
			id: "atp-legacy-synced",
			testId: "at-legacy-synced",
			promptId: "ap-legacy-synced",
			part: "s4",
		});

		await client.execute({
			sql: "INSERT INTO quiz_attempt (id, org_id, assignment_id, student_id, test_id, mode, status, questions_snapshot, correct_count, submitted_at) VALUES ('att-hist-1', 'org-1', NULL, 'stu-submitted', 'at-legacy-synced', 'practice', 'submitted', ?, 1, 1700000000000)",
			args: [SAMPLE_QUESTIONS],
		});

		// Apply 0092 BEFORE booting HTTP assertions
		await applyFile(client, migration0092File());

		const sampleMp3 = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]);
		const store: MediaStore = {
			async put() {},
			async get(key) {
				if (
					key === CANONICAL_BIKES_AUDIO_KEY ||
					key === "library/manual-bikes-legacy/s4/legacy.mp3"
				) {
					return {
						body: new Response(sampleMp3).body as ReadableStream,
						contentType: "audio/mpeg",
						size: sampleMp3.byteLength,
						etag: `"${key}"`,
					};
				}
				return null;
			},
			async delete() {},
		};
		const db = drizzle(client, { schema }) as unknown as Db;
		const app = buildApp({
			getDb: () => db,
			corsOrigin: ["http://localhost:8003"],
			getLibraryAudioStore: () => store,
			getSessionUser: async (headers: Headers): Promise<SessionUser | null> => {
				const tag = headers.get("x-test-user");
				if (tag === "submitted") {
					return {
						userId: "u-submitted",
						userName: "Submitted",
						email: "submitted@test.local",
						emailVerified: true,
						role: "student",
					};
				}
				if (tag === "fresh") {
					return {
						userId: "u-fresh",
						userName: "Fresh",
						email: "fresh@test.local",
						emailVerified: true,
						role: "student",
					};
				}
				return null;
			},
			authHandler: () => new Response("ok"),
		});

		// 1. BEFORE any catalog call (no syncLibraryTestsToOrg), fresh student gets 404 on demoted legacy test
		const freshHeaders = {
			"x-test-user": "fresh",
			"x-student-org-id": "org-1",
		};
		expect(
			(
				await app.request("/api/student/practice/at-legacy-synced/quiz", {
					headers: freshHeaders,
				})
			).status,
		).toBe(404);
		expect(
			(
				await app.request("/api/student/practice/at-legacy-synced/audio", {
					headers: freshHeaders,
				})
			).status,
		).toBe(404);
		expect(
			(
				await app.request("/api/student/practice/at-legacy-synced/attempts", {
					method: "POST",
					headers: {
						...freshHeaders,
						Origin: "http://localhost:8003",
						"Content-Type": "application/json",
					},
					body: "{}",
				})
			).status,
		).toBe(404);

		// 2. BEFORE any catalog call, student WITH submitted attempt can still review /quiz & /audio (200), but CANNOT start a new retake (404)
		const submittedHeaders = {
			"x-test-user": "submitted",
			"x-student-org-id": "org-1",
		};
		const reviewQuizRes = await app.request(
			"/api/student/practice/at-legacy-synced/quiz",
			{ headers: submittedHeaders },
		);
		expect(reviewQuizRes.status).toBe(200);
		const reviewAudioRes = await app.request(
			"/api/student/practice/at-legacy-synced/audio",
			{ headers: submittedHeaders },
		);
		expect(reviewAudioRes.status).toBe(200);
		expect(
			(
				await app.request("/api/student/practice/at-legacy-synced/attempts", {
					method: "POST",
					headers: {
						...submittedHeaders,
						Origin: "http://localhost:8003",
						"Content-Type": "application/json",
					},
					body: "{}",
				})
			).status,
		).toBe(404);

		// 3. Catalog returns exactly 1 Bikes card with Other sources · Section 4 and zero Unknown facet
		const catalogRes = await app.request(
			"/api/student/practice?skill=listening&facets=1",
			{ headers: freshHeaders },
		);
		expect(catalogRes.status).toBe(200);
		const catalog = (await catalogRes.json()) as {
			total: number;
			items: Array<{
				testId: string;
				title: string;
				collection: string | null;
				testGroup: string | null;
			}>;
			facets?: { collections: string[] };
		};
		expect(catalog.total).toBe(1);
		expect(catalog.items[0]?.testId).toBe("at-canonical-synced");
		expect(catalog.items[0]?.title).toBe("Talking about the history of bikes");
		expect(catalog.items[0]?.collection).toBe("Other sources");
		expect(catalog.items[0]?.testGroup).toBe("Section 4");
		expect(catalog.facets?.collections).toEqual(["Other sources"]);
	});
});
