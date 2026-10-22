import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AdminAuthShell } from "@/components/auth/admin-auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const Route = createFileRoute("/reset-password")({
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
	const search = Route.useSearch();
	// Capture the one-time token and error before clearing them from the URL so
	// they stay out of the address bar and browser history.
	const [token] = useState<string | null>(() => search.token || null);
	const [linkError] = useState(() => Boolean(search.error));

	useEffect(() => {
		void navigate({ search: {}, replace: true });
	}, [navigate]);

	return (
		<AdminAuthShell formLabel="Đặt lại mật khẩu">
			<div className="grid gap-2 text-center">
				<h1 className="font-bold text-2xl">Đặt lại mật khẩu</h1>
				<p className="text-balance text-muted-foreground text-sm">
					Nhập mật khẩu mới cho tài khoản quản trị của bạn.
				</p>
			</div>

			<ResetPasswordForm token={token} linkError={linkError} />
		</AdminAuthShell>
	);
}
