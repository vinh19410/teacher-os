import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it } from "vitest";
import {
	parsePromoteArgs,
	runPromoteStudyPacksProdCli,
} from "../../scripts/promote-study-packs-prod";
import * as schema from "../schema/index";
import {
	applyPromoteStudyPackPlan,
	auditStagingStudyPacks,
	buildByteBoundedUpsertStatements,
	buildPromoteStudyPackPlan,
	createLibsqlStudyPackPromoteRunner,
	formatStagingStudyPackAuditReport,
	formatStudyPackRollbackSql,
	loadSelectedStagingStudyPacks,
	syncStudyPackPromoteAudioToR2,
	verifyPromotedStudyPacks,
} from "./promote-study-packs";
import { seedStudyPacks } from "./study-packs";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../migrations", import.meta.url).href,
);

const FIRST_STEP_TITLE = "First Step/GT2 — Mô hình Kỷ luật (15 phút/ngày)";

async function openMigratedDb(dir: string, name: string) {
	const dbPath = join(dir, name);
	const client = createClient({ url: `file:${dbPath}` });
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
	return { dbPath, client };
}

describe("promote-study-packs staging -> prod pipeline", () => {
	const tmpDirs: string[] = [];

	afterEach(() => {
		for (const dir of tmpDirs.splice(0, tmpDirs.length)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("audits staging, selectively promotes only First Step/GT2 with live staging edits, verifies parity, is idempotent, and cleanly rolls back", async () => {
		const dir = mkdtempSync(join(tmpdir(), "promote-study-pack-"));
		tmpDirs.push(dir);
		const staging = await openMigratedDb(dir, "staging.db");
		const prod = await openMigratedDb(dir, "prod.db");

		try {
			// Seed both built-in packs on staging (First Step/GT2 + Course Foun/GT1)
			await seedStudyPacks(staging.client);

			// Simulate a live staging edit on First Step/GT2 (including ? and ' characters to test rollback SQL escaping!)
			await staging.client.execute({
				sql: "UPDATE study_pack_exercise SET title = ?, note = ? WHERE id = 'sysex-first-step-gt2-b01'",
				args: [
					"Buổi 1 — Edited on staging? It's verified!",
					"Note with ? and 'quotes'",
				],
			});

			// Seed an unrelated custom pack on production to prove selective promote never touches it
			await prod.client.batch([
				"INSERT INTO study_pack_exercise (id, skill, part, type, title, band, level, intro, passage, audio_url, transcript, questions, option_bank, note, status) VALUES ('sysex-prod-custom', 'reading', 'p1', 'tfng', 'Prod custom', '6.0', 'IELTS Academic', '', 'Passage', '', '', '[{\"stem\":\"Q1\",\"opts\":null,\"answer\":\"TRUE\",\"alts\":\"\"}]', '[]', '', 'ready');",
				"INSERT INTO study_pack (id, org_id, title, description, level, status) VALUES ('syspack-prod-custom', NULL, 'Prod Custom Pack', '', 'IELTS Academic', 'ready');",
				"INSERT INTO study_pack_item (id, pack_id, day_index, position, source_kind, source_id, note) VALUES ('syspackitem-prod-custom-d01', 'syspack-prod-custom', 1, 0, 'library_exercise', 'sysex-prod-custom', '');",
			]);

			const stagingRunner = createLibsqlStudyPackPromoteRunner(staging.client);
			const prodRunner = createLibsqlStudyPackPromoteRunner(prod.client);

			// 1. Audit staging read-only
			const audit = await auditStagingStudyPacks(stagingRunner);
			expect(audit.totalPacks).toBe(2);
			expect(audit.systemPackCount).toBe(2);
			const gt2Audit = audit.packs.find(
				(p) => p.id === "syspack-first-step-gt2",
			);
			expect(gt2Audit).toBeDefined();
			expect(gt2Audit?.itemCount).toBe(62);
			expect(gt2Audit?.exerciseCount).toBe(62);
			expect(gt2Audit?.audioKeys).toHaveLength(32);
			const report = formatStagingStudyPackAuditReport(audit, {
				publicLogs: true,
			});
			expect(report).toContain(FIRST_STEP_TITLE);

			// 2. Select ONLY First Step/GT2 from staging D1
			const selected = await loadSelectedStagingStudyPacks(stagingRunner, {
				packTitles: [FIRST_STEP_TITLE],
			});
			expect(selected.packs).toHaveLength(1);
			expect(selected.packs[0]?.id).toBe("syspack-first-step-gt2");
			expect(selected.exercises).toHaveLength(62);
			expect(selected.items).toHaveLength(62);

			// 3. Build plan against production (read-only)
			const plan = await buildPromoteStudyPackPlan(selected, prodRunner);
			expect(plan.diff.pack).toEqual({
				total: 1,
				toInsert: 1,
				toUpdate: 0,
				unchanged: 0,
			});
			expect(plan.diff.exercise).toEqual({
				total: 62,
				toInsert: 62,
				toUpdate: 0,
				unchanged: 0,
			});
			expect(plan.diff.item).toEqual({
				total: 62,
				toInsert: 62,
				toUpdate: 0,
				unchanged: 0,
			});
			expect(plan.audioTransfers).toHaveLength(32);
			expect(plan.preimage.packs).toHaveLength(0);
			// Ensure every statement respects D1 bind limit (<= 90) and byte chunk bound
			for (const stmt of plan.upsertStatements) {
				expect((stmt.args ?? []).length).toBeLessThanOrEqual(90);
			}

			// 4. Apply to production & verify parity
			const execRes = await applyPromoteStudyPackPlan(prodRunner, plan);
			expect(execRes.statementsExecuted).toBeGreaterThan(3);

			// Single-use plan guard
			await expect(applyPromoteStudyPackPlan(prodRunner, plan)).rejects.toThrow(
				"already been applied",
			);

			const verify = await verifyPromotedStudyPacks(prodRunner, plan);
			expect(verify.ok).toBe(true);
			expect(verify.counts).toEqual({
				pack: { expected: 1, actual: 1 },
				exercise: { expected: 62, actual: 62 },
				item: { expected: 62, actual: 62 },
			});

			// Verify live staging edit arrived on prod & Course Foun/GT1 was NOT migrated & Prod Custom Pack untouched
			const editedRow = await prod.client.execute(
				"SELECT title, note FROM study_pack_exercise WHERE id = 'sysex-first-step-gt2-b01'",
			);
			expect(editedRow.rows[0]?.title).toBe(
				"Buổi 1 — Edited on staging? It's verified!",
			);
			const founCheck = await prod.client.execute(
				"SELECT id FROM study_pack WHERE id = 'syspack-foun-gt1-discipline'",
			);
			expect(founCheck.rows).toHaveLength(0);
			const customCheck = await prod.client.execute(
				"SELECT id FROM study_pack WHERE id = 'syspack-prod-custom'",
			);
			expect(customCheck.rows).toHaveLength(1);

			// 5. Idempotent rerun produces 0 inserts, 0 updates, all unchanged
			const rerunPlan = await buildPromoteStudyPackPlan(selected, prodRunner);
			expect(rerunPlan.diff.pack).toEqual({
				total: 1,
				toInsert: 0,
				toUpdate: 0,
				unchanged: 1,
			});
			expect(rerunPlan.diff.exercise).toEqual({
				total: 62,
				toInsert: 0,
				toUpdate: 0,
				unchanged: 62,
			});
			expect(rerunPlan.diff.item).toEqual({
				total: 62,
				toInsert: 0,
				toUpdate: 0,
				unchanged: 62,
			});

			// 6. Test update + rollback SQL with '?' and quotes in values!
			await staging.client.execute({
				sql: "UPDATE study_pack_exercise SET title = ? WHERE id = 'sysex-first-step-gt2-b01'",
				args: ["Updated again? Yes!"],
			});
			const updatedSelection = await loadSelectedStagingStudyPacks(
				stagingRunner,
				{ packTitles: [FIRST_STEP_TITLE] },
			);
			const updatePlan = await buildPromoteStudyPackPlan(
				updatedSelection,
				prodRunner,
			);
			expect(updatePlan.diff.exercise.toUpdate).toBe(1);
			await applyPromoteStudyPackPlan(prodRunner, updatePlan);
			const afterUpdate = await prod.client.execute(
				"SELECT title FROM study_pack_exercise WHERE id = 'sysex-first-step-gt2-b01'",
			);
			expect(afterUpdate.rows[0]?.title).toBe("Updated again? Yes!");

			// Execute rendered rollback SQL for the update plan and verify '?' & quotes restored verbatim!
			const updateRollbackSql = formatStudyPackRollbackSql(updatePlan);
			await prod.client.executeMultiple(updateRollbackSql);
			const afterUpdateRollback = await prod.client.execute(
				"SELECT title, note FROM study_pack_exercise WHERE id = 'sysex-first-step-gt2-b01'",
			);
			expect(afterUpdateRollback.rows[0]?.title).toBe(
				"Buổi 1 — Edited on staging? It's verified!",
			);
			expect(afterUpdateRollback.rows[0]?.note).toBe(
				"Note with ? and 'quotes'",
			);

			// Execute rendered rollback SQL for the initial insert plan and verify prod returns to preimage
			const initialRollbackSql = formatStudyPackRollbackSql(plan);
			await prod.client.executeMultiple(initialRollbackSql);
			const prodPacksAfterFullRollback = await prod.client.execute(
				"SELECT id FROM study_pack ORDER BY id",
			);
			expect(prodPacksAfterFullRollback.rows.map((r) => String(r.id))).toEqual([
				"syspack-prod-custom",
			]);
			const prodExAfterFullRollback = await prod.client.execute(
				"SELECT id FROM study_pack_exercise ORDER BY id",
			);
			expect(prodExAfterFullRollback.rows.map((r) => String(r.id))).toEqual([
				"sysex-prod-custom",
			]);
		} finally {
			staging.client.close();
			prod.client.close();
		}
	}, 30_000);

	it("fails closed on duplicate title under different ID, mismatched org scope, org_prompt, and extra prod items", async () => {
		const dir = mkdtempSync(join(tmpdir(), "promote-study-pack-failclosed-"));
		tmpDirs.push(dir);
		const staging = await openMigratedDb(dir, "staging.db");
		const prod = await openMigratedDb(dir, "prod.db");

		try {
			await staging.client.batch([
				"INSERT INTO study_pack_exercise (id, skill, part, type, title, band, level, intro, passage, audio_url, transcript, questions, option_bank, note, status) VALUES ('sysex-1', 'reading', 'p1', 'tfng', 'Ex 1', '5.5', 'IELTS First Step', '', 'P', '', '', '[]', '[]', '', 'ready');",
				`INSERT INTO study_pack (id, org_id, title, description, level, status) VALUES ('syspack-1', NULL, '${FIRST_STEP_TITLE}', '', 'IELTS First Step', 'ready');`,
				"INSERT INTO study_pack_item (id, pack_id, day_index, position, source_kind, source_id, note) VALUES ('syspackitem-1', 'syspack-1', 1, 0, 'library_exercise', 'sysex-1', '');",
			]);

			const stagingRunner = createLibsqlStudyPackPromoteRunner(staging.client);
			const prodRunner = createLibsqlStudyPackPromoteRunner(prod.client);
			const selected = await loadSelectedStagingStudyPacks(stagingRunner, {
				packIds: ["syspack-1"],
			});

			// Conflict 1: same title on prod under different ID
			await prod.client.execute(
				`INSERT INTO study_pack (id, org_id, title, description, level, status) VALUES ('syspack-other-id', NULL, '${FIRST_STEP_TITLE}', '', 'IELTS First Step', 'ready');`,
			);
			await expect(
				buildPromoteStudyPackPlan(selected, prodRunner),
			).rejects.toThrow("another study_pack with title");

			// Conflict 2: extra item on prod under same pack ID
			await prod.client.execute("DELETE FROM study_pack;");
			await prod.client.batch([
				`INSERT INTO study_pack (id, org_id, title, description, level, status) VALUES ('syspack-1', NULL, '${FIRST_STEP_TITLE}', '', 'IELTS First Step', 'ready');`,
				"INSERT INTO study_pack_item (id, pack_id, day_index, position, source_kind, source_id, note) VALUES ('syspackitem-extra', 'syspack-1', 2, 0, 'library_exercise', 'sysex-1', '');",
			]);
			await expect(
				buildPromoteStudyPackPlan(selected, prodRunner),
			).rejects.toThrow("already contains extra study_pack_item");

			// Conflict 3: staging pack referencing org_prompt fails closed
			await staging.client.execute(
				"INSERT INTO study_pack_item (id, pack_id, day_index, position, source_kind, source_id, note) VALUES ('syspackitem-org', 'syspack-1', 2, 0, 'org_prompt', 'prompt-staging-1', '');",
			);
			await expect(
				loadSelectedStagingStudyPacks(stagingRunner, {
					packIds: ["syspack-1"],
				}),
			).rejects.toThrow("reference org_prompt");
		} finally {
			staging.client.close();
			prod.client.close();
		}
	}, 30_000);

	it("enforces byte-bounded chunking for large exercise rows", () => {
		const bigRows = Array.from({ length: 5 }, (_, idx) => ({
			id: `sysex-${idx}`,
			payload: "x".repeat(15_000),
		}));
		const stmts = buildByteBoundedUpsertStatements({
			table: "study_pack_exercise",
			columns: ["id", "passage"],
			updateColumns: ["passage"],
			rows: bigRows,
			toParams: (r) => [r.id, r.payload],
			maxParamsPerStatement: 90,
			maxPayloadBytes: 35_000,
		});
		expect(stmts.length).toBeGreaterThanOrEqual(3);
	});

	it("reports missing staging R2 objects in dry-run and copies present objects in apply", async () => {
		const store = new Map<string, Uint8Array>([
			[
				"staging-b/study-packs/first-step-gt2/sysex-first-step-gt2-b02.mp3",
				new Uint8Array([0xff, 0xfb, 0x10, 0xc4]),
			],
		]);

		const mockFetch: typeof fetch = async (input, init) => {
			const parsed = new URL(String(input));
			const method = init?.method ?? "GET";
			const listMatch = parsed.pathname.match(
				/\/r2\/buckets\/([^/]+)\/objects$/,
			);
			if (listMatch && method === "GET") {
				const bucket = decodeURIComponent(listMatch[1] ?? "");
				const prefix = parsed.searchParams.get("prefix") ?? "";
				const found = [...store.entries()]
					.filter(([k]) => k === `${bucket}/${prefix}`)
					.map(([k, buf]) => ({
						key: k.slice(bucket.length + 1),
						size: buf.byteLength,
					}));
				return new Response(JSON.stringify({ success: true, result: found }), {
					status: 200,
				});
			}
			const objMatch = parsed.pathname.match(
				/\/r2\/buckets\/([^/]+)\/objects\/(.+)$/,
			);
			if (objMatch) {
				const bucket = decodeURIComponent(objMatch[1] ?? "");
				const key = decodeURIComponent(objMatch[2] ?? "");
				const fullKey = `${bucket}/${key}`;
				if (method === "GET") {
					const buf = store.get(fullKey);
					return buf
						? new Response(Buffer.from(buf), { status: 200 })
						: new Response(null, { status: 404 });
				}
				if (method === "PUT") {
					store.set(fullKey, new Uint8Array(init?.body as Buffer));
					return new Response(JSON.stringify({ success: true }), {
						status: 200,
					});
				}
			}
			return new Response(null, { status: 404 });
		};

		const transfers = [
			{
				exerciseId: "sysex-first-step-gt2-b02",
				audioKey: "study-packs/first-step-gt2/sysex-first-step-gt2-b02.mp3",
			},
			{
				exerciseId: "sysex-first-step-gt2-b04",
				audioKey: "study-packs/first-step-gt2/sysex-first-step-gt2-b04.mp3",
			},
		];

		const dry = await syncStudyPackPromoteAudioToR2({
			accountId: "acc",
			apiToken: "tok",
			sourceBucket: "staging-b",
			targetBucket: "prod-b",
			transfers,
			dryRun: true,
			fetchImpl: mockFetch,
		});
		expect(dry).toEqual({
			total: 2,
			existing: 0,
			copied: 0,
			missingOnSource: 1,
			missingOnTarget: 2,
			missingSourceKeys: [
				"study-packs/first-step-gt2/sysex-first-step-gt2-b04.mp3",
			],
			verified: 0,
		});

		const copied = await syncStudyPackPromoteAudioToR2({
			accountId: "acc",
			apiToken: "tok",
			sourceBucket: "staging-b",
			targetBucket: "prod-b",
			transfers: transfers.slice(0, 1),
			dryRun: false,
			fetchImpl: mockFetch,
		});
		expect(copied).toEqual({
			total: 1,
			existing: 0,
			copied: 1,
			missingOnSource: 0,
			missingOnTarget: 0,
			missingSourceKeys: [],
			verified: 1,
		});
	});

	it("validates CLI args and executes local SQLite CLI audit -> dry-run -> apply with backup dump", async () => {
		expect(() => parsePromoteArgs(["--d1", "--mode", "dry-run"])).toThrow(
			"requires at least one selector",
		);
		expect(() =>
			parsePromoteArgs([
				"--d1",
				"--mode",
				"apply",
				"--allow-prod",
				"--pack",
				FIRST_STEP_TITLE,
			]),
		).toThrow("requires --confirm-prod prod");

		const dir = mkdtempSync(join(tmpdir(), "promote-study-pack-cli-"));
		tmpDirs.push(dir);
		const staging = await openMigratedDb(dir, "staging.db");
		const prod = await openMigratedDb(dir, "prod.db");
		try {
			await seedStudyPacks(staging.client);
		} finally {
			staging.client.close();
			prod.client.close();
		}

		let auditOut = "";
		await runPromoteStudyPacksProdCli(
			[
				"--staging-file",
				staging.dbPath,
				"--mode",
				"audit-staging",
				"--public-logs",
			],
			{ writeStdout: (s) => (auditOut += s) },
		);
		expect(auditOut).toContain("Staging Study Packs Inventory");
		expect(auditOut).toContain(FIRST_STEP_TITLE);

		const dumpPrefix = join(dir, "backup");
		let applyOut = "";
		await runPromoteStudyPacksProdCli(
			[
				"--staging-file",
				staging.dbPath,
				"--prod-file",
				prod.dbPath,
				"--mode",
				"apply",
				"--pack",
				FIRST_STEP_TITLE,
				"--dump",
				dumpPrefix,
				"--public-logs",
			],
			{ writeStdout: (s) => (applyOut += s) },
		);
		expect(applyOut).toContain(
			"Verify parity: ok=true, packs=1/1, exercises=62/62, items=62/62",
		);
		const preimageJson = JSON.parse(
			readFileSync(`${dumpPrefix}-preimage.json`, "utf8"),
		) as { packs: unknown[] };
		expect(preimageJson.packs).toEqual([]);
		const rollbackSql = readFileSync(`${dumpPrefix}-rollback.sql`, "utf8");
		expect(rollbackSql).toContain("DELETE FROM study_pack_item");
		expect(rollbackSql).toContain("DELETE FROM study_pack");
		expect(rollbackSql).toContain("DELETE FROM study_pack_exercise");
	}, 30_000);
});
