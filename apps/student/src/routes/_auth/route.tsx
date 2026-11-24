import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { roleHomePath } from "@teacher-os/auth/role";
import {
	authClient,
	getSessionUserRole,
	isStudentSession,
} from "@/lib/auth-client";
import { syncStudentSessionUser } from "@/lib/query-client";
import { toStudentReturnUrl } from "@/lib/validate-return-url";

export { toStudentReturnUrl };

export const Route = createFileRoute("/_auth")({
	component: AuthLayout,
	beforeLoad: async ({ location }) => {
		let session: Awaited<ReturnType<typeof authClient.getCachedSession>> | null;
		try {
			session = await authClient.getCachedSession();
		} catch {
			session = null;
		}
		if (!session?.data) {
			syncStudentSessionUser(null);
			authClient.clearSessionCache?.();
			throw redirect({
				href: `/login?returnUrl=${encodeURIComponent(toStudentReturnUrl(location.href))}`,
				reloadDocument: true,
			});
		}
		if (!isStudentSession(session.data)) {
			const role = getSessionUserRole(session.data);
			syncStudentSessionUser(null);
			authClient.clearSessionCache?.();
			throw redirect({
				href: role ? roleHomePath(role) : "/login",
				reloadDocument: true,
			});
		}
		if (session.data.user?.id) {
			syncStudentSessionUser(session.data.user.id);
		}
		return { session };
	},
});

function AuthLayout() {
	return <Outlet />;
}
