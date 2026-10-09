// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Avatar } from "./avatar";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const JPEG = "data:image/jpeg;base64,/9j/4AAQ";

afterEach(cleanup);

function img(container: HTMLElement): HTMLImageElement | null {
	return container.querySelector("img");
}

describe("Avatar", () => {
	it("renders the image for a safe src", () => {
		const { container } = render(<Avatar text="LA" src={PNG} />);
		expect(img(container)?.getAttribute("src")).toBe(PNG);
		expect(screen.queryByText("LA")).toBeNull();
	});

	it.each([
		["javascript:alert(1)"],
		["http://example.com/a.png"],
		["data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="],
		[""],
	])("falls back to initials for an unsafe src %j", (src) => {
		const { container } = render(<Avatar text="LA" src={src} />);
		expect(img(container)).toBeNull();
		expect(screen.getByText("LA")).toBeTruthy();
	});

	it("falls back to initials when the image fails to load", () => {
		const { container } = render(<Avatar text="LA" src={PNG} />);
		fireEvent.error(img(container) as HTMLImageElement);
		expect(img(container)).toBeNull();
		expect(screen.getByText("LA")).toBeTruthy();
	});

	it("retries the image when the src changes after a load failure", () => {
		const { container, rerender } = render(<Avatar text="LA" src={PNG} />);
		fireEvent.error(img(container) as HTMLImageElement);
		rerender(<Avatar text="LA" src={JPEG} />);
		expect(img(container)?.getAttribute("src")).toBe(JPEG);
	});

	it("passes data attributes through to the <img> for e2e hooks", () => {
		const { container } = render(
			<Avatar
				text="LA"
				src={PNG}
				imgProps={{ "data-testid": "sidebar-avatar" }}
			/>,
		);
		expect(screen.getByTestId("sidebar-avatar")).toBe(img(container));
	});
});
