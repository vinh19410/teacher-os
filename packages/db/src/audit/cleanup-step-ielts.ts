/**
 * Module audit + cleanup nội dung Step IELTS (#ak-databases).
 *
 * Nhiệm vụ:
 * 1. Quét (audit/dry-run) toàn bộ các bảng trong database (library_test,
 *    assignment_test, library_test_part, assignment_prompt, study_pack, material)
 *    để tìm các trường collection, description, source, note có chứa nội dung liên
 *    quan đến Step IELTS.
 * 2. Tạo kế hoạch làm sạch (cleanup plan) bao gồm:
 *    - Các câu SQL UPDATE làm rỗng collection (NULL) và description (NULL/rỗng)
 *      mà KHÔNG xoá đề thi hay bài tập/câu hỏi.
 *    - Bản sao lưu preimage (JSON) để phục hồi khi cần.
 *    - Các câu SQL rollback để hoàn tác chính xác dữ liệu cũ.
 * 3. Hỗ trợ chạy trên cả SQLite/LibSQL cục bộ và Cloudflare D1 staging (qua REST API).
 */
import type { Client, InValue } from "@libsql/client";
import {
	assertNonProdD1Database,
	resolveStagingD1DatabaseId,
} from "../seed/vocab-library";
import { d1Query, redactSensitive } from "./orphan-materials";

export interface SqlStatement {
	sql: string;
	args?: unknown[];
}

export interface StepIeltsQueryRunner {
	queryRows(
		sql: string,
		params?: unknown[],
	): Promise<Array<Record<string, unknown>>>;
	run(statements: SqlStatement[]): Promise<void>;
}

export interface LibraryTestAuditRow {
	id: string;
	title: string;
	collection: string | null;
	description: string | null;
	matchCollection: boolean;
	matchDescription: boolean;
}

export interface AssignmentTestAuditRow {
	id: string;
	orgId: string;
	title: string;
	collection: string | null;
	description: string | null;
	libraryRef: string | null;
	matchCollection: boolean;
	matchDescription: boolean;
}

export interface LibraryTestPartAuditRow {
	id: string;
	testId: string;
	part: string;
	source: string;
	note: string;
	matchSource: boolean;
	matchNote: boolean;
}

export interface AssignmentPromptAuditRow {
	id: string;
	orgId: string;
	source: string;
	matchSource: boolean;
}

export interface StudyPackAuditRow {
	id: string;
	title: string;
	description: string;
	matchDescription: boolean;
}

export interface MaterialAuditRow {
	id: string;
	title: string;
	description: string;
	matchDescription: boolean;
}

export interface StepIeltsAuditResult {
	libraryTests: LibraryTestAuditRow[];
	assignmentTests: AssignmentTestAuditRow[];
	libraryTestParts: LibraryTestPartAuditRow[];
	assignmentPrompts: AssignmentPromptAuditRow[];
	studyPacks: StudyPackAuditRow[];
	materials: MaterialAuditRow[];
	totalMatches: number;
}

export interface StepIeltsCleanupPlan {
	auditResult: StepIeltsAuditResult;
	statements: SqlStatement[];
	rollbackStatements: SqlStatement[];
	preimage: Record<string, unknown>;
	consumed?: boolean;
}

/** Kiểm tra chuỗi có chứa từ khoá "step ielts" hoặc "stepielts" không (không phân biệt hoa thường). */
export function matchesStepIelts(value: string | null | undefined): boolean {
	if (!value) return false;
	const lower = value.toLowerCase();
	return (
		lower.includes("step ielts") ||
		lower.includes("stepielts") ||
		lower.includes("step-ielts")
	);
}

/**
 * Kiểm tra xem bảng có tồn tại trong sqlite_master không.
 */
async function tableExists(
	runner: StepIeltsQueryRunner,
	tableName: string,
): Promise<boolean> {
	try {
		const rows = await runner.queryRows(
			"SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?",
			[tableName],
		);
		return rows.length > 0;
	} catch {
		return false;
	}
}

