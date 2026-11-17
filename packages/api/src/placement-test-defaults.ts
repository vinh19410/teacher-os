import type {
	PlacementPublishedReadingPassage,
	PlacementPublishedSpeakingTask,
	PlacementPublishedWritingPart,
} from "./placement-test-contracts";

const DEFAULT_READING_PASSAGES: ReadonlyArray<PlacementPublishedReadingPassage> =
	[
		{
			id: "ra",
			partLabel: "Part 1",
			kind: "sign",
			instruction: "For each question, choose the correct answer.",
			title: "CITY SWIMMING POOL",
			body: "CITY SWIMMING POOL\nChildren under 12 must swim with an adult.\nClosed every Monday for cleaning.",
			questions: [
				{
					id: "r-a1",
					level: "A1",
					prompt: "",
					options: [
						"Adults can only swim alone on Mondays.",
						"Young children must be with an adult in the pool.",
						"The pool is cleaned every day.",
					],
					answer: 1,
				},
			],
		},
		{
			id: "rb",
			partLabel: "Part 1",
			kind: "message",
			instruction: "",
			title: "Message from Mum",
			body: "Tuan,\nThe dentist phoned. Your appointment is now on Thursday at 4, not Wednesday. Call them if that's a problem.\nMum",
			questions: [
				{
					id: "r-b1",
					level: "A2",
					prompt: "",
					options: [
						"Tuan's appointment is now on a different day.",
						"Tuan must call the dentist to change the time.",
						"Mum is going to the dentist on Thursday.",
					],
					answer: 0,
				},
			],
		},
		{
			id: "rc",
			partLabel: "Part 1",
			kind: "sign",
			instruction: "",
			title: "OFFICE KITCHEN",
			body: "OFFICE KITCHEN\nPlease take your food out of the fridge by 5 p.m. on Friday.\nAnything left after this time will be thrown away.",
			questions: [
				{
					id: "r-c1",
					level: "A2",
					prompt: "",
					options: [
						"Staff can leave food in the fridge at the weekend.",
						"Staff must buy their lunch on Fridays.",
						"Staff should take their food home before the weekend.",
					],
					answer: 2,
				},
			],
		},
		{
			id: "rd",
			partLabel: "Part 1",
			kind: "message",
			instruction: "",
			title: "Message from Ben",
			body: "Hi Anna,\nThis week the English club is meeting in Room 12 because they're painting Room 8. Same time as usual!\nBen",
			questions: [
				{
					id: "r-d1",
					level: "A2",
					prompt: "Why is Ben writing to Anna?",
					options: [
						"to change the time of the meeting",
						"to tell her the club is in a different room",
						"to ask her to help with the painting",
					],
					answer: 1,
				},
			],
		},
		{
			id: "re",
			partLabel: "Part 2",
			kind: "passage",
			instruction:
				"Read the article about a young woman who works abroad. For each question, choose the correct answer.",
			title: "A new start in Auckland",
			body: 'Thu Ha is 25 and comes from Can Tho. Last year, she moved to Auckland, New Zealand, to work in a hotel restaurant.\n\n"I studied English at school, but when I arrived, I couldn\'t understand people very well," she says. "Everyone spoke so fast! In my first week, a customer asked for a \'flat white\' and I brought him a glass of milk. Now I know it\'s a kind of coffee!"\n\nThu Ha works five days a week, usually in the evening. On her days off, she goes to English classes at a community centre near her flat. "The classes are free, and I\'ve made friends from Brazil, Korea and Germany there. We always speak English together because it\'s the only language we all know."\n\nThe hardest thing for Thu Ha is the weather. "In Can Tho it\'s hot all year. Here, the winter is cold and wet, and I had to buy my first real coat." But she loves her new life. "Next year I want to study hotel management. My manager has offered to help me find a good course."',
			questions: [
				{
					id: "r-e1",
					level: "A2",
					prompt: "When Thu Ha first arrived in Auckland,",
					options: [
						"she couldn't find a job.",
						"she found it hard to understand people.",
						"people didn't understand her English.",
					],
					answer: 1,
				},
				{
					id: "r-e2",
					level: "A2",
					prompt: "What happened with the customer in her first week?",
					options: [
						"She gave him the wrong drink.",
						"He didn't like his coffee.",
						"She forgot what he ordered.",
					],
					answer: 0,
				},
				{
					id: "r-e3",
					level: "A2+",
					prompt: "Why does Thu Ha speak English with her classmates?",
					options: [
						"Their teacher tells them to.",
						"They want to pass an exam.",
						"They have no other language in common.",
					],
					answer: 2,
				},
				{
					id: "r-e4",
					level: "A2+",
					prompt: "What does Thu Ha say about the weather in Auckland?",
					options: [
						"It is similar to the weather in Can Tho.",
						"She needed to buy warm clothes for it.",
						"The summer is too hot for her.",
					],
					answer: 1,
				},
				{
					id: "r-e5",
					level: "B1",
					prompt: "What are Thu Ha's plans for the future?",
					options: [
						"Her manager will help her start studying.",
						"She wants to go back to Can Tho.",
						"She hopes to become a manager next year.",
					],
					answer: 0,
				},
			],
		},
		{
			id: "rf",
			partLabel: "Part 3",
			kind: "cloze",
			instruction:
				"For each question, choose the correct answer to fill the gap.",
			title: "Working from home",
			body: "More and more people now work from home at least one day a [1]. For many, the biggest advantage is that they don't have to travel to the office. Instead, they can [2] that time with their family or do some exercise.\n\nHowever, working from home is not always easy. Some people find it difficult to [3] on their work when there are children or pets around. Others say they miss their colleagues and feel [4]. Experts suggest creating a quiet space just for work and taking short [5] during the day. It is also a good idea to [6] in touch with your team by video call.",
			questions: [
				{
					id: "r-f1",
					level: "A2+",
					prompt: "Gap 1",
					options: ["time", "hour", "week", "moment"],
					answer: 2,
				},
				{
					id: "r-f2",
					level: "A2+",
					prompt: "Gap 2",
					options: ["pay", "spend", "make", "do"],
					answer: 1,
				},
				{
					id: "r-f3",
					level: "B1",
					prompt: "Gap 3",
					options: ["concentrate", "care", "interest", "mind"],
					answer: 0,
				},
				{
					id: "r-f4",
					level: "B1",
					prompt: "Gap 4",
					options: ["single", "only", "lone", "lonely"],
					answer: 3,
				},
				{
					id: "r-f5",
					level: "B1",
					prompt: "Gap 5",
					options: ["holidays", "stops", "breaks", "ends"],
					answer: 2,
				},
				{
					id: "r-f6",
					level: "B1",
					prompt: "Gap 6",
					options: ["make", "hold", "have", "keep"],
					answer: 3,
				},
			],
		},
	];

