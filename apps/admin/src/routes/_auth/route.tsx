import { createFileRoute, redirect } from "@tanstack/react-router";
import {
	ROLE_HOME_PATH,
	resolveUserRole,
	roleHomePath,
} from "@teacher-os/auth/role";
import { AdminShell } from "@/components/layout/admin-shell";
import { type AdminMe, apiJson } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { adminGateErrorCode } from "@/lib/auth-error";

export interface AdminRouteContext {
	admin: AdminMe;
}

const ADMIN_BASE = ROLE_HOME_PATH.admin;

/**
 * Chuẩn hoá `location.href` (đã bị TanStack Router tách `basepath: "/admin"`)
 * thành đường dẫn bắt đầu bằng `/admin` để gửi qua `?returnUrl=` về `/login`.
 */
export function toAdminReturnUrl(href: string): string {
	if (!href || href === "/") {
		return ADMIN_BASE;
	}
	if (href.startsWith("/?") || href.startsWith("/#")) {
		return `${ADMIN_BASE}${href.slice(1)}`;
	}
	if (
		href === ADMIN_BASE ||
		href.startsWith(`${ADMIN_BASE}/`) ||
		href.startsWith(`${ADMIN_BASE}?`) ||
		href.startsWith(`${ADMIN_BASE}#`)
	) {
		return href;
	}
	if (href.startsWith("//") || href.startsWith("/\\")) {
		return ADMIN_BASE;
	}
	if (href.startsWith("/")) {
		return `${ADMIN_BASE}${href}`;
	}
	return ADMIN_BASE;
}

/**
 * Guard _auth admin:
 * 1. Chưa có session → redirect sang `/login?returnUrl=/admin...`.
 * 2. Đã đăng nhập nhưng role khác `admin` (`teacher`/`student`) → không gọi
 *    `signOut()`, tự redirect thẳng về `roleHomePath(rawRole)`.
 * 3. Xác minh cổng admin qua `GET /api/admin/me` (requireAdmin — role admin +
 *    email đã verify + nằm trong ADMIN_EMAILS):
 *    - 401: session hết hạn → redirect `/login?returnUrl=/admin...`.
 *    - 403 / lỗi gate khác: redirect `/login?blocked=1&error=<gateCode>&gateStatus=<status>`
 *      để `/login` hiện thông báo bị chặn + nút đăng xuất, chặn vòng lặp redirect.
 */
export const Route = createFileRoute("/_auth")({
	component: AuthLayout,
	beforeLoad: async ({ location }) => {
		let session: Awaited<ReturnType<typeof authClient.getSession>> | null =
			null;
		try {
			session = await authClient.getSession();
		} catch {
			session = null;
		}
		if (!session?.data) {
			throw redirect({
				href: `/login?returnUrl=${encodeURIComponent(toAdminReturnUrl(location.href))}`,
				reloadDocument: true,
			});
		}

		const rawRole = (session.data.user as { role?: string | null } | undefined)
			?.role;
		if (rawRole && resolveUserRole(rawRole) !== "admin") {
			throw redirect({
				href: roleHomePath(rawRole),
				reloadDocument: true,
			});
		}

		let admin: AdminMe;
		try {
			admin = await apiJson<AdminMe>("/api/admin/me");
		} catch (error) {
			const status =
				error &&
				typeof error === "object" &&
				"status" in error &&
				typeof error.status === "number"
					? error.status
					: 0;
			const code =
				error &&
				typeof error === "object" &&
				"code" in error &&
				typeof error.code === "string"
					? error.code
					: undefined;
			if (status === 401) {
				throw redirect({
					href: `/login?returnUrl=${encodeURIComponent(toAdminReturnUrl(location.href))}`,
					reloadDocument: true,
				});
			}
			const gateCode = adminGateErrorCode(status, code);
			const params = new URLSearchParams({
				blocked: "1",
				error: gateCode,
			});
			if (status) {
				params.set("gateStatus", String(status));
			}
			throw redirect({
				href: `/login?${params.toString()}`,
				reloadDocument: true,
			});
		}
		return { admin };
	},
});

function AuthLayout() {
	return <AdminShell />;
}
