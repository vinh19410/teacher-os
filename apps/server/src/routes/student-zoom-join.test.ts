import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	ACCOUNT_ERROR_CODES,
	CLASS_ERROR_CODES,
	STUDENT_ERROR_CODES,
	type StudentClassDetail,
	type StudentOverview,
	type StudentScheduleResponse,
	studentZoomJoinErrorSchema,
	studentZoomJoinResponseSchema,
} from "@teacher-os/api/contracts";
import { ZOOM_JOIN_ERROR_CODES } from "@teacher-os/api/zoom-window";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, test } from "vitest";
import { buildApp, type Db } from "../app";
import type { SessionUser } from "../session";

const CORS_ORIGIN = "http://localhost:8001";
const STUDENT_ORIGIN = "http://localhost:8003";
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);

const ZOOM_URL_LESSON = "https://zoom.us/j/999000111";
const ZOOM_URL_MEETING = "https://zoom.us/j/888000222";
const ZOOM_URL_SECOND = "https://zoom.us/j/777000333";

let db: Db;
let currentNow: Date;

function createApp() {
	return buildApp({
		getDb: () => db,
		corsOrigin: [CORS_ORIGIN, STUDENT_ORIGIN],
		now: () => currentNow,
		getSessionUser: async (headers): Promise<SessionUser | null> => {
			const key = headers.get("x-test-user");
			if (key === "teacher-1") {
				return {
					userId: "u-teacher",
					userName: "Cô Lan",
					email: "teacher@workspace.edu.vn",
					emailVerified: true,
					role: "teacher",
				};
			}
			if (key === "student-1") {
				return {
					userId: "u-s1",
					userName: "Minh Anh",
					email: "minhanh@example.com",
					emailVerified: true,
					role: "student",
				};
			}
			if (key === "student-outsider") {
				return {
					userId: "u-s2",
					userName: "Người Lạ",
					email: "outsider@example.com",
					emailVerified: true,
					role: "student",
				};
			}
			return null;
		},
		authHandler: async () => new Response(null, { status: 404 }),
	});
}

