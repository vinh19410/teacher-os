import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	studentClassDetailSchema,
	studentSessionDetailResponseSchema,
} from "@teacher-os/api/contracts";
import { addDaysISO, vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import * as schema from "@teacher-os/db/schema/index";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
	buildApp,
	type Db,
	enforceDeclaredSize,
	type MediaStore,
	type ServerApp,
} from "../app";
import type { SessionUser } from "../session";

const TEACHER_ORIGIN = "http://localhost:8001";
const STUDENT_ORIGIN = "http://localhost:8003";
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);
const PDF = "application/pdf";

const SESSIONS: Record<string, SessionUser> = {
	"teacher-1": {
		userId: "t-1",
		userName: "Cô Lan",
		email: "lan@test.local",
		emailVerified: true,
		role: "teacher",
	},
	"ta-1": {
		userId: "ta-1",
		userName: "Trợ giảng",
		email: "ta@test.local",
		emailVerified: true,
		role: "teacher",
	},
	"student-1": {
		userId: "u-stu-1",
		userName: "Minh",
		email: "minh@student.local",
		emailVerified: true,
		role: "student",
	},
	"student-invited": {
		userId: "u-stu-invited",
		userName: "Linh",
		email: "linh@student.local",
		emailVerified: true,
		role: "student",
	},
	"student-other": {
		userId: "u-stu-other",
		userName: "Hà",
		email: "ha@student.local",
		emailVerified: true,
		role: "student",
	},
};

function createMemoryStore() {
	const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
	const store: MediaStore = {
		async put(key, body, { contentType, size }) {
			const counted = enforceDeclaredSize(body, size);
			const bytes = new Uint8Array(
				await new Response(counted.stream).arrayBuffer(),
			);
			objects.set(key, { bytes, contentType });
		},
		async get(key, range) {
			const object = objects.get(key);
			if (!object) return null;
			const bytes = range
				? object.bytes.slice(range.offset, range.offset + range.length)
				: object.bytes;
			return {
				body: new Response(bytes).body as ReadableStream<Uint8Array>,
				contentType: object.contentType,
				size: object.bytes.byteLength,
				...(range ? { range } : {}),
			};
		},
		async delete(key) {
			objects.delete(key);
		},
	};
	return { store, objects };
}

function pdfBytes(tag = "v1"): Uint8Array {
	return new TextEncoder().encode(`%PDF-1.4\n% ${tag}\n%%EOF`);
}

