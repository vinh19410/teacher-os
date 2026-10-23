import type { GroupCardTab } from "./group-card";
import type { PartFormValue } from "./part-form";

/**
 * View-state thẻ part (#424 Task 3.4) — sống sót remount qua `initialView`
 * (trang giữ `viewStateBySlot` cập nhật từ `onActivePositionChange`).
 */
export type PartTabId = "content" | "questions";

export interface PartViewState {
	partTab: PartTabId;
	openGroup: number | null;
	groupTabs: Record<number, GroupCardTab>;
	openRowByGroup: Record<number, number | null>;
}

export interface PartFormHandle {
	/** Toolbar (phase 4) gọi thay nút «Lưu part» — true khi lưu thành công. */
	save: () => Promise<boolean>;
}

export interface FocusTarget {
	group: number;
	question?: number;
	/** Tăng mỗi lần bấm cây — cùng target bấm lại vẫn kích hoạt. */
	nonce: number;
}

/** Key consume-once của focusTarget (null → ""). */
export function focusKeyOf(target: FocusTarget | null | undefined): string {
	if (!target) return "";
	return `${target.group}:${target.question ?? ""}:${target.nonce}`;
}

/**
 * Id element đích cuộn cho focusTarget. Part phẳng (không nhóm) hàng
 * AnswerKeyGrid dùng id `${slot}-q${n}` (partId={slot}); part có nhóm dùng
 * `group-${slot}-${gi}(-q${n})` (kongming wave-3/4 F2).
 */
export function focusRowId(
	slot: string,
	group: number,
	question: number | undefined,
	flat: boolean,
): string {
	if (flat) {
		// `slot` không trùng id nào trong DOM (review RF-F6) — nhóm ngầm của
		// part phẳng cuộn tới hàng đầu tiên.
		return question === undefined ? `${slot}-q0` : `${slot}-q${question}`;
	}
	return question === undefined
		? `group-${slot}-${group}`
		: `group-${slot}-${group}-q${question}`;
}

/** Điểm đến khi lưu bị chặn: tab part / nhóm / tab nhóm / hàng chứa lỗi đầu. */
export interface SaveFocusPlan {
	partTab: PartTabId;
	group?: number;
	groupTab?: GroupCardTab;
	row?: number;
	/** Field tab Nội dung (id `${uid}-${fieldKey}`). */
	fieldKey?: string;
}

function firstIncompleteQuestionGroup(
	value: PartFormValue,
): { group: number; row: number } | null {
	for (const [gi, group] of value.groups.entries()) {
		const slice = value.questions.slice(
			group.startIndex,
			group.startIndex + group.count,
		);
		for (const [offset, question] of slice.entries()) {
			if (!question.stem.trim() || !question.answer.trim()) {
				return { group: gi, row: offset };
			}
		}
	}
	return null;
}

/** Từ errors của `partInputFromValue`: định vị chỗ lỗi ĐẦU TIÊN để mở/focus. */
export function firstIssueFocusPlan(
	errors: Record<string, string>,
	value: PartFormValue,
): SaveFocusPlan | null {
	for (const key of Object.keys(errors)) {
		const groupMatch = /^groups\.(\d+)\.([a-z]+)$/i.exec(key);
		if (groupMatch) {
			const gi = Number(groupMatch[1]);
			if (gi >= value.groups.length) return { partTab: "questions" };
			const field = groupMatch[2];
			return {
				partTab: "questions",
				group: gi,
				groupTab:
					field === "type" || field === "answersInline"
						? "settings"
						: "questions",
			};
		}
		if (key === "questions" || key === "imageUrl" || key === "optionBank") {
			if (value.groups.length === 0) return { partTab: "questions" };
			const found = firstIncompleteQuestionGroup(value);
			if (found) {
				return {
					partTab: "questions",
					group: found.group,
					groupTab: "questions",
					row: found.row,
				};
			}
			return { partTab: "questions", group: 0, groupTab: "questions" };
		}
		if (key === "type") return { partTab: "questions" };
		return { partTab: "content", fieldKey: key };
	}
	return null;
}

/** Xóa nhóm `gi` — key openRow/tab dời THEO PHẦN TỬ (không chỉ clamp). */
export function viewStateOnRemoveGroup(
	view: PartViewState,
	gi: number,
	groupCountAfter: number,
): PartViewState {
	const shiftKeys = <T>(record: Record<number, T>) => {
		const next: Record<number, T> = {};
		for (const [key, entry] of Object.entries(record)) {
			const index = Number(key);
			if (index === gi) continue;
			next[index < gi ? index : index - 1] = entry;
		}
		return next;
	};
	const openGroup =
		view.openGroup === null || groupCountAfter === 0
			? // Xóa nhóm cuối → về chế độ phẳng; -1 phá bất biến number|null và
				// khiến "Chia thành nhiều nhóm câu" sau đó không mở nhóm nào
				// (review RF-F2).
				null
			: Math.min(
					view.openGroup > gi ? view.openGroup - 1 : view.openGroup,
					groupCountAfter - 1,
				);
	return {
		...view,
		openRowByGroup: shiftKeys(view.openRowByGroup),
		groupTabs: shiftKeys(view.groupTabs),
		openGroup,
	};
}

/** Hoán đổi nhóm `gi` với `gi + dir` — cặp key di chuyển theo nhóm được swap. */
export function viewStateOnMoveGroup(
	view: PartViewState,
	gi: number,
	dir: -1 | 1,
): PartViewState {
	const target = gi + dir;
	const swapKeys = <T>(record: Record<number, T>) => {
		if (!(gi in record) && !(target in record)) return record;
		const next = { ...record };
		const a = next[gi];
		const b = next[target];
		if (b !== undefined) next[gi] = b;
		else delete next[gi];
		if (a !== undefined) next[target] = a;
		else delete next[target];
		return next;
	};
	const openGroup =
		view.openGroup === gi
			? target
			: view.openGroup === target
				? gi
				: view.openGroup;
	return {
		...view,
		openRowByGroup: swapKeys(view.openRowByGroup),
		groupTabs: swapKeys(view.groupTabs),
		openGroup,
	};
}
