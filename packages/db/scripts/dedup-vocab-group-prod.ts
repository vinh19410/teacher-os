/**
 * Manual CLI để audit & xoá bộ từ vựng bị trùng (`vocab_deck` bank `class_id IS NULL`)
 * trong một `vocab_group` trên SQLite cục bộ hoặc Cloudflare D1 (staging / production).
 *
 *   # 1. Dry-run read-only trên production:
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
 *     pnpm --filter @teacher-os/db exec tsx scripts/dedup-vocab-group-prod.ts \
 *       --d1 --d1-stage prod --mode dry-run \
 *       --group "Communication English Level 2"
 *
 *   # 2. Apply trên production (chụp preimage backup + rollback SQL, preflight & verify):
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
 *     pnpm --filter @teacher-os/db exec tsx scripts/dedup-vocab-group-prod.ts \
 *       --d1 --d1-stage prod --mode apply \
 *       --allow-prod --confirm-prod prod \
 *       --group "Communication English Level 2"
 *
 *   # 3. Local SQLite (rehearsal / test):
 *   pnpm --filter @teacher-os/db exec tsx scripts/dedup-vocab-group-prod.ts \
 *     --file /path/to/local.sqlite --mode dry-run \
 *     --group "Communication English Level 2" --target-org-id <orgId>
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import {
	applyDedupVocabGroupPlan,
	auditDedupVocabGroup,
	buildDedupVocabGroupPlan,
	createD1VocabPromoteRunner,
	createLibsqlVocabPromoteRunner,
	type DedupVocabGroupPlan,
	formatDedupAuditReport,
	formatDedupRollbackSql,
	redactSensitive,
	resolveTargetTeacherOrgId,
	resolveVocabD1Database,
	verifyDedupVocabGroup,
} from "../src/audit/dedup-vocab-group";
import type { VocabPromoteSqlRunner } from "../src/seed/promote-vocab";

export type DedupVocabMode = "dry-run" | "apply";
export type DedupD1Stage = "prod" | "staging";

export const DEFAULT_DEDUP_GROUP_NAME = "Communication English Level 2";

export interface DedupVocabCliArgs {
	mode: DedupVocabMode;
	d1: boolean;
	d1Stage: DedupD1Stage;
	filePath: string | null;
	groupName: string | null;
	groupId: string | null;
	targetOrgId: string | null;
	teacherEmails: string | null;
	allowProd: boolean;
	confirmProd: string | null;
	dumpPath: string | null;
	publicLogs: boolean;
	help: boolean;
}

const USAGE_TEXT = `usage: tsx packages/db/scripts/dedup-vocab-group-prod.ts (--d1 [--d1-stage prod|staging] | --file <sqlite-path>) [options]

Modes:
  --mode dry-run            Read-only duplicate inspection and safety report (default)
  --mode apply              Save preimage/rollback SQL, delete safe duplicates, repoint clones & verify

Scope:
  --group <name>            Target vocab_group name (default: "${DEFAULT_DEDUP_GROUP_NAME}")
  --group-id <id>           Target vocab_group exact ID (overrides --group)
  --target-org-id <id>      Target organization.id (optional; auto-resolved via TEACHER_EMAILS -> LEAD_ORG_ID)
  --teacher-emails <csv>    Comma-separated teacher emails for org resolution (or env TEACHER_EMAILS)

Transport & Safety:
  --d1                      Target Cloudflare D1 REST API
  --d1-stage <prod|staging> Target D1 stage (default: prod)
  --file <sqlite-path>      Target local SQLite/libsql database file
  --allow-prod              Required flag when --mode apply targets D1 prod
  --confirm-prod <word>     Required confirmation when --mode apply targets D1 prod (must be "prod")
  --dump <path>             Path prefix for preimage JSON & rollback SQL backup
  --public-logs             Omit raw row/org UUIDs from stdout (for public CI logs)
  --help, -h                Show this help message
`;

export function parseDedupVocabArgs(
	argv: readonly string[],
): DedupVocabCliArgs {
	let mode: DedupVocabMode = "dry-run";
	let d1 = false;
	let d1Stage: DedupD1Stage = "prod";
	let hasExplicitStage = false;
	let filePath: string | null = null;
	let groupName: string | null = null;
	let groupId: string | null = null;
	let targetOrgId: string | null = null;
	let teacherEmails: string | null = null;
	let allowProd = false;
	let confirmProd: string | null = null;
	let dumpPath: string | null = null;
	let publicLogs = false;

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
			if (next !== "dry-run" && next !== "apply") {
				throw new Error(`Invalid --mode "${next}": expected dry-run or apply`);
			}
			mode = next;
			i = nextIdx;
		} else if (arg === "--d1") {
			d1 = true;
		} else if (arg === "--d1-stage") {
			const [next, nextIdx] = requireNext("--d1-stage", i);
			if (next !== "prod" && next !== "staging") {
				throw new Error(
					`Invalid --d1-stage "${next}": expected prod or staging`,
				);
			}
			d1Stage = next;
			hasExplicitStage = true;
			i = nextIdx;
		} else if (arg === "--file") {
			[filePath, i] = requireNext("--file", i);
		} else if (arg === "--group") {
			[groupName, i] = requireNext("--group", i);
		} else if (arg === "--group-id") {
			[groupId, i] = requireNext("--group-id", i);
		} else if (arg === "--target-org-id") {
			[targetOrgId, i] = requireNext("--target-org-id", i);
		} else if (arg === "--teacher-emails") {
			[teacherEmails, i] = requireNext("--teacher-emails", i);
		} else if (arg === "--allow-prod") {
			allowProd = true;
		} else if (arg === "--confirm-prod") {
			[confirmProd, i] = requireNext("--confirm-prod", i);
		} else if (arg === "--dump") {
			[dumpPath, i] = requireNext("--dump", i);
		} else if (arg === "--public-logs") {
			publicLogs = true;
		} else if (arg === "--help" || arg === "-h") {
			return {
				mode: "dry-run",
				d1: false,
				d1Stage: "prod",
				filePath: null,
				groupName: null,
				groupId: null,
				targetOrgId: null,
				teacherEmails: null,
				allowProd: false,
				confirmProd: null,
				dumpPath: null,
				publicLogs: false,
				help: true,
			};
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}

	if (!d1 && !filePath) {
		throw new Error(
			"Specify a transport: either --d1 [--d1-stage prod|staging] or --file <sqlite-path>.",
		);
	}
	if (d1 && filePath) {
		throw new Error("Cannot combine --d1 with --file.");
	}
	if (hasExplicitStage && !d1) {
		throw new Error("Flag --d1-stage requires --d1.");
	}
	if (mode === "apply" && d1 && d1Stage === "prod") {
		if (!allowProd) {
			throw new Error(
				"Production apply over D1 requires --allow-prod (or use --mode dry-run to inspect safely).",
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
		d1Stage,
		filePath,
		groupName: groupId ? null : (groupName ?? DEFAULT_DEDUP_GROUP_NAME),
		groupId,
		targetOrgId,
		teacherEmails,
		allowProd,
		confirmProd,
		dumpPath,
		publicLogs,
		help: false,
	};
}

async function saveDedupBackupArtifacts(
	plan: DedupVocabGroupPlan,
	stageLabel: string,
	dumpPathPrefix: string | null,
): Promise<{ preimageFile: string; rollbackSqlFile: string }> {
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const basePath = dumpPathPrefix
		? resolve(dumpPathPrefix)
		: resolve(
				process.cwd(),
				`plans/reports/dedup-vocab-group-${stageLabel}-${timestamp}`,
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
	await writeFile(rollbackSqlFile, formatDedupRollbackSql(plan), "utf8");
	return { preimageFile, rollbackSqlFile };
}

export async function runDedupVocabGroupCli(
	argv: readonly string[],
	deps?: {
		env?: Record<string, string | undefined>;
		fetchImpl?: typeof fetch;
		writeStdout?: (chunk: string) => void;
	},
): Promise<void> {
	const write = deps?.writeStdout ?? ((s: string) => process.stdout.write(s));
	const args = parseDedupVocabArgs(argv);
	if (args.help) {
		write(USAGE_TEXT);
		return;
	}

	const env = deps?.env ?? process.env;
	const secrets: string[] = [];
	const closers: Array<() => void> = [];

	try {
		let runner: VocabPromoteSqlRunner;
		let stageLabel: string;

		if (args.d1) {
			const cfAccountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
			const cfApiToken = env.CLOUDFLARE_API_TOKEN?.trim();
			if (!cfAccountId || !cfApiToken) {
				throw new Error(
					"Missing required environment variables for --d1: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN",
				);
			}
			secrets.push(cfAccountId, cfApiToken);

			const explicitDbId =
				args.d1Stage === "staging"
					? env.STAGING_D1_DATABASE_ID
					: (env.PROD_D1_DATABASE_ID ?? env.D1_DATABASE_ID);
			const dbInfo = await resolveVocabD1Database({
				stage: args.d1Stage,
				accountId: cfAccountId,
				apiToken: cfApiToken,
				explicitDatabaseId: explicitDbId,
				fetchImpl: deps?.fetchImpl,
			});
			secrets.push(dbInfo.id);

			runner = createD1VocabPromoteRunner({
				accountId: cfAccountId,
				databaseId: dbInfo.id,
				apiToken: cfApiToken,
				fetchImpl: deps?.fetchImpl,
			});
			stageLabel = args.d1Stage;
			write(
				`[dedup-vocab] target D1=${dbInfo.name} (stage=${args.d1Stage}, mode=${args.mode})\n`,
			);
		} else {
			const client = createClient({
				url: pathToFileURL(resolve(args.filePath ?? "")).toString(),
			});
			closers.push(() => client.close());
			runner = createLibsqlVocabPromoteRunner(client);
			stageLabel = "local";
			write(`[dedup-vocab] local SQLite mode=${args.mode}\n`);
		}

		const explicitTargetOrgId =
			args.targetOrgId?.trim() || env.TARGET_ORG_ID?.trim() || "";
		const teacherEmailsRaw =
			args.teacherEmails?.trim() || env.TEACHER_EMAILS?.trim() || "";
		const leadOrgId = env.LEAD_ORG_ID?.trim() || "";

		const resolvedTarget = await resolveTargetTeacherOrgId(runner, {
			explicitTargetOrgId: explicitTargetOrgId || undefined,
			teacherEmails: teacherEmailsRaw || undefined,
			leadOrgId: leadOrgId || undefined,
		});
		const targetOrgId = resolvedTarget.orgId;
		if (args.publicLogs) {
			secrets.push(targetOrgId);
			if (leadOrgId) secrets.push(leadOrgId);
			if (teacherEmailsRaw) secrets.push(teacherEmailsRaw);
			if (args.groupId) secrets.push(args.groupId);
		}

		write(
			`[dedup-vocab] Target org resolved via=${resolvedTarget.resolvedVia}, sameAsLeadOrg=${resolvedTarget.sameAsLeadOrg}\n`,
		);

		const audit = await auditDedupVocabGroup(runner, {
			targetOrgId,
			groupName: args.groupName ?? undefined,
			groupId: args.groupId ?? undefined,
		});

		if (args.publicLogs) {
			secrets.push(audit.group.id);
			for (const cluster of audit.clusters) {
				secrets.push(cluster.keeper.deck.id);
				for (const cand of cluster.candidates) {
					secrets.push(cand.inspection.deck.id);
				}
			}
			for (const repoint of audit.repointedDecks) {
				secrets.push(repoint.deckId);
			}
		}

		write(
			`${formatDedupAuditReport(audit, { publicLogs: args.publicLogs })}\n`,
		);

		if (args.mode === "dry-run") {
			write(
				"[dedup-vocab] DRY-RUN complete (read-only, no writes performed).\n",
			);
			return;
		}

		const plan = buildDedupVocabGroupPlan(audit);
		if (plan.deletableDeckIds.length === 0) {
			write(
				`[dedup-vocab] No safely deletable duplicate decks found (skipped=${audit.summary.skippedDecks}); skipping DB writes.\n`,
			);
			return;
		}

		const { preimageFile, rollbackSqlFile } = await saveDedupBackupArtifacts(
			plan,
			stageLabel,
			args.dumpPath,
		);
		write(
			`[dedup-vocab] Preimage backup saved: ${preimageFile} (deletedDecks=${plan.preimage.deletedDecks.length}, deletedWords=${plan.preimage.deletedWords.length}, repointedDecks=${plan.preimage.repointedDecks.length})\n`,
		);
		write(`[dedup-vocab] Rollback SQL saved: ${rollbackSqlFile}\n`);

		const execRes = await applyDedupVocabGroupPlan(runner, plan);
		write(
			`[dedup-vocab] Executed ${execRes.statementsExecuted} statement(s) on ${stageLabel}.\n`,
		);

		const verifyRes = await verifyDedupVocabGroup(runner, plan);
		write(
			`[dedup-vocab] Verify: ok=${verifyRes.ok}, remainingDeletedDecks=${verifyRes.remainingDeletedDecks}, remainingDeletedWords=${verifyRes.remainingDeletedWords}, keepers=${verifyRes.remainingKeepers}/${verifyRes.expectedKeepers}, classDecks=${verifyRes.remainingClassDecks}/${verifyRes.expectedClassDecks}, remainingDeletable=${verifyRes.remainingDeletableAfterReaudit}\n`,
		);
		if (!verifyRes.ok) {
			throw new Error(
				`Post-dedup verification failed: ${verifyRes.mismatches.join("; ")}`,
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
	runDedupVocabGroupCli(process.argv.slice(2)).catch((err) => {
		console.error(
			`[dedup-vocab] ERROR: ${err instanceof Error ? err.message : String(err)}`,
		);
		process.exit(1);
	});
}
