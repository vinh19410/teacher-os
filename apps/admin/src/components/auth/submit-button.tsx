interface SubmitButtonProps {
	disabled?: boolean;
	spinning?: boolean;
	spinningLabel?: string;
	label: string;
}

/** Nút submit auth v2: `Button` primary (mực đậm) full-width. */
export function SubmitButton({
	disabled,
	spinning,
	spinningLabel,
	label,
}: SubmitButtonProps) {
	return (
		<button
			type="submit"
			disabled={disabled}
			className="inline-flex h-9 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary font-medium text-primary-foreground text-sm shadow-xs outline-none transition-all hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
		>
			{spinning && (
				<span
					aria-hidden="true"
					className="size-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
				/>
			)}
			{spinning ? (spinningLabel ?? label) : label}
		</button>
	);
}
