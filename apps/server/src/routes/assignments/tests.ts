import type { CreatedResponse } from "@teacher-os/api/contracts";
import {
	assignmentTestCreateSchema,
	assignmentTestPartsSetSchema,
	assignmentTestUpdateSchema,
} from "@teacher-os/api/contracts";
import {
	assignmentTest,
	assignmentTestPart,
} from "@teacher-os/db/schema/assignment-test";
import { and, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { z } from "zod";
import type { Db, KernelCtx } from "../../app";
import {
	createAssignmentTest,
	setAssignmentTestParts,
	updateAssignmentTest,
} from "../../lib/assignments/assignment-service";

type Env = { Variables: { kernelCtx: KernelCtx } };
type AssignmentTestContext = Context<Env>;

/**
 * Full-test builder CRUD (design "IELTS Full Test Builder", 2026-09-28).
 * Mounted by assignmentRoutes via routes.route("/tests", ...) nên mọi
 * handler nằm TRONG kernel tree — Origin + JSON content-type CSRF guard
 * của kernel router cover sẵn; never mount standalone.
 *
 * Parts đổi qua PUT /:id/parts replace-all (unique (testId, part) khiến
 * replace là cách duy nhất); delete + insert chạy trong MỘT db.batch —
 * D1 không có .transaction(), batch là precedent nguyên tử (kernel.ts).
 */
export function testsRoutes(deps: { getDb(): Db }) {
	const routes = new Hono<Env>();

	function unauthorized(c: AssignmentTestContext) {
		return c.json({ error: "unauthorized" }, 401);
	}

	async function readBody<S extends z.ZodType>(
		c: AssignmentTestContext,
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

	// Test mới luôn sinh draft — nút ready là quyết định UI, không phải
	// mặc định tạo. Parts KHÔNG nằm ở create (contract): ghép qua PUT riêng.
	routes.post("/", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, assignmentTestCreateSchema);
		if (!body.ok) return body.response;
		const result = await createAssignmentTest(
			deps.getDb(),
			ctx.orgId,
			body.data,
		);
		if (!result.ok) {
			return c.json({ error: result.error }, result.status);
		}
		return c.json<CreatedResponse>(result.data, 201);
	});

	// Meta/status update. `skill` không đổi được: parts đang gắn theo preset
	// của skill cũ — đổi skill bỏ vô hiệu mọi slot check đã chạy.
	routes.patch("/:id", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, assignmentTestUpdateSchema);
		if (!body.ok) return body.response;
		const testId = c.req.param("id");
		const result = await updateAssignmentTest(
			deps.getDb(),
			ctx.orgId,
			testId,
			body.data,
		);
		if (!result.ok) {
			return c.json({ error: result.error }, result.status);
		}
		return c.json(result.data satisfies CreatedResponse);
	});

	// Parts + test ra trong MỘT batch — không dựa vào FK cascade (PRAGMA
	// foreign_keys theo connection), orphan part không bao giờ tồn tại.
	routes.delete("/:id", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const testId = c.req.param("id");
		const db = deps.getDb();
		const [row] = await db
			.select({ id: assignmentTest.id })
			.from(assignmentTest)
			.where(
				and(eq(assignmentTest.id, testId), eq(assignmentTest.orgId, ctx.orgId)),
			);
		if (!row) return c.json({ error: "test not found" }, 404);
		await db.batch([
			db
				.delete(assignmentTestPart)
				.where(eq(assignmentTestPart.testId, testId)),
			db
				.delete(assignmentTest)
				.where(
					and(
						eq(assignmentTest.id, testId),
						eq(assignmentTest.orgId, ctx.orgId),
					),
				),
		]);
		return c.json({ id: testId } satisfies CreatedResponse);
	});

	// Replace-all parts: contract chặn slot lạ/trùng/qua 4 mục (union mọi
	// preset); membership theo skill CỦA TEST và prompt org+skill+part là
	// việc của route — route mới có test.skill và org từ DB/kernelCtx.
	routes.put("/:id/parts", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, assignmentTestPartsSetSchema);
		if (!body.ok) return body.response;
		const testId = c.req.param("id");
		const result = await setAssignmentTestParts(
			deps.getDb(),
			ctx.orgId,
			testId,
			body.data,
		);
		if (!result.ok) {
			return c.json(
				{
					error: result.error,
					...(result.code ? { code: result.code } : {}),
				},
				result.status,
			);
		}
		return c.json(result.data satisfies CreatedResponse);
	});

	return routes;
}
