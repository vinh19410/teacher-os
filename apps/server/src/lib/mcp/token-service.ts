import {
	MCP_TOKEN_ERROR_CODES,
	MCP_TOKEN_MAX_ACTIVE,
	MCP_TOKEN_PREFIX,
	type McpTokenCreate,
	type McpTokenSummary,
} from "@teacher-os/api/mcp-token-contracts";
import { canPublishGrade, resolveUserRole } from "@teacher-os/auth/role";
import { user as authUser } from "@teacher-os/db/schema/auth";
import { mcpToken } from "@teacher-os/db/schema/mcp-token";
import { membership } from "@teacher-os/db/schema/membership";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "../../app";

export interface McpPrincipal {
	userId: string;
	orgId: string;
	role: string;
	email: string;
	tokenId: string;
	expiresAtSeconds?: number;
}

export type VerifyMcpTokenResult =
	| { ok: true; principal: McpPrincipal }
	| { ok: false; status: 401 | 403; error: string };

const LAST_USED_THROTTLE_MS = 60_000;
const DAY_MS = 86_400_000;
const PREFIX_DISPLAY_LENGTH = MCP_TOKEN_PREFIX.length + 6;

function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const b of bytes) {
		binary += String.fromCharCode(b);
	}
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

export async function hashMcpToken(rawToken: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(rawToken),
	);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

function generateRawMcpToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return `${MCP_TOKEN_PREFIX}${bytesToBase64Url(bytes)}`;
}

function toSummary(row: {
	id: string;
	name: string;
	tokenPrefix: string;
	createdAt: Date;
	lastUsedAt: Date | null;
	expiresAt: Date | null;
	revokedAt: Date | null;
}): McpTokenSummary {
	return {
		id: row.id,
		name: row.name,
		tokenPrefix: row.tokenPrefix,
		createdAt: row.createdAt.toISOString(),
		lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
		expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
		revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
	};
}

export async function listMcpTokens(
	db: Db,
	ctx: { orgId: string; userId: string },
): Promise<McpTokenSummary[]> {
	const rows = await db
		.select({
			id: mcpToken.id,
			name: mcpToken.name,
			tokenPrefix: mcpToken.tokenPrefix,
			createdAt: mcpToken.createdAt,
			lastUsedAt: mcpToken.lastUsedAt,
			expiresAt: mcpToken.expiresAt,
			revokedAt: mcpToken.revokedAt,
		})
		.from(mcpToken)
		.where(
			and(
				eq(mcpToken.orgId, ctx.orgId),
				eq(mcpToken.userId, ctx.userId),
				isNull(mcpToken.revokedAt),
			),
		)
		.orderBy(desc(mcpToken.createdAt), desc(mcpToken.id));
	return rows.map(toSummary);
}

export async function createMcpToken(
	db: Db,
	ctx: { orgId: string; userId: string },
	input: McpTokenCreate,
	now: Date = new Date(),
): Promise<
	| { ok: true; token: McpTokenSummary; rawToken: string }
	| { ok: false; status: 409 | 500; error: string; code?: string }
> {
	const existing = await db
		.select({
			id: mcpToken.id,
			expiresAt: mcpToken.expiresAt,
		})
		.from(mcpToken)
		.where(
			and(
				eq(mcpToken.orgId, ctx.orgId),
				eq(mcpToken.userId, ctx.userId),
				isNull(mcpToken.revokedAt),
			),
		);
	const activeCount = existing.filter(
		(row) => !row.expiresAt || row.expiresAt.getTime() > now.getTime(),
	).length;
	if (activeCount >= MCP_TOKEN_MAX_ACTIVE) {
		return {
			ok: false,
			status: 409,
			error: "maximum active MCP tokens reached",
			code: MCP_TOKEN_ERROR_CODES.LIMIT_REACHED,
		};
	}

	const rawToken = generateRawMcpToken();
	const tokenHash = await hashMcpToken(rawToken);
	const tokenPrefix = rawToken.slice(0, PREFIX_DISPLAY_LENGTH);
	const expiresAt =
		input.expiresInDays === null
			? null
			: new Date(now.getTime() + input.expiresInDays * DAY_MS);

	const [created] = await db
		.insert(mcpToken)
		.values({
			id: crypto.randomUUID(),
			orgId: ctx.orgId,
			userId: ctx.userId,
			name: input.name,
			tokenPrefix,
			tokenHash,
			expiresAt,
			lastUsedAt: null,
			revokedAt: null,
			createdAt: now,
		})
		.returning({
			id: mcpToken.id,
			name: mcpToken.name,
			tokenPrefix: mcpToken.tokenPrefix,
			createdAt: mcpToken.createdAt,
			lastUsedAt: mcpToken.lastUsedAt,
			expiresAt: mcpToken.expiresAt,
			revokedAt: mcpToken.revokedAt,
		});
	if (!created) {
		return { ok: false, status: 500, error: "failed to create MCP token" };
	}
	return { ok: true, token: toSummary(created), rawToken };
}

