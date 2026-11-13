import {
	assignStudyPackSchema,
	studyPackCreateSchema,
	studyPackUpdateSchema,
} from "@teacher-os/api/contracts";
import { canPublishGrade, canReviewGrade } from "@teacher-os/auth/role";
import { classTable } from "@teacher-os/db/schema/class";
import {
	classStudyPack,
	libraryExercise,
	studyPack,
	studyPackItem,
} from "@teacher-os/db/schema/study-pack";
import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { type Context, Hono } from "hono";
import type { z } from "zod";
import type { Db, KernelCtx } from "../app";
import {
	assignStudyPackToClass,
	cancelClassStudyPack,
	loadClassStudyPacks,
} from "../lib/study-pack-assign";
import { streamStudyPackAudio } from "../lib/study-pack-audio";
import {
	buildPackItemTupleKey,
	buildStudyPackItemInsertStatements,
	D1_PACK_ITEM_INSERT_CHUNK,
	loadStudyPackDetailFromRow,
	loadStudyPackSummaries,
	validateStudyPackItems,
} from "../lib/study-pack-clone";

type Env = { Variables: { kernelCtx: KernelCtx } };
type StudyPackContext = Context<Env>;

export function studyPackRoutes(deps: {
	getDb(): Db;
	fetchExternalAudio?: typeof fetch;
}) {
	const routes = new Hono<Env>();

	function unauthorized(c: StudyPackContext) {
		return c.json({ error: "unauthorized" }, 401);
	}

	function forbidden(c: StudyPackContext) {
		return c.json({ error: "forbidden" }, 403);
	}

	async function readBody<S extends z.ZodType>(
		c: StudyPackContext,
		schema: S,
	): Promise<
		{ ok: true; data: z.infer<S> } | { ok: false; response: Response }
	> {
		const contentType = c.req.header("Content-Type") ?? "";
		if (!contentType.toLowerCase().startsWith("application/json")) {
			return {
				ok: false,
				response: c.json(
					{ error: "content-type must be application/json" },
					415,
				),
			};
		}
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

	routes.get("/study-packs", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		if (!canReviewGrade(ctx.role)) return forbidden(c);

		const db = deps.getDb();
		const rows = await db
			.select()
			.from(studyPack)
			.where(
				or(
					eq(studyPack.orgId, ctx.orgId),
					and(isNull(studyPack.orgId), eq(studyPack.status, "ready")),
				),
			)
			.orderBy(
				desc(studyPack.updatedAt),
				desc(studyPack.createdAt),
				asc(studyPack.id),
			);

		const packs = await loadStudyPackSummaries(db, rows);
		return c.json({ packs });
	});

	routes.get("/study-packs/exercises/:id/audio", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		if (!canReviewGrade(ctx.role)) return forbidden(c);

		const db = deps.getDb();
		const id = c.req.param("id");
		const [row] = await db
			.select({ audioUrl: libraryExercise.audioUrl })
			.from(libraryExercise)
			.where(
				and(eq(libraryExercise.id, id), eq(libraryExercise.status, "ready")),
			);
		if (!row || !row.audioUrl.trim()) {
			return c.json({ error: "audio not found" }, 404);
		}
		return streamStudyPackAudio(row.audioUrl, deps.fetchExternalAudio);
	});

	routes.get("/study-packs/:id", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		if (!canReviewGrade(ctx.role)) return forbidden(c);

		const db = deps.getDb();
		const id = c.req.param("id");
		const [row] = await db.select().from(studyPack).where(eq(studyPack.id, id));
		if (
			!row ||
			(row.orgId !== ctx.orgId &&
				!(row.orgId === null && row.status === "ready"))
		) {
			return c.json({ error: "study pack not found" }, 404);
		}

		const pack = await loadStudyPackDetailFromRow(db, row);
		return c.json({ pack });
	});

	routes.post("/study-packs", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		if (!canPublishGrade(ctx.role)) return forbidden(c);

		const body = await readBody(c, studyPackCreateSchema);
		if (!body.ok) return body.response;

		const db = deps.getDb();
		const valid = await validateStudyPackItems(db, ctx.orgId, body.data.items);
		if (!valid.ok) {
			return c.json({ error: valid.error }, valid.status);
		}

		const packId = crypto.randomUUID();
		const now = new Date();
		const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
			db.insert(studyPack).values({
				id: packId,
				orgId: ctx.orgId,
				title: body.data.title,
				description: body.data.description,
				level: body.data.level,
				status: body.data.status,
				sourcePackId: null,
				createdBy: ctx.userId,
				createdAt: now,
				updatedAt: now,
			}),
			...buildStudyPackItemInsertStatements(db, packId, body.data.items),
		];
		await db.batch(statements);

		const [created] = await db
			.select()
			.from(studyPack)
			.where(eq(studyPack.id, packId));
		if (!created) {
			return c.json({ error: "study pack creation failed" }, 500);
		}
		const pack = await loadStudyPackDetailFromRow(db, created);
		return c.json({ pack }, 201);
	});

	routes.put("/study-packs/:id", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		if (!canPublishGrade(ctx.role)) return forbidden(c);

		const body = await readBody(c, studyPackUpdateSchema);
		if (!body.ok) return body.response;

		const db = deps.getDb();
		const id = c.req.param("id");
		const [existing] = await db
			.select()
			.from(studyPack)
			.where(and(eq(studyPack.id, id), eq(studyPack.orgId, ctx.orgId)));
		if (!existing) {
			return c.json({ error: "study pack not found" }, 404);
		}

		const valid = await validateStudyPackItems(db, ctx.orgId, body.data.items);
		if (!valid.ok) {
			return c.json({ error: valid.error }, valid.status);
		}

		const existingItemRows = await db
			.select({
				id: studyPackItem.id,
				dayIndex: studyPackItem.dayIndex,
				sourceKind: studyPackItem.sourceKind,
				sourceId: studyPackItem.sourceId,
			})
			.from(studyPackItem)
			.where(eq(studyPackItem.packId, id));
		const existingIdByTuple = new Map(
			existingItemRows.map((row) => [
				buildPackItemTupleKey(row.dayIndex, row.sourceKind, row.sourceId),
				row.id,
			]),
		);

		const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
			db
				.update(studyPack)
				.set({
					title: body.data.title,
					description: body.data.description,
					level: body.data.level,
					status: body.data.status,
					updatedAt: new Date(),
				})
				.where(and(eq(studyPack.id, id), eq(studyPack.orgId, ctx.orgId))),
			db.delete(studyPackItem).where(eq(studyPackItem.packId, id)),
			...buildStudyPackItemInsertStatements(
				db,
				id,
				body.data.items,
				existingIdByTuple,
			),
		];
		await db.batch(statements);

		const [updated] = await db
			.select()
			.from(studyPack)
			.where(and(eq(studyPack.id, id), eq(studyPack.orgId, ctx.orgId)));
		if (!updated) {
			return c.json({ error: "study pack not found" }, 404);
		}
		const pack = await loadStudyPackDetailFromRow(db, updated);
		return c.json({ pack }, 200);
	});

	routes.delete("/study-packs/:id", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		if (!canPublishGrade(ctx.role)) return forbidden(c);

		const db = deps.getDb();
		const id = c.req.param("id");
		const [existing] = await db
			.select({ id: studyPack.id })
			.from(studyPack)
			.where(and(eq(studyPack.id, id), eq(studyPack.orgId, ctx.orgId)));
		if (!existing) {
			return c.json({ error: "study pack not found" }, 404);
		}

		const [referenced] = await db
			.select({ id: classStudyPack.id })
			.from(classStudyPack)
			.where(eq(classStudyPack.packId, id))
			.limit(1);
		if (referenced) {
			return c.json(
				{ error: "study pack is referenced by class assignments" },
				409,
			);
		}

		await db.batch([
			db.delete(studyPackItem).where(eq(studyPackItem.packId, id)),
			db
				.delete(studyPack)
				.where(and(eq(studyPack.id, id), eq(studyPack.orgId, ctx.orgId))),
		]);
		return c.json({ ok: true }, 200);
	});

	routes.post("/study-packs/:id/clone", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		if (!canPublishGrade(ctx.role)) return forbidden(c);

		const db = deps.getDb();
		const sourceId = c.req.param("id");
		const [sourcePack] = await db
			.select()
			.from(studyPack)
			.where(
				and(
					eq(studyPack.id, sourceId),
					isNull(studyPack.orgId),
					eq(studyPack.status, "ready"),
				),
			);
		if (!sourcePack) {
			return c.json({ error: "study pack not found" }, 404);
		}

		const [existingClone] = await db
			.select()
			.from(studyPack)
			.where(
				and(
					eq(studyPack.orgId, ctx.orgId),
					eq(studyPack.sourcePackId, sourcePack.id),
				),
			);
		if (existingClone) {
			const pack = await loadStudyPackDetailFromRow(db, existingClone);
			return c.json({ pack }, 201);
		}

		const sourceItems = await db
			.select()
			.from(studyPackItem)
			.where(eq(studyPackItem.packId, sourcePack.id))
			.orderBy(
				asc(studyPackItem.dayIndex),
				asc(studyPackItem.position),
				asc(studyPackItem.id),
			);

		const newPackId = crypto.randomUUID();
		const now = new Date();
		const clonedItemValues: Array<typeof studyPackItem.$inferInsert> =
			sourceItems.map((item) => ({
				id: crypto.randomUUID(),
				packId: newPackId,
				dayIndex: item.dayIndex,
				position: item.position,
				sourceKind: item.sourceKind,
				sourceId: item.sourceId,
				note: item.note,
			}));

		const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
			db.insert(studyPack).values({
				id: newPackId,
				orgId: ctx.orgId,
				title: sourcePack.title,
				description: sourcePack.description,
				level: sourcePack.level,
				status: sourcePack.status,
				sourcePackId: sourcePack.id,
				createdBy: ctx.userId,
				createdAt: now,
				updatedAt: now,
			}),
		];
		for (
			let i = 0;
			i < clonedItemValues.length;
			i += D1_PACK_ITEM_INSERT_CHUNK
		) {
			const chunk = clonedItemValues.slice(i, i + D1_PACK_ITEM_INSERT_CHUNK);
			statements.push(db.insert(studyPackItem).values(chunk));
		}
		try {
			await db.batch(statements);
		} catch (err) {
			const [racedClone] = await db
				.select()
				.from(studyPack)
				.where(
					and(
						eq(studyPack.orgId, ctx.orgId),
						eq(studyPack.sourcePackId, sourcePack.id),
					),
				);
			if (racedClone) {
				const pack = await loadStudyPackDetailFromRow(db, racedClone);
				return c.json({ pack }, 201);
			}
			throw err;
		}

		const [created] = await db
			.select()
			.from(studyPack)
			.where(eq(studyPack.id, newPackId));
		if (!created) {
			return c.json({ error: "study pack clone failed" }, 500);
		}
		const pack = await loadStudyPackDetailFromRow(db, created);
		return c.json({ pack }, 201);
	});

	routes.get("/classes/:classId/study-packs", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		if (!canReviewGrade(ctx.role)) return forbidden(c);

		const db = deps.getDb();
		const classId = c.req.param("classId");
		const [cls] = await db
			.select({ id: classTable.id })
			.from(classTable)
			.where(and(eq(classTable.id, classId), eq(classTable.orgId, ctx.orgId)));
		if (!cls) {
			return c.json({ error: "class not found" }, 404);
		}

		const response = await loadClassStudyPacks(db, ctx.orgId, classId);
		return c.json(response, 200);
	});

	routes.post("/classes/:classId/study-packs", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		if (!canPublishGrade(ctx.role)) return forbidden(c);

		const body = await readBody(c, assignStudyPackSchema);
		if (!body.ok) return body.response;

		const db = deps.getDb();
		const classId = c.req.param("classId");
		const result = await assignStudyPackToClass(db, {
			orgId: ctx.orgId,
			classId,
			packId: body.data.packId,
			startDate: body.data.startDate,
			releaseTime: body.data.releaseTime,
			dueTime: body.data.dueTime,
			createdBy: ctx.userId,
		});
		if (!result.ok) {
			return c.json({ error: result.error }, result.status);
		}

		const response = await loadClassStudyPacks(db, ctx.orgId, classId);
		return c.json(response, result.reused ? 200 : 201);
	});

	routes.delete("/classes/:classId/study-packs/:id", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		if (!canPublishGrade(ctx.role)) return forbidden(c);

		const db = deps.getDb();
		const classId = c.req.param("classId");
		const [cls] = await db
			.select({ id: classTable.id })
			.from(classTable)
			.where(and(eq(classTable.id, classId), eq(classTable.orgId, ctx.orgId)));
		if (!cls) {
			return c.json({ error: "class not found" }, 404);
		}

		const cancelled = await cancelClassStudyPack(
			db,
			ctx.orgId,
			classId,
			c.req.param("id"),
		);
		if (!cancelled.ok) {
			return c.json({ error: cancelled.error }, cancelled.status);
		}

		const response = await loadClassStudyPacks(db, ctx.orgId, classId);
		return c.json(response, 200);
	});

	return routes;
}
