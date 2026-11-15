import { LEAD_COURSE_LABELS } from "@teacher-os/api/lead-contracts";
import type {
	PlacementBand,
	PlacementClip,
	PlacementContent,
	PlacementListeningGapQuestion,
	PlacementListeningMcqQuestion,
	PlacementListeningQuestion,
	PlacementReadingPassage,
	PlacementReadingPassageKind,
	PlacementReadingQuestion,
	PlacementSpeakingTask,
	PlacementVgQuestion,
	PlacementWritingPart,
} from "@teacher-os/api/placement-test-contracts";

/**
 * Pure state manipulation helpers cho màn sửa đề 5 kỹ năng `/placement-test` (#515, #721).
 */

type ListeningPart = PlacementContent["parts"][0];
type VgPart = PlacementContent["parts"][1];
type ReadingPart = PlacementContent["parts"][2];
type WritingPart = PlacementContent["parts"][3];
type SpeakingPart = PlacementContent["parts"][4];

function nextUniqueId(prefix: string, existingIds: Set<string>): string {
	let idx = existingIds.size + 1;
	while (existingIds.has(`${prefix}-${String(idx).padStart(2, "0")}`)) {
		idx += 1;
	}
	return `${prefix}-${String(idx).padStart(2, "0")}`;
}

export function collectQuestionIds(content: PlacementContent): Set<string> {
	const ids = new Set<string>();
	for (const clip of content.parts[0].clips) {
		for (const q of clip.questions) ids.add(q.id);
	}
	for (const q of content.parts[1].questions) {
		ids.add(q.id);
	}
	for (const passage of content.parts[2].passages) {
		for (const q of passage.questions) ids.add(q.id);
	}
	return ids;
}

export function collectSpeakingIds(content: PlacementContent): Set<string> {
	return new Set(content.parts[4].tasks.map((t) => t.id));
}

export function countListeningQuestions(content: PlacementContent): number {
	return content.parts[0].clips.reduce(
		(sum, clip) => sum + clip.questions.length,
		0,
	);
}

export function countVgQuestions(content: PlacementContent): number {
	return content.parts[1].questions.length;
}

export function countReadingQuestions(content: PlacementContent): number {
	return content.parts[2].passages.reduce(
		(sum, passage) => sum + passage.questions.length,
		0,
	);
}

