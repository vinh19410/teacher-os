import { createFileRoute, Link } from "@tanstack/react-router";

import { WebAuthShell } from "@/components/auth/auth-shell";
import ForgotPasswordForm from "@/components/auth/forgot-password-form";

export const Route = createFileRoute("/forgot-password")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<WebAuthShell formLabel="Reset your password">
			<div className="grid gap-2 text-center">
				<h1 className="font-bold text-2xl">Forgot your password?</h1>
				<p className="text-balance text-muted-foreground text-sm">
					Enter your email and we'll send you a link to choose a new one.
				</p>
			</div>

			<ForgotPasswordForm />

			<p className="text-center text-muted-foreground text-sm">
				<Link
					to="/login"
					className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
				>
					Back to sign in
				</Link>
			</p>
		</WebAuthShell>
	);
}