const DEFAULT_WRITING_PART: Readonly<PlacementPublishedWritingPart> = {
	id: "writing",
	title: "Writing",
	promptTitle: "Email to a friend",
	promptBody:
		"You have just moved to a new city. Write an email to your English-speaking friend (50–80 words). Tell your friend:\n\n  1. where you live now and who you live with\n  2. what you usually do at weekends\n  3. whether you like your new home, and why / why not",
	minWords: 50,
	maxWords: 80,
};

const DEFAULT_SPEAKING_TASKS: ReadonlyArray<PlacementPublishedSpeakingTask> = [
	{
		id: "s-01",
		partLabel: "Part 1 · About you",
		level: "A1–A2",
		prompt: "What's your name, and where are you from?",
		prepSeconds: 5,
		answerSeconds: 20,
	},
	{
		id: "s-02",
		partLabel: "Part 1 · About you",
		level: "A1–A2",
		prompt: "Do you work or study? Tell me about it.",
		prepSeconds: 5,
		answerSeconds: 20,
	},
	{
		id: "s-03",
		partLabel: "Part 1 · About you",
		level: "A1–A2",
		prompt: "What do you usually do in the evening?",
		prepSeconds: 5,
		answerSeconds: 20,
	},
	{
		id: "s-04",
		partLabel: "Part 1 · About you",
		level: "A1–A2",
		prompt: "Tell me about your family.",
		prepSeconds: 5,
		answerSeconds: 20,
	},
	{
		id: "s-05",
		partLabel: "Part 2 · Tell me about…",
		level: "A2",
		prompt:
			"Talk about what you did last weekend.\nWhere did you go? Who were you with? Did you enjoy it?",
		prepSeconds: 15,
		answerSeconds: 45,
	},
	{
		id: "s-06",
		partLabel: "Part 2 · Tell me about…",
		level: "A2",
		prompt: "Describe your home.\nWhat is your favourite room? Why?",
		prepSeconds: 15,
		answerSeconds: 45,
	},
	{
		id: "s-07",
		partLabel: "Part 3 · Your opinion",
		level: "A2+–B1",
		prompt:
			"Would you prefer to live in a big city or in the countryside?\nGive reasons and examples.",
		prepSeconds: 20,
		answerSeconds: 60,
	},
	{
		id: "s-08",
		partLabel: "Part 3 · Your opinion",
		level: "A2+–B1",
		prompt:
			"Some people say young people spend too much time on social media.\nDo you agree? Why / why not?",
		prepSeconds: 20,
		answerSeconds: 60,
	},
];

