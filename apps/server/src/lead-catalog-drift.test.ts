import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	LEAD_COURSE_GROUPS,
	LEAD_COURSE_LABELS,
	LEAD_COURSES,
	LEAD_STUDY_MODE_LABELS,
	LEAD_STUDY_MODES,
} from "@teacher-os/api/lead-contracts";
import {
	placementContentSchema,
	validatePlacementForPublish,
} from "@teacher-os/api/placement-test-contracts";
import { describe, expect, it } from "vitest";

const profileHtmlPath = fileURLToPath(
	new URL("../../profile/public/index.html", import.meta.url).href,
);
const html = readFileSync(profileHtmlPath, "utf8");

function extractSelectValues(selectName: string): string[] {
	const re = new RegExp(
		`<select[^>]*\\bname="${selectName}"[^>]*>([\\s\\S]*?)<\\/select>`,
	);
	const match = html.match(re);
	if (!match) {
		throw new Error(
			`Không tìm thấy select[name="${selectName}"] trong profile`,
		);
	}
	return [...(match[1] ?? "").matchAll(/<option\s+value="([^"]*)"/g)]
		.map((m) => m[1] ?? "")
		.filter((v) => v.length > 0);
}

describe("profile lead catalog drift (#506 phase 5)", () => {
	it("select[name=course] trên landing page là tập con hợp lệ của LEAD_COURSES gồm 4 khóa rút gọn (#600)", () => {
		const values = extractSelectValues("course");
		expect(values.length).toBe(4);
		const expectedLandingCourses = [
			"foundation-core",
			"ielts-practical",
			"workplace-interview",
			"undecided",
		];
		expect([...new Set(values)].sort()).toEqual(
			[...expectedLandingCourses].sort(),
		);
		for (const val of values) {
			expect(LEAD_COURSES).toContain(val);
		}
	});

	it("data-select-course trên các thẻ khóa học chỉ trỏ tới mã trong LEAD_COURSES (#600)", () => {
		const buttonCourses = [
			...html.matchAll(/data-select-course="([^"]+)"/g),
		].map((m) => m[1]);
		expect(buttonCourses.length).toBeGreaterThan(0);
		for (const code of buttonCourses) {
			expect(LEAD_COURSES).toContain(code);
		}
	});

	it("placement-seed/questions.json khớp LEAD_COURSES và hợp lệ với validatePlacementForPublish khi gắn audioId (D6, D12)", () => {
		const questionsPath = fileURLToPath(
			new URL("../../web/public/placement-seed/questions.json", import.meta.url)
				.href,
		);
		const raw = JSON.parse(readFileSync(questionsPath, "utf8"));
		const parsed = placementContentSchema.parse(raw);
		expect(parsed.bands.length).toBeGreaterThan(0);
		for (const band of parsed.bands) {
			expect(LEAD_COURSES).toContain(band.course);
		}
		const withFakeAudio = structuredClone(parsed);
		withFakeAudio.parts[1].clips.forEach((clip, idx) => {
			clip.audioId = `00000000-0000-4000-8000-00000000000${idx + 1}`;
		});
		expect(validatePlacementForPublish(withFakeAudio)).toEqual([]);
	});

	it("kiem-tra-dau-vao/lead-gate.js khớp chính xác LEAD_COURSES, LEAD_COURSE_GROUPS và LEAD_STUDY_MODES (#534)", async () => {
		// Dynamic import via file URL: apps/server uses tsconfig composite:true (rootDir=src),
		// so static cross-app import of a plain .js asset in apps/profile/public fails TS6059.
		const leadGateUrl = new URL(
			"../../profile/public/kiem-tra-dau-vao/lead-gate.js",
			import.meta.url,
		);
		const gateMod = (await import(leadGateUrl.href)) as {
			PLACEMENT_COURSE_GROUPS: Array<{
				key: keyof typeof LEAD_COURSE_GROUPS;
				label: string;
				options: Array<{ value: string; label: string }>;
			}>;
			PLACEMENT_STUDY_MODES: Array<{ value: string; label: string }>;
		};

		const allCourseValues = gateMod.PLACEMENT_COURSE_GROUPS.flatMap((g) =>
			g.options.map((o) => o.value),
		);
		expect(allCourseValues).toEqual([...LEAD_COURSES]);

		for (const group of gateMod.PLACEMENT_COURSE_GROUPS) {
			const expectedGroup = LEAD_COURSE_GROUPS[group.key];
			expect(expectedGroup, `group ${String(group.key)}`).toBeDefined();
			expect(group.label).toBe(expectedGroup.label);
			expect(group.options.map((o) => o.value)).toEqual([
				...expectedGroup.codes,
			]);
			for (const opt of group.options) {
				expect(opt.label).toBe(
					LEAD_COURSE_LABELS[opt.value as keyof typeof LEAD_COURSE_LABELS],
				);
			}
		}

		expect(gateMod.PLACEMENT_STUDY_MODES.map((m) => m.value)).toEqual([
			...LEAD_STUDY_MODES,
		]);
		for (const mode of gateMod.PLACEMENT_STUDY_MODES) {
			expect(mode.label).toBe(
				LEAD_STUDY_MODE_LABELS[
					mode.value as keyof typeof LEAD_STUDY_MODE_LABELS
				],
			);
		}
	});
});
