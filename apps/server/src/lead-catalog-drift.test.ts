import { readFileSync } from "node:fs";
import {
	LEAD_COURSE_GROUPS,
	LEAD_COURSE_LABELS,
	LEAD_COURSES,
	LEAD_STUDY_DAYS,
	LEAD_STUDY_MODE_LABELS,
	LEAD_STUDY_MODES,
	LEAD_TIME_SLOTS,
} from "@teacher-os/api/lead-contracts";
import {
	placementContentSchema,
	validatePlacementForPublish,
} from "@teacher-os/api/placement-test-contracts";
import { describe, expect, it } from "vitest";

const profileHtmlPath = new URL(
	"../../profile/public/index.html",
	import.meta.url,
);
const html = readFileSync(profileHtmlPath.pathname, "utf8");

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

function extractRadioValues(radioName: string): string[] {
	const re = new RegExp(
		`<input[^>]*\\btype="radio"[^>]*\\bname="${radioName}"[^>]*\\bvalue="([^"]+)"`,
		"g",
	);
	return [...html.matchAll(re)].map((m) => m[1] ?? "");
}

describe("profile lead catalog drift (#506 phase 5)", () => {
	it("select[name=course] khớp chính xác tập LEAD_COURSES và nhóm optgroup", () => {
		const values = extractSelectValues("course");
		expect(values.length).toBeGreaterThan(0);
		expect([...new Set(values)].sort()).toEqual([...LEAD_COURSES].sort());

		const selectBody =
			html.match(
				/<select[^>]*\bname="course"[^>]*>([\s\S]*?)<\/select>/,
			)?.[1] ?? "";
		const ieltsGroup =
			selectBody.match(
				/<optgroup\s+label="IELTS">([\s\S]*?)<\/optgroup>/,
			)?.[1] ?? "";
		const ieltsValues = [
			...ieltsGroup.matchAll(/<option\s+value="([^"]+)"/g),
		].map((m) => m[1]);
		expect(ieltsValues).toEqual([...LEAD_COURSE_GROUPS.ielts.codes]);

		const commGroup =
			selectBody.match(
				/<optgroup\s+label="Giao tiếp định hướng IELTS">([\s\S]*?)<\/optgroup>/,
			)?.[1] ?? "";
		const commValues = [
			...commGroup.matchAll(/<option\s+value="([^"]+)"/g),
		].map((m) => m[1]);
		expect(commValues).toEqual([...LEAD_COURSE_GROUPS.comm.codes]);
	});

	it("select[name=studyMode] khớp chính xác tập LEAD_STUDY_MODES (D12)", () => {
		const values = extractSelectValues("studyMode");
		expect(values.length).toBeGreaterThan(0);
		expect([...new Set(values)].sort()).toEqual([...LEAD_STUDY_MODES].sort());
	});

	it("radio[name=studyDays] khớp chính xác tập LEAD_STUDY_DAYS", () => {
		const values = extractRadioValues("studyDays");
		expect(values.length).toBeGreaterThan(0);
		expect([...new Set(values)].sort()).toEqual([...LEAD_STUDY_DAYS].sort());
	});

	it("radio[name=timeSlot] khớp chính xác tập LEAD_TIME_SLOTS", () => {
		const values = extractRadioValues("timeSlot");
		expect(values.length).toBeGreaterThan(0);
		expect([...new Set(values)].sort()).toEqual([...LEAD_TIME_SLOTS].sort());
	});

	it("data-select-course và COURSE_TRACK_MAP chỉ trỏ tới mã trong LEAD_COURSES", () => {
		const buttonCourses = [
			...html.matchAll(/data-select-course="([^"]+)"/g),
		].map((m) => m[1]);
		expect(buttonCourses.length).toBeGreaterThan(0);
		for (const code of buttonCourses) {
			expect(LEAD_COURSES).toContain(code);
		}

		const mapBlock =
			html.match(/const\s+COURSE_TRACK_MAP\s*=\s*\{([\s\S]*?)\};/)?.[1] ?? "";
		const mappedCodes = [...mapBlock.matchAll(/:\s*'([^']+)'/g)].map(
			(m) => m[1],
		);
		expect(mappedCodes.length).toBeGreaterThan(0);
		for (const code of mappedCodes) {
			expect(LEAD_COURSES).toContain(code);
		}
	});

	it("placement-seed/questions.json khớp LEAD_COURSES và hợp lệ với validatePlacementForPublish khi gắn audioId (D6, D12)", () => {
		const questionsPath = new URL(
			"../../web/public/placement-seed/questions.json",
			import.meta.url,
		);
		const raw = JSON.parse(readFileSync(questionsPath.pathname, "utf8"));
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
