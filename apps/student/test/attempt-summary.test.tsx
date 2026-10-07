import type {
	QuizAttemptGrade,
	QuizAttemptSummary,
} from "@teacher-os/api/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Route summary compose TanStack Link (CTA sang detail) vào `action` của
// ScoreCard — stub thành <a> thuần để renderToStaticMarkup chạy không cần
// router context; test compose action đúng như route $attemptId.tsx.
// #304: mock đủ surface route module cần ở import-time để test import thẳng
// AttemptSummaryBody (extract khỏi AttemptSummaryPage — red-team I).
vi.mock("@tanstack/react-router", () => ({
	Link: (props: {
		to: string;
		params?: Record<string, string>;
		className?: string;
		children: React.ReactNode;
	}) => (
		<a
			href={props.to.replaceAll("$attemptId", props.params?.attemptId ?? "")}
			className={props.className}
		>
			{props.children}
		</a>
	),
	createFileRoute: () => () => ({}),
	Outlet: () => null,
	redirect: () => undefined,
	useChildMatches: () => [],
}));

import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@teacher-os/ui/components/button";
import { AttemptCompactList } from "@teacher-os/ui/components/quiz/attempt-compact-list";
import { AttemptScoreCard } from "@teacher-os/ui/components/quiz/attempt-score-card";
import { AttemptGradeCard } from "@/components/quiz/attempt-grade-card";
import {
	formatAttemptDuration,
	formatVietnamSubmittedAt,
} from "@/lib/attempt-format";
import { cn } from "@/lib/cn";
import {
	AttemptSummaryBody,
	isSplitWritingResult,
} from "@/routes/_auth/learn/quizzes/attempt/$attemptId";

const summary: QuizAttemptSummary = {
	id: "att-1",
	assignmentId: "asg-1",
	title: "Reading - Test 5 - Trainer 2",
	status: "submitted",
	correctCount: 1,
	wrongCount: 1,
	skippedCount: 2,
	totalCount: 4,
	startedAt: "2026-09-30T10:00:00.000Z",
	submittedAt: "2026-09-30T10:22:32.000Z",
	items: [
		{ verdict: "correct", key: "Paris", answer: "Paris" },
		{ verdict: "wrong", key: "glue", answer: "tape" },
		{ verdict: "skipped", key: "B", answer: null },
		{ verdict: "correct", key: "TRUE", answer: "True" },
	],
};

describe("formatAttemptDuration — submittedAt − startedAt", () => {
	it("duration đầy đủ → 'X phút Y giây' (không đếm giờ riêng)", () => {
		expect(
			formatAttemptDuration(
				"2026-09-30T10:00:00.000Z",
				"2026-09-30T10:22:32.000Z",
			),
		).toBe("22 phút 32 giây");
	});

	it("dưới 1 phút → chỉ giây; tròn phút → chỉ phút", () => {
		expect(
			formatAttemptDuration(
				"2026-09-30T10:00:00.000Z",
				"2026-09-30T10:00:45.000Z",
			),
		).toBe("45 giây");
		expect(
			formatAttemptDuration(
				"2026-09-30T10:00:00.000Z",
				"2026-09-30T10:03:00.000Z",
			),
		).toBe("3 phút");
	});

	it("ISO hỏng hoặc submitted trước started → rỗng (không âm)", () => {
		expect(
			formatAttemptDuration("không-phải-iso", "2026-09-30T10:00:00.000Z"),
		).toBe("");
		expect(
			formatAttemptDuration(
				"2026-09-30T10:00:00.000Z",
				"2026-09-30T09:59:00.000Z",
			),
		).toBe("");
	});
});

describe("formatVietnamSubmittedAt — giờ Việt Nam cố định", () => {
	it("ISO UTC → dd/MM/yyyy HH:mm theo Asia/Ho_Chi_Minh (+07)", () => {
		expect(formatVietnamSubmittedAt("2026-09-30T11:05:00.000Z")).toBe(
			"30/09/2026 18:05",
		);
	});

	it("ISO hỏng → rỗng", () => {
		expect(formatVietnamSubmittedAt("abc")).toBe("");
	});
});

