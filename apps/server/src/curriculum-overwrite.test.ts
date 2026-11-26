import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	CURRICULUM_IMPORT_ERROR_CODES,
	type KernelSnapshot,
} from "@teacher-os/api/contracts";
import { addDaysISO, vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import * as schema from "@teacher-os/db/schema/index";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, test } from "vitest";
import { buildApp, type Db } from "./app";
import type { ZoomClient, ZoomMeetingInput } from "./lib/zoom/zoom-client";
import type { SessionUser } from "./session";

const CORS_ORIGIN = "http://localhost:8001";
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url).href,
);

function futureMondayISO(weeksAhead = 2): string {
	const base = addDaysISO(vietnamTodayISO(), weeksAhead * 7);
	const dow = new Date(`${base}T00:00:00Z`).getUTCDay();
	const delta = (8 - dow) % 7;
	return addDaysISO(base, delta);
}

interface MockZoomRecorder {
	created: ZoomMeetingInput[];
	updated: Array<{ meetingId: string; input: ZoomMeetingInput }>;
	deleted: string[];
	client: ZoomClient;
}

function createMockZoom(): MockZoomRecorder {
	const created: ZoomMeetingInput[] = [];
	const updated: Array<{ meetingId: string; input: ZoomMeetingInput }> = [];
	const deleted: string[] = [];
	let seq = 1;
	const client: ZoomClient = {
		async createMeeting(input) {
			created.push(input);
			const id = `zm-auto-${seq++}`;
			return { meetingId: id, joinUrl: `https://zoom.us/j/${id}` };
		},
		async updateMeeting(meetingId, input) {
			updated.push({ meetingId, input });
		},
		async deleteMeeting(meetingId) {
			deleted.push(meetingId);
		},
		async getRecording() {
			return { status: "missing" };
		},
	};
	return { created, updated, deleted, client };
}

async function setupOverwriteTestApp(opts?: { zoom?: MockZoomRecorder }) {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
	const baseDb = libsql as unknown as Db;

	let batchInterceptor: (() => Promise<boolean | undefined>) | null = null;
	const db = new Proxy(baseDb as unknown as object, {
		get(target, prop, receiver) {
			if (prop === "batch") {
				return async (stmts: unknown[]) => {
					const hook = batchInterceptor;
					if (hook) {
						batchInterceptor = null;
						const keep = await hook();
						if (keep === false) {
							batchInterceptor = hook;
						}
					}
					return (
						baseDb as unknown as { batch: (s: unknown[]) => Promise<unknown> }
					).batch(stmts);
				};
			}
			return Reflect.get(target, prop, receiver);
		},
	}) as Db;

	const sessions = new Map<string, SessionUser>();
	const zoomClient = opts?.zoom?.client;
	const app = buildApp({
		getDb: () => db,
		corsOrigin: CORS_ORIGIN,
		getSessionUser: async (headers) => {
			const key = headers.get("x-test-user");
			return key ? (sessions.get(key) ?? null) : null;
		},
		authHandler: () => new Response("auth stub", { status: 404 }),
		...(zoomClient ? { getZoomClient: () => zoomClient } : {}),
	});

	await libsql.insert(schema.organization).values({
		id: "org-1",
		name: "Trung tâm Test",
	});

	async function seedStaff(
		key: string,
		role: "teacher" | "owner" | "admin" | "class_teacher" | "ta",
	) {
		const userId = `u-${key}`;
		const email = `${key}@test.local`;
		await libsql.insert(schema.user).values({
			id: userId,
			name: key,
			email,
			emailVerified: true,
			role: "teacher",
		});
		await libsql.insert(schema.membership).values({
			id: `mem-${key}`,
			orgId: "org-1",
			userId,
			role,
		});
		sessions.set(key, {
			userId,
			userName: key,
			email,
			emailVerified: true,
			role: "teacher",
		});
		return { userId, key };
	}

	const teacher = await seedStaff("teacher-1", "teacher");
	const ta = await seedStaff("ta-1", "ta");

	function call(
		userKey: string,
		path: string,
		options: { method?: string; body?: unknown } = {},
	) {
		const headers: Record<string, string> = {
			"x-test-user": userKey,
			origin: CORS_ORIGIN,
			...(options.body !== undefined
				? { "content-type": "application/json" }
				: {}),
		};
		return app.request(path, {
			method: options.method ?? "POST",
			headers,
			body:
				options.body !== undefined ? JSON.stringify(options.body) : undefined,
		});
	}

	async function kernel(userKey = teacher.key): Promise<KernelSnapshot> {
		const res = await app.request("/api/kernel", {
			headers: { "x-test-user": userKey, origin: CORS_ORIGIN },
		});
		expect(res.status).toBe(200);
		return (await res.json()) as KernelSnapshot;
	}

	async function seedTemplate(
		name: string,
		lessonCount: number,
	): Promise<{ templateId: string; lessonIds: string[] }> {
		const tplRes = await call(teacher.key, "/api/syllabus-templates", {
			body: {
				name,
				type: "ielts",
				level: "Band 7.0",
				skills: ["Writing"],
				description: "",
				totalLessons: lessonCount,
			},
		});
		expect(tplRes.status).toBe(201);
		const { id: templateId } = (await tplRes.json()) as { id: string };
		if (lessonCount === 0) return { templateId, lessonIds: [] };

		const modRes = await call(
			teacher.key,
			`/api/syllabus-templates/${templateId}/modules`,
			{ body: { title: "Module 1", description: "" } },
		);
		expect(modRes.status).toBe(201);
		const { id: moduleId } = (await modRes.json()) as { id: string };

		const lessonIds: string[] = [];
		const rows = Array.from({ length: lessonCount }, (_, i) => {
			const id = crypto.randomUUID();
			lessonIds.push(id);
			return {
				id,
				orgId: "org-1",
				moduleId,
				title: `Bài ${i + 1}`,
				objectives: "",
				materials: "",
				status: "upcoming",
				position: i,
			};
		});
		await libsql.insert(schema.syllabusLesson).values(rows);
		return { templateId, lessonIds };
	}

	async function createManualClass(overrides?: {
		name?: string;
		schedule?: { days: number[]; start: string; end: string };
		startDate?: string;
		mode?: string;
	}): Promise<string> {
		const startMonday = overrides?.startDate ?? futureMondayISO();
		const res = await call(teacher.key, "/api/classes", {
			body: {
				name: overrides?.name ?? "Lớp Manual Test",
				type: "ielts",
				level: "Band 7.0",
				skills: ["Writing"],
				mode: overrides?.mode ?? "Online",
				templateId: "",
				schedulingMode: "manual",
				schedule: overrides?.schedule ?? {
					days: [0],
					start: "19:00",
					end: "20:30",
				},
				sessionsTotal: 12,
				startDate: startMonday,
			},
		});
		expect(res.status).toBe(201);
		const { id } = (await res.json()) as { id: string };
		return id;
	}

	return {
		db,
		libsql,
		orgId: "org-1",
		teacher,
		ta,
		call,
		kernel,
		seedTemplate,
		createManualClass,
		setNextBatchInterceptor(fn: (() => Promise<boolean | undefined>) | null) {
			batchInterceptor = fn;
		},
	};
}

