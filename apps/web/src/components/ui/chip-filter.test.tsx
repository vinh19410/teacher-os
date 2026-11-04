// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChipFilter } from "./chip-filter";

const options = ["Reading", "Writing"];

afterEach(() => {
	cleanup();
});

describe("ChipFilter accessibility and selection contrast", () => {
	it("renders all options and sets aria-pressed correctly on the active option", () => {
		render(
			<ChipFilter
				options={options}
				value="Writing"
				onChange={() => undefined}
			/>,
		);
		const writing = screen.getByRole("button", { name: "Writing" });
		const reading = screen.getByRole("button", { name: "Reading" });

		expect(writing.getAttribute("aria-pressed")).toBe("true");
		expect(reading.getAttribute("aria-pressed")).toBe("false");
	});

	it("applies solid primary fill on selected chip and input border on unselected chip without border-transparent or bg-secondary", () => {
		render(
			<ChipFilter
				options={options}
				value="Writing"
				onChange={() => undefined}
			/>,
		);
		const writing = screen.getByRole("button", { name: "Writing" });
		const reading = screen.getByRole("button", { name: "Reading" });

		// Selected chip: high-contrast ink fill, primary border, foreground text
		expect(writing.classList.contains("border-primary")).toBe(true);
		expect(writing.classList.contains("bg-primary")).toBe(true);
		expect(writing.classList.contains("text-primary-foreground")).toBe(true);
		expect(writing.classList.contains("border-transparent")).toBe(false);
		expect(writing.classList.contains("bg-secondary")).toBe(false);
		expect(writing.classList.contains("bg-background")).toBe(false);
		expect(writing.classList.contains("dark:bg-input/30")).toBe(false);

		// Unselected chip: input border, background fill, accent hover
		expect(reading.classList.contains("border-input")).toBe(true);
		expect(reading.classList.contains("bg-background")).toBe(true);
		expect(reading.classList.contains("text-foreground")).toBe(true);
		expect(reading.classList.contains("hover:bg-accent")).toBe(true);
		expect(reading.classList.contains("dark:bg-input/30")).toBe(true);
		expect(reading.classList.contains("dark:hover:bg-input/50")).toBe(true);
		expect(reading.classList.contains("border-transparent")).toBe(false);
		expect(reading.classList.contains("bg-primary")).toBe(false);
	});

	it("renders count badge with high contrast on selected chip (text-primary-foreground/80) and text-muted-foreground on unselected chip", () => {
		render(
			<ChipFilter
				options={options}
				value="Writing"
				onChange={() => undefined}
				counts={{ Reading: 5, Writing: 12 }}
			/>,
		);
		const writing = screen.getByRole("button", { name: "Writing" });
		const reading = screen.getByRole("button", { name: "Reading" });

		const writingBadge = writing.querySelector("span[aria-hidden='true']");
		const readingBadge = reading.querySelector("span[aria-hidden='true']");

		expect(writingBadge).not.toBeNull();
		expect(writingBadge?.textContent).toBe("12");
		expect(writingBadge?.classList.contains("text-primary-foreground/80")).toBe(
			true,
		);

		expect(readingBadge).not.toBeNull();
		expect(readingBadge?.textContent).toBe("5");
		expect(readingBadge?.classList.contains("text-muted-foreground")).toBe(
			true,
		);
	});

	it("preserves accessible name as label only even when count is present", () => {
		render(
			<ChipFilter
				options={options}
				value="Writing"
				onChange={() => undefined}
				counts={{ Reading: 5, Writing: 12 }}
			/>,
		);
		// If counts were in accessible name, getByRole("button", { name: "Writing" }) would fail
		expect(screen.getByRole("button", { name: "Writing" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Reading" })).toBeDefined();
	});
});
