import type { TeacherSubmission } from "@teacher-os/api/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { SubmissionView } from "./submission-view";

// Player dùng URL.createObjectURL (không có ở node) — mock thành thẻ tĩnh.
vi.mock("./submission-media-player", () => ({
	SubmissionMediaPlayer: () => <div data-testid="media-player" />,
}));

function buildSubmission(
	overrides: Partial<TeacherSubmission> & { skill: "writing" | "speaking" },
): TeacherSubmission {
	return {
		attemptId: "att-1",
		classAssignmentId: "ca-1",
		classId: "class-1",
		className: "IELTS Foundation",
		title: "Quiz",
		due: "2026-10-10",
		student: { id: "s-1", name: "Minh Tran" },
		part: "task2",
		prompt: {
			prompt: "",
			imageUrl: "",
			cueTopic: "",
			cuePoints: "",
			note: "",
		},
		startedAt: "2026-10-01T01:00:00.000Z",
		submittedAt: "2026-10-02T01:00:00.000Z",
		essay: null,
		media: null,
		grade: null,
		...overrides,
	};
}

describe("SubmissionView (#319)", () => {
	test("Writing: hiện số từ + mục tiêu tối thiểu và nội dung essay", () => {
		const markup = renderToStaticMarkup(
			<SubmissionView
				submission={buildSubmission({
					skill: "writing",
					part: "task2",
					essay: "one two three\nfour",
				})}
			/>,
		);
		expect(markup).toContain("4 từ · tối thiểu 250");
		expect(markup).toContain("one two three");
		expect(markup).toContain("four");
	});

	test("Essay chứa HTML không được render thẻ (escape qua JSX text node)", () => {
		const markup = renderToStaticMarkup(
			<SubmissionView
				submission={buildSubmission({
					skill: "writing",
					part: "task2",
					essay: "<script>alert(1)</script>",
				})}
			/>,
		);
		expect(markup).toContain("&lt;script&gt;");
		expect(markup).not.toContain("<script>");
	});

	test("Essay trắng: hiện thông báo nộp bài trống", () => {
		const markup = renderToStaticMarkup(
			<SubmissionView
				submission={buildSubmission({
					skill: "writing",
					part: "task1",
					essay: "   ",
				})}
			/>,
		);
		expect(markup).toContain("Học viên đã nộp bài trống.");
	});

	test("Speaking: cue card + media player được mount", () => {
		const markup = renderToStaticMarkup(
			<SubmissionView
				submission={buildSubmission({
					skill: "speaking",
					part: "part2",
					prompt: {
						prompt: "",
						imageUrl: "",
						cueTopic: "a place you like",
						cuePoints: "where\nwhy",
						note: "",
					},
					media: {
						name: "bai-noi.mp3",
						type: "audio/mpeg",
						size: 1024,
						uploadedAt: "2026-10-02T01:00:00.000Z",
					},
				})}
			/>,
		);
		expect(markup).toContain("Describe a place you like");
		expect(markup).toContain("<li>where</li>");
		expect(markup).toContain("<li>why</li>");
		expect(markup).toContain('data-testid="media-player"');
	});

	test("Speaking nộp khi chưa có file: hiện thông báo thay player", () => {
		const markup = renderToStaticMarkup(
			<SubmissionView
				submission={buildSubmission({
					skill: "speaking",
					part: "part2",
					prompt: {
						prompt: "",
						imageUrl: "",
						cueTopic: "a place you like",
						cuePoints: "where",
						note: "",
					},
				})}
			/>,
		);
		expect(markup).toContain("Bài này được nộp khi chưa có file bài nói.");
	});
});
