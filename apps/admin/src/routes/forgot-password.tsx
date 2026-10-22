import { createFileRoute } from "@tanstack/react-router";

import { AdminAuthShell } from "@/components/auth/admin-auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const Route = createFileRoute("/forgot-password")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<AdminAuthShell formLabel="Quên mật khẩu">
			<div className="grid gap-2 text-center">
				<h1 className="font-bold text-2xl">Quên mật khẩu</h1>
				<p className="text-balance text-muted-foreground text-sm">
					Nhập email tài khoản quản trị, chúng tôi sẽ gửi liên kết để bạn đặt
					mật khẩu mới.
				</p>
			</div>

			<ForgotPasswordForm />
		</AdminAuthShell>
	);
}
