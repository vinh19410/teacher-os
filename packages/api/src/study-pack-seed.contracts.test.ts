import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
	isAllowedStudyPackAudioUrl,
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

function loadDisciplineBundle(): RawBundle {
	const jsonPath = resolve(
		import.meta.dirname,
		"../../db/seed-data/study-packs/foun-gt1-discipline.json",
	);
	return JSON.parse(readFileSync(jsonPath, "utf8")) as RawBundle;
}

describe("foun-gt1-discipline.json contracts (#702)", () => {
	test("validates pack and all 69 library exercises against strict API schemas", () => {
		const bundle = loadDisciplineBundle();

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
