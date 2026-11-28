// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatCard } from "./stat-card";

afterEach(cleanup);

describe("StatCard", () => {
	it("uses light card surface, text-destructive value, and readable muted sub when hot is true", () => {
		render(<StatCard label="Còn lại" value="1.000đ" sub="Hạn 01/12" hot />);

		const label = screen.getByText("Còn lại");
		const card = label.parentElement;
		expect(card?.className).toContain("bg-card");
		expect(card?.className).toContain("border");
		expect(card?.className).not.toContain("bg-primary");

		const valueEl = screen.getByText("1.000đ");
		expect(valueEl.className).toContain("text-destructive");
		expect(valueEl.className).toContain("tabular-nums");
		expect(valueEl.className).not.toContain("text-primary");

		const subEl = screen.getByText("Hạn 01/12");
		expect(subEl.className).toContain("text-muted-foreground");
		expect(subEl.className).not.toContain("text-primary-foreground");
	});

	it("uses text-foreground when hot is false", () => {
		render(<StatCard label="Đã đóng" value="0đ" />);
		const valueEl = screen.getByText("0đ");
		expect(valueEl.className).toContain("text-foreground");
		expect(valueEl.className).not.toContain("text-destructive");
	});
});
