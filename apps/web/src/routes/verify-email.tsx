import { createFileRoute } from "@tanstack/react-router";

import { WebAuthShell } from "@/components/auth/auth-shell";
import VerifyEmailView from "@/components/verify-email-view";

export const Route = createFileRoute("/verify-email")({
	// The callbackURL marker (?verified=ok) plus better-auth's error param are
	// the only search values this public page reads; everything else is
	// dropped so a crafted link can't smuggle state through.
	validateSearch: (
		search: Record<string, unknown>,
	): { verified?: string; error?: string } => ({
		verified: typeof search.verified === "string" ? search.verified : undefined,
		error: typeof search.error === "string" ? search.error : undefined,
	}),
	component: RouteComponent,
});

function RouteComponent() {
	const { verified, error } = Route.useSearch();

	return (
		<WebAuthShell formLabel="Verify your email">
			<div className="grid gap-2 text-center">
				<h1 className="font-bold text-2xl">Verify your email</h1>
				<p className="text-balance text-muted-foreground text-sm">
					Confirming your email address for Teacher OS.
				</p>
			</div>

			<VerifyEmailView verified={verified} error={error} />
		</WebAuthShell>
	);
}
