import {
	ASSIGNMENT_ANSWER_CHOICES,
	ASSIGNMENT_IMAGE_BASED_TYPES,
	ASSIGNMENT_OPTION_BANK_MAX,
	ASSIGNMENT_OPTION_BANK_TYPES,
	type AssignmentQuestion,
	type AssignmentSkill,
	isImageBasedType,
	isOptionBankable,
} from "@teacher-os/api/contracts";

export type SkillId = AssignmentSkill;
export type AnswerKind =
	| "tfng"
	| "ynng"
	| "mcq4"
	| "mcq3"
	| "roman"
	| "letter"
	| "text";
export type QuestionItem = AssignmentQuestion;

export interface AssignmentTypePreset {
	id: string;
	label: string;
}
export interface AssignmentPartPreset {
	id: string;
	label: string;
	spec: string;
	help: string;
	qStart?: number;
	types: AssignmentTypePreset[];
}
export interface SkillPreset {
	id: SkillId;
	name: string;
	heading: string;
	bankLabel: string;
	partLabel: string;
	typeLabel: string;
	parts: AssignmentPartPreset[];
}

export const KIND: Record<string, AnswerKind> = {
	tfng: "tfng",
	sent: "text",
	headings: "roman",
	info: "letter",
	ynng: "ynng",
	mcq: "mcq4",
	note: "text",
	shortans: "text",
	diagram: "text",
	summary: "text",
	sentend: "letter",
	tablecomp: "text",
	features: "letter",
	flowchart: "text",
	form: "text",
	mcq1: "mcq3",
	map: "letter",
	match2: "letter",
	mcq3: "mcq3",
	flow: "text",
	notes: "text",
	sent4: "text",
	match: "letter",
	gap: "text",
	transform: "text",
};

/**
 * Placeholder "Hướng dẫn đề" theo câu lệnh IELTS chính thức (giới hạn từ).
 * Đứng ngoài catalog vì test pin type catalog chỉ có {id,label} (#269).
 * Phase-02 FR5: 2 dạng matching (features/sentend) khóa đáp án từ panel
 * "Ngân hàng lựa chọn" — placeholder KHÔNG còn hướng dẫn liệt kê A–H vào ô
 * intro nữa (intro trở lại vai trò câu lệnh).
 */
export const TYPE_HINTS: Record<string, string> = {
	note: "Hoàn thành ghi chú. KHÔNG QUÁ BA TỪ · lấy từ bài đọc",
	shortans: "Trả lời ngắn. KHÔNG QUÁ BA TỪ · lấy từ bài đọc",
	diagram: "Hoàn thành nhãn sơ đồ. MỘT TỪ DUY NHẤT · lấy từ bài đọc",
	summary: "Hoàn thành tóm tắt. KHÔNG QUÁ BA TỪ · lấy từ bài đọc",
	tablecomp: "Hoàn thành bảng. KHÔNG QUÁ BA TỪ · lấy từ bài đọc",
	flowchart: "Hoàn thành lưu đồ. KHÔNG QUÁ BA TỪ · lấy từ bài đọc",
	features:
		"Nối thông tin với đúng đối tượng. Chọn đáp án từ Ngân hàng lựa chọn bên dưới.",
	sentend:
		"Hoàn thành câu với phần kết đúng. Chọn đáp án từ Ngân hàng lựa chọn bên dưới.",
};

/**
 * Option bank (phase-02 FR3): the (skill, type) pairs whose composer shows
 * the structured bank editor. Mirrors `ASSIGNMENT_OPTION_BANK_TYPES` in the
 * contracts — the sync test pins both sides so a drift cannot ship silently.
 * Skill-qualified: `map` is shared with writing task1, which is NOT bankable.
 */