describe("session lecture/homework materials, assignment sessionDate & student session detail", () => {
	let db: Db;
	let app: ServerApp;
	let store: MediaStore;
	let objects: Map<string, { bytes: Uint8Array; contentType: string }>;
	let fixedNow = new Date("2026-11-20T05:00:00Z");

	const ORG_1 = "org-1";
	const CLASS_1 = "cls-1";
	const STU_1 = "stu-1";
	const STU_INVITED = "stu-invited";
	const ENR_1 = "enr-1";
	const PROMPT_1 = "prompt-1";
	const PROMPT_2 = "prompt-2";

	beforeAll(async () => {
		const client = createClient({ url: ":memory:" });
		db = drizzle(client, { schema }) as unknown as Db;
		await migrate(db as never, { migrationsFolder: MIGRATIONS_DIR });
	});

	beforeEach(async () => {
		fixedNow = new Date("2026-11-20T05:00:00Z");
		const mem = createMemoryStore();
		store = mem.store;
		objects = mem.objects;
		app = buildApp({
			getDb: () => db,
			authHandler: () => new Response("auth stub", { status: 404 }),
			getSessionUser: (headers) => {
				const key = headers.get("x-test-user");
				return Promise.resolve(key ? (SESSIONS[key] ?? null) : null);
			},
			getMaterialsStore: () => store,
			corsOrigin: [TEACHER_ORIGIN, STUDENT_ORIGIN],
			now: () => fixedNow,
		});

		await db.delete(schema.lessonMaterial);
		await db.delete(schema.syllabusLessonMaterial);
		await db.delete(schema.classMaterial);
		await db.delete(schema.material);
		await db.delete(schema.classAssignmentTarget);
		await db.delete(schema.classAssignment);
		await db.delete(schema.assignmentPrompt);
		await db.delete(schema.holidaySessionShift);
		await db.delete(schema.organizationHolidayClass);
		await db.delete(schema.organizationHoliday);
		await db.delete(schema.classSessionMeeting);
		await db.delete(schema.classSession);
		await db.delete(schema.lesson);
		await db.delete(schema.enrollment);
		await db.delete(schema.classTable);
		await db.delete(schema.syllabusLesson);
		await db.delete(schema.syllabusModule);
		await db.delete(schema.syllabus);
		await db.delete(schema.student);
		await db.delete(schema.membership);
		await db.delete(schema.user);
		await db.delete(schema.organization);

		await db
			.insert(schema.organization)
			.values({ id: ORG_1, name: "IELTS Lab" });
		await db.insert(schema.user).values([
			{
				id: "t-1",
				name: "Cô Lan",
				email: "lan@test.local",
				emailVerified: true,
			},
			{
				id: "ta-1",
				name: "Trợ giảng",
				email: "ta@test.local",
				emailVerified: true,
			},
			{
				id: "u-stu-1",
				name: "Minh",
				email: "minh@student.local",
				emailVerified: true,
			},
			{
				id: "u-stu-invited",
				name: "Linh",
				email: "linh@student.local",
				emailVerified: true,
			},
			{
				id: "u-stu-other",
				name: "Hà",
				email: "ha@student.local",
				emailVerified: true,
			},
		]);
		await db.insert(schema.membership).values([
			{ id: "mem-t1", orgId: ORG_1, userId: "t-1", role: "teacher" },
			{ id: "mem-ta1", orgId: ORG_1, userId: "ta-1", role: "ta" },
		]);
		await db.insert(schema.student).values([
			{ id: STU_1, orgId: ORG_1, name: "Minh", email: "minh@student.local" },
			{
				id: STU_INVITED,
				orgId: ORG_1,
				name: "Linh",
				email: "linh@student.local",
			},
			{ id: "stu-other", orgId: ORG_1, name: "Hà", email: "ha@student.local" },
		]);

		// Syllabus copy attached to CLASS_1: 2 modules, 3 lessons
		await db.insert(schema.syllabus).values({
			id: "sy-1",
			orgId: ORG_1,
			classId: CLASS_1,
			name: "IELTS Writing Intensive",
			level: "6.5",
			type: "ielts",
			description: "Lộ trình viết chuyên sâu",
			totalLessons: 3,
		});
		await db.insert(schema.syllabusModule).values([
			{
				id: "mod-1",
				orgId: ORG_1,
				syllabusId: "sy-1",
				title: "Module 1: Foundation",
				description: "Cấu trúc nền tảng",
				position: 0,
			},
			{
				id: "mod-2",
				orgId: ORG_1,
				syllabusId: "sy-1",
				title: "Module 2: Essay Mastery",
				description: "Luyện đề nâng cao",
				position: 1,
			},
		]);
		await db.insert(schema.syllabusLesson).values([
			{
				id: "sl-1",
				orgId: ORG_1,
				moduleId: "mod-1",
				title: "Bài 1: Mở bài & Thân bài",
				objectives: "Viết mở bài rõ luận điểm",
				materials: "GHI CHÚ NỘI BỘ GIÁO VIÊN: Đáp án trang 214",
				kind: "lesson",
				status: "done",
				position: 0,
			},
			{
				id: "sl-2",
				orgId: ORG_1,
				moduleId: "mod-1",
				title: "Bài 2: Lập luận & Ví dụ",
				objectives: "Phát triển đoạn văn mạch lạc",
				materials: "Ghi chú bí mật 2",
				kind: "lesson",
				status: "upcoming",
				position: 1,
			},
			{
				id: "sl-3",
				orgId: ORG_1,
				moduleId: "mod-2",
				title: "Bài 3: Thi thử giữa kỳ",
				objectives: "Hoàn thành bài viết trong 40 phút",
				materials: "Đề mật",
				kind: "midterm",
				status: "upcoming",
				position: 0,
			},
		]);

		await db.insert(schema.classTable).values({
			id: CLASS_1,
			orgId: ORG_1,
			name: "IELTS Writing K12",
			level: "IELTS 6.5",
			mode: "Online",
			schedule: '{"days":[1,4],"start":"19:00","end":"20:30"}',
			sessionsDone: 1,
			sessionsTotal: 3,
			startDate: "2026-11-16",
			status: "active",
			syllabusId: "sy-1",
		});
		await db.insert(schema.enrollment).values([
			{
				id: ENR_1,
				orgId: ORG_1,
				classId: CLASS_1,
				studentId: STU_1,
				status: "active",
			},
			{
				id: "enr-invited",
				orgId: ORG_1,
				classId: CLASS_1,
				studentId: STU_INVITED,
				status: "invited",
			},
		]);

		// Lessons: 16/11 (completed), 19/11 (holiday), 23/11 (upcoming), 26/11 (cancelled), 30/11 (upcoming)
		await db.insert(schema.lesson).values([
			{
				id: "l-1",
				orgId: ORG_1,
				classId: CLASS_1,
				enrollmentId: ENR_1,
				date: "2026-11-16",
				day: 1,
				time: "19:00",
				dur: 90,
				status: "completed",
				topic: "Mở bài Task 2",
			},
			{
				id: "l-hol",
				orgId: ORG_1,
				classId: CLASS_1,
				enrollmentId: ENR_1,
				date: "2026-11-19",
				day: 4,
				time: "19:00",
				dur: 90,
				status: "holiday",
				topic: "",
			},
			{
				id: "l-2",
				orgId: ORG_1,
				classId: CLASS_1,
				enrollmentId: ENR_1,
				date: "2026-11-23",
				day: 1,
				time: "19:00",
				dur: 90,
				status: "upcoming",
				topic: "Lập luận Task 2",
			},
			{
				id: "l-cancel",
				orgId: ORG_1,
				classId: CLASS_1,
				enrollmentId: ENR_1,
				date: "2026-11-26",
				day: 4,
				time: "19:00",
				dur: 90,
				status: "cancelled",
				topic: "Buổi bị hủy",
			},
			{
				id: "l-3",
				orgId: ORG_1,
				classId: CLASS_1,
				enrollmentId: ENR_1,
				date: "2026-11-30",
				day: 1,
				time: "19:00",
				dur: 90,
				status: "upcoming",
				topic: "Buổi ôn tập bổ sung",
			},
		]);

		await db.insert(schema.assignmentPrompt).values([
			{
				id: PROMPT_1,
				orgId: ORG_1,
				title: "Writing Task 2 — Education",
				skill: "writing",
				task: "task2",
				genre: "opinion",
				band: "6.5",
				status: "ready",
				source: "Cambridge 18",
				prompt: "Some people believe education should be free for everyone.",
			},
			{
				id: PROMPT_2,
				orgId: ORG_1,
				title: "Writing Task 2 — Future Release",
				skill: "writing",
				task: "task2",
				genre: "opinion",
				band: "6.5",
				status: "ready",
				source: "Cambridge 18",
				prompt: "Technology is changing the way students learn.",
			},
		]);
	});

	function teacherJson(
		path: string,
		method: "POST" | "PATCH",
		body: unknown,
		user = "teacher-1",
	) {
		return app.request(path, {
			method,
			headers: {
				origin: TEACHER_ORIGIN,
				"content-type": "application/json",
				"x-test-user": user,
			},
			body: JSON.stringify(body),
		});
	}

	function teacherUpload(
		path: string,
		bytes: Uint8Array,
		fileName = "slice.pdf",
		user = "teacher-1",
		contentType = PDF,
	) {
		return app.request(path, {
			method: "PUT",
			headers: {
				origin: TEACHER_ORIGIN,
				"content-type": contentType,
				"content-length": String(bytes.byteLength),
				"x-file-name": encodeURIComponent(fileName),
				"x-test-user": user,
			},
			body: new Uint8Array(bytes),
		});
	}

	function studentGet(path: string, user = "student-1") {
		return app.request(path, {
			method: "GET",
			headers: {
				origin: STUDENT_ORIGIN,
				"x-test-user": user,
				"x-student-org-id": ORG_1,
			},
		});
	}

	test("teacher uploads lecture slice & homework before/after session, switches category, rejects invalid query before R2", async () => {
		// Invalid page range must fail BEFORE storing any object in R2
		const badRange = await teacherUpload(
			`/api/classes/${CLASS_1}/sessions/2026-11-16/materials/files?category=lecture&pageStart=10&pageEnd=5`,
			pdfBytes("bad"),
		);
		expect(badRange.status).toBe(400);
		expect(((await badRange.json()) as { code?: string }).code).toBe(
			"INVALID_PAGE_RANGE",
		);
		expect(objects.size).toBe(0);

		// Invalid bidi char in title must fail BEFORE R2
		const badTitle = await teacherUpload(
			`/api/classes/${CLASS_1}/sessions/2026-11-16/materials/files?title=${encodeURIComponent("bad\u202ename")}`,
			pdfBytes("bad"),
		);
		expect(badTitle.status).toBe(400);
		expect(objects.size).toBe(0);

		// Upload sliced lecture PDF AFTER completed session (2026-11-16)
		const lecRes = await teacherUpload(
			`/api/classes/${CLASS_1}/sessions/2026-11-16/materials/files?category=lecture&title=${encodeURIComponent("Buổi 1 - Mở bài (tr. 1–12)")}&sourceTitle=${encodeURIComponent("Cambridge Writing.pdf")}&pageStart=1&pageEnd=12`,
			pdfBytes("lecture-1"),
			"buoi-1-tr-1-12.pdf",
		);
		expect(lecRes.status).toBe(201);
		const lecBody = (await lecRes.json()) as {
			item: {
				id: string;
				title: string;
				category: string;
				sourceTitle: string | null;
				sourcePageStart: number | null;
				sourcePageEnd: number | null;
			};
		};
		expect(lecBody.item.title).toBe("Buổi 1 - Mở bài (tr. 1–12)");
		expect(lecBody.item.category).toBe("lecture");
		expect(lecBody.item.sourceTitle).toBe("Cambridge Writing.pdf");
		expect(lecBody.item.sourcePageStart).toBe(1);
		expect(lecBody.item.sourcePageEnd).toBe(12);

		// Upload homework file BEFORE upcoming session (2026-11-23)
		const hwRes = await teacherUpload(
			`/api/classes/${CLASS_1}/sessions/2026-11-23/materials/files?category=homework`,
			pdfBytes("hw-2"),
			"bai-tap-buoi-2.pdf",
		);
		expect(hwRes.status).toBe(201);
		const hwBody = (await hwRes.json()) as {
			item: { id: string; category: string };
		};
		expect(hwBody.item.category).toBe("homework");

		// Create homework link directly on session
		const linkRes = await teacherJson(
			`/api/classes/${CLASS_1}/sessions/2026-11-16/materials/links`,
			"POST",
			{
				title: "Google Form bài tập buổi 1",
				url: "https://forms.gle/demo1",
				category: "homework",
			},
		);
		expect(linkRes.status).toBe(201);
		const linkBody = (await linkRes.json()) as {
			item: { id: string; category: string; kind: string };
		};
		expect(linkBody.item.category).toBe("homework");
		expect(linkBody.item.kind).toBe("link");

		// TA cannot PATCH category or create session link
		const taPatch = await teacherJson(
			`/api/classes/${CLASS_1}/sessions/2026-11-16/materials/${linkBody.item.id}`,
			"PATCH",
			{ category: "lecture" },
			"ta-1",
		);
		expect(taPatch.status).toBe(403);

		// Teacher switches category homework -> lecture -> homework
		const patchRes = await teacherJson(
			`/api/classes/${CLASS_1}/sessions/2026-11-16/materials/${linkBody.item.id}`,
			"PATCH",
			{ category: "lecture" },
		);
		expect(patchRes.status).toBe(200);
		expect(
			((await patchRes.json()) as { item: { category: string } }).item.category,
		).toBe("lecture");

		// Patch non-attached material returns 404 NOT_ATTACHED
		const notAttached = await teacherJson(
			`/api/classes/${CLASS_1}/sessions/2026-11-16/materials/non-existent`,
			"PATCH",
			{ category: "homework" },
		);
		expect(notAttached.status).toBe(404);
		expect(((await notAttached.json()) as { code?: string }).code).toBe(
			"NOT_ATTACHED",
		);

		// Holiday session rejects link creation & upload with 409 SESSION_HOLIDAY
		const holLink = await teacherJson(
			`/api/classes/${CLASS_1}/sessions/2026-11-19/materials/links`,
			"POST",
			{ title: "Nope", url: "https://example.com", category: "homework" },
		);
		expect(holLink.status).toBe(409);
		expect(((await holLink.json()) as { code?: string }).code).toBe(
			"SESSION_HOLIDAY",
		);
	});

	test("POST /classes/:id/assignments validates sessionDate, blocks TA, and syncs on moveDate", async () => {
		// TA blocked with 403
		const taAssign = await teacherJson(
			`/api/classes/${CLASS_1}/assignments`,
			"POST",
			{
				promptId: PROMPT_1,
				due: "2026-12-01",
				studentIds: [STU_1],
				sessionDate: "2026-11-23",
			},
			"ta-1",
		);
		expect(taAssign.status).toBe(403);

		// Holiday or cancelled or nonexistent sessionDate rejected 400
		for (const badDate of [
			"2026-11-19",
			"2026-11-26",
			"2026-12-31",
			"2026-02-31",
		]) {
			const res = await teacherJson(
				`/api/classes/${CLASS_1}/assignments`,
				"POST",
				{
					promptId: PROMPT_1,
					due: "2026-12-01",
					studentIds: [STU_1],
					sessionDate: badDate,
				},
			);
			expect(res.status).toBe(400);
		}

		// Valid sessionDate succeeds
		const okRes = await teacherJson(
			`/api/classes/${CLASS_1}/assignments`,
			"POST",
			{
				promptId: PROMPT_1,
				due: "2026-12-01",
				studentIds: [STU_1],
				sessionDate: "2026-11-23",
			},
		);
		expect(okRes.status).toBe(201);
		const { id: assignmentId } = (await okRes.json()) as { id: string };

		// Move session 2026-11-23 -> 2026-11-24 updates classAssignment.sessionDate atomically
		const moveRes = await teacherJson(
			`/api/classes/${CLASS_1}/sessions/2026-11-23/edit`,
			"POST",
			{ moveDate: "2026-11-24" },
		);
		expect(moveRes.status).toBe(200);

		const [updatedCa] = await db
			.select({ sessionDate: schema.classAssignment.sessionDate })
			.from(schema.classAssignment)
			.where(
				and(
					eq(schema.classAssignment.id, assignmentId),
					eq(schema.classAssignment.orgId, ORG_1),
				),
			);
		expect(updatedCa?.sessionDate).toBe("2026-11-24");
	});

	test("student class detail and session detail return curriculum, deduped lectures, homework, assignments, and enforce security boundaries", async () => {
		// Seed bank curriculum material linked to sl-1 (2026-11-16)
		await db.insert(schema.material).values({
			id: "mat-curr-1",
			orgId: ORG_1,
			title: "Tài liệu giáo trình bài 1",
			description: "",
			kind: "link",
			url: "https://example.com/curr-1",
			createdBy: "t-1",
		});
		await db.insert(schema.syllabusLessonMaterial).values({
			orgId: ORG_1,
			syllabusLessonId: "sl-1",
			materialId: "mat-curr-1",
			position: 0,
		});

		// Upload sliced lecture PDF & homework file for 2026-11-16
		const lecRes = await teacherUpload(
			`/api/classes/${CLASS_1}/sessions/2026-11-16/materials/files?category=lecture&title=${encodeURIComponent("Bài giảng buổi 1")}&sourceTitle=${encodeURIComponent("Sách gốc IELTS")}&pageStart=5&pageEnd=14`,
			pdfBytes("lec-1"),
			"lec-1.pdf",
		);
		const lecId = ((await lecRes.json()) as { item: { id: string } }).item.id;

		const hwRes = await teacherUpload(
			`/api/classes/${CLASS_1}/sessions/2026-11-16/materials/files?category=homework&title=${encodeURIComponent("Bài tập về nhà buổi 1")}`,
			pdfBytes("hw-1"),
			"hw-1.pdf",
		);
		const hwId = ((await hwRes.json()) as { item: { id: string } }).item.id;

		// Attach material onto cancelled session (2026-11-26) to prove student cannot read/download it
		const cancelMatRes = await teacherUpload(
			`/api/classes/${CLASS_1}/sessions/2026-11-26/materials/files?category=lecture`,
			pdfBytes("secret-cancelled"),
			"cancelled.pdf",
		);
		const cancelMatId = (
			(await cancelMatRes.json()) as { item: { id: string } }
		).item.id;

		// Assign 1 visible interactive assignment + 1 future-available assignment to 2026-11-16
		await db.insert(schema.classAssignment).values([
			{
				id: "ca-visible",
				orgId: ORG_1,
				classId: CLASS_1,
				promptId: PROMPT_1,
				title: "Writing Task 2 — Education",
				due: "2026-11-28",
				sessionDate: "2026-11-16",
				availableAt: new Date("2026-11-19T00:00:00Z"),
			},
			{
				id: "ca-future",
				orgId: ORG_1,
				classId: CLASS_1,
				promptId: PROMPT_2,
				title: "Writing Task 2 — Future Release",
				due: "2026-12-05",
				sessionDate: "2026-11-16",
				availableAt: new Date("2026-11-25T00:00:00Z"), // > fixedNow (2026-11-20)
			},
		]);
		await db.insert(schema.classAssignmentTarget).values([
			{
				id: "cat-1",
				orgId: ORG_1,
				assignmentId: "ca-visible",
				studentId: STU_1,
				submittedAt: null,
			},
			{
				id: "cat-2",
				orgId: ORG_1,
				assignmentId: "ca-future",
				studentId: STU_1,
				submittedAt: null,
			},
		]);

		// 1. GET /api/student/classes/:classId
		const classRes = await studentGet(`/api/student/classes/${CLASS_1}`);
		expect(classRes.status).toBe(200);
		const classDetail = studentClassDetailSchema.parse(await classRes.json());
		expect(classDetail.syllabus?.name).toBe("IELTS Writing Intensive");
		expect(classDetail.syllabus?.modules.map((m) => m.id)).toEqual([
			"mod-1",
			"mod-2",
		]);

		const l1 = classDetail.lessons.find((l) => l.date === "2026-11-16");
		expect(l1?.moduleId).toBe("mod-1");
		expect(l1?.moduleTitle).toBe("Module 1: Foundation");
		expect(l1?.syllabusTitle).toBe("Bài 1: Mở bài & Thân bài");
		expect(l1?.lectureCount).toBe(2); // 1 direct lecture + 1 curriculum bank material
		expect(l1?.homeworkCount).toBe(1);
		expect(l1?.assignmentCount).toBe(1); // ca-future hidden by fixedNow

		const lCancel = classDetail.lessons.find((l) => l.date === "2026-11-26");
		expect(lCancel?.lectureCount).toBe(0);
		expect(lCancel?.homeworkCount).toBe(0);

		const lHol = classDetail.lessons.find((l) => l.date === "2026-11-19");
		expect(lHol?.moduleId).toBeUndefined();
		expect(lHol?.lectureCount).toBe(0);

		// 2. GET /api/student/classes/:classId/sessions/2026-11-16
		const sesRes = await studentGet(
			`/api/student/classes/${CLASS_1}/sessions/2026-11-16`,
		);
		expect(sesRes.status).toBe(200);
		const rawSessionText = await sesRes.text();
		// Never leak teacher-only syllabus materials note or internal columns
		expect(rawSessionText).not.toContain("GHI CHÚ NỘI BỘ GIÁO VIÊN");
		expect(rawSessionText).not.toContain("objectKey");
		expect(rawSessionText).not.toContain("createdBy");

		const ses = studentSessionDetailResponseSchema.parse(
			JSON.parse(rawSessionText),
		);
		expect(ses.session.sessionNumber).toBe(1);
		expect(ses.session.totalTeachingSessions).toBe(4); // excludes 19/11 holiday
		expect(ses.prevSessionDate).toBeNull();
		expect(ses.nextSessionDate).toBe("2026-11-23"); // skips 19/11 holiday!
		expect(ses.curriculum?.title).toBe("Bài 1: Mở bài & Thân bài");
		expect(ses.curriculum?.objectives).toBe("Viết mở bài rõ luận điểm");
		expect(ses.lectures.map((m) => m.id)).toEqual([lecId, "mat-curr-1"]);
		expect(ses.lectures[0]?.sourceTitle).toBe("Sách gốc IELTS");
		expect(ses.lectures[0]?.sourcePageStart).toBe(5);
		expect(ses.lectures[0]?.sourcePageEnd).toBe(14);
		expect(ses.homeworkMaterials.map((m) => m.id)).toEqual([hwId]);
		expect(ses.assignments.map((a) => a.id)).toEqual(["ca-visible"]);

		// Student can download both lecture PDF and homework PDF
		const dlLec = await studentGet(
			`/api/student/classes/${CLASS_1}/sessions/2026-11-16/materials/${lecId}/file`,
		);
		expect(dlLec.status).toBe(200);
		const dlHw = await studentGet(
			`/api/student/classes/${CLASS_1}/sessions/2026-11-16/materials/${hwId}/file`,
		);
		expect(dlHw.status).toBe(200);

		// 3. Cancelled session hides materials across BOTH /sessions/:date and /student-materials
		const cancelSes = await studentGet(
			`/api/student/classes/${CLASS_1}/sessions/2026-11-26`,
		);
		expect(cancelSes.status).toBe(200);
		const cancelDetail = studentSessionDetailResponseSchema.parse(
			await cancelSes.json(),
		);
		expect(cancelDetail.lectures).toEqual([]);
		expect(cancelDetail.homeworkMaterials).toEqual([]);

		const cancelList = await studentGet(
			`/api/student/classes/${CLASS_1}/sessions/2026-11-26/materials`,
		);
		expect(cancelList.status).toBe(200);
		expect(await cancelList.json()).toEqual({
			items: [],
			curriculumMaterials: [],
		});

		const cancelDownload = await studentGet(
			`/api/student/classes/${CLASS_1}/sessions/2026-11-26/materials/${cancelMatId}/file`,
		);
		expect(cancelDownload.status).toBe(404);

		// 4. Auth & IDOR guards
		expect(
			(await app.request(`/api/student/classes/${CLASS_1}/sessions/2026-11-16`))
				.status,
		).toBe(401);
		expect(
			(
				await studentGet(
					`/api/student/classes/${CLASS_1}/sessions/2026-11-16`,
					"teacher-1",
				)
			).status,
		).toBe(403);
		expect(
			(
				await studentGet(
					`/api/student/classes/${CLASS_1}/sessions/2026-11-16`,
					"student-invited",
				)
			).status,
		).toBe(404);
		expect(
			(
				await studentGet(
					`/api/student/classes/${CLASS_1}/sessions/2026-11-16`,
					"student-other",
				)
			).status,
		).toBe(404);
		expect(
			(await studentGet(`/api/student/classes/${CLASS_1}/sessions/not-a-date`))
				.status,
		).toBe(404);
		expect(
			(await studentGet(`/api/student/classes/${CLASS_1}/sessions/2026-12-31`))
				.status,
		).toBe(404);

		// 5. Paused enrollment returns 404; spoofed cross-org header rejected with 403
		await db
			.update(schema.enrollment)
			.set({ status: "paused" })
			.where(eq(schema.enrollment.id, ENR_1));
		expect(
			(await studentGet(`/api/student/classes/${CLASS_1}/sessions/2026-11-16`))
				.status,
		).toBe(404);
		await db
			.update(schema.enrollment)
			.set({ status: "active" })
			.where(eq(schema.enrollment.id, ENR_1));

		const spoofedOrgRes = await app.request(
			`/api/student/classes/${CLASS_1}/sessions/2026-11-16`,
			{
				headers: {
					origin: STUDENT_ORIGIN,
					"x-test-user": "student-1",
					"x-student-org-id": "org-nonexistent",
				},
			},
		);
		expect(spoofedOrgRes.status).toBe(403);

		// Student belonging to org-2 requesting org-1's class returns 404
		await db.insert(schema.organization).values({
			id: "org-2",
			name: "Other Org",
			slug: "other-org",
		});
		await db.insert(schema.student).values({
			id: "stu-org-2",
			orgId: "org-2",
			userId: "u-stu-1",
			name: "Minh Org2",
			email: "minh@student.local",
		});
		const crossOrgRes = await app.request(
			`/api/student/classes/${CLASS_1}/sessions/2026-11-16`,
			{
				headers: {
					origin: STUDENT_ORIGIN,
					"x-test-user": "student-1",
					"x-student-org-id": "org-2",
				},
			},
		);
		expect(crossOrgRes.status).toBe(404);
	});

	test("classAssignment.sessionDate syncs on holiday shift/undo, session delete, and startDate reschedule", async () => {
		// Pick future Monday/Thursday relative to vietnamTodayISO() so holiday & reschedule routes accept them on any date
		let futureMon = addDaysISO(vietnamTodayISO(), 7);
		while (new Date(`${futureMon}T00:00:00Z`).getUTCDay() !== 1) {
			futureMon = addDaysISO(futureMon, 1);
		}
		const futureThu = addDaysISO(futureMon, 3);
		const futureNextMon = addDaysISO(futureMon, 7);
		const futureDue = addDaysISO(futureMon, 28);

		const clsFuture = "cls-future-sync";
		const enrFuture = "enr-future-sync";
		await db.insert(schema.classTable).values({
			id: clsFuture,
			orgId: ORG_1,
			name: "Future Sync Class",
			level: "IELTS 6.5",
			mode: "Online",
			schedule: '{"days":[0,3],"start":"19:00","end":"20:30"}',
			sessionsDone: 0,
			sessionsTotal: 2,
			startDate: futureMon,
			status: "active",
		});
		await db.insert(schema.enrollment).values({
			id: enrFuture,
			orgId: ORG_1,
			classId: clsFuture,
			studentId: STU_1,
			status: "active",
		});
		await db.insert(schema.lesson).values([
			{
				id: "lf-1",
				orgId: ORG_1,
				classId: clsFuture,
				enrollmentId: enrFuture,
				date: futureMon,
				day: 1,
				time: "19:00",
				dur: 90,
				status: "upcoming",
			},
			{
				id: "lf-2",
				orgId: ORG_1,
				classId: clsFuture,
				enrollmentId: enrFuture,
				date: futureThu,
				day: 4,
				time: "19:00",
				dur: 90,
				status: "upcoming",
			},
		]);

		// Create an assignment tied to futureMon
		const createRes = await teacherJson(
			`/api/classes/${clsFuture}/assignments`,
			"POST",
			{
				promptId: PROMPT_1,
				due: futureDue,
				studentIds: [STU_1],
				sessionDate: futureMon,
			},
		);
		expect(createRes.status).toBe(201);
		const { id: caId } = (await createRes.json()) as { id: string };

		// 1. Holiday shift on futureMon moves classAssignment.sessionDate to makeupDate
		const prevRes = await teacherJson("/api/holidays/preview", "POST", {
			name: "Nghỉ đột xuất",
			fromDate: futureMon,
			toDate: futureMon,
			scope: "org",
			mode: "shift",
			notify: false,
		});
		expect(prevRes.status).toBe(200);
		const previewBody = (await prevRes.json()) as {
			planHash: string;
			shifts: Array<{ originalDate: string; makeupDate: string }>;
		};
		const shift = previewBody.shifts.find((s) => s.originalDate === futureMon);
		expect(shift).toBeDefined();
		if (!shift) throw new Error("expected shift for futureMon");
		const makeupDate = shift.makeupDate;

		const applyRes = await teacherJson("/api/holidays", "POST", {
			name: "Nghỉ đột xuất",
			fromDate: futureMon,
			toDate: futureMon,
			scope: "org",
			mode: "shift",
			notify: false,
			planHash: previewBody.planHash,
		});
		expect(applyRes.status).toBe(200);
		const { holidayId } = (await applyRes.json()) as { holidayId: string };

		const [afterShift] = await db
			.select({ sessionDate: schema.classAssignment.sessionDate })
			.from(schema.classAssignment)
			.where(eq(schema.classAssignment.id, caId));
		expect(afterShift?.sessionDate).toBe(makeupDate);

		// 2. Undo holiday restores classAssignment.sessionDate -> futureMon
		const undoRes = await app.request(`/api/holidays/${holidayId}`, {
			method: "DELETE",
			headers: { origin: TEACHER_ORIGIN, "x-test-user": "teacher-1" },
		});
		expect(undoRes.status).toBe(200);

		const [afterUndo] = await db
			.select({ sessionDate: schema.classAssignment.sessionDate })
			.from(schema.classAssignment)
			.where(eq(schema.classAssignment.id, caId));
		expect(afterUndo?.sessionDate).toBe(futureMon);

		// 3. PATCH /classes/:id startDate reschedule remaps classAssignment.sessionDate -> futureNextMon
		const patchClass = await teacherJson(`/api/classes/${clsFuture}`, "PATCH", {
			name: "Future Sync Class",
			type: "ielts",
			level: "IELTS 6.5",
			skills: ["Writing"],
			mode: "Online",
			schedule: { days: [0, 3], start: "19:00", end: "20:30" },
			sessionsTotal: 2,
			startDate: futureNextMon,
		});
		expect(patchClass.status).toBe(200);

		const [afterReschedule] = await db
			.select({ sessionDate: schema.classAssignment.sessionDate })
			.from(schema.classAssignment)
			.where(eq(schema.classAssignment.id, caId));
		expect(afterReschedule?.sessionDate).toBe(futureNextMon);

		// 4. DELETE /classes/:id/sessions/:date (manual class) clears sessionDate to null
		const clsManual = "cls-manual-del";
		await db.insert(schema.classTable).values({
			id: clsManual,
			orgId: ORG_1,
			name: "Manual Delete Class",
			level: "IELTS 6.5",
			mode: "Online",
			schedule: "",
			schedulingMode: "manual",
			sessionsDone: 0,
			sessionsTotal: 1,
			startDate: futureNextMon,
			status: "active",
		});
		await db.insert(schema.enrollment).values({
			id: "enr-manual-del",
			orgId: ORG_1,
			classId: clsManual,
			studentId: STU_1,
			status: "active",
		});
		await db.insert(schema.classSession).values({
			id: "cs-manual-1",
			orgId: ORG_1,
			classId: clsManual,
			date: futureNextMon,
			time: "19:00",
			dur: 90,
			topic: "Manual Session",
		});
		await db.insert(schema.lesson).values({
			id: "lm-1",
			orgId: ORG_1,
			classId: clsManual,
			enrollmentId: "enr-manual-del",
			date: futureNextMon,
			day: 1,
			time: "19:00",
			dur: 90,
			status: "upcoming",
		});
		const caManualRes = await teacherJson(
			`/api/classes/${clsManual}/assignments`,
			"POST",
			{
				promptId: PROMPT_1,
				due: futureDue,
				studentIds: [STU_1],
				sessionDate: futureNextMon,
			},
		);
		expect(caManualRes.status).toBe(201);
		const { id: caManualId } = (await caManualRes.json()) as { id: string };

		const delRes = await app.request(
			`/api/classes/${clsManual}/sessions/${futureNextMon}`,
			{
				method: "DELETE",
				headers: { origin: TEACHER_ORIGIN, "x-test-user": "teacher-1" },
			},
		);
		expect(delRes.status).toBe(200);

		const [afterDelete] = await db
			.select({ sessionDate: schema.classAssignment.sessionDate })
			.from(schema.classAssignment)
			.where(eq(schema.classAssignment.id, caManualId));
		expect(afterDelete?.sessionDate).toBeNull();
	});
});
