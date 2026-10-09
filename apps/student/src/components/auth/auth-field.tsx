import { type ReactNode, useState } from "react";
import { cn } from "@/lib/cn";

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
			<div className="mb-[7px] flex items-baseline justify-between gap-2">
				<label
					htmlFor={id}
					className="font-mono text-[11px] text-meta uppercase tracking-[0.18em]"
				>
					{label}
					{required && (
						<span aria-hidden="true" className="ml-1 text-danger">
							*
						</span>
					)}
				</label>
				{labelRowExtra}
			</div>

			<div className="relative">
				<input
					id={id}
					name={name ?? id}
					type={passwordToggle && passwordShown ? "text" : type}
					autoComplete={autoComplete}
					placeholder={placeholder}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onBlur={onBlur}
					aria-invalid={invalid}
					aria-describedby={
						invalid ? `${id}-error` : hint ? `${id}-hint` : undefined
					}
					className={cn(
						// Input sunk (`neu-in`) với viền mạnh đạt ranh giới ≥3:1,
						// focus ring cam theo phase 3 phía web.
						"h-11 w-full rounded-md border border-line-strong bg-surface px-[13px] text-[15px] text-fg transition-shadow duration-[150ms] placeholder:text-muted-fg focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hot/40",
						invalid &&
							"border-destructive/60 focus-visible:shadow-[0_0_0_4px_color-mix(in_oklab,var(--destructive),transparent_68%)]",
						passwordToggle && "pr-11",
					)}
				/>
				{passwordToggle && (
					<button
						type="button"
						tabIndex={-1}
						aria-label={passwordShown ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
						onClick={() => setPasswordShown((prev) => !prev)}
						className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-fg transition-colors hover:text-fg focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
					>
						{passwordShown ? (
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
								className="h-4 w-4"
							>
								<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
								<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
								<path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
								<line x1="2" x2="22" y1="2" y2="22" />
							</svg>
						) : (
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
								className="h-4 w-4"
							>
								<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
								<circle cx="12" cy="12" r="3" />
							</svg>
						)}
					</button>
				)}
			</div>

			{invalid && (
				<p id={`${id}-error`} className="mt-[5px] text-[12px] text-danger">
					{errors[0]}
				</p>
			)}
			{!invalid && hint && (
				<p id={`${id}-hint`} className="mt-[5px] text-[12px] text-muted-fg">
					{hint}
				</p>
			)}
		</div>
	);
}
