import type { InputHTMLAttributes } from "react";
import { formatVndInput } from "@/lib/format-currency";
import { Input } from "./field";

type CurrencyInputProps = Omit<
	InputHTMLAttributes<HTMLInputElement>,
	"type" | "inputMode" | "value" | "onChange"
> & {
	value: string;
	onChange: (next: string) => void;
};

/**
 * Controlled input tiền: hiển thị & phát ra chuỗi đã format ("1,000,000").
 * Field (cloneElement) inject id/aria vào component này → forward hết
 * xuống <Input> qua props spread.
 */
export function CurrencyInput({
	value,
	onChange,
	...props
}: CurrencyInputProps) {
	return (
		<Input
			{...props}
			type="text"
			inputMode="numeric"
			autoComplete="off"
			value={formatVndInput(value)}
			onChange={(e) => onChange(formatVndInput(e.target.value))}
		/>
	);
}