beforeEach(async () => {
	const client = createClient({ url: "file::memory:" });
	const raw = drizzle(client, { schema });
	await migrate(raw, { migrationsFolder: MIGRATIONS_DIR });
	db = raw as unknown as Db;

	// Mặc định trước buổi học 2026-11-25 19:00 GMT+7 khá xa
	currentNow = new Date("2026-11-25T10:00:00+07:00");

	await db.insert(schema.organization).values([
		{ id: "org-1", name: "Academy 1" },
		{ id: "org-2", name: "Academy 2" },
	]);
	await db.insert(schema.user).values([
		{
			id: "u-teacher",
			name: "Cô Lan",
			email: "teacher@workspace.edu.vn",
			emailVerified: true,
			role: "teacher",
		},
		{
			id: "u-s1",
			name: "Minh Anh",
			email: "minhanh@example.com",
			emailVerified: true,
			role: "student",
		},
		{
			id: "u-s2",
			name: "Người Lạ",
			email: "outsider@example.com",
			emailVerified: true,
			role: "student",
		},
	]);
	await db.insert(schema.membership).values({
		id: "mem-1",
		orgId: "org-1",
		userId: "u-teacher",
		role: "teacher",
	});
	await db.insert(schema.student).values([
		{
			id: "s-1",
			orgId: "org-1",
			name: "Minh Anh",
			email: "minhanh@example.com",
		},
		{
			id: "s-1-org2",
			orgId: "org-2",
			name: "Minh Anh Org 2",
			email: "minhanh@example.com",
		},
		{
			id: "s-2",
			orgId: "org-1",
			name: "Người Lạ",
			email: "outsider@example.com",
		},
	]);
	await db.insert(schema.classTable).values([
		{
			id: "cls-active",
			orgId: "org-1",
			name: "IELTS Speaking 7.0",
			level: "IELTS 7.0",
			mode: "Online",
			schedule: '{"days":[2],"start":"19:00","end":"20:30"}',
			startDate: "2026-11-20",
			sessionsDone: 0,
			sessionsTotal: 10,
			status: "active",
		},
		{
			id: "cls-paused",
			orgId: "org-1",
			name: "Paused Class",
			level: "IELTS 6.0",
			mode: "Online",
			schedule: '{"days":[2],"start":"19:00","end":"20:30"}',
			startDate: "2026-11-20",
			sessionsDone: 0,
			sessionsTotal: 10,
			status: "paused",
		},
		{
			id: "cls-invited",
			orgId: "org-1",
			name: "Invited Class",
			level: "IELTS 6.5",
			mode: "Online",
			schedule: '{"days":[2],"start":"19:00","end":"20:30"}',
			startDate: "2026-11-20",
			sessionsDone: 0,
			sessionsTotal: 10,
			status: "active",
		},
		{
			id: "cls-legacy",
			orgId: "org-1",
			name: "Legacy Undated Class",
			level: "IELTS 5.5",
			mode: "Online",
			schedule: "T4 19:00",
			startDate: "",
			sessionsDone: 0,
			sessionsTotal: 2,
			status: "active",
		},
		{
			id: "cls-org2",
			orgId: "org-2",
			name: "Org 2 Class",
			level: "IELTS 7.5",
			mode: "Online",
			schedule: '{"days":[2],"start":"19:00","end":"20:30"}',
			startDate: "2026-11-20",
			sessionsDone: 0,
			sessionsTotal: 10,
			status: "active",
		},
	]);
	await db.insert(schema.enrollment).values([
		{
			id: "enr-active",
			orgId: "org-1",
			classId: "cls-active",
			studentId: "s-1",
			status: "active",
		},
		{
			id: "enr-paused",
			orgId: "org-1",
			classId: "cls-paused",
			studentId: "s-1",
			status: "active",
		},
		{
			id: "enr-invited",
			orgId: "org-1",
			classId: "cls-invited",
			studentId: "s-1",
			status: "invited",
		},
		{
			id: "enr-legacy",
			orgId: "org-1",
			classId: "cls-legacy",
			studentId: "s-1",
			status: "active",
		},
		{
			id: "enr-org2",
			orgId: "org-2",
			classId: "cls-org2",
			studentId: "s-1-org2",
			status: "active",
		},
	]);
	await db.insert(schema.lesson).values([
		{
			id: "les-zoom-direct",
			orgId: "org-1",
			classId: "cls-active",
			enrollmentId: "enr-active",
			day: 3,
			time: "19:00",
			dur: 90,
			date: "2026-11-25",
			status: "upcoming",
			topic: "Speaking Part 2",
			zoom: ZOOM_URL_LESSON,
		},
		{
			id: "les-meeting-fallback",
			orgId: "org-1",
			classId: "cls-active",
			enrollmentId: "enr-active",
			day: 5,
			time: "19:00",
			dur: 90,
			date: "2026-11-27",
			status: "upcoming",
			topic: "Fallback Meeting Zoom",
			zoom: "",
		},
		{
			id: "les-no-zoom",
			orgId: "org-1",
			classId: "cls-active",
			enrollmentId: "enr-active",
			day: 6,
			time: "19:00",
			dur: 90,
			date: "2026-11-28",
			status: "upcoming",
			topic: "No Zoom Yet",
			zoom: "",
		},
		{
			id: "les-invalid-zoom",
			orgId: "org-1",
			classId: "cls-active",
			enrollmentId: "enr-active",
			day: 7,
			time: "19:00",
			dur: 90,
			date: "2026-11-29",
			status: "upcoming",
			topic: "Bad Zoom Scheme",
			zoom: "http://zoom.us/j/insecure",
		},
		{
			id: "les-cancelled",
			orgId: "org-1",
			classId: "cls-active",
			enrollmentId: "enr-active",
			day: 1,
			time: "19:00",
			dur: 90,
			date: "2026-11-30",
			status: "cancelled",
			topic: "Cancelled Session",
			zoom: ZOOM_URL_LESSON,
		},
		{
			id: "les-holiday",
			orgId: "org-1",
			classId: "cls-active",
			enrollmentId: "enr-active",
			day: 2,
			time: "19:00",
			dur: 90,
			date: "2026-12-01",
			status: "holiday",
			topic: "Holiday Shifted Session",
			zoom: ZOOM_URL_LESSON,
		},
		{
			id: "les-paused",
			orgId: "org-1",
			classId: "cls-paused",
			enrollmentId: "enr-paused",
			day: 3,
			time: "19:00",
			dur: 90,
			date: "2026-11-25",
			status: "upcoming",
			topic: "Paused Session",
			zoom: ZOOM_URL_LESSON,
		},
		{
			id: "les-invited",
			orgId: "org-1",
			classId: "cls-invited",
			enrollmentId: "enr-invited",
			day: 3,
			time: "19:00",
			dur: 90,
			date: "2026-11-25",
			status: "upcoming",
			topic: "Invited Session",
			zoom: ZOOM_URL_LESSON,
		},
		{
			id: "les-legacy",
			orgId: "org-1",
			classId: "cls-legacy",
			enrollmentId: "enr-legacy",
			day: 3,
			time: "19:00",
			dur: 90,
			date: null,
			status: "upcoming",
			topic: "Legacy Undated",
			zoom: ZOOM_URL_LESSON,
		},
		{
			id: "les-org2",
			orgId: "org-2",
			classId: "cls-org2",
			enrollmentId: "enr-org2",
			day: 3,
			time: "19:00",
			dur: 90,
			date: "2026-11-25",
			status: "upcoming",
			topic: "Org 2 Session",
			zoom: ZOOM_URL_LESSON,
		},
	]);
	await db.insert(schema.classSessionMeeting).values({
		id: "csm-fallback",
		orgId: "org-1",
		classId: "cls-active",
		date: "2026-11-27",
		zoomMeetingId: "888000222",
		joinUrl: ZOOM_URL_MEETING,
	});
});

