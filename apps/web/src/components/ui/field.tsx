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

const controlClasses =
	"focus:shadow-[var(--focus-ring)] border-line focus:border-accent-blue placeholder:text-meta bg-bg text-fg focus:outline-none w-full rounded-sm border border-solid px-3 py-[10px] text-sm transition-[border-color,box-shadow] duration-[150ms]";

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
				className="font-medium text-muted-fg text-xs"
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
