import { createFileRoute, Link } from "@tanstack/react-router";

import BrandPanel from "@/components/auth/brand-panel";
import ForgotPasswordForm from "@/components/auth/forgot-password-form";

export const Route = createFileRoute("/forgot-password")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<main className="grid min-h-[100svh] grid-cols-[minmax(460px,1.12fr)_minmax(420px,1fr)] max-[960px]:grid-cols-1">
			<BrandPanel />
			<section
				aria-label="Reset your password"
				className="flex items-center justify-center px-[clamp(20px,3vw,48px)] py-[clamp(28px,4vh,56px)] max-[960px]:items-start max-[420px]:px-4 max-[420px]:pt-6 max-[420px]:pb-10"
			>
				<div className="fade-in slide-in-from-bottom-2 w-full max-w-[420px] animate-in duration-[220ms] ease-[cubic-bezier(0.28,0,0.22,1)] motion-reduce:animate-none">
					<h2 className="font-[620] font-display text-[28px] leading-[1.15] tracking-[-0.015em] max-[420px]:text-[24px]">
						Forgot your password?
					</h2>
					<p className="mt-2 mb-[26px] text-muted-fg text-sm">
						Enter your email and we'll send you a link to choose a new one.
					</p>

					<ForgotPasswordForm />

					<p className="mt-[22px] text-center text-sm">
						<Link
							to="/login"
							className="-mx-2 rounded-[4px] px-2 py-[6px] font-[590] text-hot text-sm underline-offset-[3px] transition-colors duration-[150ms] hover:text-accent-active hover:underline focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
						>
							Back to sign in
						</Link>
					</p>
				</div>
			</section>
		</main>
	);
}
