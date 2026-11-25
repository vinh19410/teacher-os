import {
	PRACTICE_FILTER_MAX_LENGTH,
	parsePracticePageParam,
} from "@teacher-os/api/contracts";
import { Button } from "@teacher-os/ui/components/button";
import { Input } from "@teacher-os/ui/components/input";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface PracticeSelectOption {
	value: string;
	label: string;
}

export interface PracticeSearchParams {
	collection?: string;
	part?: string;
	type?: string;
	band?: string;
	q?: string;
	page?: number;
}

function parseFilterString(raw: unknown): string | undefined {
	let text: string | null = null;
	if (typeof raw === "string") {
		text = raw;
	} else if (typeof raw === "number" && Number.isFinite(raw)) {
		text = String(raw);
	}
	if (text === null) return undefined;
	const trimmed = text.trim().slice(0, PRACTICE_FILTER_MAX_LENGTH);
	return trimmed || undefined;
}

function parseBandParam(raw: unknown): string | undefined {
	if (typeof raw === "number" && Number.isFinite(raw)) {
		return Number.isInteger(raw) ? raw.toFixed(1) : String(raw);
	}
	return parseFilterString(raw);
}

function toRawPageString(raw: unknown): string | undefined {
	if (typeof raw === "string") return raw;
	if (typeof raw === "number" && Number.isSafeInteger(raw)) return String(raw);
	return undefined;
}

/**
 * Chuẩn hóa search params của route `/practice/$skill`: xử lý việc TanStack
 * Router mặc định chạy `JSON.parse` trên query string (`?band=6.0` → `6`,
 * `?q=18` → `18`), giới hạn độ dài theo `PRACTICE_FILTER_MAX_LENGTH`, và chỉ
 * giữ `page` trên URL khi `page > 1` trong biên hợp lệ.
 */
export function parsePracticeSearch(
	search: Record<string, unknown>,
): PracticeSearchParams {
	const rawPage =
		search.page === undefined
			? null
			: parsePracticePageParam(toRawPageString(search.page));
	return {
		collection: parseFilterString(search.collection),
		part: parseFilterString(search.part),
		type: parseFilterString(search.type),
		band: parseBandParam(search.band),
		q: parseFilterString(search.q),
		page: rawPage !== null && rawPage > 1 ? rawPage : undefined,
	};
}

/** Ô select nhỏ theo design-v2 (`Select`): nhãn làm option trống đầu. */
export function PracticeSelect({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: string;
	options: readonly (string | PracticeSelectOption)[];
	onChange: (value: string) => void;
}) {
	return (
		<label className="inline-flex min-w-0 max-w-full">
			<span className="sr-only">{label}</span>
			<select
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className="select-chevron h-9 min-w-0 max-w-full truncate rounded-md border border-input bg-background pr-9 pl-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
			>
				<option value="">{label}</option>
				{options.map((option) => {
					const opt =
						typeof option === "string"
							? { value: option, label: option }
							: option;
					return (
						<option key={opt.value} value={opt.value}>
							{opt.label}
						</option>
					);
				})}
			</select>
		</label>
	);
}

/**
 * Hàng filter catalog luyện tập (AGENTS.md): filter sống trong URL — caller
 * sync `collection`/`part`/`type`/`band`/`q` vào search param; ô search
 * debounce 300ms mới gọi `onSearch` (qua ref để không dính stale closure).
 */
export function PracticeFilters({
	searchLabel,
	collections,
	collectionValue,
	parts = [],
	partValue = "",
	types = [],
	typeValue = "",
	bands = [],
	bandValue = "",
	qValue = "",
	hasActiveFilters = false,
	resetSignal = 0,
	onCollectionChange,
	onPartChange,
	onTypeChange,
	onBandChange,
	onSearch,
	onReset,
}: {
	searchLabel: string;
	collections: readonly (string | PracticeSelectOption)[];
	collectionValue: string;
	parts?: readonly (string | PracticeSelectOption)[];
	partValue?: string;
	types?: readonly (string | PracticeSelectOption)[];
	typeValue?: string;
	bands?: readonly (string | PracticeSelectOption)[];
	bandValue?: string;
	qValue?: string;
	hasActiveFilters?: boolean;
	resetSignal?: number;
	onCollectionChange: (value: string) => void;
	onPartChange?: (value: string) => void;
	onTypeChange?: (value: string) => void;
	onBandChange?: (value: string) => void;
	onSearch: (q: string) => void;
	onReset?: () => void;
}) {
	const [draft, setDraft] = useState(qValue);
	const lastEmittedRef = useRef(qValue);
	const onSearchRef = useRef(onSearch);
	onSearchRef.current = onSearch;
	const prevResetSignalRef = useRef(resetSignal);

	useEffect(() => {
		lastEmittedRef.current = qValue;
		setDraft(qValue);
	}, [qValue]);

	useEffect(() => {
		if (prevResetSignalRef.current === resetSignal) return;
		prevResetSignalRef.current = resetSignal;
		lastEmittedRef.current = "";
		setDraft("");
	}, [resetSignal]);

	useEffect(() => {
		const trimmed = draft.trim();
		if (trimmed === qValue || trimmed === lastEmittedRef.current) return;
		const timer = setTimeout(() => {
			lastEmittedRef.current = trimmed;
			onSearchRef.current(trimmed);
		}, 300);
		return () => clearTimeout(timer);
	}, [draft, qValue]);

	const handleResetClick = () => {
		lastEmittedRef.current = "";
		setDraft("");
		onReset?.();
	};

	return (
		<div className="mb-3 flex flex-wrap items-center gap-2">
			{collections.length > 0 && (
				<PracticeSelect
					label="Bộ đề"
					value={collectionValue}
					options={collections}
					onChange={onCollectionChange}
				/>
			)}
			{parts.length > 0 && onPartChange && (
				<PracticeSelect
					label="Phần thi"
					value={partValue}
					options={parts}
					onChange={onPartChange}
				/>
			)}
			{types.length > 0 && onTypeChange && (
				<PracticeSelect
					label="Dạng bài"
					value={typeValue}
					options={types}
					onChange={onTypeChange}
				/>
			)}
			{bands.length > 0 && onBandChange && (
				<PracticeSelect
					label="Band"
					value={bandValue}
					options={bands}
					onChange={onBandChange}
				/>
			)}
			<div className="relative min-w-[200px] max-w-full flex-1">
				<Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={draft}
					maxLength={PRACTICE_FILTER_MAX_LENGTH}
					onChange={(event) => setDraft(event.target.value)}
					placeholder={searchLabel}
					aria-label={searchLabel}
					className={cn("h-9 pl-8")}
				/>
			</div>
			{hasActiveFilters && onReset && (
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={handleResetClick}
					className="h-9 shrink-0"
				>
					<X className="size-3.5" aria-hidden="true" />
					Xóa bộ lọc
				</Button>
			)}
		</div>
	);
}
