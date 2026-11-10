/**
 * CLI audit + cleanup one-off #663: `lesson_material` mồ côi do activation/
 * attach áp holiday shift trước fix #659/#662. Logic nằm ở
 * `../src/audit/orphan-materials` — file này chỉ parse args + in kết quả.
 *
 *   # Local SQLite (alchemy dev / fixture):
 *   pnpm --filter @teacher-os/db exec tsx scripts/audit-663-orphan-materials.ts --file <sqlite-path>
 *
 *   # Cloudflare D1 (audit read-only; log chỉ in số tổng hợp — repo PUBLIC):
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
 *     pnpm --filter @teacher-os/db exec tsx scripts/audit-663-orphan-materials.ts --d1 --d1-stage staging
 *
 *   # Cleanup (script local; KHÔNG nằm trong workflow): `--apply` qua D1
 *   bắt buộc `--confirm-stage <stage>` khớp và tự ghi dump JSON trước câu
 *   ghi đầu tiên. Plan single-use — mỗi lần chạy rebuild từ audit tươi.
 *   Quyết định `--apply` trên prod là của owner SAU khi review số liệu.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { type Client, createClient } from "@libsql/client";
import {
	type AuditQueryRunner,
	type AuditSummary,
	auditOrphans,
	buildCleanupPlan,
	type ClassifiedRow,
	type CleanupPlan,
	createD1AuditRunner,
	redactSensitive,
	resolveD1DatabaseId,
	runCleanup,
} from "../src/audit/orphan-materials";

export interface CliArgs {
	filePath: string | null;
	d1: boolean;
	d1Stage: string | null;
	apply: boolean;
	confirmStage: string | null;
	dumpPath: string | null;
	help: boolean;
}

const USAGE_TEXT =
	"usage: tsx packages/db/scripts/audit-663-orphan-materials.ts (--file <sqlite-path> | --d1 --d1-stage <staging|prod>) [--apply [--confirm-stage <stage>] [--dump <path>]]\n";

export function parseArgs(argv: readonly string[]): CliArgs {
	let filePath: string | null = null;
	let d1 = false;
	let d1Stage: string | null = null;
	let apply = false;
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
		} else if (arg === "--apply") {
			apply = true;
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
			apply: false,
			confirmStage: null,
			dumpPath: null,
			help: true,
		};
	}
	if (!filePath && !d1) {
		throw new Error(
			"Specify a transport: either --file <sqlite-path> or --d1 --d1-stage <staging|prod>.",
		);
	}
	if (filePath && d1) {
		throw new Error("Specify only one transport: either --file or --d1.");
	}
	if (d1Stage && !d1) {
		throw new Error("Flag --d1-stage requires --d1.");
	}
	if (d1 && d1Stage !== "staging" && d1Stage !== "prod") {
		throw new Error(
			`Unsupported --d1-stage "${d1Stage}": audit lookup is restricted to "staging" or "prod" (fail-closed).`,
		);
	}
	if (apply && d1) {
		if (!confirmStage) {
			throw new Error(
				"--apply over D1 requires --confirm-stage <stage> typed exactly (confirm-gate, mirror state-migrate).",
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
		apply,
		confirmStage,
		dumpPath,
		help: false,
	};
}

function formatSummary(summary: AuditSummary): string[] {
	const modes = Object.entries(summary.manualBySchedulingMode)
		.map(([mode, count]) => `${mode}=${count}`)
		.join(", ");
	return [
		`total: ${summary.total} | manual_total: ${summary.manualTotal}${modes ? ` (scheduling_mode: ${modes})` : ""} | auto_total: ${summary.autoTotal}`,
		`cleanup_eligible: ${summary.cleanupEligible}`,
		`excluded: auto_review=${summary.excluded.auto_review} active_lesson_at_date=${summary.excluded.active_lesson_at_date} chain_loop=${summary.excluded.chain_loop} dest_no_active_session=${summary.excluded.dest_no_active_session}`,
		`reconcile: ${summary.reconcileOk ? "OK" : "MISMATCH (manual_total != cleanup_eligible + excluded manual) — KHÔNG tin số liệu này, báo bug gate"}`,
	];
}

function formatRowsTable(rows: ClassifiedRow[]): string[] {
	const lines = rows.map(
		(row) =>
			`${row.classId} | ${row.date} | ${row.materialId} | ${row.schedulingMode} | created=${new Date(row.lmCreatedAt).toISOString()} | ${row.disposition}${row.chainTerminal ? ` -> ${row.chainTerminal}` : ""}${row.destConflictSameMaterial ? " | dest-dup" : ""}`,
	);
	if (lines.length > 200) {
		return [
			...lines.slice(0, 200),
			`… ${lines.length - 200} dòng nữa (chỉ hiển thị 200 đầu)`,
		];
	}
	return lines;
}

async function createRunner(args: CliArgs): Promise<{
	runner: Client | AuditQueryRunner;
	label: string;
}> {
	if (args.filePath && !args.d1) {
		const client: Client = createClient({
			url: pathToFileURL(resolve(args.filePath)).toString(),
		});
		return { runner: client, label: `file:${args.filePath}` };
	}
	const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
	const apiToken = process.env.CLOUDFLARE_API_TOKEN;
	if (!accountId || !apiToken) {
		throw new Error(
			"--d1 requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN env vars.",
		);
	}
	const databaseId = await resolveD1DatabaseId({
		stage: args.d1Stage ?? "",
		accountId,
		apiToken,
	});
	return {
		runner: createD1AuditRunner({ accountId, databaseId, apiToken }),
		label: `d1:${args.d1Stage} (database id redacted)`,
	};
}

async function writeDump(
	args: CliArgs,
	plan: CleanupPlan,
	rows: ClassifiedRow[],
): Promise<string> {
	const dumpPath = args.dumpPath ?? `./audit-663-apply-dump-${Date.now()}.json`;
	const payload = {
		generatedAt: new Date().toISOString(),
		stage: args.d1Stage,
		note: "Backup trước khi chạy cleanup #663. dump KHÔNG commit; chứa internal id của dòng sẽ bị đụng.",
		plan,
		eligibleRows: rows.filter((row) => row.disposition === "cleanup_eligible"),
	};
	await mkdir(dirname(resolve(dumpPath)), { recursive: true });
	await writeFile(dumpPath, `${JSON.stringify(payload, null, "\t")}\n`);
	return dumpPath;
}

export async function main(argv: readonly string[]): Promise<number> {
	const args = parseArgs(argv);
	if (args.help) {
		console.log(USAGE_TEXT);
		return 0;
	}
	const { runner, label } = await createRunner(args);
	console.log(`audit-663 orphan lesson_material — ${label}`);

	const audit = await auditOrphans(runner);
	for (const line of formatSummary(audit.summary)) {
		console.log(line);
	}
	// Bảng dòng chi tiết chỉ ở mode --file (repo PUBLIC: log CI không in ID).
	if (args.filePath && !args.d1) {
		console.log("--- rows ---");
		for (const line of formatRowsTable(audit.rows)) {
			console.log(line);
		}
	}
	if (!audit.summary.reconcileOk) {
		return 2;
	}
	if (!args.apply) {
		return 0;
	}

	const plan = buildCleanupPlan(audit.rows);
	if (plan.groups.length === 0) {
		console.log("apply: không có group cleanup_eligible — không ghi gì.");
		return 0;
	}
	console.log(`apply: ${plan.groups.length} group sẽ chạy delete-then-move.`);
	if (args.d1) {
		const dumpPath = await writeDump(args, plan, audit.rows);
		console.log(
			`apply: dump backup đã ghi tại ${dumpPath} (KHÔNG commit file này).`,
		);
	}
	const applied = await runCleanup(runner, plan);
	console.log(`apply: đã chạy ${applied} group.`);

	const post = await auditOrphans(runner);
	console.log("--- hậu-dọn ---");
	for (const line of formatSummary(post.summary)) {
		console.log(line);
	}
	if (!post.summary.reconcileOk) {
		console.log("post: lệch bất biến phân loại — exit 2.");
		return 2;
	}
	if (post.summary.cleanupEligible > 0) {
		console.log(
			"post: vẫn còn dòng cleanup_eligible — dump lại trạng thái, KHÔNG chạy vòng nữa (kiểm tra chain/disposition).",
		);
		return 1;
	}
	return 0;
}

const isDirectRun =
	process.argv[1]?.endsWith("audit-663-orphan-materials.ts") ?? false;

if (isDirectRun) {
	main(process.argv.slice(2))
		.then((code) => {
			process.exit(code);
		})
		.catch((error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			console.error(
				redactSensitive(`audit-663 failed: ${message}`, [
					process.env.CLOUDFLARE_API_TOKEN ?? "",
				]),
			);
			process.exit(1);
		});
}
