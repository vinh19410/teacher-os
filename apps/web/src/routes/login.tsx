import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { WebAuthShell } from "@/components/auth/auth-shell";
import { type AuthMode, AuthTabs } from "@/components/auth/auth-tabs";
import GoogleOAuthButton from "@/components/google-oauth-button";
import Loader from "@/components/loader";
import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import { authClient } from "@/lib/auth-client";
import { TEACHER_SIGNUP_ENABLED } from "@/lib/features";

const TAB_STORAGE_KEY = "teacher-os-auth-tab";

export const Route = createFileRoute("/login")({
	// Raw passthrough: the consumers validate before use (validateReturnUrl)
	// so an attacker-supplied `?returnUrl=` can never become an open redirect.
	// error/error_description come back from the OAuth error callback when a
	// sign-in is rejected (e.g. plan #260 role mismatch).
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
		// Single-org (#539): khi cờ tắt, chỉ còn đăng nhập — bỏ qua cả lựa chọn
		// "signup" cũ trong localStorage để không kẹt ở chế độ không tồn tại.
		if (!TEACHER_SIGNUP_ENABLED) return "signin";
		try {
			const stored = localStorage.getItem(TAB_STORAGE_KEY);
			return stored === "signin" || stored === "signup" ? stored : "signup";
		} catch {
			return "signup";
		}
	});
	const [anySubmitting, setAnySubmitting] = useState(false);
	const { isPending } = authClient.useSession();

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
			// Blocked storage (private mode): the tab choice just won't persist.
		}
	};

	if (isPending) {
		return <Loader />;
	}

	return (
		<WebAuthShell formLabel="Account access">
			<div className="grid gap-2 text-center">
				<h1 className="font-bold text-2xl">
					{mode === "signin" ? "Welcome back" : "Create your account"}
				</h1>
				<p className="text-balance text-muted-foreground text-sm">
					{mode === "signin"
						? "Sign in to open your workspace."
						: "Set up your teacher workspace in a minute."}
				</p>
			</div>

			{TEACHER_SIGNUP_ENABLED && (
				<AuthTabs mode={mode} onChange={changeMode} disabled={anySubmitting} />
			)}

			<div
				aria-hidden="true"
				className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t"
			>
				<span className="relative z-10 bg-background px-2 text-muted-foreground">
					Hoặc tiếp tục với
				</span>
			</div>

			<GoogleOAuthButton />

			<SignInForm
				hidden={mode !== "signin"}
				onSubmittingChange={setAnySubmitting}
			/>
			{TEACHER_SIGNUP_ENABLED && (
				<SignUpForm
					hidden={mode !== "signup"}
					onSubmittingChange={setAnySubmitting}
				/>
			)}

			{TEACHER_SIGNUP_ENABLED && (
				<p className="text-center text-muted-foreground text-sm">
					{mode === "signin"
						? "New to Cô Mỹ Dạy Tiếng Anh?"
						: "Already have an account?"}{" "}
					<button
						type="button"
						disabled={anySubmitting}
						onClick={() => changeMode(mode === "signin" ? "signup" : "signin")}
						className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
					>
						{mode === "signin" ? "Create an account" : "Sign in"}
					</button>
				</p>
			)}
		</WebAuthShell>
	);
}