export const BANKABLE_PAIRS: ReadonlySet<string> = new Set(
	Object.entries(ASSIGNMENT_OPTION_BANK_TYPES).flatMap(([skill, types]) =>
		types.map((type) => `${skill}:${type}`),
	),
);
export function isBankableType(skill: string, type: string): boolean {
	return isOptionBankable(skill, type);
}
/**
 * Image pins (phase-04 FR2/FR3): the (skill, type) pairs whose composer
 * shows the pin editor over the prompt image — reading `diagram` + listening
 * `map`. Mirrors `ASSIGNMENT_IMAGE_BASED_TYPES` (sync-tested); skill-
 * qualified so writing task1's shared `map` type id is never image-gated.
 */
export const IMAGE_BASED_PAIRS: ReadonlySet<string> = new Set(
	Object.entries(ASSIGNMENT_IMAGE_BASED_TYPES).flatMap(([skill, types]) =>
		types.map((type) => `${skill}:${type}`),
	),
);
export function isImageBased(skill: string, type: string): boolean {
	return isImageBasedType(skill, type);
}
/** Contract cap — labels only exist for 8 positions (A–H / i–viii). */
export const OPTION_BANK_MAX = ASSIGNMENT_OPTION_BANK_MAX;
/**
 * Positional display label for bank row `index` under `kind`: A… for letter
 * kinds, i… for the roman headings kind. "" outside the alphabet or for
 * non-bankable kinds — callers treat it as "no label exists".
 */
export function bankLabel(kind: AnswerKind, index: number): string {
	if (kind !== "letter" && kind !== "roman") return "";
	return ASSIGNMENT_ANSWER_CHOICES[kind][index] ?? "";
}