describe("AttemptScoreCard — điểm RAW + counters + CTA", () => {
	const html = renderToStaticMarkup(
		<AttemptScoreCard
			correctCount={summary.correctCount}
			wrongCount={summary.wrongCount}
			skippedCount={summary.skippedCount}
			totalCount={summary.totalCount}
			action={
				// Compose y hệt route summary: variant default + mt-5 — pin để
				// regression đổi variant/mất spacing bị test bắt (red-team #8).
				<Link
					to="/learn/quizzes/attempt/$attemptId/detail"
					params={{ attemptId: summary.id }}
					className={cn(buttonVariants(), "mt-5")}
				>
					Xem giải thích chi tiết
				</Link>
			}
		/>,
	);

	it("Điểm = correctCount lớn (raw count, không percent)", () => {
		expect(html).toContain('data-testid="attempt-correct-count"');
		expect(html).toMatch(/data-testid="attempt-correct-count"[^>]*>1</);
		expect(html).not.toContain("%");
	});

	it("counters Câu đúng / Câu sai / Câu bỏ qua khớp payload", () => {
		expect(html).toContain("Câu đúng");
		expect(html).toContain("Câu sai");
		expect(html).toContain("Câu bỏ qua");
		expect(html).toMatch(/data-testid="attempt-correct"[^>]*>1</);
		expect(html).toMatch(/data-testid="attempt-wrong"[^>]*>1</);
		expect(html).toMatch(/data-testid="attempt-skipped"[^>]*>2</);
	});

	it("CTA 'Xem giải thích chi tiết' trỏ thẳng route detail của attempt", () => {
		expect(html).toContain("Xem giải thích chi tiết");
		expect(html).toContain('href="/learn/quizzes/attempt/att-1/detail"');
		// Variant default (không phải secondary) + spacing mt-5 giữ nguyên.
		const cta = html.match(
			/<a[^>]*href="\/learn\/quizzes\/attempt\/att-1\/detail"[^>]*>/,
		);
		expect(cta?.[0]).toContain("mt-5");
		expect(cta?.[0]).not.toContain("secondary");
	});
});

describe("AttemptCompactList — n → đáp án học viên → Đáp án đúng", () => {
	const html = renderToStaticMarkup(
		<AttemptCompactList items={summary.items} />,
	);

	it("mỗi câu một dòng, đánh số từ 1, đúng thứ tự payload", () => {
		expect(html).toContain('data-testid="attempt-compact-list"');
		expect(html).toContain(">1<");
		expect(html).toContain("Đáp án: Paris");
		expect(html).toContain("Đáp án: glue");
		expect(html).toContain("Đáp án: B");
		expect(html).toContain("Đáp án: TRUE");
		// Đáp án học viên render nguyên giá trị nhập.
		expect(html).toContain(">tape</span>");
		expect(html).toContain(">True</span>");
	});

	it("câu bỏ qua → '—' thay cho đáp án học viên", () => {
		const rows = html.split("<li").length - 1;
		expect(rows).toBe(4);
		expect(html).toMatch(/data-verdict="skipped"[\s\S]*?>—</);
	});

	it("verdict gắn trên dòng để tô màu (success/danger/muted)", () => {
		expect((html.match(/data-verdict="correct"/g) ?? []).length).toBe(2);
		expect(html).toContain('data-verdict="wrong"');
		expect(html).toContain('data-verdict="skipped"');
	});
});

describe("AttemptSummaryBody — nhánh Writing (#304)", () => {
	const writingSummary: QuizAttemptSummary = {
		...summary,
		correctCount: 0,
		wrongCount: 0,
		skippedCount: 0,
		totalCount: 0,
		items: [],
		essay: "The graph shows a clear upward trend.",
	};

	it("Writing: hiện bài đã nộp + số từ, KHÔNG score card / bảng đáp án / CTA chi tiết", () => {
		const html = renderToStaticMarkup(
			<AttemptSummaryBody
				summary={writingSummary}
				attemptId={writingSummary.id}
			/>,
		);
		expect(html).toContain("Bài viết của bạn");
		expect(html).toContain("The graph shows a clear upward trend.");
		expect(html).toContain("7 từ");
		expect(html).toContain("Giáo viên sẽ chấm bài viết của bạn.");
		expect(html).not.toContain("Xem giải thích chi tiết");
		expect(html).not.toContain("Bảng đáp án");
		expect(html).not.toContain("attempt-correct-count");
	});

	it("Writing nộp trống: dòng 'Bạn đã nộp bài trống.' + 0 từ", () => {
		const html = renderToStaticMarkup(
			<AttemptSummaryBody
				summary={{ ...writingSummary, essay: "" }}
				attemptId={writingSummary.id}
			/>,
		);
		expect(html).toContain("Bạn đã nộp bài trống.");
		expect(html).toContain("0 từ");
	});

	it("Summary Reading (essay null hoặc payload cũ không có field) vẫn hiện score card", () => {
		for (const essay of [null, undefined]) {
			const html = renderToStaticMarkup(
				<AttemptSummaryBody
					summary={{ ...summary, essay }}
					attemptId={summary.id}
				/>,
			);
			expect(html).toContain("attempt-correct-count");
			expect(html).toContain("Xem giải thích chi tiết");
			expect(html).toContain("Bảng đáp án");
			expect(html).not.toContain("Bài viết của bạn");
		}
	});
});

