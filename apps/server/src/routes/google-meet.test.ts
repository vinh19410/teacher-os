import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { GOOGLE_MEET_SCOPES } from "@teacher-os/api/contracts";
import * as schema from "@teacher-os/db/schema/index";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, test } from "vitest";
import { buildApp, type Db } from "../app";
import {
	type GoogleIntegrationError,
	getValidGoogleAccessToken,
} from "../lib/google-meet/google-oauth";
import {
	createGoogleWorkspaceClient,
	type GoogleWorkspaceClient,
} from "../lib/google-meet/google-workspace-client";
import {
	ensureSessionMeeting,
	runRecordingSyncCron,
} from "../lib/google-meet/session-meet-service";

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

let db: Db;

function makeFakeGoogleClient(overrides?: Partial<GoogleWorkspaceClient>) {
	const calls = {
		created: [] as Array<
			Parameters<GoogleWorkspaceClient["createCalendarEventWithMeet"]>[0]
		>,
		patched: [] as Array<
			Parameters<GoogleWorkspaceClient["patchCalendarEvent"]>[0]
		>,
		deleted: [] as string[],
		configured: [] as string[],
		shared: [] as Array<{ fileId: string; emails: string[] }>,
	};
	let seq = 1;
	const client: GoogleWorkspaceClient = {
		async createCalendarEventWithMeet(input) {
			calls.created.push(input);
			const n = seq++;
			const meetCode = `abc-defg-00${n}`;
			return {
				eventId: `cal-evt-${n}`,
				hangoutLink: `https://meet.google.com/${meetCode}`,
				meetCode,
			};
		},
		async patchCalendarEvent(input) {
			calls.patched.push(input);
		},
		async deleteCalendarEvent(eventId) {
			calls.deleted.push(eventId);
		},
		async configureMeetSpace({ meetCode }) {
			calls.configured.push(meetCode);
			return {
				spaceName: `spaces/${meetCode}`,
				meetingUri: `https://meet.google.com/${meetCode}`,
				warning: null,
			};
		},
		async findReadyRecording() {
			return { status: "pending" };
		},
		async shareDriveFileWithEmails(input) {
			calls.shared.push(input);
			return { shared: input.emails.length, errors: [] };
		},
		...overrides,
	};
	return { client, calls };
}

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

function createApp(googleClient?: GoogleWorkspaceClient) {
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
		...(googleClient ? { getGoogleWorkspaceClient: () => googleClient } : {}),
	});
}

describe("Google OAuth status & token refresh", () => {
	test("reports unlinked, basic scopes, and full meet scopes accurately", async () => {
		const app = createApp();
		const res1 = await app.request("/api/integrations/google/status", {
			headers: TEACHER_HEADERS,
		});
		expect(res1.status).toBe(200);
		expect(await res1.json()).toEqual({
			linked: false,
			hasMeetScopes: false,
			hasRefreshToken: false,
			scopes: [],
			email: null,
		});

		await db.insert(schema.account).values({
			id: "acc-1",
			accountId: "g-1",
			providerId: "google",
			userId: "t-1",
			accessToken: "ya29.basic",
			scope: "openid email profile",
		});

		const res2 = await app.request("/api/integrations/google/status", {
			headers: TEACHER_HEADERS,
		});
		expect(await res2.json()).toMatchObject({
			linked: true,
			hasMeetScopes: false,
			hasRefreshToken: false,
			email: "teacher@workspace.edu.vn",
		});

		await db
			.update(schema.account)
			.set({
				refreshToken: "1//refresh-token",
				scope: ["openid", "email", ...GOOGLE_MEET_SCOPES].join(" "),
			})
			.where(eq(schema.account.id, "acc-1"));

		const res3 = await app.request("/api/integrations/google/status", {
			headers: TEACHER_HEADERS,
		});
		expect(await res3.json()).toMatchObject({
			linked: true,
			hasMeetScopes: true,
			hasRefreshToken: true,
		});
	});

	test("refreshes expired accessToken and throws GOOGLE_REAUTH_REQUIRED on invalid_grant", async () => {
		const past = new Date(Date.now() - 60_000);
		await db.insert(schema.account).values({
			id: "acc-1",
			accountId: "g-1",
			providerId: "google",
			userId: "t-1",
			accessToken: "ya29.old",
			refreshToken: "1//rt",
			accessTokenExpiresAt: past,
			scope: GOOGLE_MEET_SCOPES.join(" "),
		});

		const token = await getValidGoogleAccessToken(db, {
			userId: "t-1",
			clientId: "cid",
			clientSecret: "csec",
			fetchFn: async () =>
				new Response(
					JSON.stringify({ access_token: "ya29.fresh", expires_in: 3600 }),
					{ status: 200 },
				),
		});
		expect(token).toBe("ya29.fresh");

		const [updated] = await db
			.select()
			.from(schema.account)
			.where(eq(schema.account.id, "acc-1"));
		expect(updated?.accessToken).toBe("ya29.fresh");

		await db
			.update(schema.account)
			.set({ accessTokenExpiresAt: past })
			.where(eq(schema.account.id, "acc-1"));

		await expect(
			getValidGoogleAccessToken(db, {
				userId: "t-1",
				clientId: "cid",
				clientSecret: "csec",
				fetchFn: async () =>
					new Response(JSON.stringify({ error: "invalid_grant" }), {
						status: 400,
					}),
			}),
		).rejects.toMatchObject({
			code: "GOOGLE_REAUTH_REQUIRED",
		} satisfies Partial<GoogleIntegrationError>);

		const [revokedRow] = await db
			.select()
			.from(schema.account)
			.where(eq(schema.account.id, "acc-1"));
		expect(revokedRow?.refreshToken).toBeNull();
		expect(revokedRow?.accessToken).toBeNull();
	});
});

