import { createFileRoute } from "@tanstack/react-router";
import { LmsAuthShell } from "@/components/auth/auth-shell";
import { VerifyEmailView } from "@/components/auth/verify-email-view";

export const Route = createFileRoute("/verify-email")({
	validateSearch: (
		search: Record<string, unknown>,
	): { verified?: string; error?: string } => ({
		verified: typeof search.verified === "string" ? search.verified : undefined,
		error: typeof search.error === "string" ? search.error : undefined,
	}),
	component: VerifyEmailRoute,
});

function VerifyEmailRoute() {
	const { verified, error } = Route.useSearch();

	return (
		<LmsAuthShell formLabel="Xác thực email">
			<div className="grid gap-2 text-center">
				<h1 className="font-bold text-2xl">Xác thực email</h1>
				<p className="text-balance text-muted-foreground text-sm">
					Đang xác nhận địa chỉ email cho tài khoản Cô Mỹ Dạy Tiếng Anh.
				</p>
			</div>

			<VerifyEmailView verified={verified} error={error} />
		</LmsAuthShell>
	);
}