/**
 * Clone sâu một mảng bài đọc Reading mặc định.
 */
function clonePassages(
	passages: ReadonlyArray<PlacementPublishedReadingPassage>,
): PlacementPublishedReadingPassage[] {
	return passages.map((passage) => ({
		...passage,
		questions: passage.questions.map((question) => ({
			...question,
			options: [...question.options],
		})),
	}));
}

/**
 * Trả về phần Reading mặc định chuẩn (bản sao sâu mới mỗi lần gọi).
 */
export function createDefaultPlacementReadingPart(): {
	id: "reading";
	title: string;
	passages: PlacementPublishedReadingPassage[];
} {
	return {
		id: "reading",
		title: "Reading",
		passages: clonePassages(DEFAULT_READING_PASSAGES),
	};
}

/**
 * Trả về phần Writing mặc định chuẩn (bản sao sâu mới mỗi lần gọi).
 */
export function createDefaultPlacementWritingPart(): PlacementPublishedWritingPart {
	return { ...DEFAULT_WRITING_PART };
}

/**
 * Trả về phần Speaking mặc định chuẩn (bản sao sâu mới mỗi lần gọi).
 */
export function createDefaultPlacementSpeakingPart(): {
	id: "speaking";
	title: string;
	tasks: PlacementPublishedSpeakingTask[];
} {
	return {
		id: "speaking",
		title: "Speaking",
		tasks: DEFAULT_SPEAKING_TASKS.map((task) => ({ ...task })),
	};
}

/**
 * Cấp phát ID hợp lệ với `PLACEMENT_ID_REGEX` (`<= 64` ký tự) chưa có trong `usedIds`.
 * Ghi nhận ID đã chọn vào `usedIds` trước khi trả về.
 */
export function allocateUniquePlacementId(
	rawId: string,
	usedIds: Set<string>,
	tag = "d",
): string {
	const sanitized = rawId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "item";
	if (!usedIds.has(sanitized)) {
		usedIds.add(sanitized);
		return sanitized;
	}

	const cleanTag = tag.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16) || "d";
	for (let i = 1; ; i += 1) {
		const suffix = `-${cleanTag}${i}`;
		const prefixLen = Math.max(1, 64 - suffix.length);
		const candidate = `${sanitized.slice(0, prefixLen)}${suffix}`.slice(0, 64);
		if (!usedIds.has(candidate)) {
			usedIds.add(candidate);
			return candidate;
		}
	}
}

/**
 * Clone và cấp phát ID duy nhất cho các bài đọc Reading được backfill,
 * đồng thời tôn trọng trần ngân sách câu hỏi `maxQuestions`.
 */
export function dedupeReadingPassages(
	passages: ReadonlyArray<PlacementPublishedReadingPassage>,
	usedQuestionIds: Set<string>,
	usedPassageIds: Set<string>,
	maxQuestions?: number,
): PlacementPublishedReadingPassage[] {
	let remaining =
		maxQuestions === undefined
			? Number.POSITIVE_INFINITY
			: Math.max(0, maxQuestions);
	const result: PlacementPublishedReadingPassage[] = [];

	for (const passage of passages) {
		if (remaining <= 0) break;
		// Do not slice a cloze passage mid-way — its body references every blank.
		if (passage.kind === "cloze" && remaining < passage.questions.length) {
			continue;
		}
		const sliceCount = Math.min(passage.questions.length, remaining);
		if (sliceCount <= 0) continue;
		remaining -= sliceCount;

		const passageId = allocateUniquePlacementId(passage.id, usedPassageIds);
		const questions = passage.questions.slice(0, sliceCount).map((q) => ({
			...q,
			id: allocateUniquePlacementId(q.id, usedQuestionIds),
			options: [...q.options],
		}));

		result.push({
			...passage,
			id: passageId,
			questions,
		});
	}

	return result;
}