describe("AttemptSummaryBody — Speaking hiện bài nói thay score card (#305)", () => {
	const speaking: QuizAttemptSummary = {
		...summary,
		correctCount: 0,
		wrongCount: 0,
		skippedCount: 0,
		totalCount: 0,
		items: [],
		essay: null,
		skill: "speaking",
		media: {
			name: "answer-v2.mp3",
			type: "audio/mpeg",
			size: 820 * 1024,
			uploadedAt: "2026-09-30T10:20:00.000Z",
		},
	};

	it("có file: tên file, dung lượng, nút nghe lại, không có score card", () => {
		const html = renderToStaticMarkup(
			<AttemptSummaryBody summary={speaking} attemptId="att-1" />,
		);
		expect(html).toContain("Bài nói của bạn");
		expect(html).toContain("answer-v2.mp3");
		expect(html).toContain("820 KB");
		expect(html).toContain("Nghe lại bài nói");
		expect(html).toContain("Giáo viên sẽ chấm bài nói của bạn.");
		expect(html).not.toContain("Xem giải thích chi tiết");
		expect(html).not.toContain("Bảng đáp án");
	});

	it("bài Speaking cũ nộp khi chưa có file", () => {
		const html = renderToStaticMarkup(
			<AttemptSummaryBody
				summary={{ ...speaking, media: null }}
				attemptId="att-1"
			/>,
		);
		expect(html).toContain("Bài này được nộp khi chưa có file bài nói.");
		expect(html).not.toContain("Nghe lại bài nói");
	});

	it("Reading có skill/media vẫn hiện score card", () => {
		const html = renderToStaticMarkup(
			<AttemptSummaryBody
				summary={{ ...summary, skill: "reading", media: null }}
				attemptId="att-1"
			/>,
		);
		expect(html).toContain("Xem giải thích chi tiết");
		expect(html).not.toContain("Bài nói của bạn");
	});

	it("server cũ không gửi skill/media: vẫn hiện score card, không throw", () => {
		const html = renderToStaticMarkup(
			<AttemptSummaryBody summary={summary} attemptId="att-1" />,
		);
		expect(html).toContain("Xem giải thích chi tiết");
	});
});

