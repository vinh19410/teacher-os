import type { ReactNode } from "react";

/** Tiêu đề mục v2 (design `SectionTitle`): h2 đậm + mô tả muted bên dưới.
 * `SectionLabel` giữ làm alias cho call site cũ (không có mô tả). */
export function SectionTitle({
	children,
	description,
}: {
	children: ReactNode;
	description?: ReactNode;
}) {
	return (
		<div className="mb-3">
			<h2 className="font-semibold text-lg tracking-tight">{children}</h2>
			{description && (
				<p className="text-muted-foreground text-sm">{description}</p>
			)}
		</div>
	);
}

export function SectionLabel({ children }: { children: ReactNode }) {
	return <SectionTitle>{children}</SectionTitle>;
}
