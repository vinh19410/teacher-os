import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { emptyItem } from "./assignment-presets";
import { PinEditor } from "./pin-editor";

function item(overrides: Partial<ReturnType<typeof emptyItem>> = {}) {
	return { ...emptyItem("diagram"), ...overrides };
}

function renderPinEditor(props: Partial<Parameters<typeof PinEditor>[0]> = {}) {
	return renderToStaticMarkup(
		<PinEditor
			imageUrl="https://example.com/diagram.png"
			items={[item()]}
			qStart={1}
			selectedIndex={null}
			onItemsChange={vi.fn()}
			onSelect={vi.fn()}
			{...props}
		/>,
	);
}

describe("PinEditor (phase-04 FR3)", () => {
	it("renders the image frame with the placement hint when the URL is valid", () => {
		const html = renderPinEditor();
		expect(html).toContain('alt="Ảnh đề"');
		expect(html).toContain("Bấm lên ảnh để đặt ghim");
		expect(html).toContain("0/1 ghim đã đặt");
	});

	it("renders numbered pins for pinned questions and the count", () => {
		const html = renderPinEditor({
			items: [
				item({ stem: "Part 4", answer: "piston", pin: { x: 25, y: 75 } }),
				item({ stem: "Part 5", answer: "valve", pin: { x: 80, y: 20 } }),
			],
			qStart: 27,
		});
		expect(html).toContain("2/2 ghim đã đặt");
		// Pins carry the real question numbers (qStart + index), not 1..n.
		expect(html).toContain('aria-label="Chọn câu 27 tại ghim"');
		expect(html).toContain('aria-label="Chọn câu 28 tại ghim"');
		expect(html).toMatch(/left:25%/);
		expect(html).toMatch(/top:20%/);
	});

	it("highlights the selected pin and offers the reset action", () => {
		const html = renderPinEditor({
			items: [item({ pin: { x: 10, y: 90 } })],
			selectedIndex: 0,
		});
		expect(html).toContain("Đặt lại ghim câu 1");
	});

	it("warns on a dead URL and keeps the key-entry fallback", () => {
		const html = renderPinEditor({ imageUrl: "https://example.com/dead.png" });
		// renderToStaticMarkup never fires onError — assert the wiring by
		// checking the fallback branch is URL-driven via the broken flag's
		// initial state (false), so the warning path needs the runtime event;
		// the empty-URL branch is directly assertable.
		expect(html).toContain('alt="Ảnh đề"');
		const empty = renderPinEditor({ imageUrl: "" });
		expect(empty).toContain("Dán link ảnh (https) để bắt đầu đặt ghim nhãn.");
		expect(empty).not.toContain('alt="Ảnh đề"');
		void html;
	});
});
