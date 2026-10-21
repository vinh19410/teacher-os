// @vitest-environment jsdom
import type {
	StudentClassDetail,
	StudentClassLesson,
} from "@teacher-os/api/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
	Link: (props: {
		to: string;
		params?: Record<string, string>;
		"aria-label"?: string;
		children: React.ReactNode;
	}) => (
		<a
			href={Object.entries(props.params ?? {}).reduce(
				(href, [key, value]) => href.replace(`$${key}`, value),
				props.to,
			)}
			aria-label={props["aria-label"]}
		>
			{props.children}
		</a>
	),
}));

import {
	ClassDetailView,
	ClassNotFound,
} from "@/components/class/class-detail-view";
import {
	ClassLessonList,
	findNextLessonId,
	lessonDayLabel,
} from "@/components/class/class-lesson-list";

const TODAY = "2099-03-10";

function lesson(
	overrides: Partial<StudentClassLesson> & { id: string },
): StudentClassLesson {
	return {
		date: null,
		day: 2,
		time: "18:30",
		dur: 90,
		status: "upcoming",
		topic: "",
		...overrides,
	};
}

const lessons: StudentClassLesson[] = [
	lesson({
		id: "l1",
		date: "2099-03-03",
		status: "completed",
		topic: "Reading Skimming",
	}),
	lesson({ id: "l2", date: "2099-03-05", status: "absent" }),
	lesson({ id: "l3", date: "2099-03-08", status: "upcoming" }),
	lesson({ id: "l4", date: "2099-03-12", status: "upcoming" }),
	lesson({ id: "l5", date: "2099-03-15", status: "cancelled" }),
];

describe("ClassLessonList", () => {
	it("picks the first dated upcoming lesson from today as the next lesson", () => {
		// l3 upcoming nhưng đã qua ngày → không phải buổi tới.
		expect(findNextLessonId(lessons, TODAY)).toBe("l4");
		expect(findNextLessonId(lessons, "2099-04-01")).toBeNull();
	});

	it("does not highlight a next lesson for legacy classes without dates", () => {
		const legacy = [lesson({ id: "a", day: 1 }), lesson({ id: "b", day: 4 })];
		expect(findNextLessonId(legacy, TODAY)).toBeNull();
		const html = renderToStaticMarkup(
			<ClassLessonList lessons={legacy} todayISO={TODAY} />,
		);
		expect(html).not.toContain("Buổi tới");
		expect(html).toContain("Thứ Hai");
		expect(html).toContain("Thứ Năm");
	});

	it("labels weekdays for legacy lessons with Sunday as 7 or 0", () => {
		expect(lessonDayLabel(lesson({ id: "x", day: 7 }))).toBe("Chủ Nhật");
		expect(lessonDayLabel(lesson({ id: "y", day: 0 }))).toBe("Chủ Nhật");
		expect(lessonDayLabel(lesson({ id: "z", day: 6 }))).toBe("Thứ Bảy");
		expect(
			lessonDayLabel(lesson({ id: "d", date: "2099-03-12", day: 4 })),
		).toBe("Thứ Năm, 12/03");
	});

	it("renders Vietnamese status labels, duration, topic and one highlighted next lesson", () => {
		const html = renderToStaticMarkup(
			<ClassLessonList lessons={lessons} todayISO={TODAY} />,
		);
		for (const label of ["Đã học", "Vắng", "Sắp tới", "Đã huỷ"]) {
			expect(html).toContain(label);
		}
		expect(html).toContain("90 phút");
		expect(html).toContain("Reading Skimming");
		expect(html).toContain("Buổi 5");
		expect(html.match(/aria-current="true"/g)).toHaveLength(1);
		expect(html.match(/>Buổi tới</g)).toHaveLength(1);
		// Buổi tới nằm ở dòng thứ 4 (l4).
		const nextRow = html.split("<li").find((row) => row.includes("Buổi tới"));
		expect(nextRow).toContain("Buổi 4");
	});

	it("shows an empty state when the class has no lessons", () => {
		const html = renderToStaticMarkup(
			<ClassLessonList lessons={[]} todayISO={TODAY} />,
		);
		expect(html).toContain("Giáo viên chưa xếp lịch buổi học cho lớp này.");
	});
});

