import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { syncStudentSessionUser } from "@/lib/query-client";

export const Route = createFileRoute("/_auth")({
	component: AuthLayout,
	beforeLoad: async ({ location }) => {
		const session = await authClient.getSession();
		if (!session.data) {
			syncStudentSessionUser(null);
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
