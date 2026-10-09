import type { ReactNode } from "react";

export function NoticeInfo({ children }: { children: ReactNode }) {
	return (
		<div
			role="status"
			className="mb-[18px] flex items-start gap-[10px] rounded-[var(--radius-md)] bg-accent-soft px-[14px] py-3 text-[13px] text-fg-2 leading-[1.45]"
		>
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				aria-hidden="true"
				className="mt-[1px] h-4 w-4 flex-none text-hot"
			>
				<circle cx="12" cy="12" r="9" />
				<path d="M12 8h.01M11 12h1v4h1" />
			</svg>
			<span>{children}</span>
		</div>
	);
}

export function NoticeOk({
	title,
	children,
}: {
	title: string;
	children?: ReactNode;
}) {
	return (
		<div
			role="status"
			className="mb-[18px] flex items-start gap-[10px] rounded-[var(--radius-md)] bg-success-soft px-[14px] py-3 text-[13px] leading-[1.45]"
		>
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
				className="mt-[1px] h-4 w-4 flex-none text-success"
			>
				<path d="M20 6 9 17l-5-5" />
			</svg>
			<span>
				<strong className="block font-[590] text-fg">{title}</strong>
				{children && <span className="text-fg-2">{children}</span>}
			</span>
		</div>
	);
}
