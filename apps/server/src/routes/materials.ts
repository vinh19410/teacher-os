import { sanitizeMediaFileName } from "@teacher-os/api/lib/quiz-media";
import {
	checkMaterialUpload,
	isMaterialKind,
	type LessonMaterialView,
	lessonMaterialAttachSchema,
	MATERIAL_FOLDER_MAX_DEPTH,
	MATERIAL_ROOT_FOLDER,
	MATERIAL_SEARCH_MAX,
	type MaterialErrorCode,
	type MaterialFolderView,
	type MaterialKind,
	type MaterialView,
	materialFolderCreateSchema,
	materialFolderUpdateSchema,
	materialLinkCreateSchema,
	materialUpdateSchema,
} from "@teacher-os/api/material-contracts";
import { parseStartDateStrict } from "@teacher-os/api/skeleton";
import { canReadMaterials, canWriteMaterials } from "@teacher-os/auth/role";
import { classTable } from "@teacher-os/db/schema/class";
import { classSession } from "@teacher-os/db/schema/class-session";
import { lesson } from "@teacher-os/db/schema/lesson";
import {
	lessonMaterial,
	material,
	materialFolder,
	syllabusLessonMaterial,
} from "@teacher-os/db/schema/material";
import { holidaySessionShift } from "@teacher-os/db/schema/organization-holiday";
import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { z } from "zod";
import type { Db, KernelCtx } from "../app";
import { materialFileResponse } from "../lib/material-file-response";
import { MediaSizeMismatchError, type MediaStore } from "../lib/media-store";
import { resolveCurriculumMaterials } from "../lib/session-curriculum-materials";

type Env = { Variables: { kernelCtx: KernelCtx } };
type MaterialContext = Context<Env>;
type MaterialRow = typeof material.$inferSelect;
type FolderRow = typeof materialFolder.$inferSelect;

export interface MaterialRouteDeps {
	getDb(): Db;
	/** Xem `AppDeps.getMaterialsStore` — vắng mặt → route file trả 503. */
	getMaterialsStore?(): MediaStore | undefined;
	/** Xem `AppDeps.runInBackground`. */
	runInBackground?(promise: Promise<unknown>): void;
}

type ErrorStatus = 400 | 404 | 409 | 413 | 415 | 500 | 503;

function materialError(
	c: MaterialContext,
	status: ErrorStatus,
	code: MaterialErrorCode,
	extra: Record<string, unknown> = {},
): Response {
	return c.json({ error: code, code, ...extra }, status);
}

/** Số buổi đang gắn tài liệu — cột tính, dùng chung cho list/detail. */
const usageCountColumn = sql<number>`(select count(*) from ${lessonMaterial} where ${lessonMaterial.materialId} = ${material.id})`;

