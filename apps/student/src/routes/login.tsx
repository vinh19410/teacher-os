import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { type AuthMode, AuthTabs } from "@/components/auth/auth-tabs";
import BrandPanel from "@/components/auth/brand-panel";
import { GoogleOAuthButton } from "@/components/auth/google-oauth-button";
import { SignInForm } from "@/components/auth/sign-in-form";
import { SignUpForm } from "@/components/auth/sign-up-form";
import Loader from "@/components/loader";
import { authClient } from "@/lib/auth-client";
import { validateReturnUrl } from "@/lib/validate-return-url";

const TAB_STORAGE_KEY = "teacher-os-student-auth-tab";

export const Route = createFileRoute("/login")({
	validateSearch: (
		search: Record<string, unknown>,
	): { returnUrl?: string; error?: string; error_description?: string } => ({
		returnUrl:
			typeof search.returnUrl === "string" ? search.returnUrl : undefined,
		error: typeof search.error === "string" ? search.error : undefined,
		error_description:
			typeof search.error_description === "string"
				? search.error_description
				: undefined,
	}),
	component: RouteComponent,
});

function RouteComponent() {
	const navigate = Route.useNavigate();
	const { returnUrl, error, error_description } = Route.useSearch();
	const [mode, setMode] = useState<AuthMode>(() => {
		try {
			const saved = localStorage.getItem(TAB_STORAGE_KEY);
			return saved === "signup" ? "signup" : "signin";
		} catch {
			return "signin";
		}
	});
	const [anySubmitting, setAnySubmitting] = useState(false);
	const { data: session, isPending } = authClient.useSession();

	useEffect(() => {
		if (session?.user) {
			void navigate({ to: validateReturnUrl(returnUrl) });
		}
	}, [session, returnUrl, navigate]);

	useEffect(() => {
		if (!error) return;
		// Only trusted error codes surface their server-provided description;
		// a hand-crafted ?error_description= link must not control toast text.
		toast.error(
			error === "ROLE_MISMATCH"
				? error_description || "Đăng nhập Google thất bại. Vui lòng thử lại."
				: "Đăng nhập Google thất bại. Vui lòng thử lại.",
		);
		void navigate({ search: { returnUrl }, replace: true });
	}, [error, error_description, returnUrl, navigate]);

	const changeMode = (next: AuthMode) => {
		setMode(next);
		try {
			localStorage.setItem(TAB_STORAGE_KEY, next);
		} catch {
			// Private browsing storage fallback
		}
	};

	if (isPending) {
		return <Loader />;
	}

	return (
		<main className="grid min-h-[100svh] grid-cols-[minmax(460px,1.12fr)_minmax(420px,1fr)] max-[960px]:grid-cols-1">
			<BrandPanel />
			<section
				aria-label="Đăng nhập tài khoản"
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
							Teacher OS · Học viên
						</span>
					</div>

					<h2 className="font-[620] font-display text-[28px] leading-[1.15] tracking-[-0.015em] max-[420px]:text-[24px]">
						{mode === "signin" ? "Chào mừng trở lại" : "Tạo tài khoản học viên"}
					</h2>
					<p className="mt-2 text-muted-fg text-sm">
						{mode === "signin"
							? "Đăng nhập để xem lịch học và bài tập của bạn."
							: "Đăng ký tài khoản học viên nhanh chóng."}
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
						<span>hoặc dùng email</span>
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
						{mode === "signin" ? "Chưa có tài khoản?" : "Đã có tài khoản?"}{" "}
						<button
							type="button"
							disabled={anySubmitting}
							onClick={() =>
								changeMode(mode === "signin" ? "signup" : "signin")
							}
							className="-mx-2 rounded-[4px] px-2 py-[6px] font-[590] text-hot text-sm underline-offset-[3px] transition-colors duration-[150ms] hover:text-accent-active hover:underline focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
						>
							{mode === "signin" ? "Tạo tài khoản" : "Đăng nhập"}
						</button>
					</p>
				</div>
			</section>
		</main>
	);
}
