import { createFileRoute, redirect } from "@tanstack/react-router";
import { AdminShell } from "@/components/layout/admin-shell";
import { type AdminMe, apiJson } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { adminGateErrorCode } from "@/lib/auth-error";

export interface AdminRouteContext {
	admin: AdminMe;
}

/**
 * Guard _auth admin: kiểm session better-auth rồi xác minh quyền qua
 * `GET /api/admin/me` (requireAdmin — role admin + email đã verify + nằm
 * trong ADMIN_EMAILS). 401/403 → về /login kèm `?error=<mã gate>` và
 * `?gateStatus=<HTTP status>` để login hiển thị đúng thông báo
 * (mapping tại `lib/auth-error.ts`, unit test `auth-error.test.ts`).
 */
export const Route = createFileRoute("/_auth")({
	component: AuthLayout,
	beforeLoad: async ({ location }) => {
		const session = await authClient.getSession();
		if (!session.data) {
			throw redirect({
				to: "/login",
				search: { returnUrl: location.href },
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
			throw redirect({
				to: "/login",
				search: {
					returnUrl: location.href,
					error: adminGateErrorCode(status, code),
					gateStatus: status || undefined,
				},
			});
		}
		return { admin };
	},
});

function AuthLayout() {
	return <AdminShell />;
}
