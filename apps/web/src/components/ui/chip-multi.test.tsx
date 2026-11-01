// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { ChipMulti } from "./chip-multi";

const options = [
	{ value: "Writing", label: "Writing" },
	{ value: "Speaking", label: "Speaking" },
];

afterEach(() => {
	cleanup();
});

describe("ChipMulti view-only", () => {
	it("renders disabled buttons while keeping aria-pressed values", () => {
		const html = renderToStaticMarkup(
			<ChipMulti
				options={options}
				value={["Writing"]}
				onChange={() => undefined}
				disabled
			/>,
		);
		// disabled="" phân biệt được với chuỗi class "disabled:*" không render.
		expect(html).toContain('disabled=""');
		expect(html).toContain('aria-pressed="true"');
		expect(html).toContain('aria-pressed="false"');
	});

	it("stays interactive when disabled is not set", () => {
		const html = renderToStaticMarkup(
			<ChipMulti
				options={options}
				value={["Writing"]}
				onChange={() => undefined}
			/>,
		);
		expect(html).not.toContain('disabled=""');
	});

	it("applies solid primary fill on selected chips and input border on unselected chips without border-transparent", () => {
		render(
			<ChipMulti
				options={options}
				value={["Writing"]}
				onChange={() => undefined}
			/>,
		);
		const writing = screen.getByRole("button", { name: "Writing" });
		const speaking = screen.getByRole("button", { name: "Speaking" });

		expect(writing.getAttribute("aria-pressed")).toBe("true");
		expect(writing.classList.contains("border-primary")).toBe(true);
		expect(writing.classList.contains("bg-primary")).toBe(true);
		expect(writing.classList.contains("text-primary-foreground")).toBe(true);
		expect(writing.classList.contains("border-transparent")).toBe(false);
		expect(writing.classList.contains("bg-secondary")).toBe(false);
		expect(writing.classList.contains("bg-background")).toBe(false);
		expect(writing.classList.contains("dark:bg-input/30")).toBe(false);

		expect(speaking.getAttribute("aria-pressed")).toBe("false");
		expect(speaking.classList.contains("border-input")).toBe(true);
		expect(speaking.classList.contains("bg-background")).toBe(true);
		expect(speaking.classList.contains("text-foreground")).toBe(true);
		expect(speaking.classList.contains("hover:bg-accent")).toBe(true);
		expect(speaking.classList.contains("dark:bg-input/30")).toBe(true);
		expect(speaking.classList.contains("dark:hover:bg-input/50")).toBe(true);
		expect(speaking.classList.contains("border-transparent")).toBe(false);
		expect(speaking.classList.contains("bg-primary")).toBe(false);
	});
});
