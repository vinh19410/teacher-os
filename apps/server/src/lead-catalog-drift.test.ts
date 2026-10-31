import { readFileSync } from "node:fs";
import {
	LEAD_COURSE_GROUPS,
	LEAD_COURSES,
	LEAD_STUDY_DAYS,
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
});
