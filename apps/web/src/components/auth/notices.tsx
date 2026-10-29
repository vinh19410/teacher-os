import type { ReactNode } from "react";

/** Alert info v2: nền accent xám, icon dùng màu primary. */
export function NoticeInfo({ children }: { children: ReactNode }) {
	return (
		<div
			role="status"
			className="flex items-start gap-2 rounded-md bg-accent px-3 py-2.5 text-[13px] text-foreground leading-[1.45]"
		>
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				aria-hidden="true"
				className="mt-[1px] size-4 flex-none text-primary"
			>
				<circle cx="12" cy="12" r="9" />
				<path d="M12 8h.01M11 12h1v4h1" />
			</svg>
			<span>{children}</span>
		</div>
	);
}

/** Alert success v2: nền success-soft, chữ success. */
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
			className="flex items-start gap-2 rounded-md bg-success-soft px-3 py-2.5 text-[13px] leading-[1.45]"
		>
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
				className="mt-[1px] size-4 flex-none text-success"
			>
				<path d="M20 6 9 17l-5-5" />
			</svg>
			<span>
				<strong className="block font-medium text-foreground">{title}</strong>
				{children && <span className="text-foreground">{children}</span>}
			</span>
		</div>
	);
}
