import {
	type CreatedResponse,
	commentBankCreateSchema,
	reportCreateSchema,
} from "@teacher-os/api/contracts";
import { commentBank } from "@teacher-os/db/schema/comment-bank";
import { type ReportStatus, report } from "@teacher-os/db/schema/report";
import { student } from "@teacher-os/db/schema/student";
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

export function notifRoutes(deps: Deps) {
	return createListRoutes(deps, loadNotifs);
}

// dd/MM HH:mm in Vietnam time — Workers run in UTC, so local getters drift
// a day before 07:00 Asia/Ho_Chi_Minh. Matches the seeded display format
// the send log renders ("25/08 20:00").
function sentStamp(date: Date): string {
	const fmt = (options: Intl.DateTimeFormatOptions) =>
		new Intl.DateTimeFormat("en-GB", {
			timeZone: "Asia/Ho_Chi_Minh",
			...options,
		}).format(date);
	return `${fmt({ day: "2-digit", month: "2-digit" })} ${fmt({ hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

export function reportRoutes(deps: Deps) {
	const routes = createListRoutes(deps, loadReports);
	// #173 — create a weekly parent report. `sent` stamps only a real send;
	// drafts keep `sent` empty so the UI's send log never shows a message
	// that never went out.
	routes.post("/", async (c) => {
		const ctx = getKernelCtx(c);
		if (!ctx) return unauthorized(c);

		let raw: unknown;
		try {
			raw = await c.req.json();
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		const body = reportCreateSchema.safeParse(raw);
		if (!body.success) return c.json({ error: "invalid body" }, 400);

		const db = deps.getDb();
		const [target] = await db
			.select({ id: student.id })
			.from(student)
			.where(
				and(eq(student.id, body.data.studentId), eq(student.orgId, ctx.orgId)),
			);
		if (!target) return c.json({ error: "unknown student" }, 400);

		const status: ReportStatus = body.data.status;
		const [created] = await db
			.insert(report)
			.values({
				id: crypto.randomUUID(),
				orgId: ctx.orgId,
				studentId: body.data.studentId,
				period: body.data.period,
				content: body.data.content.trim(),
				channel: body.data.channel,
				status,
				sessions: 0,
				sent: status === "sent" ? sentStamp(new Date()) : "",
				read: "",
			})
			.returning({ id: report.id });
		// RETURNING on an insert always yields the row; the guard exists for
		// the type-level undefined so the 201 body stays CreatedResponse.
		if (!created) return c.json({ error: "report write conflict" }, 500);
		return c.json<CreatedResponse>(created, 201);
	});
	return routes;
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
