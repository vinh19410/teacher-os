import * as schema from "@teacher-os/db/schema/index";
import { getTableName, sql } from "drizzle-orm";
import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Context } from "hono";
import type { AppDeps } from "../app";

/** Registered symbol Drizzle stamps on every table object; its value is the SQLite table name. */
const DRIZZLE_TABLE_NAME = Symbol.for("drizzle:Name");

function isSchemaTable(value: unknown): value is SQLiteTable {
	return (
		typeof value === "object" && value !== null && DRIZZLE_TABLE_NAME in value
	);
}

/**
 * Every table AND named index the Drizzle schema declares — derived, not
 * hardcoded, so a future migration that adds either automatically joins the
 * readiness contract. Indexes matter because a migration can alter a table
 * without creating one (0006 added `comment_bank`'s unique index + column);
 * counting tables alone would report healthy on a database missing it.
 */
const REQUIRED_OBJECTS = [
	...new Set(
		Object.values(schema).flatMap((value) => {
			if (!isSchemaTable(value)) return [];
			return [
				getTableName(value),
				...getTableConfig(value).indexes.map((idx) => idx.config.name),
			];
		}),
	),
].sort();

/**
 * TOS-7 #440 — tổng số cột mà schema khai báo, lấy từ chính Drizzle config
 * (same "derived, not hardcoded" rule as REQUIRED_OBJECTS): một migration
 * chỉ ADD COLUMN (như 0045) không đổi bảng/index nào, nên probe
 * sqlite_master đơn thuần vẫn report healthy trên DB đứng trước migration —
 * code mới sẽ 500 "no such column" giữa giờ phục vụ. Required total is the
 * sum over every table; a stale database is missing at least one column and
 * sums lower.
 */
const TABLE_CONFIGS = Object.values(schema).flatMap((value) => {
	if (!isSchemaTable(value)) return [];
	const config = getTableConfig(value);
	return [{ name: getTableName(value), columns: config.columns.length }];
});
const REQUIRED_COLUMN_TOTAL = TABLE_CONFIGS.reduce(
	(sum, table) => sum + table.columns,
	0,
);

if (REQUIRED_OBJECTS.length === 0 || REQUIRED_COLUMN_TOTAL === 0) {
	// An empty contract would make the count trivially match and report
	// healthy on any database — fail loudly at import instead.
	throw new Error(
		"readiness probe found no schema objects — schema import broken",
	);
}

/**
 * Catalog probe, not a data query: reads only sqlite_master + pragma
 * table_info counts (bounded by schema-object count, not row count), is
 * empty-safe (a freshly migrated deploy with zero teachers is still ready),
 * and fails when any required table/index/column is absent — catching
 * half-applied migrations that a `SELECT 1` or single-table probe would
 * miss. Table/index names come from the schema, never user input.
 */
const PROBE_QUERY = sql`SELECT (SELECT count(*) FROM sqlite_master WHERE type IN ('table', 'index') AND name IN (${sql.join(
	REQUIRED_OBJECTS.map((name) => sql`${name}`),
	sql`, `,
)})) AS present, (${sql.join(
	TABLE_CONFIGS.map((table) =>
		// Table names are schema-controlled identifiers — safe to inline.
		sql.raw(`(SELECT count(*) FROM pragma_table_info('${table.name}'))`),
	),
	sql` + `,
)}) AS columns`;

const NO_STORE = { "cache-control": "no-store" };

export function readinessRoute(deps: Pick<AppDeps, "getDb">) {
	return async (c: Context): Promise<Response> => {
		let objectsPresent = 0;
		let columnsPresent = 0;
		try {
			const db = deps.getDb();
			const row = (await db.get(PROBE_QUERY)) as
				| { present?: number | bigint; columns?: number | bigint }
				| undefined;
			objectsPresent = Number(row?.present ?? 0);
			columnsPresent = Number(row?.columns ?? 0);
		} catch (error) {
			// Server-side cause for operator logs only; the response stays generic.
			console.error("readyz probe failed:", error);
		}
		const ready =
			objectsPresent === REQUIRED_OBJECTS.length &&
			columnsPresent === REQUIRED_COLUMN_TOTAL;
		// One body shape for both outcomes: every failure mode returns a
		// byte-identical `{"ok":false}`, so the failure cause stays hidden.
		return c.json({ ok: ready }, ready ? 200 : 503, NO_STORE);
	};
}
