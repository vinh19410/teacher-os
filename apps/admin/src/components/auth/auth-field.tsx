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

// Control v2 (inputCls dùng chung): viền + shadow nhẹ, focus ring 3px,
// `text-base md:text-sm` chặn iOS tự zoom khi focus input < 16px.
const inputCls =
	"flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30";

/** Field auth v2: inputCls token v2, id/aria giữ nguyên cho e2e
 * (`#signin-email`, `#signin-password`, hint/error id kế thừa). */
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
		<div className="grid gap-2">
			<div className="flex items-baseline justify-between gap-2">
				<label htmlFor={id} className="font-medium text-sm leading-none">
					{label}
					{required && (
						<span aria-hidden="true" className="ml-1 text-destructive">
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
						inputCls,
						passwordToggle && "pr-9",
						invalid && "border-destructive/60",
					)}
				/>
				{passwordToggle && (
					<button
						type="button"
						tabIndex={-1}
						aria-label={passwordShown ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
						onClick={() => setPasswordShown((prev) => !prev)}
						className="absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
								className="size-4"
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
								className="size-4"
							>
								<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
								<circle cx="12" cy="12" r="3" />
							</svg>
						)}
					</button>
				)}
			</div>

			{invalid ? (
				<p
					id={`${id}-error`}
					role="alert"
					aria-live="polite"
					className="text-destructive text-sm"
				>
					{errors[0]}
				</p>
			) : (
				hint && (
					<div id={`${id}-hint`} className="text-muted-foreground text-sm">
						{hint}
					</div>
				)
			)}
		</div>
	);
}
