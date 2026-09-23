interface SubmitButtonProps {
	disabled?: boolean;
	spinning?: boolean;
	spinningLabel?: string;
	label: string;
}

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
			className="mt-2 flex h-12 w-full items-center justify-center gap-[9px] rounded-[var(--radius-pill)] bg-accent-blue font-[590] text-accent-on text-sm tracking-[0.02em] transition-[background,transform] duration-[150ms] ease-[cubic-bezier(0.28,0,0.22,1)] hover:bg-accent-hover focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none active:scale-[0.97] active:bg-accent-active disabled:pointer-events-none disabled:opacity-40"
		>
			{spinning && (
				<span
					aria-hidden="true"
					className="h-4 w-4 animate-spin rounded-full border-2 border-[color-mix(in_oklab,var(--accent-on),transparent_70%)] border-t-accent-on"
				/>
			)}
			{spinning ? (spinningLabel ?? label) : label}
		</button>
	);
}
