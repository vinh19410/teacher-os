import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	RECORDING_ERROR_CODES,
	ZOOM_ERROR_CODES,
} from "@teacher-os/api/contracts";
import { addDaysISO, vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import * as schema from "@teacher-os/db/schema/index";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, test } from "vitest";
import { buildApp, type Db, type RecordingStore, type ServerApp } from "../app";
import { INLINE_MEDIA_CSP } from "../lib/material-file-response";
import { createFakeZoom } from "../lib/zoom/fake-zoom-client";
import {
	ensureSessionMeeting,
	runRecordingExpiryCron,
	runRecordingSyncCron,
	syncRecordingForOccurrence,
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

interface MemoryRecordingStore extends RecordingStore {
	objects: Map<string, { bytes: Uint8Array; contentType: string }>;
	deletedKeys: string[];
	setDeleteError(message: string | null): void;
}

function createMemoryRecordingStore(): MemoryRecordingStore {
	const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
	const deletedKeys: string[] = [];
	let deleteError: string | null = null;

	return {
		objects,
		deletedKeys,
		setDeleteError(message) {
			deleteError = message;
		},
		async putStream(key, body, { contentType }) {
			const buf = new Uint8Array(await new Response(body).arrayBuffer());
			if (buf.byteLength === 0) {
				throw new Error("File recording rỗng (0 byte).");
			}
			objects.set(key, { bytes: buf, contentType });
			return { sizeBytes: buf.byteLength };
		},
		async head(key) {
			const item = objects.get(key);
			if (!item) return null;
			return {
				contentType: item.contentType,
				size: item.bytes.byteLength,
				etag: `"${item.bytes.byteLength}"`,
			};
		},
		async get(key, range) {
			const item = objects.get(key);
			if (!item) return null;
			const clamped =
				range && range.offset >= 0 && range.offset < item.bytes.byteLength
					? {
							offset: range.offset,
							length: Math.min(
								range.length,
								item.bytes.byteLength - range.offset,
							),
						}
					: undefined;
			const slice = clamped
				? item.bytes.subarray(clamped.offset, clamped.offset + clamped.length)
				: item.bytes;
			const body = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(new Uint8Array(slice));
					controller.close();
				},
			});
			return {
				body,
				contentType: item.contentType,
				size: item.bytes.byteLength,
				etag: `"${item.bytes.byteLength}"`,
				...(clamped ? { range: clamped } : {}),
			};
		},
		async delete(key) {
			if (deleteError) {
				throw new Error(deleteError);
			}
			deletedKeys.push(key);
			objects.delete(key);
		},
	};
}

