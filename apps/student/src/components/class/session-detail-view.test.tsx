// @vitest-environment jsdom

import type { StudentSessionDetailResponse } from "@teacher-os/api/contracts";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	clearActiveStudentOrgId,
	setActiveStudentOrgId,
} from "@/lib/student-org-storage";
import { SessionDetailView, SessionNotFound } from "./session-detail-view";

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		params,
		...props
	}: {
		children: ReactNode;
		to: string;
		params?: Record<string, string>;
	}) => {
		const href = Object.entries(params ?? {}).reduce(
			(acc, [k, v]) => acc.replace(`$${k}`, v),
			to,
		);
		return (
			<a href={href} {...props}>
				{children}
			</a>
		);
	},
}));

vi.mock("@/components/class/student-material-preview", () => ({
	StudentInlineMaterialPreview: ({
		material,
	}: {
		material: { title: string };
	}) => (
		<div data-testid="student-inline-preview" data-title={material.title} />
	),
}));

afterEach(cleanup);

const TODAY = "2026-11-20";
const NOW = new Date("2026-11-20T05:00:00Z");

function makeSessionDetail(
	overrides: Partial<StudentSessionDetailResponse> = {},
): StudentSessionDetailResponse {
	return {
		class: {
			id: "cls-1",
			name: "IELTS Writing K12",
			level: "IELTS 6.5",
			mode: "Online",
			status: "active",
			teacher: { name: "Cô Lan", email: "lan@test.local", image: null },
		},
		session: {
			id: "l-1",
			date: "2026-11-16",
			day: 1,
			time: "19:00",
			dur: 90,
			status: "completed",
			topic: "Mở bài Task 2",
			sessionNumber: 1,
			totalTeachingSessions: 6,
			hasZoom: false,
			recordingUrl: "https://zoom.us/rec/share/demo",
			recordingPassword: null,
			recordingStatus: "ready",
		},
		curriculum: {
			syllabusName: "IELTS Writing Intensive",
			moduleId: "mod-1",
			moduleTitle: "Module 1: Foundation",
			title: "Bài 1: Cấu trúc mở bài",
			objectives: "Viết câu luận điểm mạch lạc trong 5 phút.",
			kind: "lesson",
		},
		lectures: [
			{
				id: "mat-lec-1",
				title: "Bài giảng mở bài (tr. 1–12)",
				description: "Phần đọc bắt buộc",
				kind: "file",
				url: null,
				mimeType: "application/pdf",
				sizeBytes: 120_000,
				originalName: "buoi-1-tr-1-12.pdf",
				position: 0,
				category: "lecture",
				sourceTitle: "Cambridge Writing 18.pdf",
				sourcePageStart: 1,
				sourcePageEnd: 12,
			},
		],
		homeworkMaterials: [
			{
				id: "mat-hw-1",
				title: "Phiếu bài tập về nhà buổi 1",
				description: "Hoàn thành trước thứ 5",
				kind: "file",
				url: null,
				mimeType: "application/pdf",
				sizeBytes: 45_000,
				originalName: "hw-1.pdf",
				position: 1,
				category: "homework",
				sourceTitle: null,
				sourcePageStart: null,
				sourcePageEnd: null,
			},
		],
		assignments: [
			{
				id: "ca-1",
				title: "Writing Task 2 — Education",
				source: "class_assignment",
				classId: "cls-1",
				className: "IELTS Writing K12",
				due: "2026-11-28",
				sessionDate: "2026-11-16",
				submittedAt: null,
				scores: null,
			},
		],
		prevSessionDate: "2026-11-12",
		nextSessionDate: "2026-11-23",
		...overrides,
	};
}