describe("Google Workspace REST client fallbacks", () => {
	test("configureMeetSpace falls back from OPEN+autoRecord to OPEN when artifactConfig is rejected", async () => {
		const requests: Array<{ url: string; method: string; body?: string }> = [];
		const client = createGoogleWorkspaceClient({
			accessToken: "ya29.test",
			fetchFn: async (input, init) => {
				const url = typeof input === "string" ? input : input.toString();
				requests.push({
					url,
					method: init?.method ?? "GET",
					body: typeof init?.body === "string" ? init.body : undefined,
				});
				if (
					url.endsWith("/spaces/abc-defg-hij") &&
					(init?.method ?? "GET") === "GET"
				) {
					return new Response(
						JSON.stringify({
							name: "spaces/SPACE123",
							meetingUri: "https://meet.google.com/abc-defg-hij",
						}),
						{ status: 200 },
					);
				}
				if (url.includes("autoRecordingGeneration")) {
					return new Response(
						JSON.stringify({ error: { message: "Not entitled" } }),
						{ status: 403 },
					);
				}
				return new Response(JSON.stringify({ name: "spaces/SPACE123" }), {
					status: 200,
				});
			},
		});

		const res = await client.configureMeetSpace({ meetCode: "abc-defg-hij" });
		expect(res.spaceName).toBe("spaces/SPACE123");
		expect(res.warning).toContain("tự động bật ghi hình");
		expect(requests).toHaveLength(3);
	});
});

