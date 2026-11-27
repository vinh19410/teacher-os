import { createMcpHandler } from "@modelcontextprotocol/server";
import { Hono } from "hono";
import type { Db } from "../app";
import { buildTeacherMcpServer } from "../lib/mcp/server";
import {
	type McpPrincipal,
	verifyMcpBearerToken,
} from "../lib/mcp/token-service";

const MAX_MCP_BODY_BYTES = 512 * 1024;
const NO_STORE = { "cache-control": "no-store" };

function parseBearerToken(headerValue: string | undefined): string | null {
	if (!headerValue) return null;
	const match = /^Bearer\s+(\S+)$/i.exec(headerValue.trim());
	return match?.[1] ?? null;
}

function normalizeOrigins(corsOrigin: string | string[]): string[] {
	const raw = Array.isArray(corsOrigin) ? corsOrigin : [corsOrigin];
	return raw.map((origin) => origin.trim().toLowerCase()).filter(Boolean);
}

/**
 * Remote Streamable HTTP MCP endpoint (`/mcp`), mounted outside `/api/*` so
 * cookie-based `bootstrapMiddleware` never runs. Enforces strict Origin checks
 * when an `Origin` header is sent (DNS-rebinding defense) and authenticates
 * every request via SHA-256-hashed teacher Personal Access Tokens.
 */
export function mcpRoutes(deps: {
	getDb(): Db;
	corsOrigin: string | string[];
	teacherEmails?: string[];
	appOrigin?: string;
	runInBackground?: (promise: Promise<unknown>) => void;
	now?: () => Date;
}) {
	const router = new Hono();
	const allowedOrigins = normalizeOrigins(deps.corsOrigin);

	const handler = createMcpHandler(
		({ authInfo }) => {
			const principal = authInfo?.extra?.principal as McpPrincipal | undefined;
			if (!principal) {
				throw new Error("missing verified MCP principal");
			}
			return buildTeacherMcpServer(principal, {
				getDb: deps.getDb,
				appOrigin: deps.appOrigin,
				now: deps.now,
			});
		},
		{
			legacy: "stateless",
			maxRequestBodySize: MAX_MCP_BODY_BYTES,
		},
	);

	router.all("/", async (c) => {
		const origin = c.req.header("Origin");
		if (origin !== undefined) {
			const normalizedOrigin = origin.trim().toLowerCase();
			if (!normalizedOrigin || !allowedOrigins.includes(normalizedOrigin)) {
				return c.json({ error: "origin not allowed" }, 403, NO_STORE);
			}
		}

		const contentLength = Number(c.req.header("Content-Length") ?? "0");
		if (Number.isFinite(contentLength) && contentLength > MAX_MCP_BODY_BYTES) {
			return c.json({ error: "request body too large" }, 413, NO_STORE);
		}

		const rawToken = parseBearerToken(c.req.header("Authorization"));
		if (!rawToken) {
			c.header("WWW-Authenticate", 'Bearer realm="teacher-os-mcp"');
			return c.json({ error: "unauthorized" }, 401, NO_STORE);
		}

		const authResult = await verifyMcpBearerToken(deps.getDb(), rawToken, {
			teacherEmails: deps.teacherEmails,
			now: deps.now,
			runInBackground: deps.runInBackground,
		});
		if (!authResult.ok) {
			if (authResult.status === 401) {
				c.header("WWW-Authenticate", 'Bearer realm="teacher-os-mcp"');
			}
			return c.json({ error: authResult.error }, authResult.status, NO_STORE);
		}

		return handler.fetch(c.req.raw, {
			authInfo: {
				token: rawToken,
				clientId: authResult.principal.userId,
				scopes: ["assignments:write"],
				...(authResult.principal.expiresAtSeconds !== undefined
					? { expiresAt: authResult.principal.expiresAtSeconds }
					: {}),
				extra: { principal: authResult.principal },
			},
		});
	});

	return router;
}
