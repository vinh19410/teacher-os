import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { ZOOM_ERROR_CODES } from "@teacher-os/api/contracts";
import { addDaysISO, vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import * as schema from "@teacher-os/db/schema/index";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";
import { createFakeZoom } from "../lib/zoom/fake-zoom-client";
import {
	ensureSessionMeeting,
	runRecordingSyncCron,
} from "../lib/zoom/session-zoom-service";
import { type ZoomClient, ZoomIntegrationError } from "../lib/zoom/zoom-client";

const CORS_ORIGIN = "http://localhost:8001";
const STUDENT_ORIGIN = "http://localhost:8003";
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);

const TEACHER_HEADERS = {
	"x-test-user": "teacher-1",
	origin: CORS_ORIGIN,
	"content-type": "application/json",
};

const STUDENT_HEADERS = {
	"x-test-user": "student-1",
	origin: STUDENT_ORIGIN,
	"content-type": "application/json",
};

const ZOOM_JOIN_PREFIX = "https://zoom.us/j/";

let db: Db;

beforeEach(async () => {
	const client = createClient({ url: "file::memory:" });
	const raw = drizzle(client, { schema });
	await migrate(raw, { migrationsFolder: MIGRATIONS_DIR });
	db = raw as unknown as Db;

	await db
		.insert(schema.organization)
		.values({ id: "org-1", name: "Academy 1" });
	await db.insert(schema.user).values([
		{
			id: "t-1",
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
	]);
	await db.insert(schema.membership).values({
		id: "mem-1",
		orgId: "org-1",
		userId: "t-1",
		role: "teacher",
	});
	await db.insert(schema.student).values({
		id: "s-1",
		orgId: "org-1",
		name: "Minh Anh",
		email: "minhanh@example.com",
	});
});

function createApp(zoomClient?: ZoomClient) {
	return buildApp({
		getDb: () => db,
		corsOrigin: [CORS_ORIGIN, STUDENT_ORIGIN],
		getSessionUser: async (headers) => {
			const k = headers.get("x-test-user");
			if (k === "teacher-1") {
				return {
					userId: "t-1",
					userName: "Cô Lan",
					email: "teacher@workspace.edu.vn",
					emailVerified: true,
					role: "teacher",
				};
			}
			if (k === "student-1") {
				return {
					userId: "u-s1",
					userName: "Minh Anh",
					email: "minhanh@example.com",
					emailVerified: true,
					role: "student",
				};
			}
			return null;
		},
		authHandler: async () => new Response(null, { status: 404 }),
		...(zoomClient ? { getZoomClient: () => zoomClient } : {}),
	});
}

function futureDate(days: number): string {
	return addDaysISO(vietnamTodayISO(), days);
}

function nextWeekdayISO(fromISO: string, utcDay: number): string {
	let d = addDaysISO(fromISO, 1);
	while (new Date(`${d}T00:00:00Z`).getUTCDay() !== utcDay) {
		d = addDaysISO(d, 1);
	}
	return d;
}

async function createManualOnlineClass(app: ServerApp, name: string) {
	const res = await app.request("/api/classes", {
		method: "POST",
		headers: TEACHER_HEADERS,
		body: JSON.stringify({
			name,
			skills: ["Speaking"],
			mode: "Online",
			schedulingMode: "manual",
			schedule: { days: [0], start: "19:00", end: "20:30" },
			startDate: futureDate(1),
		}),
	});
	expect(res.status).toBe(201);
	return ((await res.json()) as { id: string }).id;
}

async function addManualSession(
	app: ServerApp,
	classId: string,
	date: string,
	zoom: string,
	time = "19:00",
	dur = 90,
) {
	const res = await app.request(`/api/classes/${classId}/sessions`, {
		method: "POST",
		headers: TEACHER_HEADERS,
		body: JSON.stringify({
			date,
			time,
			dur,
			topic: "Part 2 Cue Cards",
			zoom,
		}),
	});
	expect(res.status).toBe(201);
}

async function meetingRow(classId: string, date: string) {
	const [row] = await db
		.select()
		.from(schema.classSessionMeeting)
		.where(
			and(
				eq(schema.classSessionMeeting.classId, classId),
				eq(schema.classSessionMeeting.date, date),
			),
		);
	return row;
}

describe("Zoom chưa cấu hình", () => {
	test("route tạo trả 503 ZOOM_NOT_CONFIGURED và cron bỏ qua êm", async () => {
		const app = createApp();
		const classId = await createManualOnlineClass(app, "No Zoom");
		const date = futureDate(5);
		await addManualSession(app, classId, date, "");

		const res = await app.request(
			`/api/classes/${classId}/sessions/${date}/zoom`,
			{ method: "POST", headers: TEACHER_HEADERS, body: "{}" },
		);
		expect(res.status).toBe(503);
		expect(await res.json()).toMatchObject({ code: "ZOOM_NOT_CONFIGURED" });
		expect(await meetingRow(classId, date)).toBeUndefined();

		await expect(runRecordingSyncCron({ db })).resolves.toEqual({
			checked: 0,
			updated: 0,
			failed: 0,
		});
	});
});

describe("Tạo Zoom meeting", () => {
	test("lớp manual: tạo đơn lẻ trả joinUrl, mirror vào class_session.zoom và không tạo lại lần hai", async () => {
		const fake = createFakeZoom();
		const app = createApp(fake.client);
		const classId = await createManualOnlineClass(app, "Manual Zoom");
		const date = futureDate(5);
		await addManualSession(app, classId, date, "https://example.com/manual");

		const path = `/api/classes/${classId}/sessions/${date}/zoom`;
		const first = await app.request(path, {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: "{}",
		});
		expect(first.status).toBe(200);
		const firstBody = (await first.json()) as {
			joinUrl: string;
			zoomMeetingId: string;
		};
		expect(firstBody.joinUrl.startsWith(ZOOM_JOIN_PREFIX)).toBe(true);

		const [cs] = await db
			.select({ zoom: schema.classSession.zoom })
			.from(schema.classSession)
			.where(eq(schema.classSession.classId, classId));
		expect(cs?.zoom).toBe(firstBody.joinUrl);

		const second = await app.request(path, {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: "{}",
		});
		expect(second.status).toBe(200);
		expect(await second.json()).toMatchObject({ joinUrl: firstBody.joinUrl });
		expect(fake.calls.filter((c) => c.method === "create")).toHaveLength(1);
	});

	test("lớp auto: tự tạo khi tạo lớp và mirror vào lesson.zoom sau khi ghi danh", async () => {
		const fake = createFakeZoom();
		const app = createApp(fake.client);
		const res = await app.request("/api/classes", {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: JSON.stringify({
				name: "Auto Online Zoom",
				skills: ["Speaking"],
				mode: "Online",
				schedulingMode: "auto",
				schedule: { days: [0, 2], start: "10:00", end: "11:30" },
				startDate: futureDate(1),
				sessionsTotal: 3,
			}),
		});
		expect(res.status).toBe(201);
		const { id: classId } = (await res.json()) as { id: string };
		expect(fake.calls.filter((c) => c.method === "create")).toHaveLength(3);

		const enr = await app.request(`/api/classes/${classId}/enroll`, {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: JSON.stringify({ studentId: "s-1", activateNow: true }),
		});
		expect(enr.status).toBe(201);

		const lessons = await db
			.select()
			.from(schema.lesson)
			.where(eq(schema.lesson.classId, classId));
		expect(lessons).toHaveLength(3);
		expect(lessons.every((l) => l.zoom.startsWith(ZOOM_JOIN_PREFIX))).toBe(
			true,
		);
	});

	test("bulk tạo tối đa 12 buổi mỗi lần và bỏ qua buổi đã có", async () => {
		const fake = createFakeZoom();
		const app = createApp(fake.client);
		const res = await app.request("/api/classes", {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: JSON.stringify({
				name: "Bulk Zoom",
				skills: ["Speaking"],
				mode: "Online",
				schedulingMode: "auto",
				schedule: { days: [0, 2], start: "10:00", end: "11:30" },
				startDate: futureDate(1),
				sessionsTotal: 20,
			}),
		});
		expect(res.status).toBe(201);
		const { id: classId } = (await res.json()) as { id: string };
		// Tự cấp tối đa 5 buổi đầu khi tạo lớp.
		expect(fake.calls.filter((c) => c.method === "create")).toHaveLength(5);

		const bulk = await app.request(`/api/classes/${classId}/zoom/bulk`, {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: "{}",
		});
		expect(bulk.status).toBe(200);
		expect(await bulk.json()).toMatchObject({
			created: 12,
			skipped: 8,
			failed: 0,
		});
		expect(fake.calls.filter((c) => c.method === "create")).toHaveLength(17);
	});

	test("auto-provision và bulk dừng ngay khi Zoom báo hết quota ngày", async () => {
		const fake = createFakeZoom();
		let attempts = 0;
		const quotaClient: ZoomClient = {
			...fake.client,
			async createMeeting() {
				attempts += 1;
				throw new ZoomIntegrationError(
					ZOOM_ERROR_CODES.RATE_LIMITED,
					"Zoom đã chạm giới hạn trong ngày",
					429,
				);
			},
		};
		const app = createApp(quotaClient);
		const res = await app.request("/api/classes", {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: JSON.stringify({
				name: "Quota Zoom",
				skills: ["Speaking"],
				mode: "Online",
				schedulingMode: "auto",
				schedule: { days: [0, 2], start: "10:00", end: "11:30" },
				startDate: futureDate(1),
				sessionsTotal: 20,
			}),
		});
		expect(res.status).toBe(201);
		const { id: classId } = (await res.json()) as { id: string };
		expect(attempts).toBe(1);

		const bulk = await app.request(`/api/classes/${classId}/zoom/bulk`, {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: "{}",
		});
		expect(bulk.status).toBe(200);
		expect(await bulk.json()).toMatchObject({
			created: 0,
			skipped: 19,
			failed: 1,
		});
		expect(attempts).toBe(2);
	});

	test("hai lệnh tạo đồng thời chỉ giữ một meeting và xoá meeting thừa", async () => {
		const fake = createFakeZoom();
		const app = createApp(fake.client);
		const classId = await createManualOnlineClass(app, "Race Class");
		const date = futureDate(5);
		await addManualSession(app, classId, date, "https://example.com/manual");

		let releaseBarrier: (() => void) | null = null;
		let arrived = 0;
		const barrier = new Promise<void>((resolve) => {
			releaseBarrier = resolve;
		});
		const raceClient: ZoomClient = {
			...fake.client,
			async createMeeting(input) {
				arrived += 1;
				if (arrived === 2) {
					releaseBarrier?.();
				} else {
					await barrier;
				}
				return fake.client.createMeeting(input);
			},
		};

		const input = { orgId: "org-1", classId, dateISO: date };
		const [r1, r2] = await Promise.all([
			ensureSessionMeeting({ db, getZoomClient: () => raceClient }, input),
			ensureSessionMeeting({ db, getZoomClient: () => raceClient }, input),
		]);

		expect(r1.joinUrl).toBe(r2.joinUrl);
		expect(fake.calls.filter((c) => c.method === "create")).toHaveLength(2);
		expect(fake.calls.filter((c) => c.method === "delete")).toHaveLength(1);
	});
});

describe("Đồng bộ Zoom khi sửa, dời và huỷ buổi", () => {
	test("dời buổi (đổi ngày) cập nhật Zoom meeting và chuyển dòng meeting sang ngày mới", async () => {
		const fake = createFakeZoom();
		const app = createApp(fake.client);
		const classId = await createManualOnlineClass(app, "Edit Zoom");
		const oldDate = futureDate(5);
		const newDate = futureDate(6);
		await addManualSession(app, classId, oldDate, "");
		const before = await meetingRow(classId, oldDate);
		expect(before?.zoomMeetingId).toBeTruthy();

		const edit = await app.request(
			`/api/classes/${classId}/sessions/${oldDate}/edit`,
			{
				method: "POST",
				headers: TEACHER_HEADERS,
				body: JSON.stringify({
					moveDate: newDate,
					time: "20:00",
					dur: 90,
					topic: "Part 2 Updated",
				}),
			},
		);
		expect(edit.status).toBe(200);
		expect(fake.calls).toContainEqual({
			method: "update",
			meetingId: before?.zoomMeetingId,
		});
		expect(await meetingRow(classId, oldDate)).toBeUndefined();
		expect((await meetingRow(classId, newDate))?.zoomMeetingId).toBe(
			before?.zoomMeetingId,
		);
	});

	test("dời buổi do nghỉ lễ cập nhật Zoom meeting sang ngày bù", async () => {
		const fake = createFakeZoom();
		const app = createApp(fake.client);
		const first = nextWeekdayISO(vietnamTodayISO(), 5);
		const holidayDate = addDaysISO(first, 14);
		const makeupDate = addDaysISO(first, 21);

		const res = await app.request("/api/classes", {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: JSON.stringify({
				name: "Holiday Zoom",
				skills: ["Speaking"],
				mode: "Online",
				schedulingMode: "auto",
				schedule: { days: [4], start: "19:00", end: "20:30" },
				startDate: first,
				sessionsTotal: 3,
			}),
		});
		expect(res.status).toBe(201);
		const { id: classId } = (await res.json()) as { id: string };
		const enr = await app.request(`/api/classes/${classId}/enroll`, {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: JSON.stringify({ studentId: "s-1", activateNow: true }),
		});
		expect(enr.status).toBe(201);
		const before = await meetingRow(classId, holidayDate);
		expect(before?.zoomMeetingId).toBeTruthy();

		const draft = {
			name: "Nghỉ lễ giữa khóa",
			fromDate: holidayDate,
			toDate: holidayDate,
			scope: "org",
			mode: "shift",
			notify: false,
		};
		const preview = await app.request("/api/holidays/preview", {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: JSON.stringify(draft),
		});
		expect(preview.status).toBe(200);
		const { planHash } = (await preview.json()) as { planHash: string };
		const apply = await app.request("/api/holidays", {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: JSON.stringify({ ...draft, planHash }),
		});
		expect(apply.status).toBe(200);

		expect(fake.calls).toContainEqual({
			method: "update",
			meetingId: before?.zoomMeetingId,
		});
		expect(await meetingRow(classId, holidayDate)).toBeUndefined();
		expect((await meetingRow(classId, makeupDate))?.zoomMeetingId).toBe(
			before?.zoomMeetingId,
		);
	});

	test("giáo viên dán link khác xoá meeting hệ thống, bỏ zoomMeetingId và không gọi update", async () => {
		const fake = createFakeZoom();
		const app = createApp(fake.client);
		const classId = await createManualOnlineClass(app, "Manual Link");
		const date = futureDate(5);
		await addManualSession(app, classId, date, "");
		const before = await meetingRow(classId, date);
		expect(before?.zoomMeetingId).toBeTruthy();

		const edit = await app.request(
			`/api/classes/${classId}/sessions/${date}/edit`,
			{
				method: "POST",
				headers: TEACHER_HEADERS,
				body: JSON.stringify({ zoom: "https://example.com/personal-room" }),
			},
		);
		expect(edit.status).toBe(200);
		expect(fake.calls).toContainEqual({
			method: "delete",
			meetingId: before?.zoomMeetingId,
		});
		expect(fake.calls.filter((c) => c.method === "update")).toHaveLength(0);
		const after = await meetingRow(classId, date);
		expect(after?.zoomMeetingId).toBeNull();
		expect(after?.joinUrl).toBe("https://example.com/personal-room");
		expect(after?.recordingStatus).toBe("none");
	});

	test("xoá trống link xoá meeting hệ thống và cho phép tạo lại meeting mới", async () => {
		const fake = createFakeZoom();
		const app = createApp(fake.client);
		const classId = await createManualOnlineClass(app, "Clear Link");
		const date = futureDate(5);
		await addManualSession(app, classId, date, "");
		const before = await meetingRow(classId, date);

		const edit = await app.request(
			`/api/classes/${classId}/sessions/${date}/edit`,
			{
				method: "POST",
				headers: TEACHER_HEADERS,
				body: JSON.stringify({ zoom: "" }),
			},
		);
		expect(edit.status).toBe(200);
		expect(fake.calls).toContainEqual({
			method: "delete",
			meetingId: before?.zoomMeetingId,
		});
		const cleared = await meetingRow(classId, date);
		expect(cleared?.joinUrl).toBe("");
		expect(cleared?.zoomMeetingId).toBeNull();
	});

	test("lỗi Zoom khi xoá meeting không làm hỏng yêu cầu sửa link", async () => {
		const fake = createFakeZoom();
		const failingDelete: ZoomClient = {
			...fake.client,
			async deleteMeeting() {
				throw new ZoomIntegrationError(
					ZOOM_ERROR_CODES.API_ERROR,
					"Zoom down",
					502,
				);
			},
		};
		const app = createApp(failingDelete);
		const classId = await createManualOnlineClass(app, "Delete Fails");
		const date = futureDate(5);
		await addManualSession(app, classId, date, "");

		const edit = await app.request(
			`/api/classes/${classId}/sessions/${date}/edit`,
			{
				method: "POST",
				headers: TEACHER_HEADERS,
				body: JSON.stringify({ zoom: "https://example.com/room" }),
			},
		);
		expect(edit.status).toBe(200);
		const after = await meetingRow(classId, date);
		expect(after?.zoomMeetingId).toBeNull();
		expect(after?.joinUrl).toBe("https://example.com/room");
	});

	test("dời buổi sang ngày đã có meeting xoá meeting đích trên Zoom", async () => {
		const fake = createFakeZoom();
		const app = createApp(fake.client);
		const classId = await createManualOnlineClass(app, "Move Onto Meeting");
		const oldDate = futureDate(5);
		const newDate = futureDate(6);
		await addManualSession(app, classId, oldDate, "");
		// Dòng meeting còn sót ở ngày đích (không còn class_session tương ứng).
		await db.insert(schema.classSessionMeeting).values({
			id: "m-leftover",
			orgId: "org-1",
			classId,
			date: newDate,
			joinUrl: `${ZOOM_JOIN_PREFIX}777`,
			zoomMeetingId: "777",
			recordingUrl: "",
			recordingStatus: "pending",
		});
		const source = await meetingRow(classId, oldDate);
		const target = await meetingRow(classId, newDate);

		const edit = await app.request(
			`/api/classes/${classId}/sessions/${oldDate}/edit`,
			{
				method: "POST",
				headers: TEACHER_HEADERS,
				body: JSON.stringify({ moveDate: newDate }),
			},
		);
		expect(edit.status).toBe(200);
		expect(fake.calls).toContainEqual({
			method: "delete",
			meetingId: target?.zoomMeetingId,
		});
		expect((await meetingRow(classId, newDate))?.zoomMeetingId).toBe(
			source?.zoomMeetingId,
		);
	});

	test("huỷ buổi xoá Zoom meeting và xoá link khỏi dòng meeting và class_session", async () => {
		const fake = createFakeZoom();
		const app = createApp(fake.client);
		const classId = await createManualOnlineClass(app, "Cancel Zoom");
		const date = futureDate(5);
		await addManualSession(app, classId, date, "");
		const enr = await app.request(`/api/classes/${classId}/enroll`, {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: JSON.stringify({ studentId: "s-1", activateNow: true }),
		});
		expect(enr.status).toBe(201);
		const before = await meetingRow(classId, date);
		expect(before?.joinUrl.startsWith(ZOOM_JOIN_PREFIX)).toBe(true);

		const cancel = await app.request(
			`/api/classes/${classId}/sessions/${date}/cancel`,
			{ method: "POST", headers: TEACHER_HEADERS, body: "{}" },
		);
		expect(cancel.status).toBe(200);
		expect(fake.calls).toContainEqual({
			method: "delete",
			meetingId: before?.zoomMeetingId,
		});

		const after = await meetingRow(classId, date);
		expect(after?.joinUrl).toBe("");
		expect(after?.zoomMeetingId).toBeNull();
		const sessions = await db
			.select({ zoom: schema.classSession.zoom })
			.from(schema.classSession)
			.where(eq(schema.classSession.classId, classId));
		expect(sessions.length).toBeGreaterThan(0);
		expect(sessions.every((s) => s.zoom === "")).toBe(true);
	});
});

describe("Recording và cron", () => {
	test("đồng bộ tay: pending khi chưa sẵn sàng, ready kèm share URL và mật khẩu", async () => {
		const fake = createFakeZoom();
		const app = createApp(fake.client);
		const classId = await createManualOnlineClass(app, "Recording Zoom");
		const date = futureDate(5);
		await addManualSession(app, classId, date, "");
		const meeting = await meetingRow(classId, date);

		const syncPath = `/api/classes/${classId}/sessions/${date}/recording/sync`;
		fake.setRecordingReady(false);
		const pending = await app.request(syncPath, {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: "{}",
		});
		expect(pending.status).toBe(200);
		expect(await pending.json()).toMatchObject({ status: "pending" });

		fake.setRecordingReady(true);
		const ready = await app.request(syncPath, {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: "{}",
		});
		expect(ready.status).toBe(200);
		expect(await ready.json()).toMatchObject({
			status: "ready",
			recordingUrl: `https://zoom.us/rec/share/fake-${meeting?.zoomMeetingId}`,
			recordingPassword: "rec123",
		});
		const row = await meetingRow(classId, date);
		expect(row?.recordingStatus).toBe("ready");
		expect(row?.recordingPassword).toBe("rec123");
	});

	test("cron chỉ quét buổi trong cửa sổ ngày và gán recording khi sẵn sàng", async () => {
		const fake = createFakeZoom();
		fake.setRecordingReady(true);
		const app = createApp(fake.client);
		const classId = await createManualOnlineClass(app, "Window Class");

		for (const date of [
			"2026-11-08",
			"2026-11-17",
			"2026-11-18",
			"2026-11-28",
		]) {
			await addManualSession(
				app,
				classId,
				date,
				`https://example.com/${date}`,
				"10:00",
				60,
			);
			await db.insert(schema.classSessionMeeting).values({
				id: `m-${date}`,
				orgId: "org-1",
				classId,
				date,
				joinUrl: `${ZOOM_JOIN_PREFIX}${date.replaceAll("-", "")}`,
				zoomMeetingId: date.replaceAll("-", ""),
				recordingUrl: "",
				recordingStatus: "pending",
			});
		}

		const res = await runRecordingSyncCron({
			db,
			getZoomClient: () => fake.client,
			now: () => new Date("2026-11-18T05:00:00Z"),
		});
		expect(res).toEqual({ checked: 2, updated: 2, failed: 0 });
	});

	test("cron chuyển failed kèm recordingError khi quá 72 giờ vẫn chưa có recording", async () => {
		const fake = createFakeZoom();
		const app = createApp(fake.client);
		const classId = await createManualOnlineClass(app, "Timeout Class");
		const date = "2026-11-17";
		await addManualSession(app, classId, date, `https://example.com/${date}`);
		await db.insert(schema.classSessionMeeting).values({
			id: "m-timeout",
			orgId: "org-1",
			classId,
			date,
			joinUrl: `${ZOOM_JOIN_PREFIX}111`,
			zoomMeetingId: "111",
			recordingUrl: "",
			recordingStatus: "pending",
		});

		// Buổi 19:00-20:30 ngày 17/11 kết thúc 13:30Z; mốc này đã qua 72 giờ.
		const res = await runRecordingSyncCron({
			db,
			getZoomClient: () => fake.client,
			now: () => new Date("2026-11-21T05:00:00Z"),
		});
		expect(res).toEqual({ checked: 1, updated: 0, failed: 1 });
		const row = await meetingRow(classId, date);
		expect(row?.recordingStatus).toBe("failed");
		expect(row?.recordingError).toContain("72 giờ");
		expect(fake.calls.filter((c) => c.method === "recording")).toHaveLength(0);
	});
});

describe("Cron không bị dòng failed hết hạn chiếm chỗ", () => {
	test("bỏ qua dòng failed quá cửa sổ 72 giờ và thử lại dòng failed đã qua 1 giờ", async () => {
		const fake = createFakeZoom();
		fake.setRecordingReady(true);
		const app = createApp(fake.client);
		const classId = await createManualOnlineClass(app, "Failed Window");
		const rows = [
			{
				date: "2026-11-14",
				status: "failed",
				syncedAt: "2026-11-14T20:00:00Z",
			},
			{
				date: "2026-11-16",
				status: "failed",
				syncedAt: "2026-11-17T01:00:00Z",
			},
			{
				date: "2026-11-17",
				status: "failed",
				syncedAt: "2026-11-18T04:30:00Z",
			},
			{ date: "2026-11-18", status: "pending", syncedAt: null },
		] as const;
		for (const r of rows) {
			await addManualSession(
				app,
				classId,
				r.date,
				`https://example.com/${r.date}`,
				"10:00",
				60,
			);
			await db.insert(schema.classSessionMeeting).values({
				id: `m-${r.date}`,
				orgId: "org-1",
				classId,
				date: r.date,
				joinUrl: `${ZOOM_JOIN_PREFIX}${r.date.replaceAll("-", "")}`,
				zoomMeetingId: r.date.replaceAll("-", ""),
				recordingUrl: "",
				recordingStatus: r.status,
				recordingSyncedAt: r.syncedAt ? new Date(r.syncedAt) : null,
			});
		}

		const res = await runRecordingSyncCron({
			db,
			getZoomClient: () => fake.client,
			now: () => new Date("2026-11-18T05:00:00Z"),
		});
		const polled = fake.calls
			.filter((c) => c.method === "recording")
			.map((c) => c.meetingId)
			.sort();
		// 14/11 quá cửa sổ, 17/11 mới thử cách đây 30 phút: chỉ 16/11 và 18/11.
		expect(polled).toEqual(["20261116", "20261118"]);
		expect(res).toEqual({ checked: 2, updated: 2, failed: 0 });
	});
});

describe("Học viên thấy link Zoom và recording", () => {
	test("joinUrl, recordingUrl và recordingPassword xuất hiện trong chi tiết lớp và lịch học", async () => {
		const fake = createFakeZoom();
		fake.setRecordingReady(true);
		const app = createApp(fake.client);
		const classId = await createManualOnlineClass(app, "Student View");
		const date = futureDate(5);
		await addManualSession(app, classId, date, "");
		const enr = await app.request(`/api/classes/${classId}/enroll`, {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: JSON.stringify({ studentId: "s-1", activateNow: true }),
		});
		expect(enr.status).toBe(201);
		const meeting = await meetingRow(classId, date);

		const sync = await app.request(
			`/api/classes/${classId}/sessions/${date}/recording/sync`,
			{ method: "POST", headers: TEACHER_HEADERS, body: "{}" },
		);
		expect(sync.status).toBe(200);

		const detail = (await (
			await app.request(`/api/student/classes/${classId}`, {
				headers: STUDENT_HEADERS,
			})
		).json()) as {
			class: { nextSession: { joinUrl?: string } | null };
			lessons: Array<{
				joinUrl?: string;
				recordingUrl?: string;
				recordingPassword?: string;
			}>;
		};
		expect(detail.class.nextSession?.joinUrl).toBe(meeting?.joinUrl);
		expect(detail.lessons[0]).toMatchObject({
			joinUrl: meeting?.joinUrl,
			recordingUrl: `https://zoom.us/rec/share/fake-${meeting?.zoomMeetingId}`,
			recordingPassword: "rec123",
		});

		const schedule = (await (
			await app.request("/api/student/schedule", { headers: STUDENT_HEADERS })
		).json()) as {
			lessons: Array<{ joinUrl?: string; recordingPassword?: string }>;
		};
		expect(schedule.lessons[0]).toMatchObject({
			joinUrl: meeting?.joinUrl,
			recordingPassword: "rec123",
		});
	});
});

describe("Bảo vệ route Zoom", () => {
	test("blocks CSRF origin and non-JSON writes on zoomMeetingRoutes and rejects bare https://", async () => {
		const { client } = createFakeZoom();
		const app = createApp(client);

		const clsRes = await app.request("/api/classes", {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: JSON.stringify({
				name: "CSRF Class",
				skills: ["Speaking"],
				mode: "Online",
				schedulingMode: "manual",
				schedule: { days: [0], start: "19:00", end: "20:30" },
				startDate: "2026-11-20",
			}),
		});
		expect(clsRes.status).toBe(201);
		const { id: classId } = (await clsRes.json()) as { id: string };

		const evilOrigin = "https://evil.example";
		const csrfRoutes: Array<{ method: string; path: string; body?: string }> = [
			{
				method: "POST",
				path: `/api/classes/${classId}/sessions/2026-11-22/zoom`,
				body: "{}",
			},
			{
				method: "POST",
				path: `/api/classes/${classId}/zoom/bulk`,
				body: "{}",
			},
			{
				method: "POST",
				path: `/api/classes/${classId}/sessions/2026-11-22/recording/sync`,
				body: "{}",
			},
			{
				method: "PUT",
				path: `/api/classes/${classId}/sessions/2026-11-22/recording`,
				body: JSON.stringify({
					recordingUrl: "https://zoom.us/rec/share/x",
				}),
			},
		];

		for (const r of csrfRoutes) {
			const resBadOrigin = await app.request(r.path, {
				method: r.method,
				headers: {
					"x-test-user": "teacher-1",
					origin: evilOrigin,
					"content-type": "application/json",
				},
				body: r.body,
			});
			expect(resBadOrigin.status).toBe(403);

			const resBadCt = await app.request(r.path, {
				method: r.method,
				headers: {
					"x-test-user": "teacher-1",
					origin: CORS_ORIGIN,
					"content-type": "text/plain",
				},
				body: r.body,
			});
			expect(resBadCt.status).toBe(415);
		}

		const bareHttps = await app.request(
			`/api/classes/${classId}/sessions/2026-11-22/recording`,
			{
				method: "PUT",
				headers: TEACHER_HEADERS,
				body: JSON.stringify({ recordingUrl: "https://" }),
			},
		);
		expect(bareHttps.status).toBe(400);
	});

	test("does not leak nextSession.joinUrl to invited students or individually cancelled group lessons", async () => {
		const { client } = createFakeZoom();
		const app = createApp(client);

		await db.insert(schema.user).values({
			id: "u-s2",
			name: "Bảo Châu",
			email: "baochau@example.com",
			emailVerified: true,
			role: "student",
		});
		await db.insert(schema.student).values({
			id: "s-2",
			orgId: "org-1",
			name: "Bảo Châu",
			email: "baochau@example.com",
		});

		const clsRes = await app.request("/api/classes", {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: JSON.stringify({
				name: "Group Online",
				skills: ["Speaking"],
				mode: "Online",
				schedulingMode: "manual",
				schedule: { days: [0], start: "19:00", end: "20:30" },
				startDate: "2026-11-20",
			}),
		});
		expect(clsRes.status).toBe(201);
		const { id: classId } = (await clsRes.json()) as { id: string };

		const addSessRes = await app.request(`/api/classes/${classId}/sessions`, {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: JSON.stringify({
				date: "2026-11-25",
				time: "19:00",
				dur: 90,
				topic: "Debate",
				zoom: "",
			}),
		});
		expect(addSessRes.status).toBe(201);
		await app.request(`/api/classes/${classId}/sessions/2026-11-25/zoom`, {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: "{}",
		});

		// Student 1: invited (not accepted yet) -> overview must NOT expose nextSession/joinUrl
		const enr1Res = await app.request(`/api/classes/${classId}/enroll`, {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: JSON.stringify({ studentId: "s-1", activateNow: false }),
		});
		expect(enr1Res.status).toBe(201);

		// Student 2: active
		const enr2Res = await app.request(`/api/classes/${classId}/enroll`, {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: JSON.stringify({ studentId: "s-2", activateNow: true }),
		});
		expect(enr2Res.status).toBe(201);

		const s1OverviewBefore = (await (
			await app.request("/api/student/overview", { headers: STUDENT_HEADERS })
		).json()) as {
			classes: Array<{
				id: string;
				enrollmentStatus: string;
				nextSession: { joinUrl?: string } | null;
			}>;
		};
		const s1ClsInvited = s1OverviewBefore.classes.find((c) => c.id === classId);
		expect(s1ClsInvited?.enrollmentStatus).toBe("invited");
		expect(s1ClsInvited?.nextSession).toBeNull();

		// Activate Student 1's enrollment, then cancel ONLY Student 1's lesson on 2026-11-25 while Student 2 remains upcoming
		const enr1Body = (await enr1Res.json()) as { id: string };
		const acceptRes = await app.request(
			`/api/enrollments/${enr1Body.id}/accept`,
			{
				method: "POST",
				headers: TEACHER_HEADERS,
				body: "{}",
			},
		);
		expect(acceptRes.status).toBe(200);

		const [s1Lesson] = await db
			.select({ id: schema.lesson.id })
			.from(schema.lesson)
			.where(
				and(
					eq(schema.lesson.enrollmentId, enr1Body.id),
					eq(schema.lesson.date, "2026-11-25"),
				),
			);
		expect(s1Lesson).toBeTruthy();
		if (!s1Lesson) throw new Error("missing s1Lesson");
		const cancelRes = await app.request(`/api/lessons/${s1Lesson.id}/cancel`, {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: "{}",
		});
		expect(cancelRes.status).toBe(200);

		const s1Detail = (await (
			await app.request(`/api/student/classes/${classId}`, {
				headers: STUDENT_HEADERS,
			})
		).json()) as {
			class: { nextSession: { joinUrl?: string } | null };
		};
		expect(s1Detail.class.nextSession?.joinUrl).toBeUndefined();
	});
});
