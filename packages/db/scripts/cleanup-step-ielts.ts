/**
 * CLI audit + cleanup Step IELTS (#ak-databases):
 * Quét và làm sạch các trường mô tả (description) và bộ sưu tập (collection)
 * có chứa thông tin Step IELTS trên môi trường staging.
 *
 *   # Local SQLite (test/fixture):
 *   pnpm --filter @teacher-os/db exec tsx scripts/cleanup-step-ielts.ts --file <sqlite-path> [--mode audit|apply]
 *
 *   # Cloudflare D1 staging (audit read-only):
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
 *     pnpm --filter @teacher-os/db exec tsx scripts/cleanup-step-ielts.ts --d1 --d1-stage staging --mode audit
 *
 *   # Cloudflare D1 staging (apply cleanup):
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
 *     pnpm --filter @teacher-os/db exec tsx scripts/cleanup-step-ielts.ts --d1 --d1-stage staging --mode apply --confirm-stage staging
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import {
	assertNonProdD1Database,
	auditStepIelts,
	buildStepIeltsCleanupPlan,
	createD1StepIeltsRunner,
	createLibsqlStepIeltsRunner,
	formatStepIeltsAuditReport,
	redactSensitive,
	resolveStagingD1DatabaseId,
	runStepIeltsCleanup,
	type StepIeltsCleanupPlan,
	type StepIeltsQueryRunner,
} from "../src/audit/cleanup-step-ielts";

export interface CliArgs {
	filePath: string | null;
	d1: boolean;
	d1Stage: string | null;
	mode: "audit" | "apply";
	confirmStage: string | null;
	dumpPath: string | null;
	help: boolean;
}

const USAGE_TEXT = `usage: tsx packages/db/scripts/cleanup-step-ielts.ts (--file <sqlite-path> | --d1 --d1-stage staging) [--mode <audit|apply>] [--confirm-stage staging] [--dump <path>]

Options:
  --file <sqlite-path>      Path to local SQLite/libsql database
  --d1                      Target Cloudflare D1
  --d1-stage <stage>        Target D1 stage (restricted to "staging")
  --mode <audit|apply>      Operation mode: audit (read-only, default) or apply (execute updates)
  --confirm-stage <stage>   Required confirmation when mode=apply on D1 (must type "staging")
  --dump <path>             Custom path to save preimage JSON backup and rollback SQL
  --help, -h                Show this help message
`;

export function parseArgs(argv: readonly string[]): CliArgs {
	let filePath: string | null = null;
	let d1 = false;
	let d1Stage: string | null = null;
	let mode: "audit" | "apply" = "audit";
	let confirmStage: string | null = null;
	let dumpPath: string | null = null;
	let help = false;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--file") {
			const next = argv[i + 1];
			if (!next || next.startsWith("--")) {
				throw new Error("Missing path argument for --file <sqlite-path>");
			}
			filePath = next;
			i++;
		} else if (arg === "--d1") {
			d1 = true;
		} else if (arg === "--d1-stage") {
			const next = argv[i + 1];
			if (!next || next.startsWith("--")) {
				throw new Error("Missing stage argument for --d1-stage <stage>");
			}
			d1Stage = next;
			i++;
		} else if (arg === "--mode") {
			const next = argv[i + 1];
			if (next !== "audit" && next !== "apply") {
				throw new Error("Invalid mode: expected 'audit' or 'apply'");
			}
			mode = next;
			i++;
		} else if (arg === "--confirm-stage") {
			const next = argv[i + 1];
			if (!next || next.startsWith("--")) {
				throw new Error("Missing stage argument for --confirm-stage <stage>");
			}
			confirmStage = next;
			i++;
		} else if (arg === "--dump") {
			const next = argv[i + 1];
			if (!next || next.startsWith("--")) {
				throw new Error("Missing path argument for --dump <path>");
			}
			dumpPath = next;
			i++;
		} else if (arg === "--help" || arg === "-h") {
			help = true;
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}

	if (help) {
		return {
			filePath: null,
			d1: false,
			d1Stage: null,
			mode: "audit",
			confirmStage: null,
			dumpPath: null,
			help: true,
		};
	}

	if (!filePath && !d1) {
		throw new Error(
			"Specify a transport: either --file <sqlite-path> or --d1 --d1-stage staging.",
		);
	}
	if (filePath && d1) {
		throw new Error("Specify only one transport: either --file or --d1.");
	}
	if (d1Stage && !d1) {
		throw new Error("Flag --d1-stage requires --d1.");
	}
	if (d1 && d1Stage !== "staging") {
		throw new Error(
			`Unsupported --d1-stage "${d1Stage}": cleanup is restricted to "staging" (production is blocked by safety gate).`,
		);
	}
	if (mode === "apply" && d1) {
		if (!confirmStage) {
			throw new Error(
				"Mode 'apply' over D1 requires --confirm-stage <stage> (expected 'staging').",
			);
		}
		if (confirmStage !== d1Stage) {
			throw new Error(
				`--confirm-stage "${confirmStage}" does not match --d1-stage "${d1Stage}"; refusing to write.`,
			);
		}
	}

	return {
		filePath,
		d1,
		d1Stage,
		mode,
		confirmStage,
		dumpPath,
		help: false,
	};
}

async function createRunner(args: CliArgs): Promise<{
	runner: StepIeltsQueryRunner;
	label: string;
	secretsToRedact: string[];
}> {
	if (args.filePath && !args.d1) {
		const client = createClient({
			url: pathToFileURL(resolve(args.filePath)).toString(),
		});
		return {
			runner: createLibsqlStepIeltsRunner(client),
			label: `file:${args.filePath}`,
			secretsToRedact: [],
		};
	}

	const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
	const apiToken = process.env.CLOUDFLARE_API_TOKEN;
	if (!accountId || !apiToken) {
		throw new Error(
			"--d1 requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN env vars.",
		);
	}

	const databaseId = await resolveStagingD1DatabaseId({
		stage: args.d1Stage ?? "staging",
		accountId,
		apiToken,
	});

	await assertNonProdD1Database({
		accountId,
		databaseId,
		apiToken,
	});

	return {
		runner: createD1StepIeltsRunner({ accountId, databaseId, apiToken }),
		label: `d1:${args.d1Stage} (uuid: ${databaseId.slice(0, 8)}...)`,
		secretsToRedact: [apiToken, databaseId, accountId],
	};
}

async function savePreimageAndRollback(
	plan: StepIeltsCleanupPlan,
	dumpPathPrefix: string | null,
): Promise<{ dumpFile: string; rollbackSqlFile: string }> {
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const basePath = dumpPathPrefix
		? resolve(dumpPathPrefix)
		: resolve(process.cwd(), `plans/reports/cleanup-step-ielts-${timestamp}`);

	const dumpFile = basePath.endsWith(".json")
		? basePath
		: `${basePath}-preimage.json`;
	const rollbackSqlFile = basePath.endsWith(".json")
		? basePath.replace(/\.json$/, "-rollback.sql")
		: `${basePath}-rollback.sql`;

	await mkdir(dirname(dumpFile), { recursive: true });

	// 1. Preimage JSON
	await writeFile(
		dumpFile,
		`${JSON.stringify(plan.preimage, null, 2)}\n`,
		"utf8",
	);

	// 2. Rollback SQL
	const rollbackSql = [
		"-- Rollback SQL for Step IELTS cleanup",
		`-- Generated at: ${new Date().toISOString()}`,
		"-- Statements to restore previous collection/description/source values:",
		"",
		...plan.rollbackStatements.map((stmt) => {
			let formatted = stmt.sql;
			if (stmt.args) {
				for (const arg of stmt.args) {
					const val =
						arg === null
							? "NULL"
							: typeof arg === "number"
								? String(arg)
								: `'${String(arg).replace(/'/g, "''")}'`;
					formatted = formatted.replace("?", val);
				}
			}
			return `${formatted};`;
		}),
		"",
	].join("\n");

	await writeFile(rollbackSqlFile, rollbackSql, "utf8");

	return { dumpFile, rollbackSqlFile };
}

export async function main(argv: readonly string[]): Promise<number> {
	let secretsToRedact: string[] = [];
	try {
		const args = parseArgs(argv);
		if (args.help) {
			console.log(USAGE_TEXT);
			return 0;
		}

		const {
			runner,
			label,
			secretsToRedact: secrets,
		} = await createRunner(args);
		secretsToRedact = secrets;
		console.log(`[cleanup-step-ielts] Target: ${label} | Mode: ${args.mode}`);

		// 1. Audit
		console.log(
			"[cleanup-step-ielts] Đang quét dữ liệu liên quan đến Step IELTS...",
		);
		const auditResult = await auditStepIelts(runner);
		console.log(formatStepIeltsAuditReport(auditResult));

		if (args.mode === "audit") {
			console.log(
				"[cleanup-step-ielts] Chế độ audit hoàn tất (read-only, không có thay đổi nào được thực hiện).",
			);
			return 0;
		}

		// 2. Apply mode
		if (auditResult.totalMatches === 0) {
			console.log(
				"[cleanup-step-ielts] Không có bản ghi nào chứa Step IELTS. Không cần thực hiện cleanup.",
			);
			return 0;
		}

		console.log(
			`[cleanup-step-ielts] Bắt đầu tạo kế hoạch làm sạch cho ${auditResult.totalMatches} bản ghi...`,
		);
		const plan = buildStepIeltsCleanupPlan(auditResult);

		// 3. Backup preimage and rollback SQL
		const { dumpFile, rollbackSqlFile } = await savePreimageAndRollback(
			plan,
			args.dumpPath,
		);
		console.log(`[cleanup-step-ielts] Đã sao lưu preimage backup: ${dumpFile}`);
		console.log(
			`[cleanup-step-ielts] Đã tạo script rollback: ${rollbackSqlFile}`,
		);

		// 4. Execute cleanup
		console.log(
			`[cleanup-step-ielts] Đang thực thi ${plan.statements.length} câu lệnh UPDATE...`,
		);
		const execResult = await runStepIeltsCleanup(runner, plan);
		console.log(
			`[cleanup-step-ielts] Đã thực thi thành công ${execResult.statementsExecuted} câu lệnh.`,
		);

		// 5. Verification
		console.log(
			"[cleanup-step-ielts] Đang xác thực lại trạng thái sau cleanup...",
		);
		if (execResult.verifyResult.totalMatches > 0) {
			console.error(
				`[cleanup-step-ielts] CẢNH BÁO: Vẫn còn ${execResult.verifyResult.totalMatches} bản ghi chưa được làm sạch!`,
			);
			return 1;
		}

		console.log(
			"✅ [cleanup-step-ielts] Xác thực thành công: 0 bản ghi còn lại chứa Step IELTS. Hoàn tất!",
		);
		return 0;
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error(
			`[cleanup-step-ielts] LỖI: ${redactSensitive(msg, secretsToRedact)}`,
		);
		return 1;
	}
}

const isDirectRun =
	typeof process !== "undefined" &&
	process.argv[1] &&
	(process.argv[1].endsWith("/cleanup-step-ielts.ts") ||
		process.argv[1].endsWith("\\cleanup-step-ielts.ts"));

if (isDirectRun) {
	main(process.argv.slice(2)).then((code) => {
		if (code !== 0) process.exit(code);
	});
}