export const SKILLS: SkillPreset[] = [
	{
		id: "writing",
		name: "Writing",
		heading: "Writing Academic",
		bankLabel: "Đề Writing đã có",
		partLabel: "Dạng bài",
		typeLabel: "Dạng đề",
		parts: [
			{
				id: "task1",
				label: "Task 1 · 150 từ",
				spec: "Academic · 150 từ · 20 phút",
				help: "Mô tả biểu đồ, bảng, bản đồ hoặc quy trình. Ảnh biểu đồ chưa đính trong bản này.",
				types: [
					{ id: "chart", label: "Biểu đồ" },
					{ id: "table", label: "Bảng số liệu" },
					{ id: "map", label: "Bản đồ" },
					{ id: "process", label: "Quy trình" },
				],
			},
			{
				id: "task2",
				label: "Task 2 · 250 từ",
				spec: "Academic · 250 từ · 40 phút",
				help: "Học viên thấy đúng đoạn văn này. Không cần đính ảnh cho Task 2.",
				types: [
					{ id: "discuss", label: "Discuss both views" },
					{ id: "opinion", label: "Opinion" },
					{ id: "advantage", label: "Advantages" },
					{ id: "problem", label: "Problem / Solution" },
				],
			},
		],
	},
	{
		id: "reading",
		name: "Reading",
		heading: "Reading Academic",
		bankLabel: "Đề Reading đã có",
		partLabel: "Phần thi",
		typeLabel: "Dạng câu hỏi",
		parts: [
			{
				id: "p1",
				label: "Passage 1",
				spec: "Academic · Passage 1 · 20 phút",
				help: "Passage 1 thường là đoạn sự kiện. Note completion, short-answer và diagram label hay gặp. Đáp án khóa để chấm tự động.",
				qStart: 1,
				types: [
					{ id: "tfng", label: "True / False / NG" },
					{ id: "sent", label: "Sentence completion" },
					{ id: "note", label: "Note completion" },
					{ id: "shortans", label: "Short-answer questions" },
					{ id: "diagram", label: "Diagram label completion" },
				],
			},
			{
				id: "p2",
				label: "Passage 2",
				spec: "Academic · Passage 2 · 20 phút",
				help: "Passage 2 thường dài hơn. Summary completion, matching sentence endings và table completion hay gặp. Đáp án khóa để chấm tự động.",
				qStart: 14,
				types: [
					{ id: "headings", label: "Matching headings" },
					{ id: "info", label: "Matching information" },
					{ id: "summary", label: "Summary completion" },
					{ id: "sentend", label: "Matching sentence endings" },
					{ id: "tablecomp", label: "Table completion" },
				],
			},
			{
				id: "p3",
				label: "Passage 3",
				spec: "Academic · Passage 3 · 20 phút",
				help: "Passage 3 là đoạn khó. Matching features và flow-chart completion hay đi cùng Yes/No/NG. Đáp án khóa để chấm tự động.",
				qStart: 27,
				types: [
					{ id: "ynng", label: "Yes / No / NG" },
					{ id: "mcq", label: "Multiple choice" },
					{ id: "features", label: "Matching features" },
					{ id: "flowchart", label: "Flow-chart completion" },
				],
			},
		],
	},
	{
		id: "listening",
		name: "Listening",
		heading: "Listening",
		bankLabel: "Đề Listening đã có",
		partLabel: "Phần thi",
		typeLabel: "Dạng câu hỏi",
		parts: [
			{
				id: "s1",
				label: "Section 1",
				spec: "Section 1 · ~10 phút",
				help: "Hội thoại đời thường. Học viên chỉ nghe file; đáp án khóa để chấm tự động.",
				qStart: 1,
				types: [
					{ id: "form", label: "Form completion" },
					{ id: "mcq1", label: "Multiple choice" },
				],
			},
			{
				id: "s2",
				label: "Section 2",
				spec: "Section 2 · ~10 phút",
				help: "Độc thoại hướng dẫn — bản đồ, quy định, sự kiện. Đáp án khóa để chấm tự động.",
				qStart: 11,
				types: [
					{ id: "map", label: "Map labelling" },
					{ id: "match2", label: "Matching" },
				],
			},
			{
				id: "s3",
				label: "Section 3",
				spec: "Section 3 · ~10 phút",
				help: "Thảo luận học thuật. Multiple choice và flowchart hay gặp. Đáp án khóa để chấm tự động.",
				qStart: 21,
				types: [
					{ id: "mcq3", label: "Multiple choice" },
					{ id: "flow", label: "Flow-chart" },
				],
			},
			{
				id: "s4",
				label: "Section 4",
				spec: "Section 4 · ~10 phút",
				help: "Bài giảng học thuật. Note completion là dạng chuẩn. Đáp án khóa để chấm tự động.",
				qStart: 31,
				types: [
					{ id: "notes", label: "Note completion" },
					{ id: "sent4", label: "Sentence completion" },
				],
			},
		],
	},
	{
		id: "speaking",
		name: "Speaking",
		heading: "Speaking",
		bankLabel: "Đề Speaking đã có",
		partLabel: "Phần thi",
		typeLabel: "Dạng đề",
		parts: [
			{
				id: "part1",
				label: "Part 1 · Phỏng vấn",
				spec: "Part 1 · 4–5 phút",
				help: "Câu hỏi ngắn về bản thân. Học viên trả lời nói, không viết essay.",
				types: [
					{ id: "hometown", label: "Hometown" },
					{ id: "work", label: "Work & study" },
				],
			},
			{
				id: "part2",
				label: "Part 2 · Cue card",
				spec: "Part 2 · 1 phút chuẩn bị · 1–2 phút nói",
				help: "Cue card: 1 phút ghi chú, 1–2 phút nói liên tục. Học viên thấy đúng thẻ này.",
				types: [
					{ id: "place", label: "Place" },
					{ id: "person", label: "Person" },
					{ id: "object", label: "Object" },
				],
			},
			{
				id: "part3",
				label: "Part 3 · Thảo luận",
				spec: "Part 3 · 4–5 phút",
				help: "Câu hỏi trừu tượng, nối với Part 2. Giáo viên hỏi; học viên bàn luận.",
				types: [
					{ id: "cities", label: "Cities" },
					{ id: "education", label: "Education" },
				],
			},
		],
	},
	{
		id: "grammar",
		name: "Grammar",
		heading: "Grammar",
		bankLabel: "Đề Grammar đã có",
		partLabel: "Phần thi",
		typeLabel: "Dạng câu hỏi",
		parts: [
			{
				id: "g1",
				label: "Grammar",
				spec: "Grammar · Tự chấm",
				help: "Bài tập ngữ pháp tự chấm. Câu điền từ dùng ____ để đánh dấu chỗ trống; câu viết lại có thể để nguyên câu gốc.",
				qStart: 1,
				types: [
					{ id: "mcq", label: "Multiple choice" },
					{ id: "gap", label: "Gap-fill" },
					{ id: "transform", label: "Sentence transformation" },
				],
			},
		],
	},
	{
		id: "vocabulary",
		name: "Vocabulary",
		heading: "Vocabulary",
		bankLabel: "Đề Vocabulary đã có",
		partLabel: "Phần thi",
		typeLabel: "Dạng câu hỏi",
		parts: [
			{
				id: "v1",
				label: "Vocabulary",
				spec: "Vocabulary · Tự chấm",
				help: "Bài tập từ vựng tự chấm. Dạng nối từ khóa đáp án từ Ngân hàng lựa chọn A–H; câu điền từ dùng ____.",
				qStart: 1,
				types: [
					{ id: "mcq", label: "Multiple choice" },
					{ id: "match", label: "Matching" },
					{ id: "gap", label: "Gap-fill" },
				],
			},
		],
	},
];

