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
 * Điều phối Cloudflare Cron Triggers theo đúng biểu thức `controller.cron`:
 * - `"0 23 * * *"` (06:00 sáng giờ VN) → chỉ chạy nhắc hạn bài tập hằng ngày.
 * - `"*\/10 * * * *"` → chỉ chạy đồng bộ cloud recording Zoom.
 * - Biểu thức lạ → ghi cảnh báo, không ném lỗi và không chạy nhầm job nào.
 */
export async function dispatchScheduledCron(
	controller: ScheduledControllerLike,
	deps: ScheduledDispatchDeps,
): Promise<void> {
	if (controller.cron === DAILY_DEADLINE_REMINDER_CRON) {
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
		return;
	}

	if (controller.cron === ZOOM_RECORDING_SYNC_CRON) {
		const runZoomSync = deps.runZoomSync ?? runRecordingSyncCron;
		await runZoomSync({
			db: deps.db,
			zoom: deps.zoom,
			...(deps.now ? { now: deps.now } : {}),
		});
		return;
	}

	console.warn(
		"[cron] unrecognized schedule expression: %s — skipping",
		controller.cron,
	);
}
