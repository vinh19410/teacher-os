import {
	ASSIGNMENT_ANSWER_CHOICES,
	type AssignmentQuestion,
	type AssignmentSkill,
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
	title: string;
	prompt?: string;
	intro?: string;
	items?: QuestionItem[];
	transcript?: string;
	cueTopic?: string;
	cuePoints?: string;
}
export interface AssignmentPartPreset {
	id: string;
	label: string;
	spec: string;
	help: string;
	qStart?: number;
	passage?: string;
	types: AssignmentTypePreset[];
}
export interface SkillPreset {
	id: SkillId;
	name: string;
	heading: string;
	bankLabel: string;
	partLabel: string;
	typeLabel: string;
	source: string;
	parts: AssignmentPartPreset[];
}

export const KIND: Record<string, AnswerKind> = {
	tfng: "tfng",
	sent: "text",
	headings: "roman",
	info: "letter",
	ynng: "ynng",
	mcq: "mcq4",
	form: "text",
	mcq1: "mcq3",
	map: "letter",
	match2: "letter",
	mcq3: "mcq3",
	flow: "text",
	notes: "text",
	sent4: "text",
};

const q = (
	stem: string,
	answer = "",
	opts: string[] | null = null,
	alts = "",
): QuestionItem => ({ stem, answer, opts, alts });