function createApp(
	zoomClient?: ZoomClient,
	opts?: { recordingStore?: RecordingStore; now?: () => Date },
) {
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
			if (k === "teacher-2") {
				return {
					userId: "t-2",
					userName: "Thầy Nam",
					email: "teacher2@workspace.edu.vn",
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
			if (k === "student-2") {
				return {
					userId: "u-s2",
					userName: "Bảo Châu",
					email: "baochau@example.com",
					emailVerified: true,
					role: "student",
				};
			}
			return null;
		},
		authHandler: async () => new Response(null, { status: 404 }),
		...(zoomClient ? { getZoomClient: () => zoomClient } : {}),
		...(opts?.recordingStore
			? { getRecordingStore: () => opts.recordingStore }
			: {}),
		...(opts?.now ? { now: opts.now } : {}),
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
			expired: 0,
			trashed: 0,
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
	test("đồng bộ tay với R2: pending khi chưa sẵn sàng, reup lên R2 và đưa bản gốc Zoom vào Trash khi sẵn sàng", async () => {
		const fake = createFakeZoom();
		const store = createMemoryRecordingStore();
		const app = createApp(fake.client, { recordingStore: store });
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
		expect(await pending.json()).toMatchObject({
			status: "pending",
			hasRecordingVideo: false,
		});

		fake.setRecordingReady(true);
		const ready = await app.request(syncPath, {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: "{}",
		});
		expect(ready.status).toBe(200);
		expect(await ready.json()).toMatchObject({
			status: "ready",
			recordingUrl: "",
			recordingPassword: null,
			recordingSource: "r2",
			hasRecordingVideo: true,
			recordingZoomTrashStatus: "trashed",
		});

		const row = await meetingRow(classId, date);
		expect(row?.recordingStatus).toBe("ready");
		expect(row?.recordingUrl).toBe("");
		expect(row?.recordingPassword).toBeNull();
		expect(row?.recordingStorageKey).toMatch(
			new RegExp(`^org-1/${classId}/${date}/.+\\.mp4$`),
		);
		expect(row?.recordingSizeBytes).toBeGreaterThan(0);
		expect(row?.recordingExpiresAt).toBeInstanceOf(Date);
		expect(row?.recordingZoomTrashStatus).toBe("trashed");
		expect(store.objects.size).toBe(1);
		expect(fake.calls).toContainEqual({
			method: "trash",
			meetingId: meeting?.zoomMeetingId,
		});
	});

	test("buổi ghi nhiều đoạn: lưu đoạn chính lên R2 nhưng không Trash bản gốc, kể cả ở lượt sync và cron sau", async () => {
		const fake = createFakeZoom();
		fake.setRecordingReady(true);
		const getRecording = fake.client.getRecording.bind(fake.client);
		fake.client.getRecording = async (meetingId) => {
			const rec = await getRecording(meetingId);
			return rec.status === "ready"
				? { ...rec, hasMultipleSegments: true }
				: rec;
		};
		const store = createMemoryRecordingStore();
		const app = createApp(fake.client, { recordingStore: store });
		const classId = await createManualOnlineClass(app, "Nhiều đoạn");
		const date = futureDate(5);
		await addManualSession(app, classId, date, "");

		const syncPath = `/api/classes/${classId}/sessions/${date}/recording/sync`;
		for (let attempt = 0; attempt < 2; attempt += 1) {
			const res = await app.request(syncPath, {
				method: "POST",
				headers: TEACHER_HEADERS,
				body: "{}",
			});
			expect(res.status).toBe(200);
			expect(await res.json()).toMatchObject({
				hasRecordingVideo: true,
				recordingZoomTrashStatus: "none",
			});
		}
		const cronRes = await runRecordingSyncCron({
			db,
			zoom: undefined,
			getZoomClient: () => fake.client,
			recordingStore: store,
		});

		expect(cronRes.trashed).toBe(0);
		expect(fake.calls.some((c) => c.method === "trash")).toBe(false);
		expect((await meetingRow(classId, date))?.recordingZoomTrashStatus).toBe(
			"none",
		);
		expect(store.objects.size).toBe(1);
	});

	test("thiếu recordingStore hoặc lỗi tải từ Zoom: giữ fallback link Zoom và tuyệt đối không gọi Trash", async () => {
		const fakeNoStore = createFakeZoom();
		fakeNoStore.setRecordingReady(true);
		const appNoStore = createApp(fakeNoStore.client);
		const classId = await createManualOnlineClass(appNoStore, "Fallback Zoom");
		const date1 = futureDate(5);
		await addManualSession(appNoStore, classId, date1, "");
		const m1 = await meetingRow(classId, date1);

		const res1 = await appNoStore.request(
			`/api/classes/${classId}/sessions/${date1}/recording/sync`,
			{ method: "POST", headers: TEACHER_HEADERS, body: "{}" },
		);
		expect(res1.status).toBe(200);
		expect(await res1.json()).toMatchObject({
			status: "failed",
			recordingUrl: `https://zoom.us/rec/share/fake-${m1?.zoomMeetingId}`,
			recordingPassword: "rec123",
			recordingSource: "external",
			hasRecordingVideo: false,
			recordingZoomTrashStatus: "none",
		});
		expect(fakeNoStore.calls.filter((c) => c.method === "trash")).toHaveLength(
			0,
		);

		const fakeErr = createFakeZoom();
		fakeErr.setRecordingReady(true);
		fakeErr.setDownloadError("Zoom download 502");
		const store = createMemoryRecordingStore();
		const appErr = createApp(fakeErr.client, { recordingStore: store });
		const date2 = futureDate(6);
		await addManualSession(appErr, classId, date2, "");
		const m2 = await meetingRow(classId, date2);

		const res2 = await appErr.request(
			`/api/classes/${classId}/sessions/${date2}/recording/sync`,
			{ method: "POST", headers: TEACHER_HEADERS, body: "{}" },
		);
		expect(res2.status).toBe(200);
		expect(await res2.json()).toMatchObject({
			status: "failed",
			recordingUrl: `https://zoom.us/rec/share/fake-${m2?.zoomMeetingId}`,
			recordingPassword: "rec123",
			recordingSource: "external",
			hasRecordingVideo: false,
			recordingZoomTrashStatus: "none",
			message: "Zoom download 502",
		});
		expect(store.objects.size).toBe(0);
		expect(fakeErr.calls.filter((c) => c.method === "trash")).toHaveLength(0);
	});

	test("lỗi Zoom Trash không làm hỏng recording R2 và cron/sync sau thử lại thành công", async () => {
		const fake = createFakeZoom();
		fake.setRecordingReady(true);
		fake.setTrashError("Missing recording:write:admin scope");
		const store = createMemoryRecordingStore();
		const t0 = new Date("2026-11-18T05:00:00Z");
		const app = createApp(fake.client, {
			recordingStore: store,
			now: () => t0,
		});
		const classId = await createManualOnlineClass(app, "Trash Retry");
		const date = "2026-11-18";
		await addManualSession(app, classId, date, "", "10:00", 60);

		const first = await app.request(
			`/api/classes/${classId}/sessions/${date}/recording/sync`,
			{ method: "POST", headers: TEACHER_HEADERS, body: "{}" },
		);
		expect(first.status).toBe(200);
		expect(await first.json()).toMatchObject({
			status: "ready",
			recordingSource: "r2",
			hasRecordingVideo: true,
			recordingZoomTrashStatus: "failed",
		});
		const afterFail = await meetingRow(classId, date);
		expect(afterFail?.recordingStatus).toBe("ready");
		expect(afterFail?.recordingError).toBeNull();
		expect(afterFail?.recordingZoomTrashStatus).toBe("failed");

		// Sau 30 phút (chưa hết cooldown 1 giờ) cron không retry trash.
		fake.setTrashError(null);
		const tooSoon = await runRecordingSyncCron({
			db,
			getZoomClient: () => fake.client,
			recordingStore: store,
			now: () => new Date("2026-11-18T05:30:00Z"),
		});
		expect(tooSoon.trashed).toBe(0);

		// Sau 2 giờ cron retry trash thành công.
		const retried = await runRecordingSyncCron({
			db,
			getZoomClient: () => fake.client,
			recordingStore: store,
			now: () => new Date("2026-11-18T07:00:00Z"),
		});
		expect(retried.trashed).toBe(1);
		expect((await meetingRow(classId, date))?.recordingZoomTrashStatus).toBe(
			"trashed",
		);
	});

	test("hai lệnh đồng bộ recording đồng thời: lượt thua race xoá bản R2 dư và chỉ giữ 1 object", async () => {
		const fake = createFakeZoom();
		fake.setRecordingReady(true);
		const store = createMemoryRecordingStore();
		const app = createApp(fake.client, { recordingStore: store });
		const classId = await createManualOnlineClass(app, "Race Sync");
		const date = futureDate(5);
		await addManualSession(app, classId, date, "");

		let arrived = 0;
		let release: (() => void) | null = null;
		const barrier = new Promise<void>((resolve) => {
			release = resolve;
		});
		const raceClient: ZoomClient = {
			...fake.client,
			async downloadRecordingFile(url) {
				arrived += 1;
				if (arrived === 2) {
					release?.();
				} else {
					await barrier;
				}
				return fake.client.downloadRecordingFile(url);
			},
		};

		const [r1, r2] = await Promise.all([
			syncRecordingForOccurrence(
				{ db, getZoomClient: () => raceClient, recordingStore: store },
				{ orgId: "org-1", classId, dateISO: date },
			),
			syncRecordingForOccurrence(
				{ db, getZoomClient: () => raceClient, recordingStore: store },
				{ orgId: "org-1", classId, dateISO: date },
			),
		]);

		expect(r1.status).toBe("ready");
		expect(r2.status).toBe("ready");
		expect(r1.hasRecordingVideo).toBe(true);
		expect(r2.hasRecordingVideo).toBe(true);
		expect(store.objects.size).toBe(1);
		expect(store.deletedKeys).toHaveLength(1);
		expect(fake.calls.filter((c) => c.method === "trash")).toHaveLength(1);
	});

	test("cron chỉ quét buổi trong cửa sổ ngày, giới hạn tối đa 2 reup/tick và không tự backfill dòng legacy ready", async () => {
		const fake = createFakeZoom();
		fake.setRecordingReady(true);
		const store = createMemoryRecordingStore();
		const app = createApp(fake.client, { recordingStore: store });
		const classId = await createManualOnlineClass(app, "Window Class");

		for (const date of [
			"2026-11-08",
			"2026-11-16",
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
		// Dòng legacy đã có link Zoom cũ (`ready`, không có `recordingStorageKey`) — cron KHÔNG được tự backfill.
		await addManualSession(
			app,
			classId,
			"2026-11-15",
			"https://example.com/2026-11-15",
			"10:00",
			60,
		);
		await db.insert(schema.classSessionMeeting).values({
			id: "m-legacy",
			orgId: "org-1",
			classId,
			date: "2026-11-15",
			joinUrl: `${ZOOM_JOIN_PREFIX}20261115`,
			zoomMeetingId: "20261115",
			recordingUrl: "https://zoom.us/rec/share/legacy",
			recordingStatus: "ready",
		});

		// Tick 1: có 3 buổi đến hạn (16, 17, 18) nhưng giới hạn tối đa 2 reup/tick, ưu tiên mới nhất (18, 17).
		const tick1 = await runRecordingSyncCron({
			db,
			getZoomClient: () => fake.client,
			recordingStore: store,
			now: () => new Date("2026-11-18T05:00:00Z"),
		});
		expect(tick1).toEqual({
			checked: 2,
			updated: 2,
			failed: 0,
			expired: 0,
			trashed: 2,
		});
		expect(
			(await meetingRow(classId, "2026-11-18"))?.recordingStorageKey,
		).toBeTruthy();
		expect(
			(await meetingRow(classId, "2026-11-17"))?.recordingStorageKey,
		).toBeTruthy();
		expect(
			(await meetingRow(classId, "2026-11-16"))?.recordingStorageKey,
		).toBeNull();

		// Tick 2: kéo nốt buổi 16/11; buổi legacy 15/11 vẫn giữ nguyên không bị backfill.
		const tick2 = await runRecordingSyncCron({
			db,
			getZoomClient: () => fake.client,
			recordingStore: store,
			now: () => new Date("2026-11-18T05:10:00Z"),
		});
		expect(tick2).toEqual({
			checked: 1,
			updated: 1,
			failed: 0,
			expired: 0,
			trashed: 1,
		});
		expect(
			(await meetingRow(classId, "2026-11-16"))?.recordingStorageKey,
		).toBeTruthy();
		const legacyAfterCron = await meetingRow(classId, "2026-11-15");
		expect(legacyAfterCron?.recordingStorageKey).toBeNull();
		expect(legacyAfterCron?.recordingUrl).toBe(
			"https://zoom.us/rec/share/legacy",
		);

		// Nút Đồng bộ thủ công vẫn kéo được dòng legacy lên R2.
		const manualPull = await app.request(
			`/api/classes/${classId}/sessions/2026-11-15/recording/sync`,
			{ method: "POST", headers: TEACHER_HEADERS, body: "{}" },
		);
		expect(manualPull.status).toBe(200);
		expect(await manualPull.json()).toMatchObject({
			status: "ready",
			recordingSource: "r2",
			hasRecordingVideo: true,
		});
	});

	test("cron chuyển failed kèm recordingError khi quá 72 giờ vẫn chưa có recording", async () => {
		const fake = createFakeZoom();
		const store = createMemoryRecordingStore();
		const app = createApp(fake.client, { recordingStore: store });
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
			recordingStore: store,
			now: () => new Date("2026-11-21T05:00:00Z"),
		});
		expect(res).toEqual({
			checked: 1,
			updated: 0,
			failed: 1,
			expired: 0,
			trashed: 0,
		});
		const row = await meetingRow(classId, date);
		expect(row?.recordingStatus).toBe("failed");
		expect(row?.recordingError).toContain("72 giờ");
		expect(fake.calls.filter((c) => c.method === "recording")).toHaveLength(0);
	});

	test("cron dọn hết hạn 90 ngày xoá object R2 và chuyển trạng thái sang expired (chạy cả khi chưa cấu hình Zoom)", async () => {
		const store = createMemoryRecordingStore();
		const app = createApp(undefined, { recordingStore: store });
		const classId = await createManualOnlineClass(app, "Expiry Class");
		const oldKey = `org-1/${classId}/2026-08-01/old.mp4`;
		const freshKey = `org-1/${classId}/2026-11-10/fresh.mp4`;
		await store.putStream(
			oldKey,
			new ReadableStream({
				start(c) {
					c.enqueue(new Uint8Array([1, 2, 3, 4]));
					c.close();
				},
			}),
			{ contentType: "video/mp4" },
		);
		await store.putStream(
			freshKey,
			new ReadableStream({
				start(c) {
					c.enqueue(new Uint8Array([5, 6, 7, 8]));
					c.close();
				},
			}),
			{ contentType: "video/mp4" },
		);

		await db.insert(schema.classSessionMeeting).values([
			{
				id: "m-expired",
				orgId: "org-1",
				classId,
				date: "2026-08-01",
				joinUrl: `${ZOOM_JOIN_PREFIX}1`,
				zoomMeetingId: "1",
				recordingStatus: "ready",
				recordingStorageKey: oldKey,
				recordingSizeBytes: 4,
				recordingMimeType: "video/mp4",
				recordingUploadedAt: new Date("2026-08-01T15:00:00Z"),
				recordingExpiresAt: new Date("2026-10-30T15:00:00Z"),
				recordingZoomTrashStatus: "trashed",
			},
			{
				id: "m-fresh",
				orgId: "org-1",
				classId,
				date: "2026-11-10",
				joinUrl: `${ZOOM_JOIN_PREFIX}2`,
				zoomMeetingId: "2",
				recordingStatus: "ready",
				recordingStorageKey: freshKey,
				recordingSizeBytes: 4,
				recordingMimeType: "video/mp4",
				recordingUploadedAt: new Date("2026-11-10T15:00:00Z"),
				recordingExpiresAt: new Date("2027-02-08T15:00:00Z"),
				recordingZoomTrashStatus: "trashed",
			},
		]);

		// Nếu store.delete lỗi, giữ nguyên DB để tick sau thử lại.
		store.setDeleteError("R2 transient error");
		const failedSweep = await runRecordingExpiryCron({
			db,
			recordingStore: store,
			now: () => new Date("2026-11-26T00:00:00Z"),
		});
		expect(failedSweep).toEqual({ expired: 0, failed: 1 });
		expect((await meetingRow(classId, "2026-08-01"))?.recordingStorageKey).toBe(
			oldKey,
		);

		// Xoá lỗi và chạy runRecordingSyncCron KHÔNG cấu hình Zoom — vẫn phải dọn hết hạn.
		store.setDeleteError(null);
		const cronRes = await runRecordingSyncCron({
			db,
			recordingStore: store,
			now: () => new Date("2026-11-26T00:00:00Z"),
		});
		expect(cronRes).toEqual({
			checked: 0,
			updated: 0,
			failed: 0,
			expired: 1,
			trashed: 0,
		});
		expect(store.objects.has(oldKey)).toBe(false);
		expect(store.objects.has(freshKey)).toBe(true);

		const expiredRow = await meetingRow(classId, "2026-08-01");
		expect(expiredRow?.recordingStatus).toBe("expired");
		expect(expiredRow?.recordingStorageKey).toBeNull();
		expect(expiredRow?.recordingSizeBytes).toBeNull();
		expect(expiredRow?.recordingMimeType).toBeNull();
		expect(expiredRow?.recordingExpiresAt).toBeInstanceOf(Date);
	});

	test("gán link tay (PUT /recording) bị chặn khi video R2 còn hạn; xoá buổi xoá object R2 cũ", async () => {
		const fake = createFakeZoom();
		fake.setRecordingReady(true);
		const store = createMemoryRecordingStore();
		const app = createApp(fake.client, { recordingStore: store });
		const classId = await createManualOnlineClass(app, "Cleanup R2");
		const d1 = futureDate(5);
		const d2 = futureDate(6);
		await addManualSession(app, classId, d1, "");
		await addManualSession(app, classId, d2, "");

		await app.request(`/api/classes/${classId}/sessions/${d1}/recording/sync`, {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: "{}",
		});
		await app.request(`/api/classes/${classId}/sessions/${d2}/recording/sync`, {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: "{}",
		});
		const k1 = (await meetingRow(classId, d1))?.recordingStorageKey;
		const k2 = (await meetingRow(classId, d2))?.recordingStorageKey;
		expect(k1).toBeTruthy();
		expect(k2).toBeTruthy();
		expect(store.objects.size).toBe(2);

		// Video R2 còn hạn: cả link mới lẫn ô trống đều bị từ chối, object giữ nguyên.
		const putManual = (recordingUrl: string) =>
			app.request(`/api/classes/${classId}/sessions/${d1}/recording`, {
				method: "PUT",
				headers: TEACHER_HEADERS,
				body: JSON.stringify({ recordingUrl }),
			});
		for (const url of ["", "https://drive.google.com/file/d/custom"]) {
			const blocked = await putManual(url);
			expect(blocked.status).toBe(409);
			expect(await blocked.json()).toMatchObject({ code: "RECORDING_LOCKED" });
		}
		expect(store.objects.has(k1 ?? "")).toBe(true);
		expect((await meetingRow(classId, d1))?.recordingStorageKey).toBe(k1);

		// Video đã quá hạn → gán link tay được, xoá object k1 và chuyển sang external.
		await db
			.update(schema.classSessionMeeting)
			.set({ recordingExpiresAt: new Date(0) })
			.where(eq(schema.classSessionMeeting.recordingStorageKey, k1 ?? ""));
		const override = await putManual("https://drive.google.com/file/d/custom");
		expect(override.status).toBe(200);
		expect(store.objects.has(k1 ?? "")).toBe(false);
		const m1After = await meetingRow(classId, d1);
		expect(m1After?.recordingStorageKey).toBeNull();
		expect(m1After?.recordingUrl).toBe(
			"https://drive.google.com/file/d/custom",
		);
		expect(m1After?.recordingZoomTrashStatus).toBe("none");

		// Xoá buổi d2 → xoá object k2.
		const delRes = await app.request(`/api/classes/${classId}/sessions/${d2}`, {
			method: "DELETE",
			headers: TEACHER_HEADERS,
		});
		expect(delRes.status).toBe(200);
		expect(store.objects.has(k2 ?? "")).toBe(false);

		// Dời buổi đè lên ngày đích đang có object R2 → xoá object R2 của ngày bị đè.
		const d3 = futureDate(7);
		const d4 = futureDate(8);
		await addManualSession(app, classId, d3, "");
		await store.putStream(
			`org-1/${classId}/${d4}/overwritten.mp4`,
			new ReadableStream({
				start(c) {
					c.enqueue(new Uint8Array([9, 8, 7, 6]));
					c.close();
				},
			}),
			{ contentType: "video/mp4" },
		);
		await db.insert(schema.classSessionMeeting).values({
			id: "m-overwritten-r2",
			orgId: "org-1",
			classId,
			date: d4,
			joinUrl: `${ZOOM_JOIN_PREFIX}888`,
			zoomMeetingId: "888",
			recordingStatus: "ready",
			recordingStorageKey: `org-1/${classId}/${d4}/overwritten.mp4`,
			recordingSizeBytes: 4,
			recordingMimeType: "video/mp4",
		});
		const moveRes = await app.request(
			`/api/classes/${classId}/sessions/${d3}/edit`,
			{
				method: "POST",
				headers: TEACHER_HEADERS,
				body: JSON.stringify({ moveDate: d4 }),
			},
		);
		expect(moveRes.status).toBe(200);
		expect(store.objects.has(`org-1/${classId}/${d4}/overwritten.mp4`)).toBe(
			false,
		);
	});
});