describe("AttemptSummaryBody — Kết quả chấm của giáo viên (#319)", () => {
	const writingGrade: QuizAttemptGrade = {
		scores: { task: 6, coherence: 6.5, lexical: 6, grammar: 6.5 },
		band: 6.5,
		feedback: "Tốt.\nCần ví dụ.",
		gradedAt: "2026-10-05T03:00:00.000Z",
	};
	const writingGraded: QuizAttemptSummary = {
		...summary,
		correctCount: 0,
		wrongCount: 0,
		skippedCount: 0,
		totalCount: 0,
		items: [],
		essay: "The graph shows a clear upward trend.",
		grade: writingGrade,
		part: "task1",
	};

	it("Writing đã chấm: band + tiêu chí TA + nhận xét, thay dòng chờ chấm", () => {
		const html = renderToStaticMarkup(
			<AttemptSummaryBody
				summary={writingGraded}
				attemptId={writingGraded.id}
			/>,
		);
		expect(html).toContain("Kết quả chấm của giáo viên");
		expect(html).toContain("6.5");
		expect(html).toContain("Task Achievement");
		expect(html).toContain("Coherence &amp; Cohesion");
		expect(html).toContain("Tốt.");
		expect(html).toContain("Cần ví dụ.");
		expect(html).not.toContain("Giáo viên sẽ chấm bài viết của bạn.");
	});

	it("Writing chưa chấm (không có key grade): giữ dòng chờ chấm", () => {
		const ungraded = { ...writingGraded } as QuizAttemptSummary;
		delete ungraded.grade;
		delete ungraded.part;
		const html = renderToStaticMarkup(
			<AttemptSummaryBody summary={ungraded} attemptId={ungraded.id} />,
		);
		expect(html).toContain("Giáo viên sẽ chấm bài viết của bạn.");
		expect(html).not.toContain("Kết quả chấm của giáo viên");
	});

	it("Speaking đã chấm: band 7.0 + Pronunciation; nhận xét rỗng thì ẩn", () => {
		const speakingGraded: QuizAttemptSummary = {
			...summary,
			correctCount: 0,
			wrongCount: 0,
			skippedCount: 0,
			totalCount: 0,
			items: [],
			essay: null,
			skill: "speaking",
			media: {
				name: "answer-v2.mp3",
				type: "audio/mpeg",
				size: 820 * 1024,
				uploadedAt: "2026-09-30T10:20:00.000Z",
			},
			grade: {
				scores: { fluency: 7, lexical: 7, grammar: 7, pronunciation: 7 },
				band: 7,
				feedback: "",
				gradedAt: "2026-10-05T03:00:00.000Z",
			},
			part: "part2",
		};
		const html = renderToStaticMarkup(
			<AttemptSummaryBody
				summary={speakingGraded}
				attemptId={speakingGraded.id}
			/>,
		);
		expect(html).toContain("7.0");
		expect(html).toContain("Pronunciation");
		expect(html).not.toContain('data-testid="grade-feedback"');
		expect(html).not.toContain("Giáo viên sẽ chấm bài nói của bạn.");
	});

	it("Nhận xét chứa HTML render dạng text (escape qua JSX text node)", () => {
		const html = renderToStaticMarkup(
			<AttemptSummaryBody
				summary={{
					...writingGraded,
					grade: {
						...writingGrade,
						feedback: "<b>x</b>",
					},
				}}
				attemptId={writingGraded.id}
			/>,
		);
		expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
	});
});