describe("Force-overwrite manual sessions on curriculum import", () => {
	test("1. Detects overlapping vs non-overlapping dates, returns overwriteHash, and rejects missing/stale overwriteHash", async () => {
		const t = await setupOverwriteTestApp();
		const startMonday = futureMondayISO();
		const otherTuesday = addDaysISO(startMonday, 1);
		const thirdDay = addDaysISO(startMonday, 2);

		const { templateId } = await t.seedTemplate("Template 3 bài", 3);
		const classId = await t.createManualClass({
			startDate: startMonday,
			schedule: { days: [0], start: "19:00", end: "20:30" },
		});

		await t.call(t.teacher.key, `/api/classes/${classId}/sessions`, {
			body: {
				date: startMonday,
				time: "14:00",
				dur: 60,
				topic: "Buổi trùng ngày",
			},
		});
		await t.call(t.teacher.key, `/api/classes/${classId}/sessions`, {
			body: {
				date: otherTuesday,
				time: "15:00",
				dur: 60,
				topic: "Buổi khác ngày",
			},
		});

		// Bước 1: gọi không có overwriteManualSessions → 409 kèm danh sách ngày + overwriteHash
		const first = await t.call(
			t.teacher.key,
			`/api/classes/${classId}/curriculum/import`,
			{ body: { templateId } },
		);
		expect(first.status).toBe(409);
		const firstBody = (await first.json()) as {
			code: string;
			reason: string;
			conflictingDates: string[];
			otherManualDates: string[];
			manualSessionCount: number;
			overwriteHash: string;
		};
		expect(firstBody).toMatchObject({
			code: CURRICULUM_IMPORT_ERROR_CODES.MANUAL_SESSIONS_EXIST,
			reason: "has-manual-sessions",
			conflictingDates: [startMonday],
			otherManualDates: [otherTuesday],
			manualSessionCount: 2,
		});
		expect(typeof firstBody.overwriteHash).toBe("string");
		expect(firstBody.overwriteHash.length).toBeGreaterThanOrEqual(16);

		// Gọi overwriteManualSessions: true nhưng thiếu overwriteHash → 409 kèm hash
		const missingHash = await t.call(
			t.teacher.key,
			`/api/classes/${classId}/curriculum/import`,
			{ body: { templateId, overwriteManualSessions: true } },
		);
		expect(missingHash.status).toBe(409);
		expect(await missingHash.json()).toMatchObject({
			code: CURRICULUM_IMPORT_ERROR_CODES.MANUAL_SESSIONS_EXIST,
			overwriteHash: firstBody.overwriteHash,
		});

		// Đồng nghiệp thêm 1 buổi thủ công mới giữa 2 bước → overwriteHash cũ bị từ chối với tập mới
		await t.call(t.teacher.key, `/api/classes/${classId}/sessions`, {
			body: {
				date: thirdDay,
				time: "18:00",
				dur: 60,
				topic: "Buổi mới chen ngang",
			},
		});
		const staleAttempt = await t.call(
			t.teacher.key,
			`/api/classes/${classId}/curriculum/import`,
			{
				body: {
					templateId,
					overwriteManualSessions: true,
					overwriteHash: firstBody.overwriteHash,
				},
			},
		);
		expect(staleAttempt.status).toBe(409);
		const staleBody = (await staleAttempt.json()) as typeof firstBody;
		expect(staleBody.code).toBe(
			CURRICULUM_IMPORT_ERROR_CODES.MANUAL_SESSIONS_EXIST,
		);
		expect(staleBody.manualSessionCount).toBe(3);
		expect(staleBody.otherManualDates).toEqual([otherTuesday, thirdDay]);
		expect(staleBody.overwriteHash).not.toBe(firstBody.overwriteHash);

		// DB vẫn giữ đủ 3 buổi thủ công, chưa gắn giáo trình
		const csRows = await t.libsql
			.select()
			.from(schema.classSession)
			.where(eq(schema.classSession.classId, classId));
		expect(csRows).toHaveLength(3);
	});

	test("2. RBAC blocks TA role from destructive overwrite with 403 FORBIDDEN", async () => {
		const t = await setupOverwriteTestApp();
		const startMonday = futureMondayISO();
		const { templateId } = await t.seedTemplate("Template RBAC", 3);
		const classId = await t.createManualClass({ startDate: startMonday });

		await t.call(t.teacher.key, `/api/classes/${classId}/sessions`, {
			body: { date: startMonday, time: "19:00", dur: 90, topic: "Buổi nháp" },
		});

		const preview = await t.call(
			t.teacher.key,
			`/api/classes/${classId}/curriculum/import`,
			{ body: { templateId } },
		);
		const { overwriteHash } = (await preview.json()) as {
			overwriteHash: string;
		};

		const taRes = await t.call(
			t.ta.key,
			`/api/classes/${classId}/curriculum/import`,
			{
				body: {
					templateId,
					overwriteManualSessions: true,
					overwriteHash,
				},
			},
		);
		expect(taRes.status).toBe(403);
		expect(await taRes.json()).toMatchObject({ code: "FORBIDDEN" });

		// Buổi thủ công vẫn nguyên vẹn
		const csRows = await t.libsql
			.select()
			.from(schema.classSession)
			.where(eq(schema.classSession.classId, classId));
		expect(csRows).toHaveLength(1);
	});

	test("3. Overwrite on 0-student class clears manual sessions & lesson_material, preserves class_material, upserts manual zoom, syncs kept Zoom & preserves recordingUrl", async () => {
		const zoom = createMockZoom();
		const t = await setupOverwriteTestApp({ zoom });
		const startMonday = futureMondayISO();
		const secondMonday = addDaysISO(startMonday, 7);
		const otherTue = addDaysISO(startMonday, 1);
		const otherWed = addDaysISO(startMonday, 2);

		const { templateId } = await t.seedTemplate("Template Zoom 3 bài", 3);
		const classId = await t.createManualClass({
			name: "Lớp Online Zoom",
			startDate: startMonday,
			schedule: { days: [0], start: "19:00", end: "20:30" },
			mode: "Online",
		});

		// Tài liệu ngân hàng: 1 gắn vào buổi thủ công (phải xóa), 1 tài liệu chung của lớp (phải giữ)
		await t.libsql.insert(schema.material).values([
			{
				id: "mat-session",
				orgId: t.orgId,
				title: "Slide nháp",
				kind: "link",
				url: "https://example.com/draft",
				createdBy: t.teacher.userId,
			},
			{
				id: "mat-shared",
				orgId: t.orgId,
				title: "Nội quy lớp",
				kind: "link",
				url: "https://example.com/shared",
				createdBy: t.teacher.userId,
			},
		]);
		await t.libsql.insert(schema.classMaterial).values({
			orgId: t.orgId,
			classId,
			materialId: "mat-shared",
			position: 0,
		});

		// Seed 4 buổi thủ công trực tiếp / qua API với các dạng Zoom khác nhau
		await t.libsql.insert(schema.classSession).values([
			{
				id: "cs-1",
				orgId: t.orgId,
				classId,
				date: startMonday,
				time: "14:00",
				dur: 60,
				topic: "Buổi trùng có Zoom API",
				zoom: "https://zoom.us/j/keep",
			},
			{
				id: "cs-2",
				orgId: t.orgId,
				classId,
				date: secondMonday,
				time: "15:00",
				dur: 60,
				topic: "Buổi trùng có Zoom dán tay",
				zoom: "https://zoom.us/j/manual-link",
			},
			{
				id: "cs-3",
				orgId: t.orgId,
				classId,
				date: otherTue,
				time: "16:00",
				dur: 60,
				topic: "Buổi khác ngày có Zoom xóa",
				zoom: "https://zoom.us/j/del",
			},
			{
				id: "cs-4",
				orgId: t.orgId,
				classId,
				date: otherWed,
				time: "17:00",
				dur: 60,
				topic: "Buổi khác ngày có recording",
				zoom: "https://zoom.us/j/rec",
			},
		]);
		await t.libsql.insert(schema.lessonMaterial).values({
			orgId: t.orgId,
			classId,
			date: otherTue,
			materialId: "mat-session",
			position: 0,
		});
		await t.libsql.insert(schema.classSessionMeeting).values([
			{
				id: "csm-keep",
				orgId: t.orgId,
				classId,
				date: startMonday,
				zoomMeetingId: "zm-keep",
				joinUrl: "https://zoom.us/j/keep",
				recordingUrl: "",
				recordingStatus: "pending",
			},
			{
				id: "csm-del",
				orgId: t.orgId,
				classId,
				date: otherTue,
				zoomMeetingId: "zm-del",
				joinUrl: "https://zoom.us/j/del",
				recordingUrl: "",
				recordingStatus: "pending",
			},
			{
				id: "csm-rec",
				orgId: t.orgId,
				classId,
				date: otherWed,
				zoomMeetingId: "zm-rec",
				joinUrl: "https://zoom.us/j/rec",
				recordingUrl: "https://zoom.us/rec/share/1",
				recordingStatus: "ready",
			},
		]);

		const preview = await t.call(
			t.teacher.key,
			`/api/classes/${classId}/curriculum/import`,
			{ body: { templateId } },
		);
		expect(preview.status).toBe(409);
		const { overwriteHash, conflictingDates, otherManualDates } =
			(await preview.json()) as {
				overwriteHash: string;
				conflictingDates: string[];
				otherManualDates: string[];
			};
		expect(conflictingDates).toEqual([startMonday, secondMonday]);
		expect(otherManualDates).toEqual([otherTue, otherWed]);

		const okRes = await t.call(
			t.teacher.key,
			`/api/classes/${classId}/curriculum/import`,
			{
				body: {
					templateId,
					overwriteManualSessions: true,
					overwriteHash,
				},
			},
		);
		expect(okRes.status).toBe(201);
		const { id: copyId } = (await okRes.json()) as { id: string };

		const snap = await t.kernel();
		const cls = snap.classes.find((c) => c.id === classId);
		expect(cls?.schedulingMode).toBe("auto");
		expect(cls?.sessionsTotal).toBe(3);
		expect(cls?.syllabusId).toBe(copyId);

		// Buổi thủ công + tài liệu buổi xóa sạch; tài liệu chung giữ nguyên
		expect(
			await t.libsql
				.select()
				.from(schema.classSession)
				.where(eq(schema.classSession.classId, classId)),
		).toHaveLength(0);
		expect(
			await t.libsql
				.select()
				.from(schema.lessonMaterial)
				.where(eq(schema.lessonMaterial.classId, classId)),
		).toHaveLength(0);
		expect(
			await t.libsql
				.select()
				.from(schema.classMaterial)
				.where(eq(schema.classMaterial.classId, classId)),
		).toHaveLength(1);

		// Kiểm tra class_session_meeting sau overwrite
		const meetings = await t.libsql
			.select()
			.from(schema.classSessionMeeting)
			.where(eq(schema.classSessionMeeting.classId, classId));
		const byDate = new Map(meetings.map((m) => [m.date, m]));
		expect(byDate.get(startMonday)).toMatchObject({
			zoomMeetingId: "zm-keep",
			joinUrl: "https://zoom.us/j/keep",
		});
		expect(byDate.get(secondMonday)).toMatchObject({
			zoomMeetingId: null,
			joinUrl: "https://zoom.us/j/manual-link",
		});
		expect(byDate.has(otherTue)).toBe(false);
		expect(byDate.get(otherWed)).toMatchObject({
			zoomMeetingId: null,
			joinUrl: "",
			recordingUrl: "https://zoom.us/rec/share/1",
			recordingStatus: "ready",
		});

		// Zoom Cloud nhận updateMeeting cho ngày giữ lại và deleteMeeting cho 2 ngày bỏ
		expect(zoom.updated).toHaveLength(1);
		expect(zoom.updated[0]).toMatchObject({
			meetingId: "zm-keep",
			input: {
				dateISO: startMonday,
				time: "19:00",
				durMinutes: 90,
			},
		});
		expect(zoom.updated[0]?.input.topic).toContain("Bài 1");
		expect(zoom.deleted.sort()).toEqual(["zm-del", "zm-rec"]);

		// Học viên ghi danh SAU khi overwrite vẫn nhận đủ link Zoom (cả API lẫn dán tay)
		const enrollRes = await t.call(t.teacher.key, "/api/students", {
			body: {
				name: "HV Vào Sau",
				email: "after@test.local",
				classId,
				activateNow: true,
			},
		});
		expect(enrollRes.status).toBe(201);
		const lessonsAfter = await t.libsql
			.select()
			.from(schema.lesson)
			.where(eq(schema.lesson.classId, classId));
		const lessonByDate = new Map(lessonsAfter.map((l) => [l.date, l]));
		expect(lessonByDate.get(startMonday)?.zoom).toBe("https://zoom.us/j/keep");
		expect(lessonByDate.get(secondMonday)?.zoom).toBe(
			"https://zoom.us/j/manual-link",
		);
	});

	test("4. Overwrite with active students + org holiday shift excludes holiday original date from conflictingDates, cleans old makeup meeting, and regenerates lessons & packages", async () => {
		const zoom = createMockZoom();
		const t = await setupOverwriteTestApp({ zoom });
		const startMonday = futureMondayISO();
		const secondMonday = addDaysISO(startMonday, 7);
		const oldMakeupDate = addDaysISO(startMonday, 10);
		const expectedMakeup = addDaysISO(startMonday, 21);

		const { templateId } = await t.seedTemplate("Template Lễ 3 bài", 3);
		const classId = await t.createManualClass({
			startDate: startMonday,
			schedule: { days: [0], start: "19:00", end: "20:30" },
		});

		for (const [i, email] of ["a1@test.local", "a2@test.local"].entries()) {
			const sRes = await t.call(t.teacher.key, "/api/students", {
				body: {
					name: `HV ${i + 1}`,
					email,
					classId,
					activateNow: true,
				},
			});
			expect(sRes.status).toBe(201);
		}

		// Tạo 2 buổi thủ công: ngày 1 (rơi vào lễ shift) và ngày 2 (ngày dạy hiệu lực)
		await t.call(t.teacher.key, `/api/classes/${classId}/sessions`, {
			body: {
				date: startMonday,
				time: "14:00",
				dur: 60,
				topic: "Thủ công ngày lễ",
			},
		});
		await t.call(t.teacher.key, `/api/classes/${classId}/sessions`, {
			body: {
				date: secondMonday,
				time: "15:00",
				dur: 60,
				topic: "Thủ công ngày dạy",
			},
		});

		// Chèn kỳ nghỉ lễ org mode shift trùng startMonday + 1 meeting cũ ở oldMakeupDate + 1 shift cũ
		const holidayId = crypto.randomUUID();
		await t.libsql.insert(schema.organizationHoliday).values({
			id: holidayId,
			orgId: t.orgId,
			name: "Nghỉ lễ đầu tuần",
			fromDate: startMonday,
			toDate: startMonday,
			scope: "org",
			mode: "shift",
			createdByUserId: t.teacher.userId,
		});
		await t.libsql.insert(schema.holidaySessionShift).values({
			id: crypto.randomUUID(),
			orgId: t.orgId,
			holidayId,
			classId,
			originalDate: startMonday,
			makeupDate: oldMakeupDate,
		});
		await t.libsql.insert(schema.classSessionMeeting).values([
			{
				id: "m-old-makeup",
				orgId: t.orgId,
				classId,
				date: oldMakeupDate,
				zoomMeetingId: "zm-old-makeup",
				joinUrl: "https://zoom.us/j/old-makeup",
				recordingUrl: "",
				recordingStatus: "pending",
			},
		]);

		const preview = await t.call(
			t.teacher.key,
			`/api/classes/${classId}/curriculum/import`,
			{ body: { templateId } },
		);
		expect(preview.status).toBe(409);
		const previewBody = (await preview.json()) as {
			conflictingDates: string[];
			otherManualDates: string[];
			overwriteHash: string;
		};
		// startMonday là ngày holiday đã dời → nằm ở otherManualDates; chỉ secondMonday là ngày dạy hiệu lực trùng
		expect(previewBody.conflictingDates).toEqual([secondMonday]);
		expect(previewBody.otherManualDates).toEqual([startMonday]);

		const overwriteRes = await t.call(
			t.teacher.key,
			`/api/classes/${classId}/curriculum/import`,
			{
				body: {
					templateId,
					overwriteManualSessions: true,
					overwriteHash: previewBody.overwriteHash,
				},
			},
		);
		expect(overwriteRes.status).toBe(201);

		const lessons = await t.libsql
			.select()
			.from(schema.lesson)
			.where(eq(schema.lesson.classId, classId));
		const activeLessons = lessons.filter((l) => l.status !== "holiday");
		const holidayLessons = lessons.filter((l) => l.status === "holiday");
		expect(activeLessons).toHaveLength(6); // 2 HV × 3 buổi
		expect(holidayLessons).toHaveLength(2);
		expect(activeLessons.every((l) => l.topic === "")).toBe(true);
		expect(activeLessons.some((l) => l.date === expectedMakeup)).toBe(true);

		// Gói buổi của cả 2 HV cập nhật từ 2 → 3
		const pkgs = await t.libsql
			.select()
			.from(schema.sessionPackage)
			.where(eq(schema.sessionPackage.orgId, t.orgId));
		expect(pkgs.map((p) => p.total)).toEqual([3, 3]);

		// Meeting trên ngày holiday và oldMakeupDate đã dọn sạch; meeting trên secondMonday còn nguyên
		const remainingMeetings = await t.libsql
			.select()
			.from(schema.classSessionMeeting)
			.where(eq(schema.classSessionMeeting.classId, classId));
		expect(remainingMeetings.map((m) => m.date)).toEqual([secondMonday]);
		expect(zoom.deleted).toContain("zm-old-makeup");
		expect(
			activeLessons
				.filter((l) => l.date === secondMonday)
				.every((l) => l.zoom !== ""),
		).toBe(true);
		expect(holidayLessons.every((l) => l.zoom === "")).toBe(true);
	});

	test("5. Blocks overwrite with 409 MANUAL_SESSIONS_COMPLETED when any manual session is completed/absent/attended (including null-date legacy row)", async () => {
		const t = await setupOverwriteTestApp();
		const todayISO = vietnamTodayISO();
		const startMonday = futureMondayISO();
		const { templateId } = await t.seedTemplate("Template Guard", 3);
		const classId = await t.createManualClass({ startDate: startMonday });

		await t.call(t.teacher.key, "/api/students", {
			body: {
				name: "HV Điểm Danh",
				email: "att@test.local",
				classId,
				activateNow: true,
			},
		});
		await t.call(t.teacher.key, `/api/classes/${classId}/sessions`, {
			body: {
				date: todayISO,
				time: "19:00",
				dur: 90,
				topic: "Buổi đã học",
			},
		});
		const checkInRes = await t.call(
			t.teacher.key,
			`/api/classes/${classId}/sessions/${todayISO}/check-in`,
			{ body: {} },
		);
		expect(checkInRes.status).toBe(200);

		for (const body of [
			{ templateId },
			{ templateId, overwriteManualSessions: true, overwriteHash: "any-hash" },
		]) {
			const res = await t.call(
				t.teacher.key,
				`/api/classes/${classId}/curriculum/import`,
				{ body },
			);
			expect(res.status).toBe(409);
			expect(await res.json()).toMatchObject({
				code: CURRICULUM_IMPORT_ERROR_CODES.MANUAL_SESSIONS_COMPLETED,
				reason: "has-completed-manual-sessions",
				completedDates: [todayISO],
			});
		}

		// Ca biên: dòng lesson completed mang date = null cũng bị chặn 409 (không 500)
		await t.libsql
			.update(schema.lesson)
			.set({ date: null })
			.where(eq(schema.lesson.classId, classId));
		const nullDateRes = await t.call(
			t.teacher.key,
			`/api/classes/${classId}/curriculum/import`,
			{
				body: {
					templateId,
					overwriteManualSessions: true,
					overwriteHash: "any",
				},
			},
		);
		expect(nullDateRes.status).toBe(409);
		expect(await nullDateRes.json()).toMatchObject({
			code: CURRICULUM_IMPORT_ERROR_CODES.MANUAL_SESSIONS_COMPLETED,
			completedDates: [],
		});
	});

	test("6. Rejects 422 on empty/>52 template, missing linked material (>100 links chunked), legacy schedule/startDate, and holiday SCAN_CAP_DAYS", async () => {
		const t = await setupOverwriteTestApp();
		const startMonday = futureMondayISO();
		const { templateId: emptyTpl } = await t.seedTemplate("Empty", 0);
		const { templateId: bigTpl } = await t.seedTemplate("Big 53", 53);
		const { templateId: okTpl } = await t.seedTemplate("OK 3 bài", 3);

		const classId = await t.createManualClass({ startDate: startMonday });
		await t.call(t.teacher.key, `/api/classes/${classId}/sessions`, {
			body: { date: startMonday, time: "19:00", dur: 90, topic: "Buổi 1" },
		});

		expect(
			(
				await t.call(
					t.teacher.key,
					`/api/classes/${classId}/curriculum/import`,
					{
						body: { templateId: emptyTpl, overwriteManualSessions: true },
					},
				)
			).status,
		).toBe(422);
		expect(
			(
				await t.call(
					t.teacher.key,
					`/api/classes/${classId}/curriculum/import`,
					{
						body: { templateId: bigTpl, overwriteManualSessions: true },
					},
				)
			).status,
		).toBe(422);

		// >100 material links (vượt trần 100 bind params nếu không chunk) với 105 tài liệu hợp lệ + 1 tài liệu bị thiếu
		const mats = Array.from({ length: 105 }, (_, i) => ({
			id: `mat-bulk-${i}`,
			orgId: t.orgId,
			title: `Mat ${i}`,
			kind: "link" as const,
			url: `https://example.com/${i}`,
			createdBy: t.teacher.userId,
		}));
		await t.libsql.insert(schema.material).values(mats);
		const { templateId: manyLinksTpl, lessonIds: manyLessonIds } =
			await t.seedTemplate("Many Links", 2);
		await t.libsql.insert(schema.syllabusLessonMaterial).values(
			mats.map((m, i) => ({
				orgId: t.orgId,
				syllabusLessonId: manyLessonIds[0] as string,
				materialId: m.id,
				position: i,
			})),
		);
		// Không nổ lỗi D1 bind params; trả 409 MANUAL_SESSIONS_EXIST sạch với 105 tài liệu hợp lệ
		const manyLinksPreview = await t.call(
			t.teacher.key,
			`/api/classes/${classId}/curriculum/import`,
			{ body: { templateId: manyLinksTpl } },
		);
		expect(manyLinksPreview.status).toBe(409);
		expect(await manyLinksPreview.json()).toMatchObject({
			code: CURRICULUM_IMPORT_ERROR_CODES.MANUAL_SESSIONS_EXIST,
		});

		// Gắn thêm tài liệu thứ 106 thuộc org khác (chunk thứ 3 >100 items) → 422 CURRICULUM_MATERIAL_NOT_FOUND
		await t.libsql.insert(schema.organization).values({
			id: "org-other",
			name: "Org Khác",
		});
		await t.libsql.insert(schema.material).values({
			id: "mat-cross-org-106",
			orgId: "org-other",
			title: "Cross Org Mat",
			kind: "link",
			url: "https://example.com/other",
			createdBy: t.teacher.userId,
		});
		await t.libsql.insert(schema.syllabusLessonMaterial).values({
			orgId: t.orgId,
			syllabusLessonId: manyLessonIds[1] as string,
			materialId: "mat-cross-org-106",
			position: 105,
		});
		const missingMatRes = await t.call(
			t.teacher.key,
			`/api/classes/${classId}/curriculum/import`,
			{ body: { templateId: manyLinksTpl } },
		);
		expect(missingMatRes.status).toBe(422);
		expect(await missingMatRes.json()).toMatchObject({
			code: CURRICULUM_IMPORT_ERROR_CODES.CURRICULUM_MATERIAL_NOT_FOUND,
			materialId: "mat-cross-org-106",
		});

		// Lớp có startDate rỗng / schedule legacy → 422 CURRICULUM_INVALID_CLASS_SCHEDULE
		const legacyClassId = await t.createManualClass({ startDate: "" });
		await t.call(t.teacher.key, `/api/classes/${legacyClassId}/sessions`, {
			body: { date: startMonday, time: "19:00", dur: 90, topic: "Buổi legacy" },
		});
		const legacyRes = await t.call(
			t.teacher.key,
			`/api/classes/${legacyClassId}/curriculum/import`,
			{ body: { templateId: okTpl } },
		);
		expect(legacyRes.status).toBe(422);
		expect(await legacyRes.json()).toMatchObject({
			code: CURRICULUM_IMPORT_ERROR_CODES.CURRICULUM_INVALID_CLASS_SCHEDULE,
		});

		// Kỳ nghỉ lễ phủ kín >364 ngày → 422 CURRICULUM_HOLIDAY_SCAN_CAP (không 500)
		await t.libsql.insert(schema.organizationHoliday).values({
			id: crypto.randomUUID(),
			orgId: t.orgId,
			name: "Nghỉ dài hạn",
			fromDate: startMonday,
			toDate: addDaysISO(startMonday, 400),
			scope: "org",
			mode: "shift",
			createdByUserId: t.teacher.userId,
		});
		const scanCapRes = await t.call(
			t.teacher.key,
			`/api/classes/${classId}/curriculum/import`,
			{ body: { templateId: okTpl } },
		);
		expect(scanCapRes.status).toBe(422);
		expect(await scanCapRes.json()).toMatchObject({
			code: CURRICULUM_IMPORT_ERROR_CODES.CURRICULUM_HOLIDAY_SCAN_CAP,
		});
	});

	test("7. Auto class with real lessons (0 class_session) preserves existing lessons even when overwriteManualSessions: true", async () => {
		const t = await setupOverwriteTestApp();
		const startMonday = futureMondayISO();
		const { templateId: tpl3 } = await t.seedTemplate("Auto 3 bài", 3);
		const { templateId: tpl5 } = await t.seedTemplate("Auto 5 bài", 5);

		const createRes = await t.call(t.teacher.key, "/api/classes", {
			body: {
				name: "Lớp Auto Bảo Vệ",
				type: "ielts",
				skills: ["Writing"],
				templateId: tpl3,
				schedulingMode: "auto",
				schedule: { days: [0], start: "19:00", end: "20:30" },
				sessionsTotal: 3,
				startDate: startMonday,
			},
		});
		const { id: classId } = (await createRes.json()) as { id: string };
		await t.call(t.teacher.key, "/api/students", {
			body: {
				name: "HV Auto",
				email: "auto@test.local",
				classId,
				activateNow: true,
			},
		});
		const beforeLessons = await t.libsql
			.select({ id: schema.lesson.id })
			.from(schema.lesson)
			.where(eq(schema.lesson.classId, classId));
		expect(beforeLessons).toHaveLength(3);

		await t.call(t.teacher.key, `/api/classes/${classId}/curriculum/remove`, {
			body: {},
		});
		const reimport = await t.call(
			t.teacher.key,
			`/api/classes/${classId}/curriculum/import`,
			{ body: { templateId: tpl5, overwriteManualSessions: true } },
		);
		expect(reimport.status).toBe(201);

		const afterLessons = await t.libsql
			.select({ id: schema.lesson.id })
			.from(schema.lesson)
			.where(eq(schema.lesson.classId, classId));
		expect(afterLessons.map((l) => l.id).sort()).toEqual(
			beforeLessons.map((l) => l.id).sort(),
		);
		const snap = await t.kernel();
		expect(snap.classes.find((c) => c.id === classId)?.sessionsTotal).toBe(3);
	});

	test("8. Paused manual class overwrites cleanly, preserves manual Zoom link in class_session_meeting, skips backfill until resume, and restores Zoom on resume", async () => {
		const t = await setupOverwriteTestApp();
		const startMonday = futureMondayISO();
		const { templateId } = await t.seedTemplate("Paused 3 bài", 3);
		const classId = await t.createManualClass({ startDate: startMonday });

		await t.call(t.teacher.key, "/api/students", {
			body: {
				name: "HV Paused",
				email: "paused@test.local",
				classId,
				activateNow: true,
			},
		});
		await t.call(t.teacher.key, `/api/classes/${classId}/sessions`, {
			body: {
				date: startMonday,
				time: "19:00",
				dur: 90,
				topic: "Buổi trước tạm dừng",
				zoom: "https://zoom.us/j/paused-manual",
			},
		});
		expect(
			(
				await t.call(t.teacher.key, `/api/classes/${classId}/status`, {
					body: { status: "paused" },
				})
			).status,
		).toBe(200);

		const preview = await t.call(
			t.teacher.key,
			`/api/classes/${classId}/curriculum/import`,
			{ body: { templateId } },
		);
		const { overwriteHash } = (await preview.json()) as {
			overwriteHash: string;
		};
		const overwriteRes = await t.call(
			t.teacher.key,
			`/api/classes/${classId}/curriculum/import`,
			{
				body: {
					templateId,
					overwriteManualSessions: true,
					overwriteHash,
				},
			},
		);
		expect(overwriteRes.status).toBe(201);

		// Khi đang paused: chưa backfill lesson, package.total = 0, manual zoom đã lưu trong class_session_meeting
		expect(
			await t.libsql
				.select()
				.from(schema.lesson)
				.where(eq(schema.lesson.classId, classId)),
		).toHaveLength(0);
		const [pkgPaused] = await t.libsql
			.select()
			.from(schema.sessionPackage)
			.where(eq(schema.sessionPackage.orgId, t.orgId));
		expect(pkgPaused?.total).toBe(0);

		// Mở lại lớp → backfill sinh đủ 3 lesson mang đúng link Zoom dán tay + package.total = 3
		expect(
			(
				await t.call(t.teacher.key, `/api/classes/${classId}/status`, {
					body: { status: "active" },
				})
			).status,
		).toBe(200);
		const resumedLessons = await t.libsql
			.select()
			.from(schema.lesson)
			.where(eq(schema.lesson.classId, classId));
		expect(resumedLessons).toHaveLength(3);
		expect(resumedLessons.find((l) => l.date === startMonday)?.zoom).toBe(
			"https://zoom.us/j/paused-manual",
		);
		const [pkgResumed] = await t.libsql
			.select()
			.from(schema.sessionPackage)
			.where(eq(schema.sessionPackage.orgId, t.orgId));
		expect(pkgResumed?.total).toBe(3);

		// Lớp paused có org holiday trùng startMonday → không giữ Zoom vào ngày nghỉ và khi resume không gán Zoom lên lesson holiday
		const pausedHolClassId = await t.createManualClass({
			name: "Paused With Org Holiday",
			startDate: startMonday,
		});
		await t.call(t.teacher.key, "/api/students", {
			body: {
				name: "HV Paused Hol",
				email: "paused-hol@test.local",
				classId: pausedHolClassId,
				activateNow: true,
			},
		});
		await t.call(t.teacher.key, `/api/classes/${pausedHolClassId}/sessions`, {
			body: {
				date: startMonday,
				time: "19:00",
				dur: 90,
				topic: "Buổi rơi ngày lễ",
				zoom: "https://zoom.us/j/holiday-should-not-leak",
			},
		});
		await t.call(t.teacher.key, `/api/classes/${pausedHolClassId}/status`, {
			body: { status: "paused" },
		});
		await t.libsql.insert(schema.organizationHoliday).values({
			id: crypto.randomUUID(),
			orgId: t.orgId,
			name: "Lễ lúc paused",
			fromDate: startMonday,
			toDate: startMonday,
			scope: "org",
			mode: "shift",
			createdByUserId: t.teacher.userId,
		});
		const holPreview = (await (
			await t.call(
				t.teacher.key,
				`/api/classes/${pausedHolClassId}/curriculum/import`,
				{ body: { templateId } },
			)
		).json()) as {
			conflictingDates: string[];
			otherManualDates: string[];
			overwriteHash: string;
		};
		expect(holPreview.conflictingDates).toEqual([]);
		expect(holPreview.otherManualDates).toEqual([startMonday]);
		expect(
			(
				await t.call(
					t.teacher.key,
					`/api/classes/${pausedHolClassId}/curriculum/import`,
					{
						body: {
							templateId,
							overwriteManualSessions: true,
							overwriteHash: holPreview.overwriteHash,
						},
					},
				)
			).status,
		).toBe(201);
		await t.call(t.teacher.key, `/api/classes/${pausedHolClassId}/status`, {
			body: { status: "active" },
		});
		const holResumedLessons = await t.libsql
			.select()
			.from(schema.lesson)
			.where(eq(schema.lesson.classId, pausedHolClassId));
		const holidayRow = holResumedLessons.find((l) => l.date === startMonday);
		expect(holidayRow?.status).toBe("holiday");
		expect(holidayRow?.zoom).toBe("");
	});

	test("9. Deterministic TOCTOU races: check-in -> 409 COMPLETED, moveDate -> 409 EXIST fresh hash, DELETE last -> 409 CLASS_STATE_CHANGED, 0-session race -> 409 EXIST with metadata", async () => {
		const t = await setupOverwriteTestApp();
		const startMonday = futureMondayISO();
		const otherTue = addDaysISO(startMonday, 1);
		const { templateId } = await t.seedTemplate("Race 3 bài", 3);

		// Race A: check-in chen ngang ngay trước batch overwrite → rollback sạch, 409 MANUAL_SESSIONS_COMPLETED
		const classA = await t.createManualClass({
			name: "Race A",
			startDate: startMonday,
		});
		await t.call(t.teacher.key, "/api/students", {
			body: {
				name: "HV Race A",
				email: "racea@test.local",
				classId: classA,
				activateNow: true,
			},
		});
		await t.call(t.teacher.key, `/api/classes/${classA}/sessions`, {
			body: { date: startMonday, time: "19:00", dur: 90, topic: "Buổi A" },
		});
		const previewA = (await (
			await t.call(t.teacher.key, `/api/classes/${classA}/curriculum/import`, {
				body: { templateId },
			})
		).json()) as { overwriteHash: string };
		t.setNextBatchInterceptor(async () => {
			await t.libsql
				.update(schema.lesson)
				.set({ status: "completed", attendance: "present" })
				.where(
					and(
						eq(schema.lesson.classId, classA),
						eq(schema.lesson.date, startMonday),
					),
				);
			return true;
		});
		const resA = await t.call(
			t.teacher.key,
			`/api/classes/${classA}/curriculum/import`,
			{
				body: {
					templateId,
					overwriteManualSessions: true,
					overwriteHash: previewA.overwriteHash,
				},
			},
		);
		expect(resA.status).toBe(409);
		expect(await resA.json()).toMatchObject({
			code: CURRICULUM_IMPORT_ERROR_CODES.MANUAL_SESSIONS_COMPLETED,
			completedDates: [startMonday],
		});
		expect(
			await t.libsql
				.select()
				.from(schema.classSession)
				.where(eq(schema.classSession.classId, classA)),
		).toHaveLength(1);

		// Race B: moveDate đổi ngày giữ nguyên count(*) ngay trước batch overwrite → CAS bắt được, 409 MANUAL_SESSIONS_EXIST kèm hash mới
		const classB = await t.createManualClass({
			name: "Race B",
			startDate: startMonday,
		});
		await t.call(t.teacher.key, `/api/classes/${classB}/sessions`, {
			body: { date: startMonday, time: "19:00", dur: 90, topic: "Buổi B" },
		});
		const previewB = (await (
			await t.call(t.teacher.key, `/api/classes/${classB}/curriculum/import`, {
				body: { templateId },
			})
		).json()) as { overwriteHash: string };
		t.setNextBatchInterceptor(async () => {
			await t.libsql
				.update(schema.classSession)
				.set({ date: otherTue })
				.where(eq(schema.classSession.classId, classB));
			return true;
		});
		const resB = await t.call(
			t.teacher.key,
			`/api/classes/${classB}/curriculum/import`,
			{
				body: {
					templateId,
					overwriteManualSessions: true,
					overwriteHash: previewB.overwriteHash,
				},
			},
		);
		expect(resB.status).toBe(409);
		const bodyB = (await resB.json()) as {
			code: string;
			otherManualDates: string[];
			overwriteHash: string;
		};
		expect(bodyB.code).toBe(
			CURRICULUM_IMPORT_ERROR_CODES.MANUAL_SESSIONS_EXIST,
		);
		expect(bodyB.otherManualDates).toEqual([otherTue]);
		expect(bodyB.overwriteHash).not.toBe(previewB.overwriteHash);

		// Race C: xóa buổi thủ công cuối cùng về 0 ngay trước batch overwrite → 409 CLASS_STATE_CHANGED (không 500, không manualSessionCount: 0)
		const classC = await t.createManualClass({
			name: "Race C",
			startDate: startMonday,
		});
		await t.call(t.teacher.key, `/api/classes/${classC}/sessions`, {
			body: { date: startMonday, time: "19:00", dur: 90, topic: "Buổi C" },
		});
		const previewC = (await (
			await t.call(t.teacher.key, `/api/classes/${classC}/curriculum/import`, {
				body: { templateId },
			})
		).json()) as { overwriteHash: string };
		t.setNextBatchInterceptor(async () => {
			await t.libsql
				.delete(schema.classSession)
				.where(eq(schema.classSession.classId, classC));
			return true;
		});
		const resC = await t.call(
			t.teacher.key,
			`/api/classes/${classC}/curriculum/import`,
			{
				body: {
					templateId,
					overwriteManualSessions: true,
					overwriteHash: previewC.overwriteHash,
				},
			},
		);
		expect(resC.status).toBe(409);
		const bodyC = (await resC.json()) as {
			code: string;
			manualSessionCount?: number;
		};
		expect(bodyC.code).toBe(CURRICULUM_IMPORT_ERROR_CODES.CLASS_STATE_CHANGED);
		expect(bodyC.manualSessionCount).toBeUndefined();

		// Race D: lớp 0 buổi gặp POST /sessions chen ngang trước batch → 409 MANUAL_SESSIONS_EXIST ĐẦY ĐỦ metadata
		const classD = await t.createManualClass({
			name: "Race D",
			startDate: startMonday,
		});
		t.setNextBatchInterceptor(async () => {
			await t.libsql.insert(schema.classSession).values({
				id: crypto.randomUUID(),
				orgId: t.orgId,
				classId: classD,
				date: startMonday,
				time: "19:00",
				dur: 90,
				topic: "Chen ngang",
				zoom: "",
			});
			return true;
		});
		const resD = await t.call(
			t.teacher.key,
			`/api/classes/${classD}/curriculum/import`,
			{ body: { templateId } },
		);
		expect(resD.status).toBe(409);
		const bodyD = (await resD.json()) as {
			code: string;
			conflictingDates: string[];
			manualSessionCount: number;
			overwriteHash: string;
		};
		expect(bodyD).toMatchObject({
			code: CURRICULUM_IMPORT_ERROR_CODES.MANUAL_SESSIONS_EXIST,
			conflictingDates: [startMonday],
			manualSessionCount: 1,
		});
		expect(bodyD.overwriteHash.length).toBeGreaterThanOrEqual(16);

		// Race E: syncRecordingForOccurrence cập nhật recordingUrl trên ngày ngoài activeDates ngay trước batch → CAS chặn, không xóa mất recordingUrl
		const classE = await t.createManualClass({
			name: "Race E Recording",
			startDate: startMonday,
		});
		await t.call(t.teacher.key, `/api/classes/${classE}/sessions`, {
			body: { date: otherTue, time: "19:00", dur: 90, topic: "Buổi E" },
		});
		const meetingEId = crypto.randomUUID();
		await t.libsql.insert(schema.classSessionMeeting).values({
			id: meetingEId,
			orgId: t.orgId,
			classId: classE,
			date: otherTue,
			zoomMeetingId: "zm-race-e",
			joinUrl: "https://zoom.us/j/race-e",
			recordingUrl: "",
			recordingStatus: "none",
		});
		const previewE = (await (
			await t.call(t.teacher.key, `/api/classes/${classE}/curriculum/import`, {
				body: { templateId },
			})
		).json()) as { overwriteHash: string };
		t.setNextBatchInterceptor(async () => {
			await t.libsql
				.update(schema.classSessionMeeting)
				.set({
					recordingUrl: "https://zoom.us/rec/saved-in-race",
					recordingStatus: "ready",
				})
				.where(eq(schema.classSessionMeeting.id, meetingEId));
			return true;
		});
		const resE = await t.call(
			t.teacher.key,
			`/api/classes/${classE}/curriculum/import`,
			{
				body: {
					templateId,
					overwriteManualSessions: true,
					overwriteHash: previewE.overwriteHash,
				},
			},
		);
		expect(resE.status).toBe(409);
		const [meetingAfterE] = await t.libsql
			.select()
			.from(schema.classSessionMeeting)
			.where(eq(schema.classSessionMeeting.id, meetingEId));
		expect(meetingAfterE?.recordingUrl).toBe(
			"https://zoom.us/rec/saved-in-race",
		);

		// Race F: admin thêm kỳ nghỉ lễ giữa bước 1 và bước 2 → overwriteHash cũ bị từ chối, trả 409 kèm hash mới & danh sách cập nhật
		const classF = await t.createManualClass({
			name: "Race F Holiday Hash",
			startDate: startMonday,
		});
		await t.call(t.teacher.key, `/api/classes/${classF}/sessions`, {
			body: { date: startMonday, time: "19:00", dur: 90, topic: "Buổi F" },
		});
		const previewF = (await (
			await t.call(t.teacher.key, `/api/classes/${classF}/curriculum/import`, {
				body: { templateId },
			})
		).json()) as { conflictingDates: string[]; overwriteHash: string };
		expect(previewF.conflictingDates).toEqual([startMonday]);
		const holidayFId = crypto.randomUUID();
		await t.libsql.insert(schema.organizationHoliday).values({
			id: holidayFId,
			orgId: t.orgId,
			name: "Nghỉ chen ngang",
			fromDate: startMonday,
			toDate: startMonday,
			scope: "classes",
			mode: "shift",
			createdByUserId: t.teacher.userId,
		});
		await t.libsql.insert(schema.organizationHolidayClass).values({
			id: crypto.randomUUID(),
			holidayId: holidayFId,
			classId: classF,
		});
		const resF = await t.call(
			t.teacher.key,
			`/api/classes/${classF}/curriculum/import`,
			{
				body: {
					templateId,
					overwriteManualSessions: true,
					overwriteHash: previewF.overwriteHash,
				},
			},
		);
		expect(resF.status).toBe(409);
		const bodyF = (await resF.json()) as {
			code: string;
			conflictingDates: string[];
			otherManualDates: string[];
			overwriteHash: string;
		};
		expect(bodyF.code).toBe(
			CURRICULUM_IMPORT_ERROR_CODES.MANUAL_SESSIONS_EXIST,
		);
		expect(bodyF.conflictingDates).toEqual([]);
		expect(bodyF.otherManualDates).toEqual([startMonday]);
		expect(bodyF.overwriteHash).not.toBe(previewF.overwriteHash);

		// Race G: template bị xóa đồng thời ngay trước batch overwrite → 404 syllabus not found (không trả nhầm 409)
		const { templateId: ephemeralTpl } = await t.seedTemplate("Ephemeral", 2);
		const classG = await t.createManualClass({
			name: "Race G Template Deleted",
			startDate: startMonday,
		});
		await t.call(t.teacher.key, `/api/classes/${classG}/sessions`, {
			body: { date: startMonday, time: "19:00", dur: 90, topic: "Buổi G" },
		});
		const previewG = (await (
			await t.call(t.teacher.key, `/api/classes/${classG}/curriculum/import`, {
				body: { templateId: ephemeralTpl },
			})
		).json()) as { overwriteHash: string };
		t.setNextBatchInterceptor(async () => {
			await t.libsql
				.delete(schema.syllabus)
				.where(eq(schema.syllabus.id, ephemeralTpl));
			return true;
		});
		const resG = await t.call(
			t.teacher.key,
			`/api/classes/${classG}/curriculum/import`,
			{
				body: {
					templateId: ephemeralTpl,
					overwriteManualSessions: true,
					overwriteHash: previewG.overwriteHash,
				},
			},
		);
		expect(resG.status).toBe(404);
		expect(await resG.json()).toEqual({ error: "syllabus not found" });
	});
});