describe("Cron không bị dòng failed hết hạn chiếm chỗ", () => {
	test("bỏ qua dòng failed quá cửa sổ 72 giờ và thử lại dòng failed (kể cả fallback có link Zoom) đã qua 1 giờ", async () => {
		const fake = createFakeZoom();
		fake.setRecordingReady(true);
		const store = createMemoryRecordingStore();
		const app = createApp(fake.client, { recordingStore: store });
		const classId = await createManualOnlineClass(app, "Failed Window");
		const rows = [
			{
				date: "2026-11-14",
				status: "failed",
				syncedAt: "2026-11-14T20:00:00Z",
				url: "",
			},
			{
				date: "2026-11-16",
				status: "failed",
				syncedAt: "2026-11-17T01:00:00Z",
				url: "https://zoom.us/rec/share/fallback-16",
			},
			{
				date: "2026-11-17",
				status: "failed",
				syncedAt: "2026-11-18T04:30:00Z",
				url: "",
			},
			{ date: "2026-11-18", status: "pending", syncedAt: null, url: "" },
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
				recordingUrl: r.url,
				recordingStatus: r.status,
				recordingSyncedAt: r.syncedAt ? new Date(r.syncedAt) : null,
			});
		}

		const res = await runRecordingSyncCron({
			db,
			getZoomClient: () => fake.client,
			recordingStore: store,
			now: () => new Date("2026-11-18T05:00:00Z"),
		});
		const polled = fake.calls
			.filter((c) => c.method === "recording")
			.map((c) => c.meetingId)
			.sort();
		// 14/11 quá cửa sổ, 17/11 mới thử cách đây 30 phút: chỉ 16/11 (fallback) và 18/11.
		expect(polled).toEqual(["20261116", "20261118"]);
		expect(res).toEqual({
			checked: 2,
			updated: 2,
			failed: 0,
			expired: 0,
			trashed: 2,
		});
	});
});

