import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { roleHomePath } from "@teacher-os/auth/role";
import {
	authClient,
	getSessionUserRole,
	isStudentSession,
} from "@/lib/auth-client";
import {
	clearStudentQueryCacheIfUserChanged,
	syncStudentSessionUser,
} from "@/lib/query-client";
import { toStudentReturnUrl } from "@/lib/validate-return-url";

export { toStudentReturnUrl };

export const Route = createFileRoute("/_auth")({
	component: AuthLayout,
	beforeLoad: async ({ location, preload }) => {
		const isPreload = Boolean(preload);
		let session: Awaited<ReturnType<typeof authClient.getCachedSession>> | null;
		try {
			session = await authClient.getCachedSession({ allowStale: isPreload });
		} catch {
			session = null;
		}
		if (!session?.data) {
			if (!isPreload) {
				syncStudentSessionUser(null);
				authClient.clearSessionCache?.();
			}
			throw redirect({
				href: `/login?returnUrl=${encodeURIComponent(toStudentReturnUrl(location.href))}`,
				reloadDocument: true,
			});
		}
		if (!isStudentSession(session.data)) {
			const role = getSessionUserRole(session.data);
			// Luôn xoá cache phiên sai vai trò (kể cả khi preload) để tránh giữ nhầm
			// phiên giáo viên/admin trong cổng học viên; chỉ dọn QueryClient/storage
			// cục bộ khi là điều hướng thật.
			authClient.clearSessionCache?.();
			if (!isPreload) {
				syncStudentSessionUser(null);
			}
			throw redirect({
				href: role ? roleHomePath(role) : "/login",
				reloadDocument: true,
			});
		}
		if (session.data.user?.id) {
			if (isPreload) {
				clearStudentQueryCacheIfUserChanged(session.data.user.id);
			} else {
				syncStudentSessionUser(session.data.user.id);
			}
		}
		return { session };
	},
});

function AuthLayout() {
	return <Outlet />;
}
