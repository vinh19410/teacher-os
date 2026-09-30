import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
	Link: (props: { to: string; children?: React.ReactNode }) => (
		<a href={props.to}>{props.children}</a>
	),
	useNavigate: () => vi.fn(),
}));

import type { AssignmentPrompt } from "@/lib/mock-data";
import { PromptPreviewAside } from "./prompt-preview-aside";

function prompt(overrides: Partial<AssignmentPrompt> = {}): AssignmentPrompt {
	return {
		id: "ap1",
		skill: "reading",
		part: "p3",
		type: "features",
		task: "p3",
		genre: "features",
		title: "QC-271 Features",
		band: "7.0",
		source: "",
		prompt: "",
		intro: "Questions 27–30 · Match each feature with the correct person.",
		passage: "The canal builders changed the landscape forever.",
		note: "",
		status: "ready",
		createdAt: "2026-09-25T00:00:00.000Z",
		...overrides,
	};
}

describe("PromptPreviewAside — option bank (phase-02 FR6/FR7)", () => {
	it("renders the snapshot bank as a labeled list (read path round-trip)", () => {
		const html = renderToStaticMarkup(
			<PromptPreviewAside
				prompt={prompt({
					optionBank: ["Isambard Kingdom Brunel", "Charles Darwin"],
					questions: [
						{ stem: "27 The first boat", opts: null, answer: "A", alts: "" },
					],
				})}
			/>,
		);
		expect(html).toContain("Ngân hàng lựa chọn");
		expect(html).toContain("Isambard Kingdom Brunel");
		expect(html).toContain("Charles Darwin");
		expect(html).not.toContain("Thiếu ngân hàng lựa chọn");
	});

	it("a bankless (legacy) bankable prompt falls back to the intro AND warns", () => {
		const html = renderToStaticMarkup(<PromptPreviewAside prompt={prompt()} />);
		expect(html).toContain("Match each feature");
		expect(html).toContain("Thiếu ngân hàng lựa chọn");
	});

	it("non-bankable types show neither the bank nor the warning", () => {
		const html = renderToStaticMarkup(
			<PromptPreviewAside
				prompt={prompt({
					part: "p1",
					type: "tfng",
					task: "p1",
					genre: "tfng",
					questions: [{ stem: "Q1", opts: null, answer: "TRUE", alts: "" }],
				})}
			/>,
		);
		expect(html).not.toContain("Ngân hàng lựa chọn");
		expect(html).not.toContain("Thiếu ngân hàng lựa chọn");
	});
});

describe("PromptPreviewAside — cloze marker rendering (phase-03 FR5)", () => {
	it("renders a markered completion stem as before-text + input + after-text without leaking the key", () => {
		const html = renderToStaticMarkup(
			<PromptPreviewAside
				prompt={prompt({
					part: "p2",
					type: "summary",
					task: "p2",
					genre: "summary",
					questions: [
						{
							stem: "Tunnels ____ the water through the rock.",
							opts: null,
							answer: "channel",
							alts: "",
						},
					],
				})}
			/>,
		);
		expect(html).toContain("Tunnels");
		expect(html).toContain("the water through the rock.");
		expect(html).toContain("<input");
		expect(html).not.toContain("channel");
	});

	it("renders tablecomp stems as labeled Hàng — Cột rows from the snapshot read path", () => {
		const html = renderToStaticMarkup(
			<PromptPreviewAside
				prompt={prompt({
					part: "p2",
					type: "tablecomp",
					task: "p2",
					genre: "tablecomp",
					questions: [
						{
							stem: "[table] r2 c1: Victorian inventions / Year",
							opts: null,
							answer: "1843",
							alts: "",
						},
					],
				})}
			/>,
		);
		expect(html).toContain("Hàng 2 — Cột 1:");
		expect(html).toContain("Victorian inventions / Year");
		expect(html).toContain("<input");
		expect(html).not.toContain("1843");
	});

	it("renders legacy markerless stems verbatim without a blank input", () => {
		const html = renderToStaticMarkup(
			<PromptPreviewAside
				prompt={prompt({
					part: "p2",
					type: "summary",
					task: "p2",
					genre: "summary",
					questions: [
						{ stem: "An old summary stem?", opts: null, answer: "x", alts: "" },
					],
				})}
			/>,
		);
		expect(html).toContain("An old summary stem?");
		expect(html).not.toContain("<input");
	});
});

describe("PromptPreviewAside — rich text render (rich text plan phase 4)", () => {
	it("legacy plain prompt keeps pre-wrap whitespace", () => {
		const html = renderToStaticMarkup(
			<PromptPreviewAside
				prompt={prompt({
					skill: "writing",
					part: "task2",
					type: "discuss",
					task: "task2",
					genre: "discuss",
					passage: undefined,
					prompt: "Dòng 1\nDòng 2",
				})}
			/>,
		);
		expect(html).toContain("Dòng 1\nDòng 2");
		expect(html).toContain("whitespace-pre-wrap");
	});

	it("tag-only note hides the extra-guidance tag", () => {
		const html = renderToStaticMarkup(
			<PromptPreviewAside prompt={prompt({ note: "<p><br></p>" })} />,
		);
		expect(html).not.toContain("Có hướng dẫn thêm");
	});

	it("empty prompt renders nothing in the prompt block (no fallback text here)", () => {
		const html = renderToStaticMarkup(
			<PromptPreviewAside
				prompt={prompt({
					skill: "writing",
					part: "task2",
					type: "discuss",
					task: "task2",
					genre: "discuss",
					passage: undefined,
					prompt: "<p></p>",
				})}
			/>,
		);
		expect(html).not.toContain("<p></p>");
	});
});

describe("PromptPreviewAside — Xem trước CTA (#282)", () => {
	it("renders the full-page preview button for the selected prompt", () => {
		const html = renderToStaticMarkup(<PromptPreviewAside prompt={prompt()} />);
		expect(html).toContain("Xem trước</button>");
	});
});
