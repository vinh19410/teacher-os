import type {
	PlacementBand,
	PlacementClip,
	PlacementContent,
	PlacementListeningQuestion,
	PlacementVgQuestion,
} from "@teacher-os/api/placement-test-contracts";

/**
 * Pure state manipulation helpers cho màn sửa đề `/placement-test` (#515 Phase 3):
 * thêm, xóa, đổi thứ tự câu hỏi / đoạn nghe và đồng bộ tổng điểm ngưỡng CEFR.
 */

function nextUniqueId(prefix: string, existingIds: Set<string>): string {
	let idx = existingIds.size + 1;
	while (existingIds.has(`${prefix}-${String(idx).padStart(2, "0")}`)) {
		idx += 1;
	}
	return `${prefix}-${String(idx).padStart(2, "0")}`;
}

export function collectQuestionIds(content: PlacementContent): Set<string> {
	const ids = new Set<string>();
	for (const q of content.parts[0].questions) {
		ids.add(q.id);
	}
	for (const clip of content.parts[1].clips) {
		for (const q of clip.questions) {
			ids.add(q.id);
		}
	}
	return ids;
}

export function countTotalQuestions(content: PlacementContent): number {
	const vgCount = content.parts[0].questions.length;
	const listeningCount = content.parts[1].clips.reduce(
		(sum, clip) => sum + clip.questions.length,
		0,
	);
	return vgCount + listeningCount;
}

export function countListeningQuestions(content: PlacementContent): number {
	return content.parts[1].clips.reduce(
		(sum, clip) => sum + clip.questions.length,
		0,
	);
}

export function moveArrayItem<T>(
	items: readonly T[],
	fromIndex: number,
	toIndex: number,
): T[] {
	if (
		fromIndex < 0 ||
		fromIndex >= items.length ||
		toIndex < 0 ||
		toIndex >= items.length ||
		fromIndex === toIndex
	) {
		return [...items];
	}
	const copy = [...items];
	const [picked] = copy.splice(fromIndex, 1);
	if (picked !== undefined) {
		copy.splice(toIndex, 0, picked);
	}
	return copy;
}

export function addVgQuestion(content: PlacementContent): PlacementContent {
	const existing = collectQuestionIds(content);
	const newQuestion: PlacementVgQuestion = {
		id: nextUniqueId("vg", existing),
		kind: "grammar",
		level: "A2",
		prompt: "",
		options: ["", "", "", ""],
		answer: null,
	};
	return {
		...content,
		parts: [
			{
				...content.parts[0],
				questions: [...content.parts[0].questions, newQuestion],
			},
			content.parts[1],
		],
	};
}

export function updateVgQuestion(
	content: PlacementContent,
	index: number,
	patch: Partial<PlacementVgQuestion>,
): PlacementContent {
	return {
		...content,
		parts: [
			{
				...content.parts[0],
				questions: content.parts[0].questions.map((q, idx) =>
					idx === index ? { ...q, ...patch } : q,
				),
			},
			content.parts[1],
		],
	};
}

export function removeVgQuestion(
	content: PlacementContent,
	index: number,
): PlacementContent {
	return {
		...content,
		parts: [
			{
				...content.parts[0],
				questions: content.parts[0].questions.filter((_, idx) => idx !== index),
			},
			content.parts[1],
		],
	};
}

export function moveVgQuestion(
	content: PlacementContent,
	fromIndex: number,
	toIndex: number,
): PlacementContent {
	return {
		...content,
		parts: [
			{
				...content.parts[0],
				questions: moveArrayItem(
					content.parts[0].questions,
					fromIndex,
					toIndex,
				),
			},
			content.parts[1],
		],
	};
}

export function addListeningClip(content: PlacementContent): PlacementContent {
	const existingClipIds = new Set(content.parts[1].clips.map((c) => c.id));
	let clipNum = existingClipIds.size + 1;
	while (existingClipIds.has(`clip-${clipNum}`)) {
		clipNum += 1;
	}
	const clipId = `clip-${clipNum}`;
	const existingQIds = collectQuestionIds(content);
	const firstQ: PlacementListeningQuestion = {
		id: nextUniqueId("l", existingQIds),
		level: "B1",
		prompt: "",
		options: ["", "", "", ""],
		answer: null,
	};
	const newClip: PlacementClip = {
		id: clipId,
		audioId: null,
		maxPlays: 2,
		level: "B1",
		title: `Đoạn nghe ${clipNum}`,
		questions: [firstQ],
	};
	return {
		...content,
		parts: [
			content.parts[0],
			{
				...content.parts[1],
				clips: [...content.parts[1].clips, newClip],
			},
		],
	};
}

