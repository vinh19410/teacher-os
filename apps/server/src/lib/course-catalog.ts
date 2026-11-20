import {
	type CourseCategoryDto,
	type CourseItemDto,
	DEFAULT_COURSE_CATALOG,
	formatCourseDisplayName,
} from "@teacher-os/api/course-contracts";
import {
	course,
	courseCatalogSeed,
	courseCategory,
} from "@teacher-os/db/schema/course-catalog";
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../app";

export function toCourseItemDto(
	row: typeof course.$inferSelect,
): CourseItemDto {
	return {
		id: row.id,
		categoryId: row.categoryId,
		name: row.name,
		sortOrder: row.sortOrder,
		isActive: row.isActive,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

export function toCourseCategoryDto(
	row: typeof courseCategory.$inferSelect,
	courses: CourseItemDto[],
): CourseCategoryDto {
	return {
		id: row.id,
		name: row.name,
		sortOrder: row.sortOrder,
		isActive: row.isActive,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		courses,
	};
}

/**
 * Khởi tạo idempotent danh mục khóa học mặc định cho tổ chức (2 nhóm, 7 khóa).
 * Ghi cờ vào `course_catalog_seed` để nếu chủ trung tâm xóa hết danh mục về sau
 * thì các lần đọc kế tiếp sẽ không tự dựng lại dữ liệu mặc định.
 */
export async function ensureDefaultCourseCatalog(
	db: Db,
	orgId: string,
): Promise<void> {
	const [alreadySeeded] = await db
		.select({ orgId: courseCatalogSeed.orgId })
		.from(courseCatalogSeed)
		.where(eq(courseCatalogSeed.orgId, orgId))
		.limit(1);
	if (alreadySeeded) return;

	const [existingCategory] = await db
		.select({ id: courseCategory.id })
		.from(courseCategory)
		.where(eq(courseCategory.orgId, orgId))
		.limit(1);
	if (existingCategory) {
		await db.insert(courseCatalogSeed).values({ orgId }).onConflictDoNothing();
		return;
	}

	const now = new Date();
	const categoryRows = DEFAULT_COURSE_CATALOG.map((cat, index) => ({
		id: `${orgId}:cat:${cat.slug}`,
		orgId,
		name: cat.name,
		sortOrder: index,
		isActive: true,
		createdAt: now,
		updatedAt: now,
	}));
	const courseRows = DEFAULT_COURSE_CATALOG.flatMap((cat) => {
		const categoryId = `${orgId}:cat:${cat.slug}`;
		return cat.courses.map((item, idx) => ({
			id: `${orgId}:course:${item.slug}`,
			orgId,
			categoryId,
			name: item.name,
			sortOrder: idx,
			isActive: true,
			createdAt: now,
			updatedAt: now,
		}));
	});

	// Chèn cờ seed + 2 nhóm + 7 khóa trong CÙNG một batch nguyên tử:
	// - Request thắng khóa ghi sẽ commit trọn bộ dữ liệu rồi mới nhả khóa.
	// - Request đồng thời đến sau đụng UNIQUE trên `course_catalog_seed.org_id`,
	//   rollback sạch và thấy đầy đủ 7 khóa đã commit ngay lập tức.
	try {
		if (categoryRows.length > 0 && courseRows.length > 0) {
			await db.batch([
				db.insert(courseCatalogSeed).values({ orgId }),
				db.insert(courseCategory).values(categoryRows).onConflictDoNothing(),
				db.insert(course).values(courseRows).onConflictDoNothing(),
			]);
		} else if (categoryRows.length > 0) {
			await db.batch([
				db.insert(courseCatalogSeed).values({ orgId }),
				db.insert(courseCategory).values(categoryRows).onConflictDoNothing(),
			]);
		} else {
			await db
				.insert(courseCatalogSeed)
				.values({ orgId })
				.onConflictDoNothing();
		}
	} catch (err: unknown) {
		if (!isSqliteUniqueError(err)) {
			throw err;
		}
	}
}

/**
 * Duyệt chuỗi `err` và `err.cause` (tối đa 5 tầng) để bắt mã/thông điệp lỗi
 * SQLite kể cả khi `drizzle-orm` bọc trong `DrizzleQueryError`.
 */
function matchesSqliteErrorChain(err: unknown, pattern: RegExp): boolean {
	let current: unknown = err;
	for (let depth = 0; depth < 5 && current != null; depth += 1) {
		if (current instanceof Error) {
			if (pattern.test(current.message)) return true;
			const code = (current as { code?: unknown }).code;
			if (typeof code === "string" && pattern.test(code)) return true;
			current = current.cause;
			continue;
		}
		if (typeof current === "object") {
			const record = current as {
				message?: unknown;
				code?: unknown;
				cause?: unknown;
			};
			if (typeof record.message === "string" && pattern.test(record.message)) {
				return true;
			}
			if (typeof record.code === "string" && pattern.test(record.code)) {
				return true;
			}
			current = record.cause;
			continue;
		}
		return pattern.test(String(current));
	}
	return false;
}

export function isSqliteUniqueError(err: unknown): boolean {
	return matchesSqliteErrorChain(err, /UNIQUE|PRIMARY KEY/i);
}

export function isSqliteForeignKeyError(err: unknown): boolean {
	return matchesSqliteErrorChain(err, /FOREIGN KEY/i);
}

export async function loadCourseCatalog(
	db: Db,
	orgId: string,
	opts?: { activeOnly?: boolean },
): Promise<CourseCategoryDto[]> {
	await ensureDefaultCourseCatalog(db, orgId);

	const [categories, courses] = await Promise.all([
		db
			.select()
			.from(courseCategory)
			.where(eq(courseCategory.orgId, orgId))
			.orderBy(
				asc(courseCategory.sortOrder),
				asc(courseCategory.createdAt),
				asc(courseCategory.id),
			),
		db
			.select()
			.from(course)
			.where(eq(course.orgId, orgId))
			.orderBy(asc(course.sortOrder), asc(course.createdAt), asc(course.id)),
	]);

	const coursesByCategory = new Map<string, CourseItemDto[]>();
	for (const row of courses) {
		if (opts?.activeOnly && !row.isActive) continue;
		const list = coursesByCategory.get(row.categoryId);
		const dto = toCourseItemDto(row);
		if (list) {
			list.push(dto);
		} else {
			coursesByCategory.set(row.categoryId, [dto]);
		}
	}

	const result: CourseCategoryDto[] = [];
	for (const cat of categories) {
		if (opts?.activeOnly && !cat.isActive) continue;
		const items = coursesByCategory.get(cat.id) ?? [];
		if (opts?.activeOnly && items.length === 0) continue;
		result.push(toCourseCategoryDto(cat, items));
	}
	return result;
}

export type ResolveCourseForGradingResult =
	| {
			ok: true;
			courseId: string;
			categoryName: string;
			courseName: string;
			displayName: string;
	  }
	| {
			ok: false;
			status: 422;
			code: "COURSE_NOT_FOUND" | "COURSE_INACTIVE";
			message: string;
	  };

export async function resolveCourseForGrading(
	db: Db,
	orgId: string,
	courseId: string,
	existingFinalCourseId?: string | null,
): Promise<ResolveCourseForGradingResult> {
	await ensureDefaultCourseCatalog(db, orgId);

	const [row] = await db
		.select({
			courseId: course.id,
			courseName: course.name,
			courseIsActive: course.isActive,
			categoryName: courseCategory.name,
			categoryIsActive: courseCategory.isActive,
		})
		.from(course)
		.innerJoin(
			courseCategory,
			and(
				eq(courseCategory.id, course.categoryId),
				eq(courseCategory.orgId, orgId),
			),
		)
		.where(and(eq(course.id, courseId), eq(course.orgId, orgId)))
		.limit(1);

	if (!row) {
		return {
			ok: false,
			status: 422,
			code: "COURSE_NOT_FOUND",
			message: "Khóa học đề xuất không tồn tại.",
		};
	}

	if (
		(!row.courseIsActive || !row.categoryIsActive) &&
		existingFinalCourseId !== row.courseId
	) {
		return {
			ok: false,
			status: 422,
			code: "COURSE_INACTIVE",
			message:
				"Khóa học đề xuất đang bị ẩn. Vui lòng chọn khóa đang hoạt động.",
		};
	}

	return {
		ok: true,
		courseId: row.courseId,
		categoryName: row.categoryName,
		courseName: row.courseName,
		displayName: formatCourseDisplayName(row.categoryName, row.courseName),
	};
}
