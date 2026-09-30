import { ClozeStemText } from "@teacher-os/ui/components/assignments/cloze-stem";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

describe("ClozeStemText — marker rendering (phase-03 FR5)", () => {
	it("splits the stem at the marker into before-text, input and after-text", () => {
		const html = renderToStaticMarkup(
			<ClozeStemText
				stem="Rains refill the ____ each year."
				answer="stepwells"
				number={14}
			/>,
		);
		expect(html).toContain("Rains refill the");
		expect(html).toContain("each year.");
		expect(html).toContain("<input");
		// Width follows the answer length + 4ch (FR5) — never the answer text.
		expect(html).toContain("width:13ch");
		expect(html).not.toContain("stepwells");
	});

	it("renders a markerless (legacy) stem verbatim", () => {
		const html = renderToStaticMarkup(
			<ClozeStemText stem="Plain old question stem?" answer="x" />,
		);
		expect(html).toContain("Plain old question stem?");
		expect(html).not.toContain("<input");
	});

	it("handles a marker at the very start of the stem", () => {
		const html = renderToStaticMarkup(
			<ClozeStemText stem="____ opens the passage." answer="Bees" />,
		);
		expect(html.indexOf("<input")).toBeLessThan(
			html.indexOf("opens the passage."),
		);
		expect(html).not.toContain("Bees");
	});

	it("sizes the input from the trimmed answer with a sane minimum", () => {
		const html = renderToStaticMarkup(
			<ClozeStemText stem="____" answer="  a  " />,
		);
		expect(html).toContain("width:6ch");
	});
});

describe("ClozeStemText — tablecomp labeled rows (phase-03 FR5)", () => {
	it("renders the [table] prefix as a labeled row Hàng h — Cột c", () => {
		const html = renderToStaticMarkup(
			<ClozeStemText
				stem="[table] r1 c2: Steam engine / Invention"
				answer="piston"
				typeId="tablecomp"
				number={14}
			/>,
		);
		expect(html).toContain("Hàng 1 — Cột 2:");
		expect(html).toContain("Steam engine / Invention");
		expect(html).toContain("<input");
		expect(html).not.toContain("piston");
		expect(html).not.toContain("____");
	});

	it("falls back to marker/verbatim rendering for hand-typed tablecomp stems", () => {
		const html = renderToStaticMarkup(
			<ClozeStemText
				stem="A hand-typed stem with ____ marker"
				answer="x"
				typeId="tablecomp"
			/>,
		);
		expect(html).toContain("A hand-typed stem");
		expect(html).toContain("<input");
	});
});

describe("ClozeStemText — interactive mode (RT#8 take-screen respec)", () => {
	it("sizes the editable blank from the learner value, never the key", () => {
		const html = renderToStaticMarkup(
			<ClozeStemText
				stem="Rains refill the ____ each year."
				answer="stepwells"
				value="Bees"
				onChange={() => {}}
			/>,
		);
		// max(6, value.length + 2): a short value floors at the 6ch preview
		// minimum; the 9-char key would have made it 13ch (key-length oracle).
		expect(html).toContain("width:6ch");
		expect(html).not.toContain("width:13ch");
		expect(html).not.toContain("stepwells");
	});

	it("grows with the value and renders an editable controlled input", () => {
		const html = renderToStaticMarkup(
			<ClozeStemText
				stem="____ opens the passage."
				value="Pollination"
				onChange={() => {}}
			/>,
		);
		expect(html).toContain("width:13ch");
		expect(html).toContain('value="Pollination"');
		expect(html).not.toContain("readonly");
	});

	it("works with no answer key at all (take payloads carry none)", () => {
		const html = renderToStaticMarkup(
			<ClozeStemText stem="____" onChange={() => {}} />,
		);
		expect(html).toContain("<input");
		expect(html).toContain("width:6ch");
		expect(html).not.toContain("readonly");
	});

	it("caps the interactive input at the autosave contract limit (500)", () => {
		const html = renderToStaticMarkup(
			<ClozeStemText stem="____" onChange={() => {}} />,
		);
		// code-review F2: paste dài không sinh PATCH 400 lặp mãi.
		expect(html).toContain('maxLength="500"');
	});

	it("preview (readOnly) input carries no maxLength dependence", () => {
		const html = renderToStaticMarkup(
			<ClozeStemText stem="____" answer="stepwells" />,
		);
		expect(html).toContain("readOnly");
	});
});
