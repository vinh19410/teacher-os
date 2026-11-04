import type { CreatedResponse } from "@teacher-os/api/contracts";
import {
	ASSIGNMENT_TEST_PRESETS,
	type AssignmentSkill,
	assignmentTestCreateSchema,
	assignmentTestPartsSetSchema,
	assignmentTestUpdateSchema,
} from "@teacher-os/api/contracts";
import { assignmentPrompt } from "@teacher-os/db/schema/assignment-prompt";
import {
	assignmentTest,
	assignmentTestPart,
} from "@teacher-os/db/schema/assignment-test";
import { and, eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { type Context, Hono } from "hono";
import type { z } from "zod";
import type { Db, KernelCtx } from "../../app";

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
		const [created] = await deps
			.getDb()
			.insert(assignmentTest)
			.values({
				id: crypto.randomUUID(),
				orgId: ctx.orgId,
				// Explicit map — a missing entry here silently drops the field.
				title: body.data.title,
				description: body.data.description ?? null,
				skill: body.data.skill,
				timeLimitSeconds: body.data.timeLimitSeconds,
				collection: body.data.collection ?? null,
				testGroup: body.data.testGroup ?? null,
				status: "draft",
			})
			.returning({ id: assignmentTest.id });
		if (!created) return c.json({ error: "test write conflict" }, 500);
		return c.json<CreatedResponse>(created, 201);
	});

	// Meta/status update. `skill` không đổi được: parts đang gắn theo preset
	// của skill cũ — đổi skill bỏ vô hiệu mọi slot check đã chạy.
	routes.patch("/:id", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const body = await readBody(c, assignmentTestUpdateSchema);
		if (!body.ok) return body.response;
		const testId = c.req.param("id");
		const db = deps.getDb();
		const [row] = await db
			.select({ skill: assignmentTest.skill })
			.from(assignmentTest)
			.where(
				and(eq(assignmentTest.id, testId), eq(assignmentTest.orgId, ctx.orgId)),
			);
		if (!row) return c.json({ error: "test not found" }, 404);
		if (body.data.skill !== undefined && body.data.skill !== row.skill)
			return c.json({ error: "skill is immutable" }, 400);

		// Explicit map — a missing entry here silently drops the field.
		const updates: Partial<typeof assignmentTest.$inferInsert> = {};
		if (body.data.title !== undefined) updates.title = body.data.title;
		if (body.data.description !== undefined)
			updates.description = body.data.description;
		if (body.data.timeLimitSeconds !== undefined)
			updates.timeLimitSeconds = body.data.timeLimitSeconds;
		if (body.data.collection !== undefined)
			updates.collection = body.data.collection;
		if (body.data.testGroup !== undefined)
			updates.testGroup = body.data.testGroup;
		if (body.data.status !== undefined) updates.status = body.data.status;

		if (Object.keys(updates).length === 0)
			return c.json({ id: testId } satisfies CreatedResponse);
		const updated = await db
			.update(assignmentTest)
			.set(updates)
			.where(
				and(eq(assignmentTest.id, testId), eq(assignmentTest.orgId, ctx.orgId)),
			)
			.returning({ id: assignmentTest.id });
		if (!updated[0]) return c.json({ error: "test not found" }, 404);
		return c.json({ id: testId } satisfies CreatedResponse);
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
		const db = deps.getDb();
		const [test] = await db
			.select({ skill: assignmentTest.skill })
			.from(assignmentTest)
			.where(
				and(eq(assignmentTest.id, testId), eq(assignmentTest.orgId, ctx.orgId)),
			);
		if (!test) return c.json({ error: "test not found" }, 404);
		const preset = ASSIGNMENT_TEST_PRESETS[test.skill as AssignmentSkill];
		if (!preset) return c.json({ error: "invalid test skill" }, 400);
		for (const item of body.data) {
			if (!preset.slots.some((slot) => slot.part === item.part))
				return c.json({ error: "invalid part slot for skill" }, 400);
		}

		// IDOR chặn ở đây: promptId phải thuộc org (và đúng skill/part của
		// slot) trước khi vào assignment_test_part.
		const promptIds = [...new Set(body.data.map((item) => item.promptId))];
		const promptRows = promptIds.length
			? await db
					.select({
						id: assignmentPrompt.id,
						skill: assignmentPrompt.skill,
						part: assignmentPrompt.part,
						writingPart: assignmentPrompt.writingPart,
					})
					.from(assignmentPrompt)
					.where(
						and(
							eq(assignmentPrompt.orgId, ctx.orgId),
							inArray(assignmentPrompt.id, promptIds),
						),
					)
			: [];
		const promptsById = new Map(promptRows.map((row) => [row.id, row]));
		for (const item of body.data) {
			const prompt = promptsById.get(item.promptId);
			if (!prompt) return c.json({ error: "prompt not found" }, 400);
			if (prompt.skill !== test.skill)
				return c.json({ error: "prompt skill mismatch" }, 400);
			if (prompt.part !== item.part)
				return c.json({ error: "prompt part mismatch" }, 400);
			if (prompt.writingPart !== null)
				return c.json(
					{ error: "hybrid prompt cannot be attached to test" },
					400,
				);
		}

		const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
			db
				.delete(assignmentTestPart)
				.where(eq(assignmentTestPart.testId, testId)),
			...body.data.map((item) =>
				db.insert(assignmentTestPart).values({
					id: crypto.randomUUID(),
					testId,
					promptId: item.promptId,
					part: item.part,
					// Slot index trong preset — thứ tự hiển thị ổn định với mọi
					// thứ tự gửi lên của client.
					position: preset.slots.findIndex((slot) => slot.part === item.part),
					qStartOverride: item.qStartOverride ?? null,
				}),
			),
		];
		await db.batch(statements);
		return c.json({ id: testId } satisfies CreatedResponse);
	});

	return routes;
}