const fallbackSkill = SKILLS[0];

export function skillOf(id: string): SkillPreset {
	return SKILLS.find((skill) => skill.id === id) ?? fallbackSkill;
}
export function partOf(skillId: string, partId: string): AssignmentPartPreset {
	const skill = skillOf(skillId);
	return skill.parts.find((part) => part.id === partId) ?? skill.parts[0];
}
export function typeOf(
	skillId: string,
	partId: string,
	typeId: string,
): AssignmentTypePreset {
	const part = partOf(skillId, partId);
	return part.types.find((type) => type.id === typeId) ?? part.types[0];
}
export function selectedTypeOf(
	skillId: string,
	partId: string,
	typeId: string,
): AssignmentTypePreset | null {
	if (!typeId) return null;
	const part = partOf(skillId, partId);
	return part.types.find((type) => type.id === typeId) ?? null;
}
export function kindOf(typeId: string): AnswerKind {
	return KIND[typeId] ?? "text";
}
export function qStartOf(skillId: string, partId: string): number {
	return partOf(skillId, partId).qStart ?? 1;
}
export function isAutoSkill(skillId: string): boolean {
	return (
		skillId === "reading" ||
		skillId === "listening" ||
		skillId === "grammar" ||
		skillId === "vocabulary"
	);
}
export function answerChoices(kind: AnswerKind): readonly string[] | null {
	return kind === "text" ? null : ASSIGNMENT_ANSWER_CHOICES[kind];
}
export function emptyItem(typeId: string): QuestionItem {
	const kind = kindOf(typeId);
	return {
		stem: "",
		opts:
			kind === "mcq4"
				? ["", "", "", ""]
				: kind === "mcq3"
					? ["", "", ""]
					: null,
		answer: "",
		alts: "",
		pin: null,
	};
}
export function emptyComposer(skillId: string, typeId: string) {
	return {
		title: "",
		source: "",
		prompt: "",
		passage: "",
		intro: "",
		transcript: "",
		cueTopic: "",
		cuePoints: "",
		audioName: "",
		imageUrl: "",
		optionBank: [],
		note: "",
		items: isAutoSkill(skillId) ? [emptyItem(typeId)] : [],
		writing: null,
	};
}
// Single source of truth #304: teacher preview và student footer đếm từ
// cùng một cách (trước đây web giữ bản copy riêng dễ lệch số đếm).
export { countWords as wordCount } from "@teacher-os/api/lib/word-count";
