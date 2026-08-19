import {
	type CreatedResponse,
	commentBankCreateSchema,
} from "@teacher-os/api/contracts";
import { commentBank } from "@teacher-os/db/schema/comment-bank";
import { and, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { Db, KernelCtx } from "../../app";
import { loadCommentBank, loadNotifs, loadReports } from "./loaders";

type Env = { Variables: { kernelCtx: KernelCtx } };
type Deps = { getDb(): Db };

function unauthorized(c: Context<Env>) {
	return c.json({ error: "unauthorized" }, 401);
}

function getKernelCtx(c: Context<Env>) {
	return c.get("kernelCtx");
}

function createListRoutes<T>(
	deps: Deps,
	load: (db: Db, orgId: string) => Promise<T>,
) {
	const routes = new Hono<Env>();
	routes.get("/", async (c) => {
		const ctx = getKernelCtx(c);
		if (!ctx) return unauthorized(c);
		return c.json(await load(deps.getDb(), ctx.orgId));
	});
	return routes;
}

export function reportRoutes(deps: Deps) {
	return createListRoutes(deps, loadReports);
}

export function notifRoutes(deps: Deps) {
	return createListRoutes(deps, loadNotifs);
}

export function commentBankRoutes(deps: Deps) {
	const routes = createListRoutes(deps, loadCommentBank);
	routes.post("/", async (c) => {
		const ctx = getKernelCtx(c);
		if (!ctx) return unauthorized(c);

		let raw: unknown;
		try {
			raw = await c.req.json();
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		const body = commentBankCreateSchema.safeParse(raw);
		if (!body.success) return c.json({ error: "invalid body" }, 400);

		const id = crypto.randomUUID();
		const db = deps.getDb();
		const [created] = await db
			.insert(commentBank)
			.values({
				id,
				orgId: ctx.orgId,
				operationId: body.data.operationId,
				tag: "chung",
				text: body.data.text,
			})
			.onConflictDoNothing({
				target: [commentBank.orgId, commentBank.operationId],
			})
			.returning({ id: commentBank.id });
		if (created) return c.json<CreatedResponse>(created, 201);

		const [existing] = await db
			.select({ id: commentBank.id, text: commentBank.text })
			.from(commentBank)
			.where(
				and(
					eq(commentBank.orgId, ctx.orgId),
					eq(commentBank.operationId, body.data.operationId),
				),
			);
		if (!existing) return c.json({ error: "comment write conflict" }, 409);
		if (existing.text !== body.data.text) {
			return c.json({ error: "operation payload conflict" }, 409);
		}
		return c.json<CreatedResponse>({ id: existing.id }, 200);
	});
	return routes;
}
