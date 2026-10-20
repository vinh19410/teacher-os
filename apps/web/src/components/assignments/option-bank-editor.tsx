import { ASSIGNMENT_ANSWER_CHOICES } from "@teacher-os/api/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import {
	bankLabel,
	kindOf,
	OPTION_BANK_MAX,
	type QuestionItem,
} from "./assignment-presets";

/**
 * Option bank editor (phase-02 FR3). One input per bank row; labels are
 * POSITIONAL (A… / i… via `bankLabel`) — the contract stores bare strings
 * and the label at index k is whatever sits at index k right now. That is
 * why deleting row i must reset every keyed answer whose label position is
 * >= i (`removeBankRow`): after renumbering, an old label would silently
 * point at a different option and auto-grading would mark wrong keys.
 */

/** Bank rows needed so every question has a label + 2 spares, capped at 8. */
export function bankTargetCount(items: QuestionItem[]): number {
	return Math.min(items.length + 2, OPTION_BANK_MAX);
}

/** Pad the bank with empty rows up to `count`; never shrinks. */
export function fillBankToCount(bank: string[], count: number): string[] {
	if (bank.length >= count) return bank;
	return [...bank, ...Array<string>(count - bank.length).fill("")];
}

const labelAlphabet = (typeId: string): readonly string[] => {
	const kind = kindOf(typeId);
	if (kind === "letter" || kind === "roman")
		return ASSIGNMENT_ANSWER_CHOICES[kind];
	return [];
};

/**
 * Remove bank row `index` and reset every answer whose label position is at
 * or after the deleted row — positional labels must never silently re-bind
 * to the shifted options (phase-02 FR3, red-team #4). Answers outside the
 * label alphabet (text kinds, corrupted values) are left untouched.
 */
export function removeBankRow(
	bank: string[],
	items: QuestionItem[],
	typeId: string,
	index: number,
): { bank: string[]; items: QuestionItem[] } {
	const labels = labelAlphabet(typeId);
	return {
		bank: bank.filter((_, rowIndex) => rowIndex !== index),
		items: items.map((item) => {
			// Trim before matching: a whitespace-padded label (e.g. a restored
			// corrupted draft "C ") must still reset instead of lingering.
			const labelIndex = labels.indexOf(item.answer.trim() as never);
			return labelIndex >= index ? { ...item, answer: "" } : item;
		}),
	};
}

export function OptionBankEditor({
	typeId,
	bank,
	items,
	showErrors,
	error,
	onBankChange,
	onItemsChange,
}: {
	typeId: string;
	bank: string[];
	items: QuestionItem[];
	showErrors: boolean;
	/** Pre-gated mirror of the contract rules — shown only with showErrors. */
	error?: string;
	onBankChange: (bank: string[]) => void;
	onItemsChange: (items: QuestionItem[]) => void;
}) {
	const kind = kindOf(typeId);
	const target = bankTargetCount(items);
	const atMax = bank.length >= OPTION_BANK_MAX;
	const updateRow = (index: number, value: string) => {
		onBankChange(
			bank.map((row, rowIndex) => (rowIndex === index ? value : row)),
		);
	};
	return (
		<div className="flex flex-col gap-2 rounded-md border border-border bg-muted p-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="font-medium text-muted-foreground text-xs">
					Ngân hàng lựa chọn
				</p>
				<span className="text-muted-foreground text-xs">
					{bank.length}/{OPTION_BANK_MAX} mục
				</span>
			</div>
			<p className="text-muted-foreground text-xs">
				Mỗi dòng một mục, nhãn sinh theo thứ tự (
				{kind === "roman" ? "i, ii, iii…" : "A, B, C…"}). Xóa một dòng sẽ reset
				đáp án đã khóa từ vị trí đó — nhãn là vị trí, không dán theo nội dung.
			</p>
			{bank.map((row, index) => {
				const label = bankLabel(kind, index);
				return (
					<div key={index} className="flex items-center gap-2">
						<span
							aria-hidden="true"
							className="w-7 text-center font-mono text-sm"
						>
							{label}
						</span>
						<Input
							value={row}
							aria-label={`Mục ${label}`}
							maxLength={200}
							onChange={(event) => updateRow(index, event.target.value)}
						/>
						{bank.length > 1 && (
							<Button
								type="button"
								size="sm"
								variant="ghost"
								aria-label={`Xóa mục ${label}`}
								onClick={() => {
									const next = removeBankRow(bank, items, typeId, index);
									onBankChange(next.bank);
									onItemsChange(next.items);
								}}
							>
								Xóa
							</Button>
						)}
					</div>
				);
			})}
			<div className="flex flex-wrap gap-2">
				<Button
					type="button"
					size="sm"
					variant="secondary"
					disabled={atMax}
					onClick={() => onBankChange([...bank, ""])}
				>
					Thêm mục
				</Button>
				<Button
					type="button"
					size="sm"
					variant="secondary"
					disabled={bank.length >= target}
					onClick={() => onBankChange(fillBankToCount(bank, target))}
				>
					Điền đủ {target} mục
				</Button>
			</div>
			{showErrors && error && (
				<p role="alert" className="text-destructive text-xs">
					{error}
				</p>
			)}
		</div>
	);
}
