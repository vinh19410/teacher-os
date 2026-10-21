import type { ClassmatesResponse } from "@teacher-os/api/contracts";
import { classTable, enrollment, student } from "@teacher-os/db/schema/index";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Db } from "../app";
import {
	createStudentGuard,
	type StudentEnv,
	type StudentRouteDeps,
} from "./student";

/**
 * Chữ tắt tên cho avatar: hai chữ cuối của tên tiếng Việt (tên gọi + tên đệm
 * gần nhất, ví dụ "Phạm Bảo Ngọc" → "BN"); tên một chữ → chữ đầu. Trùng quy
 * tắc hiển thị của màn "Bạn cùng lớp" trong design-v2.
 */
export function classmateInitials(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return "?";
	const tail = words.slice(-2);
	return tail.map((w) => (w[0] ?? "").toUpperCase()).join("");
}

/**
 * GET /api/student/classes/:classId/classmates (#378) — roster "Bạn cùng
 lớp" của lớp học viên ĐANG ghi danh (enrollment `active`). Chỉ trả id,
 * name, initials, isMe — KHÔNG email/band/học phí/điểm. Học viên không
 * ghi danh active vào lớp (lớp khác org, chưa ghi danh, invitation chưa
 * nhận) → 404, cùng ngữ nghĩa IDOR với GET /classes/:classId.
 */
export function studentClassmatesRoutes(deps: StudentRouteDeps) {
	const router = new Hono<StudentEnv>();
	const requireStudent = createStudentGuard(deps);

	router.use("/classes/:classId/classmates", requireStudent);

	router.get("/classes/:classId/classmates", async (c) => {
		const { student: me, orgId } = c.get("studentCtx");
		const classId = c.req.param("classId");
		const db: Db = deps.getDb();

		// IDOR guard: bản thân học viên phải có enrollment `active` trong lớp
		// này, đúng org đang chọn — mirrors /classes/:classId.
		const [ownRow] = await db
			.select({ id: enrollment.id })
			.from(enrollment)
			.innerJoin(classTable, eq(enrollment.classId, classTable.id))
			.where(
				and(
					eq(enrollment.orgId, orgId),
					eq(enrollment.studentId, me.id),
					eq(enrollment.classId, classId),
					eq(enrollment.status, "active"),
				),
			)
			.limit(1);
		if (!ownRow) return c.json({ error: "class not found" }, 404);

		const rows = await db
			.select({ id: student.id, name: student.name })
			.from(enrollment)
			.innerJoin(student, eq(enrollment.studentId, student.id))
			.where(
				and(
					eq(enrollment.orgId, orgId),
					eq(enrollment.classId, classId),
					eq(enrollment.status, "active"),
				),
			)
			.orderBy(asc(student.name), asc(student.id));

		const response: ClassmatesResponse = rows.map((row) => ({
			id: row.id,
			name: row.name,
			initials: classmateInitials(row.name),
			isMe: row.id === me.id,
		}));
		return c.json(response);
	});

	return router;
}