describe("AttemptSummaryBody — Highlight + ghi chú giáo viên (#332)", () => {
	const essay = "The graph shows a clear upward trend.";
	const start = essay.indexOf("clear");
	const annotated: QuizAttemptSummary = {
		...summary,
		correctCount: 0,
		wrongCount: 0,
		skippedCount: 0,
		totalCount: 0,
		items: [],
		essay,
		grade: {
			scores: { task: 6, coherence: 6, lexical: 6, grammar: 6 },
			band: 6,
			feedback: "",
			gradedAt: "2026-10-07T03:00:00.000Z",
		},
		part: "task1",
		annotations: [
			{
				id: "ann-2",
				start: essay.indexOf("upward"),
				end: essay.indexOf("upward") + 6,
				note: "Dùng rising.",
			},
			{ id: "ann-1", start, end: start + 5, note: "Đúng từ." },
		],
	};

	it("Đã chấm + 2 annotation: 2 mark đánh số + ghi chú inline ngay sau mark, không còn danh sách (#336)", () => {
		const html = renderToStaticMarkup(
			<AttemptSummaryBody summary={annotated} attemptId={annotated.id} />,
		);
		expect((html.match(/<mark /g) ?? []).length).toBe(2);
		expect(html).toContain('data-n="1"');
		expect(html).toContain('data-n="2"');
		// Số khớp thứ tự xuất hiện: "clear" n=1, "upward" n=2.
		expect(html.indexOf('data-n="1"')).toBeLessThan(html.indexOf('data-n="2"'));
		// Ghi chú inline (#336): 2 span note ngay sau mark tương ứng.
		expect((html.match(/essay-inline-note/g) ?? []).length).toBe(2);
		const clearMark = html.indexOf(">clear</mark>");
		expect(html.indexOf("Đúng từ.")).toBeGreaterThan(clearMark);
		expect(html.indexOf("Đúng từ.")).toBeLessThan(html.indexOf("upward"));
		expect(html).toContain("Dùng rising.");
		// Danh sách riêng đã bỏ khỏi màn học viên.
		expect(html).not.toContain("essay-annotation-list");
		// Đoạn essay phân mảnh đúng — nối lại đủ essay gốc.
		expect(html).toContain("The graph shows a ");
		expect(html).toContain(">clear</mark>");
		expect(html).toContain(" trend.");
	});

	it("Đã chấm: chia 2 khung — grade card nằm sau essay-frame (#336)", () => {
		const html = renderToStaticMarkup(
			<AttemptSummaryBody summary={annotated} attemptId={annotated.id} />,
		);
		expect(html).toContain('data-testid="writing-result-split"');
		expect(html.indexOf("essay-frame")).toBeGreaterThan(-1);
		expect(html.indexOf("essay-frame")).toBeLessThan(
			html.indexOf('data-testid="attempt-grade"'),
		);
		// Card nhận sticky + chống tràn cột; max-h/overflow nằm trong scrollable.
		expect(html).toContain("app:sticky");
		expect(html).toContain("min-w-0");
		// Heading + "Chấm lúc" nằm NGOÀI card (attempt-grade-body) — biên trên
		// card thẳng hàng card bài viết, đối xứng cột trái (heading → meta → card).
		expect(html).toContain('data-testid="attempt-grade-body"');
		expect(html.indexOf("Kết quả chấm của giáo viên")).toBeLessThan(
			html.indexOf('data-testid="attempt-grade-body"'),
		);
		expect(html.indexOf("Chấm lúc")).toBeLessThan(
			html.indexOf('data-testid="attempt-grade-body"'),
		);
	});

	it("Đã chấm nhưng không có key annotations: không mark, không ghi chú, vẫn chia khung + grade card", () => {
		const noAnnotations = { ...annotated } as QuizAttemptSummary;
		delete noAnnotations.annotations;
		const html = renderToStaticMarkup(
			<AttemptSummaryBody
				summary={noAnnotations}
				attemptId={noAnnotations.id}
			/>,
		);
		expect(html).not.toContain("<mark");
		expect(html).not.toContain("essay-inline-note");
		expect(html).toContain('data-testid="writing-result-split"');
		expect(html).toContain("Kết quả chấm của giáo viên");
	});

	it("Chưa chấm: không mark, không ghi chú inline, không chia khung", () => {
		const ungraded = { ...annotated } as QuizAttemptSummary;
		delete ungraded.grade;
		delete ungraded.part;
		delete ungraded.annotations;
		const html = renderToStaticMarkup(
			<AttemptSummaryBody summary={ungraded} attemptId={ungraded.id} />,
		);
		expect(html).not.toContain("<mark");
		expect(html).not.toContain("essay-inline-note");
		expect(html).not.toContain("writing-result-split");
		expect(html).toContain("Giáo viên sẽ chấm bài viết của bạn.");
	});

	it("Ghi chú rỗng không sinh span inline (#336)", () => {
		const emptyNote = {
			...annotated,
			annotations: [{ id: "ann-1", start, end: start + 5, note: "" }],
		};
		const html = renderToStaticMarkup(
			<AttemptSummaryBody summary={emptyNote} attemptId={emptyNote.id} />,
		);
		expect((html.match(/<mark /g) ?? []).length).toBe(1);
		expect(html).not.toContain("essay-inline-note");
	});

	it("Ghi chú chứa HTML render dạng text (escape qua JSX)", () => {
		const html = renderToStaticMarkup(
			<AttemptSummaryBody
				summary={{
					...annotated,
					annotations: [
						{ id: "ann-1", start, end: start + 5, note: "<b>x</b>" },
					],
				}}
				attemptId={annotated.id}
			/>,
		);
		expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
	});
});

