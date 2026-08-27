import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { type AuthMode, AuthTabs } from "@/components/auth/auth-tabs";
import BrandPanel from "@/components/auth/brand-panel";
import GoogleOAuthButton from "@/components/google-oauth-button";
import Loader from "@/components/loader";
import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import { authClient } from "@/lib/auth-client";

const TAB_STORAGE_KEY = "teacher-os-auth-tab";

export const Route = createFileRoute("/login")({
	// Raw passthrough: the consumers validate before use (validateReturnUrl)
	// so an attacker-supplied `?returnUrl=` can never become an open redirect.
	validateSearch: (
		search: Record<string, unknown>,
	): { returnUrl?: string } => ({
		returnUrl:
			typeof search.returnUrl === "string" ? search.returnUrl : undefined,
	}),
	component: RouteComponent,
});

function RouteComponent() {
	const [mode, setMode] = useState<AuthMode>(() => {
		try {
			const stored = localStorage.getItem(TAB_STORAGE_KEY);
			return stored === "signin" || stored === "signup" ? stored : "signup";
		} catch {
			return "signup";
		}
	});
	const [anySubmitting, setAnySubmitting] = useState(false);
	const { isPending } = authClient.useSession();

	const changeMode = (next: AuthMode) => {
		setMode(next);
		try {
			localStorage.setItem(TAB_STORAGE_KEY, next);
		} catch {
			// Blocked storage (private mode): the tab choice just won't persist.
		}
	};

	if (isPending) {
		return <Loader />;
	}

	return (
		<main className="grid min-h-[100svh] grid-cols-[minmax(460px,1.12fr)_minmax(420px,1fr)] max-[960px]:grid-cols-1">
			<BrandPanel />
			<section
				aria-label="Account access"
				className="flex items-center justify-center px-[clamp(20px,3vw,48px)] py-[clamp(28px,4vh,56px)] max-[960px]:items-start max-[420px]:px-4 max-[420px]:pt-6 max-[420px]:pb-10"
			>
				<div className="fade-in slide-in-from-bottom-2 w-full max-w-[420px] animate-in duration-[220ms] ease-[cubic-bezier(0.28,0,0.22,1)] motion-reduce:animate-none">
					<div className="mb-[26px] hidden items-center justify-center gap-[10px] max-[960px]:flex">
						<svg
							viewBox="0 0 34 34"
							aria-hidden="true"
							className="block h-[30px] w-[30px]"
						>
							<rect width="34" height="34" rx="9" fill="var(--accent)" />
							<path
								d="M9.5 12.5c3-1.8 5-1.8 7.5 0 2.5-1.8 4.5-1.8 7.5 0M17 12.5V22"
								stroke="#ffffff"
								strokeWidth="1.9"
								strokeLinecap="round"
								fill="none"
							/>
						</svg>
						<span className="font-display font-semibold text-[17px] text-fg tracking-[-0.01em]">
							Teacher OS
						</span>
					</div>

					<h2 className="font-[620] font-display text-[28px] leading-[1.15] tracking-[-0.015em] max-[420px]:text-[24px]">
						{mode === "signin" ? "Welcome back" : "Create your account"}
					</h2>
					<p className="mt-2 text-muted-fg text-sm">
						{mode === "signin"
							? "Sign in to open your workspace."
							: "Set up your teacher workspace in a minute."}
					</p>

					<AuthTabs
						mode={mode}
						onChange={changeMode}
						disabled={anySubmitting}
					/>

					<GoogleOAuthButton />

					<div
						aria-hidden="true"
						className="my-[22px] flex items-center gap-[14px] font-[590] text-[11px] text-meta uppercase tracking-[0.09em]"
					>
						<span className="h-px flex-1 bg-line-soft" />
						<span>or use email</span>
						<span className="h-px flex-1 bg-line-soft" />
					</div>

					<SignInForm
						hidden={mode !== "signin"}
						onSubmittingChange={setAnySubmitting}
					/>
					<SignUpForm
						hidden={mode !== "signup"}
						onSubmittingChange={setAnySubmitting}
					/>

					<p className="mt-[22px] text-center text-muted-fg text-sm">
						{mode === "signin"
							? "New to Teacher OS?"
							: "Already have an account?"}{" "}
						<button
							type="button"
							disabled={anySubmitting}
							onClick={() =>
								changeMode(mode === "signin" ? "signup" : "signin")
							}
							className="-mx-2 rounded-[4px] px-2 py-[6px] font-[590] text-accent-blue text-sm underline-offset-[3px] transition-colors duration-[150ms] hover:text-accent-active hover:underline focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
						>
							{mode === "signin" ? "Create an account" : "Sign in"}
						</button>
					</p>
				</div>
			</section>
		</main>
	);
}
