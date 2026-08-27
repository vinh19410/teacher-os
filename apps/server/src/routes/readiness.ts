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

if (REQUIRED_OBJECTS.length === 0) {
	// An empty contract would make the count trivially match and report
	// healthy on any database — fail loudly at import instead.
	throw new Error(
		"readiness probe found no schema objects — schema import broken",
	);
}

/**
 * Catalog probe, not a data query: reads only sqlite_master (bounded by
 * schema-object count, not row count), is empty-safe (a freshly migrated
 * deploy with zero teachers is still ready), and fails when any required
 * table or index is absent — catching half-applied migrations that a
 * `SELECT 1` or single-table probe would miss.
 */
const PROBE_QUERY = sql`SELECT count(*) AS present FROM sqlite_master WHERE type IN ('table', 'index') AND name IN (${sql.join(
	REQUIRED_OBJECTS.map((name) => sql`${name}`),
	sql`, `,
)})`;

const NO_STORE = { "cache-control": "no-store" };

export function readinessRoute(deps: Pick<AppDeps, "getDb">) {
	return async (c: Context): Promise<Response> => {
		let present = 0;
		try {
			const db = deps.getDb();
			const row = (await db.get(PROBE_QUERY)) as
				| { present?: number | bigint }
				| undefined;
			present = Number(row?.present ?? 0);
		} catch (error) {
			// Server-side cause for operator logs only; the response stays generic.
			console.error("readyz probe failed:", error);
		}
		const ready = present === REQUIRED_OBJECTS.length;
		// One body shape for both outcomes: every failure mode returns a
		// byte-identical `{"ok":false}`, so the failure cause stays hidden.
		return c.json({ ok: ready }, ready ? 200 : 503, NO_STORE);
	};
}
