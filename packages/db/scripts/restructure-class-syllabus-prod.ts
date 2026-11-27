/**
 * Manual CLI để audit & tái cấu trúc giáo trình bản copy của một lớp học
 * (`syllabus.class_id = <classId>`) về đúng 2 chặng (`syllabus_module`) trên
 * SQLite cục bộ hoặc Cloudflare D1 (staging / production).
 *
 *   # 1. Dry-run read-only soi cấu trúc hiện tại trên production:
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
 *     pnpm --filter @teacher-os/db exec tsx scripts/restructure-class-syllabus-prod.ts \
 *       --d1 --d1-stage prod --mode dry-run \
 *       --class "<ten-lop>"
 *
 *   # 2. Dry-run xem trước kế hoạch 2 chặng với spec JSON:
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
 *     pnpm --filter @teacher-os/db exec tsx scripts/restructure-class-syllabus-prod.ts \
 *       --d1 --d1-stage prod --mode dry-run \
 *       --class "<ten-lop>" \
 *       --spec-json '{"stages":[...],"lessonTitleMode":"module-title"}'
 *
 *   # 3. Apply trên production (preimage backup + rollback SQL + live preflight + verify):
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
 *     pnpm --filter @teacher-os/db exec tsx scripts/restructure-class-syllabus-prod.ts \
 *       --d1 --d1-stage prod --mode apply \
 *       --allow-prod --confirm-prod prod \
 *       --class "<ten-lop>" \
 *       --spec-json '{"stages":[...],"lessonTitleMode":"module-title"}'
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import {
	applyRestructureClassSyllabusPlan,
	auditClassSyllabus,
	buildRestructureClassSyllabusPlan,
	createD1VocabPromoteRunner,
	createLibsqlVocabPromoteRunner,
	formatClassSyllabusAuditReport,
	formatRestructurePlanPreview,
	formatRestructureRollbackSql,
	parseRestructureSpecJson,
	type RestructureClassSyllabusPlan,
	type RestructureSqlRunner,
	redactSensitive,
	resolveTargetTeacherOrgId,
	resolveVocabD1Database,
	verifyRestructuredClassSyllabus,
} from "../src/audit/restructure-class-syllabus";

export type RestructureSyllabusMode = "dry-run" | "apply";
export type RestructureD1Stage = "prod" | "staging";

export interface RestructureSyllabusCliArgs {
	mode: RestructureSyllabusMode;
	d1: boolean;
	d1Stage: RestructureD1Stage;
	filePath: string | null;
	className: string | null;
	classId: string | null;
	targetOrgId: string | null;
	teacherEmails: string | null;
	specJson: string | null;
	specFile: string | null;
	allowProd: boolean;
	confirmProd: string | null;
	dumpPath: string | null;
	publicLogs: boolean;
	help: boolean;
}

const USAGE_TEXT = `usage: tsx packages/db/scripts/restructure-class-syllabus-prod.ts (--d1 [--d1-stage prod|staging] | --file <sqlite-path>) (--class <name> | --class-id <id>) [options]

Modes:
  --mode dry-run            Read-only audit (and plan preview when --spec-json/--spec-file provided) (default)
  --mode apply              Save preimage/rollback SQL, apply 2-stage restructure, and verify SHA-256 parity

Scope:
  --class <name>            Target class name (normalized Vietnamese match)
  --class-id <id>           Target class exact ID (overrides --class)
  --target-org-id <id>      Target organization.id (optional; auto-resolved via TEACHER_EMAILS -> LEAD_ORG_ID)
  --teacher-emails <csv>    Comma-separated teacher emails for org resolution (or env TEACHER_EMAILS)

Plan Specification (required for --mode apply; optional preview in --mode dry-run):
  --spec-json <json>        JSON string defining the 2 target stages and lesson mapping
  --spec-file <path>        Path to JSON file defining the 2 target stages and lesson mapping

Transport & Safety:
  --d1                      Target Cloudflare D1 REST API
  --d1-stage <prod|staging> Target D1 stage (default: prod)
  --file <sqlite-path>      Target local SQLite/libsql database file
  --allow-prod              Required flag when --mode apply targets D1 prod
  --confirm-prod <word>     Required confirmation when --mode apply targets D1 prod (must be "prod")
  --dump <path>             Path prefix for preimage JSON & rollback SQL backup
  --public-logs             Omit class name, raw UUIDs, and emails from stdout (for public CI logs)
  --help, -h                Show this help message
`;

export function parseRestructureSyllabusArgs(
	argv: readonly string[],
): RestructureSyllabusCliArgs {
	let mode: RestructureSyllabusMode = "dry-run";
	let d1 = false;
	let d1Stage: RestructureD1Stage = "prod";
	let hasExplicitStage = false;
	let filePath: string | null = null;
	let className: string | null = null;
	let classId: string | null = null;
	let targetOrgId: string | null = null;
	let teacherEmails: string | null = null;
	let specJson: string | null = null;
	let specFile: string | null = null;
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
		} else if (arg === "--class") {
			[className, i] = requireNext("--class", i);
		} else if (arg === "--class-id") {
			[classId, i] = requireNext("--class-id", i);
		} else if (arg === "--target-org-id") {
			[targetOrgId, i] = requireNext("--target-org-id", i);
		} else if (arg === "--teacher-emails") {
			[teacherEmails, i] = requireNext("--teacher-emails", i);
		} else if (arg === "--spec-json") {
			[specJson, i] = requireNext("--spec-json", i);
		} else if (arg === "--spec-file") {
			[specFile, i] = requireNext("--spec-file", i);
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
				className: null,
				classId: null,
				targetOrgId: null,
				teacherEmails: null,
				specJson: null,
				specFile: null,
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
	if (!className && !classId) {
		throw new Error(
			"Specify target class: either --class <name> or --class-id <id>.",
		);
	}
	if (specJson && specFile) {
		throw new Error("Cannot combine --spec-json with --spec-file.");
	}
	if (mode === "apply" && !specJson && !specFile) {
		throw new Error(
			"Mode 'apply' requires an explicit restructure plan via --spec-json or --spec-file.",
		);
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
		className: classId ? null : className,
		classId,
		targetOrgId,
		teacherEmails,
		specJson,
		specFile,
		allowProd,
		confirmProd,
		dumpPath,
		publicLogs,
		help: false,
	};
}

async function saveRestructureBackupArtifacts(
	plan: RestructureClassSyllabusPlan,
	stageLabel: string,
	dumpPathPrefix: string | null,
): Promise<{ preimageFile: string; rollbackSqlFile: string }> {
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const basePath = dumpPathPrefix
		? resolve(dumpPathPrefix)
		: resolve(
				process.cwd(),
				`plans/reports/restructure-class-syllabus-${stageLabel}-${timestamp}`,
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
	await writeFile(rollbackSqlFile, formatRestructureRollbackSql(plan), "utf8");
	return { preimageFile, rollbackSqlFile };
}

export async function runRestructureClassSyllabusCli(
	argv: readonly string[],
	deps?: {
		env?: Record<string, string | undefined>;
		fetchImpl?: typeof fetch;
		writeStdout?: (chunk: string) => void;
	},
): Promise<void> {
	const rawWrite =
		deps?.writeStdout ?? ((s: string) => process.stdout.write(s));
	const args = parseRestructureSyllabusArgs(argv);
	if (args.help) {
		rawWrite(USAGE_TEXT);
		return;
	}

	const env = deps?.env ?? process.env;
	const secrets: string[] = [];
	const closers: Array<() => void> = [];
	const write = (chunk: string) => {
		rawWrite(args.publicLogs ? redactSensitive(chunk, secrets) : chunk);
	};

	try {
		let runner: RestructureSqlRunner;
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
				`[restructure-syllabus] target D1=${dbInfo.name} (stage=${args.d1Stage}, mode=${args.mode})\n`,
			);
		} else {
			const client = createClient({
				url: pathToFileURL(resolve(args.filePath ?? "")).toString(),
			});
			closers.push(() => client.close());
			runner = createLibsqlVocabPromoteRunner(client);
			stageLabel = "local";
			write(`[restructure-syllabus] local SQLite mode=${args.mode}\n`);
		}

		const explicitTargetOrgId =
			args.targetOrgId?.trim() || env.TARGET_ORG_ID?.trim() || "";
		const teacherEmailsRaw =
			args.teacherEmails?.trim() || env.TEACHER_EMAILS?.trim() || "";
		const leadOrgId = env.LEAD_ORG_ID?.trim() || "";

		if (args.publicLogs) {
			if (args.className) secrets.push(args.className);
			if (args.classId) secrets.push(args.classId);
			if (leadOrgId) secrets.push(leadOrgId);
			if (teacherEmailsRaw) secrets.push(teacherEmailsRaw);
		}

		const resolvedTarget = await resolveTargetTeacherOrgId(runner, {
			explicitTargetOrgId: explicitTargetOrgId || undefined,
			teacherEmails: teacherEmailsRaw || undefined,
			leadOrgId: leadOrgId || undefined,
		});
		const targetOrgId = resolvedTarget.orgId;
		if (args.publicLogs) {
			secrets.push(targetOrgId);
		}

		write(
			`[restructure-syllabus] Target org resolved via=${resolvedTarget.resolvedVia}, sameAsLeadOrg=${resolvedTarget.sameAsLeadOrg}\n`,
		);

		const audit = await auditClassSyllabus(runner, {
			targetOrgId,
			className: args.className ?? undefined,
			classId: args.classId ?? undefined,
		});

		if (args.publicLogs) {
			secrets.push(audit.classInfo.id, audit.classInfo.name, audit.syllabus.id);
			if (audit.syllabus.sourceTemplateId) {
				secrets.push(audit.syllabus.sourceTemplateId);
			}
			for (const mod of audit.modules) {
				secrets.push(mod.module.id);
				for (const les of mod.lessons) {
					secrets.push(les.lesson.id);
				}
			}
		}

		write(
			`${formatClassSyllabusAuditReport(audit, { publicLogs: args.publicLogs })}\n`,
		);

		const rawSpecJson = args.specFile
			? await readFile(resolve(args.specFile), "utf8")
			: args.specJson;

		if (!rawSpecJson) {
			write(
				"[restructure-syllabus] DRY-RUN audit complete (no spec provided, read-only, no writes performed).\n",
			);
			return;
		}

		const spec = parseRestructureSpecJson(rawSpecJson);
		const plan = buildRestructureClassSyllabusPlan(audit, spec);

		if (args.publicLogs) {
			for (const mod of plan.targetModules) {
				secrets.push(mod.id);
			}
		}

		write(
			`\n${formatRestructurePlanPreview(plan, { publicLogs: args.publicLogs })}\n`,
		);

		if (args.mode === "dry-run") {
			write(
				"[restructure-syllabus] DRY-RUN plan preview complete (read-only, no writes performed).\n",
			);
			return;
		}

		const { preimageFile, rollbackSqlFile } =
			await saveRestructureBackupArtifacts(plan, stageLabel, args.dumpPath);
		write(
			`[restructure-syllabus] Preimage backup saved: ${preimageFile} (modules=${plan.preimage.modules.length}, lessons=${plan.preimage.lessons.length}, materialLinks=${plan.preimage.materialLinks.length})\n`,
		);
		write(`[restructure-syllabus] Rollback SQL saved: ${rollbackSqlFile}\n`);

		const execRes = await applyRestructureClassSyllabusPlan(runner, plan);
		write(
			`[restructure-syllabus] Executed ${execRes.statementsExecuted} statement(s) on ${stageLabel}.\n`,
		);

		const verifyRes = await verifyRestructuredClassSyllabus(runner, plan);
		write(
			`[restructure-syllabus] Verify: ok=${verifyRes.ok}, modules=${verifyRes.moduleCount}, lessons=${verifyRes.lessonCount}, materialLinks=${verifyRes.materialLinkCount}/${verifyRes.expectedMaterialLinkCount}, totalLessonsCol=${verifyRes.totalLessonsColumn}/${verifyRes.expectedTotalLessonsColumn}, flatOrderPreserved=${verifyRes.flatOrderPreserved}, parityHash=${verifyRes.actualHash.slice(0, 12)}\n`,
		);
		if (!verifyRes.ok) {
			throw new Error(
				`Post-restructure verification failed: ${verifyRes.mismatches.join("; ")}`,
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
	runRestructureClassSyllabusCli(process.argv.slice(2)).catch((err) => {
		console.error(
			`[restructure-syllabus] ERROR: ${err instanceof Error ? err.message : String(err)}`,
		);
		process.exit(1);
	});
}