describe("isSplitWritingResult (#336)", () => {
	const graded: QuizAttemptSummary = {
		...summary,
		correctCount: 0,
		wrongCount: 0,
		skippedCount: 0,
		totalCount: 0,
		items: [],
		essay: "The graph shows a clear upward trend.",
		skill: "writing",
		part: "task1",
		grade: {
			scores: { task: 6, coherence: 6, lexical: 6, grammar: 6 },
			band: 6,
			feedback: "",
			gradedAt: "2026-10-07T03:00:00.000Z",
		},
	};

	it("Writing đã chấm → true (kể cả essay rỗng '')", () => {
		expect(isSplitWritingResult(graded)).toBe(true);
		expect(isSplitWritingResult({ ...graded, essay: "" })).toBe(true);
	});

	it("Writing chưa chấm → false", () => {
		const ungraded = { ...graded } as QuizAttemptSummary;
		delete ungraded.grade;
		expect(isSplitWritingResult(ungraded)).toBe(false);
	});

	it("Speaking đã chấm → false", () => {
		const speaking: QuizAttemptSummary = {
			...summary,
			correctCount: 0,
			wrongCount: 0,
			skippedCount: 0,
			totalCount: 0,
			items: [],
			essay: null,
			skill: "speaking",
			part: "part2",
			grade: {
				scores: { fluency: 7, lexical: 7, grammar: 7, pronunciation: 7 },
				band: 7,
				feedback: "",
				gradedAt: "2026-10-07T03:00:00.000Z",
			},
		};
		expect(isSplitWritingResult(speaking)).toBe(false);
	});

	it("Reading (essay null/undefined) → false", () => {
		expect(isSplitWritingResult({ ...graded, essay: null })).toBe(false);
		const noEssay = { ...graded } as QuizAttemptSummary;
		delete noEssay.essay;
		expect(isSplitWritingResult(noEssay)).toBe(false);
	});
});

describe("AttemptGradeCard — scrollable + className (#336)", () => {
	const grade: QuizAttemptGrade = {
		scores: { task: 6, coherence: 6.5, lexical: 6, grammar: 6.5 },
		band: 6.5,
		feedback: "Tốt.\nCần ví dụ.",
		gradedAt: "2026-10-07T03:00:00.000Z",
	};

	it("scrollable: section có max-h + overflow-y-auto + overscroll-contain + focus ring + tabIndex, feedback break-words", () => {
		const html = renderToStaticMarkup(
			<AttemptGradeCard
				grade={grade}
				skill="writing"
				part="task1"
				scrollable
			/>,
		);
		expect(html).toContain("overflow-y-auto");
		expect(html).toContain("max-h-");
		expect(html).toContain("overscroll-contain");
		expect(html).toContain("focus-visible:outline-none");
		expect(html).toContain('tabindex="0"');
		expect(html).toContain("break-words");
		// Heading ngoài card: "Kết quả chấm của giáo viên" và "Chấm lúc" nằm
		// trước attempt-grade-body (tabindex gắn trên body, không trên section).
		expect(html.indexOf("Kết quả chấm của giáo viên")).toBeLessThan(
			html.indexOf('data-testid="attempt-grade-body"'),
		);
		expect(html.indexOf("Chấm lúc")).toBeLessThan(
			html.indexOf('data-testid="attempt-grade-body"'),
		);
	});

	it("không scrollable (nhánh Speaking): không tabindex, không overflow, giữ class gốc", () => {
		const html = renderToStaticMarkup(
			<AttemptGradeCard grade={grade} skill="speaking" part="part2" />,
		);
		expect(html).not.toContain("tabindex");
		expect(html).not.toContain("overflow-y-auto");
		expect(html).not.toContain("attempt-grade-body");
		expect(html).toContain("mt-6");
		// "Chấm lúc" giữ vị trí cũ: cuối card, text-xs.
		expect(html.indexOf("Chấm lúc")).toBeGreaterThan(
			html.indexOf('data-testid="grade-feedback"'),
		);
	});

	it("dưới 921px (matchMedia matches=false): không tabindex — không dead tab stop", () => {
		// File chạy node env (không có window) — dựng window tạm cho hook đọc
		// matchMedia, xoá ngay sau test.
		const g = globalThis as unknown as { window?: unknown };
		g.window = {
			matchMedia: vi.fn(() => ({
				matches: false,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
			})),
		};
		try {
			const html = renderToStaticMarkup(
				<AttemptGradeCard
					grade={grade}
					skill="writing"
					part="task1"
					scrollable
				/>,
			);
			expect(html).not.toContain('tabindex="0"');
		} finally {
			delete g.window;
		}
	});

	it("className gộp thêm không mất class gốc (sticky + min-w-0)", () => {
		const html = renderToStaticMarkup(
			<AttemptGradeCard
				grade={grade}
				skill="writing"
				part="task1"
				className="app:sticky app:top-20 min-w-0"
			/>,
		);
		expect(html).toContain("mt-6");
		expect(html).toContain("app:sticky");
		expect(html).toContain("min-w-0");
	});
});
