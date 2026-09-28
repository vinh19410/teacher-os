import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
	buildTestPayload,
	emptyTestHeader,
	formatTimeLimit,
	parseTimeLimit,
	TestHeaderForm,
} from "./test-header-form";

describe("parseTimeLimit / formatTimeLimit (Task 3.4)", () => {
	it("parse MM:SS và HH:MM:SS", () => {
		expect(parseTimeLimit("60:00")).toBe(3600);
		expect(parseTimeLimit("59:59")).toBe(3599);
		expect(parseTimeLimit("1:00:00")).toBe(3600);
		expect(parseTimeLimit("0:45")).toBe(45);
	});

	it("format 3600s hiển thị 60:00 (không phải 1:00:00)", () => {
		expect(formatTimeLimit(3600)).toBe("60:00");
		expect(formatTimeLimit(3599)).toBe("59:59");
		expect(formatTimeLimit(45)).toBe("0:45");
	});

	it("parse từ chối dạng sai", () => {
		expect(parseTimeLimit("")).toBeNull();
		expect(parseTimeLimit("60")).toBeNull();
		expect(parseTimeLimit("60:60")).toBeNull();
		expect(parseTimeLimit("1:60:00")).toBeNull();
		expect(parseTimeLimit("ab:cd")).toBeNull();
		expect(parseTimeLimit("1:2:3:4")).toBeNull();
	});
});

describe("buildTestPayload — zod rule từ packages/api (Task 3.4 verify)", () => {
	it("submit '60:00' → payload timeLimitSeconds 3600", () => {
		const built = buildTestPayload({
			...emptyTestHeader(),
			title: "IELTS Reading Mock 01",
		});
		expect(built.ok).toBe(true);
		if (built.ok) {
			expect(built.payload.timeLimitSeconds).toBe(3600);
			expect(built.payload.skill).toBe("reading");
			expect(built.payload.title).toBe("IELTS Reading Mock 01");
		}
	});

	it("optional trống rơi khỏi payload; mô tả trim", () => {
		const built = buildTestPayload({
			...emptyTestHeader(),
			title: "  Writing Task Set  ",
			skill: "writing",
			description: "  ",
		});
		expect(built.ok).toBe(true);
		if (built.ok) {
			expect(built.payload.title).toBe("Writing Task Set");
			expect(built.payload.description).toBeUndefined();
			expect(built.payload.collection).toBeUndefined();
			expect(built.payload.testGroup).toBeUndefined();
		}
	});

	it("time limit sai dạng chặn trước zod với message hướng dẫn", () => {
		const built = buildTestPayload({
			...emptyTestHeader(),
			title: "X",
			timeLimit: "một tiếng",
		});
		expect(built.ok).toBe(false);
		if (!built.ok)
			expect(built.errors.timeLimit).toContain("MM:SS hoặc HH:MM:SS");
	});

	it("phase-06: time limit để trống → null không giới hạn (Speaking/Writing)", () => {
		const built = buildTestPayload({
			...emptyTestHeader(),
			title: "Speaking Full Mock",
			skill: "speaking",
			timeLimit: "   ",
		});
		expect(built.ok).toBe(true);
		if (built.ok) expect(built.payload.timeLimitSeconds).toBeNull();
	});

	it("phase-06: time limit sai dạng (khác rỗng) vẫn chặn với message hướng dẫn", () => {
		const built = buildTestPayload({
			...emptyTestHeader(),
			title: "X",
			timeLimit: "60:",
		});
		expect(built.ok).toBe(false);
		if (!built.ok)
			expect(built.errors.timeLimit).toContain("MM:SS hoặc HH:MM:SS");
	});

	it("title trống vi phạm rule zod (không copy rule — import schema)", () => {
		const built = buildTestPayload({
			...emptyTestHeader(),
			title: "   ",
		});
		expect(built.ok).toBe(false);
		if (!built.ok) expect(built.errors.title).toBeDefined();
	});

	it("vượt cap 3:00:00 bị zod chặn", () => {
		const built = buildTestPayload({
			...emptyTestHeader(),
			title: "X",
			timeLimit: "3:00:01",
		});
		expect(built.ok).toBe(false);
		if (!built.ok) expect(built.errors.timeLimitSeconds).toBeDefined();
	});
});

describe("TestHeaderForm render (Task 3.4)", () => {
	const value = {
		...emptyTestHeader(),
		title: "Mock 01",
		collection: "Cambridge IELTS 18",
	};

	it("render đủ trường + datalist collection/group distinct", () => {
		const html = renderToStaticMarkup(
			<TestHeaderForm
				value={value}
				showErrors={false}
				skillLocked={false}
				collections={["Cambridge IELTS 18", "Mock nội bộ"]}
				groups={["TEST 5"]}
				onSkillChange={() => {}}
				onChange={() => {}}
			/>,
		);
		expect(html).toContain("Tiêu đề");
		expect(html).toContain("Mô tả");
		expect(html).toContain("Time limit");
		expect(html).toContain("Preset");
		expect(html).toContain("Academic IELTS Reading");
		expect(html).toContain("Academic IELTS Listening");
		expect(html).toContain("Academic IELTS Writing");
		expect(html).toContain("Academic IELTS Speaking");
		expect(html).toContain("Collection");
		expect(html).toContain("Group");
		expect(html).toContain('<datalist id="');
		expect(html).toContain('value="Cambridge IELTS 18"');
		expect(html).toContain('value="Mock nội bộ"');
		expect(html).toContain('value="TEST 5"');
		// Skill select không khóa ở create mode.
		expect(html).not.toContain("disabled");
	});

	it("skillLocked khóa preset select (edit mode — skill immutable server)", () => {
		const html = renderToStaticMarkup(
			<TestHeaderForm
				value={value}
				showErrors={false}
				skillLocked
				collections={[]}
				groups={[]}
				onSkillChange={() => {}}
				onChange={() => {}}
			/>,
		);
		expect(html).toContain("disabled");
		expect(html).toContain("Kỹ năng cố định theo parts đã gắn.");
	});
});
