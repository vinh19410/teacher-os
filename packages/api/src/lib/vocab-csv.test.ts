import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	formatVocabLessonDeckTitle,
	parseVocabCsv,
	VOCAB_SAMPLE_CSV_CONTENT,
} from "./vocab-csv";

const SAMPLE_CSV_PATH = fileURLToPath(
	new URL(
		"../../../../docs/vocab-sample/Lesson 01 – Friends & Introductions.csv",
		import.meta.url,
	).href,
);

describe("vocab CSV parser & formatter", () => {
	it("formats Lesson + Topic titles matching the sample naming", () => {
		expect(formatVocabLessonDeckTitle(1, "Friends & Introductions")).toBe(
			"Lesson 01 – Friends & Introductions",
		);
		expect(formatVocabLessonDeckTitle(12, "Travel")).toBe("Lesson 12 – Travel");
		expect(formatVocabLessonDeckTitle(3, null)).toBe("Lesson 03");
		expect(formatVocabLessonDeckTitle(null, "Daily Routines")).toBe(
			"Daily Routines",
		);
	});

	it("parses the official docs/vocab-sample/Lesson 01 CSV into 1 deck with 16 words and 12 chunks in file order", () => {
		const raw = readFileSync(SAMPLE_CSV_PATH, "utf8");
		const res = parseVocabCsv(raw, { mode: "create-decks" });
		expect(res.ok).toBe(true);
		if (!res.ok) return;

		expect(res.decks).toHaveLength(1);
		expect(res.totalWords).toBe(28);
		expect(res.wordCount).toBe(16);
		expect(res.chunkCount).toBe(12);

		const deck = res.decks[0];
		expect(deck).toBeDefined();
		if (!deck) return;
		expect(deck.title).toBe("Lesson 01 – Friends & Introductions");
		expect(deck.lessonNumber).toBe(1);
		expect(deck.topic).toBe("Friends & Introductions");
		expect(deck.words).toHaveLength(28);

		// Verify quoted commas, chunk order (not re-sorted by No!), IPA, POS, and Example
		expect(deck.words[1]).toEqual({
			word: "currently",
			entryType: "word",
			ipa: "/ˈkʌrəntli/",
			pos: "adv.",
			translation: "hiện tại, lúc này",
			example: "I'm currently a university student.",
		});
		expect(deck.words[4]).toEqual({
			word: "tell you a little bit about myself",
			entryType: "chunk",
			ipa: null,
			pos: null,
			translation: "kể một chút về bản thân",
			example: "Let me tell you a little bit about myself.",
		});
		expect(deck.words[6]).toEqual({
			word: "be from + (city / country)",
			entryType: "chunk",
			ipa: null,
			pos: null,
			translation: "đến từ …",
			example: "I'm from Hue, in the centre of Vietnam.",
		});
		expect(deck.words[15]).toEqual({
			word: "hang out",
			entryType: "word",
			ipa: "/hæŋ ˈaʊt/",
			pos: "phr. v.",
			translation: "đi chơi, tụ tập",
			example: "We hang out at a café on Sundays.",
		});
		expect(deck.words[27]).toEqual({
			word: "see each other in person",
			entryType: "chunk",
			ipa: null,
			pos: null,
			translation: "gặp nhau trực tiếp",
			example: "We rarely see each other in person.",
		});
	});

	it("keeps VOCAB_SAMPLE_CSV_CONTENT aligned with the sample file", () => {
		const raw = readFileSync(SAMPLE_CSV_PATH, "utf8").replace(/\r\n/g, "\n");
		expect(VOCAB_SAMPLE_CSV_CONTENT.replace(/\r\n/g, "\n")).toBe(raw);
	});

	it("groups multi-lesson CSV rows into separate decks in order of appearance", () => {
		const csv = [
			"\uFEFFLesson,Topic,Type,No,Word / Chunk,IPA,Part of speech,Vietnamese,Example",
			"1,Intro,Word,1,hello,/həˈləʊ/,excl.,xin chào,Hello!",
			"2,Food,Chunk,1,grab a bite,,,ăn nhanh,Let's grab a bite.",
			"1,Intro,Word,2,bye,/baɪ/,excl.,tạm biệt,Bye!",
		].join("\n");

		const res = parseVocabCsv(csv, { mode: "create-decks" });
		expect(res.ok).toBe(true);
		if (!res.ok) return;

		expect(res.decks).toHaveLength(2);
		expect(res.decks[0]?.title).toBe("Lesson 01 – Intro");
		expect(res.decks[0]?.words.map((w) => w.word)).toEqual(["hello", "bye"]);
		expect(res.decks[1]?.title).toBe("Lesson 02 – Food");
		expect(res.decks[1]?.words.map((w) => w.word)).toEqual(["grab a bite"]);
	});

	it("supports append-words mode even when Lesson and Topic columns are omitted", () => {
		const csv = [
			"Type,Word / Chunk,IPA,Part of speech,Vietnamese,Example",
			"Word,mentor,/ˈmentɔː/,n.,người hướng dẫn,She is my mentor.",
			"Chunk,keep in touch,,,giữ liên lạc,Let's keep in touch.",
		].join("\n");

		const res = parseVocabCsv(csv, { mode: "append-words" });
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		expect(res.words).toHaveLength(2);
		expect(res.wordCount).toBe(1);
		expect(res.chunkCount).toBe(1);
	});

	it("reports line-level errors for invalid Type, Lesson, missing Word/Vietnamese, or unclosed quotes", () => {
		const invalid = [
			"Lesson,Topic,Type,No,Word / Chunk,IPA,Part of speech,Vietnamese,Example",
			"abc,Intro,Idiom,1,,,n.,,Example",
		].join("\n");
		const res = parseVocabCsv(invalid, { mode: "create-decks" });
		expect(res.ok).toBe(false);
		if (res.ok) return;
		expect(res.errors.some((e) => e.includes("Dòng 2"))).toBe(true);
		expect(res.errors.some((e) => e.includes("Word / Chunk"))).toBe(true);
		expect(res.errors.some((e) => e.includes("Vietnamese"))).toBe(true);
		expect(res.errors.some((e) => e.includes("Type"))).toBe(true);
		expect(res.errors.some((e) => e.includes("Lesson"))).toBe(true);

		const unclosed =
			'Lesson,Topic,Type,No,Word / Chunk,IPA,Part of speech,Vietnamese,Example\n1,T,Word,1,hi,,,xin chào,"unclosed';
		const unclosedRes = parseVocabCsv(unclosed, { mode: "create-decks" });
		expect(unclosedRes.ok).toBe(false);
	});
});
