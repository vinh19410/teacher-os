import { createFileRoute, isRedirect, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { type AuthSessionResult, authClient } from "@/lib/auth-client";

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
					("to" in error || "isRedirect" in error))
			) {
				throw error;
			}
			throw redirect({
				to: "/login",
				search: { returnUrl: location.href },
			});
		}

		if (!session?.data) {
			// Carry the current location so a re-auth lands the teacher back
			// where they were — same contract as the provider's 401 redirect.
			// `location.href` is the full path incl. search + hash (no origin).
			// Do NOT template the parsed search object here — it serializes to
			// "[object Object]" and breaks the return URL.
			throw redirect({
				to: "/login",
				search: { returnUrl: location.href },
			});
		}
		return { session };
	},
});

function AuthLayout() {
	return <AppShell />;
}
