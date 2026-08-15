export function Tag({ children }: { children: string }) {
	return (
		<span className="inline-flex items-center rounded-full border border-line border-solid bg-transparent px-[9px] py-[2px] text-[11px] text-muted-fg">
			{children}
		</span>
	);
}
