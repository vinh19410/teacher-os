import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
	isAllowedStudyPackAudioUrl,
	isValidStudyPackAudioKey,
	libraryExerciseCreateSchema,
	studyPackCreateSchema,
} from "./contracts";

interface RawBundle {
	pack: {
		id: string;
		title: string;
		description: string;
		level: string;
		status: "draft" | "ready";
	};
	exercises: Array<Record<string, unknown> & { id: string }>;
	items: Array<{
		id: string;
		packId: string;
		dayIndex: number;
		sourceKind: "library_exercise";
		sourceId: string;
		note: string;
	}>;
}

function loadBundle(fileName: string): RawBundle {
	const jsonPath = resolve(
		import.meta.dirname,
		`../../db/seed-data/study-packs/${fileName}`,
	);
	return JSON.parse(readFileSync(jsonPath, "utf8")) as RawBundle;
}

describe("study-packs seed contracts (#702, #814)", () => {
	test("validates foun-gt1-discipline.json pack and all 69 library exercises", () => {
		const bundle = loadBundle("foun-gt1-discipline.json");

		expect(bundle.pack.id).toBe("syspack-foun-gt1-discipline");
		expect(bundle.pack.level).toBe("IELTS Foundation");
		expect(bundle.pack.status).toBe("ready");
		expect(bundle.exercises).toHaveLength(69);
		expect(bundle.items).toHaveLength(69);

		const packPayload = {
			title: bundle.pack.title,
			description: bundle.pack.description,
			level: bundle.pack.level,
			status: bundle.pack.status,
			items: bundle.items.map((item) => ({
				dayIndex: item.dayIndex,
				sourceKind: item.sourceKind,
				sourceId: item.sourceId,
				note: item.note,
			})),
		};
		const parsedPack = studyPackCreateSchema.safeParse(packPayload);
		expect(parsedPack.success).toBe(true);

		const seenStems = new Set<string>();
		let listeningCount = 0;

		for (const rawExercise of bundle.exercises) {
			const { id, ...createPayload } = rawExercise;
			expect(id).toMatch(/^sysex-foun-gt1-b\d{2}$/);
			const parsedEx = libraryExerciseCreateSchema.safeParse(createPayload);
			if (!parsedEx.success) {
				throw new Error(
					`Exercise ${id} failed libraryExerciseCreateSchema: ${JSON.stringify(parsedEx.error.issues)}`,
				);
			}
			expect(parsedEx.data.level).toBe("IELTS Foundation");
			expect(parsedEx.data.status).toBe("ready");

			if (parsedEx.data.skill === "listening") {
				listeningCount++;
				expect(isAllowedStudyPackAudioUrl(parsedEx.data.audioUrl)).toBe(true);
				expect(parsedEx.data.transcript.trim().length).toBeGreaterThan(20);
			} else {
				expect(parsedEx.data.audioUrl).toBe("");
			}

			for (const q of parsedEx.data.questions) {
				const normalizedStem = q.stem.trim().replace(/\s+/g, " ").toLowerCase();
				expect(seenStems.has(normalizedStem)).toBe(false);
				seenStems.add(normalizedStem);
			}
		}

		expect(listeningCount).toBe(28);
	});

	test("validates first-step-gt2.json pack, 62 deduplicated exercises, R2 audioKeys, and audio manifest (#814)", () => {
		const bundle = loadBundle("first-step-gt2.json");
		const manifestPath = resolve(
			import.meta.dirname,
			"../../db/seed-data/study-packs/first-step-gt2.audio-manifest.json",
		);
		const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Array<{
			dayIndex: number;
			exerciseId: string;
			audioKey: string;
			youtubeId: string;
			sourceUrl: string;
		}>;

		expect(bundle.pack.id).toBe("syspack-first-step-gt2");
		expect(bundle.pack.level).toBe("IELTS First Step");
		expect(bundle.pack.status).toBe("ready");
		expect(bundle.exercises).toHaveLength(62);
		expect(bundle.items).toHaveLength(62);

		const parsedPack = studyPackCreateSchema.safeParse({
			title: bundle.pack.title,
			description: bundle.pack.description,
			level: bundle.pack.level,
			status: bundle.pack.status,
			items: bundle.items.map((item) => ({
				dayIndex: item.dayIndex,
				sourceKind: item.sourceKind,
				sourceId: item.sourceId,
				note: item.note,
			})),
		});
		expect(parsedPack.success).toBe(true);
		expect(bundle.items.map((item) => item.dayIndex)).toEqual(
			Array.from({ length: 62 }, (_, i) => i + 1),
		);

		const listeningKeys = new Map<string, string>();
		const seenNotes = new Set<string>();
		let readingCount = 0;

		for (const rawExercise of bundle.exercises) {
			const {
				id,
				audioKey = "",
				...createPayload
			} = rawExercise as Record<string, unknown> & {
				id: string;
				audioKey?: string;
			};
			expect(id).toMatch(/^sysex-first-step-gt2-b\d{2}$/);
			const note = String(createPayload.note ?? "");
			expect(seenNotes.has(note)).toBe(false);
			seenNotes.add(note);

			const validationInput = { ...createPayload };
			if (createPayload.skill === "listening") {
				expect(typeof audioKey).toBe("string");
				expect(isValidStudyPackAudioKey(audioKey)).toBe(true);
				listeningKeys.set(id, audioKey);
				validationInput.audioUrl =
					"https://listenaminute.com/a/placeholder.mp3";
			} else {
				readingCount++;
				expect(audioKey).toBe("");
				expect(createPayload.audioUrl).toBe("");
			}

			const parsedEx = libraryExerciseCreateSchema.safeParse(validationInput);
			if (!parsedEx.success) {
				throw new Error(
					`Exercise ${id} failed libraryExerciseCreateSchema: ${JSON.stringify(parsedEx.error.issues)}`,
				);
			}
			expect(parsedEx.data.level).toBe("IELTS First Step");
			expect(parsedEx.data.status).toBe("ready");

			for (const [qIndex, q] of parsedEx.data.questions.entries()) {
				const stem = q.stem;
				expect(
					stem,
					`${id} q[${qIndex}] contains raw HTML/control markup`,
				).not.toMatch(
					/<[a-zA-Z/!]|quiz_section|answer_wrap|readonly value|onchange=/i,
				);
				expect(
					stem,
					`${id} q[${qIndex}] contains site chrome noise`,
				).not.toMatch(/\[Other Tests\]|Total questions:/i);
				expect(
					stem,
					`${id} q[${qIndex}] must contain alphabetical words`,
				).toMatch(/[A-Za-z]/);
				expect(
					stem,
					`${id} q[${qIndex}] leaked sibling placeholder N (N)`,
				).not.toMatch(/\b(\d+)\s*\(\1\)/);
				expect(q.answer, `${id} q[${qIndex}] answer has parens`).not.toMatch(
					/[()]/,
				);
				expect(q.alts, `${id} q[${qIndex}] alts has parens`).not.toMatch(
					/[()]/,
				);

				if (
					q.type === "mcq" ||
					q.type === "mcq1" ||
					q.type === "mcq3" ||
					q.type === "mcq_many"
				) {
					const opts = q.opts ?? [];
					expect(
						opts.length,
						`${id} q[${qIndex}] MCQ options collapsed`,
					).toBeGreaterThanOrEqual(2);
					const letterIdx = q.answer.trim().toUpperCase().charCodeAt(0) - 65;
					expect(
						letterIdx >= 0 && letterIdx < opts.length,
						`${id} q[${qIndex}] answer ${q.answer} out of opts range (len=${opts.length})`,
					).toBe(true);
				}
			}
		}

		expect(readingCount).toBe(30);
		expect(listeningKeys.size).toBe(32);
		expect(manifest).toHaveLength(32);
		for (const entry of manifest) {
			expect(listeningKeys.get(entry.exerciseId)).toBe(entry.audioKey);
			expect(entry.youtubeId.length).toBeGreaterThan(5);
		}
	});

	test("isAllowedStudyPackAudioUrl rejects embedded credentials and non-default ports", () => {
		expect(
			isAllowedStudyPackAudioUrl("https://listenaminute.com/a/accidents.mp3"),
		).toBe(true);
		expect(
			isAllowedStudyPackAudioUrl(
				"https://user:pass@listenaminute.com/a/accidents.mp3",
			),
		).toBe(false);
		expect(
			isAllowedStudyPackAudioUrl(
				"https://listenaminute.com:8443/a/accidents.mp3",
			),
		).toBe(false);
	});
});
