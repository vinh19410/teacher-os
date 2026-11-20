/**
 * Manual CLI để audit & promote bộ từ vựng giáo viên tạo (`vocab_group`,
 * `vocab_deck`, `vocab_word` + R2 audio) từ staging lên production.
 *
 *   # 1. Audit read-only toàn bộ vocab_group & vocab_deck trên staging:
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
 *     pnpm --filter @teacher-os/db exec tsx scripts/promote-vocab-prod.ts --d1 --mode audit-staging
 *
 *   # 2. Dry-run xem trước thay đổi lên production (chỉ đọc):
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
 *     pnpm --filter @teacher-os/db exec tsx scripts/promote-vocab-prod.ts --d1 --mode dry-run \
 *       --group "Giao tiếp Level 1" --group "Giao tiếp Level 2" \
 *       --target-org-id 25f9c0dc-9feb-4766-a7de-70e6bb4f1276
 *
 *   # 3. Apply lên production (kèm preimage backup, rollback SQL, copy R2 audio & verify parity):
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
 *     pnpm --filter @teacher-os/db exec tsx scripts/promote-vocab-prod.ts --d1 --mode apply \
 *       --allow-prod --confirm-prod prod \
 *       --group "Giao tiếp Level 1" --group "Giao tiếp Level 2" \
 *       --target-org-id 25f9c0dc-9feb-4766-a7de-70e6bb4f1276
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { redactSensitive } from "../src/audit/orphan-materials";
import {
	applyPromoteVocabPlan,
	auditProdOrgVocabSummary,
	auditStagingVocab,
	buildPromoteVocabPlan,
	createD1VocabPromoteRunner,
	createLibsqlVocabPromoteRunner,
	formatRollbackSql,
	formatStagingVocabAuditReport,
	loadSelectedStagingVocab,
	type PromoteVocabPlan,
	resolveMediaR2BucketName,
	resolveTargetTeacherOrgId,
	resolveVocabD1Database,
	syncVocabAudioToR2,
	type VocabPromoteSqlRunner,
	verifyPromotedVocab,
} from "../src/seed/promote-vocab";

export type PromoteVocabMode = "audit-staging" | "dry-run" | "apply";

export interface PromoteVocabCliArgs {
	mode: PromoteVocabMode;
	d1: boolean;
	stagingFile: string | null;
	prodFile: string | null;
	groupNames: string[];
	groupIds: string[];
	deckTitles: string[];
	deckIds: string[];
	sourceOrgId: string | null;
	targetOrgId: string | null;
	teacherEmails: string | null;
	relocateFromOrgId: string | null;
	includeClassDecks: boolean;
	allowProd: boolean;
	confirmProd: string | null;
	dumpPath: string | null;
	publicLogs: boolean;
	stagingR2Bucket: string | null;
	prodR2Bucket: string | null;
	help: boolean;
}

const USAGE_TEXT = `usage: tsx packages/db/scripts/promote-vocab-prod.ts (--d1 | --staging-file <sqlite> [--prod-file <sqlite>]) [options]

Modes:
  --mode audit-staging      Read-only inventory of vocab_group & vocab_deck on staging
  --mode dry-run            Read-only diff & conflict check between staging and production (default)
  --mode apply              Backup preimage/rollback SQL, copy R2 audio, upsert to production & verify

Selection (required for dry-run and apply):
  --group <name>            Select vocab_group by name (repeatable, case/NFC-insensitive)
  --group-names <list>      Select multiple vocab_group names separated by ";" or newline
  --group-id <id>           Select vocab_group by exact ID (repeatable)
  --deck <title>            Select bank vocab_deck by title (repeatable, case/NFC-insensitive)
  --deck-titles <list>      Select multiple vocab_deck titles separated by ";" or newline
  --deck-id <id>            Select bank vocab_deck by exact ID (repeatable)
  --source-org-id <id>      Optional org filter when reading staging
  --include-class-decks     Include class-bound decks (default: bank decks class_id IS NULL only)

Target & Safety:
  --target-org-id <id>      Target production organization.id (optional; auto-resolved via TEACHER_EMAILS -> LEAD_ORG_ID)
  --teacher-emails <csv>    Comma-separated teacher emails to resolve active org (or env TEACHER_EMAILS)
  --relocate-from-org <id>  Allow moving matching promoted IDs from this specific prod org into target org
  --allow-prod              Required flag when --mode apply targets Cloudflare D1
  --confirm-prod <word>     Required confirmation when --mode apply targets Cloudflare D1 (must be "prod")
  --dump <path>             Path prefix for preimage JSON & rollback SQL backup
  --public-logs             Omit raw row/org UUIDs from stdout (for public CI logs)
  --staging-r2-bucket <n>   Optional explicit staging media R2 bucket name
  --prod-r2-bucket <n>      Optional explicit prod media R2 bucket name
  --help, -h                Show this help message
`;

export function splitDelimitedList(raw: string): string[] {
	return raw
		.split(/[;\r\n]+/)
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}

export function parsePromoteVocabArgs(
	argv: readonly string[],
): PromoteVocabCliArgs {
	let mode: PromoteVocabMode = "dry-run";
	let d1 = false;
	let stagingFile: string | null = null;
	let prodFile: string | null = null;
	const groupNames: string[] = [];
	const groupIds: string[] = [];
	const deckTitles: string[] = [];
	const deckIds: string[] = [];
	let sourceOrgId: string | null = null;
	let targetOrgId: string | null = null;
	let teacherEmails: string | null = null;
	let relocateFromOrgId: string | null = null;
	let includeClassDecks = false;
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
		} else if (arg === "--group") {
			const [val, nextIdx] = requireNext("--group", i);
			groupNames.push(val);
			i = nextIdx;
		} else if (arg === "--group-names") {
			const [val, nextIdx] = requireNext("--group-names", i);
			groupNames.push(...splitDelimitedList(val));
			i = nextIdx;
		} else if (arg === "--group-id") {
			const [val, nextIdx] = requireNext("--group-id", i);
			groupIds.push(val);
			i = nextIdx;
		} else if (arg === "--deck") {
			const [val, nextIdx] = requireNext("--deck", i);
			deckTitles.push(val);
			i = nextIdx;
		} else if (arg === "--deck-titles") {
			const [val, nextIdx] = requireNext("--deck-titles", i);
			deckTitles.push(...splitDelimitedList(val));
			i = nextIdx;
		} else if (arg === "--deck-id") {
			const [val, nextIdx] = requireNext("--deck-id", i);
			deckIds.push(val);
			i = nextIdx;
		} else if (arg === "--source-org-id") {
			[sourceOrgId, i] = requireNext("--source-org-id", i);
		} else if (arg === "--target-org-id") {
			[targetOrgId, i] = requireNext("--target-org-id", i);
		} else if (arg === "--teacher-emails") {
			[teacherEmails, i] = requireNext("--teacher-emails", i);
		} else if (arg === "--relocate-from-org") {
			[relocateFromOrgId, i] = requireNext("--relocate-from-org", i);
		} else if (arg === "--include-class-decks") {
			includeClassDecks = true;
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
				groupNames: [],
				groupIds: [],
				deckTitles: [],
				deckIds: [],
				sourceOrgId: null,
				targetOrgId: null,
				teacherEmails: null,
				relocateFromOrgId: null,
				includeClassDecks: false,
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
		groupNames.length === 0 &&
		groupIds.length === 0 &&
		deckTitles.length === 0 &&
		deckIds.length === 0
	) {
		throw new Error(
			`Mode "${mode}" requires at least one selector (--group, --group-names, --group-id, --deck, --deck-titles, or --deck-id).`,
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
		groupNames,
		groupIds,
		deckTitles,
		deckIds,
		sourceOrgId,
		targetOrgId,
		teacherEmails,
		relocateFromOrgId,
		includeClassDecks,
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
	plan: PromoteVocabPlan,
	dumpPathPrefix: string | null,
): Promise<{ preimageFile: string; rollbackSqlFile: string }> {
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const basePath = dumpPathPrefix
		? resolve(dumpPathPrefix)
		: resolve(process.cwd(), `plans/reports/promote-vocab-prod-${timestamp}`);
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
	await writeFile(rollbackSqlFile, formatRollbackSql(plan), "utf8");
	return { preimageFile, rollbackSqlFile };
}

export async function runPromoteVocabProdCli(
	argv: readonly string[],
	deps?: {
		env?: Record<string, string | undefined>;
		fetchImpl?: typeof fetch;
		writeStdout?: (chunk: string) => void;
	},
): Promise<void> {
	const write = deps?.writeStdout ?? ((s: string) => process.stdout.write(s));
	const args = parsePromoteVocabArgs(argv);
	if (args.help) {
		write(USAGE_TEXT);
		return;
	}

	const env = deps?.env ?? process.env;
	const secrets: string[] = [];
	const closers: Array<() => void> = [];

	try {
		let stagingRunner: VocabPromoteSqlRunner;
		let prodRunner: VocabPromoteSqlRunner | null = null;
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

			const stagingDb = await resolveVocabD1Database({
				stage: "staging",
				accountId: cfAccountId,
				apiToken: cfApiToken,
				explicitDatabaseId: env.STAGING_D1_DATABASE_ID,
				fetchImpl: deps?.fetchImpl,
			});
			secrets.push(stagingDb.id);
			stagingRunner = createD1VocabPromoteRunner({
				accountId: cfAccountId,
				databaseId: stagingDb.id,
				apiToken: cfApiToken,
				fetchImpl: deps?.fetchImpl,
			});

			if (args.mode === "audit-staging") {
				write(`[promote-vocab] source D1=${stagingDb.name} (read-only)\n`);
			} else {
				const prodDb = await resolveVocabD1Database({
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
				prodRunner = createD1VocabPromoteRunner({
					accountId: cfAccountId,
					databaseId: prodDb.id,
					apiToken: cfApiToken,
					fetchImpl: deps?.fetchImpl,
				});
				write(
					`[promote-vocab] source D1=${stagingDb.name} -> target D1=${prodDb.name} (mode=${args.mode})\n`,
				);
			}
		} else {
			const stagingClient = createClient({
				url: pathToFileURL(resolve(args.stagingFile ?? "")).toString(),
			});
			closers.push(() => stagingClient.close());
			stagingRunner = createLibsqlVocabPromoteRunner(stagingClient);

			if (args.mode !== "audit-staging") {
				const prodClient = createClient({
					url: pathToFileURL(resolve(args.prodFile ?? "")).toString(),
				});
				closers.push(() => prodClient.close());
				prodRunner = createLibsqlVocabPromoteRunner(prodClient);
			}
			write(`[promote-vocab] local SQLite mode=${args.mode}\n`);
		}

		// 1. Mode: audit-staging
		if (args.mode === "audit-staging") {
			const audit = await auditStagingVocab(stagingRunner, {
				sourceOrgId: args.sourceOrgId ?? undefined,
			});
			write(
				`${formatStagingVocabAuditReport(audit, { publicLogs: args.publicLogs })}\n`,
			);
			return;
		}

		// 2. Modes: dry-run & apply
		if (!prodRunner) {
			throw new Error(
				"Internal error: target production runner not initialized.",
			);
		}
		const explicitTargetOrgId =
			args.targetOrgId?.trim() || env.TARGET_ORG_ID?.trim() || "";
		const teacherEmailsRaw =
			args.teacherEmails?.trim() || env.TEACHER_EMAILS?.trim() || "";
		const leadOrgId = env.LEAD_ORG_ID?.trim() || "";
		const relocateFromOrgId =
			args.relocateFromOrgId?.trim() || env.RELOCATE_FROM_ORG_ID?.trim() || "";

		const resolvedTarget = await resolveTargetTeacherOrgId(prodRunner, {
			explicitTargetOrgId: explicitTargetOrgId || undefined,
			teacherEmails: teacherEmailsRaw || undefined,
			leadOrgId: leadOrgId || undefined,
		});
		const targetOrgId = resolvedTarget.orgId;
		if (args.publicLogs) {
			secrets.push(targetOrgId);
			if (leadOrgId) secrets.push(leadOrgId);
			if (relocateFromOrgId) secrets.push(relocateFromOrgId);
			if (teacherEmailsRaw) secrets.push(teacherEmailsRaw);
		}

		const prodOrgSummary = await auditProdOrgVocabSummary(prodRunner);
		const summaryParts = prodOrgSummary.map((bucket, idx) => {
			const tags: string[] = [];
			if (bucket.orgId === targetOrgId) tags.push("target");
			if (leadOrgId && bucket.orgId === leadOrgId) tags.push("lead");
			if (relocateFromOrgId && bucket.orgId === relocateFromOrgId) {
				tags.push("relocate-from");
			}
			const label = args.publicLogs
				? tags.length > 0
					? tags.join("+")
					: `org-${idx + 1}`
				: `${bucket.orgId}${tags.length > 0 ? `(${tags.join("+")})` : ""}`;
			return `${label}[g=${bucket.groupCount},d=${bucket.deckCount},w=${bucket.wordCount}]`;
		});
		write(
			`[promote-vocab] Target org resolved via=${resolvedTarget.resolvedVia}, sameAsLeadOrg=${resolvedTarget.sameAsLeadOrg}, relocateEnabled=${Boolean(relocateFromOrgId && relocateFromOrgId !== targetOrgId)}\n`,
		);
		write(
			`[promote-vocab] Prod org vocab state (${prodOrgSummary.length} orgs): ${summaryParts.join(" | ")}\n`,
		);

		const selected = await loadSelectedStagingVocab(stagingRunner, {
			groupNames: args.groupNames,
			groupIds: args.groupIds,
			deckTitles: args.deckTitles,
			deckIds: args.deckIds,
			sourceOrgId: args.sourceOrgId ?? undefined,
			includeClassDecks: args.includeClassDecks,
		});

		const plan = await buildPromoteVocabPlan(selected, prodRunner, {
			targetOrgId,
			relocateFromOrgId: relocateFromOrgId || undefined,
		});

		write(
			`[promote-vocab] Selected groups (${plan.targetGroups.length}): ${plan.targetGroups.map((g) => `"${g.name}"`).join(", ") || "(none)"}\n`,
		);
		write(
			`[promote-vocab] Plan summary: groups=${plan.diff.group.total} (+${plan.diff.group.toInsert} / ~${plan.diff.group.toUpdate} / =${plan.diff.group.unchanged}), decks=${plan.diff.deck.total} (+${plan.diff.deck.toInsert} / ~${plan.diff.deck.toUpdate} / =${plan.diff.deck.unchanged}), words=${plan.diff.word.total} (+${plan.diff.word.toInsert} / ~${plan.diff.word.toUpdate} / =${plan.diff.word.unchanged}), r2Audio=${plan.audioTransfers.length}\n`,
		);
		for (const d of plan.targetDecks) {
			const wordCount = plan.targetWords.filter(
				(w) => w.deckId === d.id,
			).length;
			const lessonPrefix = d.lessonNumber !== null ? `L${d.lessonNumber} ` : "";
			write(`  - ${lessonPrefix}"${d.title}": words=${wordCount}\n`);
		}

		// Check R2 audio (only if selected words actually have audioKey and transport is D1)
		let r2Buckets: { source: string; target: string } | null = null;
		if (
			args.d1 &&
			plan.audioTransfers.length > 0 &&
			cfAccountId &&
			cfApiToken
		) {
			const [sourceBucket, targetBucket] = await Promise.all([
				resolveMediaR2BucketName({
					stage: "staging",
					accountId: cfAccountId,
					apiToken: cfApiToken,
					explicitBucket: args.stagingR2Bucket ?? env.STAGING_R2_MEDIA_BUCKET,
					fetchImpl: deps?.fetchImpl,
				}),
				resolveMediaR2BucketName({
					stage: "prod",
					accountId: cfAccountId,
					apiToken: cfApiToken,
					explicitBucket: args.prodR2Bucket ?? env.PROD_R2_MEDIA_BUCKET,
					fetchImpl: deps?.fetchImpl,
				}),
			]);
			r2Buckets = { source: sourceBucket, target: targetBucket };
			write(
				`[promote-vocab] R2 buckets: source=${sourceBucket} -> target=${targetBucket}\n`,
			);
		}

		if (args.mode === "dry-run") {
			if (r2Buckets && cfAccountId && cfApiToken) {
				const r2Res = await syncVocabAudioToR2({
					accountId: cfAccountId,
					apiToken: cfApiToken,
					sourceBucket: r2Buckets.source,
					targetBucket: r2Buckets.target,
					transfers: plan.audioTransfers,
					dryRun: true,
					fetchImpl: deps?.fetchImpl,
				});
				write(
					`[promote-vocab] DRY-RUN R2 audio: total=${r2Res.total}, existing=${r2Res.existing}, toCopy=${r2Res.missingOnTarget - r2Res.missingOnSource}, missingOnSource=${r2Res.missingOnSource}\n`,
				);
			}
			write(
				`[promote-vocab] DRY-RUN complete (read-only, no writes performed). Expected parity hash=${plan.contentHash.slice(0, 12)}...\n`,
			);
			return;
		}

		// 3. Mode: apply — backup preimage + rollback SQL BEFORE any write
		const { preimageFile, rollbackSqlFile } = await saveBackupArtifacts(
			plan,
			args.dumpPath,
		);
		write(
			`[promote-vocab] Preimage backup saved: ${preimageFile} (groups=${plan.preimage.groups.length}, decks=${plan.preimage.decks.length}, words=${plan.preimage.words.length})\n`,
		);
		write(`[promote-vocab] Rollback SQL saved: ${rollbackSqlFile}\n`);

		// Copy missing R2 audio objects before DB upsert so words never point to dangling keys
		if (r2Buckets && cfAccountId && cfApiToken) {
			const r2Res = await syncVocabAudioToR2({
				accountId: cfAccountId,
				apiToken: cfApiToken,
				sourceBucket: r2Buckets.source,
				targetBucket: r2Buckets.target,
				transfers: plan.audioTransfers,
				dryRun: false,
				fetchImpl: deps?.fetchImpl,
			});
			write(
				`[promote-vocab] R2 audio synced: total=${r2Res.total}, existing=${r2Res.existing}, copied=${r2Res.copied}, missingOnSource=${r2Res.missingOnSource}, verified=${r2Res.verified}\n`,
			);
			if (r2Res.missingOnSource > 0) {
				throw new Error(
					`Refusing DB upsert: ${r2Res.missingOnSource} audio object(s) missing on staging R2 bucket.`,
				);
			}
		}

		const execRes = await applyPromoteVocabPlan(prodRunner, plan);
		write(
			`[promote-vocab] Executed ${execRes.statementsExecuted} upsert statement(s) on production.\n`,
		);

		const verifyRes = await verifyPromotedVocab(prodRunner, plan);
		write(
			`[promote-vocab] Verify parity: ok=${verifyRes.ok}, groups=${verifyRes.counts.group.actual}/${verifyRes.counts.group.expected}, decks=${verifyRes.counts.deck.actual}/${verifyRes.counts.deck.expected}, words=${verifyRes.counts.word.actual}/${verifyRes.counts.word.expected}, sha256=${verifyRes.actualHash.slice(0, 12)}...\n`,
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
	runPromoteVocabProdCli(process.argv.slice(2)).catch((err) => {
		console.error(
			`[promote-vocab] ERROR: ${err instanceof Error ? err.message : String(err)}`,
		);
		process.exit(1);
	});
}
