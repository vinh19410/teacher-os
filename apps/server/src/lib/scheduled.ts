import type { Mailer } from "@teacher-os/auth/mail/mailer";
import type { Db } from "../app";
import {
	DAILY_DEADLINE_REMINDER_CRON,
	runDailyDeadlineReminderCron,
	ZOOM_RECORDING_SYNC_CRON,
} from "./notifications/daily-deadline-reminder";
import { resolveMailer } from "./notifications/emit";
import { runSessionLinkReminderCron } from "./notifications/session-link-reminder";
import type { RecordingStore } from "./recording-store";
import { runRecordingSyncCron } from "./zoom/session-zoom-service";
import type { ZoomConfig } from "./zoom/zoom-client";

export interface ScheduledControllerLike {
	cron: string;
	scheduledTime?: number;
}

export interface ScheduledDispatchDeps {
	db: Db;
	zoom: ZoomConfig;
	getRecordingStore?: () => RecordingStore | undefined;
	getMailer: () => Mailer | undefined;
	studentOrigin?: string;
	now?: () => Date;
	retryDelaysMs?: number[];
	sendIntervalMs?: number;
	runZoomSync?: typeof runRecordingSyncCron;
	runDailyReminder?: typeof runDailyDeadlineReminderCron;
	runSessionLinkReminder?: typeof runSessionLinkReminderCron;
}

/**
 * Cửa sổ 23:00–23:09 UTC = 06:00–06:09 sáng giờ Việt Nam (UTC+7): đúng tick
 * đầu tiên trong giờ 06:00 VN của lịch 10 phút (`*\/10 * * * *`). Bản ghi thông báo có
 * idempotencyKey theo ngày nên retry trong cùng cửa sổ cũng không gửi trùng.
 */
export function isDailyDeadlineReminderWindow(date: Date): boolean {
	return date.getUTCHours() === 23 && date.getUTCMinutes() < 10;
}

async function executeDailyReminder(
	controller: ScheduledControllerLike,
	deps: ScheduledDispatchDeps,
): Promise<void> {
	const runDailyReminder =
		deps.runDailyReminder ?? runDailyDeadlineReminderCron;
	const mailer = resolveMailer({
		get mailer() {
			return deps.getMailer();
		},
	});
	const now =
		deps.now ?? (() => new Date(controller.scheduledTime ?? Date.now()));
	await runDailyReminder({
		db: deps.db,
		mailer,
		studentOrigin: deps.studentOrigin,
		now,
		retryDelaysMs: deps.retryDelaysMs,
		sendIntervalMs: deps.sendIntervalMs,
	});
}

async function executeSessionLinkReminder(
	controller: ScheduledControllerLike,
	deps: ScheduledDispatchDeps,
): Promise<void> {
	const runSessionLinkReminder =
		deps.runSessionLinkReminder ?? runSessionLinkReminderCron;
	const now =
		deps.now ?? (() => new Date(controller.scheduledTime ?? Date.now()));
	await runSessionLinkReminder({
		db: deps.db,
		getMailer: () =>
			resolveMailer({
				get mailer() {
					return deps.getMailer();
				},
			}),
		studentOrigin: deps.studentOrigin,
		now,
		retryDelaysMs: deps.retryDelaysMs,
		sendIntervalMs: deps.sendIntervalMs,
	});
}

/**
 * Điều phối Cloudflare Cron Triggers theo `controller.cron`:
 * - `"*\/10 * * * *"` (trigger duy nhất trên Worker để giữ dưới giới hạn 5 cron của
 *   Cloudflare Workers Free):
 *   1. Khi thời điểm thuộc cửa sổ 23:00–23:09 UTC (06:00 VN), chạy nhắc hạn bài tập hằng ngày.
 *   2. Luôn chạy nhắc link buổi học Online trước 2 tiếng (`runSessionLinkReminderCron`).
 *   3. Luôn chạy đồng bộ cloud recording Zoom (`runRecordingSyncCron`) sau cùng để
 *      việc tải video nặng không làm gián đoạn các email đúng giờ (cô lập lỗi giữa 3 tác vụ).
 * - `"0 23 * * *"` → giữ nhánh tương thích cho gọi thủ công/test.
 * - Biểu thức lạ → ghi cảnh báo, không ném lỗi và không chạy nhầm job nào.
 */
export async function dispatchScheduledCron(
	controller: ScheduledControllerLike,
	deps: ScheduledDispatchDeps,
): Promise<void> {
	if (controller.cron === DAILY_DEADLINE_REMINDER_CRON) {
		await executeDailyReminder(controller, deps);
		return;
	}

	if (controller.cron === ZOOM_RECORDING_SYNC_CRON) {
		const now =
			deps.now ?? (() => new Date(controller.scheduledTime ?? Date.now()));
		const runZoomSync = deps.runZoomSync ?? runRecordingSyncCron;
		const recordingStore = deps.getRecordingStore?.();
		// Các tác vụ email chạy TRƯỚC: việc tải video recording có thể khiến
		// runtime huỷ cả lượt chạy (không bắt được bằng try/catch).
		let firstError: unknown;
		if (isDailyDeadlineReminderWindow(now())) {
			try {
				await executeDailyReminder(controller, deps);
			} catch (error) {
				firstError ??= error;
				console.error("[cron] daily deadline reminder failed:", error);
			}
		}

		try {
			await executeSessionLinkReminder(controller, deps);
		} catch (error) {
			firstError ??= error;
			console.error("[cron] session link reminder failed:", error);
		}

		try {
			await runZoomSync({
				db: deps.db,
				zoom: deps.zoom,
				...(recordingStore ? { recordingStore } : {}),
				...(deps.now ? { now: deps.now } : {}),
			});
		} catch (error) {
			firstError ??= error;
			console.error("[cron] Zoom recording sync failed:", error);
		}

		if (firstError !== undefined) {
			throw firstError;
		}
		return;
	}

	console.warn(
		"[cron] unrecognized schedule expression: %s — skipping",
		controller.cron,
	);
}