describe("SessionDetailView", () => {
	it("renders session header, curriculum objectives, sliced lecture with page range, homework files, interactive assignments, and prev/next navigation", () => {
		render(
			<SessionDetailView
				detail={makeSessionDetail()}
				todayISO={TODAY}
				now={NOW}
			/>,
		);

		expect(
			screen
				.getByRole("link", { name: "Quay lại IELTS Writing K12" })
				.getAttribute("href"),
		).toBe("/classes/cls-1");
		expect(
			screen.getByRole("heading", { level: 1, name: "Mở bài Task 2" }),
		).toBeTruthy();
		expect(screen.getByText("Buổi 1/6")).toBeTruthy();
		expect(screen.getByText("Module 1: Foundation")).toBeTruthy();
		expect(
			screen.getByText("Viết câu luận điểm mạch lạc trong 5 phút."),
		).toBeTruthy();

		const lecturesSection = screen.getByTestId("session-lectures-section");
		expect(
			within(lecturesSection).getByText("Bài giảng mở bài (tr. 1–12)", {
				selector: "p",
			}),
		).toBeTruthy();
		expect(within(lecturesSection).getByText("Trang 1–12")).toBeTruthy();
		expect(
			within(lecturesSection).getByText("Từ sách: Cambridge Writing 18.pdf"),
		).toBeTruthy();
		expect(
			within(lecturesSection).getByTestId("student-inline-preview"),
		).toBeTruthy();

		const homeworkSection = screen.getByTestId("session-homework-section");
		expect(
			within(homeworkSection).getByText("Phiếu bài tập về nhà buổi 1", {
				selector: "p",
			}),
		).toBeTruthy();
		expect(
			within(homeworkSection).getByText("Writing Task 2 — Education"),
		).toBeTruthy();
		expect(
			within(homeworkSection)
				.getByRole("link", { name: "Làm bài: Writing Task 2 — Education" })
				.getAttribute("href"),
		).toBe("/learn/quizzes/ca-1");

		const nav = screen.getByRole("navigation", { name: "Chuyển buổi học" });
		const navLinks = within(nav).getAllByRole("link");
		expect(navLinks[0]?.getAttribute("href")).toBe(
			"/classes/cls-1/sessions/2026-11-12",
		);
		expect(navLinks[1]?.getAttribute("href")).toBe(
			"/classes/cls-1/sessions/2026-11-23",
		);
	});

	it("renders empty states for lectures and homework and neutral paused banner", () => {
		const paused = makeSessionDetail({
			class: {
				id: "cls-1",
				name: "IELTS Writing K12",
				level: "IELTS 6.5",
				mode: "Online",
				status: "paused",
				teacher: null,
			},
			lectures: [],
			homeworkMaterials: [],
			assignments: [],
			prevSessionDate: null,
			nextSessionDate: null,
		});
		render(<SessionDetailView detail={paused} todayISO={TODAY} now={NOW} />);

		expect(screen.getByTestId("session-paused-banner").textContent).toContain(
			"Lớp đang tạm dừng",
		);
		expect(screen.getByTestId("session-lectures-empty").textContent).toContain(
			"Chưa có bài giảng nào",
		);
		expect(screen.getByTestId("session-homework-empty").textContent).toContain(
			"trước hoặc sau buổi học",
		);
		expect(
			screen.queryByRole("navigation", { name: "Chuyển buổi học" }),
		).toBeNull();
	});

	it("renders SessionNotFound with back link to class", () => {
		render(<SessionNotFound classId="cls-9" />);
		expect(
			screen.getByRole("heading", {
				level: 1,
				name: "Không tìm thấy buổi học",
			}),
		).toBeTruthy();
		expect(
			screen
				.getByRole("link", { name: "Quay lại lớp học" })
				.getAttribute("href"),
		).toBe("/classes/cls-9");
	});

	it("opens in-app RecordingPlayerModal with expiry label for R2 video without download link or password", () => {
		setActiveStudentOrgId("org-demo");
		try {
			const r2Detail = makeSessionDetail({
				session: {
					...makeSessionDetail().session,
					recordingUrl: null,
					recordingPassword: null,
					recordingStatus: "ready",
					recordingSource: "r2",
					hasRecordingVideo: true,
					recordingExpiresAt: "2027-02-14T12:00:00.000Z",
				},
			});
			render(
				<SessionDetailView detail={r2Detail} todayISO={TODAY} now={NOW} />,
			);

			expect(screen.getByText("Lưu đến 14/02/2027")).toBeTruthy();
			const watchBtn = screen.getByRole("button", { name: "Xem recording" });
			expect(screen.queryByRole("link", { name: "Xem recording" })).toBeNull();

			fireEvent.click(watchBtn);
			const dialog = screen.getByRole("dialog");
			const video = dialog.querySelector("video");
			expect(video?.getAttribute("src")).toContain(
				"/api/student/classes/cls-1/sessions/2026-11-16/recording/video",
			);
			expect(video?.getAttribute("src")).toContain("org=org-demo");
			expect(video?.getAttribute("controlslist")).toBe("nodownload");
			expect(dialog.querySelector("a[download]")).toBeNull();
		} finally {
			clearActiveStudentOrgId();
		}
	});

	it("shows expired 90-day badge when R2 recording has expired", () => {
		const expiredDetail = makeSessionDetail({
			session: {
				...makeSessionDetail().session,
				recordingUrl: null,
				recordingPassword: null,
				recordingStatus: "expired",
				recordingSource: undefined,
				hasRecordingVideo: false,
				recordingExpiresAt: "2026-10-01T12:00:00.000Z",
			},
		});
		render(
			<SessionDetailView detail={expiredDetail} todayISO={TODAY} now={NOW} />,
		);

		expect(screen.getByText("Recording đã hết hạn (90 ngày)")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Xem recording" })).toBeNull();
		expect(screen.queryByRole("link", { name: "Xem recording" })).toBeNull();
	});
});
