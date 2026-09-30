import type { QuizAttemptSummary } from "@teacher-os/api/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// AttemptScoreCard dùng TanStack Link (CTA sang detail) — stub thành <a>
// thuần để renderToStaticMarkup chạy không cần router context.
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
}));

import { AttemptCompactList } from "@/components/quiz/attempt-compact-list";
import { AttemptScoreCard } from "@/components/quiz/attempt-score-card";
import {
	formatAttemptDuration,
	formatVietnamSubmittedAt,
} from "@/lib/attempt-format";

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
			attemptId={summary.id}
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
