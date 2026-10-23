import type { LibraryQuestionGroup } from "@teacher-os/api/library-contracts";
import {
	emptyItem,
	type QuestionItem,
} from "@teacher-os/ui/components/assignments/editor/assignment-presets";
import type { PartFormValue } from "./part-form";

/**
 * Helper thuần quản lý nhóm câu của một part (#420 Task 4.2 + moveQuestion
 * #424 Task 2.1). Mọi hàm NHẬN value cũ và TRẢ value mới (immutable) với
 * `startIndex` luôn được đánh lại — UI chỉ gọi rồi `setValue`. Import type
 * từ part-form để không tạo vòng import lúc chạy (part-form không import
 * runtime từ đây ngoài type).
 */

/** Part không khai nhóm → một nhóm ngầm phủ toàn bộ part. */
export function effectiveGroups(value: PartFormValue): LibraryQuestionGroup[] {
	if (value.groups.length > 0) return value.groups;
	return [
		{
			id: "implicit",
			type: value.type,
			instruction: "",
			startIndex: 0,
			count: value.questions.length,
			optionBank: value.optionBank,
			answersInline: false,
			splitContent: false,
			dragDrop: false,
		},
	];
}

/** Đánh lại `startIndex` cộng dồn theo `count`, giữ thứ tự nhóm. */
export function reindexGroups(groups: LibraryQuestionGroup[]) {
	let startIndex = 0;
	return groups.map((group) => {
		const reindexed = { ...group, startIndex };
		startIndex += group.count;
		return reindexed;
	});
}

/** Biến nhóm ngầm thành nhóm thật: intro → instruction nhóm đầu, optionBank
 * cấp part chuyển sang nhóm. Intro/bank cấp part không còn ô hiển thị khi
 * có nhóm nên không được giữ lại thành dữ liệu ẩn. */
export function splitIntoGroups(value: PartFormValue): PartFormValue {
	if (value.groups.length > 0) return value;
	return {
		...value,
		groups: [
			{
				id: crypto.randomUUID(),
				type: value.type,
				instruction: value.intro,
				startIndex: 0,
				count: value.questions.length,
				optionBank: value.optionBank,
				answersInline: false,
				splitContent: false,
				dragDrop: false,
			},
		],
		intro: "",
		optionBank: [],
	};
}

/** Thêm nhóm mới (1 câu rỗng) cuối danh sách; nếu đang ngầm thì tách trước. */
export function addGroup(value: PartFormValue, type: string): PartFormValue {
	const base = splitIntoGroups(value);
	const groups = [...base.groups];
	const start = groups.reduce((sum, group) => sum + group.count, 0);
	groups.push({
		id: crypto.randomUUID(),
		type,
		instruction: "",
		startIndex: start,
		count: 1,
		optionBank: [],
		answersInline: false,
		splitContent: false,
		dragDrop: false,
	});
	return {
		...base,
		groups: reindexGroups(groups),
		questions: [...base.questions, emptyItem(type)],
		type: groups[0]?.type ?? base.type,
	};
}

/** Xóa nhóm + đúng dải câu của nó. Về 1 nhóm cuối → hoàn dữ liệu về cấp
 * part (mirror `splitIntoGroups`: instruction → intro, optionBank → bank
 * part) rồi trở lại nhóm ngầm, không để mất dữ liệu ẩn. */
export function removeGroup(value: PartFormValue, gi: number): PartFormValue {
	if (value.groups.length === 0 || gi < 0 || gi >= value.groups.length) {
		return value;
	}
	const groups = value.groups.filter((_, index) => index !== gi);
	if (groups.length === 0) {
		// Nhóm duy nhất bị xóa → về nhóm ngầm; hoàn instruction/optionBank
		// của nhóm đó về cấp part (mirror splitIntoGroups) trước khi bỏ.
		const last = value.groups[0];
		if (!last) return value;
		return {
			...value,
			intro: last.instruction,
			optionBank: last.optionBank,
			questions: value.questions.slice(
				last.startIndex,
				last.startIndex + last.count,
			),
			groups: [],
		};
	}
	const removed = value.groups[gi];
	if (!removed) return value;
	const questions = value.questions.filter(
		(_, index) =>
			index < removed.startIndex || index >= removed.startIndex + removed.count,
	);
	return {
		...value,
		groups: reindexGroups(groups),
		questions,
		// Bất biến schema: part.type phải trùng nhóm đầu (nhóm đầu cũ có
		// thể vừa bị xóa).
		type: groups[0]?.type ?? value.type,
	};
}

