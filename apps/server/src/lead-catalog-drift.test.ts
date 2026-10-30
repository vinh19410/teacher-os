import { readFile } from "node:fs/promises";
import {
	LEAD_COURSES,
	LEAD_STUDY_DAYS,
	LEAD_STUDY_MODES,
	LEAD_TIME_SLOTS,
} from "@teacher-os/api/lead-contracts";
import { beforeAll, describe, expect, test } from "vitest";

/**
 * Drift test (#506 phase 5): apps/profile không import được TS, danh mục
 * khóa/hình thức/ngày/giờ được viết tay trong HTML — test này đọc
 * `apps/profile/public/index.html` và so value với enum contract, chặn lệch
 * danh mục giữa profile và server.
 */

const PROFILE_HTML_PATH = new URL(
	"../../profile/public/index.html",
	import.meta.url,
).pathname;

const htmlPromise = readFile(PROFILE_HTML_PATH, "utf8");

function optionValues(block: string): string[] {
	return [...block.matchAll(/<option value="([^"]*)">/g)]
		.map((m) => m[1] ?? "")
		.filter((value) => value !== "");
}

function radioValues(html: string, name: string): string[] {
	return [
		...html.matchAll(new RegExp(`name="${name}" value="([^"]*)"`, "g")),
	].map((m) => m[1] ?? "");
}

function selectBlock(html: string, name: string): string {
	const match = html.match(
		new RegExp(`<select[^>]*name="${name}"[\\s\\S]*?</select>`),
	);
	if (!match) {
		throw new Error(`select[name=${name}] phải tồn tại trong index.html`);
	}
	return match[0];
}

describe("profile lead catalog drift (#506)", () => {
	let html: string;

	beforeAll(async () => {
		html = await htmlPromise;
	});

	test("select course khớp LEAD_COURSES", () => {
		const values = optionValues(selectBlock(html, "course"));
		expect([...values].sort()).toEqual([...LEAD_COURSES].sort());
	});

	test("select studyMode khớp LEAD_STUDY_MODES", () => {
		const values = optionValues(selectBlock(html, "studyMode"));
		expect([...values].sort()).toEqual([...LEAD_STUDY_MODES].sort());
	});

	test("radio studyDays khớp LEAD_STUDY_DAYS", () => {
		expect([...radioValues(html, "studyDays")].sort()).toEqual(
			[...LEAD_STUDY_DAYS].sort(),
		);
	});

	test("radio timeSlot khớp LEAD_TIME_SLOTS", () => {
		expect([...radioValues(html, "timeSlot")].sort()).toEqual(
			[...LEAD_TIME_SLOTS].sort(),
		);
	});

	test("mọi option khóa nằm trong optgroup hoặc là undecided", () => {
		const block = selectBlock(html, "course");
		// Bỏ optgroup rồi đếm option còn lại: chỉ được là undecided
		// (option rỗng "Chọn khóa" bị filter ở optionValues).
		const outside = optionValues(
			block.replace(/<optgroup[\s\S]*?<\/optgroup>/g, ""),
		);
		expect(outside).toEqual(["undecided"]);
		expect(block.match(/<optgroup/g)?.length).toBe(2);
	});

	test("CTA data-select-course và QUIZ_COURSE_MAP đều là code contract", () => {
		// CTA trên trang điền thẳng course select; quiz map 3 lộ trình cũ sang
		// code contract. Contract rename mà chỉ sửa select/radio thì CTA thành
		// no-op và quiz rơi về undecided — test này chặn cả hai điểm yếu.
		const ctaValues = [...html.matchAll(/data-select-course="([^"]*)"/g)].map(
			(m) => m[1] ?? "",
		);
		expect(ctaValues.length).toBeGreaterThan(0);
		for (const value of ctaValues) {
			expect(LEAD_COURSES).toContain(value);
		}
		const mapBlock = html.match(/const QUIZ_COURSE_MAP = \{[\s\S]*?\};/);
		expect(mapBlock, "QUIZ_COURSE_MAP phải tồn tại trong script").toBeTruthy();
		const mappedCodes = [
			...(mapBlock?.[0] ?? "").matchAll(/'([a-z][a-z0-9-]*)'/g),
		]
			.map((m) => m[1] ?? "")
			.filter(
				(code) =>
					code.startsWith("ielts-") ||
					code.startsWith("comm-") ||
					code === "undecided",
			);
		expect(mappedCodes.length).toBeGreaterThan(0);
		for (const code of mappedCodes) {
			expect(LEAD_COURSES).toContain(code);
		}
	});
});
