import { createFileRoute } from "@tanstack/react-router";

import BrandPanel from "@/components/auth/brand-panel";
import { VerifyEmailView } from "@/components/auth/verify-email-view";

export const Route = createFileRoute("/verify-email")({
	// Trang public chỉ đọc verified/error từ query; mọi key khác bị bỏ để
	// link chế tay không smuggle được state.
	validateSearch: (
		search: Record<string, unknown>,
	): { verified?: string; error?: string } => ({
		verified: typeof search.verified === "string" ? search.verified : undefined,
		error: typeof search.error === "string" ? search.error : undefined,
	}),
	component: RouteComponent,
});

function RouteComponent() {
	const { verified, error } = Route.useSearch();

	return (
		<main className="grid min-h-[100svh] grid-cols-[minmax(460px,1.12fr)_minmax(420px,1fr)] max-[960px]:grid-cols-1">
			<BrandPanel />
			<section
				aria-label="Xác thực email"
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
						Xác thực email
					</h2>
					<p className="mt-2 text-muted-fg text-sm">
						Đang xác nhận địa chỉ email cho cổng học viên.
					</p>

					<VerifyEmailView verified={verified} error={error} />
				</div>
			</section>
		</main>
	);
}
