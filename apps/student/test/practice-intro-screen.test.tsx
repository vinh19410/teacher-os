// @vitest-environment jsdom
import type { StudentQuizDetail } from "@teacher-os/api/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	formatPracticeTimeLimit,
	getPracticeExitTarget,
	PracticeIntroScreen,
} from "@/components/quiz/practice-intro-screen";

afterEach(() => {
	cleanup();
});

function makeDetail(
	overrides: Partial<StudentQuizDetail> = {},
): StudentQuizDetail {
	return {
		assignmentId: "",
		title: "The Falkirk Wheel",
		due: "",
		dueAt: null,
		timeLimitSeconds: 3600,
		partsCount: 3,
		collection: "IELTS Trainer 2",
		testGroup: "TEST 1",
		description: "<p><strong>Lưu ý</strong> đề mẫu</p>",
		skill: "reading",
		part: "p1",
		type: "tfng",
		band: "7.0",
		intro: "",
		prompt: "",
		passage: "<p>Passage content</p>",
		cueTopic: "",
		cuePoints: "",
		audioName: "",
		imageUrl: "",
		optionBank: [],
		questions: [],
		attempt: null,
		...overrides,
	};
}

describe("formatPracticeTimeLimit", () => {
	it("định dạng chính xác các mốc thời lượng", () => {
		expect(formatPracticeTimeLimit(undefined)).toBeNull();
		expect(formatPracticeTimeLimit(null)).toBe("Không giới hạn thời gian");
		expect(formatPracticeTimeLimit(1200)).toBe("20 phút");
		expect(formatPracticeTimeLimit(3600)).toBe("60 phút");
		expect(formatPracticeTimeLimit(90)).toBe("1 phút 30 giây");
		expect(formatPracticeTimeLimit(45)).toBe("45 giây");
		expect(formatPracticeTimeLimit(0)).toBeNull();
		expect(formatPracticeTimeLimit(-60)).toBeNull();
		expect(formatPracticeTimeLimit(Number.NaN)).toBeNull();
	});
});

describe("getPracticeExitTarget", () => {
	it("trả đúng route /practice/$skill cho 4 skill tự luyện và fallback /practice cho skill lạ", () => {
		expect(getPracticeExitTarget("reading")).toEqual({
			to: "/practice/$skill",
			params: { skill: "reading" },
		});
		expect(getPracticeExitTarget("listening")).toEqual({
			to: "/practice/$skill",
			params: { skill: "listening" },
		});
		expect(getPracticeExitTarget("writing")).toEqual({
			to: "/practice/$skill",
			params: { skill: "writing" },
		});
		expect(getPracticeExitTarget("speaking")).toEqual({
			to: "/practice/$skill",
			params: { skill: "speaking" },
		});
		expect(getPracticeExitTarget("grammar")).toEqual({ to: "/practice" });
		expect(getPracticeExitTarget("")).toEqual({ to: "/practice" });
	});
});