/**
 * Quét toàn bộ các bảng liên quan đến Step IELTS.
 */
export async function auditStepIelts(
	runner: StepIeltsQueryRunner,
): Promise<StepIeltsAuditResult> {
	const result: StepIeltsAuditResult = {
		libraryTests: [],
		assignmentTests: [],
		libraryTestParts: [],
		assignmentPrompts: [],
		studyPacks: [],
		materials: [],
		totalMatches: 0,
	};

	// 1. library_test
	if (await tableExists(runner, "library_test")) {
		const rows = await runner.queryRows(
			"SELECT id, title, collection, description FROM library_test WHERE (collection IS NOT NULL AND collection != '') OR (description IS NOT NULL AND description != '')",
		);
		for (const row of rows) {
			const id = String(row.id);
			const title = String(row.title ?? "");
			const collection =
				row.collection !== null && row.collection !== undefined
					? String(row.collection)
					: null;
			const description =
				row.description !== null && row.description !== undefined
					? String(row.description)
					: null;
			const matchCollection = matchesStepIelts(collection);
			const matchDescription = matchesStepIelts(description);
			if (matchCollection || matchDescription) {
				result.libraryTests.push({
					id,
					title,
					collection,
					description,
					matchCollection,
					matchDescription,
				});
			}
		}
	}

	// 2. assignment_test
	if (await tableExists(runner, "assignment_test")) {
		const rows = await runner.queryRows(
			"SELECT id, org_id, title, collection, description, library_ref FROM assignment_test WHERE (collection IS NOT NULL AND collection != '') OR (description IS NOT NULL AND description != '')",
		);
		for (const row of rows) {
			const id = String(row.id);
			const orgId = String(row.org_id ?? "");
			const title = String(row.title ?? "");
			const collection =
				row.collection !== null && row.collection !== undefined
					? String(row.collection)
					: null;
			const description =
				row.description !== null && row.description !== undefined
					? String(row.description)
					: null;
			const libraryRef =
				row.library_ref !== null && row.library_ref !== undefined
					? String(row.library_ref)
					: null;
			const matchCollection = matchesStepIelts(collection);
			const matchDescription = matchesStepIelts(description);
			if (matchCollection || matchDescription) {
				result.assignmentTests.push({
					id,
					orgId,
					title,
					collection,
					description,
					libraryRef,
					matchCollection,
					matchDescription,
				});
			}
		}
	}

	// 3. library_test_part
	if (await tableExists(runner, "library_test_part")) {
		const rows = await runner.queryRows(
			"SELECT id, test_id, part, source, note FROM library_test_part WHERE (source IS NOT NULL AND source != '') OR (note IS NOT NULL AND note != '')",
		);
		for (const row of rows) {
			const id = String(row.id);
			const testId = String(row.test_id ?? "");
			const part = String(row.part ?? "");
			const source = String(row.source ?? "");
			const note = String(row.note ?? "");
			const matchSource = matchesStepIelts(source);
			const matchNote = matchesStepIelts(note);
			if (matchSource || matchNote) {
				result.libraryTestParts.push({
					id,
					testId,
					part,
					source,
					note,
					matchSource,
					matchNote,
				});
			}
		}
	}

	// 4. assignment_prompt
	if (await tableExists(runner, "assignment_prompt")) {
		const rows = await runner.queryRows(
			"SELECT id, org_id, source FROM assignment_prompt WHERE source IS NOT NULL AND source != ''",
		);
		for (const row of rows) {
			const id = String(row.id);
			const orgId = String(row.org_id ?? "");
			const source = String(row.source ?? "");
			const matchSource = matchesStepIelts(source);
			if (matchSource) {
				result.assignmentPrompts.push({
					id,
					orgId,
					source,
					matchSource,
				});
			}
		}
	}

	// 5. study_pack
	if (await tableExists(runner, "study_pack")) {
		const rows = await runner.queryRows(
			"SELECT id, title, description FROM study_pack WHERE description IS NOT NULL AND description != ''",
		);
		for (const row of rows) {
			const id = String(row.id);
			const title = String(row.title ?? "");
			const description = String(row.description ?? "");
			const matchDescription = matchesStepIelts(description);
			if (matchDescription) {
				result.studyPacks.push({
					id,
					title,
					description,
					matchDescription,
				});
			}
		}
	}

	// 6. material
	if (await tableExists(runner, "material")) {
		const rows = await runner.queryRows(
			"SELECT id, title, description FROM material WHERE description IS NOT NULL AND description != ''",
		);
		for (const row of rows) {
			const id = String(row.id);
			const title = String(row.title ?? "");
			const description = String(row.description ?? "");
			const matchDescription = matchesStepIelts(description);
			if (matchDescription) {
				result.materials.push({
					id,
					title,
					description,
					matchDescription,
				});
			}
		}
	}

	result.totalMatches =
		result.libraryTests.length +
		result.assignmentTests.length +
		result.libraryTestParts.length +
		result.assignmentPrompts.length +
		result.studyPacks.length +
		result.materials.length;

	return result;
}

