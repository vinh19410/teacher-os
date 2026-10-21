import { ASSIGNMENT_ANSWER_CHOICES } from "@teacher-os/api/contracts";

/** Label kinds with positional bank labels (`text` rows carry none). */
export type OptionBankKind = keyof typeof ASSIGNMENT_ANSWER_CHOICES | "text";

/**
 * Positional display label for bank row `index` under `kind`: A… for the
 * letter kind, i… for the roman headings kind; "" beyond the bank or for
 * kinds without positional labels. Same rule as web's
 * `assignment-presets.bankLabel` (the editor's copy) — the label ARRAYS come
 * from the one api constant.
 */
function bankLabel(kind: OptionBankKind, index: number): string {
	if (kind !== "letter" && kind !== "roman") return "";
	return ASSIGNMENT_ANSWER_CHOICES[kind][index] ?? "";
}

/**
 * Structured option bank (phase-02 FR6) rendered as the student sees it: a
 * labeled choice list. One renderer shared by the preview papers, the
 * bank-list aside and the take screen — an empty bank (legacy prompt) warns
 * visibly instead of rendering nothing.
 */
export function OptionBankList({
	bank,
	kind,
}: {
	bank: string[];
	kind: OptionBankKind;
}) {
	if (bank.length === 0) {
		return (
			<p
				role="alert"
				className="rounded-md border border-danger/30 bg-muted p-2 text-danger text-xs"
			>
				Thiếu ngân hàng lựa chọn
			</p>
		);
	}
	return (
		<div className="rounded-md border border-border bg-muted p-3">
			<p className="font-medium text-muted-foreground text-xs">
				Ngân hàng lựa chọn
			</p>
			<ol className="mt-1.5 flex flex-col gap-1">
				{bank.map((row, index) => (
					<li key={index} className="text-sm">
						<span className="font-medium font-mono">
							{bankLabel(kind, index)}
						</span>{" "}
						{row}
					</li>
				))}
			</ol>
		</div>
	);
}