export function toMaterialView(
	row: MaterialRow,
	usageCount: number,
): MaterialView {
	return {
		id: row.id,
		folderId: row.folderId,
		title: row.title,
		description: row.description,
		kind: (isMaterialKind(row.kind) ? row.kind : "file") as MaterialKind,
		url: row.url,
		mimeType: row.mimeType,
		sizeBytes: row.sizeBytes,
		originalName: row.originalName,
		usageCount: Number(usageCount),
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function toFolderView(row: FolderRow): MaterialFolderView {
	return {
		id: row.id,
		parentId: row.parentId,
		name: row.name,
		createdAt: row.createdAt.toISOString(),
	};
}

/** Cấp của thư mục (gốc = 1). Dữ liệu hỏng có vòng → coi như quá sâu. */
function folderDepth(byId: Map<string, FolderRow>, id: string): number {
	let depth = 0;
	let current: string | null = id;
	const seen = new Set<string>();
	while (current !== null) {
		if (seen.has(current)) return Number.POSITIVE_INFINITY;
		seen.add(current);
		const row = byId.get(current);
		if (!row) break;
		depth += 1;
		current = row.parentId;
	}
	return depth;
}

/** Id của thư mục và mọi thư mục con cháu, kèm chiều cao cây con (lá = 1). */
function subtree(
	folders: FolderRow[],
	rootId: string,
): { ids: Set<string>; height: number } {
	const children = new Map<string, string[]>();
	for (const f of folders) {
		if (f.parentId === null) continue;
		const list = children.get(f.parentId) ?? [];
		list.push(f.id);
		children.set(f.parentId, list);
	}
	const ids = new Set<string>();
	let height = 0;
	const walk = (id: string, level: number) => {
		if (ids.has(id)) return;
		ids.add(id);
		height = Math.max(height, level);
		for (const child of children.get(id) ?? []) walk(child, level + 1);
	};
	walk(rootId, 1);
	return { ids, height };
}

/**
 * Ngân hàng tài liệu của org + tài liệu theo buổi học, mount trong kernel
 * (`/api`). Đọc: `canReadMaterials` (gồm trợ giảng `ta`); ghi:
 * `canWriteMaterials` (#646 — tách riêng khỏi quyền chấm bài). Mọi truy vấn lọc theo
 * `orgId` của phiên — id của org khác trả 404.
 *
 * File tải lên là raw body (PUT, header Content-Type/Content-Length/
 * X-File-Name) stream thẳng vào kho với key `<orgId>/<materialId>`; ghi DB
 * lỗi thì dọn object vừa ghi. Xoá tài liệu: xoá row trước (FK chặn khi còn
 * buổi tham chiếu), xoá object sau — object lỗi xoá chỉ để lại file mồ côi
 * trong bucket private, không bao giờ để row trỏ object đã mất.
 */
export function materialRoutes(deps: MaterialRouteDeps) {
	const routes = new Hono<Env>();

	const inBackground = (label: string, fn: () => Promise<unknown>) => {
		const task = fn().catch((error) => {
			console.error(`[materials] ${label} failed`, { error });
		});
		deps.runInBackground?.(task);
	};

	const gate = async (c: MaterialContext, next: () => Promise<void>) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		const isRead = c.req.method === "GET" || c.req.method === "HEAD";
		const allowed = isRead
			? canReadMaterials(ctx.role)
			: canWriteMaterials(ctx.role);
		if (!allowed) return c.json({ error: "forbidden", code: "FORBIDDEN" }, 403);
		return next();
	};
	routes.use("/materials", gate);
	routes.use("/materials/*", gate);
	routes.use("/classes/:classId/sessions/:date/materials", gate);
	routes.use("/classes/:classId/sessions/:date/materials/*", gate);

	async function readBody<S extends z.ZodType>(
		c: MaterialContext,
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

	async function loadFolders(db: Db, orgId: string): Promise<FolderRow[]> {
		return db
			.select()
			.from(materialFolder)
			.where(eq(materialFolder.orgId, orgId))
			.orderBy(asc(materialFolder.name), asc(materialFolder.id));
	}

	async function folderExists(
		db: Db,
		orgId: string,
		id: string,
	): Promise<boolean> {
		const [row] = await db
			.select({ id: materialFolder.id })
			.from(materialFolder)
			.where(and(eq(materialFolder.id, id), eq(materialFolder.orgId, orgId)))
			.limit(1);
		return row !== undefined;
	}

	async function nameTaken(
		db: Db,
		orgId: string,
		parentId: string | null,
		name: string,
		exceptId?: string,
	): Promise<boolean> {
		const [row] = await db
			.select({ id: materialFolder.id })
			.from(materialFolder)
			.where(
				and(
					eq(materialFolder.orgId, orgId),
					parentId === null
						? isNull(materialFolder.parentId)
						: eq(materialFolder.parentId, parentId),
					eq(materialFolder.name, name),
					exceptId === undefined ? undefined : ne(materialFolder.id, exceptId),
				),
			)
			.limit(1);
		return row !== undefined;
	}

	async function loadMaterial(
		db: Db,
		orgId: string,
		id: string,
	): Promise<{ row: MaterialRow; usageCount: number } | null> {
		const [found] = await db
			.select({ row: material, usageCount: usageCountColumn })
			.from(material)
			.where(and(eq(material.id, id), eq(material.orgId, orgId)))
			.limit(1);
		return found
			? { row: found.row, usageCount: Number(found.usageCount) }
			: null;
	}

	/**
	 * Mức sử dụng của tài liệu trên CẢ hai bảng link (#655): `lesson_material`
	 * (buổi học thật) + `syllabus_lesson_material` (bài học giáo trình). Lỗi
	 * 409 xoá tài liệu đang dùng nêu cả hai số.
	 */
	async function materialUsage(
		db: Db,
		materialId: string,
	): Promise<{ sessionCount: number; syllabusCount: number }> {
		const [sessionRow] = await db
			.select({ n: sql<number>`count(*)` })
			.from(lessonMaterial)
			.where(eq(lessonMaterial.materialId, materialId));
		const [syllabusRow] = await db
			.select({ n: sql<number>`count(*)` })
			.from(syllabusLessonMaterial)
			.where(eq(syllabusLessonMaterial.materialId, materialId));
		return {
			sessionCount: Number(sessionRow?.n ?? 0),
			syllabusCount: Number(syllabusRow?.n ?? 0),
		};
	}

	/** `folderId` từ body/query: phải thuộc org. */
	async function checkFolder(
		c: MaterialContext,
		db: Db,
		orgId: string,
		folderId: string | null,
	): Promise<Response | null> {
		if (folderId === null) return null;
		if (!(await folderExists(db, orgId, folderId))) {
			return materialError(c, 404, "FOLDER_NOT_FOUND");
		}
		return null;
	}

	/**
	 * Đọc + kiểm header upload rồi stream body vào kho. Thành công trả các
	 * cột file của row `material` (chưa ghi DB) và `discard` để dọn object
	 * khi bước ghi DB sau đó lỗi.
	 */
	async function storeUpload(
		c: MaterialContext,
		store: MediaStore,
		orgId: string,
	): Promise<
		| {
				ok: true;
				values: Pick<
					MaterialRow,
					| "id"
					| "kind"
					| "objectKey"
					| "mimeType"
					| "sizeBytes"
					| "originalName"
					| "title"
				>;
				discard: () => void;
		  }
		| { ok: false; response: Response }
	> {
		const lengthHeader = c.req.header("Content-Length");
		const size =
			lengthHeader !== undefined && /^\d+$/.test(lengthHeader)
				? Number(lengthHeader)
				: Number.NaN;
		const check = checkMaterialUpload({
			mimeType: c.req.header("Content-Type") ?? "",
			size,
		});
		if (!check.ok) {
			if (check.reason === "type") {
				return {
					ok: false,
					response: materialError(c, 415, "UNSUPPORTED_FILE_TYPE"),
				};
			}
			if (check.reason === "size") {
				return {
					ok: false,
					response: materialError(c, 413, "FILE_TOO_LARGE", {
						maxBytes: check.maxBytes,
					}),
				};
			}
			return { ok: false, response: materialError(c, 400, "INVALID_FILE") };
		}
		let name: string | null = null;
		try {
			name = sanitizeMediaFileName(
				decodeURIComponent(c.req.header("X-File-Name") ?? ""),
			);
		} catch {
			name = null;
		}
		const body = c.req.raw.body;
		if (!name || body === null) {
			return { ok: false, response: materialError(c, 400, "INVALID_FILE") };
		}

		const id = crypto.randomUUID();
		const objectKey = `${orgId}/${id}`;
		const discard = () =>
			inBackground("discard material object", () => store.delete(objectKey));
		try {
			await store.put(objectKey, body, { contentType: check.mimeType, size });
		} catch (error) {
			discard();
			if (error instanceof MediaSizeMismatchError) {
				return { ok: false, response: materialError(c, 400, "INVALID_FILE") };
			}
			console.error("[materials] upload failed", { error });
			return { ok: false, response: c.json({ error: "upload failed" }, 500) };
		}
		return {
			ok: true,
			values: {
				id,
				kind: check.kind,
				objectKey,
				mimeType: check.mimeType,
				sizeBytes: size,
				originalName: name,
				title: name,
			},
			discard,
		};
	}

	/** #645: buổi `holiday` là cả-bucket đều holiday (khớp `allHoliday` của web
	 * `class-sessions.ts`) — ngày trộn holiday + non-holiday vẫn thao tác được.
	 * Buổi manual `class_session` (mà #658 coi là buổi thật cho các route này)
	 * cũng là non-holiday presence: ngày có lesson holiday + buổi manual vẫn
	 * attach/upload/detach qua buổi manual được. Mồ côi trên ngày KHÔNG còn
	 * session nào không bị chặn (bucket rỗng). */
	async function isHolidayBucket(
		db: Db,
		orgId: string,
		classId: string,
		date: string,
	): Promise<boolean> {
		const [bucket] = await db
			.select({
				holidayCount: sql<number>`count(*) filter (where ${lesson.status} = 'holiday')`,
				otherCount: sql<number>`count(*) filter (where ${lesson.status} != 'holiday')`,
			})
			.from(lesson)
			.where(
				and(
					eq(lesson.orgId, orgId),
					eq(lesson.classId, classId),
					eq(lesson.date, date),
				),
			);
		if (!bucket) return false;
		if (bucket.holidayCount === 0 || bucket.otherCount > 0) return false;
		// #658: class_session (buổi manual) tại cùng ngày chặn việc coi bucket
		// là all-holiday — tài liệu vẫn thao tác được qua buổi manual.
		const [cs] = await db
			.select({ id: classSession.id })
			.from(classSession)
			.where(
				and(
					eq(classSession.orgId, orgId),
					eq(classSession.classId, classId),
					eq(classSession.date, date),
				),
			)
			.limit(1);
		return !cs;
	}

	/** #662: bucket đã-shift còn có buổi manual — all-holiday + `class_session`
	 * cùng ngày + shift row (`original_date` = ngày đó). Attach/upload vào đây
	 * là tạo mồ côi: buổi thật duy nhất của ngày nằm ở `makeup_date`. Chỉ áp
	 * cho attach/upload — KHÔNG thay `isHolidayBucket` dùng chung (detach phải
	 * gỡ được legacy path-2; `resolveSession` phục vụ cả detach). Bucket-
	 * semantics giờ ở 6 bề mặt: hàm này, `isHolidayBucket` ngay trên,
	 * `holidayBucketDateGuard` (2 call site), nhánh `rejectHoliday` của
	 * `resolveSession`, và web twin `isHolidayBucket`
	 * (`apps/web/src/lib/class-sessions.ts`) — drift giữa các bề mặt là bug
	 * lặng; đổi một cái phải đối chiếu cả 6. */
	async function isShiftedHolidayBucket(
		db: Db,
		orgId: string,
		classId: string,
		date: string,
	): Promise<boolean> {
		const [bucket] = await db
			.select({
				holidayCount: sql<number>`count(*) filter (where ${lesson.status} = 'holiday')`,
				otherCount: sql<number>`count(*) filter (where ${lesson.status} != 'holiday')`,
			})
			.from(lesson)
			.where(
				and(
					eq(lesson.orgId, orgId),
					eq(lesson.classId, classId),
					eq(lesson.date, date),
				),
			);
		if (!bucket || bucket.holidayCount === 0 || bucket.otherCount > 0) {
			return false;
		}
		const [cs] = await db
			.select({ id: classSession.id })
			.from(classSession)
			.where(
				and(
					eq(classSession.orgId, orgId),
					eq(classSession.classId, classId),
					eq(classSession.date, date),
				),
			)
			.limit(1);
		// All-holiday thuần (không class_session) → `isHolidayBucket` đã chặn.
		if (!cs) return false;
		const [shift] = await db
			.select({ id: holidaySessionShift.id })
			.from(holidaySessionShift)
			.where(
				and(
					eq(holidaySessionShift.orgId, orgId),
					eq(holidaySessionShift.classId, classId),
					eq(holidaySessionShift.originalDate, date),
				),
			)
			.limit(1);
		return Boolean(shift);
	}

	/** #645 (+ #662): biểu thức guard CASE dùng chung cho POST attach + PUT
	 * upload — biến `date` thành NULL khi bucket đã all-holiday (race apply
	 * shift chen ngang sau resolveSession) HOẶC bucket đã-shift còn buổi
	 * manual (#662: all-holiday + class_session + shift row — race activation
	 * chen ngang sau resolveSession) để NOT NULL violation fail
	 * statement/batch. Bucket-semantics giống `isHolidayBucket` (kể cả #658
	 * class_session) cộng nhánh #662 — drift với `isShiftedHolidayBucket` là
	 * bug lặng. */
	function holidayBucketDateGuard(
		orgId: string,
		classId: string,
		date: string,
	) {
		return sql`CASE WHEN (EXISTS (SELECT 1 FROM ${lesson} WHERE ${lesson.orgId} = ${orgId} AND ${lesson.classId} = ${classId} AND ${lesson.date} = ${date} AND ${lesson.status} = 'holiday') AND NOT EXISTS (SELECT 1 FROM ${lesson} WHERE ${lesson.orgId} = ${orgId} AND ${lesson.classId} = ${classId} AND ${lesson.date} = ${date} AND ${lesson.status} != 'holiday') AND NOT EXISTS (SELECT 1 FROM ${classSession} WHERE ${classSession.orgId} = ${orgId} AND ${classSession.classId} = ${classId} AND ${classSession.date} = ${date})) OR (EXISTS (SELECT 1 FROM ${lesson} WHERE ${lesson.orgId} = ${orgId} AND ${lesson.classId} = ${classId} AND ${lesson.date} = ${date} AND ${lesson.status} = 'holiday') AND NOT EXISTS (SELECT 1 FROM ${lesson} WHERE ${lesson.orgId} = ${orgId} AND ${lesson.classId} = ${classId} AND ${lesson.date} = ${date} AND ${lesson.status} != 'holiday') AND EXISTS (SELECT 1 FROM ${classSession} WHERE ${classSession.orgId} = ${orgId} AND ${classSession.classId} = ${classId} AND ${classSession.date} = ${date}) AND EXISTS (SELECT 1 FROM ${holidaySessionShift} WHERE ${holidaySessionShift.orgId} = ${orgId} AND ${holidaySessionShift.classId} = ${classId} AND ${holidaySessionShift.originalDate} = ${date})) THEN NULL ELSE ${date} END`;
	}

	/** Lớp thuộc org + ngày là một buổi có thật (có dòng `lesson` hoặc `class_session` — #658: buổi manual lớp 0 học viên chỉ có `class_session`). */
	async function resolveSession(
		c: MaterialContext,
		db: Db,
		orgId: string,
		options: { requireLesson?: boolean; rejectHoliday?: boolean } = {},
	): Promise<
		| { ok: true; classId: string; date: string }
		| { ok: false; response: Response }
	> {
		const classId = c.req.param("classId") ?? "";
		const date = parseStartDateStrict(c.req.param("date") ?? "");
		if (!date)
			return { ok: false, response: c.json({ error: "invalid date" }, 400) };
		const [cls] = await db
			.select({ id: classTable.id })
			.from(classTable)
			.where(and(eq(classTable.id, classId), eq(classTable.orgId, orgId)))
			.limit(1);
		if (!cls)
			return { ok: false, response: materialError(c, 404, "CLASS_NOT_FOUND") };
		// #645: chặn mutating vào buổi holiday CHỈ khi route yêu cầu — GET list
		// không chặn để modal đang mở trên buổi vừa bị apply shift vẫn render.
		if (
			options.rejectHoliday === true &&
			(await isHolidayBucket(db, orgId, classId, date))
		) {
			return { ok: false, response: materialError(c, 409, "SESSION_HOLIDAY") };
		}
		if (options.requireLesson === false) return { ok: true, classId, date };
		const [session] = await db
			.select({ id: lesson.id })
			.from(lesson)
			.where(
				and(
					eq(lesson.orgId, orgId),
					eq(lesson.classId, classId),
					eq(lesson.date, date),
				),
			)
			.limit(1);
		if (session) return { ok: true, classId, date };
		// #658: buổi manual của lớp chưa có học viên active chỉ có dòng
		// class_session (kernel không insert lesson khi 0 enrollment).
		const [csSession] = await db
			.select({ id: classSession.id })
			.from(classSession)
			.where(
				and(
					eq(classSession.orgId, orgId),
					eq(classSession.classId, classId),
					eq(classSession.date, date),
				),
			)
			.limit(1);
		if (!csSession)
			return {
				ok: false,
				response: materialError(c, 404, "SESSION_NOT_FOUND"),
			};
		return { ok: true, classId, date };
	}

	async function loadSessionMaterials(
		db: Db,
		orgId: string,
		classId: string,
		date: string,
	): Promise<LessonMaterialView[]> {
		const rows = await db
			.select({
				row: material,
				usageCount: usageCountColumn,
				position: lessonMaterial.position,
				attachedAt: lessonMaterial.createdAt,
			})
			.from(lessonMaterial)
			.innerJoin(
				material,
				and(
					eq(material.id, lessonMaterial.materialId),
					eq(material.orgId, orgId),
				),
			)
			.where(
				and(
					eq(lessonMaterial.orgId, orgId),
					eq(lessonMaterial.classId, classId),
					eq(lessonMaterial.date, date),
				),
			)
			.orderBy(
				asc(lessonMaterial.position),
				asc(lessonMaterial.createdAt),
				asc(material.id),
			);
		return rows.map((r) => ({
			...toMaterialView(r.row, r.usageCount),
			position: r.position,
			attachedAt: r.attachedAt.toISOString(),
		}));
	}

	/** Vị trí kế tiếp trong buổi — tính trong chính câu INSERT. */
	const nextPosition = (classId: string, date: string) =>
		sql<number>`(select coalesce(max(${lessonMaterial.position}), -1) + 1 from ${lessonMaterial} where ${lessonMaterial.classId} = ${classId} and ${lessonMaterial.date} = ${date})`;

	// ---- Thư mục ----

	type RawInsertedFolder = {
		id: string;
		org_id: string;
		parent_id: string | null;
		name: string;
		created_at: number | Date;
	};

	/**
	 * #646: Guard SQL nguyên tử cho thao tác di chuyển thư mục sang cha khác gốc.
	 * Kiểm ngay tại thời điểm UPDATE: `nextParent` và `id` cùng thuộc `orgId`,
	 * `id` không nằm trong chuỗi tổ tiên của `nextParent` (không tạo vòng),
	 * tổ tiên không dính chu trình cũ, và tổng độ sâu sau khi chuyển <= 5.
	 * CTE `sub` loại cạnh quay về chính `id` (`c.id != id`) nên vẫn cho phép
	 * di chuyển thư mục đang kẹt vòng lịch sử sang cha hợp lệ để tự phục hồi.
	 */
	function folderMoveGuard(orgId: string, id: string, nextParent: string) {
		return sql`(
			WITH RECURSIVE
				anc(id, parent_id, depth) AS (
					SELECT id, parent_id, 1
					FROM ${materialFolder}
					WHERE id = ${nextParent} AND org_id = ${orgId}
					UNION ALL
					SELECT p.id, p.parent_id, anc.depth + 1
					FROM ${materialFolder} p
					JOIN anc ON p.id = anc.parent_id
					WHERE p.org_id = ${orgId} AND anc.depth <= ${MATERIAL_FOLDER_MAX_DEPTH}
				),
				sub(id, level) AS (
					SELECT id, 1
					FROM ${materialFolder}
					WHERE id = ${id} AND org_id = ${orgId}
					UNION ALL
					SELECT c.id, sub.level + 1
					FROM ${materialFolder} c
					JOIN sub ON c.parent_id = sub.id
					WHERE c.org_id = ${orgId} AND c.id != ${id} AND sub.level <= ${MATERIAL_FOLDER_MAX_DEPTH}
				)
			SELECT CASE
				WHEN EXISTS (SELECT 1 FROM anc)
					AND EXISTS (SELECT 1 FROM sub)
					AND NOT EXISTS (SELECT 1 FROM anc WHERE anc.id = ${id})
					AND (SELECT max(depth) FROM anc) <= ${MATERIAL_FOLDER_MAX_DEPTH}
					AND (SELECT max(depth) FROM anc) + (SELECT max(level) FROM sub) <= ${MATERIAL_FOLDER_MAX_DEPTH}
				THEN 1
				ELSE 0
			END
		) = 1`;
	}

	/** #646: Chèn thư mục con nguyên tử — chặn cha bị xóa/chéo org/dính vòng/quá cấp 5 ngay trong INSERT. */
	async function insertChildFolder(
		db: Db,
		orgId: string,
		id: string,
		parentId: string,
		name: string,
	): Promise<FolderRow | null> {
		// Driver D1/libsql trả raw snake_case cho db.all(sql`...`) (xem ingest-transaction.ts).
		const rawRows = (await db.all(sql`
			INSERT INTO ${materialFolder} (id, org_id, parent_id, name)
			SELECT ${id}, ${orgId}, ${parentId}, ${name}
			WHERE (
				WITH RECURSIVE anc(id, parent_id, depth) AS (
					SELECT id, parent_id, 1
					FROM ${materialFolder}
					WHERE id = ${parentId} AND org_id = ${orgId}
					UNION ALL
					SELECT p.id, p.parent_id, anc.depth + 1
					FROM ${materialFolder} p
					JOIN anc ON p.id = anc.parent_id
					WHERE p.org_id = ${orgId} AND anc.depth <= ${MATERIAL_FOLDER_MAX_DEPTH}
				)
				SELECT CASE
					WHEN EXISTS (SELECT 1 FROM anc)
						AND (SELECT max(depth) FROM anc) + 1 <= ${MATERIAL_FOLDER_MAX_DEPTH}
					THEN 1
					ELSE 0
				END
			) = 1
			RETURNING id, org_id, parent_id, name, created_at
		`)) as RawInsertedFolder[];
		const raw = rawRows[0];
		if (!raw) return null;
		return {
			id: raw.id,
			orgId: raw.org_id,
			parentId: raw.parent_id,
			name: raw.name,
			createdAt:
				raw.created_at instanceof Date
					? raw.created_at
					: new Date(Number(raw.created_at)),
		};
	}

	function classifyCreateBlock(
		c: MaterialContext,
		reloaded: FolderRow[],
		parentId: string,
	): Response | null {
		const rById = new Map(reloaded.map((f) => [f.id, f]));
		if (!rById.has(parentId)) return materialError(c, 404, "FOLDER_NOT_FOUND");
		const rDepth = folderDepth(rById, parentId);
		if (!Number.isFinite(rDepth)) return materialError(c, 400, "FOLDER_CYCLE");
		if (rDepth + 1 > MATERIAL_FOLDER_MAX_DEPTH) {
			return materialError(c, 400, "FOLDER_TOO_DEEP");
		}
		return null;
	}

	function classifyMoveBlock(
		c: MaterialContext,
		reloaded: FolderRow[],
		id: string,
		targetParent: string,
	): Response | null {
		const rById = new Map(reloaded.map((f) => [f.id, f]));
		if (!rById.has(id) || !rById.has(targetParent)) {
			return materialError(c, 404, "FOLDER_NOT_FOUND");
		}
		const rTree = subtree(reloaded, id);
		const rDepth = folderDepth(rById, targetParent);
		if (rTree.ids.has(targetParent) || !Number.isFinite(rDepth)) {
			return materialError(c, 400, "FOLDER_CYCLE");
		}
		if (rDepth + rTree.height > MATERIAL_FOLDER_MAX_DEPTH) {
			return materialError(c, 400, "FOLDER_TOO_DEEP");
		}
		return null;
	}

	routes.get("/materials/folders", async (c) => {
		const ctx = c.get("kernelCtx");
		const folders = await loadFolders(deps.getDb(), ctx.orgId);
		return c.json({ folders: folders.map(toFolderView) });
	});

	routes.post("/materials/folders", async (c) => {
		const ctx = c.get("kernelCtx");
		const body = await readBody(c, materialFolderCreateSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();
		const { name, parentId } = body.data;
		if (parentId !== null) {
			const earlyBlock = classifyCreateBlock(
				c,
				await loadFolders(db, ctx.orgId),
				parentId,
			);
			if (earlyBlock) return earlyBlock;
		}
		if (await nameTaken(db, ctx.orgId, parentId, name)) {
			return materialError(c, 409, "FOLDER_NAME_TAKEN");
		}
		const id = crypto.randomUUID();
		try {
			if (parentId === null) {
				const [row] = await db
					.insert(materialFolder)
					.values({ id, orgId: ctx.orgId, parentId: null, name })
					.returning();
				if (!row) throw new Error("folder insert returned no row");
				return c.json({ folder: toFolderView(row) }, 201);
			}
			let row = await insertChildFolder(db, ctx.orgId, id, parentId, name);
			if (!row) {
				const firstBlock = classifyCreateBlock(
					c,
					await loadFolders(db, ctx.orgId),
					parentId,
				);
				if (firstBlock) return firstBlock;
				row = await insertChildFolder(db, ctx.orgId, id, parentId, name);
				if (!row) {
					const secondBlock = classifyCreateBlock(
						c,
						await loadFolders(db, ctx.orgId),
						parentId,
					);
					return (
						secondBlock ?? c.json({ error: "concurrent folder conflict" }, 409)
					);
				}
			}
			return c.json({ folder: toFolderView(row) }, 201);
		} catch (error) {
			// Đua với request tạo cùng tên: đọc lại trạng thái thay vì parse lỗi.
			if (await nameTaken(db, ctx.orgId, parentId, name)) {
				return materialError(c, 409, "FOLDER_NAME_TAKEN");
			}
			throw error;
		}
	});

	routes.patch("/materials/folders/:id", async (c) => {
		const ctx = c.get("kernelCtx");
		const body = await readBody(c, materialFolderUpdateSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();
		const id = c.req.param("id");
		const folders = await loadFolders(db, ctx.orgId);
		const byId = new Map(folders.map((f) => [f.id, f]));
		const current = byId.get(id);
		if (!current) return materialError(c, 404, "FOLDER_NOT_FOUND");

		const nameChanged = body.data.name !== undefined;
		const parentChanged = body.data.parentId !== undefined;
		if (!nameChanged && !parentChanged) {
			return c.json({ folder: toFolderView(current) });
		}

		const nextName = body.data.name ?? current.name;
		const nextParent =
			body.data.parentId === undefined ? current.parentId : body.data.parentId;
		if (parentChanged && nextParent !== null) {
			const earlyBlock = classifyMoveBlock(c, folders, id, nextParent);
			if (earlyBlock) return earlyBlock;
		}
		if (await nameTaken(db, ctx.orgId, nextParent, nextName, id)) {
			return materialError(c, 409, "FOLDER_NAME_TAKEN");
		}
		const runUpdate = async () => {
			const [updated] = await db
				.update(materialFolder)
				.set({
					...(body.data.name !== undefined ? { name: body.data.name } : {}),
					...(body.data.parentId !== undefined
						? { parentId: body.data.parentId }
						: {}),
				})
				.where(
					and(
						eq(materialFolder.id, id),
						eq(materialFolder.orgId, ctx.orgId),
						parentChanged && nextParent !== null
							? folderMoveGuard(ctx.orgId, id, nextParent)
							: undefined,
					),
				)
				.returning();
			return updated;
		};
		try {
			let row = await runUpdate();
			if (!row) {
				if (!(parentChanged && nextParent !== null)) {
					return materialError(c, 404, "FOLDER_NOT_FOUND");
				}
				const firstBlock = classifyMoveBlock(
					c,
					await loadFolders(db, ctx.orgId),
					id,
					nextParent,
				);
				if (firstBlock) return firstBlock;
				row = await runUpdate();
				if (!row) {
					const secondBlock = classifyMoveBlock(
						c,
						await loadFolders(db, ctx.orgId),
						id,
						nextParent,
					);
					return (
						secondBlock ?? c.json({ error: "concurrent folder conflict" }, 409)
					);
				}
			}
			return c.json({ folder: toFolderView(row) });
		} catch (error) {
			const [fresh] = await db
				.select()
				.from(materialFolder)
				.where(
					and(eq(materialFolder.id, id), eq(materialFolder.orgId, ctx.orgId)),
				)
				.limit(1);
			if (!fresh) return materialError(c, 404, "FOLDER_NOT_FOUND");
			const collisionParent =
				body.data.parentId !== undefined ? body.data.parentId : fresh.parentId;
			const collisionName =
				body.data.name !== undefined ? body.data.name : fresh.name;
			if (await nameTaken(db, ctx.orgId, collisionParent, collisionName, id)) {
				return materialError(c, 409, "FOLDER_NAME_TAKEN");
			}
			throw error;
		}
	});

	routes.delete("/materials/folders/:id", async (c) => {
		const ctx = c.get("kernelCtx");
		const db = deps.getDb();
		const id = c.req.param("id");
		if (!(await folderExists(db, ctx.orgId, id))) {
			return materialError(c, 404, "FOLDER_NOT_FOUND");
		}
		const isEmpty = async () => {
			const [child] = await db
				.select({ id: materialFolder.id })
				.from(materialFolder)
				.where(eq(materialFolder.parentId, id))
				.limit(1);
			const [item] = await db
				.select({ id: material.id })
				.from(material)
				.where(eq(material.folderId, id))
				.limit(1);
			return child === undefined && item === undefined;
		};
		if (!(await isEmpty())) return materialError(c, 409, "FOLDER_NOT_EMPTY");
		try {
			await db
				.delete(materialFolder)
				.where(
					and(eq(materialFolder.id, id), eq(materialFolder.orgId, ctx.orgId)),
				);
		} catch (error) {
			// FK chặn khi có mục mới chen vào giữa lúc kiểm và lúc xoá.
			if (!(await isEmpty())) return materialError(c, 409, "FOLDER_NOT_EMPTY");
			throw error;
		}
		return c.json({ ok: true });
	});

	// ---- Tài liệu ----

	routes.get("/materials", async (c) => {
		const ctx = c.get("kernelCtx");
		const q = (c.req.query("q") ?? "").trim();
		if (q.length > MATERIAL_SEARCH_MAX)
			return c.json({ error: "invalid q" }, 400);
		const kind = c.req.query("kind");
		if (kind !== undefined && !isMaterialKind(kind)) {
			return c.json({ error: "invalid kind" }, 400);
		}
		const folderId = c.req.query("folderId");
		const rows = await deps
			.getDb()
			.select({ row: material, usageCount: usageCountColumn })
			.from(material)
			.where(
				and(
					eq(material.orgId, ctx.orgId),
					kind === undefined ? undefined : eq(material.kind, kind),
					folderId === undefined || folderId === ""
						? undefined
						: folderId === MATERIAL_ROOT_FOLDER
							? isNull(material.folderId)
							: eq(material.folderId, folderId),
				),
			)
			.orderBy(desc(material.updatedAt), asc(material.id));
		// Lọc ở tầng JS: lower() của SQLite chỉ hạ chữ ASCII nên "Đề" không khớp
		// "đề". Kho tài liệu theo org đủ nhỏ để lọc sau truy vấn.
		const fold = (v: string) => v.normalize("NFC").toLocaleLowerCase("vi");
		const needle = fold(q);
		const matched =
			needle === ""
				? rows
				: rows.filter(({ row }) =>
						[row.title, row.description, row.originalName ?? ""].some((v) =>
							fold(v).includes(needle),
						),
					);
		return c.json({
			items: matched.map((r) => toMaterialView(r.row, r.usageCount)),
		});
	});

	routes.get("/materials/:id", async (c) => {
		const ctx = c.get("kernelCtx");
		const found = await loadMaterial(
			deps.getDb(),
			ctx.orgId,
			c.req.param("id"),
		);
		if (!found) return materialError(c, 404, "MATERIAL_NOT_FOUND");
		return c.json({ material: toMaterialView(found.row, found.usageCount) });
	});

	routes.post("/materials/links", async (c) => {
		const ctx = c.get("kernelCtx");
		const body = await readBody(c, materialLinkCreateSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();
		const folderError = await checkFolder(c, db, ctx.orgId, body.data.folderId);
		if (folderError) return folderError;
		const [row] = await db
			.insert(material)
			.values({
				id: crypto.randomUUID(),
				orgId: ctx.orgId,
				folderId: body.data.folderId,
				title: body.data.title,
				description: body.data.description,
				kind: "link",
				url: body.data.url,
				createdBy: ctx.userId,
			})
			.returning();
		if (!row) throw new Error("material insert returned no row");
		return c.json({ material: toMaterialView(row, 0) }, 201);
	});

	routes.put("/materials/files", async (c) => {
		const ctx = c.get("kernelCtx");
		const store = deps.getMaterialsStore?.();
		if (!store) return materialError(c, 503, "MATERIALS_DISABLED");
		const db = deps.getDb();
		const folderId = c.req.query("folderId") || null;
		const folderError = await checkFolder(c, db, ctx.orgId, folderId);
		if (folderError) return folderError;
		const upload = await storeUpload(c, store, ctx.orgId);
		if (!upload.ok) return upload.response;
		try {
			const [row] = await db
				.insert(material)
				.values({
					...upload.values,
					orgId: ctx.orgId,
					folderId,
					createdBy: ctx.userId,
				})
				.returning();
			if (!row) throw new Error("material insert returned no row");
			return c.json({ material: toMaterialView(row, 0) }, 201);
		} catch (error) {
			upload.discard();
			console.error("[materials] material insert failed", { error });
			// Thư mục bị xoá trong lúc đang stream file → lỗi nghiệp vụ, không phải 500.
			if (folderId !== null && !(await folderExists(db, ctx.orgId, folderId))) {
				return materialError(c, 404, "FOLDER_NOT_FOUND");
			}
			return c.json({ error: "upload failed" }, 500);
		}
	});

	routes.patch("/materials/:id", async (c) => {
		const ctx = c.get("kernelCtx");
		const body = await readBody(c, materialUpdateSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();
		const id = c.req.param("id");
		if (body.data.folderId !== undefined) {
			const folderError = await checkFolder(
				c,
				db,
				ctx.orgId,
				body.data.folderId,
			);
			if (folderError) return folderError;
		}
		const [row] = await db
			.update(material)
			.set({
				...(body.data.title !== undefined ? { title: body.data.title } : {}),
				...(body.data.description !== undefined
					? { description: body.data.description }
					: {}),
				...(body.data.folderId !== undefined
					? { folderId: body.data.folderId }
					: {}),
				updatedAt: new Date(),
			})
			.where(and(eq(material.id, id), eq(material.orgId, ctx.orgId)))
			.returning({ id: material.id });
		if (!row) return materialError(c, 404, "MATERIAL_NOT_FOUND");
		const found = await loadMaterial(db, ctx.orgId, id);
		if (!found) return materialError(c, 404, "MATERIAL_NOT_FOUND");
		return c.json({ material: toMaterialView(found.row, found.usageCount) });
	});

	routes.delete("/materials/:id", async (c) => {
		const ctx = c.get("kernelCtx");
		const db = deps.getDb();
		const id = c.req.param("id");
		const found = await loadMaterial(db, ctx.orgId, id);
		if (!found) return materialError(c, 404, "MATERIAL_NOT_FOUND");
		// #655: đếm mức dùng trên cả hai bảng — buổi học thật lẫn bài học giáo
		// trình; 409 nêu cả hai số (`sessionCount` giữ nguyên nghĩa cũ).
		const inUse = (usage: { sessionCount: number; syllabusCount: number }) =>
			materialError(c, 409, "MATERIAL_IN_USE", {
				sessionCount: usage.sessionCount,
				syllabusCount: usage.syllabusCount,
			});
		const usage = await materialUsage(db, id);
		if (usage.sessionCount > 0 || usage.syllabusCount > 0) return inUse(usage);
		const objectKey = found.row.objectKey;
		// File cần kho để xoá object — thiếu binding thì không xoá row, tránh
		// object mồ côi không ai dọn.
		const store = objectKey === null ? undefined : deps.getMaterialsStore?.();
		if (objectKey !== null && !store)
			return materialError(c, 503, "MATERIALS_DISABLED");
		try {
			await db
				.delete(material)
				.where(and(eq(material.id, id), eq(material.orgId, ctx.orgId)));
		} catch (error) {
			// FK NO ACTION chặn khi một buổi/bài học vừa gắn tài liệu giữa lúc
			// kiểm và xoá.
			const recount = await materialUsage(db, id);
			if (recount.sessionCount > 0 || recount.syllabusCount > 0) {
				return inUse(recount);
			}
			throw error;
		}
		if (objectKey !== null && store) {
			try {
				await store.delete(objectKey);
			} catch (error) {
				console.error("[materials] object delete failed after row delete", {
					materialId: id,
					error,
				});
			}
		}
		return c.json({ ok: true });
	});

	routes.get("/materials/:id/file", async (c) => {
		const ctx = c.get("kernelCtx");
		const store = deps.getMaterialsStore?.();
		if (!store) return materialError(c, 503, "MATERIALS_DISABLED");
		const found = await loadMaterial(
			deps.getDb(),
			ctx.orgId,
			c.req.param("id"),
		);
		if (!found || found.row.objectKey === null) {
			return materialError(c, 404, "MATERIAL_NOT_FOUND");
		}
		const response = await materialFileResponse(
			store,
			{ ...found.row, objectKey: found.row.objectKey },
			{
				rangeHeader: c.req.header("Range"),
				download: c.req.query("download") === "1",
			},
		);
		return response ?? materialError(c, 404, "MATERIAL_NOT_FOUND");
	});

	// ---- Tài liệu của buổi học (classId + date) ----

	routes.get("/classes/:classId/sessions/:date/materials", async (c) => {
		const ctx = c.get("kernelCtx");
		const db = deps.getDb();
		const session = await resolveSession(c, db, ctx.orgId);
		if (!session.ok) return session.response;
		const items = await loadSessionMaterials(
			db,
			ctx.orgId,
			session.classId,
			session.date,
		);
		// #655: tài liệu suy từ giáo trình của lớp (buổi N ↔ bài N) — dedupe
		// theo materialId với tài liệu direct của buổi, direct ưu tiên.
		const directIds = new Set(items.map((item) => item.id));
		const curriculumMaterials = (
			await resolveCurriculumMaterials(
				db,
				ctx.orgId,
				session.classId,
				session.date,
			)
		).filter((ref) => !directIds.has(ref.id));
		return c.json({ items, curriculumMaterials });
	});

	routes.post("/classes/:classId/sessions/:date/materials", async (c) => {
		const ctx = c.get("kernelCtx");
		const body = await readBody(c, lessonMaterialAttachSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();
		const session = await resolveSession(c, db, ctx.orgId, {
			rejectHoliday: true,
		});
		if (!session.ok) return session.response;
		const { classId, date } = session;
		const { materialId } = body.data;
		// #662: bucket đã-shift còn buổi manual — attach tại đây là tạo mồ côi
		// (buổi thật duy nhất của ngày nằm ở makeup_date). Check trong route
		// body, KHÔNG trong `resolveSession` (detach dùng chung và phải gỡ được
		// legacy path-2). Đặt trước insert để không đụng shift-row race của
		// `holidayBucketDateGuard` (nhánh OR #662 trong guard xử lý race).
		if (await isShiftedHolidayBucket(db, ctx.orgId, classId, date)) {
			return materialError(c, 409, "SESSION_HOLIDAY");
		}
		if (!(await loadMaterial(db, ctx.orgId, materialId))) {
			return materialError(c, 404, "MATERIAL_NOT_FOUND");
		}
		// #645: guard CASE trên cột NOT NULL `date` chặn race giữa resolveSession
		// và insert — apply shift chen ngang biến buổi thành holiday ngay trước
		// lúc ghi thì NOT NULL violation làm statement fail (mẫu `shiftStatements`
		// của holidays.ts; lỗi NOT NULL không bị `onConflictDoNothing` nuốt).
		const holidayGuard = holidayBucketDateGuard(ctx.orgId, classId, date);
		let inserted: { materialId: string }[];
		try {
			inserted = await db
				.insert(lessonMaterial)
				.values({
					orgId: ctx.orgId,
					classId,
					date: holidayGuard,
					materialId,
					position: nextPosition(classId, date),
				})
				.onConflictDoNothing()
				.returning({ materialId: lessonMaterial.materialId });
		} catch (error) {
			// Thua race holiday guard: map về lỗi nghiệp vụ thay vì 500. #662:
			// guard CASE có nhánh OR mới nên fallback phải check cả predicate
			// đã-shift — nếu không, lỗi rơi xuống 404 material/folder gây nhiễu.
			if (
				(await isHolidayBucket(db, ctx.orgId, classId, date)) ||
				(await isShiftedHolidayBucket(db, ctx.orgId, classId, date))
			) {
				return materialError(c, 409, "SESSION_HOLIDAY");
			}
			// Tài liệu bị xoá giữa lúc kiểm và lúc ghi → FK lỗi, trả 404 nghiệp vụ.
			if (!(await loadMaterial(db, ctx.orgId, materialId))) {
				return materialError(c, 404, "MATERIAL_NOT_FOUND");
			}
			throw error;
		}
		if (inserted.length === 0) return materialError(c, 409, "ALREADY_ATTACHED");
		const items = await loadSessionMaterials(db, ctx.orgId, classId, date);
		const item = items.find((i) => i.id === materialId);
		if (!item) throw new Error("attached material missing after insert");
		return c.json({ item }, 201);
	});

	routes.put("/classes/:classId/sessions/:date/materials/files", async (c) => {
		const ctx = c.get("kernelCtx");
		const store = deps.getMaterialsStore?.();
		if (!store) return materialError(c, 503, "MATERIALS_DISABLED");
		const db = deps.getDb();
		const session = await resolveSession(c, db, ctx.orgId, {
			rejectHoliday: true,
		});
		if (!session.ok) return session.response;
		const { classId, date } = session;
		// #662: cùng predicate attach — check trong route body, KHÔNG trong
		// `resolveSession`; race do nhánh OR #662 của `holidayBucketDateGuard`.
		if (await isShiftedHolidayBucket(db, ctx.orgId, classId, date)) {
			return materialError(c, 409, "SESSION_HOLIDAY");
		}
		const folderId = c.req.query("folderId") || null;
		const folderError = await checkFolder(c, db, ctx.orgId, folderId);
		if (folderError) return folderError;
		const upload = await storeUpload(c, store, ctx.orgId);
		if (!upload.ok) return upload.response;
		try {
			// Một batch nguyên tử: tạo tài liệu trong ngân hàng + gắn vào buổi.
			await db.batch([
				db.insert(material).values({
					...upload.values,
					orgId: ctx.orgId,
					folderId,
					createdBy: ctx.userId,
				}),
				db.insert(lessonMaterial).values({
					orgId: ctx.orgId,
					classId,
					// #645: guard CASE chặn race — apply shift chen ngang giữa
					// resolveSession và insert thì NOT NULL violation làm cả
					// batch rollback (material bank + link cùng biến mất).
					date: holidayBucketDateGuard(ctx.orgId, classId, date),
					materialId: upload.values.id,
					position: nextPosition(classId, date),
				}),
			]);
		} catch (error) {
			upload.discard();
			console.error("[materials] session upload insert failed", { error });
			// Thua race holiday guard: map về lỗi nghiệp vụ thay vì 500. #662:
			// guard CASE có nhánh OR mới nên fallback phải check cả predicate
			// đã-shift — nếu không, lỗi rơi xuống 404 material/folder gây nhiễu.
			if (
				(await isHolidayBucket(db, ctx.orgId, classId, date)) ||
				(await isShiftedHolidayBucket(db, ctx.orgId, classId, date))
			) {
				return materialError(c, 409, "SESSION_HOLIDAY");
			}
			if (folderId !== null && !(await folderExists(db, ctx.orgId, folderId))) {
				return materialError(c, 404, "FOLDER_NOT_FOUND");
			}
			return c.json({ error: "upload failed" }, 500);
		}
		const items = await loadSessionMaterials(db, ctx.orgId, classId, date);
		const item = items.find((i) => i.id === upload.values.id);
		if (!item) throw new Error("uploaded material missing after insert");
		return c.json({ item }, 201);
	});

	routes.delete(
		"/classes/:classId/sessions/:date/materials/:materialId",
		async (c) => {
			const ctx = c.get("kernelCtx");
			const db = deps.getDb();
			// Gỡ không cần còn dòng lesson: liên kết có thể còn sót sau khi buổi
			// bị xoá, và giáo viên vẫn phải gỡ được để xoá tài liệu. #645: nhưng
			// buổi holiday (cả bucket holiday) không gỡ được — tài liệu đang
			// dời theo shift, không phải liên kết mồ côi.
			const session = await resolveSession(c, db, ctx.orgId, {
				requireLesson: false,
				rejectHoliday: true,
			});
			if (!session.ok) return session.response;
			const removed = await db
				.delete(lessonMaterial)
				.where(
					and(
						eq(lessonMaterial.orgId, ctx.orgId),
						eq(lessonMaterial.classId, session.classId),
						eq(lessonMaterial.date, session.date),
						eq(lessonMaterial.materialId, c.req.param("materialId")),
					),
				)
				.returning({ materialId: lessonMaterial.materialId });
			if (removed.length === 0) return materialError(c, 404, "NOT_ATTACHED");
			return c.json({ ok: true });
		},
	);

	return routes;
}
