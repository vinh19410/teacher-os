/**
 * Manual CLI để import bộ từ vựng từ file Excel (.xlsx, chia theo Week × Skill)
 * trực tiếp vào `vocab_group`, `vocab_deck`, `vocab_word` (bank decks `class_id = NULL`)
 * trên SQLite local hoặc Cloudflare D1 (staging / production).
 *
 *   # 1. Dry-run xem trước thay đổi lên production (chỉ đọc):
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... TEACHER_EMAILS=... \
 *     pnpm --filter @teacher-os/db exec tsx scripts/import-vocab-prod.ts --d1 --d1-stage prod --mode dry-run \
 *       --input ../../docs/vocab-sample/IELTS_Bridge_Vocabulary.xlsx \
 *       --sheet "Tổng hợp" --group "IELTS BRIDGE"
 *
 *   # 2. Apply lên production (kèm preimage backup, rollback SQL & SHA-256 verify):
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... TEACHER_EMAILS=... \
 *     pnpm --filter @teacher-os/db exec tsx scripts/import-vocab-prod.ts --d1 --d1-stage prod --mode apply \
 *       --allow-prod --confirm-prod prod \
 *       --input ../../docs/vocab-sample/IELTS_Bridge_Vocabulary.xlsx \
 *       --sheet "Tổng hợp" --group "IELTS BRIDGE"
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { redactSensitive } from "../src/audit/orphan-materials";
import {
	buildImportVocabPlan,
	loadVocabImportDatasetFromXlsx,
} from "../src/seed/import-vocab";
import {
	applyPromoteVocabPlan,
	auditProdOrgVocabSummary,
	createD1VocabPromoteRunner,
	createLibsqlVocabPromoteRunner,
	formatRollbackSql,
	type PromoteVocabPlan,
	resolveTargetTeacherOrgId,
	resolveVocabD1Database,
	type VocabPromoteSqlRunner,
	verifyPromotedVocab,
} from "../src/seed/promote-vocab";

export type ImportVocabMode = "dry-run" | "apply";
export type ImportVocabStage = "staging" | "prod";

export interface ImportVocabCliArgs {
	mode: ImportVocabMode;
	d1: boolean;
	d1Stage: ImportVocabStage;
	filePath: string | null;
	inputPath: string;
	sheetName: string;
	groupName: string;
	sourceKey: string | null;
	lang: string;
	targetOrgId: string | null;
	teacherEmails: string | null;
	allowProd: boolean;
	confirmProd: string | null;
	dumpPath: string | null;
	publicLogs: boolean;
	help: boolean;
}

const USAGE_TEXT = `usage: tsx packages/db/scripts/import-vocab-prod.ts (--d1 [--d1-stage prod|staging] | --file <sqlite>) --input <xlsx> --group <name> [options]

Modes:
  --mode dry-run            Read-only diff & conflict check against target DB (default)
  --mode apply              Backup preimage/rollback SQL, upsert to target DB & verify parity

Input:
  --input <path>            Path to source .xlsx workbook (required)
  --sheet <name>            Worksheet name to import (default: "Tổng hợp")
  --group <name>            Target vocab_group name (required, e.g. "IELTS BRIDGE")
  --source-key <slug>       Optional stable source slug for deterministic IDs (default: derived from filename)
  --lang <code>             Language code for imported decks (default: "en")

Target & Safety:
  --d1                      Target Cloudflare D1 via REST API
  --d1-stage <prod|staging> Target D1 stage when --d1 is set (default: "prod")
  --file <sqlite-path>      Target local SQLite/libsql file
  --target-org-id <id>      Target organization.id (optional; auto-resolved via TEACHER_EMAILS -> LEAD_ORG_ID)
  --teacher-emails <csv>    Comma-separated teacher emails to resolve active org (or env TEACHER_EMAILS)
  --allow-prod              Required flag when --mode apply targets --d1 --d1-stage prod
  --confirm-prod <word>     Required confirmation when --mode apply targets --d1 --d1-stage prod (must be "prod")
  --dump <path>             Path prefix for preimage JSON & rollback SQL backup
  --public-logs             Omit raw row/org UUIDs and emails from stdout (for public CI logs)
  --help, -h                Show this help message
`;

export function parseImportVocabArgs(
	argv: readonly string[],
): ImportVocabCliArgs {
	let mode: ImportVocabMode = "dry-run";
	let d1 = false;
	let d1Stage: ImportVocabStage = "prod";
	let filePath: string | null = null;
	let inputPath = "";
	let sheetName = "Tổng hợp";
	let groupName = "";
	let sourceKey: string | null = null;
	let lang = "en";
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
			if (next !== "staging" && next !== "prod") {
				throw new Error(
					`Invalid --d1-stage "${next}": expected staging or prod`,
				);
			}
			d1Stage = next;
			i = nextIdx;
		} else if (arg === "--file") {
			[filePath, i] = requireNext("--file", i);
		} else if (arg === "--input") {
			[inputPath, i] = requireNext("--input", i);
		} else if (arg === "--sheet") {
			[sheetName, i] = requireNext("--sheet", i);
		} else if (arg === "--group") {
			[groupName, i] = requireNext("--group", i);
		} else if (arg === "--source-key") {
			[sourceKey, i] = requireNext("--source-key", i);
		} else if (arg === "--lang") {
			[lang, i] = requireNext("--lang", i);
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
				inputPath: "",
				sheetName: "Tổng hợp",
				groupName: "",
				sourceKey: null,
				lang: "en",
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
			"Specify a transport: either --d1 or --file <sqlite-path>.",
		);
	}
	if (d1 && filePath) {
		throw new Error("Cannot combine --d1 with --file.");
	}
	if (!inputPath.trim()) {
		throw new Error("Missing required argument: --input <xlsx-path>.");
	}
	if (!groupName.trim()) {
		throw new Error("Missing required argument: --group <name>.");
	}
	if (mode === "apply" && d1 && d1Stage === "prod") {
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
		d1Stage,
		filePath,
		inputPath,
		sheetName,
		groupName,
		sourceKey,
		lang,
		targetOrgId,
		teacherEmails,
		allowProd,
		confirmProd,
		dumpPath,
		publicLogs,
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
		: resolve(process.cwd(), `plans/reports/import-vocab-prod-${timestamp}`);
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

export async function runImportVocabProdCli(
	argv: readonly string[],
	deps?: {
		env?: Record<string, string | undefined>;
		fetchImpl?: typeof fetch;
		writeStdout?: (chunk: string) => void;
	},
): Promise<void> {
	const write = deps?.writeStdout ?? ((s: string) => process.stdout.write(s));
	const args = parseImportVocabArgs(argv);
	if (args.help) {
		write(USAGE_TEXT);
		return;
	}

	const env = deps?.env ?? process.env;
	const secrets: string[] = [];
	const closers: Array<() => void> = [];

	try {
		const dataset = await loadVocabImportDatasetFromXlsx({
			filePath: resolve(args.inputPath),
			sheetName: args.sheetName,
			groupName: args.groupName,
			sourceKey: args.sourceKey ?? undefined,
			lang: args.lang,
		});
		write(
			`[import-vocab] Parsed sheet="${args.sheetName}" sourceKey="${dataset.sourceKey}": decks=${dataset.stats.deckCount}, words=${dataset.stats.totalWords} (word=${dataset.stats.wordCount}, chunk=${dataset.stats.chunkCount})\n`,
		);

		let targetRunner: VocabPromoteSqlRunner;
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
				args.d1Stage === "prod"
					? (env.PROD_D1_DATABASE_ID ?? env.D1_DATABASE_ID)
					: (env.STAGING_D1_DATABASE_ID ?? env.D1_DATABASE_ID);
			const targetDb = await resolveVocabD1Database({
				stage: args.d1Stage,
				accountId: cfAccountId,
				apiToken: cfApiToken,
				explicitDatabaseId: explicitDbId,
				fetchImpl: deps?.fetchImpl,
			});
			secrets.push(targetDb.id);
			targetRunner = createD1VocabPromoteRunner({
				accountId: cfAccountId,
				databaseId: targetDb.id,
				apiToken: cfApiToken,
				fetchImpl: deps?.fetchImpl,
			});
			write(
				`[import-vocab] target D1=${targetDb.name} (stage=${args.d1Stage}, mode=${args.mode})\n`,
			);
		} else {
			const client = createClient({
				url: pathToFileURL(resolve(args.filePath ?? "")).toString(),
			});
			closers.push(() => client.close());
			targetRunner = createLibsqlVocabPromoteRunner(client);
			write(`[import-vocab] local SQLite mode=${args.mode}\n`);
		}

		const explicitTargetOrgId =
			args.targetOrgId?.trim() || env.TARGET_ORG_ID?.trim() || "";
		const teacherEmailsRaw =
			args.teacherEmails?.trim() || env.TEACHER_EMAILS?.trim() || "";
		const leadOrgId = env.LEAD_ORG_ID?.trim() || "";

		const resolvedTarget = await resolveTargetTeacherOrgId(targetRunner, {
			explicitTargetOrgId: explicitTargetOrgId || undefined,
			teacherEmails: teacherEmailsRaw || undefined,
			leadOrgId: leadOrgId || undefined,
		});
		const targetOrgId = resolvedTarget.orgId;
		if (args.publicLogs) {
			secrets.push(targetOrgId);
			if (leadOrgId) secrets.push(leadOrgId);
			if (teacherEmailsRaw) secrets.push(teacherEmailsRaw);
		}

		const orgSummary = await auditProdOrgVocabSummary(targetRunner);
		const summaryParts = orgSummary.map((bucket, idx) => {
			const tags: string[] = [];
			if (bucket.orgId === targetOrgId) tags.push("target");
			if (leadOrgId && bucket.orgId === leadOrgId) tags.push("lead");
			const label = args.publicLogs
				? tags.length > 0
					? tags.join("+")
					: `org-${idx + 1}`
				: `${bucket.orgId}${tags.length > 0 ? `(${tags.join("+")})` : ""}`;
			return `${label}[g=${bucket.groupCount},d=${bucket.deckCount},w=${bucket.wordCount}]`;
		});
		write(
			`[import-vocab] Target org resolved via=${resolvedTarget.resolvedVia}, sameAsLeadOrg=${resolvedTarget.sameAsLeadOrg}\n`,
		);
		write(
			`[import-vocab] Target DB org vocab state (${orgSummary.length} orgs): ${summaryParts.join(" | ")}\n`,
		);

		const { plan, reusedExistingGroup, orderedDecks } =
			await buildImportVocabPlan(dataset, targetRunner, { targetOrgId });

		write(
			`[import-vocab] Target group: "${dataset.groupName}" (reusedExisting=${reusedExistingGroup})\n`,
		);
		write(
			`[import-vocab] Plan summary: groups=${plan.diff.group.total} (+${plan.diff.group.toInsert} / ~${plan.diff.group.toUpdate} / =${plan.diff.group.unchanged}), decks=${plan.diff.deck.total} (+${plan.diff.deck.toInsert} / ~${plan.diff.deck.toUpdate} / =${plan.diff.deck.unchanged}), words=${plan.diff.word.total} (+${plan.diff.word.toInsert} / ~${plan.diff.word.toUpdate} / =${plan.diff.word.unchanged})\n`,
		);
		for (const d of orderedDecks) {
			const wordCount = d.words.filter((w) => w.entryType === "word").length;
			const chunkCount = d.words.length - wordCount;
			write(
				`  - "${d.title}" (${d.topic}): total=${d.words.length} (word=${wordCount}, chunk=${chunkCount})\n`,
			);
		}

		if (args.mode === "dry-run") {
			write(
				`[import-vocab] DRY-RUN complete (read-only, no writes performed). Expected parity hash=${plan.contentHash.slice(0, 12)}...\n`,
			);
			return;
		}

		// Mode: apply — backup preimage + rollback SQL BEFORE any write
		const { preimageFile, rollbackSqlFile } = await saveBackupArtifacts(
			plan,
			args.dumpPath,
		);
		write(
			`[import-vocab] Preimage backup saved: ${preimageFile} (groups=${plan.preimage.groups.length}, decks=${plan.preimage.decks.length}, words=${plan.preimage.words.length})\n`,
		);
		write(`[import-vocab] Rollback SQL saved: ${rollbackSqlFile}\n`);

		const execRes = await applyPromoteVocabPlan(targetRunner, plan);
		write(
			`[import-vocab] Executed ${execRes.statementsExecuted} upsert statement(s).\n`,
		);

		const verifyRes = await verifyPromotedVocab(targetRunner, plan);
		write(
			`[import-vocab] Verify parity: ok=${verifyRes.ok}, groups=${verifyRes.counts.group.actual}/${verifyRes.counts.group.expected}, decks=${verifyRes.counts.deck.actual}/${verifyRes.counts.deck.expected}, words=${verifyRes.counts.word.actual}/${verifyRes.counts.word.expected}, sha256=${verifyRes.actualHash.slice(0, 12)}...\n`,
		);
		if (!verifyRes.ok) {
			throw new Error(
				`Post-import verification failed: ${verifyRes.mismatches.join("; ")}`,
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
	runImportVocabProdCli(process.argv.slice(2)).catch((err) => {
		console.error(
			`[import-vocab] ERROR: ${err instanceof Error ? err.message : String(err)}`,
		);
		process.exit(1);
	});
}
