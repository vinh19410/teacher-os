import { ACCOUNT_ERROR_CODES } from "@teacher-os/api/contracts";
import type { Context } from "hono";
import type { SessionUser } from "../session";

/** Env của router admin (phase 3 sẽ mở rộng Variables khi cần). */
export type AdminEnv = {
	Variables: Record<string, never>;
};

/**
 * Admin gate (plan #413 phase 1): request phải mang session role `admin`,
 * email đã verify, và email nằm trong ADMIN_EMAILS. Allowlist được so khớp
 * lowercase và kiểm lại MỖI request — người vận hành gỡ một email khỏi
 * ADMIN_EMAILS là mất quyền ngay, không cần đợi session hết hạn.
 */
export interface RequireAdminDeps {
	getSessionUser(headers: Headers): Promise<SessionUser | null>;
	/** Danh sách email admin (binding ADMIN_EMAILS đã parse; so khớp lowercase). */
	adminEmails: string[];
}

export function createRequireAdmin(
	deps: RequireAdminDeps,
): (
	c: Context<AdminEnv>,
	next: () => Promise<void>,
) => Promise<Response | void> {
	return async (c, next) => {
		const session = await deps.getSessionUser(c.req.raw.headers);
		if (!session) {
			return c.json({ error: "unauthorized" }, 401);
		}
		const email = session.email?.trim().toLowerCase();
		const allowed =
			session.role === "admin" &&
			session.emailVerified === true &&
			Boolean(email) &&
			deps.adminEmails.some((e) => e.trim().toLowerCase() === email);
		if (!allowed) {
			return c.json(
				{
					error: ACCOUNT_ERROR_CODES.NOT_ADMIN,
					code: ACCOUNT_ERROR_CODES.NOT_ADMIN,
				},
				403,
			);
		}
		return next();
	};
}
