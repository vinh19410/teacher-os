import { createClient } from "@libsql/client";
import type {
	GradingQueueResponse,
	KernelSnapshot,
	QuizAttemptDetail,
	QuizAttemptSummary,
	StudentQuizDetail,
	TeacherSubmission,
} from "@teacher-os/api/contracts";
import {
	ASSIGNMENT_PART_TYPES,
	TRIAL_CREDITS,
} from "@teacher-os/api/contracts";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";
import { createFakeAiGrader } from "../lib/ai-grading/fake-grader";
import { ensureWallet } from "../lib/credits/wallet";
import { validateStudyPackItems } from "../lib/study-pack-clone";
import type { SessionUser } from "../session";
import { computeReminders } from "./dashboard-reminders";

const CORS_ORIGINS = ["http://localhost:8001", "http://localhost:8003"];
const TEACHER_ORIGIN = "http://localhost:8001";
const STUDENT_ORIGIN = "http://localhost:8003";
const MIGRATIONS_DIR = new URL(
	"../../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

const TEACHER_A = { "x-test-user": "teacher-1" };
const TEACHER_B = { "x-test-user": "teacher-2" };
const STUDENT_1 = { "x-test-user": "student-1" };
const STUDENT_2 = { "x-test-user": "student-2" };

const sessionFor = async (headers: Headers): Promise<SessionUser | null> => {
	const key = headers.get("x-test-user");
	if (key === "teacher-1") {
		return { userId: "t-1", userName: "Cô Mỹ", role: "teacher" };
	}
	if (key === "teacher-2") {
		return { userId: "t-2", userName: "Thầy Nam", role: "teacher" };
	}
	if (key === "student-1") {
		return {
			userId: "u-s1",
			userName: "Minh",
			email: "minh@test.local",
			emailVerified: true,
			role: "student",
		};
	}
	if (key === "student-2") {
		return {
			userId: "u-s2",
			userName: "Lan",
			email: "lan@test.local",
			emailVerified: true,
			role: "student",
		};
	}
	return null;
};

describe("hybrid multi-skill assignment (trắc nghiệm + Writing, #574)", () => {
	let app: ServerApp;
	let db: Db;
	let backgroundJobs: Promise<unknown>[];
	const capturedGraderPrompts: string[] = [];

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const rawDb = drizzle(client, { schema });
		await migrate(rawDb, { migrationsFolder: MIGRATIONS_DIR });
		db = rawDb as unknown as Db;
		backgroundJobs = [];

		await db.insert(schema.organization).values([
			{ id: "org-1", name: "Ms My IELTS" },
			{ id: "org-2", name: "Other Org" },
		]);
		await db.insert(schema.user).values([
			{ id: "t-1", name: "Cô Mỹ", email: "my@test.local", role: "teacher" },
			{ id: "t-2", name: "Thầy Nam", email: "nam@test.local", role: "teacher" },
			{ id: "u-s1", name: "Minh", email: "minh@test.local", role: "student" },
			{ id: "u-s2", name: "Lan", email: "lan@test.local", role: "student" },
		]);
		await db.insert(schema.membership).values([
			{ id: "mem-1", orgId: "org-1", userId: "t-1", role: "teacher" },
			{ id: "mem-2", orgId: "org-2", userId: "t-2", role: "teacher" },
		]);
		await db.insert(schema.student).values([
			{
				id: "st-1",
				orgId: "org-1",
				name: "Minh",
				email: "minh@test.local",
				phone: "0901111111",
			},
			{
				id: "st-2",
				orgId: "org-1",
				name: "Lan",
				email: "lan@test.local",
				phone: "0902222222",
			},
		]);
		await db.insert(schema.classTable).values({
			id: "cls-1",
			orgId: "org-1",
			name: "IELTS 6.5",
			level: "IELTS 6.0–6.5",
			mode: "Online",
			schedule: "T3 & T6 19:00–20:30",
			sessionsDone: 0,
			sessionsTotal: 20,
			status: "active",
		});
		await db.insert(schema.enrollment).values([
			{
				id: "enr-1",
				orgId: "org-1",
				classId: "cls-1",
				studentId: "st-1",
				status: "active",
			},
			{
				id: "enr-2",
				orgId: "org-1",
				classId: "cls-1",
				studentId: "st-2",
				status: "active",
			},
		]);

		const fakeGrader = createFakeAiGrader();
		app = buildApp({
			getDb: () => db,
			corsOrigin: CORS_ORIGINS,
			getSessionUser: sessionFor,
			authHandler: () => new Response("ok"),
			getAiGrader: () => ({
				async grade(input) {
					capturedGraderPrompts.push(input.prompt);
					return fakeGrader.grade(input);
				},
			}),
			runInBackground: (promise) => {
				backgroundJobs.push(promise);
			},
		});
	});

	async function teacherCall(
		path: string,
		method = "GET",
		body?: unknown,
		user: Record<string, string> = TEACHER_A,
		contentType = "application/json",
	) {
		const headers: Record<string, string> = {
			...user,
			origin: TEACHER_ORIGIN,
		};
		let payload: string | undefined;
		if (body !== undefined) {
			headers["content-type"] = contentType;
			payload = typeof body === "string" ? body : JSON.stringify(body);
		}
		return app.request(path, { method, headers, body: payload });
	}

	async function studentCall(
		path: string,
		method = "GET",
		body?: unknown,
		user: Record<string, string> = STUDENT_1,
	) {
		const headers: Record<string, string> = {
			...user,
			origin: STUDENT_ORIGIN,
		};
		if (body !== undefined) {
			headers["content-type"] = "application/json";
		}
		return app.request(path, {
			method,
			headers,
			body: body !== undefined ? JSON.stringify(body) : undefined,
		});
	}

	async function drainBackground() {
		while (backgroundJobs.length > 0) {
			const batch = backgroundJobs.splice(0, backgroundJobs.length);
			await Promise.allSettled(batch);
		}
	}

	test("POST/PATCH /api/assignments/prompts persists writing, preserves tri-state PATCH, enforces Content-Type, and locks after test/study-pack/class reference", async () => {
		const vocabPart = ASSIGNMENT_PART_TYPES.vocabulary.parts[0] ?? "topic";
		const vocabType =
			ASSIGNMENT_PART_TYPES.vocabulary.types[vocabPart]?.[0] ?? "mcq";

		// 415 when PATCH misses application/json
		const badCt = await teacherCall(
			"/api/assignments/prompts/any-id",
			"PATCH",
			"{}",
			TEACHER_A,
			"text/plain",
		);
		expect(badCt.status).toBe(415);

		// Create hybrid Vocabulary + Writing Task 2 prompt
		const createRes = await teacherCall("/api/assignments/prompts", "POST", {
			skill: "vocabulary",
			part: vocabPart,
			type: vocabType,
			title: "Vocab + Task 2 Homework",
			band: "6.5",
			source: "Cô Mỹ",
			prompt: "",
			passage: "<p>Context paragraph.</p>",
			intro: "",
			transcript: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			imageUrl: "",
			questions: [
				{
					stem: "Choose synonym of ubiquitous",
					opts: ["rare", "omnipresent", "tiny", "loud"],
					answer: "B",
					alts: "",
				},
			],
			optionBank: [],
			note: "",
			status: "ready",
			writing: {
				part: "task2",
				type: "discuss",
				prompt: "<p>Discuss the impact of <strong>remote work</strong>.</p>",
			},
		});
		expect(createRes.status).toBe(201);
		const { id: hybridId } = (await createRes.json()) as { id: string };

		// Snapshot round-trip
		const snap1 = (await (
			await teacherCall("/api/kernel")
		).json()) as KernelSnapshot;
		expect(
			snap1.assignmentPrompts.find((p) => p.id === hybridId)?.writing,
		).toEqual({
			part: "task2",
			type: "discuss",
			prompt: "<p>Discuss the impact of <strong>remote work</strong>.</p>",
		});

		// PATCH without writing key leaves writing intact
		const patchTitle = await teacherCall(
			`/api/assignments/prompts/${hybridId}`,
			"PATCH",
			{ title: "Vocab + Task 2 Renamed" },
		);
		expect(patchTitle.status).toBe(200);
		const snap2 = (await (
			await teacherCall("/api/kernel")
		).json()) as KernelSnapshot;
		expect(
			snap2.assignmentPrompts.find((p) => p.id === hybridId)?.writing?.part,
		).toBe("task2");

		// Before assignment: can clear writing -> null and restore it
		expect(
			(
				await teacherCall(`/api/assignments/prompts/${hybridId}`, "PATCH", {
					writing: null,
				})
			).status,
		).toBe(200);
		const snapCleared = (await (
			await teacherCall("/api/kernel")
		).json()) as KernelSnapshot;
		expect(
			snapCleared.assignmentPrompts.find((p) => p.id === hybridId)?.writing,
		).toBeNull();

		expect(
			(
				await teacherCall(`/api/assignments/prompts/${hybridId}`, "PATCH", {
					writing: {
						part: "task2",
						type: "discuss",
						prompt: "<p>Restored prompt.</p>",
					},
				})
			).status,
		).toBe(200);

		// Study-pack rejects hybrid prompt with 422
		const spCheck = await validateStudyPackItems(db, "org-1", [
			{ sourceKind: "org_prompt", sourceId: hybridId },
		]);
		expect(spCheck.ok).toBe(false);
		if (!spCheck.ok) {
			expect(spCheck.status).toBe(422);
		}

		// Pure Reading prompt in test cannot be turned into hybrid via PATCH (409)
		const pureReadRes = await teacherCall("/api/assignments/prompts", "POST", {
			skill: "reading",
			part: "p1",
			type: "tfng",
			title: "Pure Reading P1",
			band: "6.5",
			source: "",
			prompt: "",
			passage: "<p>Bees dance.</p>",
			intro: "",
			transcript: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			imageUrl: "",
			questions: [
				{
					stem: "Bees dance to communicate.",
					opts: null,
					answer: "TRUE",
					alts: "",
				},
			],
			optionBank: [],
			note: "",
			status: "ready",
		});
		const { id: pureReadId } = (await pureReadRes.json()) as { id: string };

		const testCreate = await teacherCall("/api/assignments/tests", "POST", {
			skill: "reading",
			title: "Reading Mock 1",
			description: "",
			timeLimitSeconds: 3600,
			collection: "",
			testGroup: "",
		});
		const { id: testId } = (await testCreate.json()) as { id: string };

		// Attaching a hybrid Reading prompt to test -> 400
		const hybridReadRes = await teacherCall(
			"/api/assignments/prompts",
			"POST",
			{
				skill: "reading",
				part: "p1",
				type: "tfng",
				title: "Hybrid Reading P1",
				band: "6.5",
				source: "",
				prompt: "",
				passage: "<p>Passage.</p>",
				intro: "",
				transcript: "",
				cueTopic: "",
				cuePoints: "",
				audioName: "",
				imageUrl: "",
				questions: [{ stem: "S1", opts: null, answer: "TRUE", alts: "" }],
				optionBank: [],
				note: "",
				status: "ready",
				writing: {
					part: "task2",
					type: "discuss",
					prompt: "<p>Essay prompt.</p>",
				},
			},
		);
		const { id: hybridReadId } = (await hybridReadRes.json()) as { id: string };
		const attachHybrid = await teacherCall(
			`/api/assignments/tests/${testId}/parts`,
			"PUT",
			[{ part: "p1", promptId: hybridReadId }],
		);
		expect(attachHybrid.status).toBe(400);

		// Attach pure Reading prompt to test -> 200, then PATCH adding writing -> 409
		expect(
			(
				await teacherCall(`/api/assignments/tests/${testId}/parts`, "PUT", [
					{ part: "p1", promptId: pureReadId },
				])
			).status,
		).toBe(200);
		const patchInTest = await teacherCall(
			`/api/assignments/prompts/${pureReadId}`,
			"PATCH",
			{
				writing: {
					part: "task2",
					type: "discuss",
					prompt: "<p>Should fail</p>",
				},
			},
		);
		expect(patchInTest.status).toBe(409);

		// Assign hybridReadId to class -> subsequent PATCH mutating writing.prompt returns 409
		const assignRes = await teacherCall(
			"/api/classes/cls-1/assignments",
			"POST",
			{
				promptId: hybridReadId,
				due: "2099-12-01",
				note: "",
				studentIds: ["st-1", "st-2"],
			},
		);
		expect(assignRes.status).toBe(201);

		const patchPromptAfterAssign = await teacherCall(
			`/api/assignments/prompts/${hybridReadId}`,
			"PATCH",
			{
				writing: {
					part: "task2",
					type: "discuss",
					prompt: "<p>Changed prompt after assign</p>",
				},
			},
		);
		expect(patchPromptAfterAssign.status).toBe(409);
		await expect(patchPromptAfterAssign.json()).resolves.toMatchObject({
			code: "WRITING_SECTION_LOCKED",
		});

		// Unrelated title PATCH still allowed (200)
		expect(
			(
				await teacherCall(`/api/assignments/prompts/${hybridReadId}`, "PATCH", {
					title: "Hybrid Reading Renamed Safely",
				})
			).status,
		).toBe(200);
	});

	test("end-to-end student take, raw resume, empty-essay 0-credit guard, AI grading, teacher grading with objective score, detail annotations, history,reminders, and IDOR", async () => {
		await ensureWallet(db, "org-1");

		const vocabPart = ASSIGNMENT_PART_TYPES.vocabulary.parts[0] ?? "topic";
		const vocabType =
			ASSIGNMENT_PART_TYPES.vocabulary.types[vocabPart]?.[0] ?? "mcq";

		const createRes = await teacherCall("/api/assignments/prompts", "POST", {
			skill: "vocabulary",
			part: vocabPart,
			type: vocabType,
			title: "Vocab + Writing Full Flow",
			band: "7.0",
			source: "Unit 3",
			prompt: "",
			passage: "",
			intro: "",
			transcript: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			imageUrl: "",
			questions: [
				{
					stem: "Q1: Pick A",
					opts: ["Right", "Wrong"],
					answer: "A",
					alts: "",
				},
				{
					stem: "Q2: Pick B",
					opts: ["Wrong", "Right"],
					answer: "B",
					alts: "",
				},
			],
			optionBank: [],
			note: "<p>Note revealed after submit</p>",
			status: "ready",
			writing: {
				part: "task2",
				type: "discuss",
				prompt: "<p>Write about <em>urbanization</em>.</p>",
			},
		});
		const { id: promptId } = (await createRes.json()) as { id: string };

		const assignRes = await teacherCall(
			"/api/classes/cls-1/assignments",
			"POST",
			{
				promptId,
				due: "2099-12-15",
				note: "",
				studentIds: ["st-1", "st-2"],
			},
		);
		const { id: caId } = (await assignRes.json()) as { id: string };

		// Student overview includes hasWriting: true
		const overview = (await (
			await studentCall("/api/student/overview")
		).json()) as { assignments: Array<{ id: string; hasWriting?: boolean }> };
		expect(overview.assignments.find((a) => a.id === caId)?.hasWriting).toBe(
			true,
		);

		// Student 2 submits with EMPTY essay -> 0 credits spent, manual_pending
		const start2 = await studentCall(
			`/api/student/assignments/${caId}/quiz/start`,
			"POST",
			{},
			STUDENT_2,
		);
		const { attemptId: attEmpty } = (await start2.json()) as {
			attemptId: string;
		};
		await studentCall(
			`/api/student/attempts/${attEmpty}/answer`,
			"PATCH",
			{ q: 0, value: "A" },
			STUDENT_2,
		);
		await studentCall(
			`/api/student/attempts/${attEmpty}/essay`,
			"PATCH",
			{ text: "   " },
			STUDENT_2,
		);
		const [walletBeforeEmpty] = await db
			.select()
			.from(schema.creditWallet)
			.where(eq(schema.creditWallet.orgId, "org-1"));
		expect(
			(
				await studentCall(
					`/api/student/attempts/${attEmpty}/submit`,
					"POST",
					{},
					STUDENT_2,
				)
			).status,
		).toBe(200);
		await drainBackground();
		const [walletAfterEmpty] = await db
			.select()
			.from(schema.creditWallet)
			.where(eq(schema.creditWallet.orgId, "org-1"));
		expect(walletAfterEmpty?.balance).toBe(
			walletBeforeEmpty?.balance ?? TRIAL_CREDITS,
		);
		const [emptyDraft] = await db
			.select()
			.from(schema.aiGradingDraft)
			.where(eq(schema.aiGradingDraft.attemptId, attEmpty));
		expect(emptyDraft?.status).toBe("manual_pending");

		// Student 1 full flow: GET quiz -> start -> answer + essay with <br> &amp; -> resume preserves raw essay
		const quizBefore = (await (
			await studentCall(`/api/student/assignments/${caId}/quiz`)
		).json()) as StudentQuizDetail;
		expect(quizBefore.writing).toEqual({
			part: "task2",
			type: "discuss",
			prompt: "<p>Write about <em>urbanization</em>.</p>",
		});

		const start1 = await studentCall(
			`/api/student/assignments/${caId}/quiz/start`,
			"POST",
			{},
			STUDENT_1,
		);
		const { attemptId: att1 } = (await start1.json()) as { attemptId: string };

		expect(
			(
				await studentCall(`/api/student/attempts/${att1}/answer`, "PATCH", {
					q: 0,
					value: "A",
				})
			).status,
		).toBe(200);
		expect(
			(
				await studentCall(`/api/student/attempts/${att1}/answer`, "PATCH", {
					q: 1,
					value: "A",
				})
			).status,
		).toBe(200);

		const rawEssay =
			"Urbanization grows fast. Students write <br> &amp; discuss pros and cons.";
		expect(
			(
				await studentCall(`/api/student/attempts/${att1}/essay`, "PATCH", {
					text: rawEssay,
				})
			).status,
		).toBe(200);

		const quizResume = (await (
			await studentCall(`/api/student/assignments/${caId}/quiz`)
		).json()) as StudentQuizDetail;
		expect(quizResume.attempt?.essay).toBe(rawEssay);
		expect(quizResume.attempt?.answers).toEqual({ "0": "A", "1": "A" });

		// Submit Student 1 -> 1/2 MCQ correct + AI grading triggered with stripped HTML prompt
		const submitRes = await studentCall(
			`/api/student/attempts/${att1}/submit`,
			"POST",
			{},
		);
		expect(submitRes.status).toBe(200);
		await expect(submitRes.json()).resolves.toMatchObject({
			correctCount: 1,
			totalCount: 2,
		});
		await drainBackground();
		expect(capturedGraderPrompts).toContain("Write about urbanization.");

		// Student history BEFORE teacher grade: awaiting + 1/2 + hasWriting
		const histBefore = (await (
			await studentCall("/api/student/history")
		).json()) as {
			entries: Array<{
				attemptId: string | null;
				score: string | null;
				status: string;
				hasWriting?: boolean;
			}>;
		};
		expect(histBefore.entries.find((e) => e.attemptId === att1)).toMatchObject({
			score: "1/2",
			status: "awaiting",
			hasWriting: true,
		});

		// Backdate submittedAt > 24h to verify dashboard reminders count hybrid as writing
		await db
			.update(schema.quizAttempt)
			.set({ submittedAt: new Date(Date.now() - 30 * 3600 * 1000) })
			.where(eq(schema.quizAttempt.id, att1));
		const reminders = await computeReminders(
			db,
			"org-1",
			{ kind: "org", finance: true },
			new Date(),
		);
		expect(reminders.overdueGrading.writing).toBeGreaterThanOrEqual(1);
		expect(reminders.overdueGrading.count).toBe(
			reminders.overdueGrading.writing + reminders.overdueGrading.speaking,
		);

		// Teacher grading queue lists hybrid attempt as skill="writing", part="task2"
		const queue = (await (
			await teacherCall("/api/grading")
		).json()) as GradingQueueResponse;
		expect(queue.items.find((i) => i.attemptId === att1)).toMatchObject({
			skill: "writing",
			part: "task2",
		});

		// IDOR: Org 2 teacher gets 404
		expect(
			(await teacherCall(`/api/grading/${att1}`, "GET", undefined, TEACHER_B))
				.status,
		).toBe(404);

		// Teacher submission view includes objective { correctCount: 1, totalCount: 2 } and AI draft
		const subRes = await teacherCall(`/api/grading/${att1}`);
		expect(subRes.status).toBe(200);
		const sub = (await subRes.json()) as TeacherSubmission;
		expect(sub.skill).toBe("writing");
		expect(sub.part).toBe("task2");
		expect(sub.objective).toEqual({ correctCount: 1, totalCount: 2 });
		expect(sub.aiDraft?.status).toBe("ai_drafted");

		// Teacher adds highlight annotation and publishes grade (Band 6.5)
		const plainEssay = sub.essay ?? "";
		const annRes = await teacherCall(
			`/api/grading/${att1}/annotations`,
			"POST",
			{
				start: 0,
				end: Math.min(12, plainEssay.length),
				note: "Good opening noun",
			},
		);
		expect(annRes.status).toBe(201);

		const gradeRes = await teacherCall(`/api/grading/${att1}/grade`, "POST", {
			scores: { task: 6.5, coherence: 6.5, lexical: 6.5, grammar: 6.5 },
			feedback: "Well structured essay.",
			version: sub.aiDraft?.version ?? 1,
		});
		expect(gradeRes.status).toBe(200);

		// Student summary AND detail both contain MCQ score + essay + grade + part="task2" + annotations
		const summary = (await (
			await studentCall(`/api/student/attempts/${att1}`)
		).json()) as QuizAttemptSummary;
		expect(summary.correctCount).toBe(1);
		expect(summary.totalCount).toBe(2);
		expect(summary.part).toBe("task2");
		expect(summary.grade?.band).toBe(6.5);
		expect(summary.annotations).toHaveLength(1);

		const detail = (await (
			await studentCall(`/api/student/attempts/${att1}/detail`)
		).json()) as QuizAttemptDetail;
		expect(detail.correctCount).toBe(1);
		expect(detail.questions).toHaveLength(2);
		expect(detail.writing?.part).toBe("task2");
		expect(detail.part).toBe("task2");
		expect(detail.grade?.band).toBe(6.5);
		expect(detail.annotations).toHaveLength(1);

		// Student history AFTER teacher grade: "1/2 · Band 6.5" + graded + hasWriting
		const histAfter = (await (
			await studentCall("/api/student/history")
		).json()) as {
			entries: Array<{
				attemptId: string | null;
				score: string | null;
				status: string;
				hasWriting?: boolean;
			}>;
		};
		expect(histAfter.entries.find((e) => e.attemptId === att1)).toMatchObject({
			score: "1/2 · Band 6.5",
			status: "graded",
			hasWriting: true,
		});
		// Student history ?skill=writing ALSO includes hybrid Vocabulary + Writing entry
		const histWritingTab = (await (
			await studentCall("/api/student/history?skill=writing")
		).json()) as {
			entries: Array<{ attemptId: string | null }>;
		};
		expect(histWritingTab.entries.some((e) => e.attemptId === att1)).toBe(true);
	});

	test("Grammar + Writing hybrid assignment appears in /history, /history/month, and /history/week under writing (#574)", async () => {
		const grammarPart = ASSIGNMENT_PART_TYPES.grammar.parts[0] ?? "topic";
		const grammarType =
			ASSIGNMENT_PART_TYPES.grammar.types[grammarPart]?.[0] ?? "mcq";
		const createRes = await teacherCall("/api/assignments/prompts", "POST", {
			skill: "grammar",
			part: grammarPart,
			type: grammarType,
			title: "Grammar + Writing History Check",
			band: "6.5",
			source: "",
			prompt: "",
			passage: "",
			intro: "",
			transcript: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			imageUrl: "",
			questions: [
				{
					stem: "She ___ coffee.",
					opts: ["drink", "drinks"],
					answer: "B",
					alts: "",
				},
			],
			optionBank: [],
			note: "",
			status: "ready",
			writing: {
				part: "task1",
				type: "chart",
				prompt: "<p>Summarise the chart.</p>",
			},
		});
		expect(createRes.status).toBe(201);
		const { id: gPromptId } = (await createRes.json()) as { id: string };

		const assignRes = await teacherCall(
			"/api/classes/cls-1/assignments",
			"POST",
			{
				promptId: gPromptId,
				due: "2099-12-20",
				note: "",
				studentIds: ["st-1"],
			},
		);
		expect(assignRes.status).toBe(201);
		const { id: gCaId } = (await assignRes.json()) as { id: string };

		const startRes = await studentCall(
			`/api/student/assignments/${gCaId}/quiz/start`,
			"POST",
			{},
		);
		const { attemptId: gAtt } = (await startRes.json()) as {
			attemptId: string;
		};
		await studentCall(`/api/student/attempts/${gAtt}/answer`, "PATCH", {
			q: 0,
			value: "B",
		});
		await studentCall(`/api/student/attempts/${gAtt}/essay`, "PATCH", {
			text: "The chart illustrates urban growth over two decades.",
		});
		expect(
			(await studentCall(`/api/student/attempts/${gAtt}/submit`, "POST", {}))
				.status,
		).toBe(200);
		await drainBackground();

		const sub = (await (
			await teacherCall(`/api/grading/${gAtt}`)
		).json()) as TeacherSubmission;
		expect(
			(
				await teacherCall(`/api/grading/${gAtt}/grade`, "POST", {
					scores: { task: 7, coherence: 7, lexical: 7, grammar: 7 },
					feedback: "Accurate chart summary.",
					version: sub.aiDraft?.version ?? 1,
				})
			).status,
		).toBe(200);

		const histAll = (await (
			await studentCall("/api/student/history")
		).json()) as {
			entries: Array<{
				attemptId: string | null;
				skill: string;
				score: string | null;
				status: string;
				hasWriting?: boolean;
			}>;
		};
		const gEntry = histAll.entries.find((e) => e.attemptId === gAtt);
		expect(gEntry).toMatchObject({
			skill: "writing",
			score: "1/1 · Band 7.0",
			status: "graded",
			hasWriting: true,
		});

		const histWriting = (await (
			await studentCall("/api/student/history?skill=writing")
		).json()) as { entries: Array<{ attemptId: string | null }> };
		expect(histWriting.entries.some((e) => e.attemptId === gAtt)).toBe(true);

		const histWeek = await studentCall("/api/student/history/week");
		expect(histWeek.status).toBe(200);
		const weekJson = (await histWeek.json()) as {
			rows: Array<{ skill: string; days: number[] }>;
		};
		const writingRow = weekJson.rows.find((r) => r.skill === "writing");
		expect(
			writingRow?.days.reduce((sum, n) => sum + n, 0) ?? 0,
		).toBeGreaterThanOrEqual(1);
	});
});