describe("Session Meet & Recording lifecycle + Student exposure", () => {
	test("auto-creates Calendar+Meet on Online manual session, syncs edit/cancel, shares recording, and exposes to student", async () => {
		let recordingReady = false;
		const { client, calls } = makeFakeGoogleClient({
			async findReadyRecording() {
				if (!recordingReady) return { status: "pending" };
				return {
					status: "ready",
					fileId: "drive-file-99",
					exportUri: "https://drive.google.com/file/d/drive-file-99/view",
				};
			},
		});
		const app = createApp(client);

		// Create Online manual class & enroll student active
		const clsRes = await app.request("/api/classes", {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: JSON.stringify({
				name: "IELTS Speaking 1:1",
				skills: ["Speaking"],
				mode: "Online",
				schedulingMode: "manual",
				schedule: { days: [0], start: "19:00", end: "20:30" },
				startDate: "2026-11-20",
			}),
		});
		expect(clsRes.status).toBe(201);
		const { id: classId } = (await clsRes.json()) as { id: string };

		const enrRes = await app.request(`/api/classes/${classId}/enroll`, {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: JSON.stringify({
				studentId: "s-1",
				activateNow: true,
			}),
		});
		expect(enrRes.status).toBe(201);

		// Add manual session without manual zoom URL -> auto-creates Calendar+Meet
		const addSessionRes = await app.request(
			`/api/classes/${classId}/sessions`,
			{
				method: "POST",
				headers: TEACHER_HEADERS,
				body: JSON.stringify({
					date: "2026-11-25",
					time: "19:00",
					dur: 90,
					topic: "Part 2 Cue Cards",
					zoom: "",
				}),
			},
		);
		expect(addSessionRes.status).toBe(201);
		expect(calls.created).toHaveLength(1);
		expect(calls.created[0]?.attendeeEmails).toEqual(["minhanh@example.com"]);
		expect(calls.configured).toEqual(["abc-defg-001"]);

		// Verify mirrored into class_session.zoom, lesson.zoom, and snapshot.sessionMeetings
		const snapRes = await app.request("/api/kernel", {
			headers: TEACHER_HEADERS,
		});
		const snap = (await snapRes.json()) as {
			lessons: Array<{ classId: string; zoom: string }>;
			classSessions: Array<{ classId: string; zoom: string }>;
			sessionMeetings: Array<{
				classId: string;
				date: string;
				meetUrl: string;
				recordingStatus: string;
			}>;
		};
		expect(snap.classSessions.find((s) => s.classId === classId)?.zoom).toBe(
			"https://meet.google.com/abc-defg-001",
		);
		expect(snap.lessons.find((l) => l.classId === classId)?.zoom).toBe(
			"https://meet.google.com/abc-defg-001",
		);
		expect(snap.sessionMeetings).toMatchObject([
			{
				classId,
				date: "2026-11-25",
				meetUrl: "https://meet.google.com/abc-defg-001",
				recordingStatus: "pending",
			},
		]);

		// Student portal sees meetUrl on overview nextSession, schedule, and class detail
		const stDetailRes = await app.request(`/api/student/classes/${classId}`, {
			headers: STUDENT_HEADERS,
		});
		expect(stDetailRes.status).toBe(200);
		const stDetail = (await stDetailRes.json()) as {
			class: { nextSession: { meetUrl?: string } | null };
			lessons: Array<{ date: string; meetUrl?: string; recordingUrl?: string }>;
		};
		expect(stDetail.class.nextSession?.meetUrl).toBe(
			"https://meet.google.com/abc-defg-001",
		);
		expect(stDetail.lessons[0]?.meetUrl).toBe(
			"https://meet.google.com/abc-defg-001",
		);

		// Edit occurrence time & moveDate -> moves class_session_meeting & patches Calendar event
		const editRes = await app.request(
			`/api/classes/${classId}/sessions/2026-11-25/edit`,
			{
				method: "POST",
				headers: TEACHER_HEADERS,
				body: JSON.stringify({
					moveDate: "2026-11-26",
					time: "20:00",
					dur: 90,
					topic: "Part 2 Updated",
				}),
			},
		);
		expect(editRes.status).toBe(200);
		expect(calls.patched).toHaveLength(1);
		expect(calls.patched[0]).toMatchObject({
			eventId: "cal-evt-1",
			dateISO: "2026-11-26",
			time: "20:00",
		});

		// Recording sync: pending first, then ready + Drive share
		const syncPendingRes = await app.request(
			`/api/classes/${classId}/sessions/2026-11-26/recording/sync`,
			{ method: "POST", headers: TEACHER_HEADERS },
		);
		expect(syncPendingRes.status).toBe(200);
		expect(await syncPendingRes.json()).toMatchObject({ status: "pending" });

		recordingReady = true;
		const syncReadyRes = await app.request(
			`/api/classes/${classId}/sessions/2026-11-26/recording/sync`,
			{ method: "POST", headers: TEACHER_HEADERS },
		);
		expect(syncReadyRes.status).toBe(200);
		expect(await syncReadyRes.json()).toMatchObject({
			status: "ready",
			recordingUrl: "https://drive.google.com/file/d/drive-file-99/view",
		});
		expect(calls.shared).toEqual([
			{ fileId: "drive-file-99", emails: ["minhanh@example.com"] },
		]);

		// Student schedule now exposes recordingUrl
		const stSchedRes = await app.request("/api/student/schedule", {
			headers: STUDENT_HEADERS,
		});
		const stSched = (await stSchedRes.json()) as {
			lessons: Array<{ recordingUrl?: string; meetUrl?: string }>;
		};
		expect(stSched.lessons[0]?.recordingUrl).toBe(
			"https://drive.google.com/file/d/drive-file-99/view",
		);

		// Cancelling session deletes Calendar event and hides meetUrl from student
		const cancelRes = await app.request(
			`/api/classes/${classId}/sessions/2026-11-26/cancel`,
			{
				method: "POST",
				headers: TEACHER_HEADERS,
				body: JSON.stringify({}),
			},
		);
		expect(cancelRes.status).toBe(200);
		expect(calls.deleted).toEqual(["cal-evt-1"]);

		const stAfterCancelRes = await app.request(
			`/api/student/classes/${classId}`,
			{ headers: STUDENT_HEADERS },
		);
		const stAfterCancel = (await stAfterCancelRes.json()) as {
			lessons: Array<{
				status: string;
				meetUrl?: string;
				recordingUrl?: string;
			}>;
		};
		expect(stAfterCancel.lessons[0]?.status).toBe("cancelled");
		expect(stAfterCancel.lessons[0]?.meetUrl).toBeUndefined();
	});

	test("bulk create skips existing/cancelled sessions and cron syncs ended sessions", async () => {
		const { client, calls } = makeFakeGoogleClient({
			async findReadyRecording() {
				return {
					status: "ready",
					fileId: "cron-file-1",
					exportUri: "https://drive.google.com/file/d/cron-file-1/view",
				};
			},
		});
		const app = createApp(client);

		// Create auto Online class with 3 sessions starting in the past (ended > 5 mins ago)
		const clsRes = await app.request("/api/classes", {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: JSON.stringify({
				name: "Auto Online Class",
				skills: ["Speaking"],
				mode: "Online",
				schedulingMode: "auto",
				schedule: { days: [0, 2], start: "10:00", end: "11:30" },
				startDate: "2026-11-16",
				sessionsTotal: 3,
			}),
		});
		expect(clsRes.status).toBe(201);
		const { id: classId } = (await clsRes.json()) as { id: string };

		// Auto-provision created all 3 sessions (cap 5)
		expect(calls.created).toHaveLength(3);

		// Enrolling student later copies meetUrl into newly materialized lessons
		const enrRes = await app.request(`/api/classes/${classId}/enroll`, {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: JSON.stringify({
				studentId: "s-1",
				activateNow: true,
			}),
		});
		expect(enrRes.status).toBe(201);

		const lessonRows = await db
			.select()
			.from(schema.lesson)
			.where(
				and(
					eq(schema.lesson.orgId, "org-1"),
					eq(schema.lesson.classId, classId),
				),
			);
		expect(lessonRows).toHaveLength(3);
		expect(
			lessonRows.every((l) => l.zoom.startsWith("https://meet.google.com/")),
		).toBe(true);

		// Bulk endpoint skips already-created sessions
		const bulkRes = await app.request(`/api/classes/${classId}/meet/bulk`, {
			method: "POST",
			headers: TEACHER_HEADERS,
		});
		expect(bulkRes.status).toBe(200);
		expect(await bulkRes.json()).toMatchObject({
			created: 0,
			skipped: 3,
			failed: 0,
		});

		// Cron run at 2026-11-18 12:00 VN (UTC 05:00): 2026-11-16 11:30 VN & 2026-11-18 11:30 VN ended > 5 mins ago
		const cronRes = await runRecordingSyncCron({
			db,
			getGoogleWorkspaceClient: () => client,
			now: () => new Date("2026-11-18T05:00:00Z"),
		});
		expect(cronRes.checked).toBe(2);
		expect(cronRes.updated).toBe(2);
		expect(cronRes.failed).toBe(0);
	});

	test("blocks CSRF origin and non-JSON writes on googleMeetRoutes and rejects bare https://", async () => {
		const { client } = makeFakeGoogleClient();
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
				path: `/api/classes/${classId}/sessions/2026-11-22/meet`,
				body: "{}",
			},
			{
				method: "POST",
				path: `/api/classes/${classId}/meet/bulk`,
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
					recordingUrl: "https://drive.google.com/file/d/x",
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

	test("does not leak nextSession.meetUrl to invited students or individually cancelled group lessons", async () => {
		const { client } = makeFakeGoogleClient();
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
		await app.request(`/api/classes/${classId}/sessions/2026-11-25/meet`, {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: "{}",
		});

		// Student 1: invited (not accepted yet) -> overview must NOT expose nextSession/meetUrl
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
				nextSession: { meetUrl?: string } | null;
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
			class: { nextSession: { meetUrl?: string } | null };
		};
		expect(s1Detail.class.nextSession?.meetUrl).toBeUndefined();
	});

	test("concurrent ensureSessionMeeting creates only one surviving Calendar event without 502", async () => {
		const { client, calls } = makeFakeGoogleClient();
		const app = createApp(client);

		const clsRes = await app.request("/api/classes", {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: JSON.stringify({
				name: "Race Class",
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
				topic: "Race",
				zoom: "https://zoom.us/placeholder",
			}),
		});
		expect(addSessRes.status).toBe(201);

		// Fire two concurrent ensureSessionMeeting calls using barrier client so both pass initial select
		let releaseBarrier: (() => void) | null = null;
		let arrived = 0;
		const barrierPromise = new Promise<void>((r) => {
			releaseBarrier = r;
		});
		let seq = 0;
		const raceClient: GoogleWorkspaceClient = {
			...client,
			async createCalendarEventWithMeet(input) {
				arrived += 1;
				if (arrived === 2) {
					releaseBarrier?.();
				} else {
					await barrierPromise;
				}
				const res = await client.createCalendarEventWithMeet(input);
				seq += 1;
				return { ...res, eventId: `race-evt-${seq}` };
			},
		};

		const [r1, r2] = await Promise.all([
			ensureSessionMeeting(
				{ db, getGoogleWorkspaceClient: () => raceClient },
				{
					orgId: "org-1",
					classId,
					dateISO: "2026-11-25",
					actorUserId: "t-1",
				},
			),
			ensureSessionMeeting(
				{ db, getGoogleWorkspaceClient: () => raceClient },
				{
					orgId: "org-1",
					classId,
					dateISO: "2026-11-25",
					actorUserId: "t-1",
				},
			),
		]);

		expect(r1.meetUrl).toBe(r2.meetUrl);
		expect(calls.deleted).toHaveLength(1);
	});

	test("runRecordingSyncCron filters out future/old dates and caches auth errors per teacher", async () => {
		const { client } = makeFakeGoogleClient();
		const app = createApp(client);

		const clsRes = await app.request("/api/classes", {
			method: "POST",
			headers: TEACHER_HEADERS,
			body: JSON.stringify({
				name: "Window Class",
				skills: ["Speaking"],
				mode: "Online",
				schedulingMode: "manual",
				schedule: { days: [0], start: "10:00", end: "11:00" },
				startDate: "2026-11-01",
			}),
		});
		expect(clsRes.status).toBe(201);
		const { id: classId } = (await clsRes.json()) as { id: string };

		// Add 4 sessions: too old (-10 days), eligible (-1 day & today), future (+10 days)
		for (const date of [
			"2026-11-08",
			"2026-11-17",
			"2026-11-18",
			"2026-11-28",
		]) {
			const addRes = await app.request(`/api/classes/${classId}/sessions`, {
				method: "POST",
				headers: TEACHER_HEADERS,
				body: JSON.stringify({
					date,
					time: "10:00",
					dur: 60,
					topic: "Window",
					zoom: `https://zoom.us/${date}`,
				}),
			});
			expect(addRes.status).toBe(201);
			await db.insert(schema.classSessionMeeting).values({
				id: `m-${date}`,
				orgId: "org-1",
				classId,
				date,
				meetUrl: `https://meet.google.com/win-${date}`,
				googleMeetCode: `win-${date}`,
				googleOwnerUserId: "t-1",
				recordingUrl: "",
				recordingStatus: "pending",
			});
		}

		let resolveCalls = 0;
		const cronErrRes = await runRecordingSyncCron({
			db,
			now: () => new Date("2026-11-18T05:00:00Z"),
			getGoogleWorkspaceClient: () => {
				resolveCalls += 1;
				throw new Error("REVOKED");
			},
		});

		expect(cronErrRes.checked).toBe(2);
		expect(cronErrRes.failed).toBe(2);
		// Resolved once per teacher instead of once per meeting row
		expect(resolveCalls).toBe(1);
	});
});
