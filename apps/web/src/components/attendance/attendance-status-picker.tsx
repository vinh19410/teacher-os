import type { AttendanceStatus } from "@teacher-os/api/contracts";
import { type KeyboardEvent, useRef } from "react";
import { cn } from "@/lib/cn";

export interface AttendanceStatusOption {
	value: AttendanceStatus;
	label: string;
	activeClassName: string;
}

export const ATTENDANCE_STATUS_OPTIONS: readonly AttendanceStatusOption[] = [
	{
		value: "present",
		label: "Có mặt",
		activeClassName:
			"border-success/40 bg-success/10 text-success dark:border-success/50",
	},
	{
		value: "excused",
		label: "Vắng có phép",
		activeClassName:
			"border-transparent bg-secondary text-secondary-foreground",
	},
	{
		value: "unexcused",
		label: "Vắng không phép",
		activeClassName:
			"border-destructive/40 bg-destructive/10 text-destructive dark:border-destructive/50",
	},
	{
		value: "late",
		label: "Đi muộn",
		activeClassName: "border-warn/40 bg-warn/10 text-warn dark:border-warn/50",
	},
];

export interface AttendanceStatusPickerProps {
	value: AttendanceStatus | null;
	onChange: (value: AttendanceStatus) => void;
	ariaLabel: string;
	disabled?: boolean;
	firstRadioRef?: (el: HTMLButtonElement | null) => void;
}

export function AttendanceStatusPicker({
	value,
	onChange,
	ariaLabel,
	disabled = false,
	firstRadioRef,
}: AttendanceStatusPickerProps) {
	const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

	const handleKeyDown = (
		event: KeyboardEvent<HTMLButtonElement>,
		index: number,
	) => {
		if (disabled) return;
		const total = ATTENDANCE_STATUS_OPTIONS.length;
		let nextIndex: number | null = null;

		if (event.key === "ArrowRight" || event.key === "ArrowDown") {
			nextIndex = (index + 1) % total;
		} else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
			nextIndex = (index - 1 + total) % total;
		}

		if (nextIndex !== null) {
			event.preventDefault();
			const nextOption = ATTENDANCE_STATUS_OPTIONS[nextIndex];
			if (nextOption) {
				onChange(nextOption.value);
				buttonRefs.current[nextIndex]?.focus();
			}
		}
	};

	return (
		// biome-ignore lint/a11y/useSemanticElements: custom pill radio group follows WAI-ARIA radiogroup + roving tabindex pattern
		<div
			role="radiogroup"
			aria-label={ariaLabel}
			className="grid grid-cols-2 gap-1.5 lg:flex lg:flex-wrap lg:items-center"
		>
			{ATTENDANCE_STATUS_OPTIONS.map((opt, index) => {
				const selected = value === opt.value;
				const isTabStop = selected || (value === null && index === 0);
				return (
					<button
						key={opt.value}
						ref={(el) => {
							buttonRefs.current[index] = el;
							if (index === 0 && firstRadioRef) {
								firstRadioRef(el);
							}
						}}
						type="button"
						role="radio"
						aria-checked={selected}
						disabled={disabled}
						tabIndex={disabled ? -1 : isTabStop ? 0 : -1}
						onClick={() => onChange(opt.value)}
						onKeyDown={(e) => handleKeyDown(e, index)}
						className={cn(
							"inline-flex min-h-11 items-center justify-center rounded-md border px-2.5 py-1.5 font-medium text-xs outline-none transition-colors lg:min-h-8",
							"focus-visible:ring-[3px] focus-visible:ring-ring/50",
							"disabled:pointer-events-none disabled:opacity-50",
							selected
								? opt.activeClassName
								: "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
						)}
					>
						{opt.label}
					</button>
				);
			})}
		</div>
	);
}
