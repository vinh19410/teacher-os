import { z } from "zod";

/**
 * Contract dùng chung cho danh mục khóa học master data 2 cấp
 * (Nhóm khóa học → Khóa học) theo tổ chức (`orgId`).
 */

export const COURSE_CATEGORY_NAME_MAX = 80;
export const COURSE_NAME_MAX = 120;
export const COURSE_ID_MAX = 128;

export interface DefaultCourseSeedItem {
	readonly slug: string;
	readonly name: string;
}

export interface DefaultCourseSeedCategory {
	readonly slug: string;
	readonly name: string;
	readonly courses: readonly DefaultCourseSeedItem[];
}

export const DEFAULT_COURSE_CATALOG: readonly DefaultCourseSeedCategory[] = [
	{
		slug: "giao-tiep",
		name: "Giao Tiếp",
		courses: [
			{ slug: "comm-level-1", name: "Communication English Level 1" },
			{ slug: "comm-level-2", name: "Communication English Level 2" },
			{ slug: "comm-level-3", name: "Communication English Level 3" },
		],
	},
	{
		slug: "ielts",
		name: "IELTS",
		courses: [
			{ slug: "ielts-foundation", name: "Foundation" },
			{ slug: "ielts-first-step", name: "First Step" },
			{ slug: "ielts-pre", name: "Pre IELTS" },
			{ slug: "ielts-advanced", name: "Advanced" },
		],
	},
] as const;

export const COURSE_ERROR_CODES = [
	"COURSE_FORBIDDEN",
	"COURSE_CATEGORY_NOT_FOUND",
	"COURSE_CATEGORY_DUPLICATE",
	"COURSE_CATEGORY_NOT_EMPTY",
	"COURSE_NOT_FOUND",
	"COURSE_DUPLICATE",
	"COURSE_INACTIVE",
] as const;
export type CourseErrorCode = (typeof COURSE_ERROR_CODES)[number];

/** Chuẩn hóa tên khóa hiển thị snapshot lưu trên bài chấm đầu vào và Lead. */
export function formatCourseDisplayName(
	categoryName: string,
	courseName: string,
): string {
	const cat = categoryName.trim();
	const course = courseName.trim();
	if (!cat) return course;
	if (!course) return cat;
	return `${cat} - ${course}`;
}

export function normalizeCourseNameKey(raw: string): string {
	return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

export interface CourseItemDto {
	id: string;
	categoryId: string;
	name: string;
	sortOrder: number;
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface CourseCategoryDto {
	id: string;
	name: string;
	sortOrder: number;
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
	courses: CourseItemDto[];
}

export interface CourseCatalogResponse {
	categories: CourseCategoryDto[];
}

export const courseCategoryCreateSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1, "Tên nhóm khóa học không được để trống.")
			.max(
				COURSE_CATEGORY_NAME_MAX,
				`Tên nhóm khóa học tối đa ${COURSE_CATEGORY_NAME_MAX} ký tự.`,
			),
	})
	.strict();
export type CourseCategoryCreateInput = z.infer<
	typeof courseCategoryCreateSchema
>;

export const courseCategoryUpdateSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1, "Tên nhóm khóa học không được để trống.")
			.max(
				COURSE_CATEGORY_NAME_MAX,
				`Tên nhóm khóa học tối đa ${COURSE_CATEGORY_NAME_MAX} ký tự.`,
			)
			.optional(),
		isActive: z.boolean().optional(),
	})
	.strict()
	.refine((val) => val.name !== undefined || val.isActive !== undefined, {
		message: "Cần ít nhất một trường cần cập nhật.",
	});
export type CourseCategoryUpdateInput = z.infer<
	typeof courseCategoryUpdateSchema
>;

export const courseCategoryReorderSchema = z
	.object({
		orderedIds: z
			.array(z.string().trim().min(1).max(COURSE_ID_MAX))
			.min(1, "Danh sách sắp xếp không được rỗng."),
	})
	.strict();
export type CourseCategoryReorderInput = z.infer<
	typeof courseCategoryReorderSchema
>;

export const courseCreateSchema = z
	.object({
		categoryId: z
			.string()
			.trim()
			.min(1, "Vui lòng chọn nhóm khóa học.")
			.max(COURSE_ID_MAX),
		name: z
			.string()
			.trim()
			.min(1, "Tên khóa học không được để trống.")
			.max(COURSE_NAME_MAX, `Tên khóa học tối đa ${COURSE_NAME_MAX} ký tự.`),
	})
	.strict();
export type CourseCreateInput = z.infer<typeof courseCreateSchema>;

export const courseUpdateSchema = z
	.object({
		categoryId: z
			.string()
			.trim()
			.min(1, "Vui lòng chọn nhóm khóa học.")
			.max(COURSE_ID_MAX)
			.optional(),
		name: z
			.string()
			.trim()
			.min(1, "Tên khóa học không được để trống.")
			.max(COURSE_NAME_MAX, `Tên khóa học tối đa ${COURSE_NAME_MAX} ký tự.`)
			.optional(),
		isActive: z.boolean().optional(),
	})
	.strict()
	.refine(
		(val) =>
			val.categoryId !== undefined ||
			val.name !== undefined ||
			val.isActive !== undefined,
		{
			message: "Cần ít nhất một trường cần cập nhật.",
		},
	);
export type CourseUpdateInput = z.infer<typeof courseUpdateSchema>;

export const courseReorderSchema = z
	.object({
		categoryId: z
			.string()
			.trim()
			.min(1, "Vui lòng chọn nhóm khóa học.")
			.max(COURSE_ID_MAX),
		orderedIds: z
			.array(z.string().trim().min(1).max(COURSE_ID_MAX))
			.min(1, "Danh sách sắp xếp không được rỗng."),
	})
	.strict();
export type CourseReorderInput = z.infer<typeof courseReorderSchema>;
