import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { WebAuthShell } from "@/components/auth/auth-shell";
import ResetPasswordForm from "@/components/auth/reset-password-form";

export const Route = createFileRoute("/reset-password")({
	// Only token/error survive, and only as strings; every other key is
	// dropped. This route is public and deliberately session-independent: a
	// signed-in user opening a reset link must still see the form.
	validateSearch: (
		search: Record<string, unknown>,
	): { token?: string; error?: string } => ({
		token: typeof search.token === "string" ? search.token : undefined,
		error: typeof search.error === "string" ? search.error : undefined,
	}),
	component: RouteComponent,
});

function RouteComponent() {
	const navigate = Route.useNavigate();
	const { token, error } = Route.useSearch();
	// Captured once from the first render so the token can leave the URL.
	const [capturedToken] = useState(() => (error ? undefined : token));

	useEffect(() => {
		if (!token && !error) return;
		// Drop token/error from the address bar and history entry.
		void navigate({ to: "/reset-password", search: {}, replace: true });
	}, [token, error, navigate]);

	return (
		<WebAuthShell formLabel="Choose a new password">
			<div className="grid gap-2 text-center">
				<h1 className="font-bold text-2xl">Choose a new password</h1>
				<p className="text-balance text-muted-foreground text-sm">
					Use at least 8 characters.
				</p>
			</div>

			<ResetPasswordForm token={capturedToken} />
		</WebAuthShell>
	);
}
