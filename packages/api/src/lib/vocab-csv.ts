import {
	VOCAB_CSV_IMPORT_MAX_DECKS,
	VOCAB_CSV_IMPORT_MAX_WORDS_PER_REQUEST,
	type VocabDeckCsvImportItem,
	type VocabEntryType,
	type VocabWordImportItem,
} from "../contracts";

export const VOCAB_SAMPLE_CSV_FILENAME =
	"Lesson 01 – Friends & Introductions.csv";

export const VOCAB_SAMPLE_CSV_CONTENT =
	"\uFEFF" +
	[
		"Lesson,Topic,Type,No,Word / Chunk,IPA,Part of speech,Vietnamese,Example",
		"1,Friends & Introductions,Word,1,introduce,/ˌɪntrəˈdjuːs/,v.,giới thiệu,Can I introduce my friend Nam?",
		'1,Friends & Introductions,Word,2,currently,/ˈkʌrəntli/,adv.,"hiện tại, lúc này",I\'m currently a university student.',
		"1,Friends & Introductions,Word,3,hometown,/ˈhəʊmtaʊn/,n.,quê nhà,My hometown is Da Nang.",
		"1,Friends & Introductions,Word,4,hobby,/ˈhɒbi/,n.,sở thích,My hobby is playing badminton.",
		"1,Friends & Introductions,Chunk,1,tell you a little bit about myself,,,kể một chút về bản thân,Let me tell you a little bit about myself.",
		"1,Friends & Introductions,Chunk,2,be a second-year student of …,,,là sinh viên năm hai của …,I'm a second-year student of Economics.",
		'1,Friends & Introductions,Chunk,3,be from + (city / country),,,đến từ …,"I\'m from Hue, in the centre of Vietnam."',
		"1,Friends & Introductions,Chunk,4,be … years old,,,… tuổi,I'm twenty-one years old.",
		"1,Friends & Introductions,Word,5,personality,/ˌpɜːsəˈnæləti/,n.,tính cách,She has a warm personality.",
		"1,Friends & Introductions,Word,6,introvert,/ˈɪntrəvɜːt/,n.,người hướng nội,I'm an introvert. I love quiet evenings.",
		"1,Friends & Introductions,Word,7,extrovert,/ˈekstrəvɜːt/,n.,người hướng ngoại,My brother is an extrovert; he loves parties.",
		'1,Friends & Introductions,Word,8,sociable,/ˈsəʊʃəbl/,adj.,"hoà đồng, dễ gần",Nam is sociable and talks to everyone.',
		"1,Friends & Introductions,Word,9,honest,/ˈɒnɪst/,adj.,trung thực,A good friend is honest with you.",
		'1,Friends & Introductions,Word,10,supportive,/səˈpɔːtɪv/,adj.,"hay giúp đỡ, ủng hộ",My friends are very supportive.',
		"1,Friends & Introductions,Word,11,social media,/ˌsəʊʃl ˈmiːdiə/,n.,mạng xã hội,I use social media every day.",
		'1,Friends & Introductions,Word,12,hang out,/hæŋ ˈaʊt/,phr. v.,"đi chơi, tụ tập",We hang out at a café on Sundays.',
		"1,Friends & Introductions,Word,13,prefer,/prɪˈfɜː(r)/,v.,thích hơn,I prefer tea to coffee.",
		"1,Friends & Introductions,Word,14,mood,/muːd/,n.,tâm trạng,Music changes my mood.",
		'1,Friends & Introductions,Word,15,memory,/ˈmeməri/,n.,"kỷ niệm, ký ức",I have many happy memories of school.',
		"1,Friends & Introductions,Word,16,in person,/ɪn ˈpɜːsn/,phr.,gặp trực tiếp,I prefer to talk in person.",
		"1,Friends & Introductions,Chunk,5,make friends with sb,,,kết bạn với ai,I make friends with people at my club.",
		"1,Friends & Introductions,Chunk,6,suit my personality,,,hợp với tính cách của tôi,Quiet friends suit my personality.",
		"1,Friends & Introductions,Chunk,7,a good friend is someone who …,,,bạn tốt là người …,A good friend is someone who listens.",
		"1,Friends & Introductions,Chunk,8,stay in touch with sb,,,giữ liên lạc với ai,I stay in touch with my high school friends.",
		"1,Friends & Introductions,Chunk,9,chat via social media,,,trò chuyện qua mạng xã hội,We chat via social media like Zalo.",
		"1,Friends & Introductions,Chunk,10,recharge my batteries,,,nạp lại năng lượng,I sleep late to recharge my batteries.",
		"1,Friends & Introductions,Chunk,11,prefer staying at home,,,thích ở nhà hơn,I prefer staying at home at weekends.",
		"1,Friends & Introductions,Chunk,12,see each other in person,,,gặp nhau trực tiếp,We rarely see each other in person.",
		"",
	].join("\r\n");

