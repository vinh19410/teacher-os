import { createFileRoute, isRedirect, redirect } from "@tanstack/react-router";
import { resolveUserRole, roleHomePath } from "@teacher-os/auth/role";
import { AppShell } from "@/components/layout/app-shell";
import { type AuthSessionResult, authClient } from "@/lib/auth-client";
import { toTeacherReturnUrl } from "@/lib/kernel-load-state";

export { toTeacherReturnUrl };

function loginRedirectHref(locationHref: string): string {
	return `/login?returnUrl=${encodeURIComponent(toTeacherReturnUrl(locationHref))}`;
}

export const Route = createFileRoute("/_auth")({
	component: AuthLayout,
	beforeLoad: async ({ location }) => {
		let session: AuthSessionResult;
		try {
			session = await (typeof authClient.getCachedSession === "function"
				? authClient.getCachedSession()
				: authClient.getSession());
		} catch (error) {
			if (
				(typeof isRedirect === "function" && isRedirect(error)) ||
				(typeof error === "object" &&
					error !== null &&
					("to" in error || "href" in error || "isRedirect" in error))
			) {
				throw error;
			}
			throw redirect({
				href: loginRedirectHref(location.href),
				reloadDocument: true,
			});
		}

		if (!session?.data) {
			// Carry the current location with `/teacher` prefix so a re-auth on root
			// `/login` lands the teacher back where they were. `location.href` is
			// the full path incl. search + hash (no origin, stripped of basepath).
			throw redirect({
				href: loginRedirectHref(location.href),
				reloadDocument: true,
			});
		}

		// Cross-role auto-redirect: giữ nguyên cookie session (không gọi signOut)
		// và chuyển sang đúng cổng (`/student` hoặc `/admin`).
		const role = (session.data.user as { role?: string | null } | undefined)
			?.role;
		if (role && resolveUserRole(role) !== "teacher") {
			throw redirect({
				href: roleHomePath(role),
				reloadDocument: true,
			});
		}

		return { session };
	},
});

function AuthLayout() {
	return <AppShell />;
}
