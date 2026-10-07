const brandPanelDateFormatter = new Intl.DateTimeFormat("en-US", {
	weekday: "short",
	month: "short",
	day: "numeric",
});

export interface BrandPanelProps {
	now?: Date;
}

export default function BrandPanel({ now }: BrandPanelProps = {}) {
	const formattedDate = brandPanelDateFormatter.format(now ?? new Date());
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
						Teacher OS
					</span>
				</span>
			</div>

			<div className="flex flex-1 flex-col justify-center gap-[clamp(28px,4vh,48px)] py-[clamp(32px,6vh,72px)] max-[960px]:gap-[14px] max-[960px]:py-0">
				<div>
					<p className="mb-[14px] font-[590] text-[color-mix(in_oklab,var(--bg),transparent_42%)] text-xs uppercase tracking-[0.09em]">
						Teacher-first workspace
					</p>
					<h1 className="max-w-[15ch] font-[620] font-display text-[clamp(30px,3.1vw,46px)] leading-[1.1] tracking-[-0.015em] max-[960px]:max-w-[18ch] max-[960px]:text-[clamp(24px,6vw,30px)]">
						Your whole teaching day, in one calm workspace.
					</h1>
					<p className="mt-4 max-w-[46ch] text-[17px] text-[color-mix(in_oklab,var(--bg),transparent_36%)] leading-[1.55] max-[960px]:hidden">
						Classes, students, syllabi, lessons, invoices and reports —
						organized around the classes you teach.
					</p>
				</div>

				<div className="w-[min(460px,100%)] rounded-[var(--radius-lg)] bg-[var(--bg)] px-[22px] pt-[22px] pb-[18px] text-fg shadow-[var(--elev-raised)] max-[960px]:hidden">
					<div className="flex items-baseline justify-between gap-3 border-line-soft border-b pb-[14px]">
						<span className="font-display font-semibold text-[17px] tracking-[-0.01em]">
							Today
						</span>
						<span className="text-muted-fg text-xs">
							{formattedDate} · 3 classes
						</span>
					</div>
					<div className="grid grid-cols-[52px_1fr_auto] items-center gap-[14px] border-line-soft border-b py-[13px] last:border-b-0">
						<span className="font-mono text-[13px] text-muted-fg">09:00</span>
						<div>
							<div className="font-[510] text-fg text-sm">
								Speaking Club · Group A
							</div>
							<div className="mt-[2px] text-muted-fg text-xs">Room 204</div>
						</div>
						<span className="whitespace-nowrap rounded-[var(--radius-pill)] bg-accent-blue px-[10px] py-[3px] font-[590] text-[11px] text-accent-on uppercase tracking-[0.06em]">
							Now
						</span>
					</div>
					<div className="grid grid-cols-[52px_1fr_auto] items-center gap-[14px] border-line-soft border-b py-[13px] last:border-b-0">
						<span className="font-mono text-[13px] text-muted-fg">10:30</span>
						<div>
							<div className="font-[510] text-fg text-sm">
								Mathematics 10 · Section B
							</div>
							<div className="mt-[2px] text-muted-fg text-xs">Room 112</div>
						</div>
						<span className="whitespace-nowrap rounded-[var(--radius-pill)] bg-surface px-[10px] py-[3px] font-[590] text-[11px] text-fg-2 uppercase tracking-[0.06em] shadow-[inset_0_0_0_1px_var(--border)]">
							Next
						</span>
					</div>
					<div className="grid grid-cols-[52px_1fr_auto] items-center gap-[14px] border-line-soft border-b py-[13px] last:border-b-0">
						<span className="font-mono text-[13px] text-muted-fg">14:00</span>
						<div>
							<div className="font-[510] text-fg text-sm">
								Physics Lab · Group C
							</div>
							<div className="mt-[2px] text-muted-fg text-xs">Lab 3</div>
						</div>
						<span className="whitespace-nowrap rounded-[var(--radius-pill)] px-[10px] py-[3px] font-[590] text-[11px] text-meta uppercase tracking-[0.06em]">
							Done
						</span>
					</div>
					<div className="flex items-center gap-3 border-line-soft border-t pt-[14px]">
						<span className="flex-1 text-muted-fg text-xs">
							Syllabus · Midterm review
						</span>
						<span className="h-[6px] w-[120px] overflow-hidden rounded-[var(--radius-pill)] bg-surface">
							<span className="block h-full w-[78%] rounded-[var(--radius-pill)] bg-accent-blue" />
						</span>
						<span className="font-mono text-fg-2 text-xs">78%</span>
					</div>
				</div>
			</div>

			<p className="text-[color-mix(in_oklab,var(--bg),transparent_55%)] text-xs max-[960px]:hidden">
				© 2022 Teacher OS
			</p>
		</section>
	);
}