/**
 * Xây dựng kế hoạch làm sạch (cleanup plan) bao gồm các câu UPDATE và rollback.
 */
export function buildStepIeltsCleanupPlan(
	auditResult: StepIeltsAuditResult,
): StepIeltsCleanupPlan {
	const statements: SqlStatement[] = [];
	const rollbackStatements: SqlStatement[] = [];

	// 1. library_test
	for (const item of auditResult.libraryTests) {
		const setClauses: string[] = [];
		const args: unknown[] = [];
		const rollbackSetClauses: string[] = [];
		const rollbackArgs: unknown[] = [];

		if (item.matchCollection) {
			setClauses.push("collection = NULL");
			rollbackSetClauses.push("collection = ?");
			rollbackArgs.push(item.collection);
		}
		if (item.matchDescription) {
			setClauses.push("description = NULL");
			rollbackSetClauses.push("description = ?");
			rollbackArgs.push(item.description);
		}

		if (setClauses.length > 0) {
			setClauses.push(
				"updated_at = cast(unixepoch('subsecond') * 1000 as integer)",
			);
			rollbackSetClauses.push(
				"updated_at = cast(unixepoch('subsecond') * 1000 as integer)",
			);
			args.push(item.id);
			rollbackArgs.push(item.id);

			statements.push({
				sql: `UPDATE library_test SET ${setClauses.join(", ")} WHERE id = ?`,
				args,
			});
			rollbackStatements.push({
				sql: `UPDATE library_test SET ${rollbackSetClauses.join(", ")} WHERE id = ?`,
				args: rollbackArgs,
			});
		}
	}

	// 2. assignment_test
	for (const item of auditResult.assignmentTests) {
		const setClauses: string[] = [];
		const args: unknown[] = [];
		const rollbackSetClauses: string[] = [];
		const rollbackArgs: unknown[] = [];

		if (item.matchCollection) {
			setClauses.push("collection = NULL");
			rollbackSetClauses.push("collection = ?");
			rollbackArgs.push(item.collection);
		}
		if (item.matchDescription) {
			setClauses.push("description = NULL");
			rollbackSetClauses.push("description = ?");
			rollbackArgs.push(item.description);
		}

		if (setClauses.length > 0) {
			setClauses.push(
				"updated_at = cast(unixepoch('subsecond') * 1000 as integer)",
			);
			rollbackSetClauses.push(
				"updated_at = cast(unixepoch('subsecond') * 1000 as integer)",
			);
			args.push(item.id);
			rollbackArgs.push(item.id);

			statements.push({
				sql: `UPDATE assignment_test SET ${setClauses.join(", ")} WHERE id = ?`,
				args,
			});
			rollbackStatements.push({
				sql: `UPDATE assignment_test SET ${rollbackSetClauses.join(", ")} WHERE id = ?`,
				args: rollbackArgs,
			});
		}
	}

	// 3. library_test_part
	for (const item of auditResult.libraryTestParts) {
		const setClauses: string[] = [];
		const args: unknown[] = [];
		const rollbackSetClauses: string[] = [];
		const rollbackArgs: unknown[] = [];

		if (item.matchSource) {
			setClauses.push("source = ''");
			rollbackSetClauses.push("source = ?");
			rollbackArgs.push(item.source);
		}
		if (item.matchNote) {
			setClauses.push("note = ''");
			rollbackSetClauses.push("note = ?");
			rollbackArgs.push(item.note);
		}

		if (setClauses.length > 0) {
			setClauses.push(
				"updated_at = cast(unixepoch('subsecond') * 1000 as integer)",
			);
			rollbackSetClauses.push(
				"updated_at = cast(unixepoch('subsecond') * 1000 as integer)",
			);
			args.push(item.id);
			rollbackArgs.push(item.id);

			statements.push({
				sql: `UPDATE library_test_part SET ${setClauses.join(", ")} WHERE id = ?`,
				args,
			});
			rollbackStatements.push({
				sql: `UPDATE library_test_part SET ${rollbackSetClauses.join(", ")} WHERE id = ?`,
				args: rollbackArgs,
			});
		}
	}

	// 4. assignment_prompt
	for (const item of auditResult.assignmentPrompts) {
		if (item.matchSource) {
			statements.push({
				sql: "UPDATE assignment_prompt SET source = '', updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?",
				args: [item.id],
			});
			rollbackStatements.push({
				sql: "UPDATE assignment_prompt SET source = ?, updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?",
				args: [item.source, item.id],
			});
		}
	}

	// 5. study_pack
	for (const item of auditResult.studyPacks) {
		if (item.matchDescription) {
			statements.push({
				sql: "UPDATE study_pack SET description = '', updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?",
				args: [item.id],
			});
			rollbackStatements.push({
				sql: "UPDATE study_pack SET description = ?, updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?",
				args: [item.description, item.id],
			});
		}
	}

	// 6. material
	for (const item of auditResult.materials) {
		if (item.matchDescription) {
			statements.push({
				sql: "UPDATE material SET description = '', updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?",
				args: [item.id],
			});
			rollbackStatements.push({
				sql: "UPDATE material SET description = ?, updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?",
				args: [item.description, item.id],
			});
		}
	}

	return {
		auditResult,
		statements,
		rollbackStatements,
		preimage: {
			createdAt: new Date().toISOString(),
			counts: {
				libraryTests: auditResult.libraryTests.length,
				assignmentTests: auditResult.assignmentTests.length,
				libraryTestParts: auditResult.libraryTestParts.length,
				assignmentPrompts: auditResult.assignmentPrompts.length,
				studyPacks: auditResult.studyPacks.length,
				materials: auditResult.materials.length,
				totalStatements: statements.length,
			},
			data: auditResult,
		},
	};
}

