import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import BrandPanel from "@/components/auth/brand-panel";
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
		<main className="grid min-h-[100svh] grid-cols-[minmax(460px,1.12fr)_minmax(420px,1fr)] max-[960px]:grid-cols-1">
			<BrandPanel />
			<section
				aria-label="Choose a new password"
				className="flex items-center justify-center px-[clamp(20px,3vw,48px)] py-[clamp(28px,4vh,56px)] max-[960px]:items-start max-[420px]:px-4 max-[420px]:pt-6 max-[420px]:pb-10"
			>
				<div className="fade-in slide-in-from-bottom-2 w-full max-w-[420px] animate-in duration-[220ms] ease-[cubic-bezier(0.28,0,0.22,1)] motion-reduce:animate-none">
					<h2 className="font-[620] font-display text-[28px] leading-[1.15] tracking-[-0.015em] max-[420px]:text-[24px]">
						Choose a new password
					</h2>
					<p className="mt-2 mb-[26px] text-muted-fg text-sm">
						Use at least 8 characters.
					</p>

					<ResetPasswordForm token={capturedToken} />
				</div>
			</section>
		</main>
	);
}
