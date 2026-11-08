// @vitest-environment jsdom

import type { StudentClassLesson } from "@teacher-os/api/contracts";
import { vietnamSessionEndMs } from "@teacher-os/api/vietnam-date";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { ClassLessonList } from "./class-lesson-list";

afterEach(cleanup);

const NOW = new Date("2026-11-20T03:00:00Z"); // 10:00 giờ VN, 20/11/2026
const TODAY = "2026-11-20";

function lesson(
	overrides: Partial<StudentClassLesson> & { id: string },
): StudentClassLesson {
	return {
		day: 5,
		time: "19:00",
		dur: 90,
		date: "2026-11-20",
		status: "upcoming",
		topic: "Writing Task 2",
		...overrides,
	};
}

describe("ClassLessonList — TOS-11 holiday", () => {
	test("buổi holiday hiển thị 'Nghỉ lễ — Đã dời lịch', không phải 'Buổi tới'", () => {
		render(
			<ClassLessonList
				classId="c1"
				lessons={[
					lesson({ id: "l-holiday", status: "holiday", date: "2026-11-20" }),
					lesson({ id: "l-makeup", status: "upcoming", date: "2026-12-11" }),
				]}
				todayISO={TODAY}
				now={NOW}
			/>,
		);

		expect(screen.getByText("Nghỉ lễ — Đã dời lịch")).toBeTruthy();
		expect(
			screen.queryByText("Buổi tới")?.closest("li")?.textContent,
		).toContain("11/12");
	});

	test("buổi bù (upcoming) là 'Buổi tới' — holiday không chặn highlight", () => {
		render(
			<ClassLessonList
				classId="c1"
				lessons={[
					lesson({ id: "l-holiday", status: "holiday", date: "2026-11-20" }),
					lesson({ id: "l-makeup", status: "upcoming", date: "2026-12-11" }),
				]}
				todayISO={TODAY}
				now={NOW}
			/>,
		);

		const badges = screen.getAllByText("Buổi tới");
		expect(badges).toHaveLength(1);
		expect(badges[0]?.closest("li")?.textContent).toContain("11/12");
	});

	test("isLessonEnded bỏ qua holiday (chỉ áp cho upcoming)", () => {
		const holidayPast = lesson({
			id: "l-old",
			status: "holiday",
			date: "2026-10-20",
		});
		expect(vietnamSessionEndMs("2026-10-20", "19:00", 90)).not.toBeNull();
		const { container } = render(
			<ClassLessonList
				classId="c1"
				lessons={[holidayPast]}
				todayISO={TODAY}
				now={NOW}
			/>,
		);
		expect(container.textContent).toContain("Nghỉ lễ — Đã dời lịch");
		expect(container.textContent).not.toContain("Đã kết thúc");
	});
});
