import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { StudentAuthShell } from "@/components/auth/auth-shell";
import { type AuthMode, AuthTabs } from "@/components/auth/auth-tabs";
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
		<StudentAuthShell formLabel="Đăng nhập tài khoản">
			<div className="grid gap-2 text-center">
				<h1 className="font-bold text-2xl">
					{mode === "signin" ? "Chào mừng trở lại" : "Tạo tài khoản học viên"}
				</h1>
				<p className="text-balance text-muted-foreground text-sm">
					{mode === "signin"
						? "Đăng nhập để xem lịch học và bài tập của bạn."
						: "Đăng ký tài khoản học viên nhanh chóng."}
				</p>
			</div>

			<AuthTabs mode={mode} onChange={changeMode} disabled={anySubmitting} />

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
			<SignUpForm
				hidden={mode !== "signup"}
				onSubmittingChange={setAnySubmitting}
			/>

			<p className="text-center text-muted-foreground text-sm">
				{mode === "signin" ? "Chưa có tài khoản?" : "Đã có tài khoản?"}{" "}
				<button
					type="button"
					disabled={anySubmitting}
					onClick={() => changeMode(mode === "signin" ? "signup" : "signin")}
					className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
				>
					{mode === "signin" ? "Tạo tài khoản" : "Đăng nhập"}
				</button>
			</p>
		</StudentAuthShell>
	);
}
