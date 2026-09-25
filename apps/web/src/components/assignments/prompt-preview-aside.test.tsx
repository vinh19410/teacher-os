import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
	Link: (props: { to: string; children?: React.ReactNode }) => (
		<a href={props.to}>{props.children}</a>
	),
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
