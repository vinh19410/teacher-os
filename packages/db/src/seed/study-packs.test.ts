import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it } from "vitest";
import {
	parseStudyPackArgs,
	runSeedStudyPacksCli,
} from "../../scripts/seed-study-packs";
import * as schema from "../schema/index";
import {
	EXPECTED_STUDY_PACK_COUNTS,
	ensureStudyPacksSeeded,
	loadStudyPackSeedData,
	seedStudyPacks,
	verifyStudyPackContentParity,
	verifyStudyPackCounts,
} from "./study-packs";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../migrations", import.meta.url).href,
);

async function openMigratedDb(dir: string) {
	const dbPath = join(dir, "test.db");
	const client = createClient({ url: `file:${dbPath}` });
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
	return { dbPath, client };
}

describe("study-packs seed pipeline (#702)", () => {
	const tmpDirs: string[] = [];

	afterEach(() => {
		for (const dir of tmpDirs.splice(0, tmpDirs.length)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("loads foun-gt1-discipline and first-step-gt2 bundles with 2 packs, 131 exercises, 131 items", () => {
		const data = loadStudyPackSeedData();
		expect(data.packs).toHaveLength(EXPECTED_STUDY_PACK_COUNTS.pack);
		expect(data.exercises).toHaveLength(EXPECTED_STUDY_PACK_COUNTS.exercise);
		expect(data.items).toHaveLength(EXPECTED_STUDY_PACK_COUNTS.item);
		expect(data.packs.map((p) => p.id)).toEqual([
			"syspack-first-step-gt2",
			"syspack-foun-gt1-discipline",
		]);
		expect(data.packs.map((p) => p.level)).toEqual([
			"IELTS First Step",
			"IELTS Foundation",
		]);
	});

	it("seeds idempotently, preserves non-seeded packs, and detects content drift", async () => {
		const dir = mkdtempSync(join(tmpdir(), "study-pack-seed-"));
		tmpDirs.push(dir);
		const { dbPath, client } = await openMigratedDb(dir);

		try {
			await client.batch([
				"INSERT INTO study_pack_exercise (id, skill, part, type, title, band, level, intro, passage, audio_url, transcript, questions, option_bank, note, status) VALUES ('sysex-admin-custom', 'reading', 'p1', 'tfng', 'Admin custom', '6.0', 'IELTS Academic', '', 'Passage', '', '', '[{\"stem\":\"Q1\",\"opts\":null,\"answer\":\"TRUE\",\"alts\":[]}]', '[]', '', 'ready');",
				"INSERT INTO study_pack (id, org_id, title, description, level, status) VALUES ('syspack-admin-custom', NULL, 'Admin custom pack', '', 'IELTS Academic', 'ready');",
			]);

			const first = await seedStudyPacks(client);
			expect(first.counts).toEqual(EXPECTED_STUDY_PACK_COUNTS);

			const counts = await verifyStudyPackCounts(client);
			expect(counts.ok).toBe(true);
			expect(await verifyStudyPackContentParity(client)).toBe(true);

			// Second run with --if-needed skips writes and keeps admin-created rows intact
			const skipped = await ensureStudyPacksSeeded(client, {
				ifNeeded: true,
				verify: true,
			});
			expect(skipped.seeded).toBe(false);
			expect(skipped.statementsExecuted).toBe(0);
			expect(skipped.verification?.ok).toBe(true);

			// Mutate seeded title and audio_key to simulate drift
			await client.execute(
				"UPDATE study_pack SET title = 'Drifted title' WHERE id = 'syspack-foun-gt1-discipline';",
			);
			expect(await verifyStudyPackContentParity(client)).toBe(false);

			const repaired = await ensureStudyPacksSeeded(client, {
				ifNeeded: true,
				verify: true,
			});
			expect(repaired.seeded).toBe(true);
			expect(await verifyStudyPackContentParity(client)).toBe(true);

			await client.execute(
				"UPDATE study_pack_exercise SET audio_key = 'study-packs/first-step-gt2/drifted.mp3' WHERE id = 'sysex-first-step-gt2-b02';",
			);
			expect(await verifyStudyPackContentParity(client)).toBe(false);
			const repairedAudioKey = await ensureStudyPacksSeeded(client, {
				ifNeeded: true,
				verify: true,
			});
			expect(repairedAudioKey.seeded).toBe(true);
			expect(await verifyStudyPackContentParity(client)).toBe(true);

			// Prune only scopes syspackitem-foun-gt1-* / sysex-foun-gt1-*, never custom rows
			await seedStudyPacks(client, { prune: true });
			const customCheck = await client.execute(
				"SELECT id FROM study_pack WHERE id = 'syspack-admin-custom';",
			);
			expect(customCheck.rows).toHaveLength(1);

			// ensureStudyPacksSeeded with ifNeeded + prune must still prune stale system rows
			await client.batch([
				"INSERT INTO study_pack_exercise (id, skill, part, type, title, band, level, intro, passage, audio_url, transcript, questions, option_bank, note, status) VALUES ('sysex-foun-gt1-stale', 'reading', 'p1', 'tfng', 'Stale', '5.0', 'IELTS Foundation', '', 'P', '', '', '[{\"stem\":\"Q1\",\"opts\":null,\"answer\":\"TRUE\",\"alts\":\"\"}]', '[]', '', 'ready');",
				"INSERT INTO study_pack_item (id, pack_id, day_index, position, source_kind, source_id, note) VALUES ('syspackitem-foun-gt1-stale', 'syspack-foun-gt1-discipline', 99, 0, 'library_exercise', 'sysex-foun-gt1-stale', '');",
			]);
			const prunedRun = await ensureStudyPacksSeeded(client, {
				ifNeeded: true,
				prune: true,
				verify: true,
			});
			expect(prunedRun.seeded).toBe(true);
			expect(prunedRun.verification?.ok).toBe(true);
			const staleItemCheck = await client.execute(
				"SELECT id FROM study_pack_item WHERE id = 'syspackitem-foun-gt1-stale';",
			);
			expect(staleItemCheck.rows).toHaveLength(0);
			const staleExCheck = await client.execute(
				"SELECT id FROM study_pack_exercise WHERE id = 'sysex-foun-gt1-stale';",
			);
			expect(staleExCheck.rows).toHaveLength(0);

			// Smoke-check CLI --file --verify
			let stdout = "";
			await runSeedStudyPacksCli(
				["--file", dbPath, "--if-needed", "--verify"],
				{
					writeStdout: (chunk) => {
						stdout += chunk;
					},
				},
			);
			expect(stdout).toContain("already seeded and content-verified");
			expect(stdout).toContain("pack 2/2, exercise 131/131, item 131/131");
		} finally {
			client.close();
		}
	}, 30_000);

	it("validates --allow-prod flag rules on seed-study-packs CLI", () => {
		expect(() =>
			parseStudyPackArgs(["--file", "local.db", "--allow-prod"]),
		).toThrow("--allow-prod requires --d1");
		expect(() =>
			parseStudyPackArgs(["--d1", "--d1-stage", "staging", "--allow-prod"]),
		).toThrow("Cannot combine --allow-prod with --d1-stage");
		expect(
			parseStudyPackArgs(["--d1", "--allow-prod", "--verify"]).allowProd,
		).toBe(true);
	});
});
