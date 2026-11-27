/**
 * Manual CLI để audit & promote bộ đề tự học (`study_pack`, `study_pack_exercise`,
 * `study_pack_item` + R2 audio trong bucket `library-audio`) trực tiếp từ
 * Cloudflare D1/R2 staging lên production.
 *
 *   # 1. Audit read-only toàn bộ study_pack & trạng thái R2 audio trên staging:
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
 *     pnpm --filter @teacher-os/db exec tsx scripts/promote-study-packs-prod.ts --d1 --mode audit-staging
 *
 *   # 2. Dry-run xem trước diff giữa staging và production (chỉ đọc):
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
 *     pnpm --filter @teacher-os/db exec tsx scripts/promote-study-packs-prod.ts --d1 --mode dry-run \
 *       --pack "First Step/GT2 — Mô hình Kỷ luật (15 phút/ngày)"
 *
 *   # 3. Apply lên production (preimage backup, rollback SQL, copy R2 audio, upsert & verify SHA-256):
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
 *     pnpm --filter @teacher-os/db exec tsx scripts/promote-study-packs-prod.ts --d1 --mode apply \
 *       --allow-prod --confirm-prod prod \
 *       --pack "First Step/GT2 — Mô hình Kỷ luật (15 phút/ngày)"
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { redactSensitive } from "../src/audit/orphan-materials";
import {
	applyPromoteStudyPackPlan,
	auditProdStudyPacksSummary,
	auditStagingStudyPacks,
	buildPromoteStudyPackPlan,
	createD1StudyPackPromoteRunner,
	createLibsqlStudyPackPromoteRunner,
	formatStagingStudyPackAuditReport,
	formatStudyPackRollbackSql,
	loadSelectedStagingStudyPacks,
	type PromoteStudyPackPlan,
	resolveStudyPackD1Database,
	type StudyPackPromoteSqlRunner,
	syncStudyPackPromoteAudioToR2,
	verifyPromotedStudyPacks,
} from "../src/seed/promote-study-packs";
import { resolveR2BucketName } from "../src/seed/r2-audio";

export type PromoteStudyPackMode = "audit-staging" | "dry-run" | "apply";

export interface PromoteStudyPacksArgs {
	mode: PromoteStudyPackMode;
	d1: boolean;
	stagingFile: string | null;
	prodFile: string | null;
	packTitles: string[];
	packIds: string[];
	includeOrgPacks: boolean;
	sourceOrgId: string | null;
	targetOrgId: string | null;
	allowProd: boolean;
	confirmProd: string | null;
	dumpPath: string | null;
	publicLogs: boolean;
	stagingR2Bucket: string | null;
	prodR2Bucket: string | null;
	help: boolean;
}

const USAGE_TEXT = `usage: tsx packages/db/scripts/promote-study-packs-prod.ts (--d1 | --staging-file <sqlite> [--prod-file <sqlite>]) [options]

Modes:
  --mode audit-staging      Read-only inventory of study_pack & R2 library-audio on staging
  --mode dry-run            Read-only diff & conflict check between staging and production (default)
  --mode apply              Backup preimage/rollback SQL, copy R2 audio, upsert to production & verify

Selection (required for dry-run and apply):
  --pack <title>            Select study_pack by title (repeatable, case/NFC-insensitive)
  --pack-titles <list>      Select multiple study_pack titles separated by ";" or newline
  --pack-id <id>            Select study_pack by exact ID (repeatable)
  --include-org-packs       Include org-owned packs in addition to system packs (org_id IS NULL)
  --source-org-id <id>      Optional org filter when reading org-owned staging packs

Target & Safety:
  --target-org-id <id>      Required only when promoting org-owned packs (system packs stay org_id = NULL)
  --allow-prod              Required flag when --mode apply targets Cloudflare D1
  --confirm-prod <word>     Required confirmation when --mode apply targets Cloudflare D1 (must be "prod")
  --dump <path>             Path prefix for preimage JSON & rollback SQL backup
  --public-logs             Omit non-system UUIDs/org IDs from stdout (for public CI logs)
  --staging-r2-bucket <n>   Optional explicit staging library-audio R2 bucket name
  --prod-r2-bucket <n>      Optional explicit prod library-audio R2 bucket name
  --help, -h                Show this help message
`;

export function splitDelimitedList(raw: string): string[] {
	return raw
		.split(/[;\r\n]+/)
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}

export function parsePromoteArgs(
	argv: readonly string[],
): PromoteStudyPacksArgs {
	let mode: PromoteStudyPackMode = "dry-run";
	let d1 = false;
	let stagingFile: string | null = null;
	let prodFile: string | null = null;
	const packTitles: string[] = [];
	const packIds: string[] = [];
	let includeOrgPacks = false;
	let sourceOrgId: string | null = null;
	let targetOrgId: string | null = null;
	let allowProd = false;
	let confirmProd: string | null = null;
	let dumpPath: string | null = null;
	let publicLogs = false;
	let stagingR2Bucket: string | null = null;
	let prodR2Bucket: string | null = null;

	const requireNext = (flag: string, i: number): [string, number] => {
		const next = argv[i + 1];
		if (!next || next.startsWith("--")) {
			throw new Error(`Missing value for ${flag}`);
		}
		return [next, i + 1];
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--mode") {
			const [next, nextIdx] = requireNext("--mode", i);
			if (next !== "audit-staging" && next !== "dry-run" && next !== "apply") {
				throw new Error(
					`Invalid --mode "${next}": expected audit-staging, dry-run, or apply`,
				);
			}
			mode = next;
			i = nextIdx;
		} else if (arg === "--d1") {
			d1 = true;
		} else if (arg === "--staging-file") {
			[stagingFile, i] = requireNext("--staging-file", i);
		} else if (arg === "--prod-file") {
			[prodFile, i] = requireNext("--prod-file", i);
		} else if (arg === "--pack") {
			const [val, nextIdx] = requireNext("--pack", i);
			packTitles.push(val);
			i = nextIdx;
		} else if (arg === "--pack-titles") {
			const [val, nextIdx] = requireNext("--pack-titles", i);
			packTitles.push(...splitDelimitedList(val));
			i = nextIdx;
		} else if (arg === "--pack-id") {
			const [val, nextIdx] = requireNext("--pack-id", i);
			packIds.push(val);
			i = nextIdx;
		} else if (arg === "--pack-ids") {
			const [val, nextIdx] = requireNext("--pack-ids", i);
			packIds.push(...splitDelimitedList(val));
			i = nextIdx;
		} else if (arg === "--include-org-packs") {
			includeOrgPacks = true;
		} else if (arg === "--source-org-id") {
			[sourceOrgId, i] = requireNext("--source-org-id", i);
		} else if (arg === "--target-org-id") {
			[targetOrgId, i] = requireNext("--target-org-id", i);
		} else if (arg === "--allow-prod") {
			allowProd = true;
		} else if (arg === "--confirm-prod") {
			[confirmProd, i] = requireNext("--confirm-prod", i);
		} else if (arg === "--dump") {
			[dumpPath, i] = requireNext("--dump", i);
		} else if (arg === "--public-logs") {
			publicLogs = true;
		} else if (arg === "--staging-r2-bucket") {
			[stagingR2Bucket, i] = requireNext("--staging-r2-bucket", i);
		} else if (arg === "--prod-r2-bucket") {
			[prodR2Bucket, i] = requireNext("--prod-r2-bucket", i);
		} else if (arg === "--help" || arg === "-h") {
			return {
				mode: "dry-run",
				d1: false,
				stagingFile: null,
				prodFile: null,
				packTitles: [],
				packIds: [],
				includeOrgPacks: false,
				sourceOrgId: null,
				targetOrgId: null,
				allowProd: false,
				confirmProd: null,
				dumpPath: null,
				publicLogs: false,
				stagingR2Bucket: null,
				prodR2Bucket: null,
				help: true,
			};
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}

	if (!d1 && !stagingFile) {
		throw new Error(
			"Specify a transport: either --d1 or --staging-file <sqlite-path>.",
		);
	}
	if (d1 && (stagingFile || prodFile)) {
		throw new Error("Cannot combine --d1 with --staging-file or --prod-file.");
	}
	if (!d1 && mode !== "audit-staging" && !prodFile) {
		throw new Error(
			`Local SQLite mode "${mode}" requires --prod-file <sqlite-path>.`,
		);
	}
	if (
		mode !== "audit-staging" &&
		packTitles.length === 0 &&
		packIds.length === 0
	) {
		throw new Error(
			`Mode "${mode}" requires at least one selector (--pack, --pack-titles, --pack-id, or --pack-ids).`,
		);
	}
	if (mode === "apply" && d1) {
		if (!allowProd) {
			throw new Error(
				"Production apply over D1 requires --allow-prod (or use --mode dry-run to preview safely).",
			);
		}
		if (confirmProd !== "prod") {
			throw new Error(
				`Production apply over D1 requires --confirm-prod prod (received: "${confirmProd ?? ""}").`,
			);
		}
	}

	return {
		mode,
		d1,
		stagingFile,
		prodFile,
		packTitles,
		packIds,
		includeOrgPacks,
		sourceOrgId,
		targetOrgId,
		allowProd,
		confirmProd,
		dumpPath,
		publicLogs,
		stagingR2Bucket,
		prodR2Bucket,
		help: false,
	};
}

async function saveBackupArtifacts(
	plan: PromoteStudyPackPlan,
	dumpPathPrefix: string | null,
): Promise<{ preimageFile: string; rollbackSqlFile: string }> {
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const basePath = dumpPathPrefix
		? resolve(dumpPathPrefix)
		: resolve(
				process.cwd(),
				`plans/reports/promote-study-packs-prod-${timestamp}`,
			);
	const preimageFile = basePath.endsWith(".json")
		? basePath
		: `${basePath}-preimage.json`;
	const rollbackSqlFile = basePath.endsWith(".json")
		? basePath.replace(/\.json$/, "-rollback.sql")
		: `${basePath}-rollback.sql`;

	await mkdir(dirname(preimageFile), { recursive: true });
	await writeFile(
		preimageFile,
		`${JSON.stringify(plan.preimage, null, 2)}\n`,
		"utf8",
	);
	await writeFile(rollbackSqlFile, formatStudyPackRollbackSql(plan), "utf8");
	return { preimageFile, rollbackSqlFile };
}

export async function runPromoteStudyPacksProdCli(
	argv: readonly string[],
	deps?: {
		env?: Record<string, string | undefined>;
		fetchImpl?: typeof fetch;
		writeStdout?: (chunk: string) => void;
	},
): Promise<void> {
	const write = deps?.writeStdout ?? ((s: string) => process.stdout.write(s));
	const args = parsePromoteArgs(argv);
	if (args.help) {
		write(USAGE_TEXT);
		return;
	}

	const env = deps?.env ?? process.env;
	const secrets: string[] = [];
	const closers: Array<() => void> = [];

	try {
		let stagingRunner: StudyPackPromoteSqlRunner;
		let prodRunner: StudyPackPromoteSqlRunner | null = null;
		let cfAccountId: string | undefined;
		let cfApiToken: string | undefined;

		if (args.d1) {
			cfAccountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
			cfApiToken = env.CLOUDFLARE_API_TOKEN?.trim();
			if (!cfAccountId || !cfApiToken) {
				throw new Error(
					"Missing required environment variables for --d1: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN",
				);
			}
			secrets.push(cfAccountId, cfApiToken);

			const stagingDb = await resolveStudyPackD1Database({
				stage: "staging",
				accountId: cfAccountId,
				apiToken: cfApiToken,
				explicitDatabaseId: env.STAGING_D1_DATABASE_ID,
				fetchImpl: deps?.fetchImpl,
			});
			secrets.push(stagingDb.id);
			stagingRunner = createD1StudyPackPromoteRunner({
				accountId: cfAccountId,
				databaseId: stagingDb.id,
				apiToken: cfApiToken,
				fetchImpl: deps?.fetchImpl,
			});

			if (args.mode === "audit-staging") {
				write(
					`[promote-study-packs] source D1=${stagingDb.name} (read-only)\n`,
				);
			} else {
				const prodDb = await resolveStudyPackD1Database({
					stage: "prod",
					accountId: cfAccountId,
					apiToken: cfApiToken,
					explicitDatabaseId: env.PROD_D1_DATABASE_ID ?? env.D1_DATABASE_ID,
					fetchImpl: deps?.fetchImpl,
				});
				secrets.push(prodDb.id);
				if (prodDb.id === stagingDb.id) {
					throw new Error(
						"Safety gate: resolved staging and production D1 databases have the same ID.",
					);
				}
				prodRunner = createD1StudyPackPromoteRunner({
					accountId: cfAccountId,
					databaseId: prodDb.id,
					apiToken: cfApiToken,
					fetchImpl: deps?.fetchImpl,
				});
				write(
					`[promote-study-packs] source D1=${stagingDb.name} -> target D1=${prodDb.name} (mode=${args.mode})\n`,
				);
			}
		} else {
			const stagingClient = createClient({
				url: pathToFileURL(resolve(args.stagingFile ?? "")).toString(),
			});
			closers.push(() => stagingClient.close());
			stagingRunner = createLibsqlStudyPackPromoteRunner(stagingClient);

			if (args.mode !== "audit-staging") {
				const prodClient = createClient({
					url: pathToFileURL(resolve(args.prodFile ?? "")).toString(),
				});
				closers.push(() => prodClient.close());
				prodRunner = createLibsqlStudyPackPromoteRunner(prodClient);
			}
			write(`[promote-study-packs] local SQLite mode=${args.mode}\n`);
		}

		// 1. Mode: audit-staging
		if (args.mode === "audit-staging") {
			let stagingR2BucketName: string | undefined;
			if (args.d1 && cfAccountId && cfApiToken) {
				stagingR2BucketName = await resolveR2BucketName({
					stage: "staging",
					accountId: cfAccountId,
					apiToken: cfApiToken,
					explicitBucket:
						args.stagingR2Bucket ?? env.STAGING_R2_LIBRARY_AUDIO_BUCKET,
					fetchImpl: deps?.fetchImpl,
				});
				write(
					`[promote-study-packs] source R2=${stagingR2BucketName} (read-only)\n`,
				);
			}
			const audit = await auditStagingStudyPacks(stagingRunner, {
				sourceOrgId: args.sourceOrgId ?? undefined,
				r2Check:
					stagingR2BucketName && cfAccountId && cfApiToken
						? {
								accountId: cfAccountId,
								apiToken: cfApiToken,
								bucketName: stagingR2BucketName,
								fetchImpl: deps?.fetchImpl,
							}
						: undefined,
			});
			write(
				`${formatStagingStudyPackAuditReport(audit, { publicLogs: args.publicLogs })}\n`,
			);
			return;
		}

		// 2. Modes: dry-run & apply
		if (!prodRunner) {
			throw new Error(
				"Internal error: target production runner not initialized.",
			);
		}
		if (args.publicLogs && args.targetOrgId) {
			secrets.push(args.targetOrgId);
		}
		if (args.publicLogs && args.sourceOrgId) {
			secrets.push(args.sourceOrgId);
		}

		const prodSummary = await auditProdStudyPacksSummary(prodRunner);
		const prodSystemPacks = prodSummary.packs.filter((p) => p.orgId === null);
		const prodOrgPackCount = prodSummary.packs.length - prodSystemPacks.length;
		write(
			`[promote-study-packs] Prod current state: packs=${prodSummary.packs.length} (system=${prodSystemPacks.length}, org=${prodOrgPackCount}), exercises=${prodSummary.totalExercises}, items=${prodSummary.totalItems}\n`,
		);
		for (const existingPack of prodSummary.packs) {
			const scope = existingPack.orgId === null ? "system" : "org";
			if (args.publicLogs && existingPack.orgId !== null) {
				continue;
			}
			write(
				`  - [prod ${scope}] "${existingPack.title}" (level="${existingPack.level}", status=${existingPack.status}, items=${existingPack.itemCount}, activeClasses=${existingPack.activeClassCount})\n`,
			);
		}

		const selected = await loadSelectedStagingStudyPacks(stagingRunner, {
			packTitles: args.packTitles,
			packIds: args.packIds,
			includeOrgPacks: args.includeOrgPacks,
			sourceOrgId: args.sourceOrgId ?? undefined,
		});

		const plan = await buildPromoteStudyPackPlan(selected, prodRunner, {
			targetOrgId: args.targetOrgId ?? env.TARGET_ORG_ID?.trim() ?? null,
		});

		write(
			`[promote-study-packs] Selected packs (${plan.targetPacks.length}): ${plan.targetPacks.map((p) => `"${p.title}"`).join(", ")}\n`,
		);
		write(
			`[promote-study-packs] Plan summary: packs=${plan.diff.pack.total} (+${plan.diff.pack.toInsert} / ~${plan.diff.pack.toUpdate} / =${plan.diff.pack.unchanged}), exercises=${plan.diff.exercise.total} (+${plan.diff.exercise.toInsert} / ~${plan.diff.exercise.toUpdate} / =${plan.diff.exercise.unchanged}), items=${plan.diff.item.total} (+${plan.diff.item.toInsert} / ~${plan.diff.item.toUpdate} / =${plan.diff.item.unchanged}), upsertStatements=${plan.upsertStatements.length}, r2Audio=${plan.audioTransfers.length}\n`,
		);

		let r2Buckets: { source: string; target: string } | null = null;
		if (
			args.d1 &&
			plan.audioTransfers.length > 0 &&
			cfAccountId &&
			cfApiToken
		) {
			const [sourceBucket, targetBucket] = await Promise.all([
				resolveR2BucketName({
					stage: "staging",
					accountId: cfAccountId,
					apiToken: cfApiToken,
					explicitBucket:
						args.stagingR2Bucket ?? env.STAGING_R2_LIBRARY_AUDIO_BUCKET,
					fetchImpl: deps?.fetchImpl,
				}),
				resolveR2BucketName({
					stage: "prod",
					accountId: cfAccountId,
					apiToken: cfApiToken,
					explicitBucket: args.prodR2Bucket ?? env.PROD_R2_LIBRARY_AUDIO_BUCKET,
					fetchImpl: deps?.fetchImpl,
				}),
			]);
			r2Buckets = { source: sourceBucket, target: targetBucket };
			write(
				`[promote-study-packs] R2 buckets: source=${sourceBucket} -> target=${targetBucket}\n`,
			);
		}

		if (args.mode === "dry-run") {
			if (r2Buckets && cfAccountId && cfApiToken) {
				const r2Res = await syncStudyPackPromoteAudioToR2({
					accountId: cfAccountId,
					apiToken: cfApiToken,
					sourceBucket: r2Buckets.source,
					targetBucket: r2Buckets.target,
					transfers: plan.audioTransfers,
					dryRun: true,
					fetchImpl: deps?.fetchImpl,
				});
				const toCopy = r2Res.missingOnTarget - r2Res.missingOnSource;
				write(
					`[promote-study-packs] DRY-RUN R2 audio: total=${r2Res.total}, existingOnProd=${r2Res.existing}, toCopyFromStaging=${toCopy}, missingOnStaging=${r2Res.missingOnSource}\n`,
				);
				if (r2Res.missingSourceKeys.length > 0) {
					write(
						`[promote-study-packs] WARNING missing on staging R2 (${r2Res.missingSourceKeys.length}): ${r2Res.missingSourceKeys.join(", ")}\n`,
					);
				}
			}
			write(
				`[promote-study-packs] DRY-RUN complete (read-only, no writes performed). Expected parity hash=${plan.contentHash.slice(0, 12)}...\n`,
			);
			return;
		}

		// 3. Mode: apply — backup preimage + rollback SQL BEFORE any write
		const { preimageFile, rollbackSqlFile } = await saveBackupArtifacts(
			plan,
			args.dumpPath,
		);
		write(
			`[promote-study-packs] Preimage backup saved: ${preimageFile} (packs=${plan.preimage.packs.length}, exercises=${plan.preimage.exercises.length}, items=${plan.preimage.items.length})\n`,
		);
		write(`[promote-study-packs] Rollback SQL saved: ${rollbackSqlFile}\n`);

		// Copy missing R2 audio objects before DB upsert so exercises never point to dangling audio keys
		if (r2Buckets && cfAccountId && cfApiToken) {
			const r2Res = await syncStudyPackPromoteAudioToR2({
				accountId: cfAccountId,
				apiToken: cfApiToken,
				sourceBucket: r2Buckets.source,
				targetBucket: r2Buckets.target,
				transfers: plan.audioTransfers,
				dryRun: false,
				fetchImpl: deps?.fetchImpl,
			});
			write(
				`[promote-study-packs] R2 audio synced: total=${r2Res.total}, existing=${r2Res.existing}, copied=${r2Res.copied}, missingOnSource=${r2Res.missingOnSource}, verified=${r2Res.verified}\n`,
			);
			if (r2Res.missingOnSource > 0) {
				throw new Error(
					`Refusing DB upsert: ${r2Res.missingOnSource} audio object(s) missing on staging R2 bucket (${r2Res.missingSourceKeys.slice(0, 5).join(", ")}).`,
				);
			}
		}

		const execRes = await applyPromoteStudyPackPlan(prodRunner, plan);
		write(
			`[promote-study-packs] Executed ${execRes.statementsExecuted} upsert statement(s) on production.\n`,
		);

		const verifyRes = await verifyPromotedStudyPacks(prodRunner, plan);
		write(
			`[promote-study-packs] Verify parity: ok=${verifyRes.ok}, packs=${verifyRes.counts.pack.actual}/${verifyRes.counts.pack.expected}, exercises=${verifyRes.counts.exercise.actual}/${verifyRes.counts.exercise.expected}, items=${verifyRes.counts.item.actual}/${verifyRes.counts.item.expected}, sha256=${verifyRes.actualHash.slice(0, 12)}...\n`,
		);
		if (!verifyRes.ok) {
			throw new Error(
				`Production verification failed: ${verifyRes.mismatches.join("; ")}`,
			);
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(redactSensitive(msg, secrets));
	} finally {
		for (const close of closers) {
			close();
		}
	}
}

const entryArg = process.argv[1];
if (entryArg && import.meta.url === pathToFileURL(resolve(entryArg)).href) {
	runPromoteStudyPacksProdCli(process.argv.slice(2)).catch((err) => {
		console.error(
			`[promote-study-packs] ERROR: ${err instanceof Error ? err.message : String(err)}`,
		);
		process.exit(1);
	});
}
