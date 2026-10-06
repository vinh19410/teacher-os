import type { PublicPayView } from "@teacher-os/api/contracts";
import { invoice } from "@teacher-os/db/schema/invoice";
import { organization } from "@teacher-os/db/schema/organization";
import { student } from "@teacher-os/db/schema/student";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Db } from "../app";
import { loadPaymentInstructions } from "../lib/payment-instructions";

/**
 * Public pay page data (#320) — mounted OUTSIDE /api/* because the bootstrap
 * middleware 403s student-role sessions on /api and this page must work for
 * signed-out parents. No session read, no writes, generic 404 for unknown
 * tokens (they are unguessable 128-bit capabilities). The response omits the
 * teacher's free-text note and the due date on purpose: the link travels
 * through Zalo group chats outside the teacher's control.
 */
export function publicPayRoutes(deps: { getDb(): Db }) {
	const router = new Hono();

	router.get("/:token", async (c) => {
		const token = c.req.param("token");
		if (!token || token.length < 10) {
			return c.json({ error: "not found" }, 404);
		}
		const db = deps.getDb();
		const [row] = await db
			.select({
				invoice,
				orgName: organization.name,
				studentName: student.name,
			})
			.from(invoice)
			.innerJoin(student, eq(invoice.studentId, student.id))
			.innerJoin(organization, eq(invoice.orgId, organization.id))
			.where(eq(invoice.payToken, token))
			.limit(1);
		if (!row) {
			return c.json({ error: "not found" }, 404);
		}
		const instructions = await loadPaymentInstructions({
			db,
			invoice: row.invoice,
		});
		const { note: _note, due: _due, ...rest } = instructions;
		const view: PublicPayView = {
			...rest,
			orgName: row.orgName,
			studentName: row.studentName,
		};
		c.header("Cache-Control", "no-store");
		return c.json(view);
	});

	return router;
}
