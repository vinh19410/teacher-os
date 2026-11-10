import type { StudentLessonMaterialView } from "@teacher-os/api/material-contracts";
import { isMaterialKind } from "@teacher-os/api/material-contracts";
import { parseStartDateStrict } from "@teacher-os/api/skeleton";
import {
	enrollment,
	lesson,
	lessonMaterial,
	material,
} from "@teacher-os/db/schema/index";
import { and, asc, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { Db } from "../app";
import { materialFileResponse } from "../lib/material-file-response";
import type { MediaStore } from "../lib/media-store";
import { resolveCurriculumMaterials } from "../lib/session-curriculum-materials";
import {
	createStudentGuard,
	type StudentEnv,
	type StudentRouteDeps,
} from "./student";

export interface StudentMaterialRouteDeps extends StudentRouteDeps {
	/** Xem `AppDeps.getMaterialsStore` — vắng mặt → route file trả 503. */
	getMaterialsStore?(): MediaStore | undefined;
}

const SESSION_PATH = "/classes/:classId/sessions/:date/materials";

/**
 * Tài liệu buổi học cho học viên (chỉ đọc): GET danh sách và GET file của
 * một tài liệu trong buổi. Học viên phải có enrollment `active` trong lớp
 * (org đang chọn) và chính enrollment đó có dòng lesson ở ngày này — cùng
 * phạm vi buổi học viên thấy ở trang chi tiết lớp. Không thoả → 404 (ngữ
 * nghĩa IDOR như /classes/:classId). Payload không có cột teacher-only.
 */
export function studentMaterialRoutes(deps: StudentMaterialRouteDeps) {
	const router = new Hono<StudentEnv>();
	const requireStudent = createStudentGuard(deps);
	router.use(SESSION_PATH, requireStudent);
	router.use(`${SESSION_PATH}/*`, requireStudent);

	async function resolveSession(
		c: Context<StudentEnv>,
	): Promise<{ classId: string; date: string; orgId: string } | null> {
		const { student: me, orgId } = c.get("studentCtx");
		const classId = c.req.param("classId") ?? "";
		const date = parseStartDateStrict(c.req.param("date") ?? "");
		if (!date) return null;
		const db: Db = deps.getDb();
		const [row] = await db
			.select({ id: lesson.id })
			.from(enrollment)
			.innerJoin(
				lesson,
				and(
					eq(lesson.enrollmentId, enrollment.id),
					eq(lesson.orgId, orgId),
					eq(lesson.date, date),
				),
			)
			.where(
				and(
					eq(enrollment.orgId, orgId),
					eq(enrollment.studentId, me.id),
					eq(enrollment.classId, classId),
					eq(enrollment.status, "active"),
				),
			)
			.limit(1);
		return row ? { classId, date, orgId } : null;
	}

	router.get(SESSION_PATH, async (c) => {
		const session = await resolveSession(c);
		if (!session) return c.json({ error: "session not found" }, 404);
		const rows = await deps
			.getDb()
			.select({
				id: material.id,
				title: material.title,
				description: material.description,
				kind: material.kind,
				url: material.url,
				mimeType: material.mimeType,
				sizeBytes: material.sizeBytes,
				originalName: material.originalName,
				position: lessonMaterial.position,
			})
			.from(lessonMaterial)
			.innerJoin(
				material,
				and(
					eq(material.id, lessonMaterial.materialId),
					eq(material.orgId, session.orgId),
				),
			)
			.where(
				and(
					eq(lessonMaterial.orgId, session.orgId),
					eq(lessonMaterial.classId, session.classId),
					eq(lessonMaterial.date, session.date),
				),
			)
			.orderBy(
				asc(lessonMaterial.position),
				asc(lessonMaterial.createdAt),
				asc(material.id),
			);
		const items: StudentLessonMaterialView[] = rows.map((row) => ({
			...row,
			kind: isMaterialKind(row.kind) ? row.kind : "file",
		}));
		// #655: thêm tài liệu ngân hàng gắn qua giáo trình (buổi N ↔ bài N).
		// Shape mirror route teacher GET cùng path: `items` giữ nguyên nghĩa
		// tài liệu direct (backward-compat), nguồn giáo trình ở field riêng
		// `curriculumMaterials` — projection của helper đã là
		// `StudentLessonMaterialView` (SyllabusBankMaterialRef), dedupe theo
		// materialId với direct, direct ưu tiên. UI học viên tự hợp thành một
		// danh sách (direct theo position trước, curriculum theo position sau).
		const directIds = new Set(items.map((item) => item.id));
		const curriculumMaterials = (
			await resolveCurriculumMaterials(
				deps.getDb(),
				session.orgId,
				session.classId,
				session.date,
			)
		).filter((ref) => !directIds.has(ref.id));
		return c.json({ items, curriculumMaterials });
	});

	router.get(`${SESSION_PATH}/:materialId/file`, async (c) => {
		const store = deps.getMaterialsStore?.();
		if (!store) {
			return c.json(
				{ error: "MATERIALS_DISABLED", code: "MATERIALS_DISABLED" },
				503,
			);
		}
		const session = await resolveSession(c);
		if (!session) return c.json({ error: "session not found" }, 404);
		const [row] = await deps
			.getDb()
			.select({
				objectKey: material.objectKey,
				mimeType: material.mimeType,
				sizeBytes: material.sizeBytes,
				originalName: material.originalName,
				kind: material.kind,
			})
			.from(lessonMaterial)
			.innerJoin(
				material,
				and(
					eq(material.id, lessonMaterial.materialId),
					eq(material.orgId, session.orgId),
				),
			)
			.where(
				and(
					eq(lessonMaterial.orgId, session.orgId),
					eq(lessonMaterial.classId, session.classId),
					eq(lessonMaterial.date, session.date),
					eq(lessonMaterial.materialId, c.req.param("materialId")),
				),
			)
			.limit(1);
		if (row && row.objectKey !== null) {
			const response = await materialFileResponse(
				store,
				{ ...row, objectKey: row.objectKey },
				{
					rangeHeader: c.req.header("Range"),
					download: c.req.query("download") === "1",
				},
			);
			return response ?? c.json({ error: "material not found" }, 404);
		}
		// #655: tài liệu gắn qua giáo trình của lớp không có dòng
		// lessonMaterial — học viên của buổi vẫn mở/tải được file. materialId
		// phải thuộc bài giáo trình ánh xạ buổi này (authorization như trên
		// không đổi), projection trả file không thêm trường teacher-only.
		const materialId = c.req.param("materialId");
		const curriculum = await resolveCurriculumMaterials(
			deps.getDb(),
			session.orgId,
			session.classId,
			session.date,
		);
		if (!curriculum.some((ref) => ref.id === materialId)) {
			return c.json({ error: "material not found" }, 404);
		}
		const [bank] = await deps
			.getDb()
			.select({
				objectKey: material.objectKey,
				mimeType: material.mimeType,
				sizeBytes: material.sizeBytes,
				originalName: material.originalName,
				kind: material.kind,
			})
			.from(material)
			.where(
				and(eq(material.id, materialId), eq(material.orgId, session.orgId)),
			)
			.limit(1);
		if (!bank || bank.objectKey === null) {
			return c.json({ error: "material not found" }, 404);
		}
		const response = await materialFileResponse(
			store,
			{ ...bank, objectKey: bank.objectKey },
			{
				rangeHeader: c.req.header("Range"),
				download: c.req.query("download") === "1",
			},
		);
		return response ?? c.json({ error: "material not found" }, 404);
	});

	return router;
}
