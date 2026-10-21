import { Input } from "@teacher-os/ui/components/input";
import { ChevronDown, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/** Ô select nhỏ theo design-v2 (`Select`): nhãn làm option trống đầu. */
export function PracticeSelect({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: string;
	options: readonly string[];
	onChange: (value: string) => void;
}) {
	return (
		<label className="relative inline-flex">
			<span className="sr-only">{label}</span>
			<select
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className="h-9 appearance-none rounded-md border border-input bg-background pr-8 pl-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
			>
				<option value="">{label}</option>
				{options.map((option) => (
					<option key={option} value={option}>
						{option}
					</option>
				))}
			</select>
			<ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
		</label>
	);
}

/**
 * Hàng filter catalog luyện tập (AGENTS.md): filter sống trong URL — caller
 * sync `collection`/`q` vào search param; ô search debounce 300ms rồi mới
 * gọi `onSearch` (không đập API mỗi phím).
 */
export function PracticeFilters({
	searchLabel,
	collections,
	collectionValue,
	onCollectionChange,
	onSearch,
}: {
	searchLabel: string;
	collections: readonly string[];
	collectionValue: string;
	onCollectionChange: (value: string) => void;
	onSearch: (q: string) => void;
}) {
	const [draft, setDraft] = useState("");

	useEffect(() => {
		// Debounce 300ms (AGENTS.md): chỉ `draft` là nguồn chạy lại — caller
		// truyền callback ổn định (navigate), không cần liệt kê deps.
		const timer = setTimeout(() => {
			onSearch(draft.trim());
		}, 300);
		return () => clearTimeout(timer);
		// biome-ignore lint/correctness/useExhaustiveDependencies: debounce
		// chỉ phụ thuộc draft; onSearch là callback ổn định từ route.
	}, [draft]);

	return (
		<div className="mb-3 flex flex-wrap items-center gap-2">
			<PracticeSelect
				label="Bộ đề"
				value={collectionValue}
				options={collections}
				onChange={onCollectionChange}
			/>
			<div className="relative min-w-[240px] flex-1">
				<Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					placeholder={searchLabel}
					aria-label={searchLabel}
					className={cn("h-9 pl-8")}
				/>
			</div>
		</div>
	);
}
