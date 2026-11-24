import { createFileRoute } from "@tanstack/react-router";
import { resolvePostAuthRedirect } from "@teacher-os/auth/role";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LmsAuthShell } from "@/components/auth/auth-shell";
import { type AuthMode, AuthTabs } from "@/components/auth/auth-tabs";
import { BlockedAccountCard } from "@/components/auth/blocked-account-card";
import { GoogleOAuthButton } from "@/components/auth/google-oauth-button";
import { SignInForm } from "@/components/auth/sign-in-form";
import { SignUpForm } from "@/components/auth/sign-up-form";
import Loader from "@/components/loader";
import {
	authClient,
	getSessionUserEmail,
	getSessionUserRole,
} from "@/lib/auth-client";
import { getLoginToastErrorMessage } from "@/lib/auth-error";
import { redirectReplace } from "@/lib/navigation";

export const Route = createFileRoute("/login")({
	validateSearch: (
		search: Record<string, unknown>,
	): {
		returnUrl?: string;
		error?: string;
		error_description?: string;
		blocked?: 1;
		gateStatus?: number;
		tab?: string;
	} => ({
		returnUrl:
			typeof search.returnUrl === "string" ? search.returnUrl : undefined,
		error: typeof search.error === "string" ? search.error : undefined,
		error_description:
			typeof search.error_description === "string"
				? search.error_description
				: undefined,
		// Keeping numeric `1` lets TanStack Router serialize `?blocked=1` cleanly
		// instead of quoting string `"1"` into `?blocked=%221%22`.
		blocked:
			search.blocked === "1" || search.blocked === 1 || search.blocked === true
				? 1
				: undefined,
		gateStatus:
			typeof search.gateStatus === "number" &&
			Number.isFinite(search.gateStatus)
				? search.gateStatus
				: typeof search.gateStatus === "string" &&
						/^\d+$/.test(search.gateStatus)
					? Number(search.gateStatus)
					: undefined,
		tab:
			search.tab === "signin" || search.tab === "signup"
				? search.tab
				: undefined,
	}),
	component: LoginRoute,
});

function LoginRoute() {
	const navigate = Route.useNavigate();
	const { returnUrl, error, error_description, blocked, tab } =
		Route.useSearch();
	const [mode, setMode] = useState<AuthMode>(() =>
		tab === "signup" ? "signup" : "signin",
	);
	const [anySubmitting, setAnySubmitting] = useState(false);
	const { data: session, isPending } = authClient.useSession();
	const hasBlockedParam = blocked === 1;
	const isBlocked = hasBlockedParam && Boolean(session?.user);

	useEffect(() => {
		if (tab === "signup" || tab === "signin") {
			setMode(tab);
		}
	}, [tab]);

	useEffect(() => {
		if (isPending || hasBlockedParam) return;
		if (session?.user) {
			const role = getSessionUserRole(session);
			redirectReplace(resolvePostAuthRedirect(role, returnUrl));
		}
	}, [isPending, hasBlockedParam, session, returnUrl]);

	useEffect(() => {
		if (isPending || !error || hasBlockedParam) return;
		toast.error(getLoginToastErrorMessage(error, error_description));
		void navigate({
			search: { returnUrl, tab },
			replace: true,
		});
	}, [
		isPending,
		error,
		error_description,
		hasBlockedParam,
		returnUrl,
		tab,
		navigate,
	]);

	if (isPending) {
		return <Loader />;
	}

	if (isBlocked) {
		return (
			<LmsAuthShell formLabel="Truy cập bị hạn chế">
				<BlockedAccountCard
					error={error}
					email={getSessionUserEmail(session)}
				/>
			</LmsAuthShell>
		);
	}

	if (session?.user) {
		return <Loader />;
	}

	return (
		<LmsAuthShell formLabel="Đăng nhập tài khoản">
			<div className="grid gap-2 text-center">
				<h1 className="font-bold text-2xl">
					{mode === "signin" ? "Chào mừng trở lại" : "Tạo tài khoản học viên"}
				</h1>
				<p className="text-balance text-muted-foreground text-sm">
					{mode === "signin"
						? "Đăng nhập để tiếp tục học tập và giảng dạy."
						: "Đăng ký tài khoản học viên nhanh chóng."}
				</p>
			</div>

			<AuthTabs mode={mode} onChange={setMode} disabled={anySubmitting} />

			<div
				aria-hidden="true"
				className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t"
			>
				<span className="relative z-10 bg-background px-2 text-muted-foreground">
					Hoặc tiếp tục với
				</span>
			</div>

			<GoogleOAuthButton disabled={anySubmitting} />

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
					onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
					className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
				>
					{mode === "signin" ? "Tạo tài khoản học viên" : "Đăng nhập"}
				</button>
			</p>
		</LmsAuthShell>
	);
}