export interface ParsedCsvLine {
	lineNumber: number;
	cells: string[];
}

export type VocabCsvParseResult =
	| {
			ok: true;
			decks: VocabDeckCsvImportItem[];
			words: VocabWordImportItem[];
			totalWords: number;
			wordCount: number;
			chunkCount: number;
	  }
	| {
			ok: false;
			errors: string[];
	  };

/**
 * Formats a canonical deck title from `lessonNumber` and `topic`
 * matching `Lesson 01 – Friends & Introductions`.
 */
export function formatVocabLessonDeckTitle(
	lessonNumber: number | null | undefined,
	topic: string | null | undefined,
): string {
	const cleanTopic = topic?.trim() ?? "";
	const hasLesson =
		typeof lessonNumber === "number" &&
		Number.isInteger(lessonNumber) &&
		lessonNumber >= 1;
	if (hasLesson && cleanTopic) {
		return `Lesson ${String(lessonNumber).padStart(2, "0")} – ${cleanTopic}`;
	}
	if (hasLesson) {
		return `Lesson ${String(lessonNumber).padStart(2, "0")}`;
	}
	return cleanTopic;
}

/**
 * Pure RFC 4180 CSV parser preserving original 1-based starting line numbers.
 */
export function parseCsvRecords(
	rawText: string,
): { ok: true; records: ParsedCsvLine[] } | { ok: false; error: string } {
	const text = rawText
		.replace(/^\uFEFF/, "")
		.replace(/\r\n/g, "\n")
		.replace(/\r/g, "\n");
	const records: ParsedCsvLine[] = [];
	let currentRow: string[] = [];
	let currentField = "";
	let inQuotes = false;
	let rowStartLine = 1;
	let currentLine = 1;

	for (let i = 0; i < text.length; i++) {
		const ch = text[i] ?? "";
		if (inQuotes) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					currentField += '"';
					i += 1;
				} else {
					inQuotes = false;
				}
			} else {
				if (ch === "\n") currentLine += 1;
				currentField += ch;
			}
			continue;
		}

		if (ch === '"' && currentField.length === 0) {
			inQuotes = true;
			continue;
		}
		if (ch === ",") {
			currentRow.push(currentField);
			currentField = "";
			continue;
		}
		if (ch === "\n") {
			currentRow.push(currentField);
			records.push({ lineNumber: rowStartLine, cells: currentRow });
			currentRow = [];
			currentField = "";
			currentLine += 1;
			rowStartLine = currentLine;
			continue;
		}
		currentField += ch;
	}

	if (inQuotes) {
		return {
			ok: false,
			error: `Dòng ${rowStartLine}: dấu ngoặc kép (") chưa được đóng.`,
		};
	}

	if (currentField.length > 0 || currentRow.length > 0) {
		currentRow.push(currentField);
		records.push({ lineNumber: rowStartLine, cells: currentRow });
	}

	const nonEmpty = records.filter((rec) =>
		rec.cells.some((cell) => cell.trim().length > 0),
	);
	return { ok: true, records: nonEmpty };
}

