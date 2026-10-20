import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Tabs } from "./tabs";

describe("Tabs a11y semantics (issue #119)", () => {
	it("marks the active tab with aria-selected and exposes a tablist", () => {
		const html = renderToStaticMarkup(
			<Tabs
				tabs={[
					{ id: "a", label: "A" },
					{ id: "b", label: "B" },
				]}
				active="b"
				onChange={() => {}}
			/>,
		);
		expect(html).toContain('role="tablist"');
		const buttonA = html.match(/<button[^>]*>A<\/button>/)?.[0] ?? "";
		const buttonB = html.match(/<button[^>]*>B<\/button>/)?.[0] ?? "";
		expect(buttonA).toContain('role="tab"');
		expect(buttonA).toContain('aria-selected="false"');
		expect(buttonB).toContain('role="tab"');
		expect(buttonB).toContain('aria-selected="true"');
	});
});

describe("Tabs lớp v2 (segmented)", () => {
	it("track bg-muted p-[3px], item active bg-background shadow-sm", () => {
		const html = renderToStaticMarkup(
			<Tabs
				tabs={[
					{ id: "a", label: "A" },
					{ id: "b", label: "B" },
				]}
				active="b"
				onChange={() => {}}
			/>,
		);
		expect(html).toContain("rounded-lg bg-muted p-[3px]");
		const buttonB = html.match(/<button[^>]*>B<\/button>/)?.[0] ?? "";
		expect(buttonB).toContain("bg-background");
		expect(buttonB).toContain("shadow-sm");
	});
});
