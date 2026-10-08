import { type ReactNode, useState } from "react";

import { cn } from "@/lib/cn";

/** Maps TanStack Form field errors to a plain string[] (first message renders). */
export const fieldErrors = (errors: readonly unknown[]): string[] =>
	errors
		.map((error) => (error as { message?: string } | undefined)?.message)
		.filter((message): message is string => typeof message === "string");

interface AuthFieldProps {
	label: string;
	id: string;
	name?: string;
	type?: string;
	autoComplete?: string;
	placeholder?: string;
	value: string;
	onChange: (value: string) => void;
	onBlur: () => void;
	errors: string[];
	labelRowExtra?: ReactNode;
	hint?: ReactNode;
	passwordToggle?: boolean;
	required?: boolean;
}

export function AuthField({
	label,
	id,
	name,
	type = "text",
	autoComplete,
	placeholder,
	value,
	onChange,
	onBlur,
	errors,
	labelRowExtra,
	hint,
	passwordToggle,
	required,
}: AuthFieldProps) {
	const [passwordShown, setPasswordShown] = useState(false);
	const invalid = errors.length > 0;

	return (
		<div className="mb-[14px]">
			<div className="mb-[7px] flex items-baseline justify-between gap-[10px]">
				<label
					htmlFor={id}
					className="font-[510] text-[13px] text-fg-2 tracking-[0.01em]"
				>
					{label}
				</label>
				{labelRowExtra}
			</div>
			<div className="relative">
				<input
					id={id}
					name={name}
					type={passwordShown ? "text" : type}
					autoComplete={autoComplete}
					placeholder={placeholder}
					value={value}
					onBlur={onBlur}
					onChange={(event) => onChange(event.target.value)}
					required={required}
					aria-required={required ? true : undefined}
					aria-invalid={invalid || undefined}
					aria-describedby={invalid ? `${id}-status` : undefined}
					className={cn(
						"h-12 w-full rounded-[var(--radius-md)] border border-line bg-bg px-[15px] text-fg text-sm",
						"transition-[border-color,box-shadow] duration-[150ms] motion-reduce:transition-none",
						"hover:border-[color-mix(in_oklab,var(--fg),transparent_72%)]",
						"focus:border-hot focus:shadow-[var(--focus-ring)] focus:outline-none",
						passwordToggle && "pr-[50px]",
						invalid &&
							"border-danger focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--danger),transparent_68%)]",
					)}
				/>
				{passwordToggle && (
					<button
						type="button"
						onClick={() => setPasswordShown((shown) => !shown)}
						aria-pressed={passwordShown}
						aria-label={passwordShown ? "Hide password" : "Show password"}
						className="absolute top-1/2 right-[6px] grid h-[38px] w-[38px] -translate-y-1/2 place-items-center rounded-[var(--radius-sm)] text-muted-fg transition-[background,color] duration-[150ms] hover:bg-surface hover:text-fg-2 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.8"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
							className="block h-[17px] w-[17px]"
						>
							<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
							<circle cx="12" cy="12" r="3" />
						</svg>
					</button>
				)}
			</div>
			<div
				id={`${id}-status`}
				className="mt-[5px] min-h-[19px] text-[13px]"
				aria-live="polite"
			>
				{invalid ? (
					<p
						role="alert"
						className="text-[color-mix(in_oklab,var(--danger),black_18%)]"
					>
						{errors[0]}
					</p>
				) : (
					hint
				)}
			</div>
		</div>
	);
}