function normalizeHeaderName(raw: string): string {
	return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

function findColumnIndex(
	headers: string[],
	aliases: readonly string[],
): number {
	for (const alias of aliases) {
		const idx = headers.indexOf(alias);
		if (idx !== -1) return idx;
	}
	return -1;
}

function parseEntryType(
	raw: string,
	lineNumber: number,
): { ok: true; value: VocabEntryType } | { ok: false; error: string } {
	const v = raw.trim().toLowerCase();
	if (v === "" || v === "word") return { ok: true, value: "word" };
	if (v === "chunk") return { ok: true, value: "chunk" };
	return {
		ok: false,
		error: `Dòng ${lineNumber}: cột Type chỉ nhận "Word" hoặc "Chunk" (nhận "${raw.trim()}").`,
	};
}

/**
 * Parses and validates a lesson vocabulary CSV string into grouped decks and flat word items.
 */
export function parseVocabCsv(
	csvText: string,
	options: {
		mode: "create-decks" | "append-words";
		lang?: string;
	},
): VocabCsvParseResult {
	const parsed = parseCsvRecords(csvText);
	if (!parsed.ok) {
		return { ok: false, errors: [parsed.error] };
	}
	if (parsed.records.length === 0) {
		return { ok: false, errors: ["File CSV trống."] };
	}

	const headerRecord = parsed.records[0];
	if (!headerRecord) {
		return { ok: false, errors: ["File CSV trống."] };
	}

	const headers = headerRecord.cells.map(normalizeHeaderName);
	const colLesson = findColumnIndex(headers, ["lesson", "buổi", "buoi"]);
	const colTopic = findColumnIndex(headers, ["topic", "chủ đề", "chu de"]);
	const colType = findColumnIndex(headers, ["type", "loại", "loai"]);
	const colWord = findColumnIndex(headers, [
		"word / chunk",
		"word/chunk",
		"word",
		"từ vựng",
	]);
	const colIpa = findColumnIndex(headers, ["ipa"]);
	const colPos = findColumnIndex(headers, [
		"part of speech",
		"pos",
		"từ loại",
		"tu loai",
	]);
	const colVietnamese = findColumnIndex(headers, [
		"vietnamese",
		"nghĩa tiếng việt",
		"nghia tieng viet",
		"translation",
		"nghĩa",
	]);
	const colExample = findColumnIndex(headers, [
		"example",
		"ví dụ",
		"vi du",
		"sentence",
	]);

	const missingHeaders: string[] = [];
	if (colWord === -1) missingHeaders.push("Word / Chunk");
	if (colVietnamese === -1) missingHeaders.push("Vietnamese");
	if (options.mode === "create-decks" && colLesson === -1 && colTopic === -1) {
		missingHeaders.push("Lesson hoặc Topic");
	}
	if (missingHeaders.length > 0) {
		return {
			ok: false,
			errors: [
				`Thiếu cột bắt buộc ở dòng tiêu đề: ${missingHeaders.join(", ")}.`,
			],
		};
	}

	const dataRecords = parsed.records.slice(1);
	if (dataRecords.length === 0) {
		return {
			ok: false,
			errors: ["File CSV chỉ có dòng tiêu đề, chưa có dữ liệu từ vựng."],
		};
	}

	const errors: string[] = [];
	const words: VocabWordImportItem[] = [];
	const deckMap = new Map<string, VocabDeckCsvImportItem>();
	const lang = options.lang?.trim() || "en";
	let wordCount = 0;
	let chunkCount = 0;

	for (const rec of dataRecords) {
		const line = rec.lineNumber;
		const cell = (idx: number) =>
			idx >= 0 ? (rec.cells[idx] ?? "").trim() : "";

		const rawWord = cell(colWord);
		const rawTranslation = cell(colVietnamese);
		const rawType = cell(colType);
		const rawIpa = cell(colIpa);
		const rawPos = cell(colPos);
		const rawExample = cell(colExample);
		const rawLesson = cell(colLesson);
		const rawTopic = cell(colTopic);

		let rowHasError = false;
		if (rawWord.length === 0) {
			errors.push(`Dòng ${line}: cột "Word / Chunk" không được để trống.`);
			rowHasError = true;
		} else if (rawWord.length > 200) {
			errors.push(`Dòng ${line}: "Word / Chunk" vượt quá 200 ký tự.`);
			rowHasError = true;
		}

		if (rawTranslation.length === 0) {
			errors.push(`Dòng ${line}: cột "Vietnamese" không được để trống.`);
			rowHasError = true;
		} else if (rawTranslation.length > 500) {
			errors.push(`Dòng ${line}: "Vietnamese" vượt quá 500 ký tự.`);
			rowHasError = true;
		}

		if (rawIpa.length > 200) {
			errors.push(`Dòng ${line}: "IPA" vượt quá 200 ký tự.`);
			rowHasError = true;
		}
		if (rawPos.length > 100) {
			errors.push(`Dòng ${line}: "Part of speech" vượt quá 100 ký tự.`);
			rowHasError = true;
		}
		if (rawExample.length > 1000) {
			errors.push(`Dòng ${line}: "Example" vượt quá 1000 ký tự.`);
			rowHasError = true;
		}

		const typeResult = parseEntryType(rawType, line);
		if (!typeResult.ok) {
			errors.push(typeResult.error);
			rowHasError = true;
		}

		let lessonNumber: number | null = null;
		if (rawLesson.length > 0) {
			if (!/^\d+$/.test(rawLesson)) {
				errors.push(
					`Dòng ${line}: cột "Lesson" phải là số nguyên dương (nhận "${rawLesson}").`,
				);
				rowHasError = true;
			} else {
				const parsedLesson = Number.parseInt(rawLesson, 10);
				if (parsedLesson < 1 || parsedLesson > 9999) {
					errors.push(
						`Dòng ${line}: cột "Lesson" phải nằm trong khoảng 1–9999.`,
					);
					rowHasError = true;
				} else {
					lessonNumber = parsedLesson;
				}
			}
		}

		const topic = rawTopic.length > 0 ? rawTopic : null;
		if (topic && topic.length > 200) {
			errors.push(`Dòng ${line}: cột "Topic" vượt quá 200 ký tự.`);
			rowHasError = true;
		}

		if (options.mode === "create-decks" && lessonNumber === null && !topic) {
			errors.push(
				`Dòng ${line}: cần có ít nhất cột "Lesson" hoặc "Topic" để tạo bộ từ.`,
			);
			rowHasError = true;
		}

		if (rowHasError || !typeResult.ok) continue;

		const item: VocabWordImportItem = {
			word: rawWord,
			entryType: typeResult.value,
			ipa: rawIpa.length > 0 ? rawIpa : null,
			pos: rawPos.length > 0 ? rawPos : null,
			translation: rawTranslation,
			example: rawExample.length > 0 ? rawExample : null,
		};
		words.push(item);
		if (item.entryType === "chunk") {
			chunkCount += 1;
		} else {
			wordCount += 1;
		}

		if (options.mode === "create-decks") {
			const groupKey = `${lessonNumber ?? ""}::${topic ?? ""}`;
			let group = deckMap.get(groupKey);
			if (!group) {
				const title = formatVocabLessonDeckTitle(lessonNumber, topic);
				group = {
					title: title.slice(0, 200),
					lessonNumber,
					topic,
					lang,
					words: [],
				};
				deckMap.set(groupKey, group);
			}
			group.words.push(item);
		}
	}

	if (errors.length > 0) {
		return { ok: false, errors };
	}

	if (words.length > VOCAB_CSV_IMPORT_MAX_WORDS_PER_REQUEST) {
		return {
			ok: false,
			errors: [
				`Tổng số từ trong một lần import tối đa ${VOCAB_CSV_IMPORT_MAX_WORDS_PER_REQUEST} (file hiện có ${words.length}).`,
			],
		};
	}

	const decks = Array.from(deckMap.values());
	if (
		options.mode === "create-decks" &&
		decks.length > VOCAB_CSV_IMPORT_MAX_DECKS
	) {
		return {
			ok: false,
			errors: [
				`Số bộ từ trong một lần import tối đa ${VOCAB_CSV_IMPORT_MAX_DECKS} (file hiện có ${decks.length}).`,
			],
		};
	}

	return {
		ok: true,
		decks,
		words,
		totalWords: words.length,
		wordCount,
		chunkCount,
	};
}