const detail: StudentClassDetail = {
	class: {
		id: "class-9",
		name: "IELTS Detail",
		level: "Band 6.5",
		mode: "Online",
		schedule: "T3 & T6 · 19:00–20:30",
		sessionsDone: 3,
		sessionsTotal: 12,
		status: "active",
		enrollmentId: "enr-9",
		enrollmentStatus: "active",
		nextSession: null,
		teacher: { name: "Cô Lan", email: "lan@example.com", image: null },
		startDate: "2099-03-01",
	},
	lessons,
	assignments: [
		{
			id: "ca-9",
			title: "Reading Practice 1",
			source: "class_assignment",
			classId: "class-9",
			className: "IELTS Detail",
			due: "2099-03-20",
			submittedAt: null,
			scores: null,
		},
	],
};

describe("ClassDetailView", () => {
	afterEach(() => {
		cleanup();
	});

	it("renders the class header, teacher card, rings and lessons by default", () => {
		const html = renderToStaticMarkup(
			<ClassDetailView detail={detail} todayISO={TODAY} />,
		);
		expect(html).toContain("<h1");
		expect(html).toContain("IELTS Detail");
		expect(html).toContain("Band 6.5");
		expect(html).toContain("Khai giảng: Chủ Nhật, 01/03/2099");
		expect(html).toContain("Buổi 3/12");
		expect(html).toContain("Cô Lan");
		expect(html).toContain('href="mailto:lan@example.com"');
		// Tab mặc định = Hành trình học (Buổi học).
		expect(html).toContain("Buổi học");
		// Ring stats.
		expect(html).toContain("Chuyên cần");
		expect(html).toContain("Band trung bình");
		// Tabs: 4 tab design-v2 #378.
		for (const label of [
			"Hành trình học",
			"Bài tập",
			"Giáo trình",
			"Bạn cùng lớp",
		]) {
			expect(html).toContain(label);
		}
		expect(html).toContain('href="/"');
		// Mũi tên "←" giờ là span trang trí (aria-hidden) để accessible name
		// của link đúng "Trang chủ" (e2e bấm link exact name này).
		expect(html).toContain("Trang chủ");
		// Tên lớp chỉ ở header, không lặp lại trên từng bài tập.
		expect(html.match(/IELTS Detail/g)).toHaveLength(1);
		// Bài tập nằm trong tab riêng — KHÔNG còn ở view mặc định.
		expect(html).not.toContain("Reading Practice 1");
	});

	it("shows assignments after switching to the assignments tab", () => {
		const utils = render(<ClassDetailView detail={detail} todayISO={TODAY} />);
		fireEvent.click(screen.getByRole("tab", { name: "Bài tập" }));
		expect(screen.getByText("Reading Practice 1")).toBeTruthy();
		expect(
			screen.getByRole("link", { name: "Làm bài: Reading Practice 1" }),
		).toBeTruthy();
		utils.unmount();
	});

	it("shows a placeholder when the class has no teacher", () => {
		const html = renderToStaticMarkup(
			<ClassDetailView
				detail={{ ...detail, class: { ...detail.class, teacher: null } }}
				todayISO={TODAY}
			/>,
		);
		expect(html).toContain("Chưa có thông tin giáo viên.");
		expect(html).not.toContain("mailto:");
	});
});

describe("ClassNotFound", () => {
	it("explains the class is unavailable and links back home", () => {
		const html = renderToStaticMarkup(<ClassNotFound />);
		expect(html).toContain("Không tìm thấy lớp");
		expect(html).toContain('href="/"');
		expect(html).toContain("Về trang chủ");
	});
});
