// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Input as BaseInput } from "../input";
import { Input } from "./field";

afterEach(() => {
	cleanup();
});

function classTokens(element: HTMLElement): string[] {
	return element.className.split(/\s+/).filter(Boolean);
}

describe("web-kit Input native date layout", () => {
	it("replaces flex with block and applies webkit date alignment classes for type='date'", () => {
		const ref = createRef<HTMLInputElement>();
		render(
			<Input
				ref={ref}
				type="date"
				data-testid="date-input"
				className="h-8 w-44"
			/>,
		);

		const input = screen.getByTestId("date-input") as HTMLInputElement;
		const tokens = classTokens(input);

		expect(input.type).toBe("date");
		expect(ref.current).toBe(input);
		expect(tokens).toContain("block");
		expect(tokens).not.toContain("flex");
		expect(tokens).toContain("[&::-webkit-date-and-time-value]:text-left");
		expect(tokens).toContain(
			"[&::-webkit-calendar-picker-indicator]:cursor-pointer",
		);
		expect(tokens).toContain("h-8");
		expect(tokens).not.toContain("h-9");
		expect(tokens).toContain("w-44");
		expect(tokens).not.toContain("w-full");
	});

	it("lets caller className override display on type='date'", () => {
		render(
			<Input
				type="date"
				data-testid="date-override"
				className="inline-block"
			/>,
		);

		const tokens = classTokens(screen.getByTestId("date-override"));
		expect(tokens).toContain("inline-block");
		expect(tokens).not.toContain("block");
		expect(tokens).not.toContain("flex");
	});

	it("keeps non-date inputs unchanged without date-specific override classes", () => {
		render(
			<>
				<Input data-testid="default-input" />
				<Input type="text" data-testid="text-input" />
				<Input type="number" data-testid="number-input" />
				<Input type="file" data-testid="file-input" />
			</>,
		);

		for (const testId of [
			"default-input",
			"text-input",
			"number-input",
			"file-input",
		]) {
			const tokens = classTokens(screen.getByTestId(testId));
			expect(tokens).toContain("flex");
			expect(tokens).not.toContain("block");
			expect(tokens).not.toContain(
				"[&::-webkit-date-and-time-value]:text-left",
			);
			expect(tokens).not.toContain(
				"[&::-webkit-calendar-picker-indicator]:cursor-pointer",
			);
		}
	});
});

describe("base Input native date layout", () => {
	it("replaces flex with block and applies webkit date alignment classes for type='date'", () => {
		render(
			<BaseInput type="date" data-testid="base-date-input" className="w-52" />,
		);

		const input = screen.getByTestId("base-date-input") as HTMLInputElement;
		const tokens = classTokens(input);

		expect(input.type).toBe("date");
		expect(input.getAttribute("data-slot")).toBe("input");
		expect(tokens).toContain("block");
		expect(tokens).not.toContain("flex");
		expect(tokens).toContain("[&::-webkit-date-and-time-value]:text-left");
		expect(tokens).toContain(
			"[&::-webkit-calendar-picker-indicator]:cursor-pointer",
		);
		expect(tokens).toContain("w-52");
		expect(tokens).not.toContain("w-full");
	});

	it("keeps non-date base inputs unchanged without date-specific override classes", () => {
		render(
			<>
				<BaseInput data-testid="base-default-input" />
				<BaseInput type="text" data-testid="base-text-input" />
			</>,
		);

		for (const testId of ["base-default-input", "base-text-input"]) {
			const tokens = classTokens(screen.getByTestId(testId));
			expect(tokens).toContain("flex");
			expect(tokens).not.toContain("block");
			expect(tokens).not.toContain(
				"[&::-webkit-date-and-time-value]:text-left",
			);
			expect(tokens).not.toContain(
				"[&::-webkit-calendar-picker-indicator]:cursor-pointer",
			);
		}
	});
});
