import type { Mailer } from "@teacher-os/auth/mail/mailer";
import { describe, expect, test, vi } from "vitest";
import type { Db } from "../app";
import {
	DAILY_DEADLINE_REMINDER_CRON,
	type runDailyDeadlineReminderCron,
	ZOOM_RECORDING_SYNC_CRON,
} from "./notifications/daily-deadline-reminder";
import type { runSessionLinkReminderCron } from "./notifications/session-link-reminder";
import type { RecordingStore } from "./recording-store";
import {
	dispatchScheduledCron,
	isDailyDeadlineReminderWindow,
} from "./scheduled";
import type { runRecordingSyncCron } from "./zoom/session-zoom-service";

const fakeDb = {} as Db;
const fakeZoom = { accountId: "acc", clientId: "cid", clientSecret: "sec" };
const emptySyncResult = {
	checked: 0,
	updated: 0,
	failed: 0,
	expired: 0,
	trashed: 0,
};
const emptySessionLinkResult = {
	checkedAtISO: "2026-05-15T10:00:00.000Z",
	candidatesMatched: 0,
	recordsCreated: 0,
	emailsQueued: 0,
	skippedNoLink: 0,
	skippedNoEmail: 0,
	orgsProcessed: 0,
};

describe("dispatchScheduledCron", () => {
	test("routes daily deadline reminder cron exclusively to runDailyReminder with resolved mailer and scheduledTime", async () => {
		const mailer: Mailer = { send: vi.fn(async () => {}) };
		const getMailer = vi.fn(() => mailer);
		const runZoomSync = vi.fn<typeof runRecordingSyncCron>(
			async () => emptySyncResult,
		);
		const runDailyReminder = vi.fn<typeof runDailyDeadlineReminderCron>(
			async () => ({
				dateISO: "2026-05-15",
				studentsMatched: 1,
				recordsCreated: 1,
				emailsQueued: 1,
				skippedNoEmail: 0,
				orgsProcessed: 1,
			}),
		);

		const scheduledTime = Date.parse("2026-05-14T23:00:00.000Z");
		await dispatchScheduledCron(
			{ cron: DAILY_DEADLINE_REMINDER_CRON, scheduledTime },
			{
				db: fakeDb,
				zoom: fakeZoom,
				getMailer,
				studentOrigin: "https://lms.msmy.io.vn/student",
				retryDelaysMs: [0, 0],
				sendIntervalMs: 100,
				runZoomSync,
				runDailyReminder,
			},
		);

		expect(getMailer).toHaveBeenCalledTimes(1);
		expect(runZoomSync).not.toHaveBeenCalled();
		expect(runDailyReminder).toHaveBeenCalledTimes(1);

		const callArg = runDailyReminder.mock.calls[0]?.[0];
		expect(callArg?.db).toBe(fakeDb);
		expect(callArg?.mailer).toBe(mailer);
		expect(callArg?.studentOrigin).toBe("https://lms.msmy.io.vn/student");
		expect(callArg?.retryDelaysMs).toEqual([0, 0]);
		expect(callArg?.sendIntervalMs).toBe(100);
		expect(callArg?.now?.().toISOString()).toBe("2026-05-14T23:00:00.000Z");
	});

	test("handles throwing getMailer safely during daily reminder cron without aborting", async () => {
		const getMailer = vi.fn(() => {
			throw new Error("RESEND_API_KEY is required when MAILER_IMPL=resend");
		});
		const runDailyReminder = vi.fn<typeof runDailyDeadlineReminderCron>(
			async () => ({
				dateISO: "2026-05-15",
				studentsMatched: 0,
				recordsCreated: 0,
				emailsQueued: 0,
				skippedNoEmail: 0,
				orgsProcessed: 0,
			}),
		);
		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		try {
			await dispatchScheduledCron(
				{ cron: DAILY_DEADLINE_REMINDER_CRON },
				{
					db: fakeDb,
					zoom: fakeZoom,
					getMailer,
					runDailyReminder,
				},
			);
			expect(errSpy).toHaveBeenCalledTimes(1);
		} finally {
			errSpy.mockRestore();
		}

		expect(runDailyReminder).toHaveBeenCalledTimes(1);
		expect(runDailyReminder.mock.calls[0]?.[0]?.mailer).toBeUndefined();
	});

	test("routes Zoom sync cron to session link reminder then runZoomSync without touching daily reminder outside 23:00 UTC", async () => {
		const getMailer = vi.fn(() => undefined);
		const fakeRecordingStore = {} as RecordingStore;
		const order: string[] = [];
		const runZoomSync = vi.fn<typeof runRecordingSyncCron>(async () => {
			order.push("zoom");
			return {
				checked: 2,
				updated: 1,
				failed: 0,
				expired: 1,
				trashed: 1,
			};
		});
		const runSessionLinkReminder = vi.fn<typeof runSessionLinkReminderCron>(
			async () => {
				order.push("session-link");
				return emptySessionLinkResult;
			},
		);
		const runDailyReminder = vi.fn<typeof runDailyDeadlineReminderCron>(
			async () => ({
				dateISO: "2026-05-15",
				studentsMatched: 0,
				recordsCreated: 0,
				emailsQueued: 0,
				skippedNoEmail: 0,
				orgsProcessed: 0,
			}),
		);
		const nowFn = () => new Date("2026-05-15T10:00:00.000Z");

		await dispatchScheduledCron(
			{ cron: ZOOM_RECORDING_SYNC_CRON },
			{
				db: fakeDb,
				zoom: fakeZoom,
				getRecordingStore: () => fakeRecordingStore,
				getMailer,
				studentOrigin: "https://lms.msmy.io.vn/student",
				now: nowFn,
				retryDelaysMs: [0, 0],
				sendIntervalMs: 100,
				runZoomSync,
				runDailyReminder,
				runSessionLinkReminder,
			},
		);

		expect(order).toEqual(["session-link", "zoom"]);
		expect(runSessionLinkReminder).toHaveBeenCalledTimes(1);
		const linkArg = runSessionLinkReminder.mock.calls[0]?.[0];
		expect(linkArg?.db).toBe(fakeDb);
		expect(linkArg?.studentOrigin).toBe("https://lms.msmy.io.vn/student");
		expect(linkArg?.retryDelaysMs).toEqual([0, 0]);
		expect(linkArg?.sendIntervalMs).toBe(100);
		expect(linkArg?.now?.().toISOString()).toBe("2026-05-15T10:00:00.000Z");
		expect(runZoomSync).toHaveBeenCalledTimes(1);
		expect(runZoomSync).toHaveBeenCalledWith({
			db: fakeDb,
			zoom: fakeZoom,
			recordingStore: fakeRecordingStore,
			now: nowFn,
		});
		expect(runDailyReminder).not.toHaveBeenCalled();
		expect(getMailer).not.toHaveBeenCalled();
	});

	test("logs a warning and skips execution for unrecognized cron expressions", async () => {
		const getMailer = vi.fn(() => undefined);
		const runZoomSync = vi.fn<typeof runRecordingSyncCron>(
			async () => emptySyncResult,
		);
		const runDailyReminder = vi.fn<typeof runDailyDeadlineReminderCron>(
			async () => ({
				dateISO: "2026-05-15",
				studentsMatched: 0,
				recordsCreated: 0,
				emailsQueued: 0,
				skippedNoEmail: 0,
				orgsProcessed: 0,
			}),
		);
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		try {
			await expect(
				dispatchScheduledCron(
					{ cron: "0 0 * * *" },
					{
						db: fakeDb,
						zoom: fakeZoom,
						getMailer,
						runZoomSync,
						runDailyReminder,
					},
				),
			).resolves.toBeUndefined();
			expect(warnSpy).toHaveBeenCalledTimes(1);
		} finally {
			warnSpy.mockRestore();
		}

		expect(runZoomSync).not.toHaveBeenCalled();
		expect(runDailyReminder).not.toHaveBeenCalled();
		expect(getMailer).not.toHaveBeenCalled();
	});

	test("multiplexes daily deadline reminder on the 23:00 UTC (06:00 VN) tick of */10 * * * *", async () => {
		const mailer: Mailer = { send: vi.fn(async () => {}) };
		const getMailer = vi.fn(() => mailer);
		const runZoomSync = vi.fn<typeof runRecordingSyncCron>(
			async () => emptySyncResult,
		);
		const runSessionLinkReminder = vi.fn<typeof runSessionLinkReminderCron>(
			async () => emptySessionLinkResult,
		);
		const runDailyReminder = vi.fn<typeof runDailyDeadlineReminderCron>(
			async () => ({
				dateISO: "2026-05-15",
				studentsMatched: 2,
				recordsCreated: 2,
				emailsQueued: 2,
				skippedNoEmail: 0,
				orgsProcessed: 1,
			}),
		);

		const atSixAmVn = Date.parse("2026-05-14T23:00:00.000Z");
		expect(isDailyDeadlineReminderWindow(new Date(atSixAmVn))).toBe(true);
		expect(
			isDailyDeadlineReminderWindow(new Date("2026-05-14T23:10:00.000Z")),
		).toBe(false);

		await dispatchScheduledCron(
			{ cron: ZOOM_RECORDING_SYNC_CRON, scheduledTime: atSixAmVn },
			{
				db: fakeDb,
				zoom: fakeZoom,
				getMailer,
				studentOrigin: "https://lms.msmy.io.vn/student",
				retryDelaysMs: [0, 0],
				sendIntervalMs: 100,
				runZoomSync,
				runDailyReminder,
				runSessionLinkReminder,
			},
		);

		expect(runZoomSync).toHaveBeenCalledTimes(1);
		expect(runSessionLinkReminder).toHaveBeenCalledTimes(1);
		expect(runDailyReminder).toHaveBeenCalledTimes(1);
		expect(runDailyReminder.mock.calls[0]?.[0]?.now?.().toISOString()).toBe(
			"2026-05-14T23:00:00.000Z",
		);

		// At 23:10 UTC (06:10 VN), daily reminder is skipped while session-link & Zoom sync run.
		runZoomSync.mockClear();
		runDailyReminder.mockClear();
		runSessionLinkReminder.mockClear();
		getMailer.mockClear();
		await dispatchScheduledCron(
			{
				cron: ZOOM_RECORDING_SYNC_CRON,
				scheduledTime: Date.parse("2026-05-14T23:10:00.000Z"),
			},
			{
				db: fakeDb,
				zoom: fakeZoom,
				getMailer,
				runZoomSync,
				runDailyReminder,
				runSessionLinkReminder,
			},
		);
		expect(runZoomSync).toHaveBeenCalledTimes(1);
		expect(runSessionLinkReminder).toHaveBeenCalledTimes(1);
		expect(runDailyReminder).not.toHaveBeenCalled();
		expect(getMailer).not.toHaveBeenCalled();
	});

	test("still runs daily deadline reminder and session link reminder at 23:00 UTC if Zoom sync fails, then rethrows Zoom error", async () => {
		const mailer: Mailer = { send: vi.fn(async () => {}) };
		const getMailer = vi.fn(() => mailer);
		const runZoomSync = vi.fn<typeof runRecordingSyncCron>(async () => {
			throw new Error("zoom api timeout");
		});
		const runSessionLinkReminder = vi.fn<typeof runSessionLinkReminderCron>(
			async () => emptySessionLinkResult,
		);
		const runDailyReminder = vi.fn<typeof runDailyDeadlineReminderCron>(
			async () => ({
				dateISO: "2026-05-15",
				studentsMatched: 1,
				recordsCreated: 1,
				emailsQueued: 1,
				skippedNoEmail: 0,
				orgsProcessed: 1,
			}),
		);
		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		try {
			await expect(
				dispatchScheduledCron(
					{
						cron: ZOOM_RECORDING_SYNC_CRON,
						scheduledTime: Date.parse("2026-05-14T23:00:00.000Z"),
					},
					{
						db: fakeDb,
						zoom: fakeZoom,
						getMailer,
						runZoomSync,
						runDailyReminder,
						runSessionLinkReminder,
					},
				),
			).rejects.toThrow("zoom api timeout");
			expect(errSpy).toHaveBeenCalledTimes(1);
		} finally {
			errSpy.mockRestore();
		}

		expect(runDailyReminder).toHaveBeenCalledTimes(1);
		expect(runSessionLinkReminder).toHaveBeenCalledTimes(1);
	});

	test("runs daily -> session-link -> zoom in order and isolates failures across all 3 jobs", async () => {
		const order: string[] = [];
		const runZoomSync = vi.fn<typeof runRecordingSyncCron>(async () => {
			order.push("zoom");
			return emptySyncResult;
		});
		const runSessionLinkReminder = vi.fn<typeof runSessionLinkReminderCron>(
			async () => {
				order.push("session-link");
				return emptySessionLinkResult;
			},
		);
		const runDailyReminder = vi.fn<typeof runDailyDeadlineReminderCron>(
			async () => {
				order.push("reminder");
				throw new Error("reminder db error");
			},
		);
		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		try {
			await expect(
				dispatchScheduledCron(
					{
						cron: ZOOM_RECORDING_SYNC_CRON,
						scheduledTime: Date.parse("2026-05-14T23:00:00.000Z"),
					},
					{
						db: fakeDb,
						zoom: fakeZoom,
						getMailer: () => ({ send: vi.fn(async () => {}) }),
						runZoomSync,
						runDailyReminder,
						runSessionLinkReminder,
					},
				),
			).rejects.toThrow("reminder db error");
		} finally {
			errSpy.mockRestore();
		}

		expect(order).toEqual(["reminder", "session-link", "zoom"]);
	});

	test("continues Zoom sync when session link reminder fails, then rethrows session link error", async () => {
		const order: string[] = [];
		const runZoomSync = vi.fn<typeof runRecordingSyncCron>(async () => {
			order.push("zoom");
			return emptySyncResult;
		});
		const runSessionLinkReminder = vi.fn<typeof runSessionLinkReminderCron>(
			async () => {
				order.push("session-link");
				throw new Error("session link db error");
			},
		);
		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		try {
			await expect(
				dispatchScheduledCron(
					{
						cron: ZOOM_RECORDING_SYNC_CRON,
						scheduledTime: Date.parse("2026-05-15T10:00:00.000Z"),
					},
					{
						db: fakeDb,
						zoom: fakeZoom,
						getMailer: () => undefined,
						runZoomSync,
						runSessionLinkReminder,
					},
				),
			).rejects.toThrow("session link db error");
			expect(errSpy).toHaveBeenCalledTimes(1);
		} finally {
			errSpy.mockRestore();
		}

		expect(order).toEqual(["session-link", "zoom"]);
	});
});
