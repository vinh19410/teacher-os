import type { Mailer } from "@teacher-os/auth/mail/mailer";
import type { Db } from "../../app";
import { deliverNotifications } from "./deliver";
import { enqueueNotifications } from "./enqueue";
import type { NotificationEvent } from "./templates";

/** Deps tối thiểu để phát thông báo — route không cần biết chi tiết (D4/D6). */
export interface NotificationDeps {
	db: Db;
	mailer?: Mailer;
	/** Production truyền `waitUntil`; vắng mặt (test node) → await trực tiếp (fail-open). */
	runInBackground?(promise: Promise<unknown>): void;
	/**
	 * Origin cổng học viên cho link tuyệt đối trong thư (#454). Vắng mặt →
	 * link tương đối (test node). `env.STUDENT_ORIGINS` là chuỗi thô nên do
	 * caller parse (`parseCORSOrigins(...)[0]`), deliver không tự đọc env.
	 */
	studentOrigin?: string;
	/** TOS-22 (#463) D6: khoảng chờ giữa các lượt thử gửi lại (chỉ test/E2E truyền [0, 0]). */
	retryDelaysMs?: number[];
}

/**
 * Chọn đúng các dep thông báo từ AppDeps/route-deps (#454, #463): dùng ở mọi
 * callsite `emitNotifications` để `studentOrigin` và `retryDelaysMs` không bị
 * bỏ sót khi route tự dựng object deps.
 */
export function notificationDepsFrom(deps: {
	getDb(): Db;
	mailer?: Mailer;
	runInBackground?(promise: Promise<unknown>): void;
	studentOrigin?: string;
	notificationRetryDelaysMs?: number[];
}): NotificationDeps {
	return {
		db: deps.getDb(),
		mailer: deps.mailer,
		runInBackground: deps.runInBackground,
		studentOrigin: deps.studentOrigin,
		retryDelaysMs: deps.notificationRetryDelaysMs,
	};
}

/**
 * Phát sự kiện sau khi nghiệp vụ chính thành công: enqueue trong try/catch
 * (lỗi thông báo KHÔNG làm hỏng thao tác gốc), deliver qua runInBackground
 * khi có, không thì await (D4).
 */
export async function emitNotifications(
	deps: NotificationDeps,
	orgId: string,
	events: NotificationEvent[],
): Promise<void> {
	try {
		const { createdIds } = await enqueueNotifications(deps.db, orgId, events);
		const delivery = deliverNotifications(
			deps.db,
			deps.mailer,
			createdIds,
			deps.studentOrigin,
			deps.retryDelaysMs ? { retryDelaysMs: deps.retryDelaysMs } : undefined,
		);
		if (deps.runInBackground) {
			deps.runInBackground(delivery);
		} else {
			await delivery;
		}
	} catch (error) {
		console.error(
			"[notifications] emit failed (business op unaffected)",
			error,
		);
	}
}
