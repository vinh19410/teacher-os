import { type ReactNode, useState } from "react";
import { inputCls } from "@/components/ui/field";
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

/** Field auth v2: inputCls dùng chung (viền + ring 3px, `text-base
 * md:text-sm`), id/aria giữ nguyên cho e2e (`#si-email-status`…). */
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
			<div className="flex items-baseline justify-between gap-[10px]">
				<label htmlFor={id} className="font-medium text-sm leading-none">
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
						inputCls,
						passwordToggle && "pr-9",
						invalid && "border-destructive/60",
					)}
				/>
				{passwordToggle && (
					<button
						type="button"
						onClick={() => setPasswordShown((shown) => !shown)}
						aria-pressed={passwordShown}
						aria-label={passwordShown ? "Hide password" : "Show password"}
						className="absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.8"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
							className="block size-4"
						>
							<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
							<circle cx="12" cy="12" r="3" />
						</svg>
					</button>
				)}
			</div>
			<div id={`${id}-status`} className="text-sm" aria-live="polite">
				{invalid ? (
					<p role="alert" className="text-destructive">
						{errors[0]}
					</p>
				) : (
					hint
				)}
			</div>
		</div>
	);
}
