import {
	Children,
	cloneElement,
	type InputHTMLAttributes,
	isValidElement,
	type ReactElement,
	type ReactNode,
	type SelectHTMLAttributes,
	type TextareaHTMLAttributes,
	useId,
} from "react";
import { cn } from "@/lib/cn";

// Sunk control (design `neu-in`) with an explicit strong boundary: the bare
// surface fill only reaches 1.15:1 against the page, so inputs carry a
// --line-strong border (>=3:1, WCAG 1.4.11) plus the orange focus ring.
const controlClasses =
	"w-full bg-surface rounded-md border border-line-strong px-4 py-2.5 text-fg text-sm placeholder:text-meta transition-shadow duration-[150ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-hot/40 focus-visible:shadow-[var(--focus-ring)]";

export function Field({
	label,
	help,
	error,
	htmlFor,
	required,
	children,
}: {
	label: string;
	help?: string;
	error?: string;
	htmlFor?: string;
	required?: boolean;
	children: ReactNode;
}) {
	const id = useId();
	// Single-control usage gets the label target id injected; anything else
	// (multi-child layouts) renders untouched rather than dropping children.
	const child = Children.toArray(children)[0];
	const single = Children.count(children) === 1 && isValidElement(child);
	const childProps = single
		? (child.props as Record<string, unknown>)
		: undefined;
	const childId = childProps?.id as string | undefined;
	const target = htmlFor ?? childId ?? id;

	const isRequired =
		required ??
		(typeof label === "string" && label.includes("*")) ??
		Boolean(childProps?.required || childProps?.["aria-required"]);

	const errorId = error ? `${target}-error` : undefined;
	const helpId = help ? `${target}-help` : undefined;
	const describedByParts = [
		errorId,
		helpId,
		typeof childProps?.["aria-describedby"] === "string"
			? childProps["aria-describedby"]
			: undefined,
	].filter(Boolean);
	const describedBy =
		describedByParts.length > 0 ? describedByParts.join(" ") : undefined;

	const control = single
		? cloneElement(child as ReactElement<Record<string, unknown>>, {
				id: target,
				...(isRequired ? { required: true, "aria-required": true } : {}),
				...(error ? { "aria-invalid": true } : {}),
				...(describedBy ? { "aria-describedby": describedBy } : {}),
			})
		: children;
	return (
		<div className="flex flex-col gap-1">
			<label
				id={`${target}-label`}
				htmlFor={target}
				className="font-mono text-[11px] text-meta uppercase tracking-[0.18em]"
			>
				{label}
			</label>
			{control}
			{help && (
				<span id={helpId} className="text-[11px] text-meta">
					{help}
				</span>
			)}
			{error && (
				<span
					id={errorId}
					role="alert"
					aria-live="polite"
					className="text-[11px] text-danger"
				>
					{error}
				</span>
			)}
		</div>
	);
}

export function Input({
	className,
	id,
	...props
}: InputHTMLAttributes<HTMLInputElement>) {
	return <input id={id} className={cn(controlClasses, className)} {...props} />;
}

export function Select({
	className,
	id,
	children,
	...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
	return (
		<select id={id} className={cn(controlClasses, className)} {...props}>
			{children}
		</select>
	);
}

export function Textarea({
	className,
	id,
	...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
	return (
		<textarea
			id={id}
			className={cn(
				controlClasses,
				"min-h-20 resize-y leading-[1.5]",
				className,
			)}
			{...props}
		/>
	);
}
