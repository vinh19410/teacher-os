import { createFileRoute } from "@tanstack/react-router";
import { ThemeToggle } from "@teacher-os/ui/components/theme-toggle";
import { useEffect, useState } from "react";
import BrandPanel from "@/components/auth/brand-panel";
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
		<main className="relative grid min-h-[100svh] grid-cols-[minmax(460px,1.12fr)_minmax(420px,1fr)] max-[960px]:grid-cols-1">
			<div className="absolute top-4 right-4 z-10">
				<ThemeToggle />
			</div>
			<BrandPanel />
			<section
				aria-label="Đặt lại mật khẩu"
				className="flex items-center justify-center px-[clamp(20px,3vw,48px)] py-[clamp(28px,4vh,56px)] max-[960px]:items-start max-[420px]:px-4 max-[420px]:pt-6 max-[420px]:pb-10"
			>
				<div className="fade-in slide-in-from-bottom-2 w-full max-w-[420px] animate-in duration-[220ms] ease-[cubic-bezier(0.28,0,0.22,1)] motion-reduce:animate-none">
					<div className="mb-[26px] hidden items-center justify-center gap-[10px] max-[960px]:flex">
						<span className="font-mono text-fg text-sm uppercase tracking-[0.25em]">
							Teacher<span className="text-hot">/</span>OS
						</span>
						<span className="font-mono text-[10px] text-meta uppercase tracking-[0.25em]">
							· Học viên
						</span>
					</div>

					<h2 className="font-display font-extrabold text-[clamp(26px,3vw,34px)] leading-[0.95] tracking-[-0.045em]">
						Đặt lại mật khẩu
					</h2>
					<p className="-mt-4 mb-6 text-muted-fg text-sm">
						Nhập mật khẩu mới cho tài khoản học viên của bạn.
					</p>

					<ResetPasswordForm token={token} linkError={linkError} />
				</div>
			</section>
		</main>
	);
}
