import type { Mailer } from "@teacher-os/auth/mail/mailer";
import type { Db } from "../app";
import {
	DAILY_DEADLINE_REMINDER_CRON,
	runDailyDeadlineReminderCron,
	ZOOM_RECORDING_SYNC_CRON,
} from "./notifications/daily-deadline-reminder";
import { resolveMailer } from "./notifications/emit";
import { runRecordingSyncCron } from "./zoom/session-zoom-service";
import type { ZoomConfig } from "./zoom/zoom-client";

export interface ScheduledControllerLike {
	cron: string;
	scheduledTime?: number;
}

export interface ScheduledDispatchDeps {
	db: Db;
	zoom: ZoomConfig;
	getMailer: () => Mailer | undefined;
	studentOrigin?: string;
	now?: () => Date;
	retryDelaysMs?: number[];
	sendIntervalMs?: number;
	runZoomSync?: typeof runRecordingSyncCron;
	runDailyReminder?: typeof runDailyDeadlineReminderCron;
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

/**
 * Điều phối Cloudflare Cron Triggers theo `controller.cron`:
 * - `"*\/10 * * * *"` (trigger duy nhất trên Worker để giữ dưới giới hạn 5 cron của
 *   Cloudflare Workers Free): luôn chạy đồng bộ cloud recording Zoom, và khi
 *   thời điểm thuộc cửa sổ 23:00–23:09 UTC (06:00 VN) thì chạy thêm nhắc hạn
 *   bài tập hằng ngày (cô lập lỗi giữa hai tác vụ).
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
		let zoomError: unknown;
		try {
			await runZoomSync({
				db: deps.db,
				zoom: deps.zoom,
				...(deps.now ? { now: deps.now } : {}),
			});
		} catch (error) {
			zoomError = error;
			console.error("[cron] Zoom recording sync failed:", error);
		}

		if (isDailyDeadlineReminderWindow(now())) {
			await executeDailyReminder(controller, deps);
		}

		if (zoomError !== undefined) {
			throw zoomError;
		}
		return;
	}

	console.warn(
		"[cron] unrecognized schedule expression: %s — skipping",
		controller.cron,
	);
}