export function countTotalQuestions(content: PlacementContent): number {
	return (
		countListeningQuestions(content) +
		countVgQuestions(content) +
		countReadingQuestions(content)
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

function replaceListening(
	content: PlacementContent,
	next: ListeningPart,
): PlacementContent {
	return {
		...content,
		parts: [
			next,
			content.parts[1],
			content.parts[2],
			content.parts[3],
			content.parts[4],
		],
	};
}

function replaceVg(content: PlacementContent, next: VgPart): PlacementContent {
	return {
		...content,
		parts: [
			content.parts[0],
			next,
			content.parts[2],
			content.parts[3],
			content.parts[4],
		],
	};
}

function replaceReading(
	content: PlacementContent,
	next: ReadingPart,
): PlacementContent {
	return {
		...content,
		parts: [
			content.parts[0],
			content.parts[1],
			next,
			content.parts[3],
			content.parts[4],
		],
	};
}

function replaceWriting(
	content: PlacementContent,
	next: WritingPart,
): PlacementContent {
	return {
		...content,
		parts: [
			content.parts[0],
			content.parts[1],
			content.parts[2],
			next,
			content.parts[4],
		],
	};
}

function replaceSpeaking(
	content: PlacementContent,
	next: SpeakingPart,
): PlacementContent {
	return {
		...content,
		parts: [
			content.parts[0],
			content.parts[1],
			content.parts[2],
			content.parts[3],
			next,
		],
	};
}

// ---------------------------------------------------------------------------
// Phần 1: Listening (parts[0])
// ---------------------------------------------------------------------------

export function addListeningClip(content: PlacementContent): PlacementContent {
	const existingClipIds = new Set(content.parts[0].clips.map((c) => c.id));
	let clipNum = existingClipIds.size + 1;
	while (existingClipIds.has(`clip-${clipNum}`)) {
		clipNum += 1;
	}
	const clipId = `clip-${clipNum}`;
	const existingQIds = collectQuestionIds(content);
	const firstQ: PlacementListeningMcqQuestion = {
		id: nextUniqueId("l", existingQIds),
		type: "mcq",
		level: "B1",
		prompt: "",
		options: ["", "", "", ""],
		answer: null,
	};
	const newClip: PlacementClip = {
		id: clipId,
		partLabel: `Part ${clipNum}`,
		instruction: "",
		title: `Đoạn nghe ${clipNum}`,
		notesTitle: "",
		transcript: "",
		audioId: null,
		maxPlays: 2,
		level: "B1",
		questions: [firstQ],
	};
	return replaceListening(content, {
		...content.parts[0],
		clips: [...content.parts[0].clips, newClip],
	});
}

export function updateListeningClip(
	content: PlacementContent,
	clipIndex: number,
	patch: Partial<PlacementClip>,
): PlacementContent {
	return replaceListening(content, {
		...content.parts[0],
		clips: content.parts[0].clips.map((clip, idx) =>
			idx === clipIndex ? { ...clip, ...patch } : clip,
		),
	});
}

export function removeListeningClip(
	content: PlacementContent,
	clipIndex: number,
): PlacementContent {
	return replaceListening(content, {
		...content.parts[0],
		clips: content.parts[0].clips.filter((_, idx) => idx !== clipIndex),
	});
}

export function moveListeningClip(
	content: PlacementContent,
	fromIndex: number,
	toIndex: number,
): PlacementContent {
	return replaceListening(content, {
		...content.parts[0],
		clips: moveArrayItem(content.parts[0].clips, fromIndex, toIndex),
	});
}

export function addClipQuestion(
	content: PlacementContent,
	clipIndex: number,
	type: "mcq" | "gap" = "mcq",
): PlacementContent {
	const existingQIds = collectQuestionIds(content);
	const clip = content.parts[0].clips[clipIndex];
	const level = clip?.level || "B1";
	const id = nextUniqueId("l", existingQIds);
	const newQ: PlacementListeningQuestion =
		type === "gap"
			? {
					id,
					type: "gap",
					level,
					prompt: "",
					accept: [""],
				}
			: {
					id,
					type: "mcq",
					level,
					prompt: "",
					options: ["", "", "", ""],
					answer: null,
				};
	return replaceListening(content, {
		...content.parts[0],
		clips: content.parts[0].clips.map((c, idx) =>
			idx === clipIndex ? { ...c, questions: [...c.questions, newQ] } : c,
		),
	});
}

export function updateClipQuestion(
	content: PlacementContent,
	clipIndex: number,
	questionIndex: number,
	patch:
		| Partial<PlacementListeningMcqQuestion>
		| Partial<PlacementListeningGapQuestion>,
): PlacementContent {
	return replaceListening(content, {
		...content.parts[0],
		clips: content.parts[0].clips.map((c, idx) =>
			idx === clipIndex
				? {
						...c,
						questions: c.questions.map((q, qIdx) => {
							if (qIdx !== questionIndex) return q;
							return { ...q, ...patch } as PlacementListeningQuestion;
						}),
					}
				: c,
		),
	});
}

export function convertClipQuestionType(
	content: PlacementContent,
	clipIndex: number,
	questionIndex: number,
	nextType: "mcq" | "gap",
): PlacementContent {
	return replaceListening(content, {
		...content.parts[0],
		clips: content.parts[0].clips.map((c, idx) =>
			idx === clipIndex
				? {
						...c,
						questions: c.questions.map((q, qIdx) => {
							if (qIdx !== questionIndex || q.type === nextType) return q;
							if (nextType === "gap") {
								const nextQ: PlacementListeningGapQuestion = {
									id: q.id,
									type: "gap",
									level: q.level,
									prompt: q.prompt,
									accept: [""],
								};
								return nextQ;
							}
							const nextQ: PlacementListeningMcqQuestion = {
								id: q.id,
								type: "mcq",
								level: q.level,
								prompt: q.prompt,
								options: ["", "", "", ""],
								answer: null,
							};
							return nextQ;
						}),
					}
				: c,
		),
	});
}

export function removeClipQuestion(
	content: PlacementContent,
	clipIndex: number,
	questionIndex: number,
): PlacementContent {
	return replaceListening(content, {
		...content.parts[0],
		clips: content.parts[0].clips.map((c, idx) =>
			idx === clipIndex
				? {
						...c,
						questions: c.questions.filter((_, qIdx) => qIdx !== questionIndex),
					}
				: c,
		),
	});
}

export function moveClipQuestion(
	content: PlacementContent,
	clipIndex: number,
	fromIndex: number,
	toIndex: number,
): PlacementContent {
	return replaceListening(content, {
		...content.parts[0],
		clips: content.parts[0].clips.map((c, idx) =>
			idx === clipIndex
				? {
						...c,
						questions: moveArrayItem(c.questions, fromIndex, toIndex),
					}
				: c,
		),
	});
}

// ---------------------------------------------------------------------------
// Phần 2: Grammar & Vocabulary (parts[1])
// ---------------------------------------------------------------------------

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
	return replaceVg(content, {
		...content.parts[1],
		questions: [...content.parts[1].questions, newQuestion],
	});
}

export function updateVgQuestion(
	content: PlacementContent,
	index: number,
	patch: Partial<PlacementVgQuestion>,
): PlacementContent {
	return replaceVg(content, {
		...content.parts[1],
		questions: content.parts[1].questions.map((q, idx) =>
			idx === index ? { ...q, ...patch } : q,
		),
	});
}

export function removeVgQuestion(
	content: PlacementContent,
	index: number,
): PlacementContent {
	return replaceVg(content, {
		...content.parts[1],
		questions: content.parts[1].questions.filter((_, idx) => idx !== index),
	});
}

export function moveVgQuestion(
	content: PlacementContent,
	fromIndex: number,
	toIndex: number,
): PlacementContent {
	return replaceVg(content, {
		...content.parts[1],
		questions: moveArrayItem(content.parts[1].questions, fromIndex, toIndex),
	});
}

// ---------------------------------------------------------------------------
// Phần 3: Reading (parts[2])
// ---------------------------------------------------------------------------

export function addReadingPassage(
	content: PlacementContent,
	kind: PlacementReadingPassageKind = "passage",
): PlacementContent {
	const existingPIds = new Set(content.parts[2].passages.map((p) => p.id));
	let num = existingPIds.size + 1;
	while (existingPIds.has(`p-${num}`)) {
		num += 1;
	}
	const existingQIds = collectQuestionIds(content);
	const newPassage: PlacementReadingPassage = {
		id: `p-${num}`,
		partLabel: `Part ${num}`,
		kind,
		instruction: "",
		title: `Bài đọc ${num}`,
		body: "",
		questions: [
			{
				id: nextUniqueId("r", existingQIds),
				level: "B1",
				prompt: "",
				options:
					kind === "sign" || kind === "cloze" ? ["", "", ""] : ["", "", "", ""],
				answer: null,
			},
		],
	};
	return replaceReading(content, {
		...content.parts[2],
		passages: [...content.parts[2].passages, newPassage],
	});
}

export function updateReadingPassage(
	content: PlacementContent,
	passageIndex: number,
	patch: Partial<PlacementReadingPassage>,
): PlacementContent {
	return replaceReading(content, {
		...content.parts[2],
		passages: content.parts[2].passages.map((p, idx) =>
			idx === passageIndex ? { ...p, ...patch } : p,
		),
	});
}

export function removeReadingPassage(
	content: PlacementContent,
	passageIndex: number,
): PlacementContent {
	return replaceReading(content, {
		...content.parts[2],
		passages: content.parts[2].passages.filter(
			(_, idx) => idx !== passageIndex,
		),
	});
}

export function moveReadingPassage(
	content: PlacementContent,
	fromIndex: number,
	toIndex: number,
): PlacementContent {
	return replaceReading(content, {
		...content.parts[2],
		passages: moveArrayItem(content.parts[2].passages, fromIndex, toIndex),
	});
}

export function addReadingQuestion(
	content: PlacementContent,
	passageIndex: number,
): PlacementContent {
	const existingQIds = collectQuestionIds(content);
	const passage = content.parts[2].passages[passageIndex];
	const useThreeOpts = passage?.kind === "sign" || passage?.kind === "cloze";
	const newQ: PlacementReadingQuestion = {
		id: nextUniqueId("r", existingQIds),
		level: "B1",
		prompt: "",
		options: useThreeOpts ? ["", "", ""] : ["", "", "", ""],
		answer: null,
	};
	return replaceReading(content, {
		...content.parts[2],
		passages: content.parts[2].passages.map((p, idx) =>
			idx === passageIndex ? { ...p, questions: [...p.questions, newQ] } : p,
		),
	});
}

export function updateReadingQuestion(
	content: PlacementContent,
	passageIndex: number,
	questionIndex: number,
	patch: Partial<PlacementReadingQuestion>,
): PlacementContent {
	return replaceReading(content, {
		...content.parts[2],
		passages: content.parts[2].passages.map((p, idx) =>
			idx === passageIndex
				? {
						...p,
						questions: p.questions.map((q, qIdx) =>
							qIdx === questionIndex ? { ...q, ...patch } : q,
						),
					}
				: p,
		),
	});
}

export function removeReadingQuestion(
	content: PlacementContent,
	passageIndex: number,
	questionIndex: number,
): PlacementContent {
	return replaceReading(content, {
		...content.parts[2],
		passages: content.parts[2].passages.map((p, idx) =>
			idx === passageIndex
				? {
						...p,
						questions: p.questions.filter((_, qIdx) => qIdx !== questionIndex),
					}
				: p,
		),
	});
}

export function moveReadingQuestion(
	content: PlacementContent,
	passageIndex: number,
	fromIndex: number,
	toIndex: number,
): PlacementContent {
	return replaceReading(content, {
		...content.parts[2],
		passages: content.parts[2].passages.map((p, idx) =>
			idx === passageIndex
				? {
						...p,
						questions: moveArrayItem(p.questions, fromIndex, toIndex),
					}
				: p,
		),
	});
}

// ---------------------------------------------------------------------------
// Phần 4: Writing (parts[3])
// ---------------------------------------------------------------------------

export function updateWritingPart(
	content: PlacementContent,
	patch: Partial<PlacementWritingPart>,
): PlacementContent {
	return replaceWriting(content, {
		...content.parts[3],
		...patch,
		id: "writing",
	});
}

// ---------------------------------------------------------------------------
// Phần 5: Speaking (parts[4])
// ---------------------------------------------------------------------------

export function addSpeakingTask(content: PlacementContent): PlacementContent {
	const existingIds = collectSpeakingIds(content);
	const newTask: PlacementSpeakingTask = {
		id: nextUniqueId("s", existingIds),
		partLabel: `Câu ${content.parts[4].tasks.length + 1}`,
		level: "B1",
		prompt: "",
		prepSeconds: 15,
		answerSeconds: 45,
		audioId: null,
	};
	return replaceSpeaking(content, {
		...content.parts[4],
		tasks: [...content.parts[4].tasks, newTask],
	});
}

export function updateSpeakingTask(
	content: PlacementContent,
	taskIndex: number,
	patch: Partial<PlacementSpeakingTask>,
): PlacementContent {
	return replaceSpeaking(content, {
		...content.parts[4],
		tasks: content.parts[4].tasks.map((t, idx) =>
			idx === taskIndex ? { ...t, ...patch } : t,
		),
	});
}

export function removeSpeakingTask(
	content: PlacementContent,
	taskIndex: number,
): PlacementContent {
	return replaceSpeaking(content, {
		...content.parts[4],
		tasks: content.parts[4].tasks.filter((_, idx) => idx !== taskIndex),
	});
}

export function moveSpeakingTask(
	content: PlacementContent,
	fromIndex: number,
	toIndex: number,
): PlacementContent {
	return replaceSpeaking(content, {
		...content.parts[4],
		tasks: moveArrayItem(content.parts[4].tasks, fromIndex, toIndex),
	});
}

// ---------------------------------------------------------------------------
// Ngưỡng điểm CEFR (%)
// ---------------------------------------------------------------------------

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
	const last = content.bands[content.bands.length - 1];
	const nextMin = last ? Math.min(100, last.max + 1) : 0;
	const newBand: PlacementBand = {
		min: nextMin,
		max: 100,
		cefr: "B1",
		course: "comm-2",
		displayCourse: LEAD_COURSE_LABELS["comm-2"],
		advice: "",
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