describe("PracticeIntroScreen", () => {
	it("hiển thị đầy đủ metadata Reading, mô tả rich-text sạch, hướng dẫn chung và ẩn Band", () => {
		const onStart = vi.fn();
		const onBack = vi.fn();
		const { container } = render(
			<PracticeIntroScreen
				detail={makeDetail()}
				questionCount={13}
				hasHybridWriting={false}
				minWords={null}
				speakingPartLabel={null}
				starting={false}
				onStart={onStart}
				onBack={onBack}
			/>,
		);

		expect(screen.getByTestId("practice-intro-screen")).toBeTruthy();
		expect(screen.getByText("Reading")).toBeTruthy();
		expect(screen.getByText("IELTS Trainer 2 · TEST 1")).toBeTruthy();
		expect(screen.getByText("The Falkirk Wheel")).toBeTruthy();
		expect(screen.getByText("13 câu hỏi", { exact: true })).toBeTruthy();
		expect(screen.getByText("3 phần", { exact: true })).toBeTruthy();
		expect(screen.getByText("60 phút", { exact: true })).toBeTruthy();
		expect(screen.getByText("Hướng dẫn chung")).toBeTruthy();

		// Mô tả rich-text được render sạch, không lộ thẻ HTML thô.
		const desc = screen.getByTestId("practice-intro-description");
		expect(desc.textContent).toContain("Lưu ý đề mẫu");
		expect(desc.textContent).not.toContain("<p>");
		expect(desc.textContent).not.toContain("<strong>");
		expect(desc.querySelector("strong")?.textContent).toBe("Lưu ý");

		// Tuyệt đối không hiển thị Band.
		expect(container.textContent).not.toContain("Band");

		fireEvent.click(screen.getByTestId("practice-start-btn"));
		expect(onStart).toHaveBeenCalledTimes(1);

		fireEvent.click(screen.getByRole("button", { name: "Quay lại danh sách" }));
		expect(onBack).toHaveBeenCalledTimes(1);
	});

	it("ghép collection/testGroup an toàn khi collection là null và ẩn stat tùy chọn khi vắng mặt", () => {
		const { container } = render(
			<PracticeIntroScreen
				detail={makeDetail({
					collection: null,
					testGroup: "TEST 6",
					partsCount: undefined,
					timeLimitSeconds: undefined,
					description: "<p></p>",
				})}
				questionCount={10}
				hasHybridWriting={false}
				minWords={null}
				speakingPartLabel={null}
				starting={false}
				onStart={vi.fn()}
				onBack={vi.fn()}
			/>,
		);

		expect(screen.getByText("TEST 6")).toBeTruthy();
		expect(container.textContent).not.toContain("null");
		expect(screen.queryByTestId("practice-intro-description")).toBeNull();
		expect(screen.queryByText(/phần/)).toBeNull();
		expect(screen.queryByText(/phút|giây|Không giới hạn/)).toBeNull();
	});

	it("strip XSS payload khỏi mô tả và ẩn khung mô tả khi chỉ còn script/rỗng sau sanitize", () => {
		const { rerender } = render(
			<PracticeIntroScreen
				detail={makeDetail({
					description: '<img src=x onerror="alert(1)"><p>An toàn</p>',
				})}
				questionCount={5}
				hasHybridWriting={false}
				minWords={null}
				speakingPartLabel={null}
				starting={false}
				onStart={vi.fn()}
				onBack={vi.fn()}
			/>,
		);

		const desc = screen.getByTestId("practice-intro-description");
		expect(desc.textContent).toContain("An toàn");
		expect(desc.querySelector("img")).toBeNull();
		expect(desc.innerHTML).not.toContain("onerror");

		rerender(
			<PracticeIntroScreen
				detail={makeDetail({
					description: "<script>alert(1)</script>",
				})}
				questionCount={5}
				hasHybridWriting={false}
				minWords={null}
				speakingPartLabel={null}
				starting={false}
				onStart={vi.fn()}
				onBack={vi.fn()}
			/>,
		);
		expect(screen.queryByTestId("practice-intro-description")).toBeNull();
	});

	it("hiển thị đúng metadata Listening (có file nghe), Writing (số từ tối thiểu) và Speaking (file 50 MB)", () => {
		const { rerender, container } = render(
			<PracticeIntroScreen
				detail={makeDetail({
					skill: "listening",
					title: "History of Bikes",
					timeLimitSeconds: 600,
					partsCount: 1,
					hasAudio: true,
					description: null,
				})}
				questionCount={10}
				hasHybridWriting={false}
				minWords={null}
				speakingPartLabel={null}
				starting={false}
				onStart={vi.fn()}
				onBack={vi.fn()}
			/>,
		);
		expect(screen.getByText("Listening")).toBeTruthy();
		expect(screen.getByText("10 câu hỏi", { exact: true })).toBeTruthy();
		expect(screen.getByText("10 phút", { exact: true })).toBeTruthy();
		expect(screen.getByText("Có file nghe", { exact: true })).toBeTruthy();
		expect(container.textContent).toContain("trình phát âm thanh sẽ xuất hiện");

		rerender(
			<PracticeIntroScreen
				detail={makeDetail({
					skill: "writing",
					title: "Writing Task 2",
					timeLimitSeconds: null,
					partsCount: 1,
					description: null,
				})}
				questionCount={0}
				hasHybridWriting={false}
				minWords={250}
				speakingPartLabel={null}
				starting={false}
				onStart={vi.fn()}
				onBack={vi.fn()}
			/>,
		);
		expect(screen.getByText("Writing")).toBeTruthy();
		expect(screen.getByText("Bài viết · tối thiểu 250 từ")).toBeTruthy();
		expect(screen.getByText("Không giới hạn thời gian")).toBeTruthy();
		expect(container.textContent).not.toContain("0 câu hỏi");

		rerender(
			<PracticeIntroScreen
				detail={makeDetail({
					skill: "speaking",
					title: "Speaking Part 2",
					timeLimitSeconds: null,
					partsCount: 1,
					description: null,
				})}
				questionCount={0}
				hasHybridWriting={false}
				minWords={null}
				speakingPartLabel="Part 2"
				starting={false}
				onStart={vi.fn()}
				onBack={vi.fn()}
			/>,
		);
		expect(screen.getByText("Speaking")).toBeTruthy();
		expect(
			screen.getByText(
				"Bài nói · Part 2 · nộp 1 file audio/video (tối đa 50 MB)",
			),
		).toBeTruthy();
		expect(container.textContent).not.toContain("0 câu hỏi");
	});

	it("vô hiệu hóa cả hai nút Start và Back khi starting=true", () => {
		render(
			<PracticeIntroScreen
				detail={makeDetail()}
				questionCount={5}
				hasHybridWriting={false}
				minWords={null}
				speakingPartLabel={null}
				starting
				onStart={vi.fn()}
				onBack={vi.fn()}
			/>,
		);

		const startBtn = screen.getByTestId(
			"practice-start-btn",
		) as HTMLButtonElement;
		const backBtn = screen.getByRole("button", {
			name: "Quay lại danh sách",
		}) as HTMLButtonElement;
		expect(startBtn.disabled).toBe(true);
		expect(startBtn.textContent).toBe("Đang bắt đầu…");
		expect(backBtn.disabled).toBe(true);
	});
});