describe("Ẩn raw joinUrl trên overview / chi tiết lớp / lịch học học viên", () => {
	test("trả hasZoom: true và dur trên nextSession, tuyệt đối không rò rỉ raw joinUrl", async () => {
		const app = createApp();
		const headers = {
			"x-test-user": "student-1",
			"x-student-org-id": "org-1",
		};

		const overviewRes = await app.request("/api/student/overview", { headers });
		expect(overviewRes.status).toBe(200);
		const overviewRaw = await overviewRes.text();
		expect(overviewRaw).not.toContain("zoom.us/j/");
		expect(overviewRaw).not.toContain("joinUrl");
		const overview = JSON.parse(overviewRaw) as StudentOverview;
		const activeCls = overview.classes.find((c) => c.id === "cls-active");
		expect(activeCls?.nextSession).toEqual({
			date: "2026-11-25",
			time: "19:00",
			dur: 90,
			topic: "Speaking Part 2",
			hasZoom: true,
		});

		const detailRes = await app.request("/api/student/classes/cls-active", {
			headers,
		});
		expect(detailRes.status).toBe(200);
		const detailRaw = await detailRes.text();
		expect(detailRaw).not.toContain("zoom.us/j/");
		expect(detailRaw).not.toContain("joinUrl");
		const detail = JSON.parse(detailRaw) as StudentClassDetail;
		expect(detail.class.nextSession).toEqual({
			date: "2026-11-25",
			time: "19:00",
			dur: 90,
			topic: "Speaking Part 2",
			hasZoom: true,
		});
		expect(
			detail.lessons.find((l) => l.id === "les-zoom-direct")?.hasZoom,
		).toBe(true);
		expect(
			detail.lessons.find((l) => l.id === "les-meeting-fallback")?.hasZoom,
		).toBe(true);
		expect(
			detail.lessons.find((l) => l.id === "les-no-zoom")?.hasZoom,
		).toBeUndefined();
		expect(
			detail.lessons.find((l) => l.id === "les-invalid-zoom")?.hasZoom,
		).toBeUndefined();
		expect(
			detail.lessons.find((l) => l.id === "les-cancelled")?.hasZoom,
		).toBeUndefined();
		expect(
			detail.lessons.find((l) => l.id === "les-holiday")?.hasZoom,
		).toBeUndefined();

		const scheduleRes = await app.request("/api/student/schedule", { headers });
		expect(scheduleRes.status).toBe(200);
		const scheduleRaw = await scheduleRes.text();
		expect(scheduleRaw).not.toContain("zoom.us/j/");
		expect(scheduleRaw).not.toContain("joinUrl");
		const schedule = JSON.parse(scheduleRaw) as StudentScheduleResponse;
		expect(
			schedule.lessons.find((l) => l.id === "les-zoom-direct")?.hasZoom,
		).toBe(true);
		expect(
			schedule.lessons.find((l) => l.id === "les-meeting-fallback")?.hasZoom,
		).toBe(true);
		// Buổi legacy không có date → không gắn hasZoom và không lộ joinUrl
		expect(
			schedule.lessons.find((l) => l.id === "les-legacy")?.hasZoom,
		).toBeUndefined();
	});
});