describe("Học viên & giáo viên xem metadata và stream video recording (Range 206 + IDOR + 410)", () => {
	test("R2 recording: snapshot & student DTO không lộ storageKey/password, stream 200/206 + header bảo mật + chặn IDOR + 410 hết hạn", async () => {
		const fake = createFakeZoom();
		fake.setRecordingReady(true);
		const store = createMemoryRecordingStore();
		let currentNow = new Date("2026-11-26T10:00:00Z");
		const app = createApp(fake.client, {
			recordingStore: store,
			now: () => currentNow,
		});

		await db.insert(schema.organization).values({ id: "org-2", name: "Org 2" });
		await db.insert(schema.user).values([
			{
				id: "t-2",
				name: "Thầy Nam",
				email: "teacher2@workspace.edu.vn",
				emailVerified: true,
				role: "teacher",
			},
			{
				id: "u-s2",
				name: "Bảo Châu",
				email: "baochau@example.com",
				emailVerified: true,
				role: "student",
			},
		]);
		await db.insert(schema.membership).values({
			id: "mem-2",
			orgId: "org-2",
			userId: "t-2",
			role: "teacher",
		});
		await db.insert(schema.student).values({
			id: "s-2",
			orgId: "org-1",
			name: "Bảo Châu",
			email: "baochau@example.com",
		});

		const classId = await createManualOnlineClass(app, "Stream Class");
		const date = futureDate(5);
		await addManualSession(app, classId, date, "");
		const enr = await app.request(`/api/classes/${classId}/enroll`, {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: JSON.stringify({ studentId: "s-1", activateNow: true }),
		});
		expect(enr.status).toBe(201);

		const sync = await app.request(
			`/api/classes/${classId}/sessions/${date}/recording/sync`,
			{ method: "POST", headers: TEACHER_HEADERS, body: "{}" },
		);
		expect(sync.status).toBe(200);
		const storedRow = await meetingRow(classId, date);
		const storageKey = storedRow?.recordingStorageKey ?? "";
		expect(storageKey).toBeTruthy();

		// 1. Snapshot giáo viên không bao giờ lộ recordingStorageKey
		const snapRes = await app.request("/api/kernel", {
			headers: TEACHER_HEADERS,
		});
		expect(snapRes.status).toBe(200);
		const snapRaw = await snapRes.text();
		expect(snapRaw).not.toContain(storageKey);
		expect(snapRaw).not.toContain("recordingStorageKey");
		const snap = JSON.parse(snapRaw) as {
			sessionMeetings: Array<{
				classId: string;
				date: string;
				recordingSource: string | null;
				hasRecordingVideo: boolean;
				recordingUrl: string;
				recordingPassword: string | null;
				recordingZoomTrashStatus: string;
			}>;
		};
		const snapMeeting = snap.sessionMeetings.find(
			(m) => m.classId === classId && m.date === date,
		);
		expect(snapMeeting).toMatchObject({
			recordingSource: "r2",
			hasRecordingVideo: true,
			recordingUrl: "",
			recordingPassword: null,
			recordingZoomTrashStatus: "trashed",
		});

		// 2. Student detail & schedule không lộ storageKey, recordingError, recordingZoomTrashStatus hay password Zoom
		const detailRes = await app.request(`/api/student/classes/${classId}`, {
			headers: STUDENT_HEADERS,
		});
		const detailRaw = await detailRes.text();
		expect(detailRaw).not.toContain(storageKey);
		expect(detailRaw).not.toContain("recordingStorageKey");
		expect(detailRaw).not.toContain("recordingZoomTrashStatus");
		expect(detailRaw).not.toContain("recordingError");
		const detail = JSON.parse(detailRaw) as {
			lessons: Array<{
				hasZoom?: boolean;
				hasRecordingVideo?: boolean;
				recordingSource?: string;
				recordingUrl?: string;
				recordingPassword?: string;
				recordingExpiresAt?: string;
			}>;
		};
		expect(detail.lessons[0]).toMatchObject({
			hasZoom: true,
			hasRecordingVideo: true,
			recordingSource: "r2",
		});
		expect(detail.lessons[0]?.recordingUrl).toBeUndefined();
		expect(detail.lessons[0]?.recordingPassword).toBeUndefined();
		expect(detail.lessons[0]?.recordingExpiresAt).toBeTruthy();

		const scheduleRes = await app.request("/api/student/schedule", {
			headers: STUDENT_HEADERS,
		});
		const schedule = (await scheduleRes.json()) as {
			lessons: Array<{
				hasRecordingVideo?: boolean;
				recordingSource?: string;
				recordingPassword?: string;
			}>;
		};
		expect(schedule.lessons[0]).toMatchObject({
			hasRecordingVideo: true,
			recordingSource: "r2",
		});
		expect(schedule.lessons[0]?.recordingPassword).toBeUndefined();

		// 3. Teacher stream full 200 + Range 206 + security headers
		const teacherVideoPath = `/api/classes/${classId}/sessions/${date}/recording/video`;
		const tFull = await app.request(teacherVideoPath, {
			headers: { "x-test-user": "teacher-1" },
		});
		expect(tFull.status).toBe(200);
		expect(tFull.headers.get("content-type")).toBe("video/mp4");
		expect(tFull.headers.get("accept-ranges")).toBe("bytes");
		expect(tFull.headers.get("content-disposition")).toContain("inline;");
		expect(tFull.headers.get("cross-origin-resource-policy")).toBe("same-site");
		expect(tFull.headers.get("referrer-policy")).toBe("no-referrer");
		expect(tFull.headers.get("content-security-policy")).toBe(INLINE_MEDIA_CSP);
		expect(tFull.headers.get("cache-control")).toBe("private, no-store");
		const fullBytes = new Uint8Array(await tFull.arrayBuffer());
		expect(fullBytes.byteLength).toBeGreaterThan(32);

		const tRange = await app.request(teacherVideoPath, {
			headers: { "x-test-user": "teacher-1", Range: "bytes=0-15" },
		});
		expect(tRange.status).toBe(206);
		expect(tRange.headers.get("content-range")).toBe(
			`bytes 0-15/${fullBytes.byteLength}`,
		);
		expect(tRange.headers.get("content-length")).toBe("16");
		const rangeBytes = new Uint8Array(await tRange.arrayBuffer());
		expect(rangeBytes).toEqual(fullBytes.subarray(0, 16));

		const tBadRange = await app.request(teacherVideoPath, {
			headers: { "x-test-user": "teacher-1", Range: "bytes=999999-1000000" },
		});
		expect(tBadRange.status).toBe(416);

		// 4. Student stream Range 206 + security headers
		const studentVideoPath = `/api/student/classes/${classId}/sessions/${date}/recording/video`;
		const sRange = await app.request(studentVideoPath, {
			headers: { "x-test-user": "student-1", Range: "bytes=4-19" },
		});
		expect(sRange.status).toBe(206);
		expect(sRange.headers.get("content-range")).toBe(
			`bytes 4-19/${fullBytes.byteLength}`,
		);
		expect(sRange.headers.get("cross-origin-resource-policy")).toBe(
			"same-site",
		);
		expect(sRange.headers.get("referrer-policy")).toBe("no-referrer");
		expect(sRange.headers.get("content-security-policy")).toBe(
			INLINE_MEDIA_CSP,
		);
		expect(new Uint8Array(await sRange.arrayBuffer())).toEqual(
			fullBytes.subarray(4, 20),
		);

		// 5. IDOR & auth guards
		expect((await app.request(teacherVideoPath)).status).toBe(401);
		expect((await app.request(studentVideoPath)).status).toBe(401);
		expect(
			(
				await app.request(teacherVideoPath, {
					headers: { "x-test-user": "teacher-2" },
				})
			).status,
		).toBe(404);
		expect(
			(
				await app.request(teacherVideoPath, {
					headers: { "x-test-user": "student-1" },
				})
			).status,
		).toBe(403);
		expect(
			(
				await app.request(studentVideoPath, {
					headers: { "x-test-user": "teacher-1" },
				})
			).status,
		).toBe(403);
		expect(
			(
				await app.request(studentVideoPath, {
					headers: { "x-test-user": "student-2" },
				})
			).status,
		).toBe(404);
		expect(
			(
				await app.request(
					`/api/student/classes/${classId}/sessions/not-a-date/recording/video`,
					{ headers: { "x-test-user": "student-1" } },
				)
			).status,
		).toBe(400);

		// 6. Quá 90 ngày → trả 410 RECORDING_EXPIRED cả trước khi cron sweep
		currentNow = new Date("2027-03-10T00:00:00Z");
		const tExpired = await app.request(teacherVideoPath, {
			headers: { "x-test-user": "teacher-1" },
		});
		expect(tExpired.status).toBe(410);
		expect(await tExpired.json()).toMatchObject({
			code: RECORDING_ERROR_CODES.EXPIRED,
		});

		const sExpired = await app.request(studentVideoPath, {
			headers: { "x-test-user": "student-1" },
		});
		expect(sExpired.status).toBe(410);
		expect(await sExpired.json()).toMatchObject({
			code: RECORDING_ERROR_CODES.EXPIRED,
		});

		// 7. Chưa cấu hình recordingStore → trả 503 RECORDINGS_DISABLED
		const appNoStore = createApp(fake.client);
		const tDisabled = await appNoStore.request(teacherVideoPath, {
			headers: { "x-test-user": "teacher-1" },
		});
		expect(tDisabled.status).toBe(503);
		expect(await tDisabled.json()).toMatchObject({
			code: RECORDING_ERROR_CODES.DISABLED,
		});
		const sDisabled = await appNoStore.request(studentVideoPath, {
			headers: { "x-test-user": "student-1" },
		});
		expect(sDisabled.status).toBe(503);
		expect(await sDisabled.json()).toMatchObject({
			code: RECORDING_ERROR_CODES.DISABLED,
		});
	});

	test("fallback link Zoom: học viên vẫn thấy recordingUrl + recordingPassword và recordingSource external", async () => {
		const fake = createFakeZoom();
		fake.setRecordingReady(true);
		const app = createApp(fake.client); // Không có recordingStore → fallback Zoom
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
			class: {
				nextSession: {
					dur?: number;
					hasZoom?: boolean;
					joinUrl?: string;
				} | null;
			};
			lessons: Array<{
				hasZoom?: boolean;
				joinUrl?: string;
				recordingUrl?: string;
				recordingPassword?: string;
				recordingSource?: string;
			}>;
		};
		expect(detail.class.nextSession?.hasZoom).toBe(true);
		expect(detail.class.nextSession?.dur).toBe(90);
		expect(detail.class.nextSession?.joinUrl).toBeUndefined();
		expect(detail.lessons[0]).toMatchObject({
			hasZoom: true,
			recordingUrl: `https://zoom.us/rec/share/fake-${meeting?.zoomMeetingId}`,
			recordingPassword: "rec123",
			recordingSource: "external",
		});
		expect(detail.lessons[0]?.joinUrl).toBeUndefined();

		const schedule = (await (
			await app.request("/api/student/schedule", { headers: STUDENT_HEADERS })
		).json()) as {
			lessons: Array<{
				hasZoom?: boolean;
				joinUrl?: string;
				recordingPassword?: string;
				recordingSource?: string;
			}>;
		};
		expect(schedule.lessons[0]).toMatchObject({
			hasZoom: true,
			recordingPassword: "rec123",
			recordingSource: "external",
		});
		expect(schedule.lessons[0]?.joinUrl).toBeUndefined();
	});

	test("học viên có buổi cancelled hoặc enrollment invited bị chặn 404 khi gọi stream video", async () => {
		const fake = createFakeZoom();
		fake.setRecordingReady(true);
		const store = createMemoryRecordingStore();
		const app = createApp(fake.client, { recordingStore: store });
		const classId = await createManualOnlineClass(app, "Cancelled Video");
		const date = futureDate(5);
		await addManualSession(app, classId, date, "");

		const enrRes = await app.request(`/api/classes/${classId}/enroll`, {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: JSON.stringify({ studentId: "s-1", activateNow: false }),
		});
		expect(enrRes.status).toBe(201);
		const enrBody = (await enrRes.json()) as { id: string };

		await app.request(
			`/api/classes/${classId}/sessions/${date}/recording/sync`,
			{ method: "POST", headers: TEACHER_HEADERS, body: "{}" },
		);

		const videoPath = `/api/student/classes/${classId}/sessions/${date}/recording/video`;
		// Enrollment còn invited → 404
		expect(
			(
				await app.request(videoPath, {
					headers: { "x-test-user": "student-1" },
				})
			).status,
		).toBe(404);

		// Accept rồi cancel riêng buổi của học viên → 404
		await app.request(`/api/enrollments/${enrBody.id}/accept`, {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: "{}",
		});
		const [s1Lesson] = await db
			.select({ id: schema.lesson.id })
			.from(schema.lesson)
			.where(
				and(
					eq(schema.lesson.enrollmentId, enrBody.id),
					eq(schema.lesson.date, date),
				),
			);
		expect(s1Lesson?.id).toBeTruthy();
		if (s1Lesson) {
			await app.request(`/api/lessons/${s1Lesson.id}/cancel`, {
				method: "POST",
				headers: TEACHER_HEADERS,
				body: "{}",
			});
		}
		expect(
			(
				await app.request(videoPath, {
					headers: { "x-test-user": "student-1" },
				})
			).status,
		).toBe(404);
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
			class: { nextSession: { hasZoom?: boolean; joinUrl?: string } | null };
		};
		expect(s1Detail.class.nextSession?.hasZoom).toBeUndefined();
		expect(s1Detail.class.nextSession?.joinUrl).toBeUndefined();
	});

	test("race condition: luồng lỗi download muộn sau khi luồng thắng đã commit R2 + Trash Zoom KHÔNG ghi đè mất recordingStorageKey", async () => {
		const store = createMemoryRecordingStore();
		let downloadCallCount = 0;
		let notifySlowReachedDownload!: () => void;
		const slowReachedDownload = new Promise<void>((resolve) => {
			notifySlowReachedDownload = resolve;
		});
		let releaseSlowFailure!: () => void;
		const slowFailureGate = new Promise<void>((resolve) => {
			releaseSlowFailure = resolve;
		});

		const baseFake = createFakeZoom();
		baseFake.setRecordingReady(true);

		const racingClient: ZoomClient = {
			...baseFake.client,
			async getRecording(meetingId) {
				return baseFake.client.getRecording(meetingId);
			},
			async downloadRecordingFile(downloadUrl) {
				downloadCallCount += 1;
				if (downloadCallCount === 1) {
					// Luồng chậm T2: báo đã vào download, chờ sau khi T1 commit R2 + Trash Zoom rồi mới lỗi 404.
					notifySlowReachedDownload();
					await slowFailureGate;
					throw new ZoomIntegrationError(
						ZOOM_ERROR_CODES.API_ERROR,
						"Tải recording từ Zoom lỗi 404: Recording trashed",
						502,
					);
				}
				return baseFake.client.downloadRecordingFile(downloadUrl);
			},
			async trashRecording(meetingId) {
				await baseFake.client.trashRecording(meetingId);
			},
		};

		const app = createApp(racingClient, { recordingStore: store });
		const classId = await createManualOnlineClass(app, "Race Protection Class");
		const date = futureDate(4);
		await addManualSession(app, classId, date, "");

		const syncPath = `/api/classes/${classId}/sessions/${date}/recording/sync`;
		// Bắt đầu T2 và đợi T2 thực sự chạm vào bước download trước khi chạy T1.
		const slowSyncPromise = app.request(syncPath, {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: "{}",
		});
		await slowReachedDownload;

		// Chạy T1 (nhanh, thành công commit R2 + Trash Zoom)
		const fastRes = await app.request(syncPath, {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: "{}",
		});
		expect(fastRes.status).toBe(200);
		const fastBody = (await fastRes.json()) as {
			status: string;
			hasRecordingVideo: boolean;
			recordingZoomTrashStatus: string;
		};
		expect(fastBody.status).toBe("ready");
		expect(fastBody.hasRecordingVideo).toBe(true);
		expect(fastBody.recordingZoomTrashStatus).toBe("trashed");

		const rowAfterFast = await meetingRow(classId, date);
		expect(rowAfterFast?.recordingStorageKey).toBeTruthy();

		// Giải phóng T2 để rơi vào nhánh saveZoomFallback
		releaseSlowFailure();
		const slowRes = await slowSyncPromise;
		expect(slowRes.status).toBe(200);
		const slowBody = (await slowRes.json()) as {
			status: string;
			hasRecordingVideo: boolean;
			recordingSource: string | null;
		};
		// T2 phải trả về trạng thái thắng cuộc (R2 ready), KHÔNG ghi đè D1 sang failed/null!
		expect(slowBody.status).toBe("ready");
		expect(slowBody.hasRecordingVideo).toBe(true);
		expect(slowBody.recordingSource).toBe("r2");

		const rowFinal = await meetingRow(classId, date);
		expect(rowFinal?.recordingStorageKey).toBe(
			rowAfterFast?.recordingStorageKey,
		);
		expect(rowFinal?.recordingStatus).toBe("ready");
		expect(rowFinal?.recordingZoomTrashStatus).toBe("trashed");
	});

	test("race condition: giáo viên gán link tay (PUT /recording) trong lúc sync R2 đang tải không bị ghi đè, object R2 dư bị xoá và Zoom không bị Trash", async () => {
		const store = createMemoryRecordingStore();
		let notifyReachedDownload!: () => void;
		const reachedDownload = new Promise<void>((resolve) => {
			notifyReachedDownload = resolve;
		});
		let releaseDownload!: () => void;
		const downloadGate = new Promise<void>((resolve) => {
			releaseDownload = resolve;
		});

		const baseFake = createFakeZoom();
		baseFake.setRecordingReady(true);

		const slowClient: ZoomClient = {
			...baseFake.client,
			async getRecording(meetingId) {
				return baseFake.client.getRecording(meetingId);
			},
			async downloadRecordingFile(downloadUrl) {
				notifyReachedDownload();
				await downloadGate;
				return baseFake.client.downloadRecordingFile(downloadUrl);
			},
			async trashRecording(meetingId) {
				await baseFake.client.trashRecording(meetingId);
			},
		};

		const app = createApp(slowClient, { recordingStore: store });
		const classId = await createManualOnlineClass(
			app,
			"Manual Override Race Class",
		);
		const date = futureDate(5);
		await addManualSession(app, classId, date, "");

		const syncPromise = app.request(
			`/api/classes/${classId}/sessions/${date}/recording/sync`,
			{
				method: "POST",
				headers: TEACHER_HEADERS,
				body: "{}",
			},
		);
		await reachedDownload;

		// Giáo viên gán link ngoài thủ công trong lúc sync R2 đang tải.
		const manualUrl = "https://drive.google.com/file/d/manual-override/view";
		const manualRes = await app.request(
			`/api/classes/${classId}/sessions/${date}/recording`,
			{
				method: "PUT",
				headers: TEACHER_HEADERS,
				body: JSON.stringify({ recordingUrl: manualUrl }),
			},
		);
		expect(manualRes.status).toBe(200);

		releaseDownload();
		const syncRes = await syncPromise;
		expect(syncRes.status).toBe(200);
		const syncBody = (await syncRes.json()) as {
			status: string;
			recordingUrl: string;
			recordingSource: string | null;
			hasRecordingVideo: boolean;
		};
		// Sync thua CAS → giữ nguyên link tay của giáo viên, xoá object R2 dư, KHÔNG gọi Zoom Trash.
		expect(syncBody.status).toBe("ready");
		expect(syncBody.recordingUrl).toBe(manualUrl);
		expect(syncBody.recordingSource).toBe("external");
		expect(syncBody.hasRecordingVideo).toBe(false);

		const rowFinal = await meetingRow(classId, date);
		expect(rowFinal?.recordingStorageKey).toBeNull();
		expect(rowFinal?.recordingUrl).toBe(manualUrl);
		expect(rowFinal?.recordingStatus).toBe("ready");
		expect(store.objects.size).toBe(0);
		expect(store.deletedKeys).toHaveLength(1);
		expect(baseFake.calls.filter((c) => c.method === "trash")).toHaveLength(0);
	});
});
