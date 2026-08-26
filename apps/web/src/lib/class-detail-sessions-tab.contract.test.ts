/**
 * Contract tests for the merged class detail "Buổi học" tab (Issue #89).
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
	});

	test("CurriculumManagementSection supports collapsible header and defaultCollapsed", () => {
		expect(curriculumSectionSrc).toMatch(/collapsible/);
		expect(curriculumSectionSrc).toMatch(/defaultCollapsed/);
		expect(curriculumSectionSrc).toMatch(/aria-expanded/);
		expect(curriculumSectionSrc).toMatch(/Mở rộng/);
		expect(curriculumSectionSrc).toMatch(/Thu gọn/);
	});

	test("ClassScheduleTable renders enhanced 4-column table with module badges and sub-rows", () => {
		expect(classDetailSrc).toMatch(/<th[^>]*>\s*Ngày & Giờ\s*<\/th>/);
		expect(classDetailSrc).toMatch(/sessionLessonInfo\(s, syllabus\)/);
		expect(classDetailSrc).toMatch(/info\.moduleTitle/);
		expect(classDetailSrc).toMatch(/aria-label="Chi tiết lesson"/);
		expect(classDetailSrc).toMatch(/Tài liệu:/);
		expect(classDetailSrc).toMatch(/Mục tiêu:/);
	});

	test("ClassScheduleTable preserves legacy 5-column fallback for sessions === null", () => {
		expect(classDetailSrc).toMatch(/sessions === null/);
		expect(classDetailSrc).toMatch(
			/\["Ngày", "Giờ", "Học viên", "Chủ đề", "Trạng thái"\]/,
		);
	});

	test("class detail line count is strictly under 500 lines", () => {
		const lineCount = classDetailSrc.split("\n").length;
		expect(lineCount).toBeLessThan(500);
	});
});
