import { assignmentPromptCreateSchema } from "@teacher-os/api/contracts";
import { describe, expect, test } from "vitest";
import type { AssignmentPrompt, ClassAssignment } from "@/lib/mock-data";
import {
	buildDuplicatePromptPayload,
	buildHistoryItemView,
	computeBankStats,
	computeFilterCounts,
	filterAndSortPrompts,
	filtersToSearch,
	fmtBandDisplay,
	normalizeViSearch,
	promptMatchesQuery,
	resolveAssignmentFilters,
	stripUnsafeSearchChars,
	validateAssignmentsSearch,
} from "./assignment-bank-helpers";

function makePrompt(
	overrides: Partial<AssignmentPrompt> = {},
): AssignmentPrompt {
	return {
		id: "ap-1",
		skill: "writing",
		part: "task2",
		type: "discuss",
		task: "task2",
		genre: "discuss",
		title: "Học online hay học tại trường?",
		band: "6.5",
		level: "Intermediate",
		source: "Tự soạn",
		prompt: "<p>Discuss both views and give your own opinion.</p>",
		passage: "",
		intro: "",
		transcript: "",
		cueTopic: "",
		cuePoints: "",
		audioName: "",
		audioUrl: "",
		imageUrl: "",
		questions: [],
		optionBank: [],
		note: "",
		status: "ready",
		writing: null,
		createdAt: "2026-11-25T10:00:00.000Z",
		...overrides,
	};
}

