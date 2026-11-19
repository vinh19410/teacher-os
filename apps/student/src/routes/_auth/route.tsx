import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authClient, isStudentSession } from "@/lib/auth-client";
import { syncStudentSessionUser } from "@/lib/query-client";

export const Route = createFileRoute("/_auth")({
	component: AuthLayout,
	beforeLoad: async ({ location }) => {
		const session = await authClient.getCachedSession();
		if (!session.data || !isStudentSession(session.data)) {
			syncStudentSessionUser(null);
			authClient.clearSessionCache?.();
			throw redirect({
				to: "/login",
				search: { returnUrl: location.href },
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
