import { ACCOUNT_ERROR_CODES } from "@teacher-os/api/contracts";
import { type Context, Hono } from "hono";
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

/**
 * `GET /api/admin/me` (plan #413): identity tối thiểu `{email, name}` sau
 * khi đã qua admin gate — guard `_auth` của console dùng nó để quyết định
 * cho vào shell hay đẩy về `/login?error=<mã gate>`. Gate dùng chung
 * `createRequireAdmin` nên 401/403 mang đúng shape mà `lib/auth-error.ts`
 * của apps/admin map (`ACCOUNT_NOT_ADMIN`…).
 */
export function createAdminMeRoutes(deps: RequireAdminDeps) {
	const router = new Hono<AdminEnv>();
	router.use("*", createRequireAdmin(deps));
	router.get("/me", async (c) => {
		const session = await deps.getSessionUser(c.req.raw.headers);
		return c.json({
			email: session?.email ?? "",
			name: session?.userName ?? "",
		});
	});
	return router;
}
