import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { organization } from "./organization";

/**
 * Personal Access Tokens for Remote MCP clients (Claude Desktop, Cursor, CLI).
 * Only the SHA-256 hex digest (`token_hash`) and display prefix (`token_prefix`)
 * are persisted; raw tokens are returned once at creation and never stored.
 */
export const mcpToken = sqliteTable(
	"mcp_token",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		tokenPrefix: text("token_prefix").notNull(),
		tokenHash: text("token_hash").notNull(),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
		lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
		revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		uniqueIndex("mcp_token_hash_uq").on(table.tokenHash),
		index("mcp_token_user_org_idx").on(table.userId, table.orgId),
	],
);