/** Hoán đổi nhóm kèm dải câu; dạng bài của part theo nhóm đầu. */
export function moveGroup(
	value: PartFormValue,
	gi: number,
	dir: -1 | 1,
): PartFormValue {
	const target = gi + dir;
	if (
		value.groups.length === 0 ||
		gi < 0 ||
		gi >= value.groups.length ||
		target < 0 ||
		target >= value.groups.length
	) {
		return value;
	}
	const groups = [...value.groups];
	const a = groups[gi];
	const b = groups[target];
	if (!a || !b) return value;
	groups[gi] = b;
	groups[target] = a;

	const range = (group: LibraryQuestionGroup) =>
		value.questions.slice(group.startIndex, group.startIndex + group.count);
	const questions = [
		...range(a),
		...range(b),
		...value.questions.filter(
			(_, index) =>
				(index < a.startIndex || index >= a.startIndex + a.count) &&
				(index < b.startIndex || index >= b.startIndex + b.count),
		),
	];
	return {
		...value,
		groups: reindexGroups(groups),
		questions,
		type: groups[0]?.type ?? value.type,
	};
}

/** Thay toàn bộ dải câu của nhóm `gi`. */
export function setGroupItems(
	value: PartFormValue,
	gi: number,
	items: QuestionItem[],
): PartFormValue {
	const group = value.groups[gi];
	if (!group) return value;
	const groups = value.groups.map((entry, index) =>
		index === gi ? { ...entry, count: items.length } : entry,
	);
	const questions = [
		...value.questions.slice(0, group.startIndex),
		...items,
		...value.questions.slice(group.startIndex + group.count),
	];
	return { ...value, groups: reindexGroups(groups), questions };
}

/** Gộp field nhóm (type/instruction/optionBank/cờ). Đổi type → xóa type
 * riêng của từng câu trong dải (câu nhận dạng của nhóm); nhóm đầu thì
 * part.type đổi theo. */
export function patchGroup(
	value: PartFormValue,
	gi: number,
	patch: Partial<
		Pick<
			LibraryQuestionGroup,
			| "type"
			| "instruction"
			| "optionBank"
			| "answersInline"
			| "splitContent"
			| "dragDrop"
		>
	>,
): PartFormValue {
	const group = value.groups[gi];
	if (!group) return value;
	const groups = value.groups.map((entry, index) =>
		index === gi ? { ...entry, ...patch } : entry,
	);
	const questions =
		patch.type === undefined
			? value.questions
			: value.questions.map((question, index) => {
					if (
						index < group.startIndex ||
						index >= group.startIndex + group.count
					)
						return question;
					if (!question.type) return question;
					return { ...question, type: null };
				});
	return {
		...value,
		groups,
		questions,
		type: gi === 0 && patch.type !== undefined ? patch.type : value.type,
	};
}

/** Số câu tuyệt đối của câu `offset` trong `group` (offset 0-based). */
export function groupQuestionNumber(
	qStart: number,
	group: LibraryQuestionGroup,
	offset: number,
): number {
	return qStart + group.startIndex + offset;
}

/** Hoán đổi câu `offset` với câu liền kề theo `dir` TRONG dải của nhóm `gi`
 * — không cho vượt biên nhóm (câu đầu/cuối nhóm là no-op). */
export function moveQuestion(
	value: PartFormValue,
	gi: number,
	offset: number,
	dir: -1 | 1,
): PartFormValue {
	const group = value.groups[gi] ?? effectiveGroups(value)[gi];
	if (!group) return value;
	const target = offset + dir;
	if (target < 0 || target >= group.count) return value;
	const from = group.startIndex + offset;
	const to = group.startIndex + target;
	const questions = [...value.questions];
	const a = questions[from];
	const b = questions[to];
	if (!a || !b) return value;
	questions[from] = b;
	questions[to] = a;
	return { ...value, questions };
}
