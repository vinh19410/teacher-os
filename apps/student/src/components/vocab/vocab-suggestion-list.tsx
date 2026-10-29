import type { VocabSuggestionItem } from "@teacher-os/api/contracts";

function SuggestionCard({
	item,
	disabled,
	onAccept,
	onDismiss,
}: {
	item: VocabSuggestionItem;
	disabled: boolean;
	onAccept: (item: VocabSuggestionItem) => void;
	onDismiss: (item: VocabSuggestionItem) => void;
}) {
	const createdDate = new Date(item.createdAt).toLocaleDateString("vi-VN");

	return (
		<div
			data-testid={`vocab-suggestion-card-${item.id}`}
			className="flex flex-col justify-between gap-4 rounded-md rounded-xl border bg-card p-5 shadow-sm"
		>
			<div>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<span className="rounded rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-primary uppercase tracking-widest">
						Giáo viên gợi ý
					</span>
					<span className="font-mono text-[11px] text-muted-foreground">
						{item.wordCount} từ · {createdDate}
					</span>
				</div>
				<h3 className="mt-2 font-extrabold text-foreground text-lg">
					{item.title}
				</h3>
				{item.note ? (
					<p
						data-testid={`vocab-suggestion-note-${item.id}`}
						className="mt-1.5 text-muted-foreground text-sm"
					>
						{item.note}
					</p>
				) : null}
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<button
					type="button"
					disabled={disabled}
					data-testid={`vocab-suggestion-accept-${item.id}`}
					aria-label={`Bắt đầu học ${item.title}`}
					onClick={() => onAccept(item)}
					className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 font-medium text-bg text-xs transition-colors duration-150 hover:bg-primary hover:text-primary-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:opacity-40"
				>
					Bắt đầu học
				</button>
				<button
					type="button"
					disabled={disabled}
					data-testid={`vocab-suggestion-dismiss-${item.id}`}
					aria-label={`Ẩn gợi ý ${item.title}`}
					onClick={() => onDismiss(item)}
					className="inline-flex items-center justify-center rounded-md rounded-md border border-input bg-transparent px-3.5 py-2 font-medium text-foreground text-xs transition-colors duration-150 hover:border-primary focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:opacity-40"
				>
					Ẩn
				</button>
			</div>
		</div>
	);
}

/**
 * Section "Gợi ý cho bạn" trên trang `/practice/vocabulary` của học viên (#363):
 * - Ẩn hoàn toàn khi không có gợi ý nào đang pending.
 * - "Bắt đầu học" -> accept suggestion + mở session học bộ từ.
 * - "Ẩn" -> dismiss suggestion (biến mất khỏi danh sách, không bắt buộc học).
 */
export function VocabSuggestionList({
	suggestions,
	busyId = null,
	errorMsg = null,
	onAccept,
	onDismiss,
}: {
	suggestions: VocabSuggestionItem[];
	busyId?: string | null;
	errorMsg?: string | null;
	onAccept: (item: VocabSuggestionItem) => void;
	onDismiss: (item: VocabSuggestionItem) => void;
}) {
	if (suggestions.length === 0) {
		return null;
	}

	return (
		<section
			data-testid="vocab-suggestions-section"
			aria-label="Gợi ý cho bạn"
			className="space-y-4"
		>
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h2 className="font-extrabold text-foreground text-xl tracking-[-0.02em]">
					Gợi ý cho bạn
				</h2>
				<span className="font-mono text-muted-foreground text-xs">
					Không bắt buộc · Chọn bộ từ bạn muốn ôn thêm
				</span>
			</div>

			{errorMsg ? (
				<p
					data-testid="vocab-suggestions-error"
					className="font-mono text-primary text-xs"
				>
					{errorMsg}
				</p>
			) : null}

			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				{suggestions.map((item) => (
					<SuggestionCard
						key={item.id}
						item={item}
						disabled={busyId !== null}
						onAccept={onAccept}
						onDismiss={onDismiss}
					/>
				))}
			</div>
		</section>
	);
}
