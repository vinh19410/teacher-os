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

	test("CurriculumManagementSection supports collapsible header and defaultCollapsed", () => {
		expect(curriculumSectionSrc).toMatch(/collapsible/);
		expect(curriculumSectionSrc).toMatch(/defaultCollapsed/);
		expect(curriculumSectionSrc).toMatch(/aria-expanded/);
		expect(curriculumSectionSrc).toMatch(/Mở rộng/);
		expect(curriculumSectionSrc).toMatch(/Thu gọn/);
	});

	test("ClassScheduleTable renders enhanced 4-column table with module badges and sub-rows", () => {
		expect(scheduleTableSrc).toMatch(/<th[^>]*>\s*Ngày & Giờ\s*<\/th>/);
		expect(scheduleTableSrc).toMatch(/sessionLessonInfo\(s, syllabus\)/);
		expect(scheduleTableSrc).toMatch(/info\.moduleTitle/);
		expect(scheduleTableSrc).toMatch(/aria-label="Chi tiết lesson"/);
		expect(scheduleTableSrc).toMatch(/Tài liệu:/);
		expect(scheduleTableSrc).toMatch(/Mục tiêu:/);
	});

	test("ClassScheduleTable preserves legacy 5-column fallback for sessions === null", () => {
		expect(scheduleTableSrc).toMatch(/sessions === null/);
		expect(scheduleTableSrc).toMatch(
			/\["Ngày", "Giờ", "Học viên", "Chủ đề", "Trạng thái"\]/,
		);
	});

	test("class detail line count is strictly under 500 lines", () => {
		const lineCount = classDetailSrc.split("\n").length;
		expect(lineCount).toBeLessThan(500);
	});
});