export const SKILLS: SkillPreset[] = [
	{
		id: "writing",
		name: "Writing",
		heading: "Writing Academic",
		bankLabel: "Đề Writing đã có",
		partLabel: "Dạng bài",
		typeLabel: "Dạng đề",
		source: "Cambridge IELTS 10, Test 2",
		parts: [
			{
				id: "task1",
				label: "Task 1 · 150 từ",
				spec: "Academic · 150 từ · 20 phút",
				help: "Mô tả biểu đồ, bảng, bản đồ hoặc quy trình. Ảnh biểu đồ chưa đính trong bản này.",
				types: [
					{
						id: "chart",
						label: "Biểu đồ",
						title: "Writing Task 1 — Chart",
						prompt:
							"The charts below show the percentage of water used for different purposes in six areas of the world.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.",
					},
					{
						id: "table",
						label: "Bảng số liệu",
						title: "Writing Task 1 — Table",
						prompt:
							"The tables below give information about sales of Fairtrade-labelled coffee and bananas in 1999 and 2004.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.",
					},
					{
						id: "map",
						label: "Bản đồ",
						title: "Writing Task 1 — Map",
						prompt:
							"The maps below show an industrial area in the town of Norbiton, and planned future development of the site.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.",
					},
					{
						id: "process",
						label: "Quy trình",
						title: "Writing Task 1 — Process",
						prompt:
							"The diagram below shows how instant noodles are manufactured.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.",
					},
				],
			},
			{
				id: "task2",
				label: "Task 2 · 250 từ",
				spec: "Academic · 250 từ · 40 phút",
				help: "Học viên thấy đúng đoạn văn này. Không cần đính ảnh cho Task 2.",
				types: [
					{
						id: "discuss",
						label: "Discuss both views",
						title: "Writing Task 2 — Discuss both views",
						prompt:
							"Some people think that all university students should study whatever they like. Others believe that they should only be allowed to study subjects that will be useful in the future, such as those related to science and technology.\n\nDiscuss both these views and give your own opinion.",
					},
					{
						id: "opinion",
						label: "Opinion",
						title: "Writing Task 2 — Opinion",
						prompt:
							"Some people believe that unpaid community service should be a compulsory part of high school programmes.\n\nTo what extent do you agree or disagree?",
					},
					{
						id: "advantage",
						label: "Advantages",
						title: "Writing Task 2 — Advantages",
						prompt:
							"In some countries, young people are encouraged to work or travel for a year between finishing high school and starting university studies.\n\nDiscuss the advantages and disadvantages for young people who decide to do this.",
					},
					{
						id: "problem",
						label: "Problem / Solution",
						title: "Writing Task 2 — Problem",
						prompt:
							"In many cities the use of private cars is increasing and this is causing a range of problems.\n\nWhat are those problems? What measures could be taken to deal with them?",
					},
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
		source: "Cambridge IELTS 10, Test 1",
		parts: [
			{
				id: "p1",
				label: "Passage 1",
				spec: "Academic · Passage 1 · 20 phút",
				help: "Passage 1 thường là đoạn sự kiện. Học viên đọc rồi trả lời; đáp án chỉ để chấm tự động.",
				qStart: 1,
				passage:
					"Stepwells are underground reservoirs found across India, particularly in arid regions. Built over many centuries, they capture monsoon rain and store it below ground, where the water stays cooler during the dry months. The finest examples include carved galleries and pavilions, and were used not only for water but as places where people met, rested and held ceremonies.",
				types: [
					{
						id: "tfng",
						label: "True / False / NG",
						title: "Reading Passage 1 — True/False/Not Given",
						intro:
							"Questions 1–8\nDo the following statements agree with the information given in the passage?\nTRUE if the statement agrees with the information\nFALSE if the statement contradicts the information\nNOT GIVEN if there is no information on this",
						items: [
							q(
								"Stepwells were first built in the twentieth century.",
								"FALSE",
							),
							q(
								"Water stored in stepwells stays cool in the dry season.",
								"TRUE",
							),
							q(
								"Every stepwell in India is still used for drinking water.",
								"NOT GIVEN",
							),
							q("Some stepwells had spaces for people to gather.", "TRUE"),
							q("Stepwells are especially common in arid regions.", "TRUE"),
							q("The finest examples include carved galleries.", "TRUE"),
							q("Stepwells were used only for drinking water.", "FALSE"),
							q(
								"All stepwells were designed by the same builder.",
								"NOT GIVEN",
							),
						],
					},
					{
						id: "sent",
						label: "Sentence completion",
						title: "Reading Passage 1 — Sentence completion",
						intro:
							"Questions 1–6\nComplete the sentences below.\nChoose NO MORE THAN TWO WORDS from the passage for each answer.",
						items: [
							q(
								"Stepwells are especially common in ………… regions of India.",
								"arid",
								null,
								"dry",
							),
							q(
								"They collect ………… and keep it below ground.",
								"monsoon rain",
								null,
								"rain",
							),
							q(
								"Carved ………… often surround the water.",
								"galleries",
								null,
								"pavilions",
							),
							q(
								"Water in the wells stays ………… in the dry months.",
								"cooler",
								null,
								"cool",
							),
							q("People also used stepwells for ………….", "ceremonies"),
							q("The wells were built over many ………….", "centuries"),
						],
					},
				],
			},
			{
				id: "p2",
				label: "Passage 2",
				spec: "Academic · Passage 2 · 20 phút",
				help: "Passage 2 thường dài hơn. Matching headings là dạng hay gặp. Đáp án khóa để chấm tự động.",
				qStart: 14,
				passage:
					"Museums have changed from quiet rooms of objects to places that try to explain ideas. Many now design exhibitions around a question rather than a collection. Audio guides, workshops and evening events are used to bring in visitors who would not otherwise come. Critics say this turns museums into entertainment; supporters argue that a museum which nobody visits cannot teach anyone.",
				types: [
					{
						id: "headings",
						label: "Matching headings",
						title: "Reading Passage 2 — Matching headings",
						intro:
							"Questions 14–18\nThe passage has five paragraphs, A–E.\nChoose the correct heading for each paragraph from the list of headings below.",
						items: [
							q("Paragraph A", "v"),
							q("Paragraph B", "ii"),
							q("Paragraph C", "iv"),
							q("Paragraph D", "iii"),
							q("Paragraph E", "i"),
						],
					},
					{
						id: "info",
						label: "Matching information",
						title: "Reading Passage 2 — Matching information",
						intro:
							"Questions 14–18\nWhich paragraph contains the following information?",
						items: [
							q("a reason why empty museums fail", "E"),
							q("examples of activities added to attract people", "C"),
							q("a warning that education may be diluted", "D"),
							q("exhibitions organised around a question", "B"),
							q("museums as quiet rooms of objects", "A"),
						],
					},
				],
			},
			{
				id: "p3",
				label: "Passage 3",
				spec: "Academic · Passage 3 · 20 phút",
				help: "Passage 3 là đoạn khó. Multiple choice và Yes/No/NG hay đi cùng. Đáp án khóa để chấm tự động.",
				qStart: 27,
				passage:
					"Bilingual children do not simply store two separate dictionaries. Research suggests they constantly select the language that fits the situation and suppress the other. This switching appears to strengthen attention control, though the advantage is clearer in some tasks than others. The findings have been used to argue for earlier language programmes in schools, but the size of the classroom benefit is still debated.",
				types: [
					{
						id: "ynng",
						label: "Yes / No / NG",
						title: "Reading Passage 3 — Yes/No/Not Given",
						intro:
							"Questions 27–32\nDo the following statements agree with the claims of the writer?",
						items: [
							q(
								"Bilingual children keep the two languages completely separate.",
								"NO",
							),
							q("Switching languages can improve attention control.", "YES"),
							q(
								"Every school should teach a second language before age five.",
								"NOT GIVEN",
							),
							q(
								"The research has been used to support earlier language programmes.",
								"YES",
							),
							q("The size of the classroom benefit is still debated.", "YES"),
							q(
								"Bilingual children prefer written tasks to spoken tasks.",
								"NOT GIVEN",
							),
						],
					},
					{
						id: "mcq",
						label: "Multiple choice",
						title: "Reading Passage 3 — Multiple choice",
						intro: "Questions 27–30\nChoose the correct letter, A, B, C or D.",
						items: [
							q("Research on bilingual children suggests that they", "B", [
								"forget their first language more quickly.",
								"choose one language and ignore the other in each situation.",
								"prefer written tasks to spoken tasks.",
								"cannot translate between languages.",
							]),
							q("Switching between languages appears to", "C", [
								"reduce memory in both languages.",
								"delay speaking in the second language.",
								"strengthen attention control.",
								"remove the need for classroom teaching.",
							]),
							q("The writer says the bilingual advantage is", "A", [
								"clearer in some tasks than others.",
								"identical for every child.",
								"limited to reading tests.",
								"proven in every school subject.",
							]),
							q("The classroom benefit of early language programmes is", "D", [
								"already measured in every country.",
								"rejected by the writer.",
								"larger than the attention effect.",
								"still debated.",
							]),
						],
					},
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
		source: "Cambridge IELTS 10, Test 2",
		parts: [
			{
				id: "s1",
				label: "Section 1",
				spec: "Section 1 · ~10 phút",
				help: "Hội thoại đời thường. Học viên chỉ nghe file; đáp án khóa để chấm tự động.",
				qStart: 1,
				types: [
					{
						id: "form",
						label: "Form completion",
						title: "Listening Section 1 — Form completion",
						intro:
							"Questions 1–6\nComplete the form below.\nWrite ONE WORD AND/OR A NUMBER for each answer.\n\nHoliday rental enquiry",
						transcript:
							"A: Good morning, Highfield Holiday Rentals.\nB: Hello, I’d like to book a cottage in July.\nA: Can I take your name?\nB: It’s Helen Clarke, C-L-A-R-K-E.\nA: And the arrival date?\nB: The 12th of July, for five nights.\nA: The cottage is at 17 Station Street. The deposit is fifty pounds.\nB: That’s fine. Two bedrooms, and we don’t have pets.",
						items: [
							q("Name", "Clarke", null, "Helen Clarke"),
							q("Arrival date", "12 July", null, "12th July / 12/7"),
							q("Number of nights", "5", null, "five"),
							q("Address: 17 ………… Street", "Station"),
							q("Deposit paid: £ …………", "50", null, "fifty"),
							q("Number of bedrooms", "2", null, "two"),
						],
					},
					{
						id: "mcq1",
						label: "Multiple choice",
						title: "Listening Section 1 — Multiple choice",
						intro: "Questions 1–4\nChoose the correct letter, A, B or C.",
						items: [
							q("The caller wants to book", "B", [
								"a hotel room.",
								"a holiday cottage.",
								"a campsite pitch.",
							]),
							q("They will arrive on", "B", [
								"2 July.",
								"12 July.",
								"20 July.",
							]),
							q("They will stay for", "A", [
								"five nights.",
								"two weeks.",
								"one month.",
							]),
							q("The company they call is", "C", [
								"a city hotel.",
								"an airline.",
								"a holiday rental firm.",
							]),
						],
					},
				],
			},
			{
				id: "s2",
				label: "Section 2",
				spec: "Section 2 · ~10 phút",
				help: "Độc thoại hướng dẫn — bản đồ, quy định, sự kiện. Đáp án khóa để chấm tự động.",
				qStart: 11,
				types: [
					{
						id: "map",
						label: "Map labelling",
						title: "Listening Section 2 — Map labelling",
						intro: "Questions 11–14\nLabel the map below.",
						items: [
							q("visitor centre", "B"),
							q("cycle hire", "D"),
							q("picnic area", "F"),
							q("main car park", "A"),
						],
					},
					{
						id: "match2",
						label: "Matching",
						title: "Listening Section 2 — Matching",
						intro:
							"Questions 11–15\nWhat does the speaker say about each facility?",
						items: [
							q("swimming pool", "D"),
							q("tennis courts", "B"),
							q("café", "A"),
							q("gym", "C"),
							q("main car park", "E"),
						],
					},
				],
			},
			{
				id: "s3",
				label: "Section 3",
				spec: "Section 3 · ~10 phút",
				help: "Thảo luận học thuật. Multiple choice và flowchart hay gặp. Đáp án khóa để chấm tự động.",
				qStart: 21,
				types: [
					{
						id: "mcq3",
						label: "Multiple choice",
						title: "Listening Section 3 — Multiple choice",
						intro: "Questions 21–24\nChoose the correct letter, A, B or C.",
						items: [
							q("The students’ project is about", "B", [
								"local transport.",
								"food waste on campus.",
								"library opening hours.",
							]),
							q("Their tutor asks them to", "A", [
								"collect more interviews.",
								"shorten the introduction.",
								"change the topic.",
							]),
							q("They will start by", "C", [
								"writing the conclusion.",
								"booking a lecture hall.",
								"reading last year’s reports.",
							]),
							q("The deadline is", "B", [
								"this Friday.",
								"the end of term.",
								"next January.",
							]),
						],
					},
					{
						id: "flow",
						label: "Flow-chart",
						title: "Listening Section 3 — Flow-chart",
						intro: "Questions 21–24\nComplete the flow-chart below.",
						items: [
							q(
								"Read last year’s reports → …………",
								"design survey",
								null,
								"design the survey",
							),
							q("Design the survey → …………", "pilot", null, "pilot study"),
							q(
								"Pilot with 10 students → …………",
								"revise questions",
								null,
								"revise",
							),
							q("Collect results → …………", "write report", null, "report"),
						],
					},
				],
			},
			{
				id: "s4",
				label: "Section 4",
				spec: "Section 4 · ~10 phút",
				help: "Bài giảng học thuật. Note completion là dạng chuẩn. Đáp án khóa để chấm tự động.",
				qStart: 31,
				types: [
					{
						id: "notes",
						label: "Note completion",
						title: "Listening Section 4 — Note completion",
						intro: "Questions 31–36\nComplete the notes below.",
						items: [
							q(
								"Early parks were created for ………… in industrial cities",
								"workers",
								null,
								"residents",
							),
							q("often paid for by …………", "philanthropists", null, "donors"),
							q(
								"20th century: used for public …………",
								"recreation",
								null,
								"leisure",
							),
							q("some land sold for …………", "housing"),
							q("Today parks support local …………", "wildlife"),
							q("Cities now measure parks by …………", "access"),
						],
					},
					{
						id: "sent4",
						label: "Sentence completion",
						title: "Listening Section 4 — Sentence completion",
						intro: "Questions 31–34\nComplete the sentences below.",
						items: [
							q("The first urban parks were built for …………", "workers"),
							q("Many parks later lost land to …………", "housing"),
							q("Modern parks are also designed for …………", "wildlife"),
							q("Planners now emphasise equal …………", "access"),
						],
					},
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
		source: "Cambridge IELTS 10",
		parts: [
			{
				id: "part1",
				label: "Part 1 · Phỏng vấn",
				spec: "Part 1 · 4–5 phút",
				help: "Câu hỏi ngắn về bản thân. Học viên trả lời nói, không viết essay.",
				types: [
					{
						id: "hometown",
						label: "Hometown",
						title: "Speaking Part 1 — Hometown",
						prompt:
							"Let’s talk about your hometown.\n\n1. Where is your hometown?\n2. What do you like most about it?\n3. How has it changed in recent years?\n4. Do you think you will continue to live there?",
					},
					{
						id: "work",
						label: "Work & study",
						title: "Speaking Part 1 — Work & study",
						prompt:
							"Let’s talk about your work or studies.\n\n1. Do you work or are you a student?\n2. What do you like about that?\n3. What is the most difficult part of it?\n4. What would you like to do in the future?",
					},
				],
			},
			{
				id: "part2",
				label: "Part 2 · Cue card",
				spec: "Part 2 · 1 phút chuẩn bị · 1–2 phút nói",
				help: "Cue card: 1 phút ghi chú, 1–2 phút nói liên tục. Học viên thấy đúng thẻ này.",
				types: [
					{
						id: "place",
						label: "Place",
						title: "Speaking Part 2 — Describe a place",
						cueTopic: "a place in your city that you like to visit",
						cuePoints:
							"where it is\nhow you get there\nwhat you do there\nand explain why you like this place",
					},
					{
						id: "person",
						label: "Person",
						title: "Speaking Part 2 — Describe a person",
						cueTopic: "a person you know who is good at their job",
						cuePoints:
							"who this person is\nwhat their job is\nhow you know them\nand explain why you think they are good at their job",
					},
					{
						id: "object",
						label: "Object",
						title: "Speaking Part 2 — Describe an object",
						cueTopic: "something you own that is important to you",
						cuePoints:
							"what it is\nhow you got it\nwhat you use it for\nand explain why it is important to you",
					},
				],
			},
			{
				id: "part3",
				label: "Part 3 · Thảo luận",
				spec: "Part 3 · 4–5 phút",
				help: "Câu hỏi trừu tượng, nối với Part 2. Giáo viên hỏi; học viên bàn luận.",
				types: [
					{
						id: "cities",
						label: "Cities",
						title: "Speaking Part 3 — Cities",
						prompt:
							"Let’s consider public places in cities.\n\n1. What kinds of public places are most popular in your country?\n2. How can cities make public spaces more attractive?\n3. Do you think people will spend more time outdoors in the future? Why?",
					},
					{
						id: "education",
						label: "Education",
						title: "Speaking Part 3 — Education",
						prompt:
							"Let’s discuss work and training.\n\n1. What skills should schools teach that they do not teach now?\n2. Is it better to specialise early or study a wide range of subjects?\n3. How might people’s working lives change in the next 20 years?",
					},
				],
			},
		],
	},
];

const cloneItems = (items: QuestionItem[] | undefined): QuestionItem[] =>
	(items ?? []).map((item) => ({
		...item,
		opts: item.opts ? [...item.opts] : null,
	}));
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
export function kindOf(typeId: string): AnswerKind {
	return KIND[typeId] ?? "text";
}
export function qStartOf(skillId: string, partId: string): number {
	return partOf(skillId, partId).qStart ?? 1;
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
	};
}
export function wordCount(text: string): number {
	const value = text.trim();
	return value ? value.split(/\s+/).length : 0;
}
export function compositionDefaults(
	skillId: string,
	partId: string,
	typeIdOrDirtyTitle: string | boolean,
	dirtyMainOrPrompt: boolean,
	maybeDirtyMain?: boolean,
) {
	const legacy = typeof typeIdOrDirtyTitle === "boolean";
	const typeId = legacy ? partId : typeIdOrDirtyTitle;
	const dirtyTitle = legacy
		? (typeIdOrDirtyTitle as boolean)
		: dirtyMainOrPrompt;
	const dirtyMain = legacy ? dirtyMainOrPrompt : (maybeDirtyMain ?? false);
	const skill = skillOf(legacy ? "writing" : skillId);
	const part = partOf(skill.id, legacy ? skillId : partId);
	const type = typeOf(skill.id, part.id, typeId);
	return {
		title: dirtyTitle ? "" : type.title,
		source: skill.source,
		prompt: dirtyMain ? "" : (type.prompt ?? ""),
		passage: dirtyMain ? "" : (part.passage ?? ""),
		intro: type.intro ?? "",
		transcript: type.transcript ?? "",
		cueTopic: type.cueTopic ?? "",
		cuePoints: type.cuePoints ?? "",
		items: dirtyMain ? [] : cloneItems(type.items),
	};
}
