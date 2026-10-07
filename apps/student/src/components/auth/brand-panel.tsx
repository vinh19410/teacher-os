export interface BrandPanelProps {
	now?: Date;
}

export default function BrandPanel({ now: _now }: BrandPanelProps = {}) {
	return (
		<section className="relative flex flex-col overflow-hidden bg-[var(--fg)] px-[clamp(28px,4.5vw,64px)] py-[clamp(32px,4vw,56px)] text-[var(--bg)] max-[960px]:items-center max-[960px]:gap-6 max-[960px]:px-6 max-[960px]:py-8 max-[960px]:pb-9 max-[960px]:text-center">
			<div className="flex items-center gap-3 max-[960px]:hidden">
				<span className="inline-flex items-center gap-3 rounded-[var(--radius-sm)]">
					<svg
						viewBox="0 0 34 34"
						aria-hidden="true"
						className="block h-[34px] w-[34px]"
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
					<span className="font-display font-semibold text-[17px] text-[var(--bg)] tracking-[-0.01em]">
						Teacher OS · Học viên
					</span>
				</span>
			</div>

			<div className="flex flex-1 flex-col justify-center gap-[clamp(28px,4vh,48px)] py-[clamp(32px,6vh,72px)] max-[960px]:gap-[14px] max-[960px]:py-0">
				<div>
					<p className="mb-[14px] font-[590] text-[color-mix(in_oklab,var(--bg),transparent_42%)] text-xs uppercase tracking-[0.09em]">
						Cổng thông tin học viên
					</p>
					<h1 className="max-w-[16ch] font-[620] font-display text-[clamp(28px,3vw,42px)] leading-[1.15] tracking-[-0.015em] max-[960px]:max-w-[20ch] max-[960px]:text-[clamp(24px,6vw,30px)]">
						Lịch học & bài tập của bạn, gọn gàng và chuẩn xác.
					</h1>
					<p className="mt-4 max-w-[46ch] text-[16px] text-[color-mix(in_oklab,var(--bg),transparent_36%)] leading-[1.55] max-[960px]:hidden">
						Theo dõi tiến độ từng buổi học, hạn nộp bài tập và nhận điểm chi
						tiết trực tiếp từ giáo viên.
					</p>
				</div>
			</div>

			<p className="text-[color-mix(in_oklab,var(--bg),transparent_55%)] text-xs max-[960px]:hidden">
				© 2022 Teacher OS · Học viên
			</p>
		</section>
	);
}
