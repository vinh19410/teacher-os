import {
	MCP_TOKEN_ERROR_CODES,
	MCP_TOKEN_MAX_ACTIVE,
	mcpTokenCreateSchema,
} from "@teacher-os/api/mcp-token-contracts";
import { canPublishGrade } from "@teacher-os/auth/role";
import { type Context, Hono } from "hono";
import type { z } from "zod";
import type { Db, KernelCtx } from "../app";
import {
	createMcpToken,
	listMcpTokens,
	revokeMcpToken,
} from "../lib/mcp/token-service";

type Env = { Variables: { kernelCtx: KernelCtx } };
type McpTokenContext = Context<Env>;

const NO_STORE = { "cache-control": "no-store" };

export function mcpTokenRoutes(deps: { getDb(): Db; now?: () => Date }) {
	const routes = new Hono<Env>();

	function requireAuthorizedTeacher(
		c: McpTokenContext,
	): { ok: true; ctx: KernelCtx } | { ok: false; response: Response } {
		const ctx = c.get("kernelCtx");
		if (!ctx) {
			return { ok: false, response: c.json({ error: "unauthorized" }, 401) };
		}
		if (ctx.role !== undefined && !canPublishGrade(ctx.role)) {
			return {
				ok: false,
				response: c.json({ error: "forbidden", code: "FORBIDDEN" }, 403),
			};
		}
		return { ok: true, ctx };
	}

	async function readBody<S extends z.ZodType>(
		c: McpTokenContext,
		schema: S,
	): Promise<
		{ ok: true; data: z.infer<S> } | { ok: false; response: Response }
	> {
		let raw: unknown;
		try {
			raw = await c.req.json();
		} catch {
			return { ok: false, response: c.json({ error: "invalid json" }, 400) };
		}
		const parsed = schema.safeParse(raw);
		if (!parsed.success) {
			return { ok: false, response: c.json({ error: "invalid body" }, 400) };
		}
		return { ok: true, data: parsed.data };
	}

	routes.get("/", async (c) => {
		const auth = requireAuthorizedTeacher(c);
		if (!auth.ok) return auth.response;
		const tokens = await listMcpTokens(deps.getDb(), auth.ctx);
		return c.json(
			{
				tokens,
				maxActiveTokens: MCP_TOKEN_MAX_ACTIVE,
				mcpPath: "/mcp" as const,
			},
			200,
			NO_STORE,
		);
	});

	routes.post("/", async (c) => {
		const auth = requireAuthorizedTeacher(c);
		if (!auth.ok) return auth.response;
		const body = await readBody(c, mcpTokenCreateSchema);
		if (!body.ok) return body.response;
		const now = deps.now ? deps.now() : new Date();
		const result = await createMcpToken(deps.getDb(), auth.ctx, body.data, now);
		if (!result.ok) {
			return c.json(
				{
					error: result.error,
					...(result.code ? { code: result.code } : {}),
				},
				result.status,
				NO_STORE,
			);
		}
		return c.json(
			{ token: result.token, rawToken: result.rawToken },
			201,
			NO_STORE,
		);
	});

	routes.delete("/:id", async (c) => {
		const auth = requireAuthorizedTeacher(c);
		if (!auth.ok) return auth.response;
		const tokenId = c.req.param("id");
		const now = deps.now ? deps.now() : new Date();
		const revoked = await revokeMcpToken(deps.getDb(), auth.ctx, tokenId, now);
		if (!revoked) {
			return c.json(
				{
					error: "mcp token not found",
					code: MCP_TOKEN_ERROR_CODES.NOT_FOUND,
				},
				404,
				NO_STORE,
			);
		}
		return c.json(revoked, 200, NO_STORE);
	});

	return routes;
}
