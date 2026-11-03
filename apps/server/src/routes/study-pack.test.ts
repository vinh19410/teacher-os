import { createClient } from "@libsql/client";
import type {
	ClassStudyPacksResponse,
	StudyPackDetailView,
	StudyPackSummaryView,
} from "@teacher-os/api/contracts";
import {
	vietnamDateTimeMs,
	vietnamTodayISO,
} from "@teacher-os/api/vietnam-date";
import * as schema from "@teacher-os/db/schema/index";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";
import type { SessionUser } from "../session";
import { loadSnapshot } from "./snapshot";

const TEACHER_ORIGIN = "http://localhost:8001";
const STUDENT_ORIGIN = "http://localhost:8003";
const CORS_ORIGINS = [TEACHER_ORIGIN, STUDENT_ORIGIN];
const MIGRATIONS_DIR = new URL(
	"../../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

const sessionFor = async (headers: Headers): Promise<SessionUser | null> => {
	const userKey = headers.get("x-test-user");
	if (userKey === "teacher-1") {
		return {
			userId: "t-1",
			userName: "Cô Lan",
			email: "lan@test.local",
			emailVerified: true,
			role: "teacher",
		};
	}
	if (userKey === "teacher-2") {
		return {
			userId: "t-2",
			userName: "Thầy Nam",
			email: "nam@test.local",
			emailVerified: true,
			role: "teacher",
		};
	}
	if (userKey === "ta-1") {
		return {
			userId: "ta-1",
			userName: "Trợ giảng Tuấn",
			email: "tuan@test.local",
			emailVerified: true,
			role: "teacher",
		};
	}
	if (userKey === "student-1") {
		return {
			userId: "u-stu-1",
			userName: "Minh",
			email: "minh@student.local",
			emailVerified: true,
			role: "student",
		};
	}
	if (userKey === "student-late") {
		return {
			userId: "u-stu-late",
			userName: "Hà",
			email: "ha@student.local",
			emailVerified: true,
			role: "student",
		};
	}
	return null;
};

describe("study pack routes & student scheduled visibility (#533)", () => {
	let app: ServerApp;
	let db: Db;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const libsql = drizzle(client, { schema });
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;

		await db.insert(schema.organization).values([
			{ id: "org-1", name: "Academy 1" },
			{ id: "org-2", name: "Academy 2" },
		]);

		await db.insert(schema.user).values([
			{
				id: "t-1",
				name: "Cô Lan",
				email: "lan@test.local",
				role: "teacher",
			},
			{
				id: "t-2",
				name: "Thầy Nam",
				email: "nam@test.local",
				role: "teacher",
			},
			{
				id: "ta-1",
				name: "Trợ giảng Tuấn",
				email: "tuan@test.local",
				role: "teacher",
			},
		]);

		await db.insert(schema.membership).values([
			{ id: "mem-1", orgId: "org-1", userId: "t-1", role: "teacher" },
			{ id: "mem-2", orgId: "org-2", userId: "t-2", role: "teacher" },
			{ id: "mem-ta", orgId: "org-1", userId: "ta-1", role: "ta" },
		]);

		await db.insert(schema.student).values([
			{
				id: "stu-1",
				orgId: "org-1",
				name: "Minh",
				email: "minh@student.local",
				phone: "0901111111",
			},
			{
				id: "stu-late",
				orgId: "org-1",
				name: "Hà",
				email: "ha@student.local",
				phone: "0902222222",
			},
		]);

		await db.insert(schema.classTable).values({
			id: "class-1",
			orgId: "org-1",
			name: "IELTS 6.5",
			level: "6.5",
			type: "ielts",
			skills: '["reading","listening"]',
			mode: "Online",
			schedule: '{"days":[1,3,5],"start":"18:00","end":"20:00"}',
			sessionsTotal: 12,
			sessionsDone: 0,
			status: "active",
			startDate: "2026-11-01",
			notes: "",
		});

		await db.insert(schema.enrollment).values([
			{
				id: "enr-1",
				orgId: "org-1",
				classId: "class-1",
				studentId: "stu-1",
				status: "active",
			},
			{
				id: "enr-late",
				orgId: "org-1",
				classId: "class-1",
				studentId: "stu-late",
				status: "invited",
			},
		]);

		await db.insert(schema.assignmentPrompt).values([
			{
				id: "pr-grammar-1",
				orgId: "org-1",
				task: "task2",
				genre: "",
				skill: "grammar",
				part: "g1",
				type: "mcq",
				title: "Grammar Day 1",
				band: "6.5",
				source: "",
				prompt: "",
				questions: JSON.stringify([
					{
						stem: "If it ____ tomorrow, we will stay home.",
						opts: ["rains", "rained", "rain", "raining"],
						answer: "A",
						alts: "",
					},
				]),
				status: "ready",
			},
			{
				id: "pr-writing-1",
				orgId: "org-1",
				task: "task2",
				genre: "opinion",
				skill: "writing",
				part: "task2",
				type: "opinion",
				title: "Writing Task 2",
				band: "7.0",
				source: "",
				prompt: "<p>Write an essay.</p>",
				status: "ready",
			},
		]);

		await db.insert(schema.libraryExercise).values({
			id: "lex-vocab-1",
			skill: "vocabulary",
			part: "v1",
			type: "gap",
			title: "Sys Vocab Exercise",
			band: "6.5",
			intro: "<p>Complete the sentence.</p>",
			questions: JSON.stringify([
				{
					stem: "Renewable ____ is essential for the future.",
					opts: null,
					answer: "energy",
					alts: "",
				},
			]),
			status: "ready",
		});

		await db.insert(schema.studyPack).values([
			{
				id: "sys-pack-ready",
				orgId: null,
				title: "Bộ đề hệ thống Sẵn sàng",
				description: "Thư viện hệ thống",
				status: "ready",
			},
			{
				id: "sys-pack-draft",
				orgId: null,
				title: "Bộ đề hệ thống Nháp",
				description: "Chưa phát hành",
				status: "draft",
			},
		]);

		await db.insert(schema.studyPackItem).values({
			id: "sys-item-1",
			packId: "sys-pack-ready",
			dayIndex: 1,
			position: 0,
			sourceKind: "library_exercise",
			sourceId: "lex-vocab-1",
			note: "Ôn từ vựng ngày 1",
		});

		app = buildApp({
			getDb: () => db,
			authHandler: () => new Response(null, { status: 404 }),
			corsOrigin: CORS_ORIGINS,
			getSessionUser: sessionFor,
		});
	});

	function teacherHeaders(user = "teacher-1"): Record<string, string> {
		return {
			"x-test-user": user,
			Origin: TEACHER_ORIGIN,
			"Content-Type": "application/json",
		};
	}

	function studentHeaders(user = "student-1"): Record<string, string> {
		return {
			"x-test-user": user,
			Origin: STUDENT_ORIGIN,
			"Content-Type": "application/json",
		};
	}

	test("role gate, tenant isolation, draft system pack isolation, skill validation & idempotent clone", async () => {
		// Unauthenticated -> 401
		const unauthRes = await app.request("/api/study-packs");
		expect(unauthRes.status).toBe(401);

		// TA can GET (canReviewGrade) but cannot POST/PUT/DELETE (canPublishGrade -> 403)
		const taGetRes = await app.request("/api/study-packs", {
			headers: { "x-test-user": "ta-1" },
		});
		expect(taGetRes.status).toBe(200);
		const taList = (await taGetRes.json()) as { packs: StudyPackSummaryView[] };
		expect(taList.packs.map((p) => p.id)).toContain("sys-pack-ready");
		expect(taList.packs.map((p) => p.id)).not.toContain("sys-pack-draft");

		const taPostRes = await app.request("/api/study-packs", {
			method: "POST",
			headers: teacherHeaders("ta-1"),
			body: JSON.stringify({ title: "TA Pack", status: "draft", items: [] }),
		});
		expect(taPostRes.status).toBe(403);

		// Draft system pack is hidden on GET :id and POST :id/clone
		const draftDetailRes = await app.request(
			"/api/study-packs/sys-pack-draft",
			{
				headers: { "x-test-user": "teacher-1" },
			},
		);
		expect(draftDetailRes.status).toBe(404);

		const draftCloneRes = await app.request(
			"/api/study-packs/sys-pack-draft/clone",
			{
				method: "POST",
				headers: teacherHeaders("teacher-1"),
				body: "{}",
			},
		);
		expect(draftCloneRes.status).toBe(404);

		// Reject writing prompt in study pack -> 422
		const badSkillRes = await app.request("/api/study-packs", {
			method: "POST",
			headers: teacherHeaders("teacher-1"),
			body: JSON.stringify({
				title: "Writing Pack",
				status: "ready",
				items: [
					{
						dayIndex: 1,
						sourceKind: "org_prompt",
						sourceId: "pr-writing-1",
					},
				],
			}),
		});
		expect(badSkillRes.status).toBe(422);

		// Clone ready system pack twice -> idempotent, returns same pack id, does NOT bloat snapshot.assignmentPrompts
		const clone1Res = await app.request(
			"/api/study-packs/sys-pack-ready/clone",
			{
				method: "POST",
				headers: teacherHeaders("teacher-1"),
				body: "{}",
			},
		);
		expect(clone1Res.status).toBe(201);
		const clone1 = (await clone1Res.json()) as { pack: StudyPackDetailView };
		expect(clone1.pack.scope).toBe("org");
		expect(clone1.pack.orgId).toBe("org-1");
		expect(clone1.pack.sourcePackId).toBe("sys-pack-ready");
		expect(clone1.pack.items).toHaveLength(1);
		expect(clone1.pack.items[0]?.sourceKind).toBe("library_exercise");

		const clone2Res = await app.request(
			"/api/study-packs/sys-pack-ready/clone",
			{
				method: "POST",
				headers: teacherHeaders("teacher-1"),
				body: "{}",
			},
		);
		expect(clone2Res.status).toBe(201);
		const clone2 = (await clone2Res.json()) as { pack: StudyPackDetailView };
		expect(clone2.pack.id).toBe(clone1.pack.id);

		// Tenant isolation: teacher-2 in org-2 cannot read/update/delete org-1's cloned pack
		const crossGet = await app.request(`/api/study-packs/${clone1.pack.id}`, {
			headers: { "x-test-user": "teacher-2" },
		});
		expect(crossGet.status).toBe(404);

		const crossDel = await app.request(`/api/study-packs/${clone1.pack.id}`, {
			method: "DELETE",
			headers: teacherHeaders("teacher-2"),
		});
		expect(crossDel.status).toBe(404);
	});

	test("assign pack to class, student available_at 404 gate -> release -> submit, late enrollment backfill, cancel & 409 delete guard, and snapshot/200-cap isolation", async () => {
		// Create an org study pack with 2 days:
		// Day 1: pr-grammar-1
		// Day 2: lex-vocab-1
		const createRes = await app.request("/api/study-packs", {
			method: "POST",
			headers: teacherHeaders("teacher-1"),
			body: JSON.stringify({
				title: "Bộ đề tự học 2 ngày",
				description: "Ngữ pháp + Từ vựng",
				status: "ready",
				items: [
					{
						dayIndex: 1,
						sourceKind: "org_prompt",
						sourceId: "pr-grammar-1",
						note: "Lưu ý ngày 1",
					},
					{
						dayIndex: 2,
						sourceKind: "library_exercise",
						sourceId: "lex-vocab-1",
						note: "Lưu ý ngày 2",
					},
				],
			}),
		});
		expect(createRes.status).toBe(201);
		const { pack } = (await createRes.json()) as { pack: StudyPackDetailView };

		// Assign to class-1 starting today with releaseTime 00:00, dueTime 23:59
		// so Day 1 is released today and Day 2 is tomorrow (available_at > now).
		const todayISO = vietnamTodayISO();
		const assignRes = await app.request("/api/classes/class-1/study-packs", {
			method: "POST",
			headers: teacherHeaders("teacher-1"),
			body: JSON.stringify({
				packId: pack.id,
				startDate: todayISO,
				releaseTime: "00:00",
				dueTime: "23:59",
			}),
		});
		expect(assignRes.status).toBe(201);
		const assignedData = (await assignRes.json()) as ClassStudyPacksResponse;
		expect(assignedData.packs).toHaveLength(1);

		const classPack = assignedData.packs[0]!;
		expect(classPack.assignments).toHaveLength(2);
		const day1Assignment = classPack.assignments.find((a) => a.dayIndex === 1)!;
		const day2Assignment = classPack.assignments.find((a) => a.dayIndex === 2)!;
		expect(day1Assignment.isReleased).toBe(true);
		expect(day2Assignment.isReleased).toBe(false);

		// Idempotent retry of POST /api/classes/class-1/study-packs returns 200
		const retryRes = await app.request("/api/classes/class-1/study-packs", {
			method: "POST",
			headers: teacherHeaders("teacher-1"),
			body: JSON.stringify({
				packId: pack.id,
				startDate: todayISO,
				releaseTime: "00:00",
				dueTime: "23:59",
			}),
		});
		expect(retryRes.status).toBe(200);

		// Student 1 checks overview & class detail: sees ONLY Day 1, NOT Day 2!
		const overviewRes = await app.request("/api/student/overview", {
			headers: { "x-test-user": "student-1" },
		});
		expect(overviewRes.status).toBe(200);
		const overview = (await overviewRes.json()) as {
			assignments: Array<{ id: string }>;
		};
		expect(overview.assignments.map((a) => a.id)).toContain(
			day1Assignment.assignmentId,
		);
		expect(overview.assignments.map((a) => a.id)).not.toContain(
			day2Assignment.assignmentId,
		);

		// Student 1 directly accesses Day 2 quiz / start -> 404!
		const day2QuizRes = await app.request(
			`/api/student/assignments/${day2Assignment.assignmentId}/quiz`,
			{ headers: { "x-test-user": "student-1" } },
		);
		expect(day2QuizRes.status).toBe(404);

		const day2StartRes = await app.request(
			`/api/student/assignments/${day2Assignment.assignmentId}/quiz/start`,
			{
				method: "POST",
				headers: studentHeaders("student-1"),
				body: "{}",
			},
		);
		expect(day2StartRes.status).toBe(404);

		// Even if an attempt row were pre-seeded for unreleased Day 2, PATCH /answer, POST /submit, GET /attempts/:id all return 404!
		await db.insert(schema.quizAttempt).values({
			id: "att-unreleased-day2",
			orgId: "org-1",
			assignmentId: day2Assignment.assignmentId,
			studentId: "stu-1",
			status: "in_progress",
			questionsSnapshot: JSON.stringify([
				{
					stem: "Renewable ____ is essential for the future.",
					opts: null,
					answer: "energy",
					alts: "",
				},
			]),
			answers: "{}",
			startedAt: new Date(),
		});

		const unreleasedAnswerRes = await app.request(
			"/api/student/attempts/att-unreleased-day2/answer",
			{
				method: "PATCH",
				headers: studentHeaders("student-1"),
				body: JSON.stringify({ q: 0, value: "energy" }),
			},
		);
		expect(unreleasedAnswerRes.status).toBe(404);

		const unreleasedSubmitRes = await app.request(
			"/api/student/attempts/att-unreleased-day2/submit",
			{
				method: "POST",
				headers: studentHeaders("student-1"),
				body: "{}",
			},
		);
		expect(unreleasedSubmitRes.status).toBe(404);

		const unreleasedReviewRes = await app.request(
			"/api/student/attempts/att-unreleased-day2",
			{ headers: { "x-test-user": "student-1" } },
		);
		expect(unreleasedReviewRes.status).toBe(404);

		// Clean up the synthetic unreleased attempt row before testing normal flow
		await db
			.delete(schema.quizAttempt)
			.where(eq(schema.quizAttempt.id, "att-unreleased-day2"));

		// Student 1 takes & submits Day 1 (Grammar MCQ)
		const day1QuizRes = await app.request(
			`/api/student/assignments/${day1Assignment.assignmentId}/quiz`,
			{ headers: { "x-test-user": "student-1" } },
		);
		expect(day1QuizRes.status).toBe(200);

		const day1StartRes = await app.request(
			`/api/student/assignments/${day1Assignment.assignmentId}/quiz/start`,
			{
				method: "POST",
				headers: studentHeaders("student-1"),
				body: "{}",
			},
		);
		expect(day1StartRes.status).toBe(201);
		const { attemptId: day1AttemptId } = (await day1StartRes.json()) as {
			attemptId: string;
		};

		const day1AnswerRes = await app.request(
			`/api/student/attempts/${day1AttemptId}/answer`,
			{
				method: "PATCH",
				headers: studentHeaders("student-1"),
				body: JSON.stringify({ q: 0, value: "A" }),
			},
		);
		expect(day1AnswerRes.status).toBe(200);

		const day1SubmitRes = await app.request(
			`/api/student/attempts/${day1AttemptId}/submit`,
			{
				method: "POST",
				headers: studentHeaders("student-1"),
				body: "{}",
			},
		);
		expect(day1SubmitRes.status).toBe(200);
		const day1Grade = (await day1SubmitRes.json()) as {
			correctCount: number;
			totalCount: number;
		};
		expect(day1Grade).toMatchObject({ correctCount: 1, totalCount: 1 });

		// Shift Day 1 dueAt to the past so we can verify late student enrollment backfill:
		// Day 1 (dueAt <= now) should NOT be backfilled; Day 2 (dueAt > now) SHOULD be backfilled!
		await db
			.update(schema.classAssignment)
			.set({
				dueAt: new Date(Date.now() - 60_000),
			})
			.where(eq(schema.classAssignment.id, day1Assignment.assignmentId));

		// Late student accepts enrollment via POST /api/student/enrollments/enr-late/accept
		const acceptRes = await app.request(
			"/api/student/enrollments/enr-late/accept",
			{
				method: "POST",
				headers: studentHeaders("student-late"),
				body: "{}",
			},
		);
		expect(acceptRes.status).toBe(200);

		const lateTargets = await db
			.select()
			.from(schema.classAssignmentTarget)
			.where(
				and(
					eq(schema.classAssignmentTarget.orgId, "org-1"),
					eq(schema.classAssignmentTarget.studentId, "stu-late"),
				),
			);
		expect(lateTargets.map((t) => t.assignmentId)).toEqual([
			day2Assignment.assignmentId,
		]);

		// Now shift Day 2 availableAt to the past -> Student 1 and Student Late can both see & take Day 2!
		await db
			.update(schema.classAssignment)
			.set({
				availableAt: new Date(vietnamDateTimeMs("2026-11-01", "00:00")),
			})
			.where(eq(schema.classAssignment.id, day2Assignment.assignmentId));

		const day2QuizAfterRelease = await app.request(
			`/api/student/assignments/${day2Assignment.assignmentId}/quiz`,
			{ headers: { "x-test-user": "student-1" } },
		);
		expect(day2QuizAfterRelease.status).toBe(200);

		// Snapshot & 200-cap isolation:
		// loadSnapshot must NOT include study pack assignments or materialized library prompts
		const snapshot = await loadSnapshot(db, "org-1");
		expect(
			snapshot.classAssignments.some(
				(ca) =>
					ca.id === day1Assignment.assignmentId ||
					ca.id === day2Assignment.assignmentId,
			),
		).toBe(false);
		expect(
			snapshot.assignmentPrompts.some((p) => p.title === "Sys Vocab Exercise"),
		).toBe(false);

		// Cancel class study pack -> status becomes cancelled, Deleting the underlying study_pack still returns 409!
		const cancelRes = await app.request(
			`/api/classes/class-1/study-packs/${classPack.id}`,
			{
				method: "DELETE",
				headers: teacherHeaders("teacher-1"),
			},
		);
		expect(cancelRes.status).toBe(200);
		const afterCancel = (await cancelRes.json()) as ClassStudyPacksResponse;
		expect(afterCancel.packs[0]?.status).toBe("cancelled");

		const deleteReferencedPackRes = await app.request(
			`/api/study-packs/${pack.id}`,
			{
				method: "DELETE",
				headers: teacherHeaders("teacher-1"),
			},
		);
		expect(deleteReferencedPackRes.status).toBe(409);
	});
});
