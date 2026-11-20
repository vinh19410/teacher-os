import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import type {
	ClassStudyPacksResponse,
	StudyPackDetailView,
	StudyPackItemDetailView,
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
import { buildApp, type Db, type MediaStore, type ServerApp } from "../app";
import {
	extractAudioName,
	loadStudyPackItemDetail,
} from "../lib/study-pack-clone";
import type { SessionUser } from "../session";
import { loadSnapshot } from "./snapshot";

const TEACHER_ORIGIN = "http://localhost:8001";
const STUDENT_ORIGIN = "http://localhost:8003";
const CORS_ORIGINS = [TEACHER_ORIGIN, STUDENT_ORIGIN];
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);

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
	if (userKey === "viewer-1") {
		return {
			userId: "u-viewer-1",
			userName: "Viewer",
			email: "viewer@test.local",
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
	const fetchedAudioUrls: string[] = [];
	const libraryAudioObjects = new Map<
		string,
		{ bytes: Uint8Array; contentType: string }
	>();
	const libraryAudioStore: MediaStore = {
		async put(key, body, { contentType }) {
			const bytes = new Uint8Array(await new Response(body).arrayBuffer());
			libraryAudioObjects.set(key, { bytes, contentType });
		},
		async get(key) {
			const object = libraryAudioObjects.get(key);
			if (!object) return null;
			return {
				body: new Response(object.bytes).body as ReadableStream<Uint8Array>,
				contentType: object.contentType,
				size: object.bytes.byteLength,
			};
		},
		async delete(key) {
			libraryAudioObjects.delete(key);
		},
	};

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		await client.execute("PRAGMA foreign_keys = ON");
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
			{
				id: "u-viewer-1",
				name: "Viewer",
				email: "viewer@test.local",
				role: "teacher",
			},
		]);

		await db.insert(schema.membership).values([
			{ id: "mem-1", orgId: "org-1", userId: "t-1", role: "teacher" },
			{ id: "mem-2", orgId: "org-2", userId: "t-2", role: "teacher" },
			{ id: "mem-ta", orgId: "org-1", userId: "ta-1", role: "ta" },
			{
				id: "mem-viewer",
				orgId: "org-1",
				userId: "u-viewer-1",
				role: "viewer",
			},
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
			getLibraryAudioStore: () => libraryAudioStore,
			fetchExternalAudio: async (input, init) => {
				const url = typeof input === "string" ? input : input.toString();
				fetchedAudioUrls.push(url);
				if (url.includes("redirect-bad")) {
					if (init?.redirect === "manual") {
						return new Response(null, {
							status: 302,
							headers: { location: "https://evil.example.com/payload.mp3" },
						});
					}
					// Simulate Fetch following 302 into SSRF target if redirect !== "manual"
					fetchedAudioUrls.push("https://evil.example.com/payload.mp3");
					return new Response(new Uint8Array([0x49, 0x44, 0x33]), {
						status: 200,
						headers: { "content-type": "audio/mpeg" },
					});
				}
				return new Response(new Uint8Array([0x49, 0x44, 0x33, 0x03, 0, 0]), {
					status: 200,
					headers: { "content-type": "audio/mpeg" },
				});
			},
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

	test("concurrent POST /api/study-packs/:id/clone creates at most one clone row (#554)", async () => {
		await db.insert(schema.studyPack).values({
			id: "sys-pack-concurrent",
			orgId: null,
			title: "Bộ đề hệ thống đua song song",
			description: "Kiểm tra unique (org_id, source_pack_id)",
			status: "ready",
		});
		await db.insert(schema.studyPackItem).values([
			{
				id: "sys-conc-item-1",
				packId: "sys-pack-concurrent",
				dayIndex: 1,
				position: 0,
				sourceKind: "library_exercise",
				sourceId: "lex-vocab-1",
				note: "Ngày 1",
			},
			{
				id: "sys-conc-item-2",
				packId: "sys-pack-concurrent",
				dayIndex: 2,
				position: 0,
				sourceKind: "library_exercise",
				sourceId: "lex-vocab-1",
				note: "Ngày 2",
			},
		]);

		const fireClone = () =>
			app.request("/api/study-packs/sys-pack-concurrent/clone", {
				method: "POST",
				headers: teacherHeaders("teacher-1"),
				body: "{}",
			});

		const [resA, resB] = await Promise.all([fireClone(), fireClone()]);
		expect(resA.status).toBe(201);
		expect(resB.status).toBe(201);
		const bodyA = (await resA.json()) as { pack: StudyPackDetailView };
		const bodyB = (await resB.json()) as { pack: StudyPackDetailView };
		expect(bodyA.pack.id).toBe(bodyB.pack.id);
		expect(bodyA.pack.items).toHaveLength(2);
		expect(bodyB.pack.items).toHaveLength(2);

		const clonedRows = await db
			.select({ id: schema.studyPack.id })
			.from(schema.studyPack)
			.where(
				and(
					eq(schema.studyPack.orgId, "org-1"),
					eq(schema.studyPack.sourcePackId, "sys-pack-concurrent"),
				),
			);
		expect(clonedRows).toHaveLength(1);
	});

	test("editing an assigned study pack preserves kept item IDs and re-assigning same schedule does not duplicate class_assignment rows (#554)", async () => {
		await db.insert(schema.classTable).values({
			id: "class-reuse-edit",
			orgId: "org-1",
			name: "IELTS Reuse Edit",
			level: "6.5",
			type: "ielts",
			skills: '["reading","listening"]',
			mode: "Online",
			schedule: '{"days":[2,4],"start":"18:00","end":"20:00"}',
			sessionsTotal: 12,
			sessionsDone: 0,
			status: "active",
			startDate: "2026-10-01",
			notes: "",
		});
		await db.insert(schema.student).values({
			id: "stu-reuse-new",
			orgId: "org-1",
			name: "Phúc",
			email: "phuc@student.local",
			phone: "0903333333",
		});
		await db.insert(schema.enrollment).values({
			id: "enr-reuse-1",
			orgId: "org-1",
			classId: "class-reuse-edit",
			studentId: "stu-1",
			status: "active",
		});
		await db.insert(schema.assignmentPrompt).values([
			{
				id: "pr-grammar-2",
				orgId: "org-1",
				task: "task2",
				genre: "",
				skill: "grammar",
				part: "g1",
				type: "mcq",
				title: "Grammar Day 2 Original",
				band: "6.5",
				source: "",
				prompt: "",
				questions: JSON.stringify([
					{
						stem: "They ____ already left.",
						opts: ["have", "has", "is", "was"],
						answer: "A",
						alts: "",
					},
				]),
				status: "ready",
			},
			{
				id: "pr-grammar-3",
				orgId: "org-1",
				task: "task2",
				genre: "",
				skill: "grammar",
				part: "g1",
				type: "mcq",
				title: "Grammar Day 2 Replacement",
				band: "6.5",
				source: "",
				prompt: "",
				questions: JSON.stringify([
					{
						stem: "She ____ to school.",
						opts: ["walks", "walk", "walking", "walked"],
						answer: "A",
						alts: "",
					},
				]),
				status: "ready",
			},
		]);

		const createRes = await app.request("/api/study-packs", {
			method: "POST",
			headers: teacherHeaders("teacher-1"),
			body: JSON.stringify({
				title: "Bộ đề trước khi sửa",
				description: "2 ngày",
				status: "ready",
				items: [
					{
						dayIndex: 1,
						sourceKind: "org_prompt",
						sourceId: "pr-grammar-1",
						note: "Ghi chú cũ ngày 1",
					},
					{
						dayIndex: 20,
						sourceKind: "org_prompt",
						sourceId: "pr-grammar-2",
						note: "Ghi chú cũ ngày 20",
					},
				],
			}),
		});
		expect(createRes.status).toBe(201);
		const created = (await createRes.json()) as { pack: StudyPackDetailView };
		const originalDay1ItemId = created.pack.items[0]?.id;
		expect(originalDay1ItemId).toBeTruthy();

		// Start yesterday so Day 1 is already past-due (00:00..00:01 yesterday) while Day 20 is in the future!
		const yesterdayMs =
			vietnamDateTimeMs(vietnamTodayISO(), "12:00") - 86_400_000;
		const yesterdayISO = new Date(yesterdayMs + 7 * 3600_000)
			.toISOString()
			.slice(0, 10);

		const firstAssignRes = await app.request(
			"/api/classes/class-reuse-edit/study-packs",
			{
				method: "POST",
				headers: teacherHeaders("teacher-1"),
				body: JSON.stringify({
					packId: created.pack.id,
					startDate: yesterdayISO,
					releaseTime: "00:00",
					dueTime: "00:01",
				}),
			},
		);
		expect(firstAssignRes.status).toBe(201);

		// Teacher edits pack: keeps Day 1 (pr-grammar-1), replaces Day 20 with pr-grammar-3, adds Day 21 (lex-vocab-1)
		const putRes = await app.request(`/api/study-packs/${created.pack.id}`, {
			method: "PUT",
			headers: teacherHeaders("teacher-1"),
			body: JSON.stringify({
				title: "Bộ đề sau khi sửa",
				description: "Đã đổi bài",
				status: "ready",
				items: [
					{
						dayIndex: 1,
						sourceKind: "org_prompt",
						sourceId: "pr-grammar-1",
						note: "Ghi chú mới ngày 1",
					},
					{
						dayIndex: 20,
						sourceKind: "org_prompt",
						sourceId: "pr-grammar-3",
						note: "Đổi sang đề 3",
					},
					{
						dayIndex: 21,
						sourceKind: "library_exercise",
						sourceId: "lex-vocab-1",
						note: "Thêm ngày 21",
					},
				],
			}),
		});
		expect(putRes.status).toBe(200);
		const updated = (await putRes.json()) as { pack: StudyPackDetailView };
		expect(updated.pack.items[0]?.id).toBe(originalDay1ItemId);
		expect(updated.pack.items[0]?.note).toBe("Ghi chú mới ngày 1");

		// Switch pack to draft temporarily and enroll a late student
		const draftPutRes = await app.request(
			`/api/study-packs/${created.pack.id}`,
			{
				method: "PUT",
				headers: teacherHeaders("teacher-1"),
				body: JSON.stringify({
					title: "Bộ đề tạm chuyển draft",
					description: "Đang sửa",
					status: "draft",
					items: [],
				}),
			},
		);
		expect(draftPutRes.status).toBe(200);

		await db.insert(schema.enrollment).values({
			id: "enr-reuse-new",
			orgId: "org-1",
			classId: "class-reuse-edit",
			studentId: "stu-reuse-new",
			status: "active",
		});

		// Re-assigning with the SAME schedule returns 200 (reused), does NOT duplicate assignments,
		// and backfills stu-reuse-new ONLY into upcoming Day 20 (NOT past-due Day 1)!
		const reuseRes = await app.request(
			"/api/classes/class-reuse-edit/study-packs",
			{
				method: "POST",
				headers: teacherHeaders("teacher-1"),
				body: JSON.stringify({
					packId: created.pack.id,
					startDate: yesterdayISO,
					releaseTime: "00:00",
					dueTime: "00:01",
				}),
			},
		);
		expect(reuseRes.status).toBe(200);
		const reuseBody = (await reuseRes.json()) as ClassStudyPacksResponse;
		expect(reuseBody.packs).toHaveLength(1);
		const activePack = reuseBody.packs[0];
		expect(activePack?.assignments).toHaveLength(2);
		expect(activePack?.assignments.map((a) => a.promptId)).toEqual([
			"pr-grammar-1",
			"pr-grammar-2",
		]);
		expect(activePack?.assignments.map((a) => a.targetsTotal)).toEqual([1, 2]);
	});

	test("level metadata, clone/assign audio+transcript copy, teacher/student audio proxy & release gate (#702)", async () => {
		const validAudioUrl = "https://listenaminute.com/a/accidents.mp3";
		await db.insert(schema.libraryExercise).values([
			{
				id: "lex-listen-released",
				skill: "listening",
				part: "part1",
				type: "gap",
				title: "Accidents Listening",
				band: "5.0",
				level: "IELTS Foundation",
				audioUrl: validAudioUrl,
				transcript: "Accidents can happen anywhere.",
				intro: "<p>Listen and complete.</p>",
				questions: JSON.stringify([
					{
						stem: "Accidents can happen ____.",
						opts: null,
						answer: "anywhere",
						alts: "",
					},
				]),
				status: "ready",
			},
			{
				id: "lex-listen-future",
				skill: "listening",
				part: "part1",
				type: "gap",
				title: "Future Listening",
				band: "5.0",
				level: "IELTS Foundation",
				audioUrl: "https://lingua.com/audio/future.mp3",
				transcript: "Future transcript.",
				intro: "<p>Listen.</p>",
				questions: JSON.stringify([
					{
						stem: "Word ____.",
						opts: null,
						answer: "here",
						alts: "",
					},
				]),
				status: "ready",
			},
			{
				id: "lex-listen-redirect-bad",
				skill: "listening",
				part: "part1",
				type: "gap",
				title: "Evil Redirect Listening",
				band: "5.0",
				level: "IELTS Foundation",
				audioUrl: "https://listenaminute.com/a/redirect-bad.mp3",
				transcript: "Should not stream.",
				intro: "<p>Listen.</p>",
				questions: JSON.stringify([
					{
						stem: "Word ____.",
						opts: null,
						answer: "here",
						alts: "",
					},
				]),
				status: "ready",
			},
		]);

		await db.insert(schema.studyPack).values({
			id: "sys-pack-listening-level",
			orgId: null,
			title: "Listening Foundation Pack",
			description: "System pack with level + audio",
			level: "IELTS Foundation",
			status: "ready",
		});

		await db.insert(schema.studyPackItem).values([
			{
				id: "sys-listen-item-1",
				packId: "sys-pack-listening-level",
				dayIndex: 1,
				position: 0,
				sourceKind: "library_exercise",
				sourceId: "lex-listen-released",
				note: "",
			},
			{
				id: "sys-listen-item-2",
				packId: "sys-pack-listening-level",
				dayIndex: 2,
				position: 0,
				sourceKind: "library_exercise",
				sourceId: "lex-listen-future",
				note: "",
			},
		]);

		// Teacher previews library exercise audio via proxy
		const previewOk = await app.request(
			"/api/study-packs/exercises/lex-listen-released/audio",
			{ headers: { "x-test-user": "teacher-1" } },
		);
		expect(previewOk.status).toBe(200);
		expect(previewOk.headers.get("content-type")).toBe("audio/mpeg");
		expect(previewOk.headers.get("cross-origin-resource-policy")).toBe(
			"same-site",
		);

		// Redirect off audio host allowlist fails closed -> 404 (and never follows to evil host)
		const previewBad = await app.request(
			"/api/study-packs/exercises/lex-listen-redirect-bad/audio",
			{ headers: { "x-test-user": "teacher-1" } },
		);
		expect(previewBad.status).toBe(404);
		expect(
			fetchedAudioUrls.some((url) => url.includes("evil.example.com")),
		).toBe(false);

		// Clone system pack preserves pack.level and item.level
		const cloneRes = await app.request(
			"/api/study-packs/sys-pack-listening-level/clone",
			{
				method: "POST",
				headers: teacherHeaders("teacher-1"),
				body: "{}",
			},
		);
		expect(cloneRes.status).toBe(201);
		const { pack: cloned } = (await cloneRes.json()) as {
			pack: StudyPackDetailView;
		};
		expect(cloned.level).toBe("IELTS Foundation");
		expect(
			cloned.items.every((item) => item.level === "IELTS Foundation"),
		).toBe(true);

		// Assign directly to a fresh class (starting today 00:00 -> Day 1 released, Day 2 unreleased)
		await db.insert(schema.classTable).values({
			id: "class-listen-702",
			orgId: "org-1",
			name: "Foundation Class",
			level: "5.0",
			type: "ielts",
			skills: '["listening"]',
			mode: "Online",
			schedule: '{"days":[1],"start":"18:00","end":"20:00"}',
			sessionsTotal: 10,
			sessionsDone: 0,
			status: "active",
			startDate: vietnamTodayISO(),
			notes: "",
		});
		await db.insert(schema.enrollment).values({
			id: "enr-listen-702",
			orgId: "org-1",
			classId: "class-listen-702",
			studentId: "stu-1",
			status: "active",
		});

		const assignRes = await app.request(
			"/api/classes/class-listen-702/study-packs",
			{
				method: "POST",
				headers: teacherHeaders("teacher-1"),
				body: JSON.stringify({
					packId: cloned.id,
					startDate: vietnamTodayISO(),
					releaseTime: "00:00",
					dueTime: "23:59",
				}),
			},
		);
		expect(assignRes.status).toBe(201);
		const assignBody = (await assignRes.json()) as ClassStudyPacksResponse;
		const day1Assignment = assignBody.packs[0]?.assignments.find(
			(a) => a.dayIndex === 1,
		);
		const day2Assignment = assignBody.packs[0]?.assignments.find(
			(a) => a.dayIndex === 2,
		);
		expect(day1Assignment).toBeDefined();
		expect(day2Assignment).toBeDefined();

		// Materialized prompt carries level, audioUrl, audioName, transcript
		const [promptRow] = await db
			.select()
			.from(schema.assignmentPrompt)
			.where(eq(schema.assignmentPrompt.id, day1Assignment?.promptId ?? ""));
		expect(promptRow?.level).toBe("IELTS Foundation");
		expect(promptRow?.audioUrl).toBe(validAudioUrl);
		expect(promptRow?.audioName).toBe("accidents.mp3");
		expect(promptRow?.transcript).toBe("Accidents can happen anywhere.");

		// Day 2 unreleased student audio returns 404
		const day2AudioRes = await app.request(
			`/api/student/assignments/${day2Assignment?.assignmentId}/audio`,
			{ headers: studentHeaders("student-1") },
		);
		expect(day2AudioRes.status).toBe(404);

		// Day 1 released student audio streams 200 audio/mpeg
		const day1AudioRes = await app.request(
			`/api/student/assignments/${day1Assignment?.assignmentId}/audio`,
			{ headers: studentHeaders("student-1") },
		);
		expect(day1AudioRes.status).toBe(200);
		expect(day1AudioRes.headers.get("content-type")).toBe("audio/mpeg");
		expect(day1AudioRes.headers.get("cross-origin-resource-policy")).toBe(
			"same-site",
		);
	});

	test("item detail auth, tenant/pack isolation & 404 guards (#720)", async () => {
		await db.insert(schema.assignmentPrompt).values({
			id: "pr-org2-secret-720",
			orgId: "org-2",
			task: "task2",
			genre: "",
			skill: "reading",
			part: "p1",
			type: "tfng",
			title: "Org 2 Secret Prompt",
			band: "7.0",
			source: "",
			prompt: "",
			passage: "<p>Secret org-2 passage</p>",
			status: "ready",
		});

		await db.insert(schema.studyPack).values([
			{
				id: "pack-720-iso-a",
				orgId: "org-1",
				title: "Org 1 Pack A",
				description: "",
				status: "ready",
			},
			{
				id: "pack-720-iso-b",
				orgId: "org-1",
				title: "Org 1 Pack B",
				description: "",
				status: "ready",
			},
			{
				id: "pack-720-org-draft",
				orgId: "org-1",
				title: "Org 1 Draft Pack",
				description: "",
				status: "draft",
			},
		]);

		await db.insert(schema.studyPackItem).values([
			{
				id: "item-720-iso-a1",
				packId: "pack-720-iso-a",
				dayIndex: 1,
				position: 0,
				sourceKind: "library_exercise",
				sourceId: "lex-vocab-1",
				note: "Note A1",
			},
			{
				id: "item-720-missing-src",
				packId: "pack-720-iso-a",
				dayIndex: 2,
				position: 0,
				sourceKind: "library_exercise",
				sourceId: "lex-does-not-exist",
				note: "",
			},
			{
				id: "item-720-cross-org-prompt",
				packId: "pack-720-iso-a",
				dayIndex: 3,
				position: 0,
				sourceKind: "org_prompt",
				sourceId: "pr-org2-secret-720",
				note: "",
			},
			{
				id: "item-720-iso-b1",
				packId: "pack-720-iso-b",
				dayIndex: 1,
				position: 0,
				sourceKind: "org_prompt",
				sourceId: "pr-grammar-1",
				note: "Note B1",
			},
			{
				id: "item-720-org-draft-1",
				packId: "pack-720-org-draft",
				dayIndex: 1,
				position: 0,
				sourceKind: "org_prompt",
				sourceId: "pr-grammar-1",
				note: "Draft org note",
			},
			{
				id: "sys-draft-item-720",
				packId: "sys-pack-draft",
				dayIndex: 1,
				position: 0,
				sourceKind: "library_exercise",
				sourceId: "lex-vocab-1",
				note: "",
			},
		]);

		// 401 unauthenticated
		const unauthRes = await app.request(
			"/api/study-packs/pack-720-iso-a/items/item-720-iso-a1",
		);
		expect(unauthRes.status).toBe(401);

		// 403 student
		const stuRes = await app.request(
			"/api/study-packs/pack-720-iso-a/items/item-720-iso-a1",
			{ headers: { "x-test-user": "student-1" } },
		);
		expect(stuRes.status).toBe(403);

		// 403 disallowed org membership role (not in GRADING_REVIEW_ROLES)
		const viewerRes = await app.request(
			"/api/study-packs/pack-720-iso-a/items/item-720-iso-a1",
			{ headers: { "x-test-user": "viewer-1" } },
		);
		expect(viewerRes.status).toBe(403);

		// 200 allowed for ta-1 on both org pack and ready system pack
		const taOrgRes = await app.request(
			"/api/study-packs/pack-720-iso-a/items/item-720-iso-a1",
			{ headers: { "x-test-user": "ta-1" } },
		);
		expect(taOrgRes.status).toBe(200);

		const taSysRes = await app.request(
			"/api/study-packs/sys-pack-ready/items/sys-item-1",
			{ headers: { "x-test-user": "ta-1" } },
		);
		expect(taSysRes.status).toBe(200);

		// 200 allowed for teacher-1 on own org draft pack item
		const draftOrgRes = await app.request(
			"/api/study-packs/pack-720-org-draft/items/item-720-org-draft-1",
			{ headers: { "x-test-user": "teacher-1" } },
		);
		expect(draftOrgRes.status).toBe(200);

		// 404 cross-org access (teacher-2 in org-2 reading org-1 pack item)
		const crossOrgRes = await app.request(
			"/api/study-packs/pack-720-iso-a/items/item-720-iso-a1",
			{ headers: { "x-test-user": "teacher-2" } },
		);
		expect(crossOrgRes.status).toBe(404);

		// 200 teacher-2 can read ready system pack item
		const teacher2SysRes = await app.request(
			"/api/study-packs/sys-pack-ready/items/sys-item-1",
			{ headers: { "x-test-user": "teacher-2" } },
		);
		expect(teacher2SysRes.status).toBe(200);

		// 404 draft system pack item
		const sysDraftRes = await app.request(
			"/api/study-packs/sys-pack-draft/items/sys-draft-item-720",
			{ headers: { "x-test-user": "teacher-1" } },
		);
		expect(sysDraftRes.status).toBe(404);

		// 404 item belonging to another pack (packA + itemFromPackB)
		const wrongPackRes = await app.request(
			"/api/study-packs/pack-720-iso-a/items/item-720-iso-b1",
			{ headers: { "x-test-user": "teacher-1" } },
		);
		expect(wrongPackRes.status).toBe(404);

		// 404 nonexistent packId / itemId
		const missingPackRes = await app.request(
			"/api/study-packs/pack-does-not-exist/items/item-720-iso-a1",
			{ headers: { "x-test-user": "teacher-1" } },
		);
		expect(missingPackRes.status).toBe(404);

		const missingItemRes = await app.request(
			"/api/study-packs/pack-720-iso-a/items/item-does-not-exist",
			{ headers: { "x-test-user": "teacher-1" } },
		);
		expect(missingItemRes.status).toBe(404);

		// 404 missing backing record & cross-org org_prompt defense-in-depth
		const missingSourceRes = await app.request(
			"/api/study-packs/pack-720-iso-a/items/item-720-missing-src",
			{ headers: { "x-test-user": "teacher-1" } },
		);
		expect(missingSourceRes.status).toBe(404);

		const crossOrgPromptRes = await app.request(
			"/api/study-packs/pack-720-iso-a/items/item-720-cross-org-prompt",
			{ headers: { "x-test-user": "teacher-1" } },
		);
		expect(crossOrgPromptRes.status).toBe(404);

		expect(
			await loadStudyPackItemDetail(
				db,
				"pack-720-iso-a",
				"item-720-cross-org-prompt",
			),
		).toBeNull();
		expect(extractAudioName("   ")).toBe("");
		expect(extractAudioName("https://listenaminute.com/a/")).toBe(
			"listening.mp3",
		);
	});

	test("item detail resolves full content for library_exercise, org_prompt & library_test_part without leaking audioUrl (#720)", async () => {
		await db.insert(schema.libraryExercise).values([
			{
				id: "lex-720-detail-audio",
				skill: "listening",
				part: "part2",
				type: "mcq",
				title: "Airport Announcement 720",
				band: "6.5",
				level: "Pre IELTS",
				intro: "<p>Listen carefully to the announcement.</p>",
				passage: "<p>Departure board summary</p>",
				audioUrl: "https://listenaminute.com/a/airport-720.mp3",
				transcript: "Flight 204 departs from Gate 7.",
				questions: JSON.stringify([
					{
						stem: "Which gate?",
						opts: ["Gate 5", "Gate 7", "Gate 9"],
						answer: "B",
						alts: "Gate 7",
						explanation: "<p>The speaker states Gate 7.</p>",
					},
				]),
				optionBank: JSON.stringify(["Gate 5", "Gate 7", "Gate 9"]),
				note: "Exercise-level listening hint",
				status: "ready",
			},
			{
				id: "lex-720-no-audio",
				skill: "grammar",
				part: "g2",
				type: "gap",
				title: "Conditionals Drill",
				band: "6.0",
				level: "IELTS Foundation",
				intro: "<p>Fill in the blank.</p>",
				passage: "",
				audioUrl: "   ",
				transcript: "",
				questions: JSON.stringify([
					{
						stem: "If I ____ rich, I would travel.",
						opts: null,
						answer: "were",
						alts: "was",
					},
				]),
				optionBank: "[]",
				note: "Exercise grammar note",
				status: "ready",
			},
			{
				id: "lex-720-redirect-bad",
				skill: "listening",
				part: "part1",
				type: "gap",
				title: "Bad Redirect Exercise",
				band: "5.5",
				level: "IELTS Foundation",
				audioUrl: "https://listenaminute.com/a/redirect-bad-720.mp3",
				questions: JSON.stringify([
					{ stem: "Word ____.", opts: null, answer: "ok", alts: "" },
				]),
				status: "ready",
			},
		]);

		await db.insert(schema.assignmentPrompt).values([
			{
				id: "pr-720-detail-full",
				orgId: "org-1",
				task: "task2",
				genre: "",
				skill: "reading",
				part: "p2",
				type: "tfng",
				title: "Org Reading Prompt 720",
				band: "7.5",
				level: "IELTS Advanced",
				source: "Cambridge 19 Test 2",
				prompt: "<p>Read the article below.</p>",
				intro: "<p>Choose TRUE, FALSE or NOT GIVEN.</p>",
				passage: "<p>Arctic ice melted faster than expected.</p>",
				transcript: "Optional companion audio transcript.",
				audioName: "arctic-custom-name.mp3",
				audioUrl: "https://lingua.com/audio/arctic-720.mp3",
				imageUrl: "https://cdn.example.com/arctic-720.png",
				questions: JSON.stringify([
					{
						stem: "Ice melted slower than forecast.",
						opts: null,
						answer: "FALSE",
						alts: "F",
						explanation: "<p>Paragraph 1 explicitly states faster.</p>",
					},
				]),
				optionBank: JSON.stringify(["TRUE", "FALSE", "NOT GIVEN"]),
				note: "Prompt-level teacher note",
				status: "ready",
			},
			{
				id: "pr-720-no-audio-stale",
				orgId: "org-1",
				task: "task2",
				genre: "",
				skill: "listening",
				part: "s1",
				type: "gap",
				title: "Prompt Without Audio",
				band: "6.0",
				source: "Custom Sheet",
				prompt: "<p>Prompt body</p>",
				audioName: "stale-name-ignored.mp3",
				audioUrl: "",
				questions: JSON.stringify([
					{ stem: "Name: ____", opts: null, answer: "Alice", alts: "" },
				]),
				status: "ready",
			},
			{
				id: "pr-720-redirect-bad",
				orgId: "org-1",
				task: "task2",
				genre: "",
				skill: "listening",
				part: "s2",
				type: "gap",
				title: "Prompt Redirect Bad",
				band: "6.5",
				prompt: "",
				audioUrl: "https://lingua.com/audio/redirect-bad-prompt.mp3",
				questions: JSON.stringify([
					{ stem: "Word ____.", opts: null, answer: "test", alts: "" },
				]),
				status: "ready",
			},
		]);

		await db.insert(schema.libraryTest).values({
			id: "lt-720-read",
			title: "Cambridge 17 Test 4",
			skill: "reading",
			status: "ready",
		});

		await db.insert(schema.libraryTestPart).values({
			id: "ltp-720-p1",
			testId: "lt-720-read",
			part: "p1",
			type: "",
			title: "",
			band: "7.0",
			source: "Cambridge 17",
			intro: "<p>Read the passage carefully.</p>",
			passage: "<p>The history of glassmaking.</p>",
			transcript: "",
			imageUrl: "https://cdn.example.com/glass-720.png",
			audioName: "ignored-without-url.mp3",
			questions: JSON.stringify([
				{
					stem: "Glass was first made in Egypt.",
					opts: null,
					answer: "TRUE",
					alts: "",
					explanation: "<p>Early evidence points to Egypt.</p>",
				},
				{
					stem: "Lead glass invention",
					opts: null,
					answer: "A",
					alts: "",
					answerSet: "pair-1",
				},
			]),
			optionBank: "[]",
			groups: JSON.stringify([
				{
					id: "grp-1",
					type: "tfng",
					instruction: "<p>Write TRUE, FALSE or NOT GIVEN.</p>",
					startIndex: 0,
					count: 1,
					optionBank: [],
					answersInline: false,
					splitContent: false,
					dragDrop: false,
				},
				{
					id: "grp-2",
					type: "match_features",
					instruction: "<p>Match each invention to a scientist.</p>",
					startIndex: 1,
					count: 1,
					optionBank: ["Ravenscroft", "Faraday"],
					answersInline: false,
					splitContent: false,
					dragDrop: false,
				},
			]),
			note: "Library part note 720",
		});

		await db.insert(schema.studyPack).values({
			id: "pack-720-all-kinds",
			orgId: "org-1",
			title: "Pack All Kinds 720",
			description: "All 3 source kinds",
			level: "IELTS Advanced",
			status: "ready",
		});

		await db.insert(schema.studyPackItem).values([
			{
				id: "item-720-lex",
				packId: "pack-720-all-kinds",
				dayIndex: 1,
				position: 0,
				sourceKind: "library_exercise",
				sourceId: "lex-720-detail-audio",
				note: "Pack note for exercise",
			},
			{
				id: "item-720-prompt",
				packId: "pack-720-all-kinds",
				dayIndex: 2,
				position: 0,
				sourceKind: "org_prompt",
				sourceId: "pr-720-detail-full",
				note: "Pack note for org prompt",
			},
			{
				id: "item-720-part",
				packId: "pack-720-all-kinds",
				dayIndex: 3,
				position: 0,
				sourceKind: "library_test_part",
				sourceId: "ltp-720-p1",
				note: "Pack note for library part",
			},
			{
				id: "item-720-lex-no-audio",
				packId: "pack-720-all-kinds",
				dayIndex: 4,
				position: 0,
				sourceKind: "library_exercise",
				sourceId: "lex-720-no-audio",
				note: "",
			},
			{
				id: "item-720-prompt-stale-audio",
				packId: "pack-720-all-kinds",
				dayIndex: 5,
				position: 0,
				sourceKind: "org_prompt",
				sourceId: "pr-720-no-audio-stale",
				note: "",
			},
			{
				id: "item-720-lex-redirect-bad",
				packId: "pack-720-all-kinds",
				dayIndex: 6,
				position: 0,
				sourceKind: "library_exercise",
				sourceId: "lex-720-redirect-bad",
				note: "",
			},
			{
				id: "item-720-prompt-redirect-bad",
				packId: "pack-720-all-kinds",
				dayIndex: 7,
				position: 0,
				sourceKind: "org_prompt",
				sourceId: "pr-720-redirect-bad",
				note: "",
			},
		]);

		// 1. library_exercise detail
		const lexRes = await app.request(
			"/api/study-packs/pack-720-all-kinds/items/item-720-lex",
			{ headers: { "x-test-user": "teacher-1" } },
		);
		expect(lexRes.status).toBe(200);
		const lexJson = (await lexRes.json()) as {
			item: StudyPackItemDetailView & Record<string, unknown>;
		};
		expect("audioUrl" in lexJson.item).toBe(false);
		expect(lexJson.item).toEqual({
			id: "item-720-lex",
			dayIndex: 1,
			position: 0,
			sourceKind: "library_exercise",
			sourceId: "lex-720-detail-audio",
			title: "Airport Announcement 720",
			skill: "listening",
			part: "part2",
			type: "mcq",
			level: "Pre IELTS",
			status: "ready",
			note: "Pack note for exercise",
			band: "6.5",
			source: "",
			prompt: "",
			intro: "<p>Listen carefully to the announcement.</p>",
			passage: "<p>Departure board summary</p>",
			transcript: "Flight 204 departs from Gate 7.",
			audioName: "airport-720.mp3",
			hasAudio: true,
			imageUrl: "",
			questions: [
				{
					stem: "Which gate?",
					opts: ["Gate 5", "Gate 7", "Gate 9"],
					answer: "B",
					alts: "Gate 7",
					explanation: "<p>The speaker states Gate 7.</p>",
				},
			],
			optionBank: ["Gate 5", "Gate 7", "Gate 9"],
			exerciseNote: "Exercise-level listening hint",
		});

		// 2. org_prompt detail (with audio + imageUrl + source + prompt + explanation)
		const promptRes = await app.request(
			"/api/study-packs/pack-720-all-kinds/items/item-720-prompt",
			{ headers: { "x-test-user": "teacher-1" } },
		);
		expect(promptRes.status).toBe(200);
		const promptJson = (await promptRes.json()) as {
			item: StudyPackItemDetailView & Record<string, unknown>;
		};
		expect("audioUrl" in promptJson.item).toBe(false);
		expect(promptJson.item).toEqual({
			id: "item-720-prompt",
			dayIndex: 2,
			position: 0,
			sourceKind: "org_prompt",
			sourceId: "pr-720-detail-full",
			title: "Org Reading Prompt 720",
			skill: "reading",
			part: "p2",
			type: "tfng",
			level: "IELTS Advanced",
			status: "ready",
			note: "Pack note for org prompt",
			band: "7.5",
			source: "Cambridge 19 Test 2",
			prompt: "<p>Read the article below.</p>",
			intro: "<p>Choose TRUE, FALSE or NOT GIVEN.</p>",
			passage: "<p>Arctic ice melted faster than expected.</p>",
			transcript: "Optional companion audio transcript.",
			audioName: "arctic-custom-name.mp3",
			hasAudio: true,
			imageUrl: "https://cdn.example.com/arctic-720.png",
			questions: [
				{
					stem: "Ice melted slower than forecast.",
					opts: null,
					answer: "FALSE",
					alts: "F",
					explanation: "<p>Paragraph 1 explicitly states faster.</p>",
				},
			],
			optionBank: ["TRUE", "FALSE", "NOT GIVEN"],
			exerciseNote: "Prompt-level teacher note",
		});

		// 2b. org_prompt without audioUrl suppresses stale audioName
		const promptNoAudioRes = await app.request(
			"/api/study-packs/pack-720-all-kinds/items/item-720-prompt-stale-audio",
			{ headers: { "x-test-user": "teacher-1" } },
		);
		expect(promptNoAudioRes.status).toBe(200);
		const promptNoAudioJson = (await promptNoAudioRes.json()) as {
			item: StudyPackItemDetailView & Record<string, unknown>;
		};
		expect("audioUrl" in promptNoAudioJson.item).toBe(false);
		expect(promptNoAudioJson.item.hasAudio).toBe(false);
		expect(promptNoAudioJson.item.audioName).toBe("");

		// 3. library_test_part detail (flattened groups, title fallback, explanation, answerSet)
		const partRes = await app.request(
			"/api/study-packs/pack-720-all-kinds/items/item-720-part",
			{ headers: { "x-test-user": "teacher-1" } },
		);
		expect(partRes.status).toBe(200);
		const partJson = (await partRes.json()) as {
			item: StudyPackItemDetailView & Record<string, unknown>;
		};
		expect("audioUrl" in partJson.item).toBe(false);
		expect(partJson.item).toEqual({
			id: "item-720-part",
			dayIndex: 3,
			position: 0,
			sourceKind: "library_test_part",
			sourceId: "ltp-720-p1",
			title: "Cambridge 17 Test 4 — P1",
			skill: "reading",
			part: "p1",
			type: "tfng",
			level: "",
			status: "ready",
			note: "Pack note for library part",
			band: "7.0",
			source: "Cambridge 17",
			prompt: "",
			intro:
				"<p>Read the passage carefully.</p>\n<p>Write TRUE, FALSE or NOT GIVEN.</p>\n<p>Match each invention to a scientist.</p>",
			passage: "<p>The history of glassmaking.</p>",
			transcript: "",
			audioName: "",
			hasAudio: false,
			imageUrl: "https://cdn.example.com/glass-720.png",
			questions: [
				{
					stem: "Glass was first made in Egypt.",
					opts: null,
					answer: "TRUE",
					alts: "",
					type: "tfng",
					explanation: "<p>Early evidence points to Egypt.</p>",
				},
				{
					stem: "Lead glass invention",
					opts: null,
					answer: "A",
					alts: "",
					type: "match_features",
					answerSet: "pair-1",
				},
			],
			optionBank: ["Ravenscroft", "Faraday"],
			exerciseNote: "Library part note 720",
		});
	});

	test("item audio proxy auth, isolation, streaming, security headers & SSRF redirect block (#720)", async () => {
		// 401 unauthenticated
		const unauthAudio = await app.request(
			"/api/study-packs/pack-720-all-kinds/items/item-720-lex/audio",
		);
		expect(unauthAudio.status).toBe(401);

		// 403 student & disallowed viewer role
		const stuAudio = await app.request(
			"/api/study-packs/pack-720-all-kinds/items/item-720-lex/audio",
			{ headers: { "x-test-user": "student-1" } },
		);
		expect(stuAudio.status).toBe(403);

		const viewerAudio = await app.request(
			"/api/study-packs/pack-720-all-kinds/items/item-720-lex/audio",
			{ headers: { "x-test-user": "viewer-1" } },
		);
		expect(viewerAudio.status).toBe(403);

		// 404 cross-org, draft system pack, wrong pack, missing audio (exercise, prompt, test part)
		const crossOrgAudio = await app.request(
			"/api/study-packs/pack-720-all-kinds/items/item-720-lex/audio",
			{ headers: { "x-test-user": "teacher-2" } },
		);
		expect(crossOrgAudio.status).toBe(404);

		const sysDraftAudio = await app.request(
			"/api/study-packs/sys-pack-draft/items/sys-draft-item-720/audio",
			{ headers: { "x-test-user": "teacher-1" } },
		);
		expect(sysDraftAudio.status).toBe(404);

		const wrongPackAudio = await app.request(
			"/api/study-packs/pack-720-iso-a/items/item-720-lex/audio",
			{ headers: { "x-test-user": "teacher-1" } },
		);
		expect(wrongPackAudio.status).toBe(404);

		const missingLexAudio = await app.request(
			"/api/study-packs/pack-720-all-kinds/items/item-720-lex-no-audio/audio",
			{ headers: { "x-test-user": "teacher-1" } },
		);
		expect(missingLexAudio.status).toBe(404);

		const missingPromptAudio = await app.request(
			"/api/study-packs/pack-720-all-kinds/items/item-720-prompt-stale-audio/audio",
			{ headers: { "x-test-user": "teacher-1" } },
		);
		expect(missingPromptAudio.status).toBe(404);

		const missingPartAudio = await app.request(
			"/api/study-packs/pack-720-all-kinds/items/item-720-part/audio",
			{ headers: { "x-test-user": "teacher-1" } },
		);
		expect(missingPartAudio.status).toBe(404);

		// 200 streaming for library_exercise (teacher-1 & ta-1) + system pack item
		const lexAudioRes = await app.request(
			"/api/study-packs/pack-720-all-kinds/items/item-720-lex/audio",
			{ headers: { "x-test-user": "teacher-1" } },
		);
		expect(lexAudioRes.status).toBe(200);
		expect(lexAudioRes.headers.get("content-type")).toBe("audio/mpeg");
		expect(lexAudioRes.headers.get("cross-origin-resource-policy")).toBe(
			"same-site",
		);
		expect(lexAudioRes.headers.get("referrer-policy")).toBe("no-referrer");
		expect(lexAudioRes.headers.get("x-content-type-options")).toBe("nosniff");
		expect(new Uint8Array(await lexAudioRes.arrayBuffer())).toEqual(
			new Uint8Array([0x49, 0x44, 0x33, 0x03, 0, 0]),
		);

		const taAudioRes = await app.request(
			"/api/study-packs/sys-pack-listening-level/items/sys-listen-item-1/audio",
			{ headers: { "x-test-user": "ta-1" } },
		);
		expect(taAudioRes.status).toBe(200);
		expect(taAudioRes.headers.get("content-type")).toBe("audio/mpeg");
		expect(taAudioRes.headers.get("cross-origin-resource-policy")).toBe(
			"same-site",
		);
		expect(taAudioRes.headers.get("referrer-policy")).toBe("no-referrer");

		// 200 streaming for org_prompt
		const promptAudioRes = await app.request(
			"/api/study-packs/pack-720-all-kinds/items/item-720-prompt/audio",
			{ headers: { "x-test-user": "teacher-1" } },
		);
		expect(promptAudioRes.status).toBe(200);
		expect(promptAudioRes.headers.get("content-type")).toBe("audio/mpeg");
		expect(promptAudioRes.headers.get("cross-origin-resource-policy")).toBe(
			"same-site",
		);
		expect(promptAudioRes.headers.get("referrer-policy")).toBe("no-referrer");
		expect(new Uint8Array(await promptAudioRes.arrayBuffer())).toEqual(
			new Uint8Array([0x49, 0x44, 0x33, 0x03, 0, 0]),
		);

		// SSRF redirect block for both library_exercise and org_prompt
		const badLexRedirect = await app.request(
			"/api/study-packs/pack-720-all-kinds/items/item-720-lex-redirect-bad/audio",
			{ headers: { "x-test-user": "teacher-1" } },
		);
		expect(badLexRedirect.status).toBe(404);

		const badPromptRedirect = await app.request(
			"/api/study-packs/pack-720-all-kinds/items/item-720-prompt-redirect-bad/audio",
			{ headers: { "x-test-user": "teacher-1" } },
		);
		expect(badPromptRedirect.status).toBe(404);
		expect(
			fetchedAudioUrls.some((url) => url.includes("evil.example.com")),
		).toBe(false);
	});

	test("streams R2 audioKey across exercise, item, materialized prompt & student assignment (#814)", async () => {
		const r2Key = "study-packs/first-step-gt2/sysex-r2-listen-814.mp3";
		const r2Bytes = new Uint8Array([0xff, 0xfb, 0x10, 0xc4, 0xaa, 0xbb]);
		libraryAudioObjects.set(r2Key, {
			bytes: r2Bytes,
			contentType: "audio/mpeg",
		});

		await db.insert(schema.libraryExercise).values([
			{
				id: "lex-r2-listen-814",
				skill: "listening",
				part: "s1",
				type: "notes",
				title: "R2 Listening Exercise 814",
				band: "5.5",
				level: "IELTS First Step",
				intro: "Listen and fill in the blank.",
				passage: "",
				audioUrl: "",
				audioKey: r2Key,
				transcript: "Transcript text for 814.",
				questions: JSON.stringify([
					{
						stem: "The ticket costs ____ pounds.",
						opts: null,
						answer: "12",
						alts: "",
					},
				]),
				optionBank: "[]",
				note: "",
				status: "ready",
			},
			{
				id: "lex-r2-missing-814",
				skill: "listening",
				part: "s1",
				type: "notes",
				title: "R2 Missing Audio 814",
				band: "5.5",
				level: "IELTS First Step",
				intro: "Listen.",
				passage: "",
				audioUrl: "",
				audioKey: "study-packs/first-step-gt2/missing-814.mp3",
				transcript: "Transcript.",
				questions: JSON.stringify([
					{ stem: "Q1 ____", opts: null, answer: "yes", alts: "" },
				]),
				optionBank: "[]",
				note: "",
				status: "ready",
			},
		]);

		await db.insert(schema.studyPack).values({
			id: "sys-pack-r2-814",
			orgId: null,
			title: "R2 Pack 814",
			description: "",
			level: "IELTS First Step",
			status: "ready",
		});
		await db.insert(schema.studyPackItem).values([
			{
				id: "item-r2-814-1",
				packId: "sys-pack-r2-814",
				dayIndex: 1,
				position: 0,
				sourceKind: "library_exercise",
				sourceId: "lex-r2-listen-814",
				note: "",
			},
			{
				id: "item-r2-814-missing",
				packId: "sys-pack-r2-814",
				dayIndex: 2,
				position: 0,
				sourceKind: "library_exercise",
				sourceId: "lex-r2-missing-814",
				note: "",
			},
		]);

		// Detail exposes hasAudio + audioName, never audioKey
		const detailRes = await app.request(
			"/api/study-packs/sys-pack-r2-814/items/item-r2-814-1",
			{ headers: { "x-test-user": "teacher-1" } },
		);
		expect(detailRes.status).toBe(200);
		const detailBody = (await detailRes.json()) as {
			item: StudyPackItemDetailView;
		};
		expect(detailBody.item.hasAudio).toBe(true);
		expect(detailBody.item.audioName).toBe("sysex-r2-listen-814.mp3");
		expect(JSON.stringify(detailBody)).not.toContain(r2Key);

		// Exercise & item audio stream R2 bytes
		for (const path of [
			"/api/study-packs/exercises/lex-r2-listen-814/audio",
			"/api/study-packs/sys-pack-r2-814/items/item-r2-814-1/audio",
		]) {
			const res = await app.request(path, {
				headers: { "x-test-user": "teacher-1" },
			});
			expect(res.status).toBe(200);
			expect(res.headers.get("content-type")).toBe("audio/mpeg");
			expect(res.headers.get("cross-origin-resource-policy")).toBe("same-site");
			expect(new Uint8Array(await res.arrayBuffer())).toEqual(r2Bytes);
		}

		// Missing R2 object -> 404
		const missingObjRes = await app.request(
			"/api/study-packs/exercises/lex-r2-missing-814/audio",
			{ headers: { "x-test-user": "teacher-1" } },
		);
		expect(missingObjRes.status).toBe(404);

		// Assign pack to class -> materializes assignment_prompt with audioKey
		const assignRes = await app.request("/api/classes/class-1/study-packs", {
			method: "POST",
			headers: teacherHeaders(),
			body: JSON.stringify({
				packId: "sys-pack-r2-814",
				startDate: "2025-01-01",
				releaseTime: "06:00",
				dueTime: "17:00",
			}),
		});
		expect(assignRes.status).toBe(201);
		const assignBody = (await assignRes.json()) as ClassStudyPacksResponse;
		const day1Assign = assignBody.packs[0]?.assignments.find(
			(a) => a.dayIndex === 1,
		);
		expect(day1Assign).toBeDefined();
		if (!day1Assign) return;

		const [caRow] = await db
			.select({ promptId: schema.classAssignment.promptId })
			.from(schema.classAssignment)
			.where(eq(schema.classAssignment.id, day1Assign.assignmentId));
		expect(caRow?.promptId).toBeDefined();
		if (!caRow) return;

		const [promptRow] = await db
			.select({ audioKey: schema.assignmentPrompt.audioKey })
			.from(schema.assignmentPrompt)
			.where(eq(schema.assignmentPrompt.id, caRow.promptId));
		expect(promptRow?.audioKey).toBe(r2Key);

		// Teacher prompt audio endpoint streams R2 bytes
		const promptAudioRes = await app.request(
			`/api/assignments/prompts/${caRow.promptId}/audio`,
			{ headers: { "x-test-user": "teacher-1" } },
		);
		expect(promptAudioRes.status).toBe(200);
		expect(new Uint8Array(await promptAudioRes.arrayBuffer())).toEqual(r2Bytes);

		// Student quiz detail + audio endpoint stream R2 bytes (without leaking audioKey)
		const studentQuizRes = await app.request(
			`/api/student/assignments/${day1Assign.assignmentId}/quiz`,
			{ headers: { "x-test-user": "student-1" } },
		);
		expect(studentQuizRes.status).toBe(200);
		const studentQuizBody = (await studentQuizRes.json()) as {
			hasAudio?: boolean;
			audioName?: string;
		};
		expect(studentQuizBody.hasAudio).toBe(true);
		expect(studentQuizBody.audioName).toBe("sysex-r2-listen-814.mp3");
		expect(JSON.stringify(studentQuizBody)).not.toContain(r2Key);

		const studentAudioRes = await app.request(
			`/api/student/assignments/${day1Assign.assignmentId}/audio`,
			{ headers: { "x-test-user": "student-1" } },
		);
		expect(studentAudioRes.status).toBe(200);
		expect(studentAudioRes.headers.get("content-type")).toBe("audio/mpeg");
		expect(new Uint8Array(await studentAudioRes.arrayBuffer())).toEqual(
			r2Bytes,
		);

		// App without getLibraryAudioStore -> 503 on R2 audio
		const noStoreApp = buildApp({
			getDb: () => db,
			authHandler: () => new Response(null, { status: 404 }),
			corsOrigin: CORS_ORIGINS,
			getSessionUser: sessionFor,
		});
		const unavailableRes = await noStoreApp.request(
			"/api/study-packs/exercises/lex-r2-listen-814/audio",
			{ headers: { "x-test-user": "teacher-1" } },
		);
		expect(unavailableRes.status).toBe(503);
	});

	test("teacher can update and delete system pack directly (#829)", async () => {
		// 1. Seed a system study pack
		await db.insert(schema.studyPack).values({
			id: "sys-pack-test-829",
			orgId: null,
			title: "Bộ đề hệ thống gốc 829",
			description: "Mô tả ban đầu",
			level: "A2",
			status: "ready",
		});
		await db.insert(schema.studyPackItem).values({
			id: "sys-item-829-1",
			packId: "sys-pack-test-829",
			dayIndex: 1,
			position: 0,
			sourceKind: "library_exercise",
			sourceId: "lex-vocab-1",
			note: "Note 1",
		});

		// 2. Teacher updates system study pack
		const updateRes = await app.request("/api/study-packs/sys-pack-test-829", {
			method: "PUT",
			headers: teacherHeaders("teacher-1"),
			body: JSON.stringify({
				title: "Bộ đề hệ thống đã sửa bởi giáo viên",
				description: "Mô tả cập nhật",
				level: "B1",
				status: "ready",
				items: [
					{
						dayIndex: 1,
						sourceKind: "library_exercise",
						sourceId: "lex-vocab-1",
						note: "Note cập nhật",
					},
					{
						dayIndex: 2,
						sourceKind: "org_prompt",
						sourceId: "pr-grammar-1",
						note: "Thêm ngày 2",
					},
				],
			}),
		});
		expect(updateRes.status).toBe(200);
		const updated = (await updateRes.json()) as { pack: StudyPackDetailView };
		expect(updated.pack.title).toBe("Bộ đề hệ thống đã sửa bởi giáo viên");
		expect(updated.pack.level).toBe("B1");
		expect(updated.pack.dayCount).toBe(2);
		expect(updated.pack.itemCount).toBe(2);
		expect(updated.pack.scope).toBe("system");
		expect(updated.pack.orgId).toBeNull();

		// 3. Seed another system study pack to test deletion
		await db.insert(schema.studyPack).values({
			id: "sys-pack-del-829",
			orgId: null,
			title: "Bộ đề hệ thống cần xoá 829",
			description: "Sắp bị xoá",
			level: "A1",
			status: "ready",
		});
		await db.insert(schema.studyPackItem).values({
			id: "sys-item-del-829",
			packId: "sys-pack-del-829",
			dayIndex: 1,
			position: 0,
			sourceKind: "library_exercise",
			sourceId: "lex-vocab-1",
		});

		const deleteRes = await app.request("/api/study-packs/sys-pack-del-829", {
			method: "DELETE",
			headers: teacherHeaders("teacher-1"),
		});
		expect(deleteRes.status).toBe(200);

		// Verify it is gone
		const getDeleted = await app.request("/api/study-packs/sys-pack-del-829", {
			headers: { "x-test-user": "teacher-1" },
		});
		expect(getDeleted.status).toBe(404);

		// 4. Assigned system pack cannot be deleted (409)
		await db.insert(schema.studyPack).values({
			id: "sys-pack-assigned-829",
			orgId: null,
			title: "Bộ đề hệ thống đã gán 829",
			status: "ready",
		});
		await db.insert(schema.classStudyPack).values({
			id: "csp-sys-829",
			orgId: "org-1",
			classId: "class-1",
			packId: "sys-pack-assigned-829",
			title: "Bộ đề hệ thống đã gán 829",
			status: "active",
			startDate: "2026-11-20",
			releaseTime: "06:00",
			dueTime: "17:00",
		});

		const conflictDelRes = await app.request(
			"/api/study-packs/sys-pack-assigned-829",
			{
				method: "DELETE",
				headers: teacherHeaders("teacher-1"),
			},
		);
		expect(conflictDelRes.status).toBe(409);
	});
});
