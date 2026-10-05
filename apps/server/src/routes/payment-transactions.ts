import { paymentAssignSchema } from "@teacher-os/api/contracts";
import { invoice } from "@teacher-os/db/schema/invoice";
import { paymentTransaction } from "@teacher-os/db/schema/payment-transaction";
import { and, desc, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { z } from "zod";
import type { Db, KernelCtx } from "../app";
import { recomputeInvoiceStatement } from "../lib/payments/recompute-invoice";

type Env = { Variables: { kernelCtx: KernelCtx } };
type TxContext = Context<Env>;

/**
 * Teacher's unmatched-transaction queue (#320), mounted in the kernel tree
 * (CSRF guard + kernelCtx org scoping). foreign_code rows have their
 * content/payment_code nulled in the DTO: the code belongs to another org's
 * invoice and must never be displayed cross-tenant.
 */
export function paymentTransactionRoutes(deps: { getDb(): Db }) {
	const router = new Hono<Env>();

	function unauthorized(c: TxContext) {
		return c.json({ error: "unauthorized" }, 401);
	}

	async function readBody<S extends z.ZodType>(
		c: TxContext,
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

	router.get("/", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const db = deps.getDb();
		const rows = await db
			.select()
			.from(paymentTransaction)
			.where(
				and(
					eq(paymentTransaction.orgId, ctx.orgId),
					eq(paymentTransaction.matchStatus, "unmatched"),
				),
			)
			.orderBy(desc(paymentTransaction.createdAt), desc(paymentTransaction.id))
			.limit(50);
		return c.json(
			rows.map((row) => {
				const foreign = row.unmatchedReason === "foreign_code";
				return {
					id: row.id,
					amount: row.amount,
					content: foreign ? null : row.content,
					referenceCode: foreign ? "" : row.referenceCode,
					transactionDate: row.transactionDate,
					unmatchedReason: row.unmatchedReason,
					paymentCode: foreign ? null : row.paymentCode,
				};
			}),
		);
	});

	router.post("/:id/assign", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, paymentAssignSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();

		const [tx] = await db
			.select()
			.from(paymentTransaction)
			.where(
				and(
					eq(paymentTransaction.id, c.req.param("id")),
					eq(paymentTransaction.orgId, ctx.orgId),
				),
			)
			.limit(1);
		if (!tx || tx.matchStatus !== "unmatched") {
			return c.json({ error: "transaction not found" }, 404);
		}

		const [target] = await db
			.select()
			.from(invoice)
			.where(eq(invoice.id, body.data.invoiceId))
			.limit(1);
		// Tenant predicate makes unknown and foreign invoices identical.
		if (!target || target.orgId !== ctx.orgId) {
			return c.json({ error: "invoice not found" }, 404);
		}
		// A paid invoice with remaining debt still accepts money (the top-up
		// path); a fully settled one does not.
		if (target.status === "paid" && target.paidAmount >= target.amount) {
			return c.json(
				{ error: "invoice already paid", code: "INVOICE_ALREADY_PAID" },
				409,
			);
		}

		await db.batch([
			db
				.update(paymentTransaction)
				.set({
					invoiceId: target.id,
					matchStatus: "matched",
					unmatchedReason: "",
					raw: "",
				})
				.where(eq(paymentTransaction.id, tx.id)),
			recomputeInvoiceStatement(db, ctx.orgId, target.id),
		]);
		return c.json({ ok: true });
	});

	router.post("/:id/ignore", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const db = deps.getDb();
		const [updated] = await db
			.update(paymentTransaction)
			.set({ matchStatus: "ignored" })
			.where(
				and(
					eq(paymentTransaction.id, c.req.param("id")),
					eq(paymentTransaction.orgId, ctx.orgId),
					eq(paymentTransaction.matchStatus, "unmatched"),
				),
			)
			.returning({ id: paymentTransaction.id });
		if (!updated) return c.json({ error: "transaction not found" }, 404);
		return c.json({ ok: true });
	});

	return router;
}