/**
 * Thực thi cleanup và xác thực (verification pass).
 */
export async function runStepIeltsCleanup(
	runner: StepIeltsQueryRunner,
	plan: StepIeltsCleanupPlan,
): Promise<{ statementsExecuted: number; verifyResult: StepIeltsAuditResult }> {
	if (plan.consumed) {
		throw new Error("Plan already consumed; rebuild from fresh audit.");
	}
	plan.consumed = true;

	if (plan.statements.length > 0) {
		await runner.run(plan.statements);
	}

	const verifyResult = await auditStepIelts(runner);
	return {
		statementsExecuted: plan.statements.length,
		verifyResult,
	};
}

/**
 * Định dạng báo cáo markdown kết quả audit.
 */
export function formatStepIeltsAuditReport(
	result: StepIeltsAuditResult,
): string {
	const lines: string[] = [
		"# Báo cáo Audit dữ liệu liên quan đến Step IELTS",
		"",
		`- Tổng số dòng khớp: **${result.totalMatches}**`,
		`- library_test (đề thư viện hệ thống): **${result.libraryTests.length}**`,
		`- assignment_test (đề org đồng bộ): **${result.assignmentTests.length}**`,
		`- library_test_part (part đề): **${result.libraryTestParts.length}**`,
		`- assignment_prompt (prompt ngân hàng): **${result.assignmentPrompts.length}**`,
		`- study_pack (gói học tập): **${result.studyPacks.length}**`,
		`- material (tài liệu buổi học): **${result.materials.length}**`,
		"",
	];

	if (result.libraryTests.length > 0) {
		lines.push("## Chi tiết library_test");
		lines.push("| ID | Tiêu đề | Collection | Description |");
		lines.push("|---|---|---|---|");
		for (const t of result.libraryTests) {
			const col = t.matchCollection
				? `\`${t.collection}\` ⚠️`
				: (t.collection ?? "-");
			const desc = t.matchDescription
				? `\`${t.description?.slice(0, 50)}...\` ⚠️`
				: t.description
					? `${t.description.slice(0, 30)}...`
					: "-";
			lines.push(`| \`${t.id}\` | ${t.title} | ${col} | ${desc} |`);
		}
		lines.push("");
	}

	if (result.assignmentTests.length > 0) {
		lines.push("## Chi tiết assignment_test");
		lines.push("| ID | Org ID | Tiêu đề | Collection | Description |");
		lines.push("|---|---|---|---|---|");
		for (const t of result.assignmentTests) {
			const col = t.matchCollection
				? `\`${t.collection}\` ⚠️`
				: (t.collection ?? "-");
			const desc = t.matchDescription
				? `\`${t.description?.slice(0, 50)}...\` ⚠️`
				: t.description
					? `${t.description.slice(0, 30)}...`
					: "-";
			lines.push(
				`| \`${t.id}\` | \`${t.orgId}\` | ${t.title} | ${col} | ${desc} |`,
			);
		}
		lines.push("");
	}

	if (result.libraryTestParts.length > 0) {
		lines.push("## Chi tiết library_test_part");
		lines.push("| ID | Test ID | Part | Source | Note |");
		lines.push("|---|---|---|---|---|");
		for (const p of result.libraryTestParts) {
			const src = p.matchSource ? `\`${p.source}\` ⚠️` : p.source;
			const note = p.matchNote
				? `\`${p.note}\` ⚠️`
				: p.note
					? `${p.note.slice(0, 30)}...`
					: "-";
			lines.push(
				`| \`${p.id}\` | \`${p.testId}\` | ${p.part} | ${src} | ${note} |`,
			);
		}
		lines.push("");
	}

	if (result.totalMatches === 0) {
		lines.push("✅ Không tìm thấy dữ liệu nào liên quan đến Step IELTS.");
	}

	return lines.join("\n");
}

