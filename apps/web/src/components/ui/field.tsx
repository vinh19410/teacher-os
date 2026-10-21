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

// Control v2 (design `inputCls`): viền + shadow nhẹ, focus ring 3px.
// `text-base md:text-sm` chặn iOS tự zoom khi focus input < 16px.
export const inputCls =
	"flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30";

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
				className="font-medium text-sm leading-none"
			>
				{label}
			</label>
			{control}
			{help && (
				<span id={helpId} className="text-muted-foreground text-xs">
					{help}
				</span>
			)}
			{error && (
				<span
					id={errorId}
					role="alert"
					aria-live="polite"
					className="text-destructive text-xs"
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
	return <input id={id} className={cn(inputCls, className)} {...props} />;
}

export function Select({
	className,
	id,
	children,
	...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
	return (
		<select id={id} className={cn(inputCls, className)} {...props}>
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
			className={cn(inputCls, "min-h-20 resize-y leading-[1.5]", className)}
			{...props}
		/>
	);
}
