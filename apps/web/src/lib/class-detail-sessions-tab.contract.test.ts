/**
 * Contract tests for the merged class detail "Buổi học" tab (Issue #89) and
 * the ClassScheduleTable extraction (Issue #91).
 * Verifies tab count, component boundaries, line count, and a11y labels.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webSrc = join(here, "..");

describe("class detail merged sessions tab contract (Issue #89)", () => {
	const classDetailSrc = readFileSync(
		join(webSrc, "routes/_auth/classes/$classId.tsx"),
		"utf8",
	);
	const curriculumSectionSrc = readFileSync(
		join(webSrc, "components/class-detail/curriculum-management-section.tsx"),
		"utf8",
	);
	const scheduleTableSrc = readFileSync(
		join(webSrc, "components/class-detail/class-schedule-table.tsx"),
		"utf8",
	);

	test("class detail tab count is reduced from 4 to 3 (roster, sessions, notes)", () => {
		expect(classDetailSrc).toMatch(/\{ id: "roster", label: "Học viên" \}/);
		expect(classDetailSrc).toMatch(/\{ id: "sessions", label: "Buổi học" \}/);
		expect(classDetailSrc).toMatch(/\{ id: "notes", label: "Ghi chú" \}/);
		// Old separate tabs are removed
		expect(classDetailSrc).not.toMatch(
			/\{ id: "syllabus", label: "Giáo trình" \}/,
		);
		expect(classDetailSrc).not.toMatch(
			/\{ id: "schedule", label: "Lịch học" \}/,
		);
	});

	test("sessions tab embeds CurriculumManagementSection and ClassScheduleTable", () => {
		expect(classDetailSrc).toMatch(/tab === "sessions"/);
		expect(classDetailSrc).toMatch(/<CurriculumManagementSection/);
		expect(classDetailSrc).toMatch(/<ClassScheduleTable/);
		// Issue #91: the table itself lives in its own component file.
		expect(classDetailSrc).toMatch(
			/from "@\/components\/class-detail\/class-schedule-table"/,
		);
	});

	test("CurriculumManagementSection renders assignment-only card (#221)", () => {
		// Positive: attach/remove affordances and the confirm flow survive.
		expect(curriculumSectionSrc).toMatch(/ImportSyllabusModal/);
		expect(curriculumSectionSrc).toMatch(/Gỡ giáo trình/);
		expect(curriculumSectionSrc).toMatch(/Nhập từ template/);
		expect(curriculumSectionSrc).toMatch(/disabled=\{busy\}/);
		// Negative (#221): progress and the content tree are gone from the
		// card — they belong to the page header and the manage modal.
		expect(curriculumSectionSrc).not.toMatch(/Mở rộng/);
		expect(curriculumSectionSrc).not.toMatch(/Thu gọn/);
		expect(curriculumSectionSrc).not.toMatch(/collapsible/);
		expect(curriculumSectionSrc).not.toMatch(/syPct/);
		expect(curriculumSectionSrc).not.toMatch(/<Progress/);
	});

	test("ClassScheduleTable renders enhanced 3-column table with module badges and sub-rows", () => {
		expect(scheduleTableSrc).toMatch(/<th[^>]*>\s*Ngày & Giờ\s*<\/th>/);
		expect(scheduleTableSrc).toMatch(/<th[^>]*>\s*Chủ đề\s*<\/th>/);
		expect(scheduleTableSrc).toMatch(/<th[^>]*>\s*Trạng thái\s*<\/th>/);
		expect((scheduleTableSrc.match(/<th[\s>]/g) ?? []).length).toBe(3);
		expect(scheduleTableSrc).toMatch(/sessionLessonInfo\(s, syllabus\)/);
		expect(scheduleTableSrc).toMatch(/info\.moduleTitle/);
		expect(scheduleTableSrc).toMatch(/aria-label="Chi tiết lesson"/);
		expect(scheduleTableSrc).toMatch(/Tài liệu:/);
		expect(scheduleTableSrc).toMatch(/Mục tiêu:/);
	});

	test("ClassScheduleTable preserves legacy 4-column fallback for sessions === null", () => {
		expect(scheduleTableSrc).toMatch(/sessions === null/);
		expect(scheduleTableSrc).toMatch(
			/\["Ngày", "Giờ", "Chủ đề", "Trạng thái"\]/,
		);
	});

	test("ClassScheduleTable drops the Học viên column (issue #93)", () => {
		// Negative assertion is scoped to this component's source only: literal
		// JSX "<th …>Học viên</th>" is unique to the main table; the roster tab
		// label lives in $classId.tsx and stays pinned positive above.
		expect(scheduleTableSrc).not.toMatch(/>\s*Học viên\s*<\/th>/);
	});

	test("expanded lesson row spans exactly 3 columns (issue #93)", () => {
		// Source-text pin stands in for column-layout e2e coverage (none asserts
		// headers/colSpan today).
		expect(scheduleTableSrc).toMatch(/colSpan=\{3\}/);
		expect(scheduleTableSrc).not.toMatch(/colSpan=\{4\}/);
	});

	test("class detail line count is strictly under 500 lines", () => {
		const lineCount = classDetailSrc.split("\n").length;
		expect(lineCount).toBeLessThan(500);
	});
});
