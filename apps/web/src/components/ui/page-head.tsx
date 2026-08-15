import type { ReactNode } from "react";

export function PageHead({ title, lead }: { title: string; lead?: ReactNode }) {
	return (
		<div className="mb-6">
			<h1 className="text-balance font-display font-semibold text-[clamp(28px,3.5vw,40px)] leading-[1.1] tracking-[-0.015em]">
				{title}
			</h1>
			{lead && (
				<p className="mt-2 max-w-[60ch] text-base text-muted-fg">{lead}</p>
			)}
		</div>
	);
}
