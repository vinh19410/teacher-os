import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { AdminAuthShell } from "@/components/auth/admin-auth-shell";
import { GoogleOAuthButton } from "@/components/auth/google-oauth-button";
import { SignInForm } from "@/components/auth/sign-in-form";
import { authClient } from "@/lib/auth-client";
import { adminGateMessage } from "@/lib/auth-error";
import { validateReturnUrl } from "@/lib/validate-return-url";

export const Route = createFileRoute("/login")({
	validateSearch: (
		search: Record<string, unknown>,
	): {
		returnUrl?: string;
		error?: string;
		gateStatus?: number;
	} => ({
		returnUrl:
			typeof search.returnUrl === "string" ? search.returnUrl : undefined,
		error: typeof search.error === "string" ? search.error : undefined,
		gateStatus:
			typeof search.gateStatus === "string" && /^\d+$/.test(search.gateStatus)
				? Number(search.gateStatus)
				: undefined,
	}),
	component: RouteComponent,
});

function RouteComponent() {
	const navigate = Route.useNavigate();
	const { returnUrl, error, gateStatus } = Route.useSearch();
	const { data: session, isPending } = authClient.useSession();

	useEffect(() => {
		if (session?.user) {
			void navigate({ to: validateReturnUrl(returnUrl) });
		}
	}, [session, returnUrl, navigate]);

	useEffect(() => {
		if (!error) return;
		// Guard _auth đẩy về đây kèm mã gate (SESSION_EXPIRED/NOT_ADMIN/…);
		// gateStatus giữ HTTP status gốc để map đúng thông báo.
		toast.error(adminGateMessage(gateStatus ?? 0, error));
		void navigate({ search: { returnUrl }, replace: true });
	}, [error, gateStatus, returnUrl, navigate]);

	if (isPending) {
		return null;
	}

	return (
		<AdminAuthShell formLabel="Đăng nhập quản trị">
			<div className="grid gap-2 text-center">
				<h1 className="font-bold text-2xl">Đăng nhập quản trị</h1>
				<p className="text-balance text-muted-foreground text-sm">
					Dành cho tài khoản quản trị Teacher OS.
				</p>
			</div>

			<div
				aria-hidden="true"
				className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t"
			>
				<span className="relative z-10 bg-background px-2 text-muted-foreground">
					Hoặc tiếp tục với
				</span>
			</div>

			<GoogleOAuthButton />

			<SignInForm />

			{/* Cổng quản trị KHÔNG có link đăng ký công khai: route /register tồn
				tại không link, server chặn mọi email ngoài ADMIN_EMAILS (phase 1). */}
		</AdminAuthShell>
	);
}