/**
 * Runner cho LibSQL cục bộ (dùng trong test và local dev).
 */
export function createLibsqlStepIeltsRunner(
	client: Client,
): StepIeltsQueryRunner {
	return {
		async queryRows(
			sql: string,
			params?: unknown[],
		): Promise<Array<Record<string, unknown>>> {
			const res = await client.execute({
				sql,
				args: (params ?? []) as InValue[],
			});
			return res.rows.map((r) => ({ ...(r as Record<string, unknown>) }));
		},
		async run(statements: SqlStatement[]): Promise<void> {
			if (statements.length === 0) return;
			const batch = statements.map((s) => ({
				sql: s.sql,
				args: (s.args ?? []) as InValue[],
			}));
			await client.batch(batch, "write");
		},
	};
}

/**
 * Runner cho Cloudflare D1 REST API (dùng cho staging D1).
 */
export function createD1StepIeltsRunner(options: {
	accountId: string;
	databaseId: string;
	apiToken: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}): StepIeltsQueryRunner {
	return {
		async queryRows(
			sql: string,
			params?: unknown[],
		): Promise<Array<Record<string, unknown>>> {
			return d1Query({ ...options, sql, params });
		},
		async run(statements: SqlStatement[]): Promise<void> {
			for (const statement of statements) {
				await d1Query({
					...options,
					sql: statement.sql,
					params: statement.args,
				});
			}
		},
	};
}

export { assertNonProdD1Database, redactSensitive, resolveStagingD1DatabaseId };
