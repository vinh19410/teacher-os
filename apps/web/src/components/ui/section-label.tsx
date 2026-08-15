export function SectionLabel({ children }: { children: string }) {
	return (
		<div className="mb-3 font-mono text-[11px] text-meta uppercase tracking-[0.06em]">
			{children}
		</div>
	);
}