export async function revokeMcpToken(
	db: Db,
	ctx: { orgId: string; userId: string },
	tokenId: string,
	now: Date = new Date(),
): Promise<{ id: string; revokedAt: string } | null> {
	const [updated] = await db
		.update(mcpToken)
		.set({ revokedAt: now })
		.where(
			and(
				eq(mcpToken.id, tokenId),
				eq(mcpToken.orgId, ctx.orgId),
				eq(mcpToken.userId, ctx.userId),
				isNull(mcpToken.revokedAt),
			),
		)
		.returning({ id: mcpToken.id, revokedAt: mcpToken.revokedAt });
	if (!updated?.revokedAt) return null;
	return { id: updated.id, revokedAt: updated.revokedAt.toISOString() };
}

export async function verifyMcpBearerToken(
	db: Db,
	rawToken: string,
	deps: {
		teacherEmails?: string[];
		now?: () => Date;
		runInBackground?: (promise: Promise<unknown>) => void;
	} = {},
): Promise<VerifyMcpTokenResult> {
	const trimmed = rawToken.trim();
	if (
		!trimmed.startsWith(MCP_TOKEN_PREFIX) ||
		trimmed.length <= MCP_TOKEN_PREFIX.length
	) {
		return { ok: false, status: 401, error: "invalid_token" };
	}

	const now = deps.now ? deps.now() : new Date();
	const tokenHash = await hashMcpToken(trimmed);
	const [row] = await db
		.select({
			id: mcpToken.id,
			orgId: mcpToken.orgId,
			userId: mcpToken.userId,
			expiresAt: mcpToken.expiresAt,
			lastUsedAt: mcpToken.lastUsedAt,
			revokedAt: mcpToken.revokedAt,
			userRole: authUser.role,
			userEmail: authUser.email,
			emailVerified: authUser.emailVerified,
		})
		.from(mcpToken)
		.innerJoin(authUser, eq(authUser.id, mcpToken.userId))
		.where(eq(mcpToken.tokenHash, tokenHash))
		.limit(1);

	if (!row || row.revokedAt !== null) {
		return { ok: false, status: 401, error: "invalid_token" };
	}
	if (row.expiresAt !== null && row.expiresAt.getTime() <= now.getTime()) {
		return { ok: false, status: 401, error: "token_expired" };
	}

	if (resolveUserRole(row.userRole) !== "teacher") {
		return { ok: false, status: 403, error: "forbidden_role" };
	}

	const teacherEmails = deps.teacherEmails ?? [];
	if (teacherEmails.length > 0) {
		const normalizedEmail = row.userEmail.trim().toLowerCase();
		const allowed = teacherEmails.some(
			(e) => e.trim().toLowerCase() === normalizedEmail,
		);
		if (!normalizedEmail || !allowed || row.emailVerified !== true) {
			return { ok: false, status: 403, error: "forbidden_teacher" };
		}
	}

	const [member] = await db
		.select({ role: membership.role })
		.from(membership)
		.where(
			and(eq(membership.orgId, row.orgId), eq(membership.userId, row.userId)),
		)
		.limit(1);
	if (!member || !canPublishGrade(member.role)) {
		return { ok: false, status: 403, error: "forbidden_membership" };
	}

	const shouldTouchLastUsed =
		row.lastUsedAt === null ||
		now.getTime() - row.lastUsedAt.getTime() >= LAST_USED_THROTTLE_MS;
	if (shouldTouchLastUsed) {
		const touch = db
			.update(mcpToken)
			.set({ lastUsedAt: now })
			.where(eq(mcpToken.id, row.id))
			.catch((err) => {
				console.error("[mcp] failed to update lastUsedAt", err);
			});
		if (deps.runInBackground) {
			deps.runInBackground(touch);
		} else {
			await touch;
		}
	}

	return {
		ok: true,
		principal: {
			userId: row.userId,
			orgId: row.orgId,
			role: member.role,
			email: row.userEmail,
			tokenId: row.id,
			...(row.expiresAt
				? { expiresAtSeconds: Math.floor(row.expiresAt.getTime() / 1000) }
				: {}),
		},
	};
}