export function updateListeningClip(
	content: PlacementContent,
	clipIndex: number,
	patch: Partial<PlacementClip>,
): PlacementContent {
	return {
		...content,
		parts: [
			content.parts[0],
			{
				...content.parts[1],
				clips: content.parts[1].clips.map((clip, idx) =>
					idx === clipIndex ? { ...clip, ...patch } : clip,
				),
			},
		],
	};
}

export function removeListeningClip(
	content: PlacementContent,
	clipIndex: number,
): PlacementContent {
	return {
		...content,
		parts: [
			content.parts[0],
			{
				...content.parts[1],
				clips: content.parts[1].clips.filter((_, idx) => idx !== clipIndex),
			},
		],
	};
}

export function moveListeningClip(
	content: PlacementContent,
	fromIndex: number,
	toIndex: number,
): PlacementContent {
	return {
		...content,
		parts: [
			content.parts[0],
			{
				...content.parts[1],
				clips: moveArrayItem(content.parts[1].clips, fromIndex, toIndex),
			},
		],
	};
}

export function addClipQuestion(
	content: PlacementContent,
	clipIndex: number,
): PlacementContent {
	const existingQIds = collectQuestionIds(content);
	const clip = content.parts[1].clips[clipIndex];
	const newQ: PlacementListeningQuestion = {
		id: nextUniqueId("l", existingQIds),
		level: clip?.level || "B1",
		prompt: "",
		options: ["", "", "", ""],
		answer: null,
	};
	return {
		...content,
		parts: [
			content.parts[0],
			{
				...content.parts[1],
				clips: content.parts[1].clips.map((c, idx) =>
					idx === clipIndex ? { ...c, questions: [...c.questions, newQ] } : c,
				),
			},
		],
	};
}

export function updateClipQuestion(
	content: PlacementContent,
	clipIndex: number,
	questionIndex: number,
	patch: Partial<PlacementListeningQuestion>,
): PlacementContent {
	return {
		...content,
		parts: [
			content.parts[0],
			{
				...content.parts[1],
				clips: content.parts[1].clips.map((c, idx) =>
					idx === clipIndex
						? {
								...c,
								questions: c.questions.map((q, qIdx) =>
									qIdx === questionIndex ? { ...q, ...patch } : q,
								),
							}
						: c,
				),
			},
		],
	};
}

export function removeClipQuestion(
	content: PlacementContent,
	clipIndex: number,
	questionIndex: number,
): PlacementContent {
	return {
		...content,
		parts: [
			content.parts[0],
			{
				...content.parts[1],
				clips: content.parts[1].clips.map((c, idx) =>
					idx === clipIndex
						? {
								...c,
								questions: c.questions.filter(
									(_, qIdx) => qIdx !== questionIndex,
								),
							}
						: c,
				),
			},
		],
	};
}

export function moveClipQuestion(
	content: PlacementContent,
	clipIndex: number,
	fromIndex: number,
	toIndex: number,
): PlacementContent {
	return {
		...content,
		parts: [
			content.parts[0],
			{
				...content.parts[1],
				clips: content.parts[1].clips.map((c, idx) =>
					idx === clipIndex
						? {
								...c,
								questions: moveArrayItem(c.questions, fromIndex, toIndex),
							}
						: c,
				),
			},
		],
	};
}

export function updateBand(
	content: PlacementContent,
	bandIndex: number,
	patch: Partial<PlacementBand>,
): PlacementContent {
	return {
		...content,
		bands: content.bands.map((b, idx) =>
			idx === bandIndex ? { ...b, ...patch } : b,
		),
	};
}

export function addBand(content: PlacementContent): PlacementContent {
	const total = countTotalQuestions(content);
	const last = content.bands[content.bands.length - 1];
	const nextMin = last ? last.max + 1 : 0;
	const nextMax = Math.max(nextMin, total);
	const newBand: PlacementBand = {
		min: nextMin,
		max: nextMax,
		cefr: "B2",
		course: "ielts-advanced",
	};
	return {
		...content,
		bands: [...content.bands, newBand],
	};
}

export function removeBand(
	content: PlacementContent,
	bandIndex: number,
): PlacementContent {
	return {
		...content,
		bands: content.bands.filter((_, idx) => idx !== bandIndex),
	};
}
