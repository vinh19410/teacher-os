import type { VocabSuggestionItem } from "@teacher-os/api/contracts";
import { buttonVariants } from "@teacher-os/ui/components/button";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

function SuggestionCard({
	item,
	isBusy,
	disabled,
	onAccept,
	onDismiss,
}: {
	item: VocabSuggestionItem;
	isBusy: boolean;
	disabled: boolean;
	onAccept: (item: VocabSuggestionItem) => void;
	onDismiss: (item: VocabSuggestionItem) => void;
}) {
	const createdMs = Date.parse(item.createdAt);
	const createdDate = Number.isFinite(createdMs)
		? new Date(createdMs).toLocaleDateString("vi-VN", {
				timeZone: "Asia/Ho_Chi_Minh",
			})
		: "";
	const note = item.note?.trim() ?? "";

	return (
		<article
			data-testid={`vocab-suggestion-card-${item.id}`}
			aria-labelledby={`vocab-sug-title-${item.id}`}
			className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm"
		>
			<div className="flex items-start gap-2 text-muted-foreground text-sm">
				<Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
				<div className="min-w-0 flex-1 space-y-1">
					<p className="text-xs">
						{createdDate
							? `Giáo viên gợi ý · ${createdDate}`
							: "Giáo viên gợi ý"}
					</p>
					{note ? (
						<p
							data-testid={`vocab-suggestion-note-${item.id}`}
							className="text-muted-foreground text-sm"
						>
							{item.note}
						</p>
					) : null}
				</div>
			</div>

			<h3
				id={`vocab-sug-title-${item.id}`}
				className="font-semibold text-foreground text-lg tracking-tight"
			>
				{item.title}
			</h3>

			<div className="mt-auto flex flex-wrap items-center justify-between gap-2">
				<span className="inline-flex items-center rounded-full border bg-background px-2.5 py-0.5 font-medium text-muted-foreground text-xs tabular-nums">
					{item.wordCount} từ
				</span>
				<div className="flex items-center gap-2">
					<button
						type="button"
						disabled={disabled}
						data-testid={`vocab-suggestion-dismiss-${item.id}`}
						aria-label={`Ẩn gợi ý ${item.title}`}
						onClick={() => onDismiss(item)}
						className={cn(
							buttonVariants({ variant: "ghost", size: "sm" }),
							"min-h-9",
						)}
					>
						Ẩn
					</button>
					<button
						type="button"
						disabled={disabled}
						data-testid={`vocab-suggestion-accept-${item.id}`}
						aria-label={`Bắt đầu học ${item.title}`}
						onClick={() => onAccept(item)}
						className={cn(
							buttonVariants({ variant: "default", size: "sm" }),
							"min-h-9",
						)}
					>
						{isBusy ? "Đang thêm…" : "Bắt đầu học"}
					</button>
				</div>
			</div>
		</article>
	);
}

/**
 * Section "Gợi ý cho bạn" trên trang `/practice/vocabulary` của học viên (#363):
 * - Ẩn hoàn toàn khi không có gợi ý nào đang pending.
 * - "Bắt đầu học" -> accept suggestion + mở chi tiết bộ từ.
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
			aria-labelledby="vocab-suggestions-heading"
			className="space-y-4"
		>
			<div>
				<h2
					id="vocab-suggestions-heading"
					className="font-semibold text-foreground text-xl tracking-tight"
				>
					Gợi ý cho bạn
				</h2>
				<p className="text-muted-foreground text-sm">
					Không bắt buộc · Chọn dựa trên bài làm và lớp học của bạn.
				</p>
			</div>

			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				{suggestions.map((item) => (
					<SuggestionCard
						key={item.id}
						item={item}
						isBusy={busyId === item.id}
						disabled={busyId !== null}
						onAccept={onAccept}
						onDismiss={onDismiss}
					/>
				))}
			</div>

			{errorMsg ? (
				<p
					role="alert"
					data-testid="vocab-suggestions-error"
					className="text-destructive text-sm"
				>
					{errorMsg}
				</p>
			) : null}
		</section>
	);
}
