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
	children,
}: {
	label: string;
	help?: string;
	error?: string;
	htmlFor?: string;
	children: ReactNode;
}) {
	const id = useId();
	// Callers pass a single control (Input/Select/Textarea); inject the label
	// target id so htmlFor resolves without every call site passing one.
	const child = Children.toArray(children)[0];
	const childId = isValidElement(child)
		? (child.props as { id?: string }).id
		: undefined;
	const target = htmlFor ?? childId ?? id;
	const control =
		isValidElement(child) && !childId
			? cloneElement(child as ReactElement<{ id?: string }>, { id: target })
			: children;
	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={target} className="font-medium text-muted-fg text-xs">
				{label}
			</label>
			{control}
			{help && <span className="text-[11px] text-meta">{help}</span>}
			{error && <span className="text-[11px] text-danger">{error}</span>}
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