describe("GET /api/student/classes/:classId/sessions/:date/zoom-join", () => {
	const studentHeaders = {
		"x-test-user": "student-1",
		"x-student-org-id": "org-1",
	};

	test("ranh giới start - 30m - 1ms → 403 ZOOM_JOIN_TOO_EARLY, không lộ joinUrl, có Cache-Control: no-store", async () => {
		currentNow = new Date("2026-11-25T18:29:59.999+07:00");
		const app = createApp();

		const res = await app.request(
			"/api/student/classes/cls-active/sessions/2026-11-25/zoom-join",
			{ headers: studentHeaders },
		);
		expect(res.status).toBe(403);
		expect(res.headers.get("cache-control")).toBe("no-store");
		const text = await res.text();
		expect(text).not.toContain(ZOOM_URL_LESSON);
		const parsed = studentZoomJoinErrorSchema.parse(JSON.parse(text));
		expect(parsed.code).toBe(ZOOM_JOIN_ERROR_CODES.TOO_EARLY);
		expect(parsed.date).toBe("2026-11-25");
		expect(parsed.time).toBe("19:00");
		expect(parsed.dur).toBe(90);
		expect(parsed.openAt).toBe(
			new Date("2026-11-25T18:30:00+07:00").toISOString(),
		);
		expect(parsed.closeAt).toBe(
			new Date("2026-11-25T20:30:00+07:00").toISOString(),
		);
		expect(parsed.error).toContain("18:30");
		expect(parsed.error).toContain("20:30");
	});

	test("ranh giới start - 30m → 200 { joinUrl, openAt, closeAt } + Cache-Control: no-store", async () => {
		currentNow = new Date("2026-11-25T18:30:00.000+07:00");
		const app = createApp();

		const res = await app.request(
			"/api/student/classes/cls-active/sessions/2026-11-25/zoom-join",
			{ headers: studentHeaders },
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("cache-control")).toBe("no-store");
		const body = studentZoomJoinResponseSchema.parse(await res.json());
		expect(body).toEqual({
			joinUrl: ZOOM_URL_LESSON,
			openAt: new Date("2026-11-25T18:30:00+07:00").toISOString(),
			closeAt: new Date("2026-11-25T20:30:00+07:00").toISOString(),
		});
	});

	test("trong giờ học → 200 { joinUrl, openAt, closeAt }", async () => {
		currentNow = new Date("2026-11-25T19:45:00+07:00");
		const app = createApp();

		const res = await app.request(
			"/api/student/classes/cls-active/sessions/2026-11-25/zoom-join",
			{ headers: studentHeaders },
		);
		expect(res.status).toBe(200);
		const body = studentZoomJoinResponseSchema.parse(await res.json());
		expect(body.joinUrl).toBe(ZOOM_URL_LESSON);
	});

	test("ranh giới end - 1ms → 200 { joinUrl, openAt, closeAt }", async () => {
		currentNow = new Date("2026-11-25T20:29:59.999+07:00");
		const app = createApp();

		const res = await app.request(
			"/api/student/classes/cls-active/sessions/2026-11-25/zoom-join",
			{ headers: studentHeaders },
		);
		expect(res.status).toBe(200);
		const body = studentZoomJoinResponseSchema.parse(await res.json());
		expect(body.joinUrl).toBe(ZOOM_URL_LESSON);
	});

	test("ranh giới end (now === closeMs) → 403 ZOOM_JOIN_ENDED, không lộ joinUrl", async () => {
		currentNow = new Date("2026-11-25T20:30:00.000+07:00");
		const app = createApp();

		const res = await app.request(
			"/api/student/classes/cls-active/sessions/2026-11-25/zoom-join",
			{ headers: studentHeaders },
		);
		expect(res.status).toBe(403);
		expect(res.headers.get("cache-control")).toBe("no-store");
		const text = await res.text();
		expect(text).not.toContain(ZOOM_URL_LESSON);
		const parsed = studentZoomJoinErrorSchema.parse(JSON.parse(text));
		expect(parsed.code).toBe(ZOOM_JOIN_ERROR_CODES.ENDED);
		expect(parsed.error).toContain("19:00");
		expect(parsed.error).toContain("20:30");
	});

	test("fallback sang class_session_meeting.joinUrl khi lesson.zoom rỗng", async () => {
		currentNow = new Date("2026-11-27T18:45:00+07:00");
		const app = createApp();

		const res = await app.request(
			"/api/student/classes/cls-active/sessions/2026-11-27/zoom-join",
			{ headers: studentHeaders },
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("cache-control")).toBe("no-store");
		const body = studentZoomJoinResponseSchema.parse(await res.json());
		expect(body.joinUrl).toBe(ZOOM_URL_MEETING);
	});

	test("lớp paused → 409 CLASS_PAUSED, không lộ joinUrl", async () => {
		currentNow = new Date("2026-11-25T19:00:00+07:00");
		const app = createApp();

		const res = await app.request(
			"/api/student/classes/cls-paused/sessions/2026-11-25/zoom-join",
			{ headers: studentHeaders },
		);
		expect(res.status).toBe(409);
		expect(res.headers.get("cache-control")).toBe("no-store");
		const text = await res.text();
		expect(text).not.toContain(ZOOM_URL_LESSON);
		const parsed = studentZoomJoinErrorSchema.parse(JSON.parse(text));
		expect(parsed.code).toBe(CLASS_ERROR_CODES.CLASS_PAUSED);
	});

	test("buổi cancelled hoặc holiday → 409 ZOOM_JOIN_SESSION_INACTIVE, không lộ joinUrl", async () => {
		const app = createApp();

		currentNow = new Date("2026-11-30T19:00:00+07:00");
		const cancelledRes = await app.request(
			"/api/student/classes/cls-active/sessions/2026-11-30/zoom-join",
			{ headers: studentHeaders },
		);
		expect(cancelledRes.status).toBe(409);
		expect(cancelledRes.headers.get("cache-control")).toBe("no-store");
		const cancelledText = await cancelledRes.text();
		expect(cancelledText).not.toContain(ZOOM_URL_LESSON);
		expect(
			studentZoomJoinErrorSchema.parse(JSON.parse(cancelledText)).code,
		).toBe(ZOOM_JOIN_ERROR_CODES.SESSION_INACTIVE);

		currentNow = new Date("2026-12-01T19:00:00+07:00");
		const holidayRes = await app.request(
			"/api/student/classes/cls-active/sessions/2026-12-01/zoom-join",
			{ headers: studentHeaders },
		);
		expect(holidayRes.status).toBe(409);
		expect(holidayRes.headers.get("cache-control")).toBe("no-store");
		const holidayText = await holidayRes.text();
		expect(holidayText).not.toContain(ZOOM_URL_LESSON);
		expect(studentZoomJoinErrorSchema.parse(JSON.parse(holidayText)).code).toBe(
			ZOOM_JOIN_ERROR_CODES.SESSION_INACTIVE,
		);
	});

	test("buổi không có link Zoom hoặc link không phải https:// → 404 ZOOM_JOIN_NOT_AVAILABLE", async () => {
		const app = createApp();

		currentNow = new Date("2026-11-28T19:00:00+07:00");
		const noZoomRes = await app.request(
			"/api/student/classes/cls-active/sessions/2026-11-28/zoom-join",
			{ headers: studentHeaders },
		);
		expect(noZoomRes.status).toBe(404);
		expect(noZoomRes.headers.get("cache-control")).toBe("no-store");
		expect(studentZoomJoinErrorSchema.parse(await noZoomRes.json()).code).toBe(
			ZOOM_JOIN_ERROR_CODES.NOT_AVAILABLE,
		);

		currentNow = new Date("2026-11-29T19:00:00+07:00");
		const invalidZoomRes = await app.request(
			"/api/student/classes/cls-active/sessions/2026-11-29/zoom-join",
			{ headers: studentHeaders },
		);
		expect(invalidZoomRes.status).toBe(404);
		expect(invalidZoomRes.headers.get("cache-control")).toBe("no-store");
		expect(
			studentZoomJoinErrorSchema.parse(await invalidZoomRes.json()).code,
		).toBe(ZOOM_JOIN_ERROR_CODES.NOT_AVAILABLE);

		// Ngày không có buổi học trong lớp
		const missingDateRes = await app.request(
			"/api/student/classes/cls-active/sessions/2026-12-15/zoom-join",
			{ headers: studentHeaders },
		);
		expect(missingDateRes.status).toBe(404);
		expect(
			studentZoomJoinErrorSchema.parse(await missingDateRes.json()).code,
		).toBe(ZOOM_JOIN_ERROR_CODES.NOT_AVAILABLE);
	});

	test("IDOR & quyền truy cập: chưa đăng nhập, outsider, enrollment invited, sai org, giáo viên", async () => {
		currentNow = new Date("2026-11-25T19:00:00+07:00");
		const app = createApp();

		// Chưa đăng nhập → 401
		const unauth = await app.request(
			"/api/student/classes/cls-active/sessions/2026-11-25/zoom-join",
		);
		expect(unauth.status).toBe(401);

		// Học viên không ghi danh lớp → 404
		const outsider = await app.request(
			"/api/student/classes/cls-active/sessions/2026-11-25/zoom-join",
			{
				headers: {
					"x-test-user": "student-outsider",
					"x-student-org-id": "org-1",
				},
			},
		);
		expect(outsider.status).toBe(404);
		expect(await outsider.text()).not.toContain(ZOOM_URL_LESSON);

		// Enrollment trạng thái invited → 404
		const invited = await app.request(
			"/api/student/classes/cls-invited/sessions/2026-11-25/zoom-join",
			{ headers: studentHeaders },
		);
		expect(invited.status).toBe(404);
		expect(await invited.text()).not.toContain(ZOOM_URL_LESSON);

		// Gọi lớp org-2 khi chọn org-1 → 404
		const wrongOrgClass = await app.request(
			"/api/student/classes/cls-org2/sessions/2026-11-25/zoom-join",
			{ headers: studentHeaders },
		);
		expect(wrongOrgClass.status).toBe(404);
		expect(await wrongOrgClass.text()).not.toContain(ZOOM_URL_LESSON);

		// Truyền x-student-org-id không thuộc học viên → 403 STUDENT_ORG_MISMATCH
		const mismatchOrg = await app.request(
			"/api/student/classes/cls-active/sessions/2026-11-25/zoom-join",
			{
				headers: {
					"x-test-user": "student-1",
					"x-student-org-id": "org-nonexistent",
				},
			},
		);
		expect(mismatchOrg.status).toBe(403);
		expect(
			studentZoomJoinErrorSchema.parse(await mismatchOrg.json()).code,
		).toBe(STUDENT_ERROR_CODES.ORG_MISMATCH);

		// Phiên giáo viên gọi endpoint học viên → 403 TEACHER_ON_STUDENT_PORTAL
		const teacherRes = await app.request(
			"/api/student/classes/cls-active/sessions/2026-11-25/zoom-join",
			{ headers: { "x-test-user": "teacher-1" } },
		);
		expect(teacherRes.status).toBe(403);
		const teacherBody = (await teacherRes.json()) as { code: string };
		expect(teacherBody.code).toBe(
			ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL,
		);
	});

	test("tham số date không hợp lệ → 400 ZOOM_JOIN_INVALID_SCHEDULE", async () => {
		const app = createApp();

		for (const badDate of ["2026-02-30", "2026-13-01", "not-a-date"]) {
			const res = await app.request(
				`/api/student/classes/cls-active/sessions/${badDate}/zoom-join`,
				{ headers: studentHeaders },
			);
			expect(res.status).toBe(400);
			expect(res.headers.get("cache-control")).toBe("no-store");
			const body = studentZoomJoinErrorSchema.parse(await res.json());
			expect(body.code).toBe(ZOOM_JOIN_ERROR_CODES.INVALID_SCHEDULE);
		}
	});

	test("lịch buổi học hỏng (time sai format) → 409 ZOOM_JOIN_INVALID_SCHEDULE", async () => {
		await db.insert(schema.lesson).values({
			id: "les-malformed-time",
			orgId: "org-1",
			classId: "cls-active",
			enrollmentId: "enr-active",
			day: 4,
			time: "7pm",
			dur: 90,
			date: "2026-12-03",
			status: "upcoming",
			topic: "Malformed",
			zoom: ZOOM_URL_LESSON,
		});
		currentNow = new Date("2026-12-03T19:00:00+07:00");
		const app = createApp();

		const res = await app.request(
			"/api/student/classes/cls-active/sessions/2026-12-03/zoom-join",
			{ headers: studentHeaders },
		);
		expect(res.status).toBe(409);
		expect(res.headers.get("cache-control")).toBe("no-store");
		const text = await res.text();
		expect(text).not.toContain(ZOOM_URL_LESSON);
		expect(studentZoomJoinErrorSchema.parse(JSON.parse(text)).code).toBe(
			ZOOM_JOIN_ERROR_CODES.INVALID_SCHEDULE,
		);
	});

	test("nhiều buổi active trong cùng một ngày: ưu tiên buổi đang open", async () => {
		await db.insert(schema.lesson).values([
			{
				id: "les-multi-morning",
				orgId: "org-1",
				classId: "cls-active",
				enrollmentId: "enr-active",
				day: 5,
				time: "08:00",
				dur: 60,
				date: "2026-12-04",
				status: "upcoming",
				topic: "Morning",
				zoom: ZOOM_URL_LESSON,
			},
			{
				id: "les-multi-evening",
				orgId: "org-1",
				classId: "cls-active",
				enrollmentId: "enr-active",
				day: 5,
				time: "19:00",
				dur: 90,
				date: "2026-12-04",
				status: "upcoming",
				topic: "Evening",
				zoom: ZOOM_URL_SECOND,
			},
		]);

		// Đang trong khung giờ buổi tối (buổi sáng đã kết thúc)
		currentNow = new Date("2026-12-04T18:45:00+07:00");
		const app = createApp();

		const res = await app.request(
			"/api/student/classes/cls-active/sessions/2026-12-04/zoom-join",
			{ headers: studentHeaders },
		);
		expect(res.status).toBe(200);
		const body = studentZoomJoinResponseSchema.parse(await res.json());
		expect(body.joinUrl).toBe(ZOOM_URL_SECOND);
	});

	test("nhiều buổi active trong cùng một ngày: buổi sáng đã kết thúc, gọi giữa ngày trả TOO_EARLY cho buổi tối sắp tới", async () => {
		await db.insert(schema.lesson).values([
			{
				id: "les-midday-morning",
				orgId: "org-1",
				classId: "cls-active",
				enrollmentId: "enr-active",
				day: 6,
				time: "08:00",
				dur: 60,
				date: "2026-12-05",
				status: "upcoming",
				topic: "Morning no zoom",
				zoom: "",
			},
			{
				id: "les-midday-evening",
				orgId: "org-1",
				classId: "cls-active",
				enrollmentId: "enr-active",
				day: 6,
				time: "19:00",
				dur: 90,
				date: "2026-12-05",
				status: "upcoming",
				topic: "Evening with zoom",
				zoom: ZOOM_URL_SECOND,
			},
		]);

		// 14:00 VN: buổi 08:00 đã kết thúc, buổi 19:00 chưa đến giờ mở 18:30
		currentNow = new Date("2026-12-05T14:00:00+07:00");
		const app = createApp();

		const res = await app.request(
			"/api/student/classes/cls-active/sessions/2026-12-05/zoom-join",
			{ headers: studentHeaders },
		);
		expect(res.status).toBe(403);
		expect(res.headers.get("cache-control")).toBe("no-store");
		const text = await res.text();
		expect(text).not.toContain(ZOOM_URL_SECOND);
		const body = studentZoomJoinErrorSchema.parse(JSON.parse(text));
		expect(body.code).toBe(ZOOM_JOIN_ERROR_CODES.TOO_EARLY);
		expect(body.time).toBe("19:00");
		expect(body.error).toContain("18:30");
		expect(body.error).toContain("20:30");
	});
});
