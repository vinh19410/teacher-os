import {
	type CourseCatalogResponse,
	courseCategoryCreateSchema,
	courseCategoryReorderSchema,
	courseCategoryUpdateSchema,
	courseCreateSchema,
	courseReorderSchema,
	courseUpdateSchema,
	normalizeCourseNameKey,
} from "@teacher-os/api/course-contracts";
import { canAccessFinance } from "@teacher-os/auth/role";
import { course, courseCategory } from "@teacher-os/db/schema/course-catalog";
import { placementTestSubmission } from "@teacher-os/db/schema/placement-test";
import { and, asc, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { z } from "zod";
import type { Db, KernelCtx } from "../app";
import {
	ensureDefaultCourseCatalog,
	isSqliteForeignKeyError,
	isSqliteUniqueError,
	loadCourseCatalog,
	toCourseCategoryDto,
	toCourseItemDto,
} from "../lib/course-catalog";

type Env = { Variables: { kernelCtx: KernelCtx } };
type CourseContext = Context<Env>;

export interface CourseRouteDeps {
	getDb(): Db;
}

function forbidden(c: CourseContext) {
	return c.json({ error: "COURSE_FORBIDDEN", code: "COURSE_FORBIDDEN" }, 403);
}

function categoryDuplicateResponse(c: CourseContext) {
	return c.json(
		{
			error: "COURSE_CATEGORY_DUPLICATE",
			code: "COURSE_CATEGORY_DUPLICATE",
			message: "Tên nhóm khóa học đã tồn tại.",
		},
		409,
	);
}

function courseDuplicateResponse(c: CourseContext) {
	return c.json(
		{
			error: "COURSE_DUPLICATE",
			code: "COURSE_DUPLICATE",
			message: "Tên khóa học đã tồn tại trong nhóm này.",
		},
		409,
	);
}

async function readJsonBody<S extends z.ZodType>(
	c: CourseContext,
	schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: Response }> {
	let raw: unknown;
	try {
		raw = await c.req.json();
	} catch {
		return { ok: false, response: c.json({ error: "invalid body" }, 400) };
	}
	const parsed = schema.safeParse(raw);
	if (!parsed.success) {
		return {
			ok: false,
			response: c.json(
				{
					error: "invalid body",
					message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ.",
				},
				400,
			),
		};
	}
	return { ok: true, data: parsed.data };
}

/**
 * API danh mục khóa học master data 2 cấp (`/api/courses`) — mount TRONG
 * kernelRoutes để thừa hưởng Origin/CSRF guard + session bootstrap.
 * - `GET /api/courses?activeOnly=true`: mọi thành viên trong org đã đăng nhập
 *   đều đọc được (phục vụ dropdown chọn khóa khi chấm đầu vào ở `/students/$id`).
 * - `GET /api/courses` (full catalog) và mọi route ghi: yêu cầu `canAccessFinance`.
 */
export function courseRoutes(deps: CourseRouteDeps) {
	const routes = new Hono<Env>();

	routes.get("/", async (c: CourseContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);

		const activeOnly = c.req.query("activeOnly") === "true";
		if (!activeOnly && !canAccessFinance(ctx.role)) {
			return forbidden(c);
		}

		const categories = await loadCourseCatalog(deps.getDb(), ctx.orgId, {
			activeOnly,
		});
		c.header("Cache-Control", "no-store");
		return c.json({ categories } satisfies CourseCatalogResponse);
	});

	routes.post("/categories/reorder", async (c: CourseContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		if (!canAccessFinance(ctx.role)) return forbidden(c);

		const body = await readJsonBody(c, courseCategoryReorderSchema);
		if (!body.ok) return body.response;

		const { orderedIds } = body.data;
		if (new Set(orderedIds).size !== orderedIds.length) {
			return c.json(
				{
					error: "invalid body",
					message: "Danh sách sắp xếp chứa nhóm khóa học trùng lặp.",
				},
				400,
			);
		}

		const db = deps.getDb();
		await ensureDefaultCourseCatalog(db, ctx.orgId);

		const existing = await db
			.select({ id: courseCategory.id })
			.from(courseCategory)
			.where(eq(courseCategory.orgId, ctx.orgId));
		const existingSet = new Set(existing.map((row) => row.id));
		if (
			existing.length !== orderedIds.length ||
			orderedIds.some((id) => !existingSet.has(id))
		) {
			return c.json(
				{
					error: "invalid body",
					message: "Danh sách nhóm khóa học không khớp với dữ liệu hiện tại.",
				},
				400,
			);
		}

		const now = new Date();
		const updates = orderedIds.map((id, index) =>
			db
				.update(courseCategory)
				.set({ sortOrder: index, updatedAt: now })
				.where(
					and(eq(courseCategory.id, id), eq(courseCategory.orgId, ctx.orgId)),
				),
		);
		const [firstUpdate, ...restUpdates] = updates;
		if (firstUpdate) {
			await db.batch([firstUpdate, ...restUpdates]);
		}

		const categories = await loadCourseCatalog(db, ctx.orgId);
		c.header("Cache-Control", "no-store");
		return c.json({ categories } satisfies CourseCatalogResponse);
	});

	routes.post("/categories", async (c: CourseContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		if (!canAccessFinance(ctx.role)) return forbidden(c);

		const body = await readJsonBody(c, courseCategoryCreateSchema);
		if (!body.ok) return body.response;

		const db = deps.getDb();
		await ensureDefaultCourseCatalog(db, ctx.orgId);

		const existing = await db
			.select({
				id: courseCategory.id,
				name: courseCategory.name,
				sortOrder: courseCategory.sortOrder,
			})
			.from(courseCategory)
			.where(eq(courseCategory.orgId, ctx.orgId));

		const nameKey = normalizeCourseNameKey(body.data.name);
		if (existing.some((row) => normalizeCourseNameKey(row.name) === nameKey)) {
			return categoryDuplicateResponse(c);
		}

		const nextSortOrder =
			existing.length > 0
				? Math.max(...existing.map((row) => row.sortOrder)) + 1
				: 0;
		const now = new Date();
		let created: typeof courseCategory.$inferSelect | undefined;
		try {
			const rows = await db
				.insert(courseCategory)
				.values({
					id: crypto.randomUUID(),
					orgId: ctx.orgId,
					name: body.data.name,
					sortOrder: nextSortOrder,
					isActive: true,
					createdAt: now,
					updatedAt: now,
				})
				.returning();
			created = rows[0];
		} catch (err: unknown) {
			if (isSqliteUniqueError(err)) {
				return categoryDuplicateResponse(c);
			}
			throw err;
		}

		if (!created) {
			return c.json({ error: "create failed" }, 500);
		}
		return c.json({ category: toCourseCategoryDto(created, []) }, 201);
	});

	routes.patch("/categories/:id", async (c: CourseContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		if (!canAccessFinance(ctx.role)) return forbidden(c);

		const body = await readJsonBody(c, courseCategoryUpdateSchema);
		if (!body.ok) return body.response;

		const categoryId = c.req.param("id") ?? "";
		const db = deps.getDb();
		await ensureDefaultCourseCatalog(db, ctx.orgId);

		const allCategories = await db
			.select()
			.from(courseCategory)
			.where(eq(courseCategory.orgId, ctx.orgId));
		const existing = allCategories.find((row) => row.id === categoryId);
		if (!existing) {
			return c.json(
				{
					error: "COURSE_CATEGORY_NOT_FOUND",
					code: "COURSE_CATEGORY_NOT_FOUND",
					message: "Nhóm khóa học không tồn tại.",
				},
				404,
			);
		}

		if (body.data.name !== undefined) {
			const nameKey = normalizeCourseNameKey(body.data.name);
			const duplicate = allCategories.some(
				(row) =>
					row.id !== existing.id &&
					normalizeCourseNameKey(row.name) === nameKey,
			);
			if (duplicate) {
				return categoryDuplicateResponse(c);
			}
		}

		let updated: typeof courseCategory.$inferSelect | undefined;
		try {
			const rows = await db
				.update(courseCategory)
				.set({
					name: body.data.name ?? existing.name,
					isActive: body.data.isActive ?? existing.isActive,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(courseCategory.id, existing.id),
						eq(courseCategory.orgId, ctx.orgId),
					),
				)
				.returning();
			updated = rows[0];
		} catch (err: unknown) {
			if (isSqliteUniqueError(err)) {
				return categoryDuplicateResponse(c);
			}
			throw err;
		}

		if (!updated) {
			return c.json(
				{
					error: "COURSE_CATEGORY_NOT_FOUND",
					code: "COURSE_CATEGORY_NOT_FOUND",
					message: "Nhóm khóa học không tồn tại.",
				},
				404,
			);
		}

		const categoryCourses = await db
			.select()
			.from(course)
			.where(
				and(eq(course.orgId, ctx.orgId), eq(course.categoryId, existing.id)),
			)
			.orderBy(asc(course.sortOrder), asc(course.createdAt), asc(course.id));

		return c.json({
			category: toCourseCategoryDto(
				updated,
				categoryCourses.map(toCourseItemDto),
			),
		});
	});

	routes.delete("/categories/:id", async (c: CourseContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		if (!canAccessFinance(ctx.role)) return forbidden(c);

		const categoryId = c.req.param("id") ?? "";
		const db = deps.getDb();
		await ensureDefaultCourseCatalog(db, ctx.orgId);

		const [existing] = await db
			.select({ id: courseCategory.id })
			.from(courseCategory)
			.where(
				and(
					eq(courseCategory.id, categoryId),
					eq(courseCategory.orgId, ctx.orgId),
				),
			)
			.limit(1);
		if (!existing) {
			return c.json(
				{
					error: "COURSE_CATEGORY_NOT_FOUND",
					code: "COURSE_CATEGORY_NOT_FOUND",
					message: "Nhóm khóa học không tồn tại.",
				},
				404,
			);
		}

		const [childCourse] = await db
			.select({ id: course.id })
			.from(course)
			.where(
				and(eq(course.orgId, ctx.orgId), eq(course.categoryId, existing.id)),
			)
			.limit(1);
		if (childCourse) {
			return c.json(
				{
					error: "COURSE_CATEGORY_NOT_EMPTY",
					code: "COURSE_CATEGORY_NOT_EMPTY",
					message: "Không thể xóa nhóm khi vẫn còn khóa học bên trong.",
				},
				409,
			);
		}

		try {
			await db
				.delete(courseCategory)
				.where(
					and(
						eq(courseCategory.id, existing.id),
						eq(courseCategory.orgId, ctx.orgId),
					),
				);
		} catch (err: unknown) {
			if (isSqliteForeignKeyError(err)) {
				return c.json(
					{
						error: "COURSE_CATEGORY_NOT_EMPTY",
						code: "COURSE_CATEGORY_NOT_EMPTY",
						message: "Không thể xóa nhóm khi vẫn còn khóa học bên trong.",
					},
					409,
				);
			}
			throw err;
		}

		return c.json({ deleted: true });
	});

	routes.post("/items/reorder", async (c: CourseContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		if (!canAccessFinance(ctx.role)) return forbidden(c);

		const body = await readJsonBody(c, courseReorderSchema);
		if (!body.ok) return body.response;

		const { categoryId, orderedIds } = body.data;
		if (new Set(orderedIds).size !== orderedIds.length) {
			return c.json(
				{
					error: "invalid body",
					message: "Danh sách sắp xếp chứa khóa học trùng lặp.",
				},
				400,
			);
		}

		const db = deps.getDb();
		await ensureDefaultCourseCatalog(db, ctx.orgId);

		const [categoryRow] = await db
			.select({ id: courseCategory.id })
			.from(courseCategory)
			.where(
				and(
					eq(courseCategory.id, categoryId),
					eq(courseCategory.orgId, ctx.orgId),
				),
			)
			.limit(1);
		if (!categoryRow) {
			return c.json(
				{
					error: "COURSE_CATEGORY_NOT_FOUND",
					code: "COURSE_CATEGORY_NOT_FOUND",
					message: "Nhóm khóa học không tồn tại.",
				},
				404,
			);
		}

		const siblings = await db
			.select({ id: course.id })
			.from(course)
			.where(
				and(eq(course.orgId, ctx.orgId), eq(course.categoryId, categoryId)),
			);
		const siblingSet = new Set(siblings.map((row) => row.id));
		if (
			siblings.length !== orderedIds.length ||
			orderedIds.some((id) => !siblingSet.has(id))
		) {
			return c.json(
				{
					error: "invalid body",
					message: "Danh sách khóa học không khớp với dữ liệu hiện tại.",
				},
				400,
			);
		}

		const now = new Date();
		const updates = orderedIds.map((id, index) =>
			db
				.update(course)
				.set({ sortOrder: index, updatedAt: now })
				.where(
					and(
						eq(course.id, id),
						eq(course.orgId, ctx.orgId),
						eq(course.categoryId, categoryId),
					),
				),
		);
		const [firstUpdate, ...restUpdates] = updates;
		if (firstUpdate) {
			await db.batch([firstUpdate, ...restUpdates]);
		}

		const categories = await loadCourseCatalog(db, ctx.orgId);
		c.header("Cache-Control", "no-store");
		return c.json({ categories } satisfies CourseCatalogResponse);
	});

	routes.post("/items", async (c: CourseContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		if (!canAccessFinance(ctx.role)) return forbidden(c);

		const body = await readJsonBody(c, courseCreateSchema);
		if (!body.ok) return body.response;

		const db = deps.getDb();
		await ensureDefaultCourseCatalog(db, ctx.orgId);

		const [categoryRow] = await db
			.select({ id: courseCategory.id })
			.from(courseCategory)
			.where(
				and(
					eq(courseCategory.id, body.data.categoryId),
					eq(courseCategory.orgId, ctx.orgId),
				),
			)
			.limit(1);
		if (!categoryRow) {
			return c.json(
				{
					error: "COURSE_CATEGORY_NOT_FOUND",
					code: "COURSE_CATEGORY_NOT_FOUND",
					message: "Nhóm khóa học không tồn tại.",
				},
				404,
			);
		}

		const siblings = await db
			.select({
				id: course.id,
				name: course.name,
				sortOrder: course.sortOrder,
			})
			.from(course)
			.where(
				and(
					eq(course.orgId, ctx.orgId),
					eq(course.categoryId, body.data.categoryId),
				),
			);

		const nameKey = normalizeCourseNameKey(body.data.name);
		if (siblings.some((row) => normalizeCourseNameKey(row.name) === nameKey)) {
			return courseDuplicateResponse(c);
		}

		const nextSortOrder =
			siblings.length > 0
				? Math.max(...siblings.map((row) => row.sortOrder)) + 1
				: 0;
		const now = new Date();
		let created: typeof course.$inferSelect | undefined;
		try {
			const rows = await db
				.insert(course)
				.values({
					id: crypto.randomUUID(),
					orgId: ctx.orgId,
					categoryId: body.data.categoryId,
					name: body.data.name,
					sortOrder: nextSortOrder,
					isActive: true,
					createdAt: now,
					updatedAt: now,
				})
				.returning();
			created = rows[0];
		} catch (err: unknown) {
			if (isSqliteUniqueError(err)) {
				return courseDuplicateResponse(c);
			}
			throw err;
		}

		if (!created) {
			return c.json({ error: "create failed" }, 500);
		}
		return c.json({ course: toCourseItemDto(created) }, 201);
	});

	routes.patch("/items/:id", async (c: CourseContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		if (!canAccessFinance(ctx.role)) return forbidden(c);

		const body = await readJsonBody(c, courseUpdateSchema);
		if (!body.ok) return body.response;

		const courseId = c.req.param("id") ?? "";
		const db = deps.getDb();
		await ensureDefaultCourseCatalog(db, ctx.orgId);

		const [existing] = await db
			.select()
			.from(course)
			.where(and(eq(course.id, courseId), eq(course.orgId, ctx.orgId)))
			.limit(1);
		if (!existing) {
			return c.json(
				{
					error: "COURSE_NOT_FOUND",
					code: "COURSE_NOT_FOUND",
					message: "Khóa học không tồn tại.",
				},
				404,
			);
		}

		const targetCategoryId = body.data.categoryId ?? existing.categoryId;
		const categoryChanged = targetCategoryId !== existing.categoryId;
		if (categoryChanged) {
			const [targetCat] = await db
				.select({ id: courseCategory.id })
				.from(courseCategory)
				.where(
					and(
						eq(courseCategory.id, targetCategoryId),
						eq(courseCategory.orgId, ctx.orgId),
					),
				)
				.limit(1);
			if (!targetCat) {
				return c.json(
					{
						error: "COURSE_CATEGORY_NOT_FOUND",
						code: "COURSE_CATEGORY_NOT_FOUND",
						message: "Nhóm khóa học không tồn tại.",
					},
					404,
				);
			}
		}

		const effectiveName = body.data.name ?? existing.name;
		const shouldLoadSiblings = body.data.name !== undefined || categoryChanged;
		const siblings = shouldLoadSiblings
			? await db
					.select({
						id: course.id,
						name: course.name,
						sortOrder: course.sortOrder,
					})
					.from(course)
					.where(
						and(
							eq(course.orgId, ctx.orgId),
							eq(course.categoryId, targetCategoryId),
						),
					)
			: [];

		if (shouldLoadSiblings) {
			const nameKey = normalizeCourseNameKey(effectiveName);
			const duplicate = siblings.some(
				(row) =>
					row.id !== existing.id &&
					normalizeCourseNameKey(row.name) === nameKey,
			);
			if (duplicate) {
				return courseDuplicateResponse(c);
			}
		}

		const nextSortOrder = categoryChanged
			? siblings.length > 0
				? Math.max(...siblings.map((row) => row.sortOrder)) + 1
				: 0
			: existing.sortOrder;

		let updated: typeof course.$inferSelect | undefined;
		try {
			const rows = await db
				.update(course)
				.set({
					categoryId: targetCategoryId,
					name: effectiveName,
					sortOrder: nextSortOrder,
					isActive: body.data.isActive ?? existing.isActive,
					updatedAt: new Date(),
				})
				.where(and(eq(course.id, existing.id), eq(course.orgId, ctx.orgId)))
				.returning();
			updated = rows[0];
		} catch (err: unknown) {
			if (isSqliteUniqueError(err)) {
				return courseDuplicateResponse(c);
			}
			throw err;
		}

		if (!updated) {
			return c.json(
				{
					error: "COURSE_NOT_FOUND",
					code: "COURSE_NOT_FOUND",
					message: "Khóa học không tồn tại.",
				},
				404,
			);
		}

		return c.json({ course: toCourseItemDto(updated) });
	});

	routes.delete("/items/:id", async (c: CourseContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		if (!canAccessFinance(ctx.role)) return forbidden(c);

		const courseId = c.req.param("id") ?? "";
		const db = deps.getDb();
		await ensureDefaultCourseCatalog(db, ctx.orgId);

		const [existing] = await db
			.select({ id: course.id })
			.from(course)
			.where(and(eq(course.id, courseId), eq(course.orgId, ctx.orgId)))
			.limit(1);
		if (!existing) {
			return c.json(
				{
					error: "COURSE_NOT_FOUND",
					code: "COURSE_NOT_FOUND",
					message: "Khóa học không tồn tại.",
				},
				404,
			);
		}

		// Xóa liên kết `final_course_id` tường minh song song với ON DELETE SET NULL,
		// giữ nguyên snapshot `final_display_course` đã lưu cho bài chấm lịch sử.
		await db.batch([
			db
				.update(placementTestSubmission)
				.set({ finalCourseId: null })
				.where(
					and(
						eq(placementTestSubmission.orgId, ctx.orgId),
						eq(placementTestSubmission.finalCourseId, existing.id),
					),
				),
			db
				.delete(course)
				.where(and(eq(course.id, existing.id), eq(course.orgId, ctx.orgId))),
		]);

		return c.json({ deleted: true });
	});

	return routes;
}