describe("assignment-bank-helpers", () => {
	describe("Vietnamese search & sanitization", () => {
		test("normalizeViSearch strips diacritics and normalizes đ", () => {
			expect(normalizeViSearch("Đề thi Môi trường Đô thị")).toBe(
				"de thi moi truong do thi",
			);
		});

		test("stripUnsafeSearchChars strips control and Bidi characters", () => {
			expect(stripUnsafeSearchChars("abc\u202edef\u0007")).toBe("abcdef");
		});

		test("promptMatchesQuery matches across title, type label, source, and skill without diacritics", () => {
			const p = makePrompt({
				title: "Từ vựng môi trường",
				source: "Bộ đề quý IV",
				skill: "writing",
				part: "task2",
				type: "discuss",
			});
			expect(promptMatchesQuery(p, "moi truong")).toBe(true);
			expect(promptMatchesQuery(p, "bo de quy")).toBe(true);
			expect(promptMatchesQuery(p, "discuss both")).toBe(true);
			expect(promptMatchesQuery(p, "writing")).toBe(true);
			expect(promptMatchesQuery(p, "khong khop")).toBe(false);
		});
	});

	describe("URL search validation & resolution", () => {
		test("validateAssignmentsSearch strips unsafe chars and unknown values", () => {
			expect(
				validateAssignmentsSearch({
					q: "  moi\u202e truong ",
					skill: "reading",
					part: "p2",
					status: "used",
					sort: "bandDesc",
				}),
			).toEqual({
				q: "moi truong",
				skill: "reading",
				part: "p2",
				status: "used",
				sort: "bandDesc",
			});

			expect(
				validateAssignmentsSearch({
					q: "   ",
					skill: "invalid",
					part: "unknown",
					status: "weird",
					sort: "weird",
				}),
			).toEqual({
				q: undefined,
				skill: undefined,
				part: undefined,
				status: undefined,
				sort: undefined,
			});
		});

		test("resolveAssignmentFilters infers skill from legacy ?part=task1 without skill", () => {
			const resolved = resolveAssignmentFilters({ part: "task1" });
			expect(resolved.skill).toBe("writing");
			expect(resolved.part).toBe("task1");
		});

		test("filtersToSearch omits defaults", () => {
			expect(
				filtersToSearch({
					q: "",
					skill: "all",
					part: "all",
					status: "all",
					sort: "new",
				}),
			).toEqual({});
			expect(
				filtersToSearch({
					q: "ielts",
					skill: "reading",
					part: "p1",
					status: "draft",
					sort: "az",
				}),
			).toEqual({
				q: "ielts",
				skill: "reading",
				part: "p1",
				status: "draft",
				sort: "az",
			});
		});
	});

	describe("stats, counts, band formatting & sorting", () => {
		const prompts: AssignmentPrompt[] = [
			makePrompt({
				id: "p1",
				title: "Beta",
				skill: "writing",
				part: "task2",
				band: "7.5",
				status: "ready",
				createdAt: "2026-11-20T10:00:00.000Z",
			}),
			makePrompt({
				id: "p2",
				title: "Alpha",
				skill: "reading",
				part: "p1",
				type: "tfng",
				band: "6.0",
				status: "ready",
				createdAt: "2026-11-26T10:00:00.000Z",
			}),
			makePrompt({
				id: "p3",
				title: "Gamma draft with class",
				skill: "reading",
				part: "p2",
				type: "summary",
				band: "invalid",
				status: "draft",
				createdAt: "2026-11-27T10:00:00.000Z",
			}),
		];
		const usedMap = new Map<string, Set<string>>([
			["p1", new Set(["c1", "c2"])],
			["p3", new Set(["c1"])], // draft still counts as draft
		]);

		test("computeBankStats prioritizes draft over used", () => {
			expect(computeBankStats(prompts, usedMap)).toEqual({
				all: 3,
				used: 1,
				ready: 1,
				draft: 1,
			});
		});

		test("computeFilterCounts counts skills and parts matching query and status", () => {
			const counts = computeFilterCounts(prompts, "", "all", usedMap);
			expect(counts.all).toBe(3);
			expect(counts.bySkill.get("writing")).toBe(1);
			expect(counts.bySkill.get("reading")).toBe(2);
			expect(counts.byPart.get("reading:p1")).toBe(1);
			expect(counts.byPart.get("reading:p2")).toBe(1);
		});

		test("fmtBandDisplay formats numeric band and guards NaN/empty", () => {
			expect(fmtBandDisplay("7")).toBe("7.0");
			expect(fmtBandDisplay("6.5")).toBe("6.5");
			expect(fmtBandDisplay("")).toBe("—");
			expect(fmtBandDisplay("weird")).toBe("—");
		});

		test("filterAndSortPrompts supports new, used, bandDesc, bandAsc, az with non-finite bands last", () => {
			const baseFilters = {
				q: "",
				skill: "all" as const,
				part: "all",
				status: "all" as const,
			};
			expect(
				filterAndSortPrompts(
					prompts,
					{ ...baseFilters, sort: "new" },
					usedMap,
				).map((p) => p.id),
			).toEqual(["p3", "p2", "p1"]);

			expect(
				filterAndSortPrompts(
					prompts,
					{ ...baseFilters, sort: "used" },
					usedMap,
				).map((p) => p.id),
			).toEqual(["p1", "p3", "p2"]);

			expect(
				filterAndSortPrompts(
					prompts,
					{ ...baseFilters, sort: "bandDesc" },
					usedMap,
				).map((p) => p.id),
			).toEqual(["p1", "p2", "p3"]);

			expect(
				filterAndSortPrompts(
					prompts,
					{ ...baseFilters, sort: "bandAsc" },
					usedMap,
				).map((p) => p.id),
			).toEqual(["p2", "p1", "p3"]);

			expect(
				filterAndSortPrompts(
					prompts,
					{ ...baseFilters, sort: "az" },
					usedMap,
				).map((p) => p.id),
			).toEqual(["p2", "p1", "p3"]);
		});
	});

	describe("buildHistoryItemView", () => {
		test("derives progress from targets and appends thiếu N when overdue", () => {
			const ca: ClassAssignment = {
				id: "ca-1",
				classId: "c1",
				promptId: "ap-1",
				title: "Test",
				due: "2026-11-20",
				dueAt: "2026-11-20T14:00:00.000Z",
				note: "",
				createdAt: "2026-11-15T10:00:00.000Z",
				targets: [
					{ studentId: "s1", submittedAt: "2026-11-19T10:00:00.000Z" },
					{ studentId: "s2", submittedAt: null, attemptId: "att-2" },
					{ studentId: "s3", submittedAt: null, attemptId: null },
				],
			};
			const view = buildHistoryItemView(
				ca,
				"IELTS 6.5",
				"2026-11-27",
				Date.parse("2026-11-27T10:00:00.000Z"),
			);
			expect(view.submittedCount).toBe(2);
			expect(view.totalCount).toBe(3);
			expect(view.pct).toBe(67);
			expect(view.badgeKey).toBe("late");
			expect(view.badgeLabel).toBe("Quá hạn · thiếu 1");
			expect(view.dueDisplay).toBe("21:00 20/11/2026");
		});
	});

	describe("buildDuplicatePromptPayload", () => {
		test("builds valid schema payload across all 6 skills and preserves level", () => {
			const samples: AssignmentPrompt[] = [
				makePrompt({
					skill: "writing",
					part: "task1",
					type: "chart",
					level: "Foundation",
					prompt: "<p>Chart task</p>",
				}),
				makePrompt({
					skill: "reading",
					part: "p2",
					type: "features",
					passage: "<p>Long passage</p>",
					optionBank: ["Brunel", "Darwin"],
					questions: [
						{ stem: "27", opts: null, answer: "A", alts: "", type: "features" },
					],
				}),
				makePrompt({
					skill: "listening",
					part: "s1",
					type: "form",
					audioName: "s1.mp3",
					audioUrl: "https://www.listenaminute.com/a/audio.mp3",
					questions: [
						{ stem: "Name: ____", opts: null, answer: "Lee", alts: "" },
					],
				}),
				makePrompt({
					skill: "speaking",
					part: "part2",
					type: "place",
					prompt: "",
					cueTopic: "a quiet park",
					cuePoints: "Where it is\nWhy you like it",
				}),
				makePrompt({
					skill: "grammar",
					part: "g1",
					type: "mcq",
					questions: [
						{
							stem: "Choose",
							opts: ["a", "b", "c", "d"],
							answer: "B",
							alts: "",
						},
					],
					writing: {
						part: "task2",
						type: "discuss",
						prompt: "<p>Write an essay</p>",
					},
				}),
				makePrompt({
					skill: "vocabulary",
					part: "v1",
					type: "match",
					optionBank: ["synonym 1", "synonym 2"],
					questions: [{ stem: "Word 1", opts: null, answer: "A", alts: "" }],
				}),
			];

			for (const sample of samples) {
				const built = buildDuplicatePromptPayload(sample);
				expect(built.ok).toBe(true);
				if (!built.ok) continue;
				expect(built.payload.status).toBe("draft");
				expect(built.payload.title.endsWith(" (bản sao)")).toBe(true);
				const parsed = assignmentPromptCreateSchema.safeParse(built.payload);
				expect(parsed.success).toBe(true);
			}
		});

		test("clamps 200-char title, normalizes legacy grammar part/band, strips invalid audioUrl and non-auto questions", () => {
			const longTitle = "A".repeat(200);
			const legacy = makePrompt({
				title: longTitle,
				skill: "writing",
				part: "task2",
				type: "opinion",
				band: "9.0",
				level: "B2",
				audioUrl: "javascript:alert(1)",
				imageUrl: "http://insecure.example.com/img.png",
				questions: [{ stem: "Stray", opts: null, answer: "X", alts: "" }],
				optionBank: ["Stray option"],
				writing: { part: "task1", type: "chart", prompt: "<p>Stray</p>" },
			});
			const res = buildDuplicatePromptPayload(legacy);
			expect(res.ok).toBe(true);
			if (!res.ok) return;
			expect(res.payload.title.length).toBeLessThanOrEqual(200);
			expect(res.payload.title.endsWith(" (bản sao)")).toBe(true);
			expect(res.payload.band).toBe("7.0");
			expect(res.payload.level).toBe("B2");
			expect(res.payload.audioUrl).toBeUndefined();
			expect(res.payload.imageUrl).toBe("");
			expect(res.payload.questions).toEqual([]);
			expect(res.payload.optionBank).toEqual([]);
			expect(res.payload.writing).toBeUndefined();

			const legacyGrammar = makePrompt({
				skill: "grammar",
				part: "tenses",
				type: "mcq",
				questions: [{ stem: "Q1", opts: ["a", "b"], answer: "Z", alts: "" }],
			});
			const resG = buildDuplicatePromptPayload(legacyGrammar);
			expect(resG.ok).toBe(true);
			if (resG.ok) {
				expect(resG.payload.part).toBe("g1");
				expect(resG.payload.questions[0]?.answer).toBe("");
			}
		});

		test("returns ok: false when core required content is corrupt/empty", () => {
			const brokenReading = makePrompt({
				skill: "reading",
				part: "p1",
				type: "tfng",
				passage: "",
				questions: [],
			});
			const res = buildDuplicatePromptPayload(brokenReading);
			expect(res.ok).toBe(false);
		});
	});
});
